import AVKit
import ExpoModulesCore
import UIKit

/// Uses the system output picker rather than displaying a simulated device list.
final class DashyAudioRouteView: ExpoView {
  private let picker = AVRoutePickerView(frame: .zero)

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    picker.tintColor = .white
    picker.activeTintColor = UIColor(red: 0.12, green: 0.85, blue: 0.95, alpha: 1)
    picker.prioritizesVideoDevices = false
    picker.accessibilityLabel = "Choose AirPlay audio output"
    addSubview(picker)
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    picker.frame = bounds
  }
}
