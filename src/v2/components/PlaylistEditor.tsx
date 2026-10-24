import React, { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { MusicTrack } from "../types";
import { Button, Glass, Icon, RoundButton, u } from "../ui";
import { fonts, palette } from "../theme";
import { Artwork } from "./Artwork";

export function PlaylistEditor({
  visible,
  mode,
  name,
  tracks,
  selectedIds,
  onClose,
  onSave,
}: {
  visible: boolean;
  mode: "create" | "tracks";
  name?: string;
  tracks: MusicTrack[];
  selectedIds: string[];
  onClose: () => void;
  onSave: (name: string, ids: string[]) => void;
}) {
  const [title, setTitle] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  useEffect(() => {
    if (visible) {
      setTitle(mode === "create" ? "" : (name ?? ""));
      setSelected(selectedIds);
      setQuery("");
    }
  }, [visible, mode, name]);
  const filtered = tracks.filter((track) =>
    `${track.title} ${track.artist}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={s.scrim}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Glass strong style={s.card}>
          <View
            style={[
              u.row,
              { justifyContent: "space-between", marginBottom: 14 },
            ]}
          >
            <View style={{ flex: 1 }}>
              <Text style={u.eyebrow}>A COLLECTION OF YOU</Text>
              <Text style={[u.heading, { fontSize: 24, marginTop: 5 }]}>
                {mode === "create"
                  ? "Your next little universe."
                  : "Keep the good ones."}
              </Text>
            </View>
            <RoundButton
              icon="close"
              label="Close playlist editor"
              onPress={onClose}
            />
          </View>
          {mode === "create" && (
            <TextInput
              accessibilityLabel="Playlist name"
              value={title}
              onChangeText={setTitle}
              placeholder="Give your playlist a name"
              placeholderTextColor={palette.soft}
              maxLength={100}
              style={s.input}
              autoFocus
            />
          )}
          <TextInput
            accessibilityLabel="Filter playlist songs"
            value={query}
            onChangeText={setQuery}
            placeholder="Find a song in your collection"
            placeholderTextColor={palette.soft}
            style={s.input}
          />
          <ScrollView
            keyboardShouldPersistTaps="handled"
            style={{ maxHeight: 350 }}
            contentContainerStyle={{ paddingVertical: 8 }}
          >
            {!filtered.length && (
              <Text style={[u.body, { padding: 20, textAlign: "center" }]}>
                Play, save, or import songs to find them here.
              </Text>
            )}
            {filtered.map((track) => (
              <Pressable
                key={track.id}
                accessibilityRole="checkbox"
                accessibilityLabel={`Add ${track.title}`}
                accessibilityState={{ checked: selected.includes(track.id) }}
                aria-checked={selected.includes(track.id)}
                onPress={() =>
                  setSelected((previous) =>
                    previous.includes(track.id)
                      ? previous.filter((id) => id !== track.id)
                      : [...previous, track.id],
                  )
                }
                style={s.row}
              >
                <Artwork
                  uri={track.artwork}
                  style={{ width: 43, height: 43, borderRadius: 12 }}
                />
                <View style={{ flex: 1, gap: 4 }}>
                  <Text numberOfLines={1} style={s.track}>
                    {track.title}
                  </Text>
                  <Text numberOfLines={1} style={u.body}>
                    {track.artist}
                  </Text>
                </View>
                <Icon
                  name={
                    selected.includes(track.id)
                      ? "checkmark-circle"
                      : "ellipse-outline"
                  }
                  color={
                    selected.includes(track.id) ? palette.cyan : palette.soft
                  }
                />
              </Pressable>
            ))}
          </ScrollView>
          <Text style={[u.mono, { paddingVertical: 12 }]}>
            {selected.length} SONGS SELECTED
          </Text>
          <Button
            gradient
            icon="checkmark"
            disabled={mode === "create" && !title.trim()}
            onPress={() =>
              onSave(title.trim() || name || "My playlist", selected)
            }
          >
            {mode === "create" ? "Create playlist" : "Save songs"}
          </Button>
        </Glass>
      </KeyboardAvoidingView>
    </Modal>
  );
}
const s = StyleSheet.create({
  scrim: {
    flex: 1,
    padding: 20,
    backgroundColor: "rgba(0,0,0,0.75)",
    justifyContent: "center",
    alignItems: "center",
  },
  card: {
    width: "100%",
    maxWidth: 490,
    maxHeight: "88%",
    padding: 24,
    borderRadius: 32,
  },
  input: {
    minHeight: 49,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.edge,
    backgroundColor: "rgba(0,0,0,0.16)",
    color: palette.text,
    fontFamily: fonts.regular,
    fontSize: 12,
    marginBottom: 11,
  },
  row: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    paddingVertical: 9,
    minHeight: 60,
  },
  track: { fontFamily: fonts.semibold, fontSize: 13, color: palette.text },
});
