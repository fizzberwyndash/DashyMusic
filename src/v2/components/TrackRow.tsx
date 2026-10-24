import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { MusicTrack } from "../types";
import { fonts, palette } from "../theme";
import { Equalizer, Icon, RoundButton, u } from "../ui";
import { Artwork } from "./Artwork";
import { formatTime } from "../../lib/music";

export function TrackRow({
  track,
  onPlay,
  onFavorite,
  liked,
  active,
  index,
}: {
  track: MusicTrack;
  onPlay: () => void;
  onFavorite?: () => void;
  liked?: boolean;
  active?: boolean;
  index?: number;
}) {
  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Play ${track.title} by ${track.artist}`}
        onPress={onPlay}
        style={({ pressed }) => [styles.main, pressed && u.pressed]}
      >
        {index !== undefined && (
          <View style={styles.number}>
            {active ? (
              <Equalizer small />
            ) : (
              <Text style={u.mono}>{index + 1}</Text>
            )}
          </View>
        )}
        <Artwork uri={track.artwork} style={styles.image} />
        <View style={{ flex: 1, minWidth: 0, gap: 5 }}>
          <Text
            numberOfLines={1}
            style={[styles.title, active && { color: palette.cyan }]}
          >
            {track.title}
          </Text>
          <Text numberOfLines={1} style={styles.artist}>
            {track.artist}
          </Text>
          <Text style={styles.source}>
            {track.source === "audius"
              ? "AUDIUS"
              : track.source === "local"
                ? "ON YOUR DEVICE"
                : "YOUTUBE VIDEO"}
          </Text>
        </View>
        {!!track.duration && (
          <Text style={u.mono}>{formatTime(track.duration)}</Text>
        )}
        {track.source === "youtube" && (
          <Icon name="logo-youtube" size={15} color="#FF8588" />
        )}
      </Pressable>
      {onFavorite && (
        <RoundButton
          icon={liked ? "heart" : "heart-outline"}
          label={`${liked ? "Unsave" : "Save"} ${track.title}`}
          onPress={onFavorite}
          active={liked}
        />
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
  },
  main: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  number: { width: 17, alignItems: "center" },
  image: { height: 53, width: 53, borderRadius: 14 },
  title: { fontFamily: fonts.semibold, color: palette.text, fontSize: 13 },
  artist: { fontFamily: fonts.regular, color: palette.muted, fontSize: 11 },
  source: {
    fontFamily: fonts.mono,
    fontSize: 8,
    color: palette.cyan,
    letterSpacing: 0.7,
  },
});
