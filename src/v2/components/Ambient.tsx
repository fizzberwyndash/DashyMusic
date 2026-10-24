import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Artwork } from "./Artwork";
import { palette } from "../theme";

export function Ambient({ artwork }: { artwork?: string }) {
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    opacity.setValue(0);
    Animated.timing(opacity, {
      toValue: 0.42,
      duration: 900,
      useNativeDriver: true,
    }).start();
  }, [artwork, opacity]);
  return (
    <View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFill,
        { backgroundColor: palette.bg, overflow: "hidden" },
      ]}
    >
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { opacity, transform: [{ scale: 1.3 }] },
        ]}
      >
        <Artwork
          uri={artwork}
          style={{ width: "100%", height: "100%" }}
          blurRadius={85}
        />
      </Animated.View>
      <LinearGradient
        colors={["rgba(12,8,24,0.12)", "rgba(9,9,15,0.75)", palette.bg]}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}
