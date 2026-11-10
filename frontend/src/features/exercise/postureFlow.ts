// Pure rules of the posture flow (back-end docs/posture-analysis-api-contract.md); the screens wire them up.

export const POSTURE_MAX_BYTES = 50_000_000;
export const POSTURE_MIN_MS = 1_000;
export const POSTURE_MAX_MS = 30_000;

const mimeByExtension: Record<string, string> = {
  mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', avi: 'video/x-msvideo',
};

// The server checks that the real container matches this type, so it follows the file, not a guess.
export function postureVideoType(uri: string, reported?: string | null) {
  const extension = uri.split(/[?#]/)[0].split('.').pop()?.toLowerCase() ?? '';
  const fromName = mimeByExtension[extension];
  const mimeType = fromName ?? (reported && Object.values(mimeByExtension).includes(reported) ? reported : null);
  if (!mimeType) return null;
  const ext = fromName ? extension : Object.keys(mimeByExtension).find((key) => mimeByExtension[key] === mimeType)!;
  return { mimeType, name: `posture.${ext}` };
}

// Same limits as the server, checked first so a long or large video does not upload only to fail.
export function postureVideoProblem({ durationMs, sizeBytes, mimeType }: {
  durationMs: number | null | undefined; sizeBytes: number | null | undefined; mimeType: string | null;
}): string | null {
  if (!mimeType) return 'MP4, MOV, WebM, AVI 영상만 분석할 수 있어요.';
  if (durationMs == null || !(durationMs >= POSTURE_MIN_MS)) return '1초 이상인 영상을 골라 주세요.';
  if (durationMs > POSTURE_MAX_MS) return '30초 이하인 영상을 골라 주세요.';
  if (sizeBytes != null && sizeBytes > POSTURE_MAX_BYTES) return '50MB 이하인 영상을 골라 주세요.';
  return null;
}

// After an upload error the contract says to read the job first, never to resend blindly.
export function recoveryAction(status: string): 'reupload' | 'wait' | 'result' | 'new_job' {
  if (status === 'awaiting_upload') return 'reupload';
  if (status === 'processing' || status === 'cleanup_pending') return 'wait';
  if (status === 'completed') return 'result';
  return 'new_job';
}

// 0 영상 올리기 · 1 자세 분석 · 2 결과 정리 · 3 done. The server reports no finer progress than this.
export function stepOf(status: string | null): number {
  if (status === 'processing') return 1;
  if (status === 'cleanup_pending') return 2;
  if (status === 'completed') return 3;
  return 0;
}

const angleNames: Record<string, string> = {
  torso_lean: '상체 기울기', knee_flexion: '무릎 굽힘', hip_flexion: '엉덩이 굽힘',
  ankle_dorsiflexion: '발목 굽힘', elbow_flexion: '팔꿈치 굽힘', body_alignment: '몸 일직선',
  hip_extension: '엉덩이 펴짐', upper_arm_drift: '위팔 흔들림', ankle_flexion: '발목 각도',
  shoulder_abduction: '어깨 벌림', leg_abduction: '다리 벌림', bilateral_asymmetry: '좌우 차이',
};

type Angle = { angle_code: string; measured_degrees: number; target_min_degrees: number | null; target_max_degrees: number | null };

export function angleRow({ angle_code, measured_degrees, target_min_degrees: min, target_max_degrees: max }: Angle) {
  const value = Number(measured_degrees);
  const target = min != null && max != null ? `권장 ${min}~${max}°` : max != null ? `권장 ${max}° 이하` : min != null ? `권장 ${min}° 이상` : '';
  const over = max != null && value > max ? Math.round(value - max) : 0;
  const under = min != null && value < min ? Math.round(min - value) : 0;
  return {
    label: angleNames[angle_code] ?? '각도',
    value: `${Math.round(value)}°`,
    target,
    status: over ? `${over}° 넘음` : under ? `${under}° 모자람` : '범위 안',
    off: over > 0 || under > 0,
  };
}

export const secondsLabel = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;
