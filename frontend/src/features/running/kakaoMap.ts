import type { RunningCoordinate } from '@/src/api/running';

export const KAKAO_MAP_JS_KEY = process.env.EXPO_PUBLIC_KAKAO_MAP_JS_KEY?.trim() ?? '';
// Kakao checks the JavaScript key against this origin, so it must be registered with the key.
export const KAKAO_MAP_ORIGIN = process.env.EXPO_PUBLIC_KAKAO_MAP_ORIGIN?.trim() || 'https://211-233-206-193.sslip.io';
export const KAKAO_MAP_LOAD_TIMEOUT_MS = 8000;

export function isMapPageUrl(url: string) {
  if (url === 'about:blank') return true;
  try {
    return new URL(url).origin === new URL(KAKAO_MAP_ORIGIN).origin;
  } catch {
    return false;
  }
}

export function kakaoMapHtml(appKey: string, points: RunningCoordinate[], lineColor = '#5246C6') {
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

export type LiveMapInput = {
  currentLocation: RunningCoordinate | null;
  accuracyMeters?: number | null;
  acceptedPath: RunningCoordinate[];
  plannedPath?: RunningCoordinate[];
};

const pair = (point: RunningCoordinate | null | undefined) => {
  const latitude = Number(point?.latitude);
  const longitude = Number(point?.longitude);
  return Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180
    ? [Number(latitude.toFixed(6)), Number(longitude.toFixed(6))] : null;
};
const pairs = (points: RunningCoordinate[] = []) => points.map(pair).filter((point) => point !== null);

// Numbers only, so the page can take it as a JS literal or a postMessage string.
export function liveMapPayload({ currentLocation, accuracyMeters, acceptedPath, plannedPath }: LiveMapInput) {
  const accuracy = Number(accuracyMeters);
  return {
    current: pair(currentLocation),
    accuracy: accuracyMeters != null && Number.isFinite(accuracy) && accuracy > 0 ? Math.round(accuracy) : null,
    path: pairs(acceptedPath),
    planned: pairs(plannedPath),
  };
}

// One page for the whole run: the app sends new positions instead of reloading the map every few seconds.
// Start is a white ring, the current position a filled dot with its accuracy circle, the planned finish a dark square.
export function kakaoLiveMapHtml(appKey: string, lineColor = '#252329', currentColor = '#5246C6') {
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no">
<style>html,body,#map{margin:0;width:100%;height:100%}.dot{width:12px;height:12px;border-radius:50%;box-sizing:border-box}
.start{background:#FFFFFF;border:3px solid ${lineColor}}.finish{background:${lineColor};border:2px solid #FFFFFF;border-radius:3px}
.current{width:16px;height:16px;background:${currentColor};border:3px solid #FFFFFF;box-shadow:0 1px 4px rgba(0,0,0,.3)}</style></head>
<body><div id="map"></div>
<script>
function send(message){if(window.ReactNativeWebView){window.ReactNativeWebView.postMessage(message)}else{window.parent.postMessage(message,'*')}}
window.onerror=function(){send('error')};
var map=null,pending=null,parts=null;
window.__autofitUpdate=function(data){pending=data;if(map)draw()};
window.addEventListener('message',function(event){if(typeof event.data==='string'&&event.data.charAt(0)==='{'){try{window.__autofitUpdate(JSON.parse(event.data))}catch(e){}}});
</script>
<script src="https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(appKey)}&autoload=false" onerror="send('error')"></script>
<script>
function ll(p){return new kakao.maps.LatLng(p[0],p[1])}
function overlay(cls,z){var el=document.createElement('div');el.className='dot '+cls;return new kakao.maps.CustomOverlay({content:el,xAnchor:0.5,yAnchor:0.5,zIndex:z})}
function draw(){var d=pending||{};var path=(d.path||[]).map(ll),planned=(d.planned||[]).map(ll),cur=d.current?ll(d.current):null;
parts.planned.setPath(planned);parts.planned.setMap(planned.length>1?map:null);
parts.finish.setMap(planned.length>1?map:null);if(planned.length>1)parts.finish.setPosition(planned[planned.length-1]);
parts.path.setPath(path);parts.path.setMap(path.length>1?map:null);
parts.start.setMap(path.length?map:null);if(path.length)parts.start.setPosition(path[0]);
parts.current.setMap(cur?map:null);if(cur)parts.current.setPosition(cur);
parts.circle.setMap(cur&&d.accuracy?map:null);if(cur&&d.accuracy){parts.circle.setPosition(cur);parts.circle.setRadius(Math.min(d.accuracy,1000))}
var all=planned.concat(path);if(cur)all.push(cur);
if(all.length===1){map.setLevel(3);map.setCenter(all[0])}
else if(all.length>1){var b=new kakao.maps.LatLngBounds();all.forEach(function(p){b.extend(p)});map.setBounds(b,36,36,36,36)}}
if(!window.kakao||!kakao.maps){send('error')}else{kakao.maps.load(function(){try{
map=new kakao.maps.Map(document.getElementById('map'),{center:new kakao.maps.LatLng(37.5665,126.978),level:5,draggable:false,disableDoubleClick:true,disableDoubleClickZoom:true});
map.setZoomable(false);
parts={planned:new kakao.maps.Polyline({strokeWeight:4,strokeColor:'#A9ACB3',strokeOpacity:1,strokeStyle:'shortdash'}),
path:new kakao.maps.Polyline({strokeWeight:5,strokeColor:'${lineColor}',strokeOpacity:0.95,strokeStyle:'solid'}),
circle:new kakao.maps.Circle({radius:10,strokeWeight:0,fillColor:'${currentColor}',fillOpacity:0.12}),
start:overlay('start',2),finish:overlay('finish',2),current:overlay('current',3)};
window.addEventListener('resize',function(){map.relayout();if(pending)draw()});
send('ready');
if(pending)draw();
}catch(e){send('error')}})}
</script></body></html>`;
}
