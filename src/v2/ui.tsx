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
import { LinearGradient } from "expo-linear-gradient";
import { fonts, palette } from "./theme";

export type Glyph = React.ComponentProps<typeof Ionicons>["name"];
export function Icon({
  name,
  size = 22,
  color = palette.text,
}: {
  name: Glyph;
  size?: number;
  color?: string;
}) {
  return <Ionicons name={name} size={size} color={color} />;
}
export function Glass({
  children,
  style,
  strong = false,
}: PropsWithChildren<{ style?: StyleProp<ViewStyle>; strong?: boolean }>) {
  return (
    <View
      style={[
        u.glass,
        strong && { backgroundColor: "rgba(42,39,61,0.64)" },
        style,
      ]}
    >
      <BlurView
        tint="dark"
        intensity={strong ? 45 : 25}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <LinearGradient
        colors={["rgba(255,255,255,0.075)", "rgba(255,255,255,0.012)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      {children}
    </View>
  );
}
export function RoundButton({
  icon,
  label,
  onPress,
  size = 44,
  filled = false,
  active = false,
  disabled = false,
}: {
  icon: Glyph;
  label: string;
  onPress: () => void;
  size?: number;
  filled?: boolean;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        u.round,
        { width: size, height: size, borderRadius: size / 2 },
        filled && { backgroundColor: palette.text },
        active && { backgroundColor: "rgba(66,226,244,0.12)" },
        pressed && u.pressed,
        disabled && { opacity: 0.35 },
      ]}
    >
      <Icon
        name={icon}
        size={size >= 60 ? 28 : 21}
        color={filled ? palette.bg : active ? palette.cyan : palette.text}
      />
    </Pressable>
  );
}
export function Pill({
  children,
  onPress,
  active = false,
  icon,
}: PropsWithChildren<{ onPress: () => void; active?: boolean; icon?: Glyph }>) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      aria-pressed={active}
      onPress={onPress}
      style={({ pressed }) => [
        u.pill,
        active && { backgroundColor: palette.text },
        pressed && u.pressed,
      ]}
    >
      {icon && (
        <Icon
          name={icon}
          size={16}
          color={active ? palette.bg : palette.cyan}
        />
      )}
      <Text style={[u.pillText, active && { color: palette.bg }]}>
        {children}
      </Text>
    </Pressable>
  );
}
export function Button({
  children,
  onPress,
  icon,
  gradient = false,
  secondary = false,
  disabled = false,
}: PropsWithChildren<{
  onPress: () => void;
  icon?: Glyph;
  gradient?: boolean;
  secondary?: boolean;
  disabled?: boolean;
}>) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        u.button,
        secondary && { backgroundColor: "rgba(255,255,255,0.08)" },
        gradient && { backgroundColor: palette.purple },
        pressed && u.pressed,
        disabled && { opacity: 0.4 },
      ]}
    >
      {gradient && (
        <LinearGradient
          colors={["#20C4DF", "#8C58F2", "#CE42E7"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
      )}
      {icon && (
        <Icon
          name={icon}
          size={18}
          color={gradient || secondary ? palette.text : palette.bg}
        />
      )}
      <Text
        style={[
          u.buttonText,
          (gradient || secondary) && { color: palette.text },
        ]}
      >
        {children}
      </Text>
    </Pressable>
  );
}
export function Badge({
  children,
  color = palette.cyan,
}: PropsWithChildren<{ color?: string }>) {
  return (
    <View style={u.badge}>
      <View
        style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: color }}
      />
      <Text style={[u.badgeText, { color }]}>{children}</Text>
    </View>
  );
}
export function Equalizer({
  color = palette.cyan,
  small = false,
}: {
  color?: string;
  small?: boolean;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 3,
        height: small ? 18 : 26,
      }}
    >
      {[11, 22, 16, 25, 12].map((h, i) => (
        <View
          key={i}
          style={{
            width: small ? 2 : 3,
            height: small ? h * 0.65 : h,
            backgroundColor: color,
            borderRadius: 3,
          }}
        />
      ))}
    </View>
  );
}
export const u = StyleSheet.create({
  glass: {
    borderRadius: 28,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: palette.panel,
  },
  row: { flexDirection: "row", alignItems: "center" },
  title: {
    fontFamily: fonts.extra,
    color: palette.text,
    fontSize: 30,
    letterSpacing: -1.2,
    lineHeight: 38,
  },
  heading: {
    fontFamily: fonts.bold,
    color: palette.text,
    fontSize: 21,
    letterSpacing: -0.7,
    lineHeight: 29,
  },
  body: {
    fontFamily: fonts.regular,
    color: palette.muted,
    fontSize: 13,
    lineHeight: 21,
  },
  eyebrow: {
    fontFamily: fonts.mono,
    color: palette.cyan,
    fontSize: 10,
    lineHeight: 16,
    letterSpacing: 1.2,
  },
  mono: {
    fontFamily: fonts.mono,
    color: palette.muted,
    fontSize: 10,
    lineHeight: 17,
  },
  pressed: { opacity: 0.75, transform: [{ scale: 0.98 }] },
  round: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.075)",
  },
  pill: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.06)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  pillText: { fontFamily: fonts.medium, color: palette.text, fontSize: 12 },
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 49,
    paddingHorizontal: 22,
    borderRadius: 28,
    backgroundColor: palette.text,
    overflow: "hidden",
  },
  buttonText: { fontFamily: fonts.bold, color: palette.bg, fontSize: 13 },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 16,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignSelf: "flex-start",
  },
  badgeText: { fontFamily: fonts.mono, fontSize: 9, lineHeight: 14 },
});
