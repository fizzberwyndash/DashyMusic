import React, { useEffect, useRef } from "react";
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { activeLyricIndex, parseLRC } from "../../lib/lyrics";
import { fonts, palette } from "../theme";
import { Icon, u } from "../ui";

export function TimedLyrics({
  text,
  position,
  onSeek,
  onImport,
  captionNote = false,
  lookupStatus,
  sourceUrl,
}: {
  text: string;
  position: number;
  onSeek: (seconds: number) => void;
  onImport: () => void;
  captionNote?: boolean;
  lookupStatus?: string;
  sourceUrl?: string;
}) {
  const lines = React.useMemo(() => parseLRC(text), [text]);
  const active = activeLyricIndex(lines, position);
  const scroll = useRef<React.ElementRef<typeof ScrollView>>(null);
  const positions = useRef<Record<number, number>>({});
  const go = (animated: boolean) => {
    if (positions.current[active] !== undefined)
      scroll.current?.scrollTo({
        y: Math.max(0, positions.current[active] - 45),
        animated,
      });
  };
  useEffect(() => {
    go(true);
  }, [active]);
  return (
    <View style={s.root}>
      <View
        style={[u.row, { justifyContent: "space-between", marginBottom: 8 }]}
      >
        <Text style={u.eyebrow}>EVERY WORD, A LITTLE CLOSER</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Import timed lyrics"
          onPress={onImport}
          style={s.import}
        >
          <Icon name="add" size={16} color={palette.cyan} />
          <Text style={s.importText}>Add .lrc</Text>
        </Pressable>
      </View>
      {sourceUrl && (
        <Pressable
          accessibilityRole="link"
          onPress={() => void Linking.openURL(sourceUrl)}
          style={{ minHeight: 32, justifyContent: "center", marginBottom: 8 }}
        >
          <Text style={[u.mono, { color: palette.cyan }]}>
            Lyrics from LRCLIB ↗
          </Text>
        </Pressable>
      )}
      {lines.length ? (
        <ScrollView
          key={text}
          ref={scroll}
          onContentSizeChange={() => go(false)}
          nestedScrollEnabled
          style={{ maxHeight: 260 }}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 80 }}
        >
          {lines.map((line, index) => (
            <Pressable
              key={`${line.time}-${index}`}
              accessibilityRole="button"
              accessibilityLabel={`Seek to lyric: ${line.text}`}
              onPress={() => onSeek(line.time)}
              onLayout={(event) => {
                positions.current[index] = event.nativeEvent.layout.y;
                if (index === active) go(false);
              }}
              style={{ paddingVertical: 11 }}
            >
              <Text
                style={[
                  s.line,
                  index === active && { color: palette.cyan },
                  index < active && { opacity: 0.3 },
                ]}
              >
                {line.text}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : (
        <View style={s.empty}>
          <Icon name="mic-outline" size={28} color={palette.purple} />
          <Text style={[u.heading, { fontSize: 18 }]}>Sing it back.</Text>
          <Text style={[u.body, { textAlign: "center", maxWidth: 310 }]}>
            {captionNote
              ? "YouTube captions appear in the video when available. Add permitted timed lyrics to follow them here."
              : "Import a timed lyric file you have permission to use. Each line follows the music. Tap a line to jump there."}
          </Text>
          {!!lookupStatus && (
            <Text
              accessibilityLiveRegion="polite"
              style={[u.mono, { textAlign: "center", color: palette.cyan }]}
            >
              {lookupStatus}
            </Text>
          )}
        </View>
      )}
    </View>
  );
}
const s = StyleSheet.create({
  root: { minHeight: 135 },
  import: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 3 },
  importText: { fontFamily: fonts.medium, fontSize: 10, color: palette.cyan },
  line: {
    fontFamily: fonts.bold,
    fontSize: 25,
    lineHeight: 35,
    letterSpacing: -0.7,
    color: "#777287",
  },
  empty: { paddingVertical: 24, alignItems: "center", gap: 12 },
});
