import React, { useEffect, useRef, useState } from "react";
import { Image, Pressable, StyleSheet, Switch, Text, View } from "react-native";
import Slider from "../components/AudioSlider";
import { LinearGradient } from "expo-linear-gradient";
import type { AudioSettings, AudioSnapshot, MusicTrack } from "../types";
import { fonts, palette } from "../theme";
import { Badge, Button, Glass, Icon, Pill, u } from "../ui";

export type AutoMixScreenProps = {
  settings: AudioSettings;
  onChange: (settings: AudioSettings) => void;
  onAudition: () => void;
  canAudition: boolean;
  engineKind: "native" | "expo" | "web";
  current?: MusicTrack;
  next?: MusicTrack;
  transition?: AudioSnapshot["transition"];
};

// Keep the last enabled duration when this tab is unmounted and opened again.
let rememberedCrossfadeSeconds = 6;

function TrackPreview({
  track,
  incoming = false,
}: {
  track?: MusicTrack;
  incoming?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [track?.artwork]);
  return (
    <View style={s.preview}>
      <View style={s.previewArt}>
        {track?.artwork && !failed ? (
          <Image
            source={{ uri: track.artwork }}
            style={StyleSheet.absoluteFill}
            onError={() => setFailed(true)}
          />
        ) : (
          <Icon
            name="musical-note-outline"
            color={incoming ? palette.cyan : palette.pink}
            size={19}
          />
        )}
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <Text
          style={[
            u.eyebrow,
            { fontSize: 8, color: incoming ? palette.cyan : palette.pink },
          ]}
        >
          {incoming ? "INCOMING" : "OUTGOING"}
        </Text>
        <Text style={s.previewTitle} numberOfLines={1}>
          {track?.title ?? (incoming ? "Your next song" : "Choose a song")}
        </Text>
        <Text style={s.previewArtist} numberOfLines={1}>
          {track?.artist ??
            (incoming ? "Waiting in the queue" : "Find your starting point")}
        </Text>
      </View>
    </View>
  );
}

function RangeRow({
  label,
  value,
  max,
  onChange,
  disabled = false,
  description,
}: {
  label: string;
  value: number;
  max: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  description?: string;
}) {
  const [display, setDisplay] = useState(value);
  useEffect(() => setDisplay(value), [value]);
  return (
    <View style={s.rangeRow}>
      <View style={[u.row, { justifyContent: "space-between", gap: 12 }]}>
        <Text style={s.rangeTitle}>{label}</Text>
        <Text style={[s.rangeValue, disabled && { opacity: 0.4 }]}>
          {display.toFixed(1)}s
        </Text>
      </View>
      <Slider
        accessibilityLabel={label}
        minimumValue={0}
        maximumValue={max}
        step={0.1}
        value={value}
        disabled={disabled}
        onValueChange={setDisplay}
        onSlidingComplete={onChange}
        minimumTrackTintColor={palette.cyan}
        maximumTrackTintColor="rgba(255,255,255,0.10)"
        thumbTintColor={palette.text}
        style={{ height: 36, marginHorizontal: -4 }}
      />
      {description && <Text style={s.rangeDescription}>{description}</Text>}
    </View>
  );
}

export function AutoMixScreen({
  settings,
  onChange,
  onAudition,
  canAudition,
  engineKind,
  current,
  next,
  transition,
}: AutoMixScreenProps) {
  const lastCrossfade = useRef(
    settings.crossfadeSeconds > 0
      ? settings.crossfadeSeconds
      : rememberedCrossfadeSeconds,
  );
  const [now, setNow] = useState(Date.now());
  const [sleepChoice, setSleepChoice] = useState<number | null>(null);
  useEffect(() => {
    if (settings.crossfadeSeconds > 0) {
      lastCrossfade.current = settings.crossfadeSeconds;
      rememberedCrossfadeSeconds = settings.crossfadeSeconds;
    }
  }, [settings.crossfadeSeconds]);
  useEffect(() => {
    if (!settings.sleepAt) return;
    const interval = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(interval);
  }, [settings.sleepAt]);
  const enabled = settings.crossfadeSeconds > 0;
  const sleepMinutes = settings.sleepAt
    ? Math.max(0, Math.ceil((settings.sleepAt - now) / 60000))
    : 0;
  const change = (patch: Partial<AudioSettings>) =>
    onChange({ ...settings, ...patch });
  const progress = transition
    ? Math.max(0, Math.min(1, transition.progress))
    : 0.5;
  const native = engineKind === "native";

  return (
    <View style={s.screen}>
      <View style={{ gap: 12 }}>
        <Badge color={native ? palette.cyan : palette.purple}>
          {native
            ? "NATIVE DUAL-PLAYER ENGINE"
            : engineKind === "web"
              ? "BROWSER PREVIEW"
              : "EXPO GO PREVIEW"}
        </Badge>
        <Text style={u.title}>AutoMix & Crossfade</Text>
        <Text style={u.body}>Let the last note become the first.</Text>
      </View>

      <Glass style={s.transitionCard}>
        <View style={[u.row, { gap: 9 }]}>
          <TrackPreview track={current} />
          <Icon name="swap-horizontal" size={18} color={palette.muted} />
          <TrackPreview track={next} incoming />
        </View>
        <View
          style={s.curveChart}
          accessibilityRole="image"
          accessibilityLabel={`${settings.curve === "equalPower" ? "Equal-power" : "Linear"} transition gain illustration`}
        >
          <LinearGradient
            colors={["rgba(156,50,150,0.13)", "rgba(24,134,153,0.12)"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={s.waveBars}>
            {Array.from({ length: 38 }, (_, index) => {
              const t = index / 37;
              const outgoing =
                settings.curve === "equalPower"
                  ? Math.cos((t * Math.PI) / 2)
                  : 1 - t;
              const incoming =
                settings.curve === "equalPower"
                  ? Math.sin((t * Math.PI) / 2)
                  : t;
              return (
                <View key={index} style={s.waveColumn}>
                  <View
                    style={{
                      width: 2,
                      height: 12 + outgoing * 88,
                      borderRadius: 2,
                      backgroundColor: palette.pink,
                      opacity: 0.65,
                    }}
                  />
                  <View
                    style={{
                      width: 2,
                      height: 12 + incoming * 88,
                      borderRadius: 2,
                      backgroundColor: palette.cyan,
                      opacity: 0.8,
                    }}
                  />
                </View>
              );
            })}
          </View>
          <View style={[s.chartNeedle, { left: `${progress * 94 + 3}%` }]}>
            <View style={s.needleDot} />
          </View>
          <View style={s.chartLabel}>
            <Text style={s.chartLabelText}>
              {transition ? "MIXING NOW" : "TRANSITION CURVE"}
            </Text>
          </View>
        </View>
        <View style={[u.row, { justifyContent: "space-between", gap: 8 }]}>
          <Text style={[u.mono, { color: palette.pink }]}>OUTRO ↓</Text>
          <Text style={[u.mono, { color: palette.text }]}>
            {enabled
              ? `${settings.crossfadeSeconds.toFixed(1)}s overlap`
              : "Track-to-track"}
          </Text>
          <Text style={[u.mono, { color: palette.cyan }]}>INTRO ↑</Text>
        </View>
        <Text style={s.chartNote}>
          Gain-envelope illustration · your songs keep their original tempo.
        </Text>
      </Glass>

      <Glass style={s.settingsCard}>
        <View style={[u.row, { justifyContent: "space-between", gap: 12 }]}>
          <View style={[u.row, { gap: 10 }]}>
            <View style={s.settingIcon}>
              <Icon name="infinite-outline" color={palette.cyan} size={21} />
            </View>
            <View>
              <Text style={s.rangeTitle}>Seamless transitions</Text>
              <Text style={s.smallNote}>Blend adjacent audio tracks</Text>
            </View>
          </View>
          <Switch
            accessibilityLabel="Enable crossfade"
            value={enabled}
            onValueChange={(value) =>
              change({ crossfadeSeconds: value ? lastCrossfade.current : 0 })
            }
            trackColor={{ false: "#373240", true: "#1596AC" }}
            thumbColor={palette.text}
          />
        </View>
        <View style={s.divider} />
        <RangeRow
          label="Crossfade duration"
          value={settings.crossfadeSeconds}
          max={12}
          disabled={!enabled}
          onChange={(value) => change({ crossfadeSeconds: value })}
        />
        <View
          style={[u.row, { justifyContent: "space-between", paddingTop: 2 }]}
        >
          <Text style={u.mono}>Tight · 1s</Text>
          <Text style={[u.mono, { color: palette.cyan }]}>Sweet spot · 6s</Text>
          <Text style={u.mono}>Ambient · 12s</Text>
        </View>
      </Glass>

      <View style={{ gap: 11 }}>
        <View style={[u.row, { justifyContent: "space-between" }]}>
          <Text style={s.sectionLabel}>THE SHAPE OF THE FADE</Text>
          <Text style={u.mono}>
            {settings.curve === "equalPower" ? "Equal power" : "Linear"}
          </Text>
        </View>
        <View style={s.curveOptions}>
          {(
            [
              {
                value: "equalPower",
                icon: "water-outline",
                title: "Smooth fade",
                subtitle: "Equal power",
              },
              {
                value: "linear",
                icon: "analytics-outline",
                title: "Even blend",
                subtitle: "Linear",
              },
            ] as const
          ).map((option) => (
            <Pressable
              key={option.value}
              accessibilityRole="button"
              accessibilityLabel={`${option.title}, ${option.subtitle}`}
              accessibilityState={{ selected: settings.curve === option.value }}
              aria-pressed={settings.curve === option.value}
              onPress={() => change({ curve: option.value })}
              style={({ pressed }) => [
                s.curveOption,
                settings.curve === option.value && s.curveOptionSelected,
                pressed && u.pressed,
              ]}
            >
              <Icon
                name={option.icon}
                color={
                  settings.curve === option.value ? palette.cyan : palette.muted
                }
                size={25}
              />
              <Text style={s.curveTitle}>{option.title}</Text>
              <Text style={u.mono}>{option.subtitle}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <Glass style={s.settingsCard}>
        <View style={[u.row, { gap: 9, marginBottom: 19 }]}>
          <Icon name="volume-medium-outline" color={palette.purple} size={23} />
          <Text style={s.rangeTitle}>A softer arrival. A gentler goodbye.</Text>
        </View>
        <RangeRow
          label="Intro fade"
          value={settings.fadeInSeconds}
          max={3}
          onChange={(value) => change({ fadeInSeconds: value })}
          description="Ease into playback instead of starting at full volume."
        />
        <View style={s.divider} />
        <RangeRow
          label="Outro fade"
          value={settings.fadeOutSeconds}
          max={3}
          onChange={(value) => change({ fadeOutSeconds: value })}
          description="Soften the end of the final song in your queue."
        />
      </Glass>

      <Glass style={s.settingsCard}>
        <View
          style={[u.row, { justifyContent: "space-between", marginBottom: 15 }]}
        >
          <View style={[u.row, { gap: 9 }]}>
            <Icon name="moon-outline" color={palette.purple} size={20} />
            <Text style={s.rangeTitle}>Drift off</Text>
          </View>
          <Text
            style={[
              u.mono,
              { color: sleepMinutes ? palette.cyan : palette.muted },
            ]}
          >
            {sleepMinutes ? `${sleepMinutes} min left` : "Sleep timer off"}
          </Text>
        </View>
        <View style={{ flexDirection: "row", gap: 7, flexWrap: "wrap" }}>
          {[0, 15, 30, 60].map((minutes) => (
            <Pill
              key={minutes}
              active={
                minutes === 0
                  ? sleepMinutes === 0
                  : sleepMinutes > 0 && sleepChoice === minutes
              }
              onPress={() => {
                setNow(Date.now());
                setSleepChoice(minutes);
                change({
                  sleepAt: minutes ? Date.now() + minutes * 60000 : null,
                });
              }}
            >
              {minutes ? `${minutes} min` : "Off"}
            </Pill>
          ))}
        </View>
      </Glass>

      <View style={{ gap: 11 }}>
        <Button
          onPress={onAudition}
          gradient
          icon="play-circle-outline"
          disabled={!canAudition || !enabled}
        >
          Audition transition
          {enabled ? ` · ${settings.crossfadeSeconds.toFixed(1)}s` : ""}
        </Button>
        <Text style={[u.body, { textAlign: "center", fontSize: 11 }]}>
          {canAudition
            ? "Jump near the end of the current song and hear the next one come in."
            : "Queue at least two audio songs to try your transition."}
        </Text>
      </View>

      <View style={s.engineNote}>
        <Icon
          name={
            native ? "phone-portrait-outline" : "information-circle-outline"
          }
          size={19}
          color={palette.cyan}
        />
        <Text style={s.engineNoteText}>
          {native
            ? "The native engine handles the queue, fades and remote controls without JavaScript timers. Lock-screen behavior still needs a physical iPhone check."
            : "This is a listening preview. An installed iOS build enables the native engine for lock-screen audio and background transitions."}
        </Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { gap: 24 },
  transitionCard: {
    padding: 18,
    gap: 16,
    borderRadius: 30,
    backgroundColor: "rgba(61,30,65,0.28)",
  },
  preview: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    flex: 1,
    minWidth: 0,
  },
  previewArt: {
    width: 42,
    height: 42,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  previewTitle: {
    fontFamily: fonts.semibold,
    color: palette.text,
    fontSize: 11,
  },
  previewArtist: {
    fontFamily: fonts.regular,
    color: palette.muted,
    fontSize: 9,
  },
  curveChart: {
    height: 156,
    borderRadius: 18,
    backgroundColor: "#0B0912",
    overflow: "hidden",
    paddingHorizontal: 12,
    paddingTop: 24,
    paddingBottom: 14,
  },
  waveBars: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  waveColumn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 1,
    height: 105,
  },
  chartNeedle: {
    position: "absolute",
    top: 32,
    bottom: 13,
    width: 1,
    backgroundColor: "rgba(255,255,255,0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  needleDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: palette.text,
    borderWidth: 2,
    borderColor: "#C7F9FF",
  },
  chartLabel: {
    position: "absolute",
    top: 10,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  chartLabelText: {
    fontFamily: fonts.mono,
    fontSize: 8,
    color: palette.muted,
    letterSpacing: 1.3,
  },
  chartNote: {
    fontFamily: fonts.regular,
    color: palette.muted,
    fontSize: 10,
    lineHeight: 16,
    textAlign: "center",
    marginTop: -7,
  },
  settingsCard: { padding: 20, gap: 0 },
  settingIcon: {
    height: 36,
    width: 36,
    borderRadius: 14,
    backgroundColor: "rgba(66,226,244,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  rangeRow: { gap: 2 },
  rangeTitle: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    color: palette.text,
    flexShrink: 1,
    lineHeight: 19,
  },
  rangeValue: {
    fontFamily: fonts.mono,
    fontSize: 12,
    color: palette.cyan,
    backgroundColor: "rgba(66,226,244,0.08)",
    borderRadius: 13,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  rangeDescription: {
    fontFamily: fonts.regular,
    fontSize: 10,
    color: palette.muted,
    lineHeight: 17,
    marginTop: 1,
  },
  smallNote: {
    fontFamily: fonts.regular,
    fontSize: 10,
    color: palette.muted,
    marginTop: 3,
  },
  divider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.07)",
    marginVertical: 18,
  },
  sectionLabel: {
    fontFamily: fonts.semibold,
    fontSize: 10,
    color: palette.muted,
    letterSpacing: 1.2,
  },
  curveOptions: { flexDirection: "row", gap: 12 },
  curveOption: {
    flex: 1,
    minHeight: 113,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.04)",
    backgroundColor: "rgba(255,255,255,0.035)",
  },
  curveOptionSelected: {
    borderColor: "rgba(66,226,244,0.25)",
    backgroundColor: "rgba(255,255,255,0.10)",
  },
  curveTitle: { fontFamily: fonts.semibold, fontSize: 12, color: palette.text },
  engineNote: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 3,
    paddingBottom: 8,
  },
  engineNoteText: {
    flex: 1,
    fontFamily: fonts.regular,
    color: palette.muted,
    fontSize: 10,
    lineHeight: 18,
  },
});
