import ExpoModulesCore
import Foundation

struct DashyAudioItemRecord: Record {
  @Field var id: String = ""
  @Field var url: String = ""
  @Field var title: String = ""
  @Field var artist: String = ""
  @Field var artwork: String = ""
  @Field var duration: Double = 0
}

struct DashyAudioSettingsRecord: Record {
  @Field var crossfadeSeconds: Double = 6
  @Field var fadeInSeconds: Double = 0.8
  @Field var fadeOutSeconds: Double = 1.2
  @Field var curve: String = "equalPower"
  @Field var `repeat`: String = "off"
  @Field var sleepAt: Double?
}

struct DashyAudioTrack {
  let id: String
  let url: URL
  let title: String
  let artist: String
  let artwork: String
  let duration: Double

  init(_ record: DashyAudioItemRecord) throws {
    guard !record.id.isEmpty, record.id.count <= 512,
          let url = Self.allowedURL(record.url) else {
      throw DashyAudioError("Choose a local audio file or a valid HTTPS audio stream.")
    }
    self.id = record.id
    self.url = url
    self.title = String(record.title.prefix(2000))
    self.artist = String(record.artist.prefix(2000))
    self.artwork = record.artwork
    self.duration = record.duration.isFinite ? min(604800, max(0, record.duration)) : 0
  }

  static func allowedURL(_ raw: String) -> URL? {
    guard raw.count <= 8192, let url = URL(string: raw),
          let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
          components.user == nil, components.password == nil else { return nil }
    if url.isFileURL { return url }
    guard url.scheme?.lowercased() == "https", url.host?.isEmpty == false else { return nil }
    return url
  }
}

struct DashyAudioSettings {
  var crossfadeSeconds: Double = 6
  var fadeInSeconds: Double = 0.8
  var fadeOutSeconds: Double = 1.2
  var curve: String = "equalPower"
  var repeatMode: String = "off"
  var sleepAt: Double?

  init() {}

  init(_ record: DashyAudioSettingsRecord) {
    self.crossfadeSeconds = Self.clamp(record.crossfadeSeconds, 0, 12)
    self.fadeInSeconds = Self.clamp(record.fadeInSeconds, 0, 5)
    self.fadeOutSeconds = Self.clamp(record.fadeOutSeconds, 0, 5)
    self.curve = record.curve == "linear" ? "linear" : "equalPower"
    self.repeatMode = ["off", "all", "one"].contains(record.`repeat`) ? record.`repeat` : "off"
    if let deadline = record.sleepAt, deadline.isFinite,
       deadline > Date().timeIntervalSince1970 * 1000 {
      self.sleepAt = deadline
    }
  }

  static func clamp(_ value: Double, _ lower: Double, _ upper: Double) -> Double {
    return value.isFinite ? min(upper, max(lower, value)) : lower
  }
}

struct DashyAudioError: LocalizedError {
  let message: String
  init(_ message: String) { self.message = message }
  var errorDescription: String? { message }
}
