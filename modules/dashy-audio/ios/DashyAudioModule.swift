import ExpoModulesCore
import Foundation

public final class DashyAudioModule: Module {
  private lazy var engine = DashyAudioEngine { [weak self] state in
    self?.sendEvent("onState", state)
  }

  public func definition() -> ModuleDefinition {
    Name("DashyAudio")
    Events("onState")
    View(DashyAudioRouteView.self) {}

    AsyncFunction("setQueue") { (items: [DashyAudioItemRecord], index: Int, settings: DashyAudioSettingsRecord) throws in
      try self.engine.setQueue(items, index: index, settings: settings)
    }.runOnQueue(.main)

    AsyncFunction("play") { () throws in
      try self.engine.play()
    }.runOnQueue(.main)

    AsyncFunction("pause") {
      self.engine.pause()
    }.runOnQueue(.main)

    AsyncFunction("seek") { (seconds: Double) in
      self.engine.seek(seconds)
    }.runOnQueue(.main)

    AsyncFunction("next") {
      try self.engine.next()
    }.runOnQueue(.main)

    AsyncFunction("previous") {
      try self.engine.previous()
    }.runOnQueue(.main)

    AsyncFunction("setSettings") { (settings: DashyAudioSettingsRecord) in
      self.engine.setSettings(settings)
    }.runOnQueue(.main)

    AsyncFunction("stop") {
      self.engine.stop()
    }.runOnQueue(.main)

    AsyncFunction("getState") { () -> [String: Any] in
      self.engine.snapshot()
    }.runOnQueue(.main)

    OnDestroy {
      let engine = self.engine
      DispatchQueue.main.async { engine.destroy() }
    }
  }
}
