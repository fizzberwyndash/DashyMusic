import React from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import type { MusicTrack } from "../types";
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
import { Artwork } from "../components/Artwork";
import { TrackRow } from "../components/TrackRow";

export type DiscoverScreenProps = {
  tracks: MusicTrack[];
  loading: boolean;
  error: string;
  genre: string;
  onGenre: (genre: string) => void;
  onRetry: () => void;
  onPlay: (track: MusicTrack, list: MusicTrack[]) => void;
  onSaveMix: () => void;
  onAutoMix: () => void;
  onSearch: () => void;
  crossfadeSeconds: number;
  recent: MusicTrack[];
};

const genres = [
  { value: "All", title: "For you", icon: "sparkles-outline" },
  { value: "Electronic", title: "Electronic", icon: "flash-outline" },
  { value: "Hip-Hop/Rap", title: "Hip-Hop", icon: "headset-outline" },
  { value: "Ambient", title: "Ambient drift", icon: "water-outline" },
  { value: "Pop", title: "Pop essentials", icon: "musical-note-outline" },
] as const;

function greeting() {
  const hour = new Date().getHours();
  return hour < 12
    ? "Good morning."
    : hour < 18
      ? "Good afternoon."
      : "Good evening.";
}
function durationLabel(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "—:—";
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds) % 60).padStart(2, "0")}`;
}

export function DiscoverScreen({
  tracks,
  loading,
  error,
  genre,
  onGenre,
  onRetry,
  onPlay,
  onSaveMix,
  onAutoMix,
  onSearch,
  crossfadeSeconds,
  recent,
}: DiscoverScreenProps) {
  const { width } = useWindowDimensions();
  const cardWidth =
    width >= 900 ? 222 : Math.min(228, Math.max(186, width * 0.56));
  const songs = tracks.filter((track) => track.source === "audius");
  const first = songs[0];
  const featuredName =
    genre === "All"
      ? "Afterglow sessions"
      : genre === "Ambient"
        ? "A softer kind of space"
        : genre === "Electronic"
          ? "After hours, amplified"
          : genre === "Hip-Hop/Rap"
            ? "Find your next rhythm"
            : "Good things on repeat";

  return (
    <View style={s.screen}>
      <View style={{ gap: 14 }}>
        <View style={[u.row, { justifyContent: "space-between", gap: 12 }]}>
          <View style={{ flex: 1, gap: 8 }}>
            <Text style={s.feedLabel}>YOUR ACOUSTIC FEED</Text>
            <Text style={s.greeting}>
              {greeting()}
              {"\n"}Find your frequency.
            </Text>
          </View>
          <View style={s.tuneButton}>
            <RoundButton
              icon="options-outline"
              label="Tune your AutoMix"
              onPress={onAutoMix}
              size={48}
            />
            <View style={s.tuneDot} />
          </View>
        </View>
        <View style={s.sourcePill}>
          <View style={s.sourceDot} />
          <Text style={s.sourcePillTitle}>Free music, new discoveries</Text>
          <Text style={s.sourcePillDot}>·</Text>
          <Text style={s.sourcePillSource}>Audius</Text>
        </View>
      </View>

      <Glass strong style={s.hero}>
        <View style={[u.row, { justifyContent: "space-between", gap: 7 }]}>
          <Badge color={palette.purple}>YOUR DAILY ROTATION</Badge>
          <View style={[u.row, { gap: 6 }]}>
            <Equalizer small color={palette.cyan} />
            <Text style={s.heroTopNote}>AutoMix</Text>
          </View>
        </View>
        <View style={s.heroArtwork}>
          <Image
            source={require("../../../assets/v2/collection-1.png")}
            style={StyleSheet.absoluteFill}
          />
          <LinearGradient
            colors={["transparent", "rgba(9,9,15,0.78)"]}
            style={StyleSheet.absoluteFill}
          />
          <View style={s.artworkBottom}>
            <View style={s.artworkSignal}>
              <Equalizer small color={palette.pink} />
              <Text style={s.artworkSignalText}>A NEW STATE OF MIND</Text>
            </View>
            <Badge color={palette.cyan}>
              {crossfadeSeconds > 0
                ? `${crossfadeSeconds.toFixed(1)}s CROSSFADE`
                : "YOUR NEXT LISTEN"}
            </Badge>
          </View>
        </View>
        <View style={{ gap: 9 }}>
          <Text style={s.heroTitle}>{featuredName}</Text>
          <Text style={s.heroDescription}>
            {loading
              ? "Finding the good ones for you…"
              : error
                ? "Your music feed is taking a moment."
                : songs.length
                  ? `${songs.length} songs · free Audius streaming${genre !== "All" ? ` · ${genre}` : ""}`
                  : "Independent sounds. A world to discover."}
          </Text>
        </View>
        <View style={[u.row, { gap: 9 }]}>
          <View style={{ flex: 1 }}>
            <Button
              icon="play"
              disabled={!first || loading || !!error}
              onPress={() => first && onPlay(first, songs)}
            >
              Start AutoMix
            </Button>
          </View>
          <RoundButton
            icon="bookmark-outline"
            label="Save daily mix as playlist"
            onPress={onSaveMix}
            disabled={!songs.length || loading || !!error}
            size={49}
          />
          <RoundButton
            icon="infinite-outline"
            label="Open AutoMix settings"
            onPress={onAutoMix}
            size={49}
          />
        </View>
      </Glass>

      <View style={{ gap: 13 }}>
        <View style={s.sectionHeading}>
          <Text style={u.heading}>A sound for every feeling</Text>
          <Icon name="sparkles-outline" size={17} color={palette.purple} />
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, paddingBottom: 2 }}
        >
          {genres.map((item) => (
            <Pill
              key={item.value}
              active={genre === item.value}
              onPress={() => onGenre(item.value)}
              icon={item.icon}
            >
              {item.title}
            </Pill>
          ))}
        </ScrollView>
      </View>

      <View style={{ gap: 16 }}>
        <View style={s.sectionHeading}>
          <View style={[u.row, { flex: 1, gap: 8 }]}>
            <Text style={u.heading}>In the current</Text>
            <View style={s.trendingPill}>
              <Text style={s.trendingLabel}>TRENDING</Text>
            </View>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="See all music in search"
            onPress={onSearch}
            style={s.seeAll}
          >
            <Text style={s.seeAllText}>See all</Text>
            <Icon name="chevron-forward" size={14} color={palette.cyan} />
          </Pressable>
        </View>

        {loading ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 14 }}
            accessibilityLabel="Loading music recommendations"
          >
            {[0, 1, 2].map((index) => (
              <View key={index} style={[s.loadingCard, { width: cardWidth }]}>
                <View style={s.skeletonArt}>
                  <ActivityIndicator
                    color={index === 0 ? palette.cyan : palette.soft}
                    size="small"
                  />
                </View>
                <View style={s.skeletonTitle} />
                <View style={s.skeletonArtist} />
              </View>
            ))}
          </ScrollView>
        ) : error ? (
          <Glass style={s.feedbackCard}>
            <Icon name="cloud-offline-outline" size={31} color={palette.cyan} />
            <Text style={s.feedbackTitle}>A small pause in the flow.</Text>
            <Text style={s.feedbackBody}>{error}</Text>
            <Button onPress={onRetry} icon="refresh-outline" secondary>
              Try again
            </Button>
          </Glass>
        ) : !songs.length ? (
          <Glass style={s.feedbackCard}>
            <Icon
              name="musical-notes-outline"
              size={31}
              color={palette.purple}
            />
            <Text style={s.feedbackTitle}>A different feeling?</Text>
            <Text style={s.feedbackBody}>
              No songs came back for this filter. Try another mood or search for
              something you love.
            </Text>
            <Button onPress={onSearch} icon="search-outline" secondary>
              Find music
            </Button>
          </Glass>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 14, paddingBottom: 3 }}
          >
            {songs.slice(0, 12).map((track) => (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Play ${track.title} by ${track.artist}`}
                key={track.id}
                onPress={() => onPlay(track, songs)}
                style={({ pressed }) => [
                  s.trackCard,
                  { width: cardWidth },
                  pressed && u.pressed,
                ]}
              >
                <View style={s.trackArtwork}>
                  <Artwork
                    uri={track.artwork}
                    style={StyleSheet.absoluteFill}
                  />
                  <LinearGradient
                    colors={[
                      "rgba(0,0,0,0.08)",
                      "transparent",
                      "rgba(0,0,0,0.63)",
                    ]}
                    style={StyleSheet.absoluteFill}
                  />
                  <View style={s.trackSource}>
                    <Badge color={palette.cyan}>AUDIUS</Badge>
                  </View>
                  <Text style={s.trackTime}>
                    {durationLabel(track.duration)}
                  </Text>
                  <View style={s.trackPlay}>
                    <Icon name="play" color={palette.bg} size={18} />
                  </View>
                </View>
                <View style={s.trackInfo}>
                  <Text style={s.trackTitle} numberOfLines={1}>
                    {track.title}
                  </Text>
                  <Text style={s.trackArtist} numberOfLines={1}>
                    {track.artist}
                  </Text>
                  <View style={[u.row, { gap: 5 }]}>
                    <Icon name="radio-outline" color={palette.cyan} size={12} />
                    <Text numberOfLines={1} style={s.trackGenre}>
                      {track.genre || "Independent music"}
                    </Text>
                  </View>
                </View>
              </Pressable>
            ))}
          </ScrollView>
        )}
      </View>

      {!!recent.length && (
        <View style={{ gap: 8 }}>
          <View style={[s.sectionHeading, { marginBottom: 5 }]}>
            <View style={[u.row, { gap: 8 }]}>
              <Icon name="time-outline" color={palette.cyan} size={20} />
              <Text style={u.heading}>Still on your mind</Text>
            </View>
            <Text style={u.mono}>RECENTLY PLAYED</Text>
          </View>
          {recent.slice(0, 3).map((track) => (
            <TrackRow
              key={track.id}
              track={track}
              onPlay={() => onPlay(track, recent)}
            />
          ))}
        </View>
      )}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Personalize your AutoMix"
        onPress={onAutoMix}
        style={({ pressed }) => pressed && u.pressed}
      >
        <Glass style={s.listeningCard}>
          <View style={s.listeningIcon}>
            <LinearGradient
              colors={["#6657E8", "#2DA8C5"]}
              style={StyleSheet.absoluteFill}
            />
            <Icon name="infinite-outline" size={24} />
          </View>
          <View style={{ flex: 1, gap: 5 }}>
            <Text style={s.listeningTitle}>Made for the way you listen.</Text>
            <Text style={s.listeningSubtitle}>
              Smooth fades. A softer start. Your pace.
            </Text>
          </View>
          <Icon name="chevron-forward" color={palette.cyan} size={18} />
        </Glass>
      </Pressable>
      <Text style={s.catalogNote}>
        Discover independent artists on Audius. Availability may vary by track.
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { gap: 25 },
  feedLabel: {
    fontFamily: fonts.medium,
    fontSize: 9,
    color: palette.muted,
    letterSpacing: 1.6,
    lineHeight: 15,
  },
  greeting: {
    fontFamily: fonts.extra,
    color: palette.text,
    fontSize: 29,
    lineHeight: 37,
    letterSpacing: -1.3,
  },
  tuneButton: { position: "relative" },
  tuneDot: {
    position: "absolute",
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: palette.green,
    top: 10,
    right: 10,
    pointerEvents: "none",
  },
  sourcePill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.045)",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  sourceDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: palette.cyan,
  },
  sourcePillTitle: {
    fontFamily: fonts.medium,
    fontSize: 9,
    color: palette.text,
  },
  sourcePillDot: { color: palette.soft, fontSize: 10 },
  sourcePillSource: {
    fontFamily: fonts.mono,
    fontSize: 8,
    color: palette.muted,
  },
  hero: {
    padding: 16,
    gap: 17,
    backgroundColor: "rgba(49,35,68,0.4)",
    borderRadius: 28,
  },
  heroTopNote: { color: palette.muted, fontFamily: fonts.mono, fontSize: 9 },
  heroArtwork: {
    width: "100%",
    aspectRatio: 1.6,
    maxHeight: 330,
    borderRadius: 19,
    overflow: "hidden",
    backgroundColor: "#241B39",
  },
  artworkBottom: {
    position: "absolute",
    bottom: 11,
    left: 10,
    right: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 7,
    flexWrap: "wrap",
  },
  artworkSignal: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: "rgba(0,0,0,0.44)",
  },
  artworkSignalText: {
    fontFamily: fonts.mono,
    fontSize: 6,
    lineHeight: 11,
    color: "#F2DEEE",
    letterSpacing: 0.5,
  },
  heroTitle: {
    color: palette.text,
    fontFamily: fonts.extra,
    fontSize: 27,
    lineHeight: 35,
    letterSpacing: -1,
  },
  heroDescription: {
    color: palette.muted,
    fontFamily: fonts.regular,
    fontSize: 11,
    lineHeight: 19,
  },
  sectionHeading: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  trendingPill: {
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 4,
    backgroundColor: "rgba(173,104,248,0.15)",
  },
  trendingLabel: {
    fontFamily: fonts.mono,
    fontSize: 7,
    color: "#DCB7FF",
    letterSpacing: 0.4,
  },
  seeAll: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    paddingLeft: 6,
  },
  seeAllText: { fontFamily: fonts.medium, fontSize: 11, color: palette.cyan },
  loadingCard: {
    padding: 9,
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.045)",
    gap: 11,
    paddingBottom: 16,
  },
  skeletonArt: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 17,
    backgroundColor: "rgba(255,255,255,0.035)",
    alignItems: "center",
    justifyContent: "center",
  },
  skeletonTitle: {
    height: 10,
    width: "80%",
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.08)",
    marginLeft: 3,
  },
  skeletonArtist: {
    height: 8,
    width: "55%",
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.05)",
    marginLeft: 3,
  },
  feedbackCard: { padding: 27, alignItems: "center", gap: 15 },
  feedbackTitle: {
    fontFamily: fonts.semibold,
    color: palette.text,
    fontSize: 19,
    lineHeight: 27,
    textAlign: "center",
    letterSpacing: -0.6,
  },
  feedbackBody: {
    fontFamily: fonts.regular,
    color: palette.muted,
    fontSize: 12,
    lineHeight: 20,
    textAlign: "center",
    maxWidth: 440,
  },
  trackCard: {
    padding: 9,
    borderRadius: 25,
    backgroundColor: "rgba(255,255,255,0.055)",
    gap: 12,
  },
  trackArtwork: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 18,
    backgroundColor: "#1C1926",
    overflow: "hidden",
  },
  trackSource: { position: "absolute", left: 9, top: 9 },
  trackTime: {
    position: "absolute",
    left: 10,
    bottom: 12,
    color: palette.text,
    fontFamily: fonts.mono,
    fontSize: 9,
  },
  trackPlay: {
    position: "absolute",
    right: 10,
    bottom: 10,
    width: 33,
    height: 33,
    borderRadius: 17,
    backgroundColor: "rgba(255,255,255,0.94)",
    alignItems: "center",
    justifyContent: "center",
  },
  trackInfo: { paddingHorizontal: 4, paddingBottom: 6, gap: 8 },
  trackTitle: {
    fontFamily: fonts.bold,
    color: palette.text,
    fontSize: 15,
    letterSpacing: -0.5,
  },
  trackArtist: {
    fontFamily: fonts.regular,
    color: palette.muted,
    fontSize: 11,
  },
  trackGenre: {
    fontFamily: fonts.mono,
    color: palette.cyan,
    fontSize: 8,
    flex: 1,
    lineHeight: 13,
  },
  listeningCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    padding: 15,
    borderRadius: 25,
  },
  listeningIcon: {
    height: 45,
    width: 45,
    borderRadius: 23,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  listeningTitle: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    color: palette.text,
    lineHeight: 20,
  },
  listeningSubtitle: {
    fontFamily: fonts.regular,
    fontSize: 10,
    color: palette.muted,
    lineHeight: 17,
  },
  catalogNote: {
    fontFamily: fonts.regular,
    color: palette.soft,
    fontSize: 10,
    lineHeight: 17,
    textAlign: "center",
    marginTop: -9,
    paddingBottom: 4,
  },
});
