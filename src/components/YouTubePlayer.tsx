import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { playerHtml } from './playerHtml';
import { parsePlayerMessage, playerError, playerState, type YouTubePlayerHandle, type YouTubePlayerProps } from './playerTypes';

export type { YouTubePlayerHandle, YouTubePlayerProps } from './playerTypes';

// The fallback identifies the configured app bundle, rather than claiming a hosted website.
// A real HTTPS application origin can be configured for deployments that require one.
function applicationOrigin(): string {
  const candidate = process.env.EXPO_PUBLIC_PLAYER_ORIGIN || 'https://com.dashymusic.app';
  try {
    const url = new URL(candidate);
    if (url.protocol === 'https:' && !url.username && !url.password) return url.origin;
  } catch { /* Use the application identifier if a setting is malformed. */ }
  return 'https://com.dashymusic.app';
}

export const YouTubePlayer = forwardRef<YouTubePlayerHandle, YouTubePlayerProps>(function YouTubePlayer(props, ref) {
  // WebView's current declaration defaults its extra-props generic to undefined.
  // Supplying object avoids collapsing WebViewProps & undefined to never in TS 6.
  const webView = useRef<WebView<object>>(null);
  const callbacks = useRef(props);
  callbacks.current = props;
  const origin = useMemo(applicationOrigin, []);
  const source = useMemo(() => ({ html: playerHtml(props.videoId, origin), baseUrl: `${origin}/` }), [props.videoId, origin]);

  const command = (method: 'playVideo' | 'pauseVideo' | 'seekTo', value?: number) => {
    const args = value === undefined ? '' : `${Math.max(0, Number.isFinite(value) ? value : 0)},true`;
    webView.current?.injectJavaScript(`if(window.dashyPlayer && window.dashyPlayer.${method})window.dashyPlayer.${method}(${args});true;`);
  };

  useImperativeHandle(ref, () => ({
    play: () => command('playVideo'),
    pause: () => command('pauseVideo'),
    seekTo: (seconds) => command('seekTo', seconds),
  }));

  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') command('pauseVideo');
    });
    return () => subscription.remove();
  }, []);

  const onMessage = (event: WebViewMessageEvent) => {
    const message = parsePlayerMessage(event.nativeEvent.data);
    if (!message) return;
    switch (message.type) {
      case 'ready': callbacks.current.onReady?.(); break;
      case 'state': {
        const state = playerState(message.state);
        if (state) callbacks.current.onStateChange?.(state);
        break;
      }
      case 'progress': {
        if (typeof message.time === 'number' && Number.isFinite(message.time) && typeof message.duration === 'number' && Number.isFinite(message.duration)) {
          callbacks.current.onProgress?.(Math.max(0, message.time), Math.max(0, message.duration));
        }
        break;
      }
      case 'error': callbacks.current.onError?.(playerError(message.code)); break;
      case 'network-error': callbacks.current.onError?.('Could not reach YouTube. Check your connection and try again.'); break;
      case 'ready-timeout': callbacks.current.onError?.('YouTube is taking too long to load. Check your connection, then close and reopen the player.'); break;
    }
  };

  return <View style={styles.container}>
    <WebView<object>
      key={props.videoId}
      ref={webView}
      source={source}
      style={styles.webView}
      originWhitelist={['https://*']}
      javaScriptEnabled
      domStorageEnabled
      allowsInlineMediaPlayback
      allowsFullscreenVideo
      // autoplay remains disabled; this lets explicit native Play-button presses work.
      mediaPlaybackRequiresUserAction={false}
      setSupportMultipleWindows={false}
      onMessage={onMessage}
      onError={() => callbacks.current.onError?.('Could not load the YouTube player. Check your connection and try again.')}
      onHttpError={event => {
        if (event.nativeEvent.statusCode >= 400) callbacks.current.onError?.('YouTube is unavailable on this connection. Try another network or open the video in YouTube.');
      }}
    />
  </View>;
});

const styles = StyleSheet.create({
  container: { width: '100%', aspectRatio: 16 / 9, minHeight: 200, backgroundColor: '#000', overflow: 'hidden' },
  webView: { flex: 1, backgroundColor: '#000' },
});

export default YouTubePlayer;
