import type { RunningCoordinate } from '@/src/api/running';

export const KAKAO_MAP_JS_KEY = process.env.EXPO_PUBLIC_KAKAO_MAP_JS_KEY?.trim() ?? '';
// Kakao checks the JavaScript key against this origin, so it must be registered with the key.
export const KAKAO_MAP_ORIGIN = process.env.EXPO_PUBLIC_KAKAO_MAP_ORIGIN?.trim() || 'https://211-233-206-193.sslip.io';
export const KAKAO_MAP_LOAD_TIMEOUT_MS = 8000;

export function kakaoMapHtml(appKey: string, points: RunningCoordinate[], lineColor = '#503DD7') {
  const path = JSON.stringify(points.map((point) => [Number(point.latitude), Number(point.longitude)]));
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no">
<style>html,body,#map{margin:0;width:100%;height:100%}.dot{width:12px;height:12px;border-radius:50%;box-sizing:border-box}</style></head>
<body><div id="map"></div>
<script>
function send(message){if(window.ReactNativeWebView){window.ReactNativeWebView.postMessage(message)}else{window.parent.postMessage(message,'*')}}
window.onerror=function(){send('error')};
</script>
<script src="https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(appKey)}&autoload=false" onerror="send('error')"></script>
<script>
if(!window.kakao||!kakao.maps){send('error')}else{kakao.maps.load(function(){try{
var path=${path}.map(function(p){return new kakao.maps.LatLng(p[0],p[1])});
var map=new kakao.maps.Map(document.getElementById('map'),{center:path[0],level:5,draggable:false,disableDoubleClick:true,disableDoubleClickZoom:true});
map.setZoomable(false);
new kakao.maps.Polyline({map:map,path:path,strokeWeight:5,strokeColor:'${lineColor}',strokeOpacity:0.95,strokeStyle:'solid'});
function dot(position,background,border){var el=document.createElement('div');el.className='dot';el.style.background=background;el.style.border='3px solid '+border;new kakao.maps.CustomOverlay({map:map,position:position,content:el,xAnchor:0.5,yAnchor:0.5})}
dot(path[0],'#FFFFFF','#252329');dot(path[path.length-1],'${lineColor}','#FFFFFF');
var bounds=new kakao.maps.LatLngBounds();path.forEach(function(p){bounds.extend(p)});map.setBounds(bounds,28,28,28,28);
window.addEventListener('resize',function(){map.relayout();map.setBounds(bounds,28,28,28,28)});
send('ready');
}catch(e){send('error')}})}
</script></body></html>`;
}
