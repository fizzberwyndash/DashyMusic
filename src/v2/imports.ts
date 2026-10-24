import { Platform } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import type { MusicTrack } from './types';
import { parseLRC } from '../lib/lyrics';

export async function importAudioFiles(): Promise<MusicTrack[]> {
  const result = await DocumentPicker.getDocumentAsync({ type: 'audio/*', multiple: true, copyToCacheDirectory: true });
  if (result.canceled) return [];
  const tracks: MusicTrack[] = [];
  const directory = `${FileSystem.documentDirectory ?? ''}dashymusic/`;
  if (Platform.OS !== 'web') {
    if (!FileSystem.documentDirectory) throw new Error('Music storage is unavailable on this device.');
    await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  }
  for (const file of result.assets.slice(0, 50)) {
    const providerId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
    const extension = /\.([a-z0-9]{1,6})$/i.exec(file.name)?.[1]?.toLowerCase() ?? 'mp3';
    let uri = file.uri;
    if (Platform.OS === 'web') {
      if (file.file) uri = URL.createObjectURL(file.file);
    } else {
      uri = `${directory}${providerId}.${extension}`;
      await FileSystem.copyAsync({ from: file.uri, to: uri });
    }
    tracks.push({
      id: `local:${providerId}`, providerId, source: 'local',
      title: file.name.replace(/\.[^.]+$/, '').replace(/_/g, ' '),
      artist: 'Your library', artwork: '', streamUrl: uri, duration: 0, importedAt: Date.now(),
    });
  }
  return tracks;
}

export async function importLyricsFile(): Promise<string | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
  if (result.canceled) return null;
  const file = result.assets[0];
  if (!/\.(lrc|txt)$/i.test(file.name)) throw new Error('Choose a .lrc or .txt timed lyric file.');
  if ((file.size ?? 0) > 1_000_000) throw new Error('Choose a lyric file smaller than 1 MB.');
  const text = Platform.OS === 'web'
    ? await (file.file ? file.file.text() : (await fetch(file.uri)).text())
    : await FileSystem.readAsStringAsync(file.uri);
  if (!parseLRC(text).length) throw new Error('No timed lyrics found. A timed line looks like [00:12.50]Your lyric.');
  return text;
}
