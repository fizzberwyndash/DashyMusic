import React, { useEffect, useMemo, useState } from "react";
import {
  Image,
  ImageSourcePropType,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import type { MusicTrack, SavedPlaylist } from "../types";
import { fonts, palette } from "../theme";
import {
  Badge,
  Button,
  Equalizer,
  Glass,
  Icon,
  Pill,
  RoundButton,
  u,
} from "../ui";

export type LibraryScreenProps = {
  tracks: MusicTrack[];
  favoriteIds: string[];
  recentIds: string[];
  playlists: SavedPlaylist[];
  onPlay: (track: MusicTrack, list: MusicTrack[]) => void;
  onFavorite: (track: MusicTrack) => void;
  onImport: () => void;
  onCreatePlaylist: () => void;
  onOpenPlaylist: (id: string) => void;
  onOpenFavorites: () => void;
  onOpenImports: () => void;
};

const collectionArt = [
  require("../../../assets/v2/collection-1.png"),
  require("../../../assets/v2/collection-2.png"),
  require("../../../assets/v2/collection-3.png"),
];
const sourceLabel = (track: MusicTrack) =>
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

export function LibraryCover({
  uri,
  fallback,
  style,
}: {
  uri?: string;
  fallback?: ImageSourcePropType;
  style?: React.ComponentProps<typeof View>["style"];
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [uri]);
  return (
    <View style={[s.cover, style]}>
      {uri && !failed ? (
        <Image
          source={{ uri }}
          style={StyleSheet.absoluteFill}
          onError={() => setFailed(true)}
        />
      ) : fallback ? (
        <Image source={fallback} style={StyleSheet.absoluteFill} />
      ) : (
        <>
          <LinearGradient
            colors={["#342047", "#153640"]}
            style={StyleSheet.absoluteFill}
          />
          <Icon
            name="musical-notes-outline"
            color="rgba(255,255,255,0.5)"
            size={23}
          />
        </>
      )}
    </View>
  );
}

export function LibraryScreen({
  tracks,
  favoriteIds,
  recentIds,
  playlists,
  onPlay,
  onFavorite,
  onImport,
  onCreatePlaylist,
  onOpenPlaylist,
  onOpenFavorites,
  onOpenImports,
}: LibraryScreenProps) {
  const [tab, setTab] = useState<"playlists" | "songs" | "local">("playlists");
  const [gridWidth, setGridWidth] = useState(0);
  const local = useMemo(
    () => tracks.filter((track) => track.source === "local"),
    [tracks],
  );
  const favoriteSet = useMemo(() => new Set(favoriteIds), [favoriteIds]);
  const favorites = useMemo(
    () => tracks.filter((track) => favoriteSet.has(track.id)),
    [tracks, favoriteSet],
  );
  const recent = useMemo(
    () =>
      recentIds
        .flatMap((id) => {
          const track = tracks.find((item) => item.id === id);
          return track ? [track] : [];
        })
        .slice(0, 6),
    [tracks, recentIds],
  );
  const visibleSongs = tab === "local" ? local : tracks;
  const columns = gridWidth >= 760 ? 3 : 2;
  const cardWidth = gridWidth
    ? (gridWidth - (columns - 1) * 14) / columns
    : undefined;

  const songRow = (track: MusicTrack, list: MusicTrack[]) => (
    <View key={track.id} style={s.songRow}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Play ${track.title} by ${track.artist}`}
        onPress={() => onPlay(track, list)}
        style={s.songMain}
      >
        <LibraryCover uri={track.artwork} style={s.songArt} />
        <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
          <Text numberOfLines={1} style={s.songTitle}>
            {track.title}
          </Text>
          <Text numberOfLines={1} style={s.songArtist}>
            {track.artist}
          </Text>
          <Text style={[s.songSource, { color: sourceColor(track) }]}>
            {sourceLabel(track)}
          </Text>
        </View>
      </Pressable>
      <RoundButton
        icon={favoriteSet.has(track.id) ? "heart" : "heart-outline"}
        label={`${favoriteSet.has(track.id) ? "Unsave" : "Save"} ${track.title}`}
        active={favoriteSet.has(track.id)}
        onPress={() => onFavorite(track)}
      />
    </View>
  );

  return (
    <View style={s.screen}>
      <View style={[u.row, { justifyContent: "space-between" }]}>
        <View style={{ gap: 5 }}>
          <Text style={u.eyebrow}>YOUR PERSONAL UNIVERSE</Text>
          <Text style={[u.title, { fontSize: 38, lineHeight: 48 }]}>
            Library
          </Text>
        </View>
        <RoundButton
          icon="add"
          label="Create playlist"
          onPress={onCreatePlaylist}
          size={52}
        />
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8 }}
      >
        <Pill
          active={tab === "playlists"}
          onPress={() => setTab("playlists")}
          icon="albums-outline"
        >
          Playlists
        </Pill>
        <Pill
          active={tab === "songs"}
          onPress={() => setTab("songs")}
          icon="musical-notes-outline"
        >
          All songs
        </Pill>
        <Pill
          active={tab === "local"}
          onPress={() => setTab("local")}
          icon="phone-portrait-outline"
        >
          On device
        </Pill>
      </ScrollView>

      <Glass style={s.vaultSummary}>
        <View style={[u.row, { gap: 9, marginBottom: 18 }]}>
          <View style={s.summaryIcon}>
            <Icon name="sparkles-outline" size={18} color={palette.cyan} />
          </View>
          <Text style={s.summaryTitle}>A SPACE THAT SOUNDS LIKE YOU</Text>
        </View>
        <View style={s.summaryColumns}>
          {[
            { title: "LIKED", value: favorites.length, color: palette.pink },
            { title: "IMPORTED", value: local.length, color: palette.cyan },
            {
              title: "PLAYLISTS",
              value: playlists.length,
              color: palette.purple,
            },
          ].map((stat) => (
            <View key={stat.title} style={s.summaryColumn}>
              <Text style={[s.summaryValue, { color: stat.color }]}>
                {stat.value}
              </Text>
              <Text style={s.summaryLabel}>{stat.title}</Text>
            </View>
          ))}
        </View>
      </Glass>

      {tab === "playlists" ? (
        <>
          <View style={[u.row, { justifyContent: "space-between", gap: 8 }]}>
            <Text style={u.heading}>Your curated vaults</Text>
            <Text style={u.mono}>{playlists.length + 2} COLLECTIONS</Text>
          </View>
          <View
            onLayout={(event) => setGridWidth(event.nativeEvent.layout.width)}
            style={s.grid}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Open liked songs, ${favorites.length} tracks`}
              onPress={onOpenFavorites}
              style={({ pressed }) => [
                s.collectionCard,
                cardWidth ? { width: cardWidth } : { width: "47.5%" },
                pressed && u.pressed,
              ]}
            >
              <View style={s.favoriteArt}>
                <LinearGradient
                  colors={["#4C2248", "#20172F", "#15162A"]}
                  style={StyleSheet.absoluteFill}
                />
                <View style={s.favoriteHeart}>
                  <Icon name="heart-outline" size={37} />
                </View>
                <View style={s.artBottom}>
                  <Badge color={palette.pink}>YOUR FAVORITES</Badge>
                </View>
              </View>
              <View style={s.collectionInfo}>
                <Text style={s.collectionTitle}>Liked songs</Text>
                <Text style={s.collectionSubtitle}>
                  {favorites.length} {favorites.length === 1 ? "song" : "songs"}{" "}
                  you love
                </Text>
              </View>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Open imported music, ${local.length} tracks`}
              onPress={onOpenImports}
              style={({ pressed }) => [
                s.collectionCard,
                cardWidth ? { width: cardWidth } : { width: "47.5%" },
                pressed && u.pressed,
              ]}
            >
              <View style={s.collectionImage}>
                <LibraryCover
                  uri={local[0]?.artwork}
                  fallback={collectionArt[1]}
                  style={StyleSheet.absoluteFill}
                />
                <View style={s.artTop}>
                  <Badge color={palette.cyan}>ON YOUR DEVICE</Badge>
                </View>
                <View style={s.cardPlay}>
                  <Icon name="musical-note" size={19} color={palette.bg} />
                </View>
              </View>
              <View style={s.collectionInfo}>
                <Text style={s.collectionTitle}>Local treasures</Text>
                <Text style={s.collectionSubtitle}>
                  {local.length} imported{" "}
                  {local.length === 1 ? "track" : "tracks"}
                </Text>
              </View>
            </Pressable>
            {playlists.map((playlist, index) => {
              const listTracks = playlist.trackIds.flatMap((id) => {
                const track = tracks.find((item) => item.id === id);
                return track ? [track] : [];
              });
              return (
                <Pressable
                  key={playlist.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Open playlist ${playlist.name}`}
                  onPress={() => onOpenPlaylist(playlist.id)}
                  style={({ pressed }) => [
                    s.collectionCard,
                    cardWidth ? { width: cardWidth } : { width: "47.5%" },
                    pressed && u.pressed,
                  ]}
                >
                  <View style={s.collectionImage}>
                    <LibraryCover
                      uri={listTracks[0]?.artwork}
                      fallback={collectionArt[index % collectionArt.length]}
                      style={StyleSheet.absoluteFill}
                    />
                    <LinearGradient
                      colors={["transparent", "rgba(0,0,0,0.35)"]}
                      style={StyleSheet.absoluteFill}
                    />
                    <View style={s.artTop}>
                      <Badge color={index % 2 ? palette.purple : palette.cyan}>
                        PLAYLIST
                      </Badge>
                    </View>
                    <View style={s.cardPlay}>
                      <Icon name="play" size={19} color={palette.bg} />
                    </View>
                  </View>
                  <View style={s.collectionInfo}>
                    <Text numberOfLines={2} style={s.collectionTitle}>
                      {playlist.name}
                    </Text>
                    <Text style={s.collectionSubtitle}>
                      {listTracks.length}{" "}
                      {listTracks.length === 1 ? "track" : "tracks"}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
          {!playlists.length && (
            <Glass style={s.createCard}>
              <View style={s.createIcon}>
                <Icon name="add" size={25} color={palette.cyan} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.createTitle}>A mix only you could make.</Text>
                <Text style={[u.body, { fontSize: 11 }]}>
                  Give your favorite moments a home.
                </Text>
              </View>
              <RoundButton
                icon="arrow-forward"
                label="Make your first playlist"
                onPress={onCreatePlaylist}
              />
            </Glass>
          )}
        </>
      ) : (
        <>
          <View style={[u.row, { justifyContent: "space-between" }]}>
            <Text style={u.heading}>
              {tab === "local" ? "On your device" : "All your songs"}
            </Text>
            <Text style={u.mono}>{visibleSongs.length} TRACKS</Text>
          </View>
          {visibleSongs.length ? (
            <View style={{ gap: 7 }}>
              {visibleSongs.map((track) => songRow(track, visibleSongs))}
            </View>
          ) : (
            <Glass style={s.emptyState}>
              <Icon
                name={
                  tab === "local"
                    ? "cloud-upload-outline"
                    : "musical-notes-outline"
                }
                size={34}
                color={palette.cyan}
              />
              <Text style={s.emptyTitle}>
                {tab === "local"
                  ? "Bring your own soundtrack."
                  : "Your collection starts here."}
              </Text>
              <Text style={[u.body, { textAlign: "center", fontSize: 12 }]}>
                Import music you own, then keep it close in your library.
              </Text>
              <Button icon="add" onPress={onImport}>
                Import audio
              </Button>
            </Glass>
          )}
        </>
      )}

      {!!recent.length && tab === "playlists" && (
        <View style={{ gap: 15 }}>
          <View style={[u.row, { gap: 8 }]}>
            <Icon name="time-outline" color={palette.cyan} size={21} />
            <Text style={u.heading}>Jump back in</Text>
          </View>
          <View style={s.recentGrid}>
            {recent.map((track) => (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Resume ${track.title}`}
                key={track.id}
                onPress={() => onPlay(track, recent)}
                style={({ pressed }) => [s.recentCard, pressed && u.pressed]}
              >
                <LibraryCover uri={track.artwork} style={s.recentArt} />
                <View style={{ flex: 1, minWidth: 0, gap: 5 }}>
                  <Text style={s.recentTitle} numberOfLines={1}>
                    {track.title}
                  </Text>
                  <Text
                    style={[u.mono, { fontSize: 8, color: sourceColor(track) }]}
                  >
                    {sourceLabel(track)}
                  </Text>
                </View>
                <Icon name="play" size={14} color={palette.text} />
              </Pressable>
            ))}
          </View>
        </View>
      )}

      <Glass style={s.importFooter}>
        <Equalizer small color={palette.purple} />
        <View style={{ flex: 1 }}>
          <Text style={s.createTitle}>Your files. Your listening space.</Text>
          <Text style={[u.body, { fontSize: 10 }]}>
            Import MP3, M4A, WAV or FLAC audio.
          </Text>
        </View>
        <RoundButton icon="add" label="Import audio files" onPress={onImport} />
      </Glass>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { gap: 23 },
  cover: {
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#242032",
  },
  vaultSummary: { padding: 20, backgroundColor: "rgba(44,36,64,0.26)" },
  summaryIcon: {
    width: 29,
    height: 29,
    borderRadius: 11,
    backgroundColor: "rgba(66,226,244,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  summaryTitle: {
    fontFamily: fonts.semibold,
    fontSize: 9,
    color: palette.text,
    letterSpacing: 0.6,
    flex: 1,
    lineHeight: 15,
  },
  summaryColumns: { flexDirection: "row", gap: 10 },
  summaryColumn: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.20)",
    borderRadius: 18,
    paddingVertical: 13,
    paddingHorizontal: 12,
    gap: 7,
  },
  summaryValue: {
    fontFamily: fonts.bold,
    fontSize: 26,
    lineHeight: 32,
    letterSpacing: -1,
  },
  summaryLabel: {
    fontFamily: fonts.mono,
    fontSize: 8,
    color: palette.muted,
    letterSpacing: 0.8,
  },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 14 },
  collectionCard: {
    borderRadius: 24,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.065)",
  },
  collectionImage: {
    width: "100%",
    aspectRatio: 1,
    overflow: "hidden",
    backgroundColor: "#18142A",
  },
  favoriteArt: {
    width: "100%",
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  favoriteHeart: {
    width: 75,
    height: 75,
    borderRadius: 39,
    backgroundColor: "#EE5B9B",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#F369BC",
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
  },
  artTop: { position: "absolute", top: 10, left: 9, right: 6 },
  artBottom: { position: "absolute", bottom: 12, left: 10, right: 6 },
  cardPlay: {
    position: "absolute",
    bottom: 12,
    right: 12,
    width: 37,
    height: 37,
    borderRadius: 19,
    backgroundColor: "rgba(255,255,255,0.9)",
    alignItems: "center",
    justifyContent: "center",
  },
  collectionInfo: { padding: 13, gap: 6 },
  collectionTitle: {
    fontFamily: fonts.bold,
    fontSize: 15,
    lineHeight: 21,
    color: palette.text,
    letterSpacing: -0.6,
  },
  collectionSubtitle: {
    fontFamily: fonts.mono,
    color: palette.muted,
    fontSize: 9,
    lineHeight: 16,
  },
  createCard: {
    padding: 15,
    gap: 11,
    flexDirection: "row",
    alignItems: "center",
  },
  createIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(66,226,244,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  createTitle: {
    fontFamily: fonts.semibold,
    color: palette.text,
    fontSize: 11,
    lineHeight: 19,
  },
  songRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 9,
    borderRadius: 19,
    gap: 7,
    backgroundColor: "rgba(255,255,255,0.035)",
  },
  songMain: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minWidth: 0,
    flex: 1,
  },
  songArt: { width: 51, height: 51, borderRadius: 13 },
  songTitle: { fontFamily: fonts.semibold, color: palette.text, fontSize: 12 },
  songArtist: { fontFamily: fonts.regular, color: palette.muted, fontSize: 10 },
  songSource: {
    fontFamily: fonts.mono,
    fontSize: 7,
    lineHeight: 10,
    letterSpacing: 0.4,
  },
  recentGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  recentCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 11,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.055)",
    flexGrow: 1,
    flexBasis: 235,
  },
  recentArt: { width: 43, height: 43, borderRadius: 22 },
  recentTitle: {
    fontFamily: fonts.semibold,
    color: palette.text,
    fontSize: 11,
  },
  emptyState: { padding: 27, alignItems: "center", gap: 15 },
  emptyTitle: {
    fontFamily: fonts.semibold,
    color: palette.text,
    fontSize: 19,
    lineHeight: 27,
    textAlign: "center",
    letterSpacing: -0.7,
  },
  importFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 15,
    marginTop: 2,
  },
});
