import assert from 'node:assert/strict';
import test from 'node:test';
import { canPreviewRoute, courseDifficultyLabel, hasRenderablePath, previewRouteInput, routePoints, routePolyline } from '../src/features/running/courseRoute.ts';
import { kakaoMapHtml } from '../src/features/running/kakaoMap.ts';

test('kakao map page encodes the key and draws only numeric route points', () => {
  const html = kakaoMapHtml('a&b key', [
    { latitude: 35.1, longitude: 126.8 },
    { latitude: '</script>', longitude: 126.82 },
  ]);
  assert.match(html, /appkey=a%26b%20key&autoload=false/);
  assert.match(html, /\[\[35\.1,126\.8\],\[null,126\.82\]\]/);
  assert.equal(html.match(/<\/script>/g).length, 3);
});

test('official course points are previewed from their nested coordinates', () => {
  const start = { name: '출발', address: '광주', coordinate: { latitude: 35.1, longitude: 126.8 } };
  const end = { name: '도착', address: '광주', coordinate: { latitude: 35.12, longitude: 126.82 } };
  assert.deepEqual(previewRouteInput({ start, end, waypoints: [{ coordinate: { latitude: 35.11, longitude: 126.81 } }] }), {
    start: { latitude: 35.1, longitude: 126.8 },
    end: { latitude: 35.12, longitude: 126.82 },
    waypoints: [{ latitude: 35.11, longitude: 126.81 }],
  });
  assert.deepEqual(previewRouteInput({ start, end, waypoints: ['들판', { latitude: 35.11, longitude: 126.81 }] }), {
    start: { latitude: 35.1, longitude: 126.8 },
    end: { latitude: 35.12, longitude: 126.82 },
    waypoints: [{ latitude: 35.11, longitude: 126.81 }],
  });
  assert.equal(canPreviewRoute({ start, end: { name: '도착', coordinate: null } }), false);
  assert.equal(canPreviewRoute({ start, end: start, waypoints: ['천축사'] }), false);
  assert.equal(canPreviewRoute({ start, end: start, waypoints: [{ latitude: 35.11, longitude: 126.81 }] }), true);
  assert.equal(canPreviewRoute({ start, end: { name: '도착', coordinate: { latitude: 999, longitude: 126.82 } } }), false);
});

test('route diagram uses only real valid coordinates and preserves endpoints', () => {
  const course = {
    start: { latitude: 37.5, longitude: 127 },
    end: { latitude: 37.51, longitude: 127.02 },
    waypoints: [{ latitude: 37.505, longitude: 127.01 }],
    path: [
      { latitude: 37.5, longitude: 127 },
      { latitude: 999, longitude: 127.01 },
      { latitude: 37.51, longitude: 127.02 },
    ],
  };
  assert.equal(canPreviewRoute(course), true);
  assert.equal(routePoints(course).length, 2);
  const line = routePolyline(routePoints(course));
  assert.equal(line.split(' ').length, 2);
  assert.match(line, /^[\d.]+,[\d.]+ [\d.]+,[\d.]+$/);
  assert.equal(canPreviewRoute({ ...course, end: undefined }), false);
  assert.equal(routePolyline([]), '');
  const planned = [{ latitude: 37.5, longitude: 127 }, { latitude: 37.51, longitude: 127.02 }];
  const actual = [{ latitude: 37.5, longitude: 127 }, { latitude: 37.505, longitude: 127.01 }];
  const plannedLine = routePolyline(planned, 320, 180, [...planned, ...actual]);
  const actualLine = routePolyline(actual, 320, 180, [...planned, ...actual]);
  assert.equal(plannedLine.split(' ')[0], actualLine.split(' ')[0]);
});

test('saved courses need at least two usable path points', () => {
  const valid = { course_id: 'valid', path: [
    { latitude: 37.5, longitude: 127 },
    { latitude: 37.51, longitude: 127.01 },
  ] };
  const courses = [
    { course_id: 'null', path: null },
    { course_id: 'missing' },
    { course_id: 'short', path: [{ latitude: 37.5, longitude: 127 }] },
    { course_id: 'invalid', path: [valid.path[0], { latitude: 999, longitude: 127.01 }] },
    valid,
  ];
  assert.deepEqual(courses.filter(hasRenderablePath), [valid]);
});

test('course difficulty shows Korean words and hides unknown codes', () => {
  assert.equal(courseDifficultyLabel('moderate'), '보통');
  assert.equal(courseDifficultyLabel('unknown'), null);
  assert.equal(courseDifficultyLabel(undefined), null);
});
