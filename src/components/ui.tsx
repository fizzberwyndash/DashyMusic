import React, { PropsWithChildren } from "react";
import {
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { BlurView } from "expo-blur";
import { colors } from "../theme";

export type IconName = React.ComponentProps<typeof Ionicons>["name"];
export const Icon = ({
  name,
  size = 22,
  color = colors.text,
}: {
  name: IconName;
  size?: number;
  color?: string;
}) => <Ionicons name={name} size={size} color={color} />;

export function Glass({
  children,
  style,
  intensity = 28,
}: PropsWithChildren<{ style?: StyleProp<ViewStyle>; intensity?: number }>) {
  return (
    <BlurView tint="dark" intensity={intensity} style={[styles.glass, style]}>
      {children}
    </BlurView>
  );
}

export function IconButton({
  name,
  label,
  onPress,
  active = false,
  size = 22,
  disabled = false,
}: {
  name: IconName;
  label: string;
  onPress: () => void;
  active?: boolean;
  size?: number;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.iconButton,
        active && styles.active,
        pressed && styles.pressed,
        disabled && { opacity: 0.35 },
      ]}
    >
      <Icon
        name={name}
        size={size}
        color={active ? colors.lime : colors.text}
      />
    </Pressable>
  );
}

export function ActionButton({
  children,
  onPress,
  icon,
  secondary = false,
  disabled = false,
}: PropsWithChildren<{
  onPress: () => void;
  icon?: IconName;
  secondary?: boolean;
  disabled?: boolean;
}>) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        secondary && styles.secondary,
        pressed && styles.pressed,
        disabled && { opacity: 0.4 },
      ]}
    >
      {icon && (
        <Icon
          name={icon}
          size={17}
          color={secondary ? colors.text : colors.background}
        />
      )}
      <Text style={[styles.buttonText, secondary && { color: colors.text }]}>
        {children}
      </Text>
    </Pressable>
  );
}

export function WaveMark({ small = false }: { small?: boolean }) {
  return (
    <View
      style={[
        styles.mark,
        small && { width: 30, height: 30, borderRadius: 10 },
      ]}
    >
      {[10, 20, 14, 24, 10].map((height, i) => (
        <View
          key={i}
          style={{
            width: small ? 2 : 3,
            height: small ? height * 0.7 : height,
            borderRadius: 4,
            backgroundColor: colors.background,
          }}
        />
      ))}
    </View>
  );
}

export const common = StyleSheet.create({
  eyebrow: {
    color: colors.lime,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 2.4,
  },
  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "600",
    letterSpacing: -0.8,
  },
  muted: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  row: { flexDirection: "row", alignItems: "center" },
});

const styles = StyleSheet.create({
  glass: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 24,
    overflow: "hidden",
    backgroundColor: "rgba(23,33,27,0.48)",
  },
  iconButton: {
    height: 44,
    width: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 22,
  },
  active: { backgroundColor: "rgba(212,247,139,0.10)" },
  pressed: { opacity: 0.7, transform: [{ scale: 0.97 }] },
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.lime,
    paddingHorizontal: 20,
    minHeight: 46,
    borderRadius: 24,
  },
  secondary: {
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: colors.border,
  },
  buttonText: { color: colors.background, fontSize: 13, fontWeight: "700" },
  mark: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: colors.lime,
  },
});
