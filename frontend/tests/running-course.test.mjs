import assert from 'node:assert/strict';
import test from 'node:test';
import { canPreviewRoute, routePoints, routePolyline } from '../src/features/running/courseRoute.ts';

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
