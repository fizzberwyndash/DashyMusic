import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { TrackRow } from "../components/TrackRow";
import {
  externalProviderSearchUrl,
  searchAudius,
  searchYouTube,
  youtubeShortcuts,
} from "../data";
import { fonts, palette } from "../theme";
import type { MusicTrack } from "../types";
import { Badge, Button, Glass, Glyph, Icon, u } from "../ui";

type Provider = "audius" | "youtube" | "spotify" | "soundcloud";
type SearchableProvider = "audius" | "youtube";

const sources: {
  id: Provider;
  label: string;
  icon: Glyph;
  color: string;
  external?: boolean;
}[] = [
  { id: "audius", label: "Audius", icon: "radio-outline", color: palette.cyan },
  { id: "youtube", label: "YouTube", icon: "logo-youtube", color: "#FF8588" },
  {
    id: "spotify",
    label: "Spotify",
    icon: "musical-notes-outline",
    color: "#69DE9A",
    external: true,
  },
  {
    id: "soundcloud",
    label: "SoundCloud",
    icon: "cloud-outline",
    color: "#FFAC75",
    external: true,
  },
];

export type SearchScreenProps = {
  trending: MusicTrack[];
  favoriteIds: string[];
  activeId: string | null;
  youtubeKey: string;
  onPlay: (track: MusicTrack, list: MusicTrack[]) => void;
  onFavorite: (track: MusicTrack) => void;
  onSettings: () => void;
  onError: (message: string) => void;
};

export function SearchScreen(props: SearchScreenProps) {
  const [provider, setProvider] = useState<Provider>("audius");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MusicTrack[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const generation = useRef(0);
  const callbacks = useRef(props);
  callbacks.current = props;

  const invalidate = useCallback(() => {
    generation.current += 1;
    request.current?.abort();
    request.current = null;
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = null;
  }, []);

  const search = useCallback(
    async (source: SearchableProvider, term: string, announce: boolean) => {
      if (!term.trim()) return;
      invalidate();
      const version = generation.current;
      const controller = new AbortController();
      request.current = controller;
      setLoading(true);
      setError("");
      setResults(null);
      try {
        const tracks =
          source === "audius"
            ? await searchAudius(term, controller.signal)
            : await searchYouTube(
                term,
                callbacks.current.youtubeKey,
                controller.signal,
              );
        if (!controller.signal.aborted && generation.current === version)
          setResults(tracks);
      } catch (failure) {
        if (controller.signal.aborted || generation.current !== version) return;
        const message =
          failure instanceof Error
            ? failure.message
            : "Search could not finish. Please try again.";
        setError(message);
        if (announce) callbacks.current.onError(message);
      } finally {
        if (!controller.signal.aborted && generation.current === version) {
          request.current = null;
          setLoading(false);
        }
      }
    },
    [invalidate],
  );

  useEffect(() => {
    invalidate();
    setLoading(false);
    setError("");
    setResults(null);
    const term = query.trim();
    if (provider === "audius" && term.length >= 2) {
      debounce.current = setTimeout(() => {
        debounce.current = null;
        void search("audius", term, false);
      }, 500);
    }
    return invalidate;
  }, [query, provider, props.youtubeKey, invalidate, search]);

  useEffect(() => () => invalidate(), [invalidate]);

  function changeProvider(source: Provider) {
    if (source === provider) return;
    invalidate();
    setLoading(false);
    setError("");
    setResults(null);
    setProvider(source);
  }

  function changeQuery(value: string) {
    invalidate();
    setLoading(false);
    setError("");
    setResults(null);
    setQuery(value);
  }

  async function openExternal() {
    if ((provider !== "spotify" && provider !== "soundcloud") || !query.trim())
      return;
    Keyboard.dismiss();
    try {
      await Linking.openURL(externalProviderSearchUrl(provider, query));
    } catch {
      props.onError(
        `Could not open ${provider === "spotify" ? "Spotify" : "SoundCloud"}. Please try again.`,
      );
    }
  }

  function submit() {
    Keyboard.dismiss();
    if (provider === "spotify" || provider === "soundcloud")
      void openExternal();
    else void search(provider, query.trim(), true);
  }

  const selectedSource = sources.find((item) => item.id === provider)!;
  const external = provider === "spotify" || provider === "soundcloud";
  const tracks =
    results ?? (provider === "youtube" ? youtubeShortcuts : props.trending);
  const resultsTitle = results
    ? "Search results"
    : provider === "youtube"
      ? "A few familiar favorites"
      : "Fresh from the charts";

  return (
    <View style={styles.screen}>
      <View style={{ gap: 8, marginBottom: 23 }}>
        <Text style={u.eyebrow}>FOLLOW THE FREQUENCY</Text>
        <Text style={u.title}>Find your next feeling.</Text>
        <Text style={u.body}>
          A new artist. An old favorite. Your next repeat.
        </Text>
      </View>

      <Glass strong style={styles.searchBox}>
        <Icon name="search-outline" size={21} color={palette.muted} />
        <TextInput
          accessibilityLabel="Search music"
          value={query}
          onChangeText={changeQuery}
          onSubmitEditing={submit}
          placeholder={
            provider === "youtube"
              ? "Song, artist, or YouTube link"
              : "Songs, artists, and new favorites"
          }
          placeholderTextColor="#8C879E"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          clearButtonMode="while-editing"
          maxLength={2048}
          style={styles.input}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Submit search"
          onPress={submit}
          disabled={!query.trim()}
          style={({ pressed }) => [
            styles.submit,
            pressed && u.pressed,
            !query.trim() && { opacity: 0.45 },
          ]}
        >
          {loading ? (
            <ActivityIndicator size="small" color={palette.bg} />
          ) : (
            <Icon
              name={external ? "open-outline" : "arrow-forward"}
              color={palette.bg}
              size={19}
            />
          )}
        </Pressable>
      </Glass>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        style={{ marginTop: 14 }}
        contentContainerStyle={{ gap: 8, paddingBottom: 6 }}
      >
        {sources.map((item) => (
          <Pressable
            key={item.id}
            accessibilityRole="button"
            accessibilityLabel={
              item.external ? `${item.label} external search` : item.label
            }
            accessibilityState={{ selected: provider === item.id }}
            aria-pressed={provider === item.id}
            onPress={() => changeProvider(item.id)}
            style={({ pressed }) => [
              styles.source,
              provider === item.id && styles.selectedSource,
              pressed && u.pressed,
            ]}
          >
            <Icon
              name={item.icon}
              size={16}
              color={provider === item.id ? palette.bg : item.color}
            />
            <Text
              style={[
                styles.sourceText,
                provider === item.id && { color: palette.bg },
              ]}
            >
              {item.label}
            </Text>
            {item.external && (
              <Icon
                name="open-outline"
                size={12}
                color={provider === item.id ? palette.bg : palette.muted}
              />
            )}
          </Pressable>
        ))}
      </ScrollView>

      {provider === "audius" && (
        <View style={styles.catalogNote}>
          <View style={styles.statusDot} />
          <Text style={[u.mono, { flex: 1 }]}>
            Free discovery · Independent artists on Audius
          </Text>
        </View>
      )}

      {provider === "youtube" && (
        <Glass style={styles.providerNote}>
          <View style={[u.row, { gap: 8 }]}>
            <Icon name="logo-youtube" size={18} color="#FF8588" />
            <Text style={styles.noteTitle}>Your video favorites, too.</Text>
          </View>
          <Text style={[u.body, { fontSize: 12 }]}>
            {props.youtubeKey
              ? "Search YouTube music videos or paste a video link. Videos play in the visible YouTube player."
              : "Paste a YouTube video link to play it. For song and artist search, add a YouTube Data API key in Settings."}
          </Text>
          {!props.youtubeKey && (
            <Button secondary icon="key-outline" onPress={props.onSettings}>
              Set up YouTube search
            </Button>
          )}
          <Text style={u.mono}>
            YouTube captions stay in the video. Background audio and AutoMix use
            your audio library.
          </Text>
        </Glass>
      )}

      {external ? (
        <Glass style={styles.externalCard}>
          <View
            style={[
              styles.sourceOrb,
              {
                backgroundColor:
                  provider === "spotify"
                    ? "rgba(105,222,154,0.10)"
                    : "rgba(255,172,117,0.10)",
              },
            ]}
          >
            <Icon
              name={selectedSource.icon}
              size={31}
              color={selectedSource.color}
            />
          </View>
          <Badge color={selectedSource.color}>EXTERNAL SEARCH</Badge>
          <Text style={[u.heading, { textAlign: "center" }]}>
            Keep exploring on {selectedSource.label}.
          </Text>
          <Text style={[u.body, { textAlign: "center" }]}>
            Enter a song or artist above, then open the results in{" "}
            {selectedSource.label}. Playback happens in their service and
            follows your account’s access.
          </Text>
          <View style={{ alignSelf: "stretch", marginTop: 5 }}>
            <Button
              icon="open-outline"
              gradient
              onPress={() => void openExternal()}
              disabled={!query.trim()}
            >
              Search on {selectedSource.label}
            </Button>
          </View>
          <Text style={[u.mono, { textAlign: "center" }]}>
            Audius and imported songs play directly in DashyMusic. These service
            links do not connect or sync an account.
          </Text>
        </Glass>
      ) : (
        <>
          {!!error && (
            <Glass style={styles.errorCard}>
              <View style={[u.row, { gap: 9 }]}>
                <Icon name="cloud-offline-outline" size={22} color="#FFB4AB" />
                <Text style={styles.errorTitle}>A moment of silence.</Text>
              </View>
              <Text
                accessibilityRole="alert"
                accessibilityLiveRegion="polite"
                style={[u.body, { color: "#E6BEBB" }]}
              >
                {error}
              </Text>
              <View style={{ alignSelf: "flex-start" }}>
                <Button secondary icon="refresh-outline" onPress={submit}>
                  Try again
                </Button>
              </View>
            </Glass>
          )}

          <View style={styles.sectionHeader}>
            <Text style={[u.heading, { flex: 1 }]}>
              {loading ? "Finding your sound…" : resultsTitle}
            </Text>
            {!loading && (
              <Text style={u.mono}>
                {tracks.length} {provider === "youtube" ? "videos" : "tracks"}
              </Text>
            )}
          </View>

          {loading ? (
            <Glass style={styles.loading}>
              <ActivityIndicator color={palette.cyan} />
              <Text style={u.body}>Searching {selectedSource.label}…</Text>
            </Glass>
          ) : results?.length === 0 ? (
            <Glass style={styles.empty}>
              <Icon name="search-outline" size={33} color={palette.cyan} />
              <Text style={u.heading}>Another frequency?</Text>
              <Text style={[u.body, { textAlign: "center" }]}>
                {provider === "audius"
                  ? "No playable tracks matched. Audius features independent artists—try a genre, another spelling, or something new."
                  : "No embeddable music videos matched. Try another song or paste a YouTube video link."}
              </Text>
            </Glass>
          ) : tracks.length ? (
            <View style={{ gap: 2 }}>
              {tracks.map((track, index) => (
                <TrackRow
                  key={track.id}
                  track={track}
                  index={index}
                  liked={props.favoriteIds.includes(track.id)}
                  active={props.activeId === track.id}
                  onPlay={() => props.onPlay(track, tracks)}
                  onFavorite={() => props.onFavorite(track)}
                />
              ))}
            </View>
          ) : (
            <Glass style={styles.empty}>
              <Icon name="radio-outline" size={32} color={palette.cyan} />
              <Text style={u.heading}>Your next listen is waiting.</Text>
              <Text style={[u.body, { textAlign: "center" }]}>
                Search for a song, artist, or genre to explore free music on
                Audius.
              </Text>
            </Glass>
          )}

          <Text style={styles.attribution}>
            {provider === "audius"
              ? "Music and artwork courtesy of artists on Audius."
              : "Videos, artwork, and captions provided by YouTube."}
          </Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { gap: 0, paddingBottom: 12 },
  searchBox: {
    minHeight: 61,
    borderRadius: 23,
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 17,
    paddingRight: 7,
    gap: 11,
  },
  input: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 16,
    color: palette.text,
    fontFamily: fonts.regular,
    fontSize: 12,
  },
  submit: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: palette.text,
    alignItems: "center",
    justifyContent: "center",
  },
  source: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.055)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  selectedSource: { backgroundColor: palette.text, borderColor: palette.text },
  sourceText: { color: palette.text, fontFamily: fonts.semibold, fontSize: 11 },
  catalogNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingVertical: 16,
  },
  statusDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: palette.green,
  },
  providerNote: { padding: 18, borderRadius: 23, marginTop: 14, gap: 12 },
  noteTitle: { fontFamily: fonts.semibold, fontSize: 13, color: palette.text },
  externalCard: {
    padding: 25,
    marginTop: 24,
    borderRadius: 30,
    alignItems: "center",
    gap: 16,
  },
  sourceOrb: {
    width: 73,
    height: 73,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  errorCard: {
    padding: 19,
    gap: 12,
    borderRadius: 24,
    marginTop: 16,
    borderColor: "rgba(255,180,171,0.16)",
  },
  errorTitle: { color: palette.text, fontFamily: fonts.semibold, fontSize: 15 },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 13,
    marginTop: 21,
    marginBottom: 12,
  },
  loading: {
    padding: 27,
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    minHeight: 150,
  },
  empty: {
    padding: 27,
    alignItems: "center",
    gap: 15,
    minHeight: 210,
    justifyContent: "center",
  },
  attribution: {
    color: palette.soft,
    fontFamily: fonts.mono,
    fontSize: 8,
    lineHeight: 16,
    textAlign: "center",
    marginTop: 25,
  },
});
