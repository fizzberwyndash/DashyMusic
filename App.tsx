import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Image,
  ImageBackground,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  ActionButton,
  common,
  Glass,
  Icon,
  IconButton,
  IconName,
  WaveMark,
} from "./src/components/ui";
import { LyricsPanel } from "./src/components/LyricsPanel";
import { YouTubePlayer } from "./src/components/YouTubePlayer";
import type { YouTubePlayerHandle } from "./src/components/playerTypes";
import { colors } from "./src/theme";
import { s } from "./src/styles";
import {
  formatTime,
  parseYouTubeUrl,
  seedTracks,
  Track,
  trackFromVideoId,
} from "./src/lib/music";
import { parseLRC } from "./src/lib/lyrics";
import { searchVideos } from "./src/lib/youtube";

type Tab = "Listen" | "Search" | "Library";
const STORAGE = {
  favorites: "dashy:favorites:v1",
  lyrics: "dashy:lyrics:v1",
  key: "dashy:youtube-key:v1",
};
const tabs: { name: Tab; icon: IconName; activeIcon: IconName }[] = [
  { name: "Listen", icon: "headset-outline", activeIcon: "headset" },
  { name: "Search", icon: "search-outline", activeIcon: "search" },
  { name: "Library", icon: "albums-outline", activeIcon: "albums" },
];
const moods = ["For you", "After hours", "Good energy", "A little nostalgia"];

function MusicApp() {
  const { width, height } = useWindowDimensions();
  const wide = width >= 900;
  const compact = height < 760;
  const [tab, setTab] = useState<Tab>("Listen");
  const [mood, setMood] = useState(0);
  const [current, setCurrent] = useState<Track>(seedTracks[0]);
  const [queue, setQueue] = useState<Track[]>(seedTracks);
  const [favorites, setFavorites] = useState<Track[]>([]);
  const [lyricsFiles, setLyricsFiles] = useState<Record<string, string>>({});
  const [hydrated, setHydrated] = useState(false);
  const [playerOpen, setPlayerOpen] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [ready, setReady] = useState(false);
  const [playerError, setPlayerError] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [duration, setDuration] = useState(0);
  const [timelineWidth, setTimelineWidth] = useState(1);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [keyDraft, setKeyDraft] = useState("");
  const [apiKey, setApiKey] = useState(
    process.env.EXPO_PUBLIC_YOUTUBE_API_KEY ?? "",
  );
  const [deviceKeySaved, setDeviceKeySaved] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Track[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [notice, setNotice] = useState("");
  const [importing, setImporting] = useState(false);
  const player = useRef<YouTubePlayerHandle>(null);
  const wantsPlay = useRef(false);
  const searchRequest = useRef<AbortController | null>(null);
  const activeLyrics = useMemo(
    () => parseLRC(lyricsFiles[current.id] ?? ""),
    [lyricsFiles, current.id],
  );
  const rotation = useMemo(
    () =>
      mood === 0
        ? seedTracks
        : seedTracks.filter((_, index) => (index + mood) % 3 !== 0),
    [mood],
  );

  useEffect(() => {
    let active = true;
    AsyncStorage.multiGet(Object.values(STORAGE))
      .then((entries) => {
        if (!active) return;
        const saved = Object.fromEntries(entries);
        try {
          const tracks: unknown = JSON.parse(saved[STORAGE.favorites] ?? "[]");
          // Retain video IDs, rather than indefinitely caching API-supplied metadata.
          if (Array.isArray(tracks))
            setFavorites(
              [
                ...new Set(
                  tracks.flatMap((value) => {
                    const id = typeof value === "string" ? value : value?.id;
                    return typeof id === "string" && /^[\w-]{11}$/.test(id)
                      ? [id]
                      : [];
                  }),
                ),
              ].map(trackFromVideoId),
            );
          const files: unknown = JSON.parse(saved[STORAGE.lyrics] ?? "{}");
          if (files && typeof files === "object" && !Array.isArray(files)) {
            const validated: Record<string, string> = {};
            for (const [id, text] of Object.entries(files)) {
              if (
                /^[\w-]{11}$/.test(id) &&
                typeof text === "string" &&
                text.length <= 1_000_000
              ) {
                try {
                  if (parseLRC(text).length) validated[id] = text;
                } catch {
                  /* Ignore malformed local files. */
                }
              }
            }
            setLyricsFiles(validated);
          }
        } catch {
          setNotice(
            "Some saved data could not be loaded. You can import it again.",
          );
        }
        if (saved[STORAGE.key]) {
          setApiKey(saved[STORAGE.key]!);
          setDeviceKeySaved(true);
        }
      })
      .catch(() =>
        setNotice(
          "Device storage is unavailable. Changes will last for this session.",
        ),
      )
      .finally(() => {
        if (active) setHydrated(true);
      });
    return () => {
      active = false;
      searchRequest.current?.abort();
    };
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    AsyncStorage.setItem(
      STORAGE.favorites,
      JSON.stringify(favorites.map((track) => track.id)),
    ).catch(() => setNotice("Could not save your favorites on this device."));
  }, [favorites, hydrated]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 6500);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") {
        player.current?.pause();
        wantsPlay.current = false;
        setIsPlaying(false);
      }
    });
    return () => subscription.remove();
  }, []);

  function haptic() {
    if (Platform.OS !== "web") void Haptics.selectionAsync().catch(() => {});
  }
  function like(track: Track) {
    haptic();
    setFavorites((previous) =>
      previous.some((item) => item.id === track.id)
        ? previous.filter((item) => item.id !== track.id)
        : [track, ...previous],
    );
  }
  function openTrack(track: Track, tracks: Track[] = queue) {
    haptic();
    setQueue(tracks);
    wantsPlay.current = true;
    if (current.id !== track.id || !playerOpen) {
      setReady(false);
      setIsPlaying(false);
      setElapsed(0);
      setDuration(0);
    }
    setCurrent(track);
    setPlayerError("");
    setPlayerOpen(true);
    if (current.id === track.id && ready && playerOpen) player.current?.play();
  }
  function closePlayer() {
    player.current?.pause();
    wantsPlay.current = false;
    setIsPlaying(false);
    setPlayerOpen(false);
    setReady(false);
  }
  function step(direction: number) {
    const index = queue.findIndex((track) => track.id === current.id);
    if (queue.length)
      openTrack(
        queue[(Math.max(0, index) + direction + queue.length) % queue.length],
      );
  }
  function seek(seconds: number) {
    if (!ready || !duration) return;
    const next = Math.max(0, Math.min(duration, seconds));
    player.current?.seekTo(next);
    setElapsed(next);
  }
  async function submitSearch() {
    const term = query.trim();
    if (!term) return;
    searchRequest.current?.abort();
    const id = parseYouTubeUrl(term);
    if (id) {
      const track = trackFromVideoId(id);
      setResults([track]);
      setSearchError("");
      setSearching(false);
      openTrack(track, [track]);
      return;
    }
    const controller = new AbortController();
    searchRequest.current = controller;
    setSearching(true);
    setSearchError("");
    setResults(null);
    try {
      const tracks = await searchVideos(term, apiKey, controller.signal);
      if (!controller.signal.aborted) setResults(tracks);
    } catch (error) {
      if (!controller.signal.aborted)
        setSearchError(
          error instanceof Error
            ? error.message
            : "Search could not finish. Please try again.",
        );
    } finally {
      if (!controller.signal.aborted) setSearching(false);
    }
  }
  async function saveKey() {
    const value = keyDraft.trim();
    if (!value) {
      setNotice("Paste your YouTube Data API key first.");
      return;
    }
    try {
      await AsyncStorage.setItem(STORAGE.key, value);
      setApiKey(value);
      setDeviceKeySaved(true);
      setKeyDraft("");
      setSettingsOpen(false);
      setNotice("Search key saved on this device.");
    } catch {
      setNotice("The key could not be saved. Check device storage.");
    }
  }
  async function removeKey() {
    try {
      await AsyncStorage.removeItem(STORAGE.key);
      setApiKey(process.env.EXPO_PUBLIC_YOUTUBE_API_KEY ?? "");
      setDeviceKeySaved(false);
      setKeyDraft("");
      setNotice("Device key removed.");
    } catch {
      setNotice("The device key could not be removed.");
    }
  }
  async function importLyrics() {
    if (importing) return;
    const trackId = current.id;
    setImporting(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "*/*",
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled) return;
      const file = result.assets[0];
      if (!/\.(lrc|txt)$/i.test(file.name))
        throw new Error("Choose a .lrc or .txt timed lyric file.");
      if ((file.size ?? 0) > 1_000_000)
        throw new Error("Choose a lyric file smaller than 1 MB.");
      const text =
        Platform.OS === "web"
          ? await (file.file
              ? file.file.text()
              : (await fetch(file.uri)).text())
          : await FileSystem.readAsStringAsync(file.uri);
      if (!parseLRC(text).length)
        throw new Error(
          "No timed lyrics found. Use lines such as [00:12.50]Your lyric line.",
        );
      const next = { ...lyricsFiles, [trackId]: text };
      await AsyncStorage.setItem(STORAGE.lyrics, JSON.stringify(next));
      setLyricsFiles(next);
      setNotice("Timed lyrics added. Tap a line to jump to it.");
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Could not import this lyric file.",
      );
    } finally {
      setImporting(false);
    }
  }

  const liked = favorites.some((track) => track.id === current.id);
  const renderRow = (track: Track, index: number, list: Track[]) => (
    <View key={track.id} style={s.trackRow}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Play ${track.title} by ${track.artist}`}
        style={s.trackMain}
        onPress={() => openTrack(track, list)}
      >
        {wide && (
          <Text style={s.trackNumber}>
            {String(index + 1).padStart(2, "0")}
          </Text>
        )}
        <Image source={{ uri: track.thumbnail }} style={s.trackThumb} />
        <View style={{ flex: 1, gap: 4 }}>
          <Text numberOfLines={1} style={s.trackTitle}>
            {track.title}
          </Text>
          <Text numberOfLines={1} style={s.trackArtist}>
            {track.artist}
          </Text>
        </View>
        {wide && (
          <Text style={[common.muted, { fontSize: 11, marginRight: 28 }]}>
            YouTube
          </Text>
        )}
      </Pressable>
      <IconButton
        name={
          favorites.some((item) => item.id === track.id)
            ? "heart"
            : "heart-outline"
        }
        label={`${favorites.some((item) => item.id === track.id) ? "Unsave" : "Save"} ${track.title}`}
        onPress={() => like(track)}
        active={favorites.some((item) => item.id === track.id)}
        size={19}
      />
    </View>
  );
  function navigation(vertical: boolean) {
    return tabs.map((item) => (
      <Pressable
        key={item.name}
        accessibilityRole="tab"
        aria-selected={item.name === tab}
        accessibilityState={{ selected: item.name === tab }}
        accessibilityLabel={item.name}
        onPress={() => {
          setTab(item.name);
          haptic();
        }}
        style={[
          s.navItem,
          vertical && s.sideNavItem,
          tab === item.name && s.navActive,
        ]}
      >
        <Icon
          name={tab === item.name ? item.activeIcon : item.icon}
          size={vertical ? 20 : 22}
          color={tab === item.name ? colors.lime : colors.muted}
        />
        <Text style={[s.navText, tab === item.name && { color: colors.lime }]}>
          {item.name}
        </Text>
        {vertical && item.name === "Library" && (
          <Text style={s.navCount}>{favorites.length}</Text>
        )}
      </Pressable>
    ));
  }

  return (
    <View style={s.root}>
      <StatusBar style="light" />
      <Image
        source={{ uri: current.thumbnail }}
        blurRadius={90}
        style={[StyleSheet.absoluteFill, { opacity: 0.12 }]}
      />
      <LinearGradient
        colors={["rgba(11,17,16,0.35)", colors.background]}
        style={StyleSheet.absoluteFill}
      />
      <SafeAreaView style={s.safe} edges={["top", "bottom"]}>
        <View style={s.workspace}>
          {wide && (
            <View style={s.sidebar}>
              <View style={s.brand}>
                <WaveMark />
                <Text style={s.brandText}>
                  dashy<Text style={{ color: colors.lime }}>.</Text>
                </Text>
              </View>
              <Text
                style={[
                  common.eyebrow,
                  { marginTop: 52, marginBottom: 16, color: "#6F7C73" },
                ]}
              >
                YOUR SPACE
              </Text>
              {navigation(true)}
              <Glass style={s.sideNote}>
                <Icon name="sparkles-outline" size={24} color={colors.lime} />
                <Text style={s.sideNoteTitle}>A feeling for every day.</Text>
                <Text style={common.muted}>Your music, a little closer.</Text>
              </Glass>
              <View style={{ flex: 1 }} />
              <Pressable
                accessibilityRole="button"
                onPress={() => setSettingsOpen(true)}
                style={s.sideSettings}
              >
                <Icon name="options-outline" size={19} color={colors.muted} />
                <Text style={common.muted}>App settings</Text>
              </Pressable>
              <Text style={s.sourceNote}>Powered by YouTube</Text>
            </View>
          )}
          <View style={s.main}>
            <View style={[s.topbar, wide && { paddingHorizontal: 40 }]}>
              {wide ? (
                <View style={common.row}>
                  <View style={s.liveDot} />
                  <Text style={s.topbarText}>
                    A little music. A better day.
                  </Text>
                </View>
              ) : (
                <View style={s.brand}>
                  <WaveMark small />
                  <Text style={[s.brandText, { fontSize: 25 }]}>
                    dashy<Text style={{ color: colors.lime }}>.</Text>
                  </Text>
                </View>
              )}
              <View style={[common.row, { gap: 8 }]}>
                <View style={s.youtubeBadge}>
                  <Icon name="logo-youtube" size={14} color="#E8EAE5" />
                  <Text style={s.youtubeBadgeText}>YouTube</Text>
                </View>
                <IconButton
                  name="options-outline"
                  label="Open settings"
                  onPress={() => setSettingsOpen(true)}
                />
              </View>
            </View>
            <ScrollView
              style={{ flex: 1 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={[
                s.content,
                wide && { paddingHorizontal: 40, paddingTop: 22 },
              ]}
            >
              {tab === "Listen" && (
                <>
                  <View
                    style={[
                      common.row,
                      { justifyContent: "space-between", marginBottom: 22 },
                    ]}
                  >
                    <View>
                      <Text style={common.eyebrow}>TUNE INTO YOURSELF</Text>
                      <Text style={[s.pageTitle, wide && { fontSize: 34 }]}>
                        A soundtrack for today.
                      </Text>
                    </View>
                    {wide && (
                      <Text style={common.muted}>
                        Stay curious. Press play.
                      </Text>
                    )}
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Play the daily rotation"
                    onPress={() => openTrack(rotation[0], rotation)}
                    style={({ pressed }) => [
                      s.hero,
                      { height: wide ? 300 : 282 },
                      pressed && { opacity: 0.9 },
                    ]}
                  >
                    <ImageBackground
                      source={{ uri: rotation[0].thumbnail }}
                      style={StyleSheet.absoluteFill}
                      imageStyle={{ opacity: 0.66 }}
                    />
                    <LinearGradient
                      colors={["rgba(13,28,20,0.12)", "rgba(10,25,17,0.92)"]}
                      style={StyleSheet.absoluteFill}
                    />
                    <LinearGradient
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      colors={["rgba(13,30,21,0.86)", "transparent"]}
                      style={StyleSheet.absoluteFill}
                    />
                    <View style={s.heroContent}>
                      <View style={s.heroBadge}>
                        <View style={s.liveDot} />
                        <Text style={s.heroBadgeText}>THE DAILY ROTATION</Text>
                      </View>
                      <Text
                        style={[
                          s.heroTitle,
                          wide && { fontSize: 57, lineHeight: 60 },
                        ]}
                      >
                        Find your{"\n"}next feeling.
                      </Text>
                      <Text style={s.heroSubtitle}>
                        Familiar favorites. A fresh state of mind.
                      </Text>
                      <View style={[common.row, { gap: 8, marginTop: 20 }]}>
                        <Icon
                          name="play-circle-outline"
                          size={15}
                          color="#CFD8C9"
                        />
                        <Text style={s.heroFootnote}>
                          {rotation.length} handpicked videos · on YouTube
                        </Text>
                      </View>
                    </View>
                    <View style={s.heroPlay}>
                      <Icon name="play" size={26} color={colors.background} />
                    </View>
                  </Pressable>
                  <View style={[s.sectionHeading, { marginTop: 29 }]}>
                    <Text style={common.title}>Made for your mood</Text>
                    <Icon
                      name="sparkles-outline"
                      size={18}
                      color={colors.lime}
                    />
                  </View>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ gap: 8, paddingVertical: 14 }}
                  >
                    {moods.map((name, index) => (
                      <Pressable
                        key={name}
                        accessibilityRole="button"
                        accessibilityState={{ selected: mood === index }}
                        onPress={() => setMood(index)}
                        style={[s.chip, mood === index && s.chipActive]}
                      >
                        <Text
                          style={[
                            s.chipText,
                            mood === index && { color: colors.background },
                          ]}
                        >
                          {name}
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ gap: 14, paddingBottom: 6 }}
                  >
                    {rotation.slice(0, 6).map((track) => (
                      <Pressable
                        key={track.id}
                        accessibilityRole="button"
                        accessibilityLabel={`Play ${track.title}`}
                        onPress={() => openTrack(track, rotation)}
                        style={({ pressed }) => [
                          s.musicCard,
                          { width: wide ? 177 : 151 },
                          pressed && { opacity: 0.7 },
                        ]}
                      >
                        <View
                          style={[s.artwork, { backgroundColor: track.accent }]}
                        >
                          <Image
                            source={{ uri: track.thumbnail }}
                            style={StyleSheet.absoluteFill}
                          />
                          <LinearGradient
                            colors={["transparent", "rgba(0,0,0,0.48)"]}
                            style={StyleSheet.absoluteFill}
                          />
                          <View style={s.cardVideoBadge}>
                            <Icon name="logo-youtube" size={13} />
                          </View>
                          <View style={s.cardPlay}>
                            <Icon name="play" size={14} />
                          </View>
                        </View>
                        <Text numberOfLines={1} style={s.cardTitle}>
                          {track.title}
                        </Text>
                        <Text numberOfLines={1} style={s.cardArtist}>
                          {track.artist}
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                  <View
                    style={[
                      s.sectionHeading,
                      { marginTop: 29, marginBottom: 10 },
                    ]}
                  >
                    <Text style={common.title}>Worth another listen</Text>
                    <Text style={s.smallLabel}>THE FAVORITES</Text>
                  </View>
                  {seedTracks
                    .slice(3, 7)
                    .map((track, index) => renderRow(track, index, seedTracks))}
                  <View style={s.homeFooter}>
                    <WaveMark small />
                    <Text style={s.footerText}>
                      Find something that feels like you.
                    </Text>
                  </View>
                </>
              )}
              {tab === "Search" && (
                <>
                  <Text style={common.eyebrow}>FOLLOW YOUR CURIOSITY</Text>
                  <Text style={s.pageTitle}>What's your next listen?</Text>
                  <Text
                    style={[common.muted, { marginTop: 10, marginBottom: 24 }]}
                  >
                    Find a song, an artist, or paste a YouTube video link.
                  </Text>
                  <Glass style={s.searchBox}>
                    <Icon
                      name="search-outline"
                      size={21}
                      color={colors.muted}
                    />
                    <TextInput
                      accessibilityLabel="Search songs or paste YouTube link"
                      value={query}
                      onChangeText={setQuery}
                      onSubmitEditing={() => void submitSearch()}
                      placeholder="Song, artist, or YouTube link"
                      placeholderTextColor="#7F8D81"
                      style={s.searchInput}
                      returnKeyType="search"
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Submit search"
                      onPress={() => void submitSearch()}
                      disabled={searching || !query.trim()}
                      style={s.searchSubmit}
                    >
                      {searching ? (
                        <ActivityIndicator
                          size="small"
                          color={colors.background}
                        />
                      ) : (
                        <Icon
                          name="arrow-forward"
                          color={colors.background}
                          size={20}
                        />
                      )}
                    </Pressable>
                  </Glass>
                  {!apiKey && (
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => setSettingsOpen(true)}
                      style={s.keyHint}
                    >
                      <Icon name="key-outline" size={18} color={colors.lime} />
                      <Text style={[common.muted, { flex: 1 }]}>
                        Video links work without a key. Add a free-quota API key
                        for search.
                      </Text>
                      <Icon
                        name="chevron-forward"
                        size={16}
                        color={colors.muted}
                      />
                    </Pressable>
                  )}
                  {!!searchError && (
                    <Text accessibilityRole="alert" style={s.error}>
                      {searchError}
                    </Text>
                  )}
                  <View
                    style={[
                      s.sectionHeading,
                      { marginTop: 32, marginBottom: 12 },
                    ]}
                  >
                    <Text style={common.title}>
                      {results ? "Search results" : "Start with a favorite"}
                    </Text>
                    {results && (
                      <Text style={common.muted}>{results.length} videos</Text>
                    )}
                  </View>
                  {results?.length === 0 && (
                    <Glass style={s.emptyCard}>
                      <Icon
                        name="search-outline"
                        size={32}
                        color={colors.lime}
                      />
                      <Text style={s.emptyTitle}>A different tune?</Text>
                      <Text style={common.muted}>
                        No embeddable music videos found. Try another search.
                      </Text>
                    </Glass>
                  )}
                  {(results ?? seedTracks).map((track, index, list) =>
                    renderRow(track, index, list),
                  )}
                </>
              )}
              {tab === "Library" && (
                <>
                  <Text style={common.eyebrow}>KEEP THE GOOD ONES CLOSE</Text>
                  <Text style={s.pageTitle}>Your little universe.</Text>
                  <Glass style={s.libraryHero}>
                    <View style={s.libraryHeart}>
                      <Icon name="heart" size={29} color={colors.lime} />
                    </View>
                    <View>
                      <Text style={common.title}>Liked videos</Text>
                      <Text style={[common.muted, { marginTop: 5 }]}>
                        {favorites.length}{" "}
                        {favorites.length === 1 ? "favorite" : "favorites"} ·
                        saved on this device
                      </Text>
                    </View>
                  </Glass>
                  {favorites.length ? (
                    favorites.map((track, index) =>
                      renderRow(track, index, favorites),
                    )
                  ) : (
                    <Glass style={s.emptyCard}>
                      <Icon
                        name="heart-outline"
                        size={36}
                        color={colors.lime}
                      />
                      <Text style={s.emptyTitle}>Make yourself at home.</Text>
                      <Text
                        style={[
                          common.muted,
                          { textAlign: "center", maxWidth: 260 },
                        ]}
                      >
                        Tap a heart beside any video. Your favorites will be
                        waiting here.
                      </Text>
                      <ActionButton
                        onPress={() => setTab("Listen")}
                        icon="arrow-forward"
                      >
                        Discover music
                      </ActionButton>
                    </Glass>
                  )}
                </>
              )}
            </ScrollView>
            <Glass style={[s.dock, wide && { marginHorizontal: 32 }]}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Open player for ${current.title}`}
                onPress={() => openTrack(current)}
                style={s.dockTrack}
              >
                <Image source={{ uri: current.thumbnail }} style={s.dockArt} />
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={s.dockEyebrow}>READY WHEN YOU ARE</Text>
                  <Text numberOfLines={1} style={s.dockTitle}>
                    {current.title}
                  </Text>
                  <Text numberOfLines={1} style={s.cardArtist}>
                    {current.artist}
                  </Text>
                </View>
              </Pressable>
              {wide && (
                <Text style={[common.muted, { fontSize: 11, marginRight: 22 }]}>
                  Open the video to listen
                </Text>
              )}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Open video player"
                onPress={() => openTrack(current)}
                style={s.dockPlay}
              >
                <Icon name="play" size={21} color={colors.background} />
              </Pressable>
            </Glass>
            {!wide && <View style={s.bottomNav}>{navigation(false)}</View>}
          </View>
        </View>
      </SafeAreaView>

      <Modal
        visible={playerOpen}
        animationType="slide"
        onRequestClose={closePlayer}
        presentationStyle="fullScreen"
      >
        <View style={s.playerRoot}>
          <Image
            source={{ uri: current.thumbnail }}
            blurRadius={70}
            style={[StyleSheet.absoluteFill, { opacity: 0.55 }]}
          />
          <LinearGradient
            colors={["rgba(8,17,13,0.5)", "rgba(8,17,13,0.96)"]}
            style={StyleSheet.absoluteFill}
          />
          <SafeAreaView style={s.playerSafe}>
            <View style={s.playerContent}>
              <View style={[s.playerHeader, compact && { height: 50 }]}>
                <IconButton
                  name="chevron-down"
                  label="Close player and pause"
                  onPress={closePlayer}
                />
                <View style={{ alignItems: "center", gap: 4 }}>
                  <Text style={common.eyebrow}>IN YOUR ELEMENT</Text>
                  <Text style={s.playerSource}>Playing from YouTube</Text>
                </View>
                <IconButton
                  name={liked ? "heart" : "heart-outline"}
                  label={liked ? "Unsave current video" : "Save current video"}
                  onPress={() => like(current)}
                  active={liked}
                />
              </View>
              <View style={s.videoFrame}>
                {playerOpen && (
                  <YouTubePlayer
                    key={current.id}
                    ref={player}
                    videoId={current.id}
                    onReady={() => {
                      setReady(true);
                      if (wantsPlay.current) player.current?.play();
                    }}
                    onStateChange={(state) => {
                      setIsPlaying(state === "playing");
                      if (state === "ended") wantsPlay.current = false;
                    }}
                    onProgress={(time, length) => {
                      setElapsed(time);
                      setDuration(length);
                    }}
                    onError={(message) => {
                      setPlayerError(message);
                      setIsPlaying(false);
                    }}
                  />
                )}
              </View>
              {!!playerError && (
                <View style={s.playerError}>
                  <Text style={[s.error, { marginTop: 0, flex: 1 }]}>
                    {playerError}
                  </Text>
                  <Pressable
                    accessibilityRole="link"
                    onPress={() =>
                      void Linking.openURL(
                        `https://www.youtube.com/watch?v=${current.id}`,
                      )
                    }
                  >
                    <Text style={s.importLink}>Open YouTube ↗</Text>
                  </Pressable>
                </View>
              )}
              <View
                style={[
                  s.nowTitle,
                  compact && { marginTop: 10, marginBottom: 3 },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text
                    numberOfLines={1}
                    style={[s.nowSong, compact && { fontSize: 22 }]}
                  >
                    {current.title}
                  </Text>
                  <Text numberOfLines={1} style={s.nowArtist}>
                    {current.artist}
                  </Text>
                </View>
                <Icon
                  name="musical-notes-outline"
                  size={25}
                  color={colors.lime}
                />
              </View>
              <Pressable
                accessibilityRole="adjustable"
                accessibilityLabel="Playback position"
                accessibilityValue={{ min: 0, max: duration, now: elapsed }}
                accessibilityActions={[
                  { name: "increment", label: "Forward ten seconds" },
                  { name: "decrement", label: "Back ten seconds" },
                ]}
                onAccessibilityAction={(event) =>
                  seek(
                    elapsed +
                      (event.nativeEvent.actionName === "increment" ? 10 : -10),
                  )
                }
                onLayout={(event) =>
                  setTimelineWidth(event.nativeEvent.layout.width)
                }
                onPress={(event) =>
                  seek((event.nativeEvent.locationX / timelineWidth) * duration)
                }
                style={s.timelineHit}
              >
                <View style={s.timeline}>
                  <View
                    style={[
                      s.timelineProgress,
                      {
                        width: `${duration ? Math.min(100, (elapsed / duration) * 100) : 0}%`,
                      },
                    ]}
                  />
                </View>
              </Pressable>
              <View style={s.timeLabels}>
                <Text style={s.timeText}>{formatTime(elapsed)}</Text>
                <Text style={s.timeText}>
                  {duration ? formatTime(duration) : "—:—"}
                </Text>
              </View>
              <View style={[s.playbackControls, compact && { paddingTop: 3 }]}>
                <IconButton
                  name="play-skip-back"
                  label="Previous video"
                  onPress={() => step(-1)}
                  disabled={queue.length < 2}
                  size={23}
                />
                <IconButton
                  name="play-back"
                  label="Rewind ten seconds"
                  onPress={() => seek(elapsed - 10)}
                  disabled={!ready}
                  size={22}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={isPlaying ? "Pause video" : "Play video"}
                  disabled={!ready || !!playerError}
                  onPress={() => {
                    wantsPlay.current = !isPlaying;
                    isPlaying
                      ? player.current?.pause()
                      : player.current?.play();
                  }}
                  style={[
                    s.bigPlay,
                    compact && { height: 52, width: 52, borderRadius: 26 },
                    (!ready || !!playerError) && { opacity: 0.45 },
                  ]}
                >
                  <Icon
                    name={isPlaying ? "pause" : "play"}
                    size={29}
                    color={colors.background}
                  />
                </Pressable>
                <IconButton
                  name="play-forward"
                  label="Forward ten seconds"
                  onPress={() => seek(elapsed + 10)}
                  disabled={!ready}
                  size={22}
                />
                <IconButton
                  name="play-skip-forward"
                  label="Next video"
                  onPress={() => step(1)}
                  disabled={queue.length < 2}
                  size={23}
                />
              </View>
              {!ready && !playerError && (
                <Text style={s.playerHint}>
                  Loading YouTube… Tap play in the video if asked.
                </Text>
              )}
              <LyricsPanel
                lines={activeLyrics}
                currentTime={elapsed}
                onSeek={seek}
                onImport={() => void importLyrics()}
              />
              {!!notice && (
                <Text
                  accessibilityRole="alert"
                  accessibilityLiveRegion="polite"
                  style={s.inlineNotice}
                >
                  {notice}
                </Text>
              )}
              <Text style={s.playerFooter}>
                Visible video playback · Captions supplied by YouTube
              </Text>
            </View>
          </SafeAreaView>
        </View>
      </Modal>

      <Modal
        visible={settingsOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setSettingsOpen(false)}
      >
        <KeyboardAvoidingView
          style={s.modalScrim}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={s.settingsCard}>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <View style={[common.row, { justifyContent: "space-between" }]}>
                <Text style={common.title}>Make it yours.</Text>
                <IconButton
                  name="close"
                  label="Close settings"
                  onPress={() => setSettingsOpen(false)}
                />
              </View>
              <Text style={[common.muted, { marginTop: 10, marginBottom: 22 }]}>
                Paste video links and explore the starting collection without an
                API key.
              </Text>
              <Text style={s.settingsLabel}>YOUTUBE DATA API KEY</Text>
              <TextInput
                accessibilityLabel="YouTube API key"
                value={keyDraft}
                onChangeText={setKeyDraft}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                placeholder={
                  apiKey
                    ? "A key is configured. Paste to replace."
                    : "Paste your API key"
                }
                placeholderTextColor="#79877E"
                style={s.keyInput}
              />
              <Text style={[common.muted, { fontSize: 12, marginBottom: 18 }]}>
                YouTube provides a free daily API quota. Search uses that quota.
                This key stays on your device and is sent to Google for
                searches; restrict it to the YouTube Data API in Google Cloud.
              </Text>
              <ActionButton
                icon="key-outline"
                onPress={() => void saveKey()}
                disabled={!keyDraft.trim()}
              >
                Save search key
              </ActionButton>
              {deviceKeySaved && (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void removeKey()}
                  style={{ paddingVertical: 15, alignItems: "center" }}
                >
                  <Text style={common.muted}>Remove saved device key</Text>
                </Pressable>
              )}
              {!!apiKey && !deviceKeySaved && (
                <Text style={[common.muted, { marginTop: 12, fontSize: 11 }]}>
                  A project key is configured through .env. Edit that file to
                  remove it.
                </Text>
              )}
              <Pressable
                accessibilityRole="link"
                onPress={() =>
                  void Linking.openURL(
                    "https://developers.google.com/youtube/v3/getting-started",
                  )
                }
                style={{ marginTop: 18 }}
              >
                <Text style={s.importLink}>
                  How to get a YouTube API key ↗
                </Text>
              </Pressable>
              <View style={s.settingsDivider} />
              <View style={[common.row, { gap: 8 }]}>
                <Icon
                  name="information-circle-outline"
                  size={18}
                  color={colors.lime}
                />
                <Text style={s.settingsLabel}>A NOTE ON PLAYBACK</Text>
              </View>
              <Text style={[common.muted, { fontSize: 12, marginTop: 10 }]}>
                YouTube videos play while the player is visible. Closing it or
                leaving the app pauses playback. Background audio and offline
                downloads are not available with YouTube embeds.
              </Text>
              <Text style={[common.muted, { fontSize: 12, marginTop: 12 }]}>
                Captions appear in the video when available. The singing panel
                supports .lrc files you have permission to use. Imported lyrics
                and favorites stay on this device.
              </Text>
              <Text style={[s.sourceNote, { marginTop: 22 }]}>
                DASHYMUSIC / VERSION 0.1
              </Text>
              {!!notice && (
                <Text
                  accessibilityRole="alert"
                  accessibilityLiveRegion="polite"
                  style={s.inlineNotice}
                >
                  {notice}
                </Text>
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      {!!notice && !playerOpen && !settingsOpen && (
        <View pointerEvents="none" style={s.notice}>
          <Text
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            style={s.noticeText}
          >
            {notice}
          </Text>
        </View>
      )}
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <MusicApp />
    </SafeAreaProvider>
  );
}
