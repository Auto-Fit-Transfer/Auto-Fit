// Pure rules of the live running screen; useRunningSession wires them to the phone.

export const INACTIVE_GRACE_MS = 5000;

export type LiveLocation = { latitude: number; longitude: number; accuracy: number | null };

// A missing accuracy is different from an invalid measurement. The server can reject
// null/large positive accuracy for distance while the map still shows a valid position.
export function readLiveLocation(coords: LiveLocation): LiveLocation | null {
  const { latitude, longitude, accuracy } = coords;
  if (!Number.isFinite(latitude) || Math.abs(latitude) > 90
      || !Number.isFinite(longitude) || Math.abs(longitude) > 180
      || (accuracy !== null && (!Number.isFinite(accuracy) || accuracy < 0))) return null;
  return { latitude, longitude, accuracy };
}

// iOS reports 'inactive' for the control centre, a permission sheet or the app switcher.
// Only a real background stops the run at once; 'inactive' gets a short grace period.
export function appStateAction(state: string): 'keep' | 'pause' | 'wait' {
  return state === 'active' ? 'keep' : state === 'background' ? 'pause' : 'wait';
}

type GpsState = {
  tracking: boolean;
  hasLocation: boolean;
  accuracyMeters: number | null | undefined;
  // The server's reason for leaving the last position out of the distance ('' when it was accepted).
  rejection: string;
  preciseOff: boolean;
};

// A small movement is not a problem to report: the marker moves and nothing is said.
export function gpsNotice({ tracking, hasLocation, accuracyMeters, rejection, preciseOff }: GpsState): string {
  if (!tracking) return '';
  if (preciseOff && (!hasLocation || rejection === 'low_accuracy')) return '휴대폰 설정에서 Auto-Fit의 정확한 위치를 켜 주세요.';
  if (!hasLocation) return '현재 위치를 확인하고 있어요.';
  if (rejection === 'low_accuracy') {
    return typeof accuracyMeters === 'number' && Number.isFinite(accuracyMeters) && accuracyMeters >= 0
      ? `현재 위치 오차가 약 ${Math.round(accuracyMeters)}m예요. 하늘이 열린 곳에서 잠시 기다려 주세요.`
      : '위치가 아직 정확하지 않아요. 하늘이 열린 곳에서 잠시 기다려 주세요.';
  }
  if (rejection === 'gps_jump') return '위치가 일시적으로 크게 이동해 이 지점은 거리에 포함하지 않았어요.';
  return '';
}
