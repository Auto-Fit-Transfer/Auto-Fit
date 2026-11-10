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
