import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { fonts, palette } from "../theme";
import { Badge, Button, Glass, Icon, RoundButton, u } from "../ui";

export function SettingsSheet({
  visible,
  onClose,
  engineKind,
  youtubeKey,
  onSaveKey,
  onImportMusic,
  notice,
}: {
  visible: boolean;
  onClose: () => void;
  engineKind: "native" | "expo" | "web";
  youtubeKey: string;
  onSaveKey: (key: string) => void;
  onImportMusic: () => void;
  notice: string;
}) {
  const [draft, setDraft] = useState("");
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
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View
              style={[
                u.row,
                { justifyContent: "space-between", marginBottom: 18 },
              ]}
            >
              <View>
                <Text style={u.eyebrow}>YOUR SPACE</Text>
                <Text style={[u.heading, { fontSize: 25, marginTop: 4 }]}>
                  Make it yours.
                </Text>
              </View>
              <RoundButton
                icon="close"
                label="Close settings"
                onPress={onClose}
              />
            </View>
            <Glass style={{ padding: 17, gap: 10, marginBottom: 24 }}>
              <Badge color={palette.green}>
                {engineKind === "native"
                  ? "NATIVE IPHONE ENGINE"
                  : engineKind === "expo"
                    ? "EXPO GO PREVIEW"
                    : "BROWSER PREVIEW"}
              </Badge>
              <Text style={[u.body, { color: palette.text }]}>
                {engineKind === "native"
                  ? "Background audio, lock-screen controls, native fades and AirPlay are included in this installed build."
                  : "Try the design and free music here. An installed iPhone build enables native background audio, lock-screen controls and reliable crossfades."}
              </Text>
            </Glass>
            <Text style={u.eyebrow}>MUSIC SOURCES</Text>
            <View style={s.source}>
              <View
                style={[
                  s.sourceIcon,
                  { backgroundColor: "rgba(173,104,248,0.16)" },
                ]}
              >
                <Icon name="radio-outline" color={palette.purple} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.sourceName}>Audius</Text>
                <Text style={u.body}>
                  Free independent music. No key needed.
                </Text>
              </View>
              <Icon name="checkmark-circle" color={palette.green} size={19} />
            </View>
            <View style={s.source}>
              <View style={s.sourceIcon}>
                <Icon name="musical-notes-outline" color={palette.cyan} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.sourceName}>Your music</Text>
                <Text style={u.body}>Bring your own audio files.</Text>
              </View>
            </View>
            <Button secondary icon="add" onPress={onImportMusic}>
              Import music files
            </Button>
            <View style={s.divider} />
            <View style={[u.row, { gap: 8 }]}>
              <Icon name="logo-youtube" color="#FF8387" size={19} />
              <Text style={s.sourceName}>YouTube video search</Text>
            </View>
            <Text style={[u.body, { marginTop: 10 }]}>
              Paste video links without a key. To search by song or artist, add
              a YouTube Data API key with free quota.
            </Text>
            <TextInput
              accessibilityLabel="YouTube API key"
              value={draft}
              onChangeText={setDraft}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              placeholder={
                youtubeKey
                  ? "A search key is configured"
                  : "Paste your YouTube Data API key"
              }
              placeholderTextColor={palette.soft}
              style={s.input}
            />
            <Button
              disabled={!draft.trim()}
              icon="key-outline"
              onPress={() => {
                onSaveKey(draft.trim());
                setDraft("");
              }}
            >
              Save search key
            </Button>
            {!!youtubeKey && (
              <View style={{ marginTop: 10 }}>
                <Button secondary onPress={() => onSaveKey("")}>
                  Remove device key
                </Button>
              </View>
            )}
            <Text style={[u.body, { fontSize: 11, marginTop: 12 }]}>
              The key stays on this device and is sent to Google for searches.
              Client keys are public; restrict yours to the YouTube Data API and
              your deployment.
            </Text>
            <View style={{ marginTop: 14 }}>
              <Button
                secondary
                icon="open-outline"
                onPress={() =>
                  void Linking.openURL(
                    "https://developers.google.com/youtube/v3/getting-started",
                  )
                }
              >
                Get a YouTube search key
              </Button>
            </View>
            <View style={s.divider} />
            <Text style={u.eyebrow}>KNOW YOUR SOURCES</Text>
            <Text style={[u.body, { marginTop: 10 }]}>
              YouTube videos stay visible and pause when closed or backgrounded.
              They aren’t part of the audio crossfade engine.
            </Text>
            <Text style={[u.body, { marginTop: 12 }]}>
              Spotify and SoundCloud search buttons open those services. Their
              approved playback integrations require separate access; this app
              does not extract their audio.
            </Text>
            <Text style={[u.body, { marginTop: 12 }]}>
              Audius streams need a connection. Imported files play from your
              device. Audio quality depends on the original source.
            </Text>
            <View style={s.divider} />
            <Button
              secondary
              icon="phone-portrait-outline"
              onPress={() =>
                void Linking.openURL(
                  "https://github.com/fizzberwyndash/DashyMusic/blob/main/docs/IOS-BUILD.md",
                )
              }
            >
              iPhone build guide
            </Button>
            {!!notice && (
              <Text
                accessibilityRole="alert"
                style={[u.body, { color: palette.cyan, marginTop: 15 }]}
              >
                {notice}
              </Text>
            )}
            <Text style={[u.mono, { textAlign: "center", marginTop: 24 }]}>
              DASHYMUSIC / VERSION 0.2
            </Text>
          </ScrollView>
        </Glass>
      </KeyboardAvoidingView>
    </Modal>
  );
}
const s = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.76)",
    padding: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    padding: 24,
    width: "100%",
    maxWidth: 490,
    maxHeight: "91%",
    borderRadius: 32,
  },
  source: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    paddingVertical: 15,
  },
  sourceIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(66,226,244,0.1)",
  },
  sourceName: { fontFamily: fonts.semibold, fontSize: 14, color: palette.text },
  input: {
    minHeight: 49,
    borderRadius: 15,
    paddingHorizontal: 15,
    backgroundColor: "rgba(0,0,0,0.2)",
    borderWidth: 1,
    borderColor: palette.edge,
    fontFamily: fonts.regular,
    fontSize: 12,
    color: palette.text,
    marginTop: 16,
    marginBottom: 12,
  },
  divider: { height: 1, backgroundColor: palette.edge, marginVertical: 24 },
});
