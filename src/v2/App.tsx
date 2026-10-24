import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from "@expo-google-fonts/plus-jakarta-sans";
import { SpaceMono_400Regular } from "@expo-google-fonts/space-mono";
import * as Haptics from "expo-haptics";
import * as Clipboard from "expo-clipboard";
import { useMusicApp } from "./hooks/useMusicApp";
import { DiscoverScreen } from "./screens/DiscoverScreen";
import { SearchScreen } from "./screens/SearchScreen";
import { LibraryScreen } from "./screens/LibraryScreen";
import { AutoMixScreen } from "./screens/AutoMixScreen";
import { PlaylistScreen } from "./screens/PlaylistScreen";
import { Artwork } from "./components/Artwork";
import { Ambient } from "./components/Ambient";
import { NowPlaying } from "./components/NowPlaying";
import { VideoSheet } from "./components/VideoSheet";
import { SettingsSheet } from "./components/SettingsSheet";
import { PlaylistEditor } from "./components/PlaylistEditor";
import { RouteButton } from "./components/RouteButton";
import { Equalizer, Glass, Glyph, Icon, RoundButton, u } from "./ui";
import { fonts, palette } from "./theme";
import { mergeTracks } from "./data";
import { MusicTrack, SavedPlaylist } from "./types";

type Tab = "Discover" | "Search" | "Library" | "AutoMix";
const navigation: { name: Tab; icon: Glyph }[] = [
  { name: "Discover", icon: "compass-outline" },
  { name: "Search", icon: "search-outline" },
  { name: "Library", icon: "albums-outline" },
  { name: "AutoMix", icon: "options-outline" },
];

function Application() {
  const app = useMusicApp();
  const { width } = useWindowDimensions();
  const wide = width >= 1000;
  const [tab, setTab] = useState<Tab>("Discover");
  const [playlistId, setPlaylistId] = useState<string | null>(null);
  const [editor, setEditor] = useState<"create" | "tracks" | null>(null);
  const { library, current, snapshot, engine } = app;
  const youtubeKey =
    library.youtubeKey || process.env.EXPO_PUBLIC_YOUTUBE_API_KEY || "";
  const selectedPlaylist = useMemo((): SavedPlaylist | undefined => {
    if (playlistId === "system:favorites")
      return {
        id: playlistId,
        name: "Cross-favorites",
        description: "Every song you kept a little closer.",
        trackIds: library.favoriteIds,
        createdAt: 0,
      };
    if (playlistId === "system:imports")
      return {
        id: playlistId,
        name: "Your personal collection",
        description: "Your music. Always within reach.",
        trackIds: library.tracks
          .filter((track) => track.source === "local")
          .map((track) => track.id),
        createdAt: 0,
      };
    return library.playlists.find((item) => item.id === playlistId);
  }, [playlistId, library]);
  const choices = useMemo(
    () => mergeTracks(library.tracks, app.trending),
    [library.tracks, app.trending],
  );
  const recent = library.recentIds
    .map((id) => library.tracks.find((track) => track.id === id))
    .filter((track): track is MusicTrack => !!track);
  const setPage = (page: Tab) => {
    setTab(page);
    setPlaylistId(null);
    if (Platform.OS !== "web") void Haptics.selectionAsync().catch(() => {});
  };
  const play = (track: MusicTrack, list: MusicTrack[]) =>
    app.run(app.playTrack(track, list));
  const openAutoMix = () => {
    app.setPlayerOpen(false);
    setPage("AutoMix");
  };
  const togglePlay = () =>
    app.run(snapshot.playing ? engine.pause() : engine.play());
  const output = () =>
    app.setNotice(
      "Choose headphones, Bluetooth, or AirPlay through your device’s audio controls. The installed iPhone build also includes an AirPlay picker.",
    );
  const openSource = (track: MusicTrack | null) => {
    if (track?.permalink) app.run(Linking.openURL(track.permalink));
    else app.setNotice("This song is stored in your personal collection.");
  };

  function openPlaylist(id: string) {
    setTab("Library");
    setPlaylistId(id);
  }
  function saveMix() {
    if (!app.trending.length) {
      app.setNotice("Load a few songs before saving a mix.");
      return;
    }
    const playlist: SavedPlaylist = {
      id: `mix:${Date.now()}`,
      name:
        app.genre === "All" ? "Afterglow sessions" : `${app.genre} afterglow`,
      description: "A little neon. A new state of mind. Selected from Audius.",
      trackIds: app.trending.map((track) => track.id),
      createdAt: Date.now(),
    };
    app.setLibrary((previous) => ({
      ...previous,
      tracks: mergeTracks(previous.tracks, app.trending),
      playlists: [playlist, ...previous.playlists],
    }));
    app.setNotice("Your daily mix is saved in Library.");
  }
  function savePlaylist(name: string, ids: string[]) {
    const picked = choices.filter((track) => ids.includes(track.id));
    if (editor === "create") {
      const playlist: SavedPlaylist = {
        id: `playlist:${Date.now()}`,
        name,
        description: "A collection of your favorite feelings.",
        trackIds: ids,
        createdAt: Date.now(),
      };
      app.setLibrary((previous) => ({
        ...previous,
        tracks: mergeTracks(previous.tracks, picked),
        playlists: [playlist, ...previous.playlists],
      }));
      openPlaylist(playlist.id);
    } else if (playlistId === "system:favorites") {
      app.setLibrary((previous) => ({
        ...previous,
        tracks: mergeTracks(previous.tracks, picked),
        favoriteIds: ids,
      }));
    } else {
      app.setLibrary((previous) => ({
        ...previous,
        tracks: mergeTracks(previous.tracks, picked),
        playlists: previous.playlists.map((item) =>
          item.id === playlistId ? { ...item, trackIds: ids } : item,
        ),
      }));
    }
    setEditor(null);
    app.setNotice("Your collection is saved.");
  }
  async function shareTracks(name: string, tracks: MusicTrack[]) {
    const text = `${name} — DashyMusic\n\n${tracks.map((track) => `${track.title} — ${track.artist}${track.permalink ? `\n${track.permalink}` : ""}`).join("\n\n")}`;
    if (Platform.OS === "web" && !navigator.share) {
      await Clipboard.setStringAsync(text);
      app.setNotice("Your music links were copied.");
    } else await Share.share({ title: name, message: text });
  }
  function renderNavigation(sidebar = false) {
    return navigation.map((item) => (
      <Pressable
        key={item.name}
        accessibilityRole="tab"
        accessibilityLabel={item.name}
        aria-selected={tab === item.name}
        accessibilityState={{ selected: tab === item.name }}
        onPress={() => setPage(item.name)}
        style={({ pressed }) => [
          s.navItem,
          sidebar && s.sideItem,
          tab === item.name && s.activeNav,
          pressed && u.pressed,
        ]}
      >
        <Icon
          name={item.icon}
          color={tab === item.name ? palette.text : palette.muted}
          size={22}
        />
        <Text
          style={[s.navLabel, tab === item.name && { color: palette.text }]}
        >
          {item.name}
        </Text>
        {tab === item.name && (
          <View
            style={[
              s.navGlow,
              sidebar && { left: 6, top: 16, height: 14, width: 2 },
            ]}
          />
        )}
      </Pressable>
    ));
  }
  const anyModal =
    app.playerOpen || !!app.video || app.settingsOpen || !!editor;
  return (
    <View style={s.root}>
      <StatusBar style="light" />
      <Ambient artwork={current?.artwork} />
      <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
        <View style={{ flex: 1, flexDirection: "row" }}>
          {wide && (
            <View style={s.sidebar}>
              <View
                style={[
                  u.row,
                  { gap: 9, paddingHorizontal: 13, marginTop: 15 },
                ]}
              >
                <Equalizer />
                <Text style={s.brand}>
                  DashyMusic<Text style={{ color: palette.cyan }}>.</Text>
                </Text>
              </View>
              <Text
                style={[
                  u.eyebrow,
                  { paddingHorizontal: 14, marginTop: 46, marginBottom: 16 },
                ]}
              >
                YOUR FREQUENCY
              </Text>
              {renderNavigation(true)}
              <Glass style={{ padding: 20, marginTop: 35, gap: 12 }}>
                <Icon name="sparkles-outline" color={palette.cyan} />
                <Text style={[u.heading, { fontSize: 19 }]}>
                  A little neon.{"\n"}A lot of feeling.
                </Text>
                <Text style={[u.body, { fontSize: 11 }]}>
                  Free discoveries. Your own music. One place to settle in.
                </Text>
              </Glass>
              <View style={{ flex: 1 }} />
              <RoundButton
                icon="settings-outline"
                label="Open app settings"
                onPress={() => app.setSettingsOpen(true)}
              />
              <Text style={[u.mono, { paddingTop: 16, paddingLeft: 8 }]}>
                VERSION 0.2
              </Text>
            </View>
          )}
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={[s.header, wide && { paddingHorizontal: 35 }]}>
              <View style={[u.row, { gap: 7 }]}>
                {!wide && (
                  <>
                    <Equalizer small />
                    <Text style={s.smallBrand}>DashyMusic</Text>
                  </>
                )}
                <Text style={s.breadcrumb}>
                  / {selectedPlaylist ? "Collection" : tab}
                </Text>
              </View>
              <View style={[u.row, { gap: 3 }]}>
                <RouteButton
                  native={engine.kind === "native"}
                  onFallback={output}
                />
                <RoundButton
                  icon="search-outline"
                  label="Open music search"
                  onPress={() => setPage("Search")}
                />
                <RoundButton
                  icon="person-circle-outline"
                  label="Open app settings"
                  onPress={() => app.setSettingsOpen(true)}
                />
              </View>
            </View>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={[
                s.content,
                wide && { paddingHorizontal: 35, maxWidth: 1000 },
              ]}
            >
              {tab === "Discover" && (
                <DiscoverScreen
                  tracks={app.trending}
                  loading={app.loadingCatalog}
                  error={app.catalogError}
                  genre={app.genre}
                  onGenre={app.setGenre}
                  onRetry={app.refreshCatalog}
                  onPlay={play}
                  onSaveMix={saveMix}
                  onAutoMix={openAutoMix}
                  onSearch={() => setPage("Search")}
                  crossfadeSeconds={library.audioSettings.crossfadeSeconds}
                  recent={recent}
                />
              )}
              {tab === "Search" && (
                <SearchScreen
                  trending={app.trending}
                  favoriteIds={library.favoriteIds}
                  activeId={snapshot.activeId}
                  youtubeKey={youtubeKey}
                  onPlay={play}
                  onFavorite={app.toggleFavorite}
                  onSettings={() => app.setSettingsOpen(true)}
                  onError={app.setNotice}
                />
              )}
              {tab === "Library" && !selectedPlaylist && (
                <LibraryScreen
                  tracks={library.tracks}
                  favoriteIds={library.favoriteIds}
                  recentIds={library.recentIds}
                  playlists={library.playlists}
                  onPlay={play}
                  onFavorite={app.toggleFavorite}
                  onImport={() => app.run(app.importMusic())}
                  onCreatePlaylist={() => setEditor("create")}
                  onOpenPlaylist={openPlaylist}
                  onOpenFavorites={() => openPlaylist("system:favorites")}
                  onOpenImports={() => openPlaylist("system:imports")}
                />
              )}
              {tab === "Library" && selectedPlaylist && (
                <PlaylistScreen
                  playlist={selectedPlaylist}
                  tracks={library.tracks}
                  favoriteIds={library.favoriteIds}
                  onPlay={play}
                  onFavorite={app.toggleFavorite}
                  onBack={() => setPlaylistId(null)}
                  onShare={() =>
                    app.run(
                      shareTracks(
                        selectedPlaylist.name,
                        selectedPlaylist.trackIds
                          .map((id) =>
                            library.tracks.find((track) => track.id === id),
                          )
                          .filter((track): track is MusicTrack => !!track),
                      ),
                    )
                  }
                  onAddTracks={() =>
                    playlistId === "system:imports"
                      ? app.run(app.importMusic())
                      : setEditor("tracks")
                  }
                  onDelete={
                    selectedPlaylist.id.startsWith("system:")
                      ? undefined
                      : () => {
                          app.setLibrary((previous) => ({
                            ...previous,
                            playlists: previous.playlists.filter(
                              (item) => item.id !== playlistId,
                            ),
                          }));
                          setPlaylistId(null);
                          app.setNotice(
                            "Playlist removed. Your songs are still in Library.",
                          );
                        }
                  }
                />
              )}
              {tab === "AutoMix" && (
                <AutoMixScreen
                  settings={library.audioSettings}
                  onChange={app.setAudioSettings}
                  onAudition={() => app.run(app.audition())}
                  canAudition={!!current && !!app.next && snapshot.duration > 0}
                  engineKind={engine.kind}
                  current={current ?? undefined}
                  next={app.next}
                  transition={snapshot.transition}
                />
              )}
              <Text
                style={[
                  u.mono,
                  {
                    textAlign: "center",
                    paddingTop: 28,
                    paddingBottom: 5,
                    opacity: 0.5,
                  },
                ]}
              >
                FIND SOMETHING THAT FEELS LIKE YOU.
              </Text>
            </ScrollView>
            <View style={[s.deck, wide && { paddingHorizontal: 30 }]}>
              <Glass strong style={s.miniPlayer}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={
                    current
                      ? `Open player for ${current.title}`
                      : "Choose music"
                  }
                  onPress={() =>
                    current ? app.setPlayerOpen(true) : setPage("Search")
                  }
                  style={s.miniTrack}
                >
                  {current ? (
                    <Artwork uri={current.artwork} style={s.miniArt} />
                  ) : (
                    <View style={s.miniLogo}>
                      <Equalizer />
                    </View>
                  )}
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text numberOfLines={1} style={s.miniTitle}>
                      {current?.title ?? "Find your frequency."}
                    </Text>
                    <Text numberOfLines={1} style={s.miniArtist}>
                      {snapshot.transition
                        ? "A little closer to your next song…"
                        : current
                          ? `${current.artist} · ${current.source === "audius" ? "Audius" : "Your music"}`
                          : "Free music. A new state of mind."}
                    </Text>
                  </View>
                </Pressable>
                {wide && current && (
                  <RoundButton
                    icon="play-skip-back"
                    label="Previous song"
                    onPress={() => app.run(engine.previous())}
                  />
                )}
                <RoundButton
                  filled
                  icon={snapshot.playing ? "pause" : "play"}
                  label={snapshot.playing ? "Pause music" : "Play music"}
                  onPress={() =>
                    current
                      ? togglePlay()
                      : app.trending[0]
                        ? play(app.trending[0], app.trending)
                        : setPage("Search")
                  }
                />
                <RoundButton
                  icon="play-skip-forward"
                  label="Next song"
                  disabled={!current}
                  onPress={() => app.run(engine.next())}
                />
              </Glass>
              {!wide && (
                <Glass strong style={s.bottomNav}>
                  {renderNavigation()}
                </Glass>
              )}
            </View>
          </View>
        </View>
      </SafeAreaView>

      <NowPlaying
        visible={app.playerOpen}
        track={current}
        queue={app.queue}
        snapshot={snapshot}
        settings={library.audioSettings}
        engineKind={engine.kind}
        liked={!!current && library.favoriteIds.includes(current.id)}
        favoriteIds={library.favoriteIds}
        lyrics={app.currentLyrics}
        lyricsStatus={app.lyricsStatus}
        lyricsSource={app.lyricsSource}
        notice={app.notice}
        onClose={() => app.setPlayerOpen(false)}
        onToggle={togglePlay}
        onNext={() => app.run(engine.next())}
        onPrevious={() => app.run(engine.previous())}
        onSeek={(seconds) => app.run(engine.seek(seconds))}
        onFavorite={app.toggleFavorite}
        onRepeat={() =>
          app.setAudioSettings({
            ...library.audioSettings,
            repeat:
              library.audioSettings.repeat === "off"
                ? "all"
                : library.audioSettings.repeat === "all"
                  ? "one"
                  : "off",
          })
        }
        onAutoMix={openAutoMix}
        onImportLyrics={() => current && app.run(app.importLyrics(current))}
        onPlay={play}
        onShare={() =>
          current && app.run(shareTracks(current.title, [current]))
        }
        onSource={() => openSource(current)}
        onOutput={output}
      />
      <VideoSheet
        key={app.video?.id ?? "no-video"}
        track={app.video}
        onClose={() => app.setVideo(null)}
        lyrics={app.video ? (library.lyrics[app.video.id] ?? "") : ""}
        onImport={() => app.video && app.run(app.importLyrics(app.video))}
        onSource={() => openSource(app.video)}
        notice={app.notice}
      />
      <SettingsSheet
        visible={app.settingsOpen}
        onClose={() => app.setSettingsOpen(false)}
        engineKind={engine.kind}
        youtubeKey={youtubeKey}
        onSaveKey={(key) => {
          app.setLibrary((previous) => ({ ...previous, youtubeKey: key }));
          app.setNotice(
            key
              ? "YouTube search key saved on this device."
              : process.env.EXPO_PUBLIC_YOUTUBE_API_KEY
                ? "Device key removed. The project key is still configured."
                : "YouTube device key removed.",
          );
        }}
        onImportMusic={() => app.run(app.importMusic())}
        notice={app.notice}
      />
      <PlaylistEditor
        visible={!!editor}
        mode={editor ?? "create"}
        name={selectedPlaylist?.name}
        tracks={choices}
        selectedIds={
          editor === "tracks" ? (selectedPlaylist?.trackIds ?? []) : []
        }
        onClose={() => setEditor(null)}
        onSave={savePlaylist}
      />
      {!!app.notice && !anyModal && (
        <View pointerEvents="none" style={s.toast}>
          <Text
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            style={s.toastText}
          >
            {app.notice}
          </Text>
        </View>
      )}
      {!app.hydrated && (
        <View style={s.loading}>
          <ActivityIndicator color={palette.cyan} />
          <Text style={[u.mono, { marginTop: 16 }]}>
            FINDING YOUR FREQUENCY…
          </Text>
        </View>
      )}
    </View>
  );
}

export default function App() {
  const [loaded, fontError] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
    SpaceMono_400Regular,
  });
  if (!loaded && !fontError)
    return (
      <View style={s.loading}>
        <Equalizer />
        <ActivityIndicator color={palette.cyan} style={{ marginTop: 20 }} />
      </View>
    );
  return (
    <SafeAreaProvider>
      <Application />
    </SafeAreaProvider>
  );
}
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.bg },
  header: {
    height: 72,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 24,
    width: "100%",
    maxWidth: 820,
    alignSelf: "center",
  },
  sidebar: {
    width: 225,
    borderRightWidth: 1,
    borderColor: "rgba(255,255,255,0.055)",
    backgroundColor: "rgba(8,7,15,0.5)",
    padding: 20,
  },
  brand: {
    fontFamily: fonts.extra,
    color: palette.text,
    fontSize: 20,
    letterSpacing: -1,
  },
  smallBrand: {
    fontFamily: fonts.extra,
    color: palette.text,
    fontSize: 10,
    letterSpacing: -0.3,
  },
  breadcrumb: { fontFamily: fonts.medium, color: palette.muted, fontSize: 13 },
  deck: { paddingHorizontal: 20, paddingBottom: 9, gap: 9 },
  miniPlayer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    padding: 10,
    paddingRight: 11,
    borderRadius: 26,
  },
  miniTrack: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  miniArt: { width: 45, height: 45, borderRadius: 14 },
  miniLogo: {
    width: 38,
    height: 45,
    alignItems: "center",
    justifyContent: "center",
  },
  miniTitle: { fontFamily: fonts.semibold, fontSize: 12, color: palette.text },
  miniArtist: { fontFamily: fonts.mono, fontSize: 9, color: palette.muted },
  bottomNav: {
    flexDirection: "row",
    padding: 5,
    borderRadius: 33,
    minHeight: 65,
  },
  navItem: {
    flex: 1,
    minHeight: 53,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    overflow: "hidden",
  },
  sideItem: {
    flex: 0,
    flexDirection: "row",
    justifyContent: "flex-start",
    paddingHorizontal: 16,
    gap: 15,
    marginBottom: 8,
    borderRadius: 18,
  },
  activeNav: { backgroundColor: "rgba(255,255,255,0.09)" },
  navLabel: {
    fontFamily: fonts.medium,
    fontSize: 9,
    letterSpacing: 0.4,
    color: palette.muted,
  },
  navGlow: {
    position: "absolute",
    bottom: 1,
    height: 2,
    width: 15,
    borderRadius: 2,
    backgroundColor: palette.cyan,
  },
  toast: {
    position: "absolute",
    bottom: 160,
    left: 24,
    right: 24,
    padding: 16,
    maxWidth: 520,
    alignSelf: "center",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(66,226,244,0.3)",
    backgroundColor: "#242237",
  },
  toastText: {
    fontFamily: fonts.medium,
    color: palette.text,
    fontSize: 12,
    lineHeight: 20,
  },
  loading: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: palette.bg,
    alignItems: "center",
    justifyContent: "center",
  },
});
