/** A visible official YouTube player. No media extraction or background audio. */
export function playerHtml(videoId: string, origin: string): string {
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) throw new Error('Invalid YouTube video ID.');
  return `<!doctype html>
<html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<meta name="referrer" content="strict-origin-when-cross-origin">
<style>html,body,#player{margin:0;padding:0;width:100%;height:100%;min-height:200px;background:#000;overflow:hidden}</style>
</head><body><div id="player"></div><script>
(function () {
  var timer = null, readyTimer = null, ready = false, failed = false, closed = false;
  function send(type, data) {
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(Object.assign({type:type},data || {})));
  }
  function progress() {
    if (closed || failed) return;
    var p = window.dashyPlayer;
    if (p && typeof p.getCurrentTime === 'function') send('progress',{time:p.getCurrentTime() || 0,duration:p.getDuration() || 0});
  }
  function clearTimers() { clearInterval(timer); clearTimeout(readyTimer); }
  function fail(type, data) {
    if (closed || failed) return;
    failed = true; clearTimers(); send(type, data);
    if (window.dashyPlayer && window.dashyPlayer.pauseVideo) window.dashyPlayer.pauseVideo();
  }
  readyTimer = setTimeout(function(){fail('ready-timeout')},20000);
  window.onYouTubeIframeAPIReady = function () {
    if (closed || failed || window.dashyPlayer) return;
    window.dashyPlayer = new YT.Player('player', {
      width:'100%', height:'100%', videoId:${JSON.stringify(videoId)},
      playerVars:{autoplay:0,controls:1,playsinline:1,cc_load_policy:1,rel:0,origin:${JSON.stringify(origin)}},
      events:{
        onReady:function(){
          if (closed || failed) { if(window.dashyPlayer && window.dashyPlayer.pauseVideo)window.dashyPlayer.pauseVideo(); return; }
          if (ready) return;
          ready = true; clearTimeout(readyTimer); send('ready');progress();timer=setInterval(progress,500);
        },
        onStateChange:function(e){if(!closed && !failed){send('state',{state:e.data});progress()}},
        onError:function(e){fail('error',{code:e.data})}
      }
    });
  };
  document.addEventListener('visibilitychange',function(){if(document.hidden && window.dashyPlayer && window.dashyPlayer.pauseVideo)window.dashyPlayer.pauseVideo()});
  window.addEventListener('pagehide',function(){closed=true;clearTimers();if(window.dashyPlayer && window.dashyPlayer.pauseVideo)window.dashyPlayer.pauseVideo()});
  var script=document.createElement('script');script.src='https://www.youtube.com/iframe_api';script.onerror=function(){fail('network-error')};document.head.appendChild(script);
})();
</script></body></html>`;
}
