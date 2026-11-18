# 자세 분석 오류 계약 Backend 인계

작성일: 2026-11-18
대상: Backend·Frontend 연동 담당자
AI Server endpoint: `POST /posture-analysis/analyze`

## 결론

AI Server는 자세 분석 실패 원인을 안정적인 `error.code`로 구분한다. Backend는 AI Server의 HTTP 상태와 `error.code`, `error.message`, `error.fields`를 손실 없이 Frontend까지 전달하고, 실패 응답을 성공 분석 결과로 저장하지 않아야 한다.

## 오류 응답

```json
{
  "detail": "영상에서 사람의 자세를 인식하지 못했습니다.",
  "error": {
    "code": "POSE_NOT_DETECTED",
    "message": "영상에서 사람의 자세를 인식하지 못했습니다.",
    "fields": ["video"]
  }
}
```

- `detail`: 기존 연동 호환용이며 `error.message`와 동일
- `error.code`: 화면 분기와 실패 상태 저장에 사용하는 고정 식별자
- `error.message`: 사용자 안내 기본 문구
- `error.fields`: 수정이 필요한 multipart form field

전체 코드 목록과 의미는 [운동 자세 분석 Backend 계약](posture_analysis_backend_contract.md)의 `구조화 오류 응답`을 single source of truth로 사용한다. 최신 Schema는 AI Server `/openapi.json`의 `PostureAnalysisErrorResponse`다.

## Backend 반영 요청

1. 최신 `/openapi.json` 기준으로 `PostureAnalysisErrorResponse` DTO를 추가한다.
2. AI Server의 HTTP 상태와 `error.code`, `error.message`, `error.fields`를 Frontend 응답에 그대로 보존한다.
3. 사용자 문구가 바뀔 수 있으므로 `detail` 또는 `message` 문자열 비교로 분기하지 않는다.
4. 서비스 판정 `422`는 같은 영상으로 자동 재시도하지 않는다. 촬영 또는 입력 수정 안내를 표시한다.
5. `503/MODEL_UNAVAILABLE`만 짧은 backoff로 제한적으로 재시도한다.
6. 실패 작업에는 HTTP 상태와 오류 코드를 저장하고, 성공 결과 또는 부분 분석 결과를 저장하지 않는다.
7. Backend 로그에는 작업 ID·HTTP 상태·오류 코드만 남기고 영상·관절 좌표·사용자 건강정보는 남기지 않는다.

## 호환성과 촬영 방향 제한

- multipart 필수 field 누락, 잘못된 UUID처럼 라우터 실행 전 FastAPI가 반환하는 `422`는 `error`가 없는 기존 `HTTPValidationError` 형식일 수 있다. 이 경우 일반 요청 검증 실패로 처리한다.
- 인증 실패 `401`도 `PostureAnalysisErrorResponse` 형식이 아니다.
- `CAMERA_VIEW_NOT_SUPPORTED`는 실제 영상을 보고 촬영 방향을 판별한 결과가 아니라, 요청 `camera_view`와 capabilities registry의 불일치다.
- 실제 영상 방향이 잘못된 경우 현재 `POSE_COVERAGE_LOW` 또는 `MOTION_NOT_COMPLETED`로 반환될 수 있다.

## 권장 Frontend 분기

| 코드 | 안내 방향 |
|---|---|
| `VIDEO_TOO_SHORT` | 최소 1초 이상 다시 촬영 |
| `POSE_NOT_DETECTED` | 전신이 프레임 안에 보이도록 다시 촬영 |
| `POSE_COVERAGE_LOW` | 조명·거리·필수 관절 노출 확인 |
| `MOTION_NOT_COMPLETED` | 시작 자세에서 동작 후 복귀까지 촬영 |
| `PLANK_HOLD_TOO_SHORT` | 플랭크 자세를 1초 이상 유지 |
| `CAMERA_VIEW_NOT_SUPPORTED` | capabilities의 촬영 방향으로 요청 수정 |
| `MODEL_UNAVAILABLE` | 잠시 후 재시도 안내 |
| `INTERNAL_ERROR` | 일반 장애 안내 및 운영 로그 확인 |

그 밖의 `422`는 `error.message`를 안내하되 버튼과 처리 흐름은 `error.code`를 기준으로 결정한다.

## E2E 확인 목록

- 정상 영상 `200`과 결과 저장
- 사람이 없는 영상 `422/POSE_NOT_DETECTED`
- 1초 미만 영상 `422/VIDEO_TOO_SHORT`
- 관절 노출 부족 `422/POSE_COVERAGE_LOW`
- 완료 동작 없음 `422/MOTION_NOT_COMPLETED`
- 플랭크 유지 부족 `422/PLANK_HOLD_TOO_SHORT`
- 요청 촬영 방향 불일치 `422/CAMERA_VIEW_NOT_SUPPORTED`
- 운동 자산 key 불일치 `422/EXERCISE_ASSET_MISMATCH`
- 운영에서 experimental 운동 요청 `422/EXPERIMENTAL_EXERCISE_DISABLED`
- 모델 장애 `503/MODEL_UNAVAILABLE`
- 필수 form 누락의 기본 FastAPI `422` 호환 처리
- 인증 누락·오류 `401`

실제 스마트폰 영상의 푸시업·플랭크·런지·힙 브리지 임계값 보정은 별도 실기기 검증 항목이다. 이번 오류 계약은 해당 보정 전에도 실패 이유를 화면에서 구분할 수 있도록 하는 변경이다.
