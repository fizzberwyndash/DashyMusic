import { Platform } from 'react-native';

export const palette = {
  bg: '#09090F', text: '#FAFAFD', muted: '#A29EB4', soft: '#6E6A83',
  cyan: '#42E2F4', purple: '#AD68F8', pink: '#F166C8', green: '#64E6B7',
  panel: 'rgba(255,255,255,0.065)', edge: 'rgba(255,255,255,0.11)',
};
export const fonts = {
  regular: 'PlusJakartaSans_400Regular', medium: 'PlusJakartaSans_500Medium',
  semibold: 'PlusJakartaSans_600SemiBold', bold: 'PlusJakartaSans_700Bold',
  extra: 'PlusJakartaSans_800ExtraBold', mono: 'SpaceMono_400Regular',
};
export const monoFallback = Platform.OS === 'ios' ? 'Menlo' : 'monospace';
