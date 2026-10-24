import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { createMusicEngine } from "../audio";
import {
  defaultLibrary,
  getTrending,
  loadLibrary,
  mergeTracks,
  saveLibrary,
  toAudioItem,
} from "../data";
import { importAudioFiles, importLyricsFile } from "../imports";
import { fetchSyncedLyrics, SyncedLyricsResult } from "../data/lyrics";
import {
  AudioSettings,
  AudioSnapshot,
  emptySnapshot,
  LibraryData,
  MusicTrack,
} from "../types";

export function useMusicApp() {
  const [library, setLibrary] = useState<LibraryData>(defaultLibrary);
  const libraryRef = useRef(library);
  libraryRef.current = library;
  const [hydrated, setHydrated] = useState(false);
  const [engine] = useState(createMusicEngine);
  const [snapshot, setSnapshot] = useState<AudioSnapshot>(emptySnapshot);
  const [queue, setQueue] = useState<MusicTrack[]>([]);
  const [trending, setTrending] = useState<MusicTrack[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [catalogError, setCatalogError] = useState("");
  const [genre, setGenre] = useState("All");
  const [refresh, setRefresh] = useState(0);
  const [notice, setNotice] = useState("");
  const [playerOpen, setPlayerOpen] = useState(false);
  const [video, setVideo] = useState<MusicTrack | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [busyImport, setBusyImport] = useState(false);
  const [remoteLyrics, setRemoteLyrics] = useState<
    Record<string, SyncedLyricsResult | null>
  >({});
  const [lyricsStatus, setLyricsStatus] = useState("");
  const hydratedRef = useRef(false);
  const lyricsImportBusy = useRef(false);
  const saveChain = useRef(Promise.resolve());
  const playRequest = useRef(0);
  const lastHistoryId = useRef<string | null>(null);
  const current = queue.find((track) => track.id === snapshot.activeId) ?? null;
  const currentIndex = queue.findIndex(
    (track) => track.id === snapshot.activeId,
  );
  const next =
    queue[currentIndex + 1] ??
    (library.audioSettings.repeat === "all" ? queue[0] : undefined);
  const importedLyrics = current ? (library.lyrics[current.id] ?? "") : "";

  useEffect(() => {
    let mounted = true;
    loadLibrary()
      .then((value) => {
        if (mounted) {
          hydratedRef.current = true;
          setLibrary(value);
        }
      })
      .catch(() => {
        if (mounted)
          setNotice(
            "Your saved library could not be read. Changes will stay in this session; reopen the app to retry.",
          );
      })
      .finally(() => {
        if (mounted) {
          setHydrated(true);
        }
      });
    const unsubscribe = engine.subscribe((value) => {
      if (mounted) setSnapshot(value);
    });
    return () => {
      mounted = false;
      unsubscribe();
      engine.dispose();
    };
  }, [engine]);

  useEffect(() => {
    if (!hydrated || !hydratedRef.current) return;
    const timer = setTimeout(() => {
      saveChain.current = saveChain.current
        .catch(() => {})
        .then(() => saveLibrary(library))
        .catch(() =>
          setNotice(
            "Could not save the latest library changes on this device.",
          ),
        );
    }, 300);
    return () => clearTimeout(timer);
  }, [library, hydrated]);
  useEffect(() => {
    if (hydrated)
      engine
        .setSettings(library.audioSettings)
        .catch((error) => setNotice(friendly(error)));
  }, [engine, library.audioSettings, hydrated]);
  useEffect(() => {
    const controller = new AbortController();
    setLoadingCatalog(true);
    setCatalogError("");
    getTrending(genre === "All" ? undefined : genre, controller.signal)
      .then((tracks) => {
        if (!controller.signal.aborted) setTrending(tracks);
      })
      .catch((error) => {
        if (!controller.signal.aborted) setCatalogError(friendly(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingCatalog(false);
      });
    return () => controller.abort();
  }, [genre, refresh]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 7000);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    const track = queue.find((item) => item.id === snapshot.activeId);
    if (!track || lastHistoryId.current === track.id) return;
    lastHistoryId.current = track.id;
    setLibrary((previous) => ({
      ...previous,
      tracks: mergeTracks(previous.tracks, [track]),
      recentIds: [
        track.id,
        ...previous.recentIds.filter((id) => id !== track.id),
      ].slice(0, 50),
    }));
  }, [snapshot.activeId, queue]);
  useEffect(() => {
    if (!current || importedLyrics || current.source !== "audius") {
      setLyricsStatus("");
      return;
    }
    const track = current;
    const controller = new AbortController();
    setLyricsStatus("Looking for synchronized lyrics…");
    fetchSyncedLyrics(
      { ...track, duration: track.duration || snapshot.duration },
      controller.signal,
    )
      .then((result) => {
        if (controller.signal.aborted) return;
        setRemoteLyrics((previous) => ({ ...previous, [track.id]: result }));
        setLyricsStatus(
          result
            ? ""
            : "No matching timed lyrics found. You can add a .lrc file.",
        );
      })
      .catch((error) => {
        if (!controller.signal.aborted) setLyricsStatus(friendly(error));
      });
    return () => controller.abort();
  }, [
    current?.id,
    current?.title,
    current?.artist,
    current?.duration,
    importedLyrics,
  ]);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active" && hydratedRef.current) {
        // Keep legitimate native audio playing; only persist UI/library state here.
        saveChain.current = saveChain.current
          .catch(() => {})
          .then(() => saveLibrary(libraryRef.current))
          .catch(() => {});
      }
    });
    return () => subscription.remove();
  }, []);

  const run = useCallback((promise: Promise<unknown>) => {
    void promise.catch((error) => setNotice(friendly(error)));
  }, []);
  async function playTrack(track: MusicTrack, list: MusicTrack[] = [track]) {
    const request = ++playRequest.current;
    setLibrary((previous) => ({
      ...previous,
      tracks: mergeTracks(
        previous.tracks,
        list.includes(track) ? list : [track, ...list],
      ),
    }));
    if (track.source === "youtube") {
      await engine.pause();
      if (request === playRequest.current) setVideo(track);
      return;
    }
    setVideo(null);
    const audioTracks = list.filter(
      (item) => item.source !== "youtube" && item.streamUrl,
    );
    const items = audioTracks.some((item) => item.id === track.id)
      ? audioTracks
      : [track, ...audioTracks];
    setQueue(items);
    setPlayerOpen(true);
    await engine.setQueue(
      items.map(toAudioItem),
      Math.max(
        0,
        items.findIndex((item) => item.id === track.id),
      ),
      libraryRef.current.audioSettings,
    );
    if (request === playRequest.current) await engine.play();
  }
  function toggleFavorite(track: MusicTrack) {
    setLibrary((previous) => ({
      ...previous,
      tracks: mergeTracks(previous.tracks, [track]),
      favoriteIds: previous.favoriteIds.includes(track.id)
        ? previous.favoriteIds.filter((id) => id !== track.id)
        : [track.id, ...previous.favoriteIds],
    }));
  }
  function setAudioSettings(value: AudioSettings) {
    setLibrary((previous) => ({ ...previous, audioSettings: value }));
  }
  async function importMusic() {
    if (busyImport) return;
    setBusyImport(true);
    try {
      const tracks = await importAudioFiles();
      if (tracks.length) {
        setLibrary((previous) => ({
          ...previous,
          tracks: mergeTracks(previous.tracks, tracks),
        }));
        setNotice(
          `${tracks.length} ${tracks.length === 1 ? "song added" : "songs added"} to your library${engine.kind === "web" ? " for this browser session" : ""}.`,
        );
      }
    } finally {
      setBusyImport(false);
    }
  }
  async function importLyrics(track: MusicTrack) {
    if (lyricsImportBusy.current) return;
    lyricsImportBusy.current = true;
    try {
      const text = await importLyricsFile();
      if (!text) return;
      setLibrary((previous) => ({
        ...previous,
        tracks: mergeTracks(previous.tracks, [track]),
        lyrics: { ...previous.lyrics, [track.id]: text },
      }));
      setNotice("Timed lyrics added. Tap a line to seek.");
    } finally {
      lyricsImportBusy.current = false;
    }
  }
  async function audition() {
    if (!current || !next || !snapshot.duration)
      throw new Error(
        "Play a mix with at least two songs to try the transition.",
      );
    await engine.seek(
      Math.max(
        0,
        snapshot.duration -
          Math.max(1, libraryRef.current.audioSettings.crossfadeSeconds) -
          2,
      ),
    );
    await engine.play();
  }
  return {
    library,
    setLibrary,
    hydrated,
    engine,
    snapshot,
    queue,
    current,
    next,
    trending,
    loadingCatalog,
    catalogError,
    genre,
    setGenre,
    refreshCatalog: () => setRefresh((value) => value + 1),
    notice,
    setNotice,
    playerOpen,
    setPlayerOpen,
    video,
    setVideo,
    settingsOpen,
    setSettingsOpen,
    run,
    playTrack,
    toggleFavorite,
    setAudioSettings,
    importMusic,
    importLyrics,
    busyImport,
    audition,
    lyricsStatus,
    currentLyrics:
      importedLyrics ||
      (current ? (remoteLyrics[current.id]?.syncedLyrics ?? "") : ""),
    lyricsSource:
      !importedLyrics && current
        ? remoteLyrics[current.id]?.sourceUrl
        : undefined,
  };
}

function friendly(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "That could not finish. Please try again.";
}
