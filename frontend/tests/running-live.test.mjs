import assert from 'node:assert/strict';
import test from 'node:test';
import { kakaoLiveMapHtml, liveMapPayload } from '../src/features/running/kakaoMap.ts';
import { appStateAction, gpsNotice } from '../src/features/running/liveTracking.ts';

const here = { latitude: 37.5196217, longitude: 127.0716905 };

test('one position is enough for the live map: marker and accuracy, no path', () => {
  assert.deepEqual(liveMapPayload({ currentLocation: here, accuracyMeters: 17.6, acceptedPath: [] }), {
    current: [37.519622, 127.071691], accuracy: 18, path: [], planned: [],
  });
});

test('the live map payload carries numbers only', () => {
  const payload = liveMapPayload({
    currentLocation: { latitude: '</script>', longitude: 127 },
    accuracyMeters: null,
    acceptedPath: [here, { latitude: 91, longitude: 127 }, { latitude: 37.52, longitude: Number.NaN }],
    plannedPath: [here, { latitude: 37.52, longitude: 127.08 }],
  });
  assert.deepEqual(payload, {
    current: null, accuracy: null, path: [[37.519622, 127.071691]],
    planned: [[37.519622, 127.071691], [37.52, 127.08]],
  });
  assert.doesNotMatch(JSON.stringify(payload), /script/);
});

test('the live map page encodes the key and holds no position of its own', () => {
  const html = kakaoLiveMapHtml('a&b key');
  assert.match(html, /appkey=a%26b%20key&autoload=false/);
  assert.match(html, /window\.__autofitUpdate=/);
  assert.doesNotMatch(html, /127\.07/);
  // A map laid out with no width reports an error, so the screen falls back instead of staying blank.
  assert.match(html, /offsetWidth<10\|\|box\.offsetHeight<10\)\{send\('error'\)/);
});

test('each GPS state has its own notice', () => {
  const base = { tracking: true, hasLocation: true, accuracyMeters: 12, rejection: '', preciseOff: false };
  assert.equal(gpsNotice(base), '');
  assert.equal(gpsNotice({ ...base, hasLocation: false }), '현재 위치를 확인하고 있어요.');
  assert.equal(gpsNotice({ ...base, accuracyMeters: 119.6, rejection: 'low_accuracy' }), '현재 위치 오차가 약 120m예요. 하늘이 열린 곳에서 잠시 기다려 주세요.');
  assert.match(gpsNotice({ ...base, accuracyMeters: null, rejection: 'low_accuracy' }), /아직 정확하지 않아요/);
  assert.equal(gpsNotice({ ...base, rejection: 'gps_jump' }), '위치가 일시적으로 크게 이동해 이 지점은 거리에 포함하지 않았어요.');
  assert.equal(gpsNotice({ ...base, rejection: 'small_movement' }), '', 'a small movement is not reported');
  assert.equal(gpsNotice({ ...base, accuracyMeters: 2000, rejection: 'low_accuracy', preciseOff: true }), '휴대폰 설정에서 Auto-Fit의 정확한 위치를 켜 주세요.');
  assert.equal(gpsNotice({ ...base, tracking: false, rejection: 'low_accuracy' }), '', 'a paused run shows no GPS notice');
});

test('only a real background pauses at once; a brief inactive waits', () => {
  assert.equal(appStateAction('active'), 'keep');
  assert.equal(appStateAction('inactive'), 'wait');
  assert.equal(appStateAction('background'), 'pause');
});

test('invalid accuracy never becomes a marker, circle or numeric GPS notice', () => {
  for (const accuracy of [-1, NaN, Infinity, -Infinity]) {
    const payload = liveMapPayload({ currentLocation: here, accuracyMeters: accuracy, acceptedPath: [here] });
    assert.equal(payload.current, null, `marker for ${accuracy}`);
    assert.equal(payload.accuracy, null, `circle for ${accuracy}`);
    assert.deepEqual(payload.path, [[37.519622, 127.071691]], 'the accepted path stays visible');
    const notice = gpsNotice({ tracking: true, hasLocation: true, accuracyMeters: accuracy, rejection: 'low_accuracy', preciseOff: false });
    assert.equal(notice, '위치가 아직 정확하지 않아요. 하늘이 열린 곳에서 잠시 기다려 주세요.');
  }
});

test('missing accuracy keeps a valid marker without a circle; large positive accuracy remains visible', () => {
  const missing = liveMapPayload({ currentLocation: here, accuracyMeters: null, acceptedPath: [] });
  assert.deepEqual(missing.current, [37.519622, 127.071691]);
  assert.equal(missing.accuracy, null);
  assert.equal(liveMapPayload({ currentLocation: here, accuracyMeters: 10001, acceptedPath: [] }).accuracy, 10001);
});

test('invalid coordinates hide both the live marker and its accuracy circle', () => {
  for (const currentLocation of [
    { ...here, latitude: NaN }, { ...here, latitude: Infinity }, { ...here, latitude: -Infinity },
    { ...here, longitude: NaN }, { ...here, longitude: Infinity }, { ...here, longitude: -Infinity },
    { ...here, latitude: 90.01 }, { ...here, latitude: -90.01 },
    { ...here, longitude: 180.01 }, { ...here, longitude: -180.01 },
  ]) {
    const payload = liveMapPayload({ currentLocation, accuracyMeters: 12, acceptedPath: [here] });
    assert.equal(payload.current, null);
    assert.equal(payload.accuracy, null);
    assert.equal(payload.path.length, 1);
  }
});

// Use the real hook and map payload with in-memory phone/API boundaries. No GPS, credentials or network.
const { registerHooks } = await import('node:module');
const bridge = (names, source) => names.map((name) => `export const ${name} = (...args) => globalThis.__autoFitRunningTest.${source}.${name}(...args);`).join('\n');
registerHooks({
  resolve(specifier, context, next) {
    let source;
    if (specifier === 'react') source = bridge(['useCallback', 'useEffect', 'useRef', 'useState'], 'react');
    if (specifier === 'react-native') source = 'export const AppState = { addEventListener: (...args) => globalThis.__autoFitRunningTest.onAppState(...args) };';
    if (specifier === 'expo-location') source = 'export const Accuracy = { High: 4 };' + bridge(['getCurrentPositionAsync', 'getLastKnownPositionAsync', 'getForegroundPermissionsAsync', 'requestForegroundPermissionsAsync', 'hasServicesEnabledAsync', 'watchPositionAsync'], 'location');
    if (specifier === '@/src/api/running') source = bridge(['addRunningTrackPoint', 'completeRunningSession', 'getRunningSession', 'getRunningApiErrorMessage', 'pauseRunningSession', 'resumeRunningSession'], 'api');
    if (source) return { shortCircuit: true, url: `data:text/javascript,${encodeURIComponent(source)}` };
    if (specifier === './liveTracking') return { shortCircuit: true, url: new URL('../src/features/running/liveTracking.ts', import.meta.url).href };
    return next(specifier, context);
  },
});
const { useRunningSession } = await import('../src/features/running/useRunningSession.ts');
const drain = async () => { for (let i = 0; i < 4; i += 1) await new Promise(setImmediate); };
const fix = (coords, timestamp = 10) => ({ coords: { ...here, accuracy: 12, ...coords }, timestamp });

async function phone({ last = null, first = null, status = 'in_progress', preciseOff = false } = {}) {
  const slots = [];
  const effects = [];
  const cleanups = [];
  let cursor = 0;
  let firstRender = true;
  let watch;
  let appState;
  let server = { running_session_id: 'run-1', status, distance_meters: 42, elapsed_seconds: 3, average_pace_seconds_per_km: null };
  const accepted = { ...here, accuracy_meters: 12, elapsed_seconds: 3 };
  const calls = { points: [], pauses: 0 };
  const permission = { granted: true, ios: { accuracy: preciseOff ? 'reduced' : 'full' } };
  globalThis.__autoFitRunningTest = {
    react: {
      useState(initial) {
        const i = cursor++;
        if (firstRender) slots[i] = typeof initial === 'function' ? initial() : initial;
        return [slots[i], (next) => { slots[i] = typeof next === 'function' ? next(slots[i]) : next; }];
      },
      useRef(initial) { const i = cursor++; if (firstRender) slots[i] = { current: initial }; return slots[i]; },
      useCallback(callback) { return callback; },
      useEffect(effect) { if (firstRender) effects.push(effect); },
    },
    onAppState(_event, listener) { appState = listener; return { remove() {} }; },
    location: {
      getCurrentPositionAsync: async () => first,
      getLastKnownPositionAsync: async () => last,
      getForegroundPermissionsAsync: async () => permission,
      requestForegroundPermissionsAsync: async () => permission,
      hasServicesEnabledAsync: async () => true,
      watchPositionAsync: async (_options, callback) => { watch = callback; return { remove() {} }; },
    },
    api: {
      getRunningSession: async () => ({ session: server, points: [accepted], planned_course: null }),
      getRunningApiErrorMessage: () => 'test error',
      async addRunningTrackPoint(_id, point) {
        calls.points.push(point);
        const goodAccuracy = point.accuracy_meters !== null && Number.isFinite(point.accuracy_meters) && point.accuracy_meters >= 0 && point.accuracy_meters <= 50;
        if (!goodAccuracy) return { session: server, accepted: false, reason: 'low_accuracy', point: null };
        server = { ...server, distance_meters: server.distance_meters + 10 };
        return { session: server, accepted: true, point, reason: null };
      },
      async pauseRunningSession() { calls.pauses += 1; server = { ...server, status: 'paused' }; return { session: server }; },
      async resumeRunningSession() { server = { ...server, status: 'in_progress' }; return { session: server }; },
      async completeRunningSession() { server = { ...server, status: 'completed' }; return { session: server }; },
    },
  };
  const read = function useSnapshot() { cursor = 0; const result = useRunningSession('run-1'); firstRender = false; return result; };
  read();
  for (const effect of effects) cleanups.push(effect());
  await drain();
  return {
    read, calls,
    async emit(location) { watch(location); await drain(); },
    async background() { appState('background'); await drain(); },
    close() { for (const cleanup of cleanups) cleanup?.(); },
  };
}

test('every phone location source rejects invalid samples without changing distance, accepted points or pause state', async () => {
  const invalid = [
    ...[-1, NaN, Infinity, -Infinity].map((accuracy) => ({ accuracy })),
    ...[NaN, Infinity, -Infinity, 90.01, -90.01].map((latitude) => ({ latitude })),
    ...[NaN, Infinity, -Infinity, 180.01, -180.01].map((longitude) => ({ longitude })),
  ];
  for (const source of ['last', 'first', 'watch']) {
    for (const coords of invalid) {
      const fixture = await phone(source === 'last' ? { last: fix(coords), status: 'paused' } : source === 'first' ? { first: fix(coords) } : {});
      try {
        if (source === 'watch') await fixture.emit(fix(coords));
        const state = fixture.read();
        assert.equal(state.currentLocation, null, `${source}: ${JSON.stringify(coords)} must not show a marker`);
        assert.equal(fixture.calls.points.length, 0, `${source}: invalid GPS must not reach the points API`);
        assert.equal(fixture.calls.pauses, 0, `${source}: invalid GPS must not pause the run`);
        assert.equal(state.session.status, source === 'last' ? 'paused' : 'in_progress');
        assert.equal(state.session.distance_meters, 42);
        assert.equal(state.points.length, 1);
        assert.equal(state.error, '');
      } finally { fixture.close(); }
    }
  }
});

test('a new invalid fix hides an earlier marker while keeping the approved path and precise-location guidance', async () => {
  const fixture = await phone({ first: fix({}), preciseOff: true });
  try {
    assert.notEqual(fixture.read().currentLocation, null);
    await fixture.emit(fix({ accuracy: -1 }, 11));
    const state = fixture.read();
    assert.equal(state.currentLocation, null);
    assert.equal(state.points.length, 1);
    assert.equal(state.session.distance_meters, 42);
    assert.equal(fixture.calls.pauses, 0);
    assert.equal(gpsNotice({ tracking: true, hasLocation: false, accuracyMeters: null, rejection: state.rejection, preciseOff: state.preciseOff }), '휴대폰 설정에서 Auto-Fit의 정확한 위치를 켜 주세요.');
  } finally { fixture.close(); }
});

test('null and large positive accuracy still reach the server; the 50m acceptance boundary controls distance', async () => {
  for (const accuracy of [null, 10001, 12, 50, 51]) {
    const fixture = await phone();
    try {
      await fixture.emit(fix({ accuracy }));
      const state = fixture.read();
      assert.deepEqual(state.currentLocation, { ...here, accuracy });
      assert.equal(fixture.calls.points.length, 1);
      assert.equal(fixture.calls.points[0].accuracy_meters, accuracy);
      const accepted = accuracy !== null && accuracy <= 50;
      assert.equal(state.points.length, accepted ? 2 : 1);
      assert.equal(state.session.distance_meters, accepted ? 52 : 42);
      assert.equal(state.rejection, accepted ? '' : 'low_accuracy');
      assert.equal(fixture.calls.pauses, 0);
      await fixture.background();
      assert.equal(fixture.calls.pauses, 1, 'real background still pauses normally');
    } finally { fixture.close(); }
  }
});

test('first and last known fixes keep valid markers without sending track points', async () => {
  for (const source of ['first', 'last']) {
    for (const accuracy of [null, 10001, 12, 50, 51]) {
      const fixture = await phone(source === 'last'
        ? { last: fix({ accuracy }), status: 'paused' }
        : { first: fix({ accuracy }) });
      try {
        const state = fixture.read();
        assert.deepEqual(state.currentLocation, { ...here, accuracy }, `${source}: ${accuracy}`);
        const payload = liveMapPayload({ currentLocation: state.currentLocation, accuracyMeters: state.currentLocation.accuracy, acceptedPath: state.points });
        assert.deepEqual(payload.current, [37.519622, 127.071691]);
        assert.equal(payload.accuracy, accuracy === null ? null : Math.round(accuracy));
        assert.equal(fixture.calls.points.length, 0, `${source}: a map-only fix must not be sent`);
        assert.equal(fixture.calls.pauses, 0);
        assert.equal(state.points.length, 1);
        assert.equal(state.session.distance_meters, 42);
      } finally { fixture.close(); }
    }
  }
});

test('a coarse large positive fix keeps its marker and asks for precise location without pausing', async () => {
  const fixture = await phone({ preciseOff: true });
  try {
    await fixture.emit(fix({ accuracy: 10001 }));
    const state = fixture.read();
    assert.deepEqual(state.currentLocation, { ...here, accuracy: 10001 });
    assert.equal(fixture.calls.points.length, 1);
    assert.equal(state.points.length, 1);
    assert.equal(state.session.distance_meters, 42);
    assert.equal(fixture.calls.pauses, 0);
    assert.equal(gpsNotice({ tracking: true, hasLocation: true, accuracyMeters: state.currentLocation.accuracy, rejection: state.rejection, preciseOff: state.preciseOff }), '휴대폰 설정에서 Auto-Fit의 정확한 위치를 켜 주세요.');
  } finally { fixture.close(); }
});
