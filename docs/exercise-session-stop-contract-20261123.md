# 운동 중단 API 계약 (2026-11-23)

추천 운동과 저장 루틴은 같은 세션 중단 API를 사용합니다. 강제 종료나 앱 전환은 중단 요청을 보내지 않고 기존 세션 이어 하기를 유지합니다.

## 요청

`POST /api/exercise/sessions/{session_id}/stop`

- 기존 API와 같은 Bearer 인증을 사용합니다.
- `session_id`는 운동 시작 응답의 `session.exercise_session_id`입니다.
- 요청 본문은 없습니다. 사용자 ID와 운동 출처는 받지 않습니다. 서버가 인증 사용자와 세션 소유권을 확인하고 운동 출처를 판별합니다.

## 성공 응답

HTTP `200`:

```json
{
  "ok": true,
  "result": {
    "session": {
      "exercise_session_id": "00000000-0000-4000-8000-000000000001",
      "status": "stopped",
      "completed_item_count": 1,
      "skipped_item_count": 2,
      "completion_rate": 33.33
    },
    "logs": [
      { "completed": true, "skipped": false },
      { "completed": false, "skipped": true },
      { "completed": false, "skipped": true }
    ]
  }
}
```

`session`에는 기존 세션 행의 다른 필드도 포함되며, `logs`에는 실제 완료한 항목과 건너뛴 항목이 모두 담깁니다. 중단 전에 기록한 완료 항목은 그대로 보존하고, 기록하지 않은 항목만 `skipped=true`와 사유 `사용자가 운동 중단`으로 기록합니다. 이미 `stopped`인 같은 세션에 다시 요청하면 새 로그를 만들지 않고 HTTP `200`으로 현재 상태를 돌려줍니다. 네트워크 응답을 받지 못했을 때 같은 요청을 안전하게 재시도할 수 있습니다.

중단된 추천 운동에는 완료 보상 +5점을 주지 않습니다. 완료 항목의 시간은 기존 주간 건강 운동 집계에 남습니다.

## 오류 응답

| HTTP | `detail.code` | 의미와 앱 처리 |
| --- | --- | --- |
| 401 | 기존 인증 오류 | 로그인 상태를 확인합니다. |
| 404 | `EXERCISE_SESSION_NOT_FOUND` | 없는 세션 또는 다른 사용자 세션입니다. 로컬 세션을 바로 지우지 말고 상태를 다시 확인합니다. |
| 409 | `EXERCISE_SESSION_NOT_STOPPABLE` | 이미 완료했거나 건너뛴 세션입니다. 최신 세션을 다시 조회합니다. |
| 422 | FastAPI 경로 검증 오류 | `session_id`가 UUID가 아닙니다. |
| 502 | `EXERCISE_SESSION_STOP_UNAVAILABLE` | DB 연결·RPC·응답 오류입니다. 화면을 유지하고 같은 요청을 다시 시도합니다. |

오류 형태는 `{"detail":{"code":"..."}}`입니다.

## 앱 연결 순서

1. 사용자가 **운동 중단**을 누르면 진행 중인 세션 ID로 위 API를 호출합니다. 추천 운동과 저장 루틴 모두 같은 경로입니다.
2. HTTP `200`이고 `result.session.status`가 `stopped`일 때만 기기의 이어 하기 세션을 지우고 운동 화면을 닫습니다.
3. 요청 실패나 응답 대기 중에는 화면과 로컬 세션을 보존합니다. 중복 탭은 막고, 실패 시 다시 시도 버튼을 보여 줍니다.
4. 앱 강제 종료·백그라운드 전환은 이 API를 호출하지 않습니다. 재실행 시 기존 최근 세션 조회 경로로 이어 합니다.

## 배포 순서

1. 운영 DB에 `20261123011515_stop_exercise_session.sql`을 적용합니다.
2. 이 변경이 포함된 `back-end` 커밋을 서버 담당자가 배포합니다.
3. OpenAPI에서 경로가 노출되고 실제 중단 응답이 확인된 뒤 프론트가 연결합니다.

로컬 검증: `backend/tests/exercise_stop_sql.mjs`에서 두 운동 출처·소유권·기록 보존·중복 재시도를 확인하고, `backend/tests/test_main.py`에서 HTTP 계약을 확인합니다.
