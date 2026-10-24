import React from "react";
import { Platform, ViewProps } from "react-native";
import { requireNativeViewManager } from "expo-modules-core";
import { RoundButton } from "../ui";

let NativeRoutePicker: React.ComponentType<ViewProps> | null = null;
export function RouteButton({
  native,
  onFallback,
}: {
  native: boolean;
  onFallback: () => void;
}) {
  if (native && Platform.OS === "ios") {
    if (!NativeRoutePicker)
      NativeRoutePicker = requireNativeViewManager<ViewProps>("DashyAudio");
    return (
      <NativeRoutePicker
        style={{ width: 44, height: 44 }}
        accessibilityLabel="Choose AirPlay output"
      />
    );
  }
  return (
    <RoundButton icon="tv-outline" label="Audio output" onPress={onFallback} />
  );
}
