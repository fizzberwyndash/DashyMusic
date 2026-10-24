import AVFoundation
import Foundation
import MediaPlayer
import UIKit

/// A pair of native AVPlayers owns transport and gain scheduling. No JavaScript
/// timer is involved in queue advancement, fades, sleep, or lock-screen commands.
/// All state below is confined to the main dispatch queue.
final class DashyAudioEngine {
  private final class Deck {
    let index: Int
    let track: DashyAudioTrack
    let item: AVPlayerItem
    let player: AVPlayer
    var statusObservation: NSKeyValueObservation?
    var playerObservation: NSKeyValueObservation?
    var endObservation: NSObjectProtocol?
    var failedEndObservation: NSObjectProtocol?
    var readinessDeadline: DispatchWorkItem?
    var waitingSince: TimeInterval?
    var failed = false

    init(index: Int, track: DashyAudioTrack) {
      self.index = index
      self.track = track
      self.item = AVPlayerItem(url: track.url)
      self.item.preferredForwardBufferDuration = 15
      self.player = AVPlayer(playerItem: item)
      self.player.automaticallyWaitsToMinimizeStalling = true
      self.player.actionAtItemEnd = .pause
      self.player.volume = 0
    }

    var position: Double {
      let seconds = CMTimeGetSeconds(player.currentTime())
      return seconds.isFinite ? max(0, seconds) : 0
    }

    var duration: Double {
      let seconds = CMTimeGetSeconds(item.duration)
      if seconds.isFinite && seconds > 0 { return seconds }
      return track.duration
    }

    var ready: Bool { item.status == .readyToPlay && !failed }

    func release() {
      readinessDeadline?.cancel()
      readinessDeadline = nil
      player.pause()
      statusObservation?.invalidate()
      playerObservation?.invalidate()
      statusObservation = nil
      playerObservation = nil
      if let observer = endObservation { NotificationCenter.default.removeObserver(observer) }
      if let observer = failedEndObservation { NotificationCenter.default.removeObserver(observer) }
      endObservation = nil
      failedEndObservation = nil
      player.replaceCurrentItem(with: nil)
    }
  }

  private struct Transition {
    let from: Deck
    let to: Deck
    let duration: Double
    let initialGain: Float
    var startIncomingPosition: Double? = nil
    var progress: Double = 0
  }

  private struct GainEnvelope {
    let began: TimeInterval
    let duration: Double
  }

  private let emitState: ([String: Any]) -> Void
  private var tracks: [DashyAudioTrack] = []
  private var settings = DashyAudioSettings()
  private var active: Deck?
  private var prepared: Deck?
  private var transition: Transition?
  private var wantsPlayback = false
  private var pendingSeek: Double?
  private var seekGeneration: UInt64 = 0
  private var lastError: String?
  private var nativeTimer: DispatchSourceTimer?
  private var lastEventTime: TimeInterval = 0
  private var lastNowPlayingTime: TimeInterval = 0
  private var resumeEnvelope: GainEnvelope?
  private var sleepEnvelope: GainEnvelope?
  private var interruptionWasPlaying = false
  private var initialized = false
  private var destroyed = false
  private var notificationTokens: [NSObjectProtocol] = []
  private var remoteTargets: [(MPRemoteCommand, Any)] = []
  private var artworkTask: URLSessionDataTask?
  private var nowPlayingArtwork: MPMediaItemArtwork?
  private var audioSessionActive = false

  init(emit: @escaping ([String: Any]) -> Void) {
    self.emitState = emit
  }

  func setQueue(_ records: [DashyAudioItemRecord], index: Int, settings record: DashyAudioSettingsRecord) throws {
    guard !records.isEmpty, records.count <= 1000, records.indices.contains(index) else {
      throw DashyAudioError("Choose a track from a queue containing 1 to 1,000 songs.")
    }
    // Validate before replacing a working queue.
    let newTracks = try records.map(DashyAudioTrack.init)
    ensureInitialized()
    stopTimer()
    clearDecks()
    deactivateAudioSession()
    tracks = newTracks
    settings = DashyAudioSettings(record)
    lastError = nil
    pendingSeek = nil
    sleepEnvelope = nil
    wantsPlayback = false
    active = makeDeck(index)
    prepareFollowingTrack()
    updateArtwork()
    publish(force: true)
  }

  func play() throws {
    guard let current = active else {
      throw DashyAudioError("Choose a song before starting playback.")
    }
    guard !current.failed else {
      throw DashyAudioError("This track could not load. Choose it again or try another track.")
    }
    ensureInitialized()
    do { try activateAudioSession() }
    catch {
      failTransport("The audio session could not start. Check your output device and try again.")
      throw error
    }
    if let deadline = settings.sleepAt, deadline <= Date().timeIntervalSince1970 * 1000 {
      settings.sleepAt = nil
    }
    sleepEnvelope = nil
    wantsPlayback = true
    current.waitingSince = nil
    transition?.to.waitingSince = nil
    lastError = nil
    resumeEnvelope = current.position > settings.fadeInSeconds + 0.05
      ? GainEnvelope(began: ProcessInfo.processInfo.systemUptime, duration: max(0.05, settings.fadeInSeconds)) : nil
    // Restart an ended item when the user explicitly presses Play.
    if transition == nil, current.duration > 0, current.position >= current.duration - 0.05 {
      resumeEnvelope = nil
      seek(0)
    }
    current.player.play()
    transition?.to.player.play()
    startTimer()
    publish(force: true)
  }

  func pause() {
    interruptionWasPlaying = false
    wantsPlayback = false
    active?.player.pause()
    active?.waitingSince = nil
    transition?.to.player.pause()
    transition?.to.waitingSince = nil
    resumeEnvelope = nil
    stopTimer()
    publish(force: true)
    deactivateAudioSession()
  }

  func seek(_ seconds: Double) {
    guard seconds.isFinite, let current = active else { return }
    cancelTransition()
    let target = current.duration > 0 ? min(current.duration, max(0, seconds)) : min(604800, max(0, seconds))
    seekGeneration &+= 1
    let generation = seekGeneration
    pendingSeek = target
    current.waitingSince = nil
    current.player.seek(to: CMTime(seconds: target, preferredTimescale: 600), toleranceBefore: .zero, toleranceAfter: .zero) { [weak self, weak current] finished in
      DispatchQueue.main.async {
        guard let self = self, let current = current,
              self.active === current, self.seekGeneration == generation else { return }
        self.pendingSeek = nil
        if !finished { self.lastError = "The playback position could not be changed. Please try again." }
        if finished && self.wantsPlayback { current.player.play() }
        self.applyNormalGain(current, global: self.transportGain(ProcessInfo.processInfo.systemUptime))
        self.publish(force: true)
      }
    }
    publish(force: true)
  }

  func next() throws {
    guard let current = active else { return }
    // If two decks overlap, Next commits to the incoming track without replaying it.
    if transition != nil {
      finishTransition()
      if wantsPlayback { active?.player.play() }
      publish(force: true)
      return
    }
    guard let target = followingIndex(after: current.index, manual: true) else {
      finishQueue()
      return
    }
    try switchTo(target, playing: wantsPlayback)
  }

  func previous() throws {
    guard let current = active else { return }
    if current.position > 3 {
      seek(0)
      return
    }
    let target = current.index > 0 ? current.index - 1 : (settings.repeatMode == "all" ? max(0, tracks.count - 1) : 0)
    try switchTo(target, playing: wantsPlayback)
  }

  func setSettings(_ record: DashyAudioSettingsRecord) {
    let oldRepeat = settings.repeatMode
    settings = DashyAudioSettings(record)
    sleepEnvelope = nil
    if settings.crossfadeSeconds == 0 || oldRepeat != settings.repeatMode { cancelTransition() }
    if oldRepeat != settings.repeatMode && transition == nil {
      prepared?.release()
      prepared = nil
      prepareFollowingTrack()
    }
    publish(force: true)
  }

  func stop() {
    wantsPlayback = false
    stopTimer()
    clearDecks()
    tracks = []
    pendingSeek = nil
    lastError = nil
    resumeEnvelope = nil
    sleepEnvelope = nil
    artworkTask?.cancel()
    artworkTask = nil
    nowPlayingArtwork = nil
    MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
    deactivateAudioSession()
    publish(force: true)
  }

  func snapshot() -> [String: Any] {
    let current = active
    let actuallyPlaying = wantsPlayback && (current?.player.timeControlStatus == .playing || transition?.to.player.timeControlStatus == .playing)
    let waiting = wantsPlayback && !actuallyPlaying && current != nil && current?.failed != true
    var overlap: Any = NSNull()
    if let transition = transition {
      overlap = ["fromId": transition.from.track.id, "toId": transition.to.track.id, "progress": transition.progress] as [String: Any]
    }
    return [
      "activeId": current?.track.id as Any? ?? NSNull(),
      "playing": actuallyPlaying,
      "buffering": waiting,
      "position": pendingSeek ?? current?.position ?? 0,
      "duration": current?.duration ?? 0,
      "queueIds": tracks.map(\.id),
      "error": lastError as Any? ?? NSNull(),
      "transition": overlap
    ]
  }

  func destroy() {
    guard !destroyed else { return }
    destroyed = true
    stop()
    for token in notificationTokens { NotificationCenter.default.removeObserver(token) }
    notificationTokens = []
    for (command, target) in remoteTargets { command.removeTarget(target) }
    remoteTargets = []
    initialized = false
  }

  private func ensureInitialized() {
    guard !initialized else { return }
    initialized = true
    observeAudioSession()
    configureRemoteCommands()
  }

  private func activateAudioSession() throws {
    do {
      let session = AVAudioSession.sharedInstance()
      // Playback already supports AirPlay and A2DP. Explicit allowAirPlay is
      // reserved for playAndRecord and can reject a playback session.
      try session.setCategory(.playback, mode: .default, options: [])
      try session.setActive(true)
      audioSessionActive = true
    } catch {
      throw DashyAudioError("The audio session could not start. Check your output device and try again.")
    }
  }

  private func deactivateAudioSession() {
    guard audioSessionActive else { return }
    try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    audioSessionActive = false
  }

  private func makeDeck(_ index: Int) -> Deck {
    let deck = Deck(index: index, track: tracks[index])
    deck.statusObservation = deck.item.observe(\.status, options: [.initial, .new]) { [weak self, weak deck] _, _ in
      DispatchQueue.main.async {
        guard let self = self, let deck = deck else { return }
        self.deckStatusChanged(deck)
      }
    }
    deck.playerObservation = deck.player.observe(\.timeControlStatus, options: [.new]) { [weak self, weak deck] _, _ in
      DispatchQueue.main.async {
        guard let self = self, let deck = deck, self.active === deck || self.prepared === deck || self.transition?.to === deck else { return }
        self.publish(force: true)
      }
    }
    deck.endObservation = NotificationCenter.default.addObserver(forName: .AVPlayerItemDidPlayToEndTime, object: deck.item, queue: .main) { [weak self, weak deck] _ in
      guard let self = self, let deck = deck else { return }
      self.trackEnded(deck)
    }
    deck.failedEndObservation = NotificationCenter.default.addObserver(forName: .AVPlayerItemFailedToPlayToEndTime, object: deck.item, queue: .main) { [weak self, weak deck] _ in
      guard let self = self, let deck = deck else { return }
      self.deckFailed(deck)
    }
    let deadline = DispatchWorkItem { [weak self, weak deck] in
      guard let self = self, let deck = deck, !deck.ready, !deck.failed else { return }
      self.deckFailed(deck)
    }
    deck.readinessDeadline = deadline
    DispatchQueue.main.asyncAfter(deadline: .now() + 30, execute: deadline)
    return deck
  }

  private func deckStatusChanged(_ deck: Deck) {
    guard active === deck || prepared === deck || transition?.to === deck else { return }
    if deck.item.status == .failed {
      deckFailed(deck)
      return
    }
    if deck.ready && active === deck {
      applyNormalGain(deck, global: transportGain(ProcessInfo.processInfo.systemUptime))
      if wantsPlayback { deck.player.play() }
    }
    if deck.ready {
      deck.readinessDeadline?.cancel()
      deck.readinessDeadline = nil
    }
    publish(force: true)
  }

  private func deckFailed(_ deck: Deck) {
    guard active === deck || prepared === deck || transition?.to === deck else { return }
    guard !deck.failed else { return }
    deck.failed = true
    deck.readinessDeadline?.cancel()
    deck.readinessDeadline = nil
    deck.player.pause()
    if active === deck {
      wantsPlayback = false
      transition?.to.player.pause()
      stopTimer()
      lastError = "This track could not play. Check your connection or choose another song."
      deactivateAudioSession()
    } else {
      if transition?.to === deck { cancelTransition() }
      lastError = "The next track could not load. Your current song will continue."
    }
    publish(force: true)
  }

  private func followingIndex(after index: Int, manual: Bool = false) -> Int? {
    if !manual && settings.repeatMode == "one" { return nil }
    if index + 1 < tracks.count { return index + 1 }
    if settings.repeatMode == "all", !tracks.isEmpty { return 0 }
    return nil
  }

  private func prepareFollowingTrack() {
    guard transition == nil, let current = active,
          let target = followingIndex(after: current.index) else { return }
    if prepared?.index == target { return }
    // Resolve signed remote streams close to use, rather than spending mobile
    // data and holding an expiring redirect throughout a long current track.
    if !tracks[target].url.isFileURL, current.duration > 0,
       current.duration - current.position > max(30, settings.crossfadeSeconds + 15) { return }
    prepared?.release()
    prepared = makeDeck(target)
  }

  private func switchTo(_ target: Int, playing: Bool) throws {
    guard tracks.indices.contains(target) else { return }
    cancelTransition()
    let candidate: Deck?
    if let next = prepared, next.index == target, !next.failed, next.item.status != .failed {
      candidate = next
    } else {
      candidate = nil
    }
    if candidate != nil { prepared = nil }
    clearDecks()
    active = candidate ?? makeDeck(target)
    pendingSeek = nil
    transition = nil
    lastError = nil
    resumeEnvelope = nil
    sleepEnvelope = nil
    wantsPlayback = false
    if playing {
      do { try activateAudioSession() }
      catch {
        lastError = "The audio session could not start. Check your output device and try again."
        stopTimer()
        publish(force: true)
        throw error
      }
      wantsPlayback = true
      active?.player.play()
      startTimer()
    } else {
      stopTimer()
      active?.player.pause()
    }
    prepareFollowingTrack()
    updateArtwork()
    publish(force: true)
  }

  private func clearDecks() {
    seekGeneration &+= 1
    pendingSeek = nil
    // The incoming deck is also `prepared` until a transition completes.
    active?.release()
    prepared?.release()
    if let incoming = transition?.to, incoming !== prepared { incoming.release() }
    active = nil
    prepared = nil
    transition = nil
  }

  private func startTimer() {
    guard nativeTimer == nil else { return }
    let timer = DispatchSource.makeTimerSource(queue: .main)
    timer.schedule(deadline: .now(), repeating: .milliseconds(40), leeway: .milliseconds(5))
    timer.setEventHandler { [weak self] in self?.tick() }
    nativeTimer = timer
    timer.resume()
  }

  private func stopTimer() {
    nativeTimer?.setEventHandler {}
    nativeTimer?.cancel()
    nativeTimer = nil
  }

  private func tick() {
    guard wantsPlayback, let current = active else { return }
    let now = ProcessInfo.processInfo.systemUptime
    if transition == nil && prepared == nil { prepareFollowingTrack() }
    // A stream that loaded its headers can still stall later. Bound that wait
    // separately from the initial item-readiness deadline.
    for deck in [current, transition?.to].compactMap({ $0 }) {
      if deck.player.timeControlStatus == .waitingToPlayAtSpecifiedRate {
        if deck.waitingSince == nil { deck.waitingSince = now }
        if let began = deck.waitingSince, now - began >= 30 {
          deckFailed(deck)
          return
        }
      } else {
        deck.waitingSince = nil
      }
    }
    if let deadline = settings.sleepAt, Date().timeIntervalSince1970 * 1000 >= deadline, sleepEnvelope == nil {
      settings.sleepAt = nil
      sleepEnvelope = GainEnvelope(began: now, duration: max(0.2, settings.fadeOutSeconds))
    }
    if let envelope = sleepEnvelope, now - envelope.began >= envelope.duration {
      current.player.volume = 0
      transition?.to.player.volume = 0
      sleepEnvelope = nil
      pause()
      return
    }
    let globalGain = transportGain(now)
    if transition == nil, pendingSeek == nil, current.duration > 0,
       let incoming = prepared, incoming.ready,
       current.player.timeControlStatus == .playing, settings.crossfadeSeconds > 0 {
      let length = min(settings.crossfadeSeconds, current.duration / 2, incoming.duration > 0 ? incoming.duration / 2 : settings.crossfadeSeconds)
      let remaining = current.duration - current.position
      if length > 0.05, remaining > 0, remaining <= length {
        transition = Transition(from: current, to: incoming, duration: min(length, remaining), initialGain: normalTrackGain(current))
        incoming.player.volume = 0
        incoming.player.play()
      }
    }
    if var overlap = transition {
      // Do not fade down the outgoing deck until the new stream is actually playing.
      if overlap.startIncomingPosition == nil, overlap.to.player.timeControlStatus == .playing {
        overlap.startIncomingPosition = overlap.to.position
      }
      if let beginning = overlap.startIncomingPosition {
        // If an incoming stream stalls, hold the outgoing gain until native playback resumes.
        if overlap.to.player.timeControlStatus == .playing {
          overlap.progress = min(1, max(0, (overlap.to.position - beginning) / overlap.duration))
        }
        let p = overlap.progress
        let outgoing = settings.curve == "linear" ? 1 - p : cos(p * .pi / 2)
        let incoming = settings.curve == "linear" ? p : sin(p * .pi / 2)
        overlap.from.player.volume = Float(outgoing) * overlap.initialGain * globalGain
        overlap.to.player.volume = Float(incoming) * globalGain
      } else {
        overlap.from.player.volume = overlap.initialGain * globalGain
        overlap.to.player.volume = 0
      }
      transition = overlap
      if overlap.progress >= 1 { finishTransition() }
    } else {
      applyNormalGain(current, global: globalGain)
    }
    publish(force: false)
  }

  private func transportGain(_ now: TimeInterval) -> Float {
    var gain = 1.0
    if let envelope = resumeEnvelope {
      let progress = min(1, max(0, (now - envelope.began) / envelope.duration))
      gain *= sin(progress * .pi / 2)
      if progress >= 1 { resumeEnvelope = nil }
    }
    if let envelope = sleepEnvelope {
      let progress = min(1, max(0, (now - envelope.began) / envelope.duration))
      gain *= cos(progress * .pi / 2)
    }
    return Float(min(1, max(0, gain)))
  }

  private func applyNormalGain(_ deck: Deck, global: Float = 1) {
    guard transition == nil else { return }
    deck.player.volume = normalTrackGain(deck) * global
  }

  private func normalTrackGain(_ deck: Deck) -> Float {
    let position = pendingSeek ?? deck.position
    var gain = 1.0
    if settings.fadeInSeconds > 0, position < settings.fadeInSeconds {
      gain *= sin(max(0, position / settings.fadeInSeconds) * .pi / 2)
    }
    if settings.fadeOutSeconds > 0, deck.duration > 0 {
      let remaining = max(0, deck.duration - position)
      if remaining < settings.fadeOutSeconds {
        gain *= sin(remaining / settings.fadeOutSeconds * .pi / 2)
      }
    }
    return Float(min(1, max(0, gain)))
  }

  private func cancelTransition() {
    guard let overlap = transition else { return }
    overlap.to.player.pause()
    overlap.to.player.volume = 0
    overlap.to.player.seek(to: .zero)
    transition = nil
    applyNormalGain(overlap.from, global: transportGain(ProcessInfo.processInfo.systemUptime))
  }

  private func finishTransition() {
    guard let overlap = transition else { return }
    transition = nil
    active = overlap.to
    prepared = nil
    overlap.from.release()
    active?.player.volume = transportGain(ProcessInfo.processInfo.systemUptime)
    if wantsPlayback { active?.player.play() }
    prepareFollowingTrack()
    updateArtwork()
    publish(force: true)
  }

  private func trackEnded(_ deck: Deck) {
    guard active === deck else { return }
    if let overlap = transition, !overlap.to.failed {
      finishTransition()
      return
    }
    if settings.repeatMode == "one" {
      seek(0)
      if wantsPlayback { deck.player.play() }
      return
    }
    if let target = followingIndex(after: deck.index) {
      if prepared?.failed == true {
        wantsPlayback = false
        stopTimer()
        lastError = "The next track could not load. Choose another song to continue."
        publish(force: true)
        deactivateAudioSession()
        return
      }
      do { try switchTo(target, playing: wantsPlayback) }
      catch { failTransport("The next track could not start. Please try again.") }
    } else {
      finishQueue()
    }
  }

  private func finishQueue() {
    wantsPlayback = false
    active?.player.pause()
    transition?.to.player.pause()
    stopTimer()
    publish(force: true)
    deactivateAudioSession()
  }

  private func failTransport(_ message: String) {
    lastError = message
    pause()
  }

  private func publish(force: Bool) {
    let now = ProcessInfo.processInfo.systemUptime
    if force || now - lastEventTime >= 0.25 {
      lastEventTime = now
      emitState(snapshot())
    }
    if force || now - lastNowPlayingTime >= 0.5 {
      lastNowPlayingTime = now
      updateNowPlaying()
    }
  }

  private func observeAudioSession() {
    let center = NotificationCenter.default
    notificationTokens.append(center.addObserver(forName: AVAudioSession.interruptionNotification, object: nil, queue: .main) { [weak self] note in
      guard let self = self,
            let value = (note.userInfo?[AVAudioSessionInterruptionTypeKey] as? NSNumber)?.uintValue,
            let type = AVAudioSession.InterruptionType(rawValue: value) else { return }
      if type == .began {
        let wasPlaying = self.wantsPlayback
        self.pause()
        self.interruptionWasPlaying = wasPlaying
      } else {
        let options = AVAudioSession.InterruptionOptions(rawValue: (note.userInfo?[AVAudioSessionInterruptionOptionKey] as? NSNumber)?.uintValue ?? 0)
        var resume = self.interruptionWasPlaying && options.contains(.shouldResume)
        if let deadline = self.settings.sleepAt, Date().timeIntervalSince1970 * 1000 >= deadline {
          self.settings.sleepAt = nil
          resume = false
        }
        self.interruptionWasPlaying = false
        if resume {
          do { try self.play() }
          catch { self.failTransport("Playback could not resume after the interruption.") }
        }
      }
    })
    notificationTokens.append(center.addObserver(forName: AVAudioSession.routeChangeNotification, object: nil, queue: .main) { [weak self] note in
      guard let self = self,
            let value = (note.userInfo?[AVAudioSessionRouteChangeReasonKey] as? NSNumber)?.uintValue,
            AVAudioSession.RouteChangeReason(rawValue: value) == .oldDeviceUnavailable else { return }
      // Removing headphones should never unexpectedly send music to the loudspeaker.
      self.interruptionWasPlaying = false
      self.pause()
    })
    notificationTokens.append(center.addObserver(forName: AVAudioSession.mediaServicesWereResetNotification, object: nil, queue: .main) { [weak self] _ in
      self?.failTransport("The system audio service restarted. Select your song again to resume.")
    })
  }

  private func configureRemoteCommands() {
    let center = MPRemoteCommandCenter.shared()
    func register(_ command: MPRemoteCommand, action: @escaping () -> Void) {
      let target = command.addTarget { _ in
        DispatchQueue.main.async { action() }
        return .success
      }
      remoteTargets.append((command, target))
    }
    register(center.playCommand) { [weak self] in
      do { try self?.play() }
      catch { self?.failTransport("Playback could not start. Open DashyMusic and try again.") }
    }
    register(center.pauseCommand) { [weak self] in self?.pause() }
    register(center.togglePlayPauseCommand) { [weak self] in
      guard let self = self else { return }
      if self.wantsPlayback { self.pause() }
      else {
        do { try self.play() }
        catch { self.failTransport("Playback could not start. Open DashyMusic and try again.") }
      }
    }
    register(center.nextTrackCommand) { [weak self] in
      do { try self?.next() }
      catch { self?.failTransport("The next track could not start.") }
    }
    register(center.previousTrackCommand) { [weak self] in
      do { try self?.previous() }
      catch { self?.failTransport("The previous track could not start.") }
    }
    let positionTarget = center.changePlaybackPositionCommand.addTarget { [weak self] event in
      guard let event = event as? MPChangePlaybackPositionCommandEvent else { return .commandFailed }
      let seconds = event.positionTime
      guard seconds.isFinite else { return .commandFailed }
      DispatchQueue.main.async { self?.seek(seconds) }
      return .success
    }
    remoteTargets.append((center.changePlaybackPositionCommand, positionTarget))
  }

  private func updateNowPlaying() {
    guard let current = active else {
      MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
      for (command, _) in remoteTargets { command.isEnabled = false }
      return
    }
    let actuallyPlaying = wantsPlayback && (current.player.timeControlStatus == .playing || transition?.to.player.timeControlStatus == .playing)
    var info: [String: Any] = [
      MPMediaItemPropertyTitle: current.track.title,
      MPMediaItemPropertyArtist: current.track.artist,
      MPMediaItemPropertyPlaybackDuration: current.duration,
      MPNowPlayingInfoPropertyElapsedPlaybackTime: pendingSeek ?? current.position,
      MPNowPlayingInfoPropertyPlaybackRate: actuallyPlaying ? 1.0 : 0.0,
      MPNowPlayingInfoPropertyDefaultPlaybackRate: 1.0,
      MPNowPlayingInfoPropertyIsLiveStream: false
    ]
    if let artwork = nowPlayingArtwork { info[MPMediaItemPropertyArtwork] = artwork }
    MPNowPlayingInfoCenter.default().nowPlayingInfo = info
    let center = MPRemoteCommandCenter.shared()
    center.playCommand.isEnabled = !current.failed
    center.pauseCommand.isEnabled = wantsPlayback
    center.togglePlayPauseCommand.isEnabled = !current.failed
    center.nextTrackCommand.isEnabled = transition != nil || followingIndex(after: current.index, manual: true) != nil
    center.previousTrackCommand.isEnabled = true
    center.changePlaybackPositionCommand.isEnabled = current.duration > 0
  }

  private func updateArtwork() {
    artworkTask?.cancel()
    artworkTask = nil
    nowPlayingArtwork = nil
    updateNowPlaying()
    guard let current = active, let url = DashyAudioTrack.allowedURL(current.track.artwork) else { return }
    if url.isFileURL {
      if let image = UIImage(contentsOfFile: url.path) {
        nowPlayingArtwork = MPMediaItemArtwork(boundsSize: image.size) { _ in image }
        updateNowPlaying()
      }
      return
    }
    let configuration = URLSessionConfiguration.ephemeral
    configuration.timeoutIntervalForRequest = 15
    configuration.timeoutIntervalForResource = 20
    let session = URLSession(configuration: configuration)
    var request = URLRequest(url: url)
    request.setValue("image/*", forHTTPHeaderField: "Accept")
    artworkTask = session.dataTask(with: request) { [weak self, weak current] data, response, _ in
      defer { session.finishTasksAndInvalidate() }
      guard let data = data, data.count <= 5_000_000,
            let response = response as? HTTPURLResponse, (200..<300).contains(response.statusCode),
            let image = UIImage(data: data) else { return }
      DispatchQueue.main.async {
        guard let self = self, let current = current, self.active === current else { return }
        self.nowPlayingArtwork = MPMediaItemArtwork(boundsSize: image.size) { _ in image }
        self.updateNowPlaying()
      }
    }
    artworkTask?.resume()
  }
}
