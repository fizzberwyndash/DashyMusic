import React, { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import type { MusicTrack, SavedPlaylist } from "../types";
import { fonts, palette } from "../theme";
import { Badge, Button, Glass, Icon, RoundButton, u } from "../ui";
import { LibraryCover } from "./LibraryScreen";

export type PlaylistScreenProps = {
  playlist: SavedPlaylist;
  tracks: MusicTrack[];
  favoriteIds: string[];
  onPlay: (track: MusicTrack, list: MusicTrack[]) => void;
  onFavorite: (track: MusicTrack) => void;
  onBack: () => void;
  onShare: () => void;
  onAddTracks: () => void;
  onDelete?: () => void;
};

const sourceName = (track: MusicTrack) =>
  track.source === "local"
    ? "ON DEVICE"
    : track.source === "youtube"
      ? "YOUTUBE VIDEO"
      : "AUDIUS";
const sourceColor = (track: MusicTrack) =>
  track.source === "local"
    ? palette.purple
    : track.source === "youtube"
      ? "#FF858B"
      : palette.cyan;
function durationLabel(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "—:—";
  const total = Math.floor(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export function PlaylistScreen({
  playlist,
  tracks,
  favoriteIds,
  onPlay,
  onFavorite,
  onBack,
  onShare,
  onAddTracks,
  onDelete,
}: PlaylistScreenProps) {
  const ordered = useMemo(
    () =>
      playlist.trackIds.flatMap((id) => {
        const track = tracks.find((item) => item.id === id);
        return track ? [track] : [];
      }),
    [playlist.trackIds, tracks],
  );
  const favoriteSet = useMemo(() => new Set(favoriteIds), [favoriteIds]);
  const totalMinutes = Math.floor(
    ordered.reduce((sum, track) => sum + Math.max(0, track.duration || 0), 0) /
      60,
  );
  const allDurationsKnown =
    ordered.length > 0 && ordered.every((track) => track.duration > 0);
  const sources = [...new Set(ordered.map((track) => track.source))];
  const missing = playlist.trackIds.length - ordered.length;

  return (
    <View style={s.screen}>
      <View style={[u.row, { justifyContent: "space-between" }]}>
        <RoundButton
          icon="chevron-back"
          label="Back to library"
          onPress={onBack}
        />
        <Text style={s.pageLabel}>YOUR COLLECTION</Text>
        <RoundButton
          icon="share-outline"
          label="Share playlist"
          onPress={onShare}
        />
      </View>

      <View style={s.hero}>
        <View style={s.artGlow} />
        <View style={s.artwork}>
          <LibraryCover
            uri={ordered[0]?.artwork}
            fallback={require("../../../assets/v2/collection-1.png")}
            style={StyleSheet.absoluteFill}
          />
          <LinearGradient
            colors={["transparent", "rgba(9,9,15,0.34)"]}
            style={StyleSheet.absoluteFill}
          />
          <View style={s.artBadge}>
            <Badge color={palette.cyan}>
              {ordered.length
                ? `${ordered.length} TRACK${ordered.length === 1 ? "" : "S"}`
                : "MAKE IT YOURS"}
            </Badge>
          </View>
        </View>
        <Text style={s.playlistTitle}>{playlist.name}</Text>
        {!!playlist.description && (
          <Text style={s.playlistDescription}>{playlist.description}</Text>
        )}
        <View style={s.metaPills}>
          <View style={s.metaPill}>
            <Icon name="list-outline" size={13} color={palette.muted} />
            <Text style={u.mono}>
              {ordered.length} {ordered.length === 1 ? "track" : "tracks"}
              {allDurationsKnown && totalMinutes
                ? ` · ${totalMinutes} min`
                : ""}
            </Text>
          </View>
          {!!sources.length && (
            <View style={s.metaPill}>
              {sources.map((source) => (
                <View key={source} style={[u.row, { gap: 4 }]}>
                  <View
                    style={{
                      height: 5,
                      width: 5,
                      borderRadius: 3,
                      backgroundColor:
                        source === "local"
                          ? palette.purple
                          : source === "youtube"
                            ? "#FF858B"
                            : palette.cyan,
                    }}
                  />
                  <Text style={s.sourceCode}>
                    {source === "local"
                      ? "LOCAL"
                      : source === "youtube"
                        ? "YT"
                        : "AUDIUS"}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </View>

      <View style={[u.row, { gap: 10 }]}>
        <View style={{ flex: 1 }}>
          <Button
            onPress={() => ordered[0] && onPlay(ordered[0], ordered)}
            icon="play"
            disabled={!ordered.length}
          >
            Play collection
          </Button>
        </View>
        <RoundButton
          icon="add"
          label="Add songs to playlist"
          onPress={onAddTracks}
          size={49}
        />
        {onDelete && (
          <RoundButton
            icon="trash-outline"
            label="Delete playlist"
            onPress={onDelete}
            size={49}
          />
        )}
      </View>

      <View style={{ gap: 13 }}>
        <View style={[u.row, { justifyContent: "space-between" }]}>
          <Text style={s.sectionLabel}>THE TRACKLIST</Text>
          <Text style={u.mono}>
            {ordered.length} SONG{ordered.length === 1 ? "" : "S"}
          </Text>
        </View>
        {!!missing && (
          <Text style={[u.body, { fontSize: 11 }]}>
            {missing} {missing === 1 ? "track is" : "tracks are"} no longer
            available on this device.
          </Text>
        )}
        {ordered.length ? (
          ordered.map((track, index) => (
            <View key={`${track.id}-${index}`} style={s.trackRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Play ${track.title} by ${track.artist}`}
                onPress={() => onPlay(track, ordered)}
                style={s.trackMain}
              >
                <Text style={s.trackNumber}>
                  {String(index + 1).padStart(2, "0")}
                </Text>
                <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
                  <Text numberOfLines={1} style={s.trackTitle}>
                    {track.title}
                  </Text>
                  <View style={[u.row, { gap: 7, flexWrap: "wrap" }]}>
                    <Text numberOfLines={1} style={s.trackArtist}>
                      {track.artist}
                    </Text>
                    <View style={[u.row, { gap: 4 }]}>
                      <View
                        style={{
                          width: 4,
                          height: 4,
                          borderRadius: 2,
                          backgroundColor: sourceColor(track),
                        }}
                      />
                      <Text
                        style={[s.trackSource, { color: sourceColor(track) }]}
                      >
                        {sourceName(track)}
                      </Text>
                    </View>
                  </View>
                </View>
                <Text style={s.trackDuration}>
                  {durationLabel(track.duration)}
                </Text>
              </Pressable>
              <RoundButton
                icon={favoriteSet.has(track.id) ? "heart" : "heart-outline"}
                label={`${favoriteSet.has(track.id) ? "Unsave" : "Save"} ${track.title}`}
                active={favoriteSet.has(track.id)}
                onPress={() => onFavorite(track)}
              />
            </View>
          ))
        ) : (
          <Glass style={s.empty}>
            <Icon name="musical-notes-outline" size={35} color={palette.cyan} />
            <Text style={s.emptyTitle}>The beginning of a good mix.</Text>
            <Text style={[u.body, { textAlign: "center", fontSize: 12 }]}>
              Add a few songs and give this collection a sound of its own.
            </Text>
            <Button onPress={onAddTracks} icon="add">
              Add songs
            </Button>
          </Glass>
        )}
      </View>

      {!!ordered.length && (
        <View style={s.footer}>
          <Icon name="sparkles-outline" size={16} color={palette.purple} />
          <Text style={s.footerText}>
            Made by you. Ready for your next moment.
          </Text>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  screen: { gap: 25 },
  pageLabel: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: palette.muted,
    letterSpacing: 1.5,
  },
  hero: { alignItems: "center", gap: 16, paddingTop: 4 },
  artGlow: {
    position: "absolute",
    top: 12,
    width: 240,
    height: 240,
    borderRadius: 130,
    backgroundColor: "rgba(148,73,217,0.12)",
    shadowColor: "#9358EB",
    shadowRadius: 50,
    shadowOpacity: 0.8,
    shadowOffset: { width: 0, height: 0 },
  },
  artwork: {
    width: "76%",
    maxWidth: 310,
    aspectRatio: 1,
    borderRadius: 32,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.17)",
    backgroundColor: "#191326",
  },
  artBadge: { position: "absolute", bottom: 13, left: 12 },
  playlistTitle: {
    fontFamily: fonts.extra,
    fontSize: 30,
    color: palette.text,
    letterSpacing: -1.2,
    lineHeight: 38,
    textAlign: "center",
    paddingHorizontal: 3,
    marginTop: 3,
  },
  playlistDescription: {
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 21,
    color: palette.muted,
    textAlign: "center",
    maxWidth: 430,
    marginTop: -7,
  },
  metaPills: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  metaPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.045)",
  },
  sourceCode: { fontFamily: fonts.mono, fontSize: 8, color: palette.muted },
  sectionLabel: {
    fontFamily: fonts.semibold,
    color: palette.muted,
    fontSize: 10,
    letterSpacing: 1.2,
  },
  trackRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 11,
    paddingLeft: 15,
    paddingRight: 6,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.04)",
    gap: 4,
  },
  trackMain: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  trackNumber: {
    fontFamily: fonts.mono,
    color: palette.soft,
    fontSize: 10,
    minWidth: 18,
  },
  trackTitle: {
    fontFamily: fonts.semibold,
    color: palette.text,
    fontSize: 13,
    letterSpacing: -0.2,
  },
  trackArtist: {
    fontFamily: fonts.regular,
    color: palette.muted,
    fontSize: 10,
    maxWidth: 150,
  },
  trackSource: {
    fontFamily: fonts.mono,
    fontSize: 7,
    lineHeight: 12,
    letterSpacing: 0.2,
  },
  trackDuration: {
    fontFamily: fonts.mono,
    color: palette.cyan,
    fontSize: 10,
    marginLeft: 4,
  },
  empty: { alignItems: "center", gap: 15, padding: 28 },
  emptyTitle: {
    fontFamily: fonts.semibold,
    color: palette.text,
    textAlign: "center",
    fontSize: 19,
    lineHeight: 27,
    letterSpacing: -0.7,
  },
  footer: {
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    paddingVertical: 5,
  },
  footerText: { fontFamily: fonts.regular, color: palette.soft, fontSize: 10 },
});
