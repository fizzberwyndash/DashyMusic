import React, { useEffect, useRef } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { activeLyricIndex, LyricLine } from "../lib/lyrics";
import { colors } from "../theme";
import { common, Icon } from "./ui";

export function LyricsPanel({
  lines,
  currentTime,
  onSeek,
  onImport,
}: {
  lines: LyricLine[];
  currentTime: number;
  onSeek: (seconds: number) => void;
  onImport: () => void;
}) {
  const scroll = useRef<React.ElementRef<typeof ScrollView>>(null);
  const positions = useRef<Record<number, number>>({});
  const previousLines = useRef(lines);
  const generation = useRef(0);
  if (previousLines.current !== lines) {
    previousLines.current = lines;
    positions.current = {};
    generation.current += 1;
  }
  const index = activeLyricIndex(lines, currentTime);
  function scrollToCurrent(animated: boolean) {
    if (positions.current[index] !== undefined)
      scroll.current?.scrollTo({
        y: Math.max(0, positions.current[index] - 45),
        animated,
      });
  }
  useEffect(() => {
    scrollToCurrent(true);
  }, [index]);

  return (
    <View style={styles.panel}>
      <View
        style={[
          common.row,
          { justifyContent: "space-between", paddingBottom: 8 },
        ]}
      >
        <View style={[common.row, { gap: 7 }]}>
          <Icon name="mic-outline" size={15} color={colors.lime} />
          <Text style={styles.heading}>Sing it back</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Import timed lyrics"
          onPress={onImport}
          hitSlop={8}
          style={styles.importButton}
        >
          <Icon name="add" size={15} color={colors.lime} />
          <Text style={styles.importText}>Import .lrc</Text>
        </Pressable>
      </View>
      {lines.length ? (
        <ScrollView
          key={generation.current}
          ref={scroll}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => scrollToCurrent(false)}
          contentContainerStyle={{ paddingBottom: 80 }}
        >
          {index < 0 && (
            <Text style={[common.muted, { marginBottom: 12 }]}>
              Lyrics begin in a moment…
            </Text>
          )}
          {lines.map((line, i) => (
            <Pressable
              key={`${line.time}-${i}`}
              accessibilityRole="button"
              accessibilityLabel={`Seek to lyric: ${line.text}`}
              onLayout={(event) => {
                positions.current[i] = event.nativeEvent.layout.y;
                if (i === index) scrollToCurrent(false);
              }}
              onPress={() => onSeek(line.time)}
              style={styles.line}
            >
              <Text
                style={[
                  styles.lineText,
                  i === index && styles.current,
                  i < index && { opacity: 0.35 },
                ]}
              >
                {line.text || "♪"}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Every word. Your moment.</Text>
          <Text style={[common.muted, { textAlign: "center", maxWidth: 310 }]}>
            YouTube captions appear inside the video when available. Import a
            timed lyric file you may use to sing along here.
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    flex: 1,
    minHeight: 80,
    paddingHorizontal: 20,
    paddingTop: 12,
    marginTop: 12,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "rgba(255,255,255,0.045)",
    overflow: "hidden",
  },
  heading: { color: colors.text, fontSize: 13, fontWeight: "600" },
  importButton: {
    minHeight: 32,
    alignItems: "center",
    flexDirection: "row",
    gap: 3,
  },
  importText: { color: colors.lime, fontSize: 11, fontWeight: "600" },
  line: { paddingVertical: 12 },
  lineText: {
    color: "#8D9B90",
    fontSize: 24,
    lineHeight: 32,
    fontWeight: "600",
    letterSpacing: -0.7,
  },
  current: { color: colors.lime },
  empty: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    paddingBottom: 18,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "500",
    letterSpacing: -0.4,
  },
});
