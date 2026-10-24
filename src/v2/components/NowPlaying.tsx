import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Slider from "./AudioSlider";
import { AudioSettings, AudioSnapshot, MusicTrack } from "../types";
import { fonts, palette } from "../theme";
import { Badge, Glass, Icon, RoundButton, u } from "../ui";
import { Artwork } from "./Artwork";
import { Ambient } from "./Ambient";
import { RouteButton } from "./RouteButton";
import { TrackRow } from "./TrackRow";
import { TimedLyrics } from "./TimedLyrics";
import { formatTime } from "../../lib/music";

type Props = {
  visible: boolean;
  track: MusicTrack | null;
  queue: MusicTrack[];
  snapshot: AudioSnapshot;
  settings: AudioSettings;
  engineKind: "native" | "expo" | "web";
  liked: boolean;
  favoriteIds: string[];
  lyrics: string;
  notice: string;
  lyricsStatus?: string;
  lyricsSource?: string;
  onClose: () => void;
  onToggle: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onSeek: (seconds: number) => void;
  onFavorite: (track: MusicTrack) => void;
  onRepeat: () => void;
  onAutoMix: () => void;
  onImportLyrics: () => void;
  onPlay: (track: MusicTrack, list: MusicTrack[]) => void;
  onShare: () => void;
  onSource: () => void;
  onOutput: () => void;
};

export function NowPlaying(props: Props) {
  const { width, height } = useWindowDimensions();
  const [panel, setPanel] = useState<"lyrics" | "queue">("lyrics");
  const [scrubbing, setScrubbing] = useState(false);
  const [seekValue, setSeekValue] = useState(0);
  const scale = useRef(new Animated.Value(0.96)).current;
  const { track, snapshot, settings } = props;
  useEffect(() => {
    Animated.spring(scale, {
      toValue: snapshot.playing ? 1 : 0.96,
      useNativeDriver: true,
      friction: 12,
    }).start();
  }, [snapshot.playing, scale]);
  const cover = Math.min(width - 96, height < 750 ? 210 : 310);
  if (!track) return null;
  return (
    <Modal
      visible={props.visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={props.onClose}
    >
      <View style={s.root}>
        <Ambient artwork={track.artwork} />
        <SafeAreaView style={{ flex: 1 }}>
          <View style={s.top}>
            <RoundButton
              icon="chevron-down"
              label="Collapse player"
              onPress={props.onClose}
            />
            <View style={{ alignItems: "center", gap: 3 }}>
              <Text style={u.eyebrow}>IN YOUR ELEMENT</Text>
              <Text style={u.mono}>
                {track.source === "local"
                  ? "YOUR PERSONAL COLLECTION"
                  : "PLAYING FROM AUDIUS"}
              </Text>
            </View>
            <RoundButton
              icon="ellipsis-horizontal"
              label="Share current song"
              onPress={props.onShare}
            />
          </View>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={s.content}
          >
            <View style={s.coverStage}>
              <Animated.View style={{ transform: [{ scale }] }}>
                <Artwork
                  uri={track.artwork}
                  style={{ width: cover, height: cover, borderRadius: 30 }}
                />
              </Animated.View>
              <View style={{ marginTop: 16 }}>
                <Badge color={palette.cyan}>
                  {snapshot.transition
                    ? "BLENDING INTO YOUR NEXT SONG"
                    : track.source === "local"
                      ? "ON YOUR DEVICE"
                      : "AUDIUS · FREE MUSIC"}
                </Badge>
              </View>
            </View>
            <View
              style={[
                u.row,
                { justifyContent: "space-between", gap: 12, marginTop: 20 },
              ]}
            >
              <View style={{ flex: 1 }}>
                <Text numberOfLines={2} style={s.title}>
                  {track.title}
                </Text>
                <Pressable
                  accessibilityRole="link"
                  accessibilityLabel="Open original song page"
                  onPress={props.onSource}
                  style={{ alignSelf: "flex-start" }}
                >
                  <Text numberOfLines={1} style={s.artist}>
                    {track.artist}
                    {track.permalink ? " ↗" : ""}
                  </Text>
                </Pressable>
              </View>
              <RoundButton
                icon={props.liked ? "heart" : "heart-outline"}
                label={
                  props.liked ? "Unsave current song" : "Save current song"
                }
                active={props.liked}
                onPress={() => props.onFavorite(track)}
              />
            </View>
            <View style={{ paddingTop: 18 }}>
              <Slider
                accessibilityLabel="Playback position"
                minimumValue={0}
                maximumValue={Math.max(1, snapshot.duration)}
                value={scrubbing ? seekValue : snapshot.position}
                disabled={!snapshot.duration}
                minimumTrackTintColor={palette.cyan}
                maximumTrackTintColor="rgba(255,255,255,0.14)"
                thumbTintColor={palette.text}
                onSlidingStart={(value) => {
                  setScrubbing(true);
                  setSeekValue(value);
                }}
                onValueChange={setSeekValue}
                onSlidingComplete={(value) => {
                  props.onSeek(value);
                  setScrubbing(false);
                }}
              />
              <View
                style={[
                  u.row,
                  { justifyContent: "space-between", marginTop: 2 },
                ]}
              >
                <Text style={u.mono}>
                  {formatTime(scrubbing ? seekValue : snapshot.position)}
                </Text>
                <Text style={u.mono}>
                  {snapshot.duration
                    ? `−${formatTime(Math.max(0, snapshot.duration - (scrubbing ? seekValue : snapshot.position)))}`
                    : "—:—"}
                </Text>
              </View>
            </View>
            <View style={s.controls}>
              <RoundButton
                icon="repeat"
                label={`Repeat ${settings.repeat}`}
                active={settings.repeat !== "off"}
                onPress={props.onRepeat}
              />
              <RoundButton
                icon="play-skip-back"
                label="Previous song"
                onPress={props.onPrevious}
              />
              <RoundButton
                icon={snapshot.playing ? "pause" : "play"}
                label={snapshot.playing ? "Pause song" : "Play song"}
                filled
                size={72}
                onPress={props.onToggle}
              />
              <RoundButton
                icon="play-skip-forward"
                label="Next song"
                onPress={props.onNext}
              />
              <RouteButton
                native={props.engineKind === "native"}
                onFallback={props.onOutput}
              />
            </View>
            <View
              style={[
                u.row,
                { justifyContent: "center", gap: 12, marginBottom: 18 },
              ]}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Open AutoMix settings"
                onPress={props.onAutoMix}
              >
                <Badge color={palette.purple}>
                  {settings.crossfadeSeconds
                    ? `${settings.crossfadeSeconds.toFixed(1)}s CROSSFADE`
                    : "CROSSFADE OFF"}
                </Badge>
              </Pressable>
              <Text style={u.mono}>
                {snapshot.buffering
                  ? "BUFFERING…"
                  : settings.repeat === "one"
                    ? "REPEAT ONE"
                    : props.engineKind === "native"
                      ? "NATIVE AUDIO"
                      : "PREVIEW PLAYER"}
              </Text>
            </View>
            {!!snapshot.error && (
              <Text accessibilityRole="alert" style={s.error}>
                {snapshot.error}
              </Text>
            )}
            {!!props.notice && (
              <Text accessibilityRole="alert" style={s.notice}>
                {props.notice}
              </Text>
            )}
            <Glass style={{ padding: 18 }}>
              <View style={[u.row, { gap: 20, marginBottom: 8 }]}>
                {(["lyrics", "queue"] as const).map((value) => (
                  <Pressable
                    key={value}
                    accessibilityRole="tab"
                    accessibilityLabel={
                      value === "lyrics" ? "Lyrics" : "Up next"
                    }
                    aria-selected={panel === value}
                    onPress={() => setPanel(value)}
                    style={s.panelTab}
                  >
                    <Text
                      style={[
                        s.panelText,
                        panel === value && { color: palette.text },
                      ]}
                    >
                      {value === "lyrics" ? "Lyrics" : "Up next"}
                    </Text>
                    {panel === value && <View style={s.activeTab} />}
                  </Pressable>
                ))}
              </View>
              {panel === "lyrics" ? (
                <TimedLyrics
                  text={props.lyrics}
                  position={snapshot.position}
                  onSeek={props.onSeek}
                  onImport={props.onImportLyrics}
                  lookupStatus={props.lyricsStatus}
                  sourceUrl={props.lyricsSource}
                />
              ) : (
                <View>
                  {props.queue.map((item) => (
                    <TrackRow
                      key={item.id}
                      track={item}
                      active={item.id === track.id}
                      liked={props.favoriteIds.includes(item.id)}
                      onPlay={() => props.onPlay(item, props.queue)}
                      onFavorite={() => props.onFavorite(item)}
                    />
                  ))}
                </View>
              )}
            </Glass>
            <Text
              style={[u.mono, { textAlign: "center", paddingVertical: 24 }]}
            >
              {props.engineKind === "native"
                ? "CLOSE THE PLAYER. KEEP THE FEELING."
                : "NATIVE BACKGROUND FEATURES REQUIRE AN INSTALLED IOS BUILD."}
            </Text>
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.bg },
  top: {
    width: "100%",
    maxWidth: 600,
    alignSelf: "center",
    paddingHorizontal: 20,
    height: 65,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  content: {
    paddingHorizontal: 28,
    paddingTop: 12,
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
    paddingBottom: 15,
  },
  coverStage: { alignItems: "center", paddingTop: 5 },
  title: {
    fontFamily: fonts.bold,
    fontSize: 27,
    lineHeight: 34,
    letterSpacing: -0.9,
    color: palette.text,
  },
  artist: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: palette.muted,
    marginTop: 8,
  },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 22,
    gap: 8,
  },
  panelTab: { minHeight: 44, justifyContent: "center" },
  panelText: { fontFamily: fonts.bold, color: palette.soft, fontSize: 16 },
  activeTab: {
    position: "absolute",
    left: 0,
    bottom: 1,
    width: 20,
    height: 2,
    borderRadius: 2,
    backgroundColor: palette.cyan,
  },
  notice: {
    fontFamily: fonts.medium,
    color: palette.cyan,
    fontSize: 12,
    lineHeight: 19,
    paddingBottom: 16,
  },
  error: {
    fontFamily: fonts.medium,
    color: "#FFB6AE",
    fontSize: 12,
    lineHeight: 20,
    paddingBottom: 16,
  },
});
