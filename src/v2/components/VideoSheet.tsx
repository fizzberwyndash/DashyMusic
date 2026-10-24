import React, { useRef, useState } from "react";
import { Modal, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { YouTubePlayer } from "../../components/YouTubePlayer";
import type { YouTubePlayerHandle } from "../../components/playerTypes";
import { MusicTrack } from "../types";
import { Ambient } from "./Ambient";
import { RoundButton, u } from "../ui";
import { fonts, palette } from "../theme";
import { TimedLyrics } from "./TimedLyrics";

export function VideoSheet({
  track,
  onClose,
  lyrics,
  onImport,
  onSource,
  notice,
}: {
  track: MusicTrack | null;
  onClose: () => void;
  lyrics: string;
  onImport: () => void;
  onSource: () => void;
  notice: string;
}) {
  const player = useRef<YouTubePlayerHandle>(null);
  const [position, setPosition] = useState(0);
  const [error, setError] = useState("");
  return (
    <Modal
      visible={!!track}
      onRequestClose={onClose}
      animationType="slide"
      presentationStyle="fullScreen"
    >
      {track && (
        <View style={s.root}>
          <Ambient artwork={track.artwork} />
          <SafeAreaView style={s.safe}>
            <View style={s.header}>
              <RoundButton
                icon="chevron-down"
                label="Close video player"
                onPress={onClose}
              />
              <Text style={u.eyebrow}>YOUTUBE · VISIBLE VIDEO</Text>
              <RoundButton
                icon="open-outline"
                label="Open in YouTube"
                onPress={onSource}
              />
            </View>
            <View style={{ minHeight: 200, backgroundColor: "#000" }}>
              <YouTubePlayer
                key={track.id}
                ref={player}
                videoId={track.providerId}
                onReady={() => {
                  setError("");
                  player.current?.play();
                }}
                onProgress={(time) => setPosition(time)}
                onError={setError}
              />
            </View>
            <Text numberOfLines={1} style={[u.heading, { marginTop: 18 }]}>
              {track.title}
            </Text>
            <Text numberOfLines={1} style={[u.body, { marginTop: 4 }]}>
              {track.artist}
            </Text>
            {!!error && (
              <Text accessibilityRole="alert" style={s.error}>
                {error}
              </Text>
            )}
            <View style={{ flex: 1, marginTop: 14 }}>
              <TimedLyrics
                text={lyrics}
                position={position}
                onSeek={(seconds) => player.current?.seekTo(seconds)}
                onImport={onImport}
                captionNote
              />
            </View>
            {!!notice && (
              <Text
                accessibilityRole="alert"
                style={[u.body, { color: palette.cyan }]}
              >
                {notice}
              </Text>
            )}
            <Text
              style={[u.mono, { textAlign: "center", paddingVertical: 14 }]}
            >
              Video pauses when closed or backgrounded.
            </Text>
          </SafeAreaView>
        </View>
      )}
    </Modal>
  );
}
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.bg },
  safe: {
    flex: 1,
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
    paddingHorizontal: 20,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    height: 60,
  },
  error: {
    color: "#FFB6AE",
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 18,
    paddingTop: 8,
  },
});
