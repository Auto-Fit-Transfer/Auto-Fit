# 서버 운영 전달사항 · 운동 중 이상 증상 안전 처리

작성일: 2026-11-09

대상: Auto-Fit AI Server 운영 담당자

## 결론

AI Server `POST /chat/orchestrate`의 운동 중 증상 계약이 보강됐다. 직접 신고 화면의 `아파요`, `어지러워요`, `숨쉬기 힘들어요`는 운동 중 활성 세션 context가 있을 때 즉시 stop action을 반환한다. `뻐근해요`, `찌릿해요`와 구체적인 경미 증상은 기존 확인 후 조정 흐름을 유지한다.

이번 변경에 새로운 환경변수, DB migration 또는 외부 API Key는 없다. 배포 후 AI Server 응답과 로그만 확인하고, DB 적용 검증은 Backend 배포 이후 E2E에서 수행한다.

## 배포 대상

- 브랜치: `ai`
- AI endpoint: `POST /chat/orchestrate`
- Chat 계약 예제 버전: `1.4`
- OpenAI 호출: 운동 중 증상 판정에서는 호출하지 않음

배포 커밋은 아직 생성하지 않았다. 사용자가 AI Server 로컬 경로와 `origin/ai` 푸시 대상을 다시 확인한 뒤 별도 커밋한다.

## 배포 후 기본 확인

1. `GET /health`가 `200`인지 확인한다.
2. 배포 `/openapi.json`에서 기존 `POST /chat/orchestrate`가 유지되는지 확인한다.
3. 서버 간 Bearer 인증을 사용해 아래 세 요청을 한 번씩 호출한다.
4. 같은 시각 로그에서 OpenAI 요청이 발생하지 않았는지 확인한다.
5. 응답이나 로그에 사용자 개인정보·원본 건강 수치가 기록되지 않는지 확인한다.

요청의 `active_exercise_session`은 실제 운영 사용자 정보가 아닌 테스트용 UUID와 최소 snapshot을 사용한다.

```json
{
  "content": "아파요",
  "history": [],
  "context": {
    "active_exercise_session": {
      "session_id": "11111111-1111-1111-1111-111111111111",
      "plan_session_id": "22222222-2222-2222-2222-222222222222",
      "status": "in_progress",
      "current_exercise_item_id": "33333333-3333-3333-3333-333333333333",
      "current_exercise_name": "스쿼트",
      "remaining_exercise_item_ids": [
        "44444444-4444-4444-4444-444444444444"
      ],
      "version": "session-version-1"
    }
  },
  "pending_action": null
}
```

`content`를 각각 다음 값으로 바꿔 확인한다.

- `아파요`
- `어지러워요`
- `숨쉬기 힘들어요`

## 기대 응답

세 요청 모두 다음 조건을 만족해야 한다.

- HTTP `200`
- `intent=exercise_session_discomfort`
- `action=exercise_session_stop`
- `action_status=ready_for_backend_apply`
- `requires_backend_apply=true`
- `pending_action=null`
- `data.discomfort_event.action_taken=stop`
- `data.event_recording.required=true`
- `data.event_recording.mode=append_only`
- `data.safety_guidance.allow_resume=false`
- `data.safety_guidance.allow_replacement=false`
- `data.safety_guidance.emergency_number=119`

`아파요`의 `risk_level`은 `caution`일 수 있다. 직접 선택을 의료 응급상태로 단정하지 않기 위한 정상 동작이다. 119 안내는 응답의 `emergency_signs`에 해당하는 조건부 안내다.

## 회귀 확인

다음 요청은 즉시 stop으로 오분류되면 안 된다.

```json
{
  "content": "오른쪽 무릎이 살짝 찌릿해",
  "history": [],
  "context": {
    "active_exercise_session": {
      "session_id": "11111111-1111-1111-1111-111111111111",
      "plan_session_id": "22222222-2222-2222-2222-222222222222",
      "status": "in_progress",
      "current_exercise_item_id": "33333333-3333-3333-3333-333333333333",
      "current_exercise_name": "스쿼트",
      "remaining_exercise_item_ids": [
        "44444444-4444-4444-4444-444444444444"
      ],
      "version": "session-version-1"
    }
  },
  "pending_action": null
}
```

기대값:

- `action=confirm_exercise_adjustment`
- `action_status=awaiting_confirmation`
- `requires_backend_apply=false`
- `pending_action.action=exercise_session_adjust`

## 운영 주의사항

- AI Server는 DB를 직접 변경하거나 사건을 저장하지 않는다.
- `event_recording`은 Backend에 대한 기록 지시다.
- Backend가 아직 `/chat/orchestrate`와 action 필드를 연결하지 않았다면 앱 화면 E2E는 완료되지 않는다.
- Backend의 기존 discomfort RPC가 주간 추천 전체를 취소할 수 있으므로 보정 전 stop 적용 시험을 운영 사용자에게 수행하지 않는다.
- Frontend는 stop 응답에서 재개·대체 운동 버튼을 표시하면 안 된다.
- 장애가 발생해도 운동 계속을 권하는 fallback을 만들지 않는다.

## 로컬 검증 결과

- 관련 pytest: `41 passed`
- Python compile: 통과
- Chat 계약 JSON parse: 통과
- `git diff --check`: 통과

실제 모바일 E2E는 Backend pending action API, append-only 사건 기록, 현재 세션 한정 stop transaction, Frontend action 카드가 모두 배포된 뒤 수행한다.
