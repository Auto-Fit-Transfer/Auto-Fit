# Backend 전달사항 · 운동 중 챗봇 능동 조정

작성일: 2026-11-09

대상: Auto-Fit Backend 담당자

AI endpoint: `POST /chat/orchestrate`

## 결론

AI Server에는 운동 중 증상을 결정론적으로 판정해 현재 세션의 조정 또는 중단을 제안하는 계약이 추가됐다. AI Server는 DB를 직접 변경하지 않는다. Backend가 인증된 사용자의 활성 세션을 전달하고, 반환된 구조화 action을 검증한 뒤 현재 `plan_session_id`에만 적용해야 한다.

현재 앱 채팅은 Backend 자체 `answer_question()`을 먼저 사용하고 일부 질문만 legacy `POST /chat`으로 보낸다. `AIEndpoint.CHAT = "/chat/orchestrate"` 선언은 있으나 실제 호출되지 않으므로 이 adapter 연결이 먼저 필요하다.

전체 공통 계약과 실행 예제는 다음 파일을 함께 확인한다.

- [Chat API Backend Contract](chat_api_contract.md)
- [Chat API examples](chat_api_contract_examples.json)
- 배포 후 `GET /openapi.json`

## AI Server 구현 범위

추가된 intent:

- `exercise_session_discomfort`

추가된 action:

- `need_exercise_session_context`
- `need_exercise_symptom_details`
- `confirm_exercise_adjustment`
- `exercise_adjustment_cancelled`
- `exercise_session_adjust`
- `exercise_session_stop`

안전 판정은 OpenAI를 호출하지 않는다. 가슴 통증·압박, 실신 또는 심한 어지럼, 심한 호흡곤란, 비정상 심계항진, 심한 통증은 대체 운동 없이 `exercise_session_stop`으로 처리한다. 기존 직접 신고 화면처럼 정도·부위를 함께 받지 않는 화면에서 정확히 `아파요`, `어지러워요`, `숨쉬기 힘들어요` 중 하나를 선택한 경우에도 의료 진단이 아닌 보수적 UI 정책으로 중단한다. `조금 아파요`처럼 정도가 포함된 자연어는 이 완전 일치 정책에 포함하지 않고 기존 추가 질문·조정 확인 흐름을 유지한다. 경미한 증상은 사용자 확인 전에는 적용 가능한 action을 반환하지 않는다.

안전 중단 기준은 일반적인 운동 안전 지침을 보수적으로 적용한 것이며 의료 진단이 아니다.

- [질병관리청 국가건강정보포털 · 운동 중 어지럼·호흡곤란 시 운동 중단 안내](https://health.kdca.go.kr/healthinfo/biz/health/gnrlzHealthInfo/gnrlzHealthInfo/gnrlzHealthInfoView.do?cntnts_sn=6691)
- [소방청 · 응급환자 주요 증상 안내](https://www.nfa.go.kr/nfa/news/pressrelease/explanation/?cntId=44&mode=view)

## 요청 연결

### 실제 앱 채팅 경로 변경

현재:

```text
POST /api/chats/{chat_id}/messages
→ Backend answer_question()
→ 일부 질문만 AI Server POST /chat
```

필요한 흐름:

```text
운동 중 증상 메시지
→ Backend에서 인증 사용자의 활성 세션 조회
→ POST /chat/orchestrate
→ action 검증
→ 확인 대기 또는 현재 세션 transaction 적용
→ 채팅 응답과 최신 운동 세션 반환
```

기존 DB 기반 건강점수·기록 조회와 legacy 일반 답변을 한 번에 제거할 필요는 없다. 최소 변경은 운동 중 증상 요청과 구조화 action이 필요한 요청만 `/chat/orchestrate` adapter로 보내는 방식이다.

### 활성 세션 snapshot

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

필드 규칙:

| 필드 | 규칙 |
|---|---|
| `session_id` | 인증 사용자의 현재 운동 세션 UUID |
| `plan_session_id` | 오늘 수행 중인 계획 세션 UUID |
| `status` | `in_progress` 또는 `paused` |
| `current_exercise_item_id` | 현재 운동 item UUID. 세트 사이 등 대상이 없으면 `null` 가능 |
| `current_exercise_name` | 화면 표시명. 판단의 식별 키로 사용하지 않음 |
| `remaining_exercise_item_ids` | 현재 계획 세션에 속한 미완료 item만 포함 |
| `version` | 세션 변경 감지용 불투명 문자열. `updated_at` 또는 row version을 안정적으로 직렬화해 사용 |

사용자 ID, 이름, 이메일, 원본 건강검진 수치, 자유 형식 개인정보는 AI 요청에 넣지 않는다.

## Action 처리

| AI action | Backend 처리 |
|---|---|
| `need_exercise_session_context` | DB 변경 없이 최신 활성 세션을 다시 조회한다. 운동을 자동 재개하지 않는다. |
| `need_exercise_symptom_details` | 추가 질문을 저장·전달한다. DB 운동량은 변경하지 않는다. |
| `confirm_exercise_adjustment` | `pending_action`을 서버에 저장하고 확인 또는 취소를 기다린다. |
| `exercise_adjustment_cancelled` | pending action을 폐기한다. 취소를 운동 재개로 처리하지 않는다. |
| `exercise_session_adjust` | `ready_for_backend_apply`와 `requires_backend_apply=true`를 확인한 뒤 현재 세션에만 적용한다. |
| `exercise_session_stop` | 화면 운동은 즉시 중단한다. `data.safety_guidance`와 `data.discomfort_event`를 전달하고, `data.event_recording.required=true`이면 세션 변경 성공 여부와 독립적으로 사건을 append-only 기록한다. `ready_for_backend_apply`이면 현재 세션에만 적용하고, `unable_to_apply`이면 최신 세션을 조회한다. 다른 날짜 세션과 추천 전체는 유지한다. |

사용자 표시용 `message` 문구를 파싱해서 동작을 추론하지 않는다.

## Pending action 보관

AI 응답의 운동 조정 pending payload 예시:

```json
{
  "action": "exercise_session_adjust",
  "session_id": "11111111-1111-1111-1111-111111111111",
  "plan_session_id": "22222222-2222-2222-2222-222222222222",
  "exercise_item_id": "33333333-3333-3333-3333-333333333333",
  "session_version": "session-version-1",
  "symptom_type": "pain",
  "severity": 3,
  "body_areas": ["오른쪽 무릎"],
  "adjustment_strategy": "skip_current_and_reduce_remaining"
}
```

Frontend가 이 JSON을 신뢰 가능한 승인 정보로 보관하지 않도록 Backend 서버 저장을 권장한다.

권장 저장 항목:

- `user_id`
- `chat_id`
- `session_id`
- `plan_session_id`
- `exercise_item_id`
- action payload
- 세션 version
- `expires_at`
- `consumed_at`
- idempotency key

확인 메시지를 AI Server로 보낼 때는 서버에서 조회한 미소비 pending payload와 최신 활성 세션 snapshot을 함께 전송한다.

## Frontend용 pending action 확인·취소 API

`pending_action_id`는 AI Server 필드가 아니라 Backend가 저장된 payload에 부여하는 불투명 ID다. Frontend가 AI의 원본 `pending_action`을 다시 보내지 않도록 다음 공개 API를 제공한다.

```http
POST /api/chats/{chat_id}/pending-actions/{pending_action_id}/confirm
POST /api/chats/{chat_id}/pending-actions/{pending_action_id}/cancel
Content-Type: application/json
```

두 endpoint의 요청은 동일하게 idempotency key만 받는다.

```json
{
  "idempotency_key": "클라이언트가 생성한 UUID"
}
```

확인 처리:

1. 인증 사용자와 `chat_id`, `pending_action_id`의 소유권을 확인한다.
2. 미소비·미만료 상태와 idempotency key를 확인한다.
3. 저장된 원본 pending payload와 최신 활성 세션 snapshot을 조회한다.
4. AI Server `POST /chat/orchestrate`에 `content="네"`, 최신 context, 저장된 `pending_action`을 전달한다.
5. AI 응답과 최신 세션의 ID·version을 다시 검증한 뒤 현재 계획 세션에만 적용한다.
6. 같은 transaction에서 pending action을 소비 처리하고 최신 세션을 반환한다.

취소 처리:

1. 같은 소유권·미소비·미만료·idempotency 검증을 수행한다.
2. AI Server에는 `content="취소"`, 저장된 pending payload, 최신 context를 전달한다.
3. pending action만 소비 처리한다. 운동을 자동 재개하거나 계획을 변경하지 않는다.

두 endpoint는 중복 요청에 동일 결과를 반환해야 하며, 세션 version이 달라진 경우 `409`와 최신 세션 재조회 정보를 반환한다.

## 적용 전 필수 검증

Backend는 AI 응답을 신뢰해 바로 수정하지 않고 다음을 모두 확인한다.

1. 요청 사용자 소유 세션이다.
2. 세션이 `in_progress` 또는 합의된 `paused` 상태다.
3. `session_id`, `plan_session_id`, version이 pending action과 일치한다.
4. `exercise_item_id`가 현재 `plan_session_id`에 속한다.
5. pending action이 미소비·미만료 상태다.
6. 같은 action이 이미 적용되지 않았다.
7. `action_status=ready_for_backend_apply`다.
8. `requires_backend_apply=true`다.

검증 실패 시 DB를 변경하지 않고 최신 세션 context로 다시 요청한다.

## 기존 discomfort RPC 필수 보정

현재 `record_exercise_discomfort` RPC는 `plan_session_id`가 아니라 `exercise_recommendation_id` 전체를 대상으로 남은 item을 수정한다. 이 상태로 챗봇 action을 연결하면 오늘 운동 조정이 다른 날짜의 운동까지 축소하거나 건너뛸 수 있다. `stop`은 추천 전체를 `cancelled`로 만들 가능성도 있다.

기존 배포 migration을 수정하지 말고 신규 migration에서 함수를 교체한다.

필수 조건:

1. item 소속 검증에 현재 `plan_session_id`를 포함한다.
2. `adjust` update 대상에 현재 `plan_session_id`를 포함한다.
3. `stop` 시 생성하는 skip log도 현재 `plan_session_id`로 제한한다.
4. 오늘 세션 중단이 주간 추천 전체를 `cancelled`로 변경하지 않게 한다.
5. legacy 단일 세션 구조만 별도 호환 정책을 명시한다.
6. 적용과 discomfort 기록을 하나의 transaction으로 처리한다.

`adjustment_strategy=skip_current_and_reduce_remaining`이면 현재 item 건너뛰기와 남은 item 축소를 같은 transaction에서 처리한다. 안전한 item skip 연산이 아직 없다면 조정 완료로 응답하지 말고 해당 연산부터 추가한다.

## 기존 discomfort 요청 매핑

`data.discomfort_event`는 현재 Backend에 이미 존재하는 `POST /api/exercise/sessions/{session_id}/discomfort` 요청 필드로 다음과 같이 매핑한다.

```json
{
  "exercise_item_id": "33333333-3333-3333-3333-333333333333",
  "symptom_type": "pain",
  "severity": 3,
  "body_areas": ["오른쪽 무릎"],
  "detail": null,
  "action_taken": "adjust"
}
```

`exercise_session_stop`에서는 `action_taken=stop`을 사용한다. AI의 자유 문장을 `detail`에 자동 저장하지 않는다.

AI stop 응답에는 다음 기록 정책도 함께 온다.

```json
{
  "event_recording": {
    "required": true,
    "mode": "append_only",
    "independent_of_session_apply": true
  }
}
```

이는 현재 세션 중단 transaction이 실패하거나 활성 세션 context가 없는 경우에도 안전 사건 자체는 기록해야 한다는 의미다. 다만 현재 `/api/exercise/sessions/{session_id}/discomfort`가 호출하는 `record_exercise_discomfort` RPC는 기록과 계획 변경을 함께 수행하므로, 아래 보정이 완료되기 전 `action_taken=stop`을 그대로 호출하면 안 된다.

신규 migration에서 다음 두 책임을 분리한다.

1. append-only discomfort event insert: 운동 계획·추천 상태를 변경하지 않는다.
2. current-session stop/adjust transaction: 인증 사용자 소유의 현재 `session_id + plan_session_id` 범위만 변경한다.

AI 응답의 `requires_backend_apply=false`는 세션 변경을 적용할 수 없다는 뜻이지, `event_recording.required=true`인 사건 기록까지 생략하라는 뜻이 아니다.

## 구조화 안전 안내 전달

`exercise_session_stop`의 `data.safety_guidance`를 그대로 Frontend DTO에 전달한다. `message`를 파싱하거나 Backend가 새 문구를 임의 생성하지 않는다.

```json
{
  "level": "stop",
  "risk_level": "caution",
  "title": "운동을 중단해 주세요",
  "immediate_action": "즉시 운동을 멈추고 넘어지지 않도록 앉거나 편한 자세를 취해 주세요.",
  "medical_advice": "증상이 심하거나 계속되면 의료진과 상담해 주세요.",
  "emergency_signs": [
    "가슴 통증 또는 압박",
    "실신할 것 같은 느낌 또는 의식 변화",
    "말하기 힘들 정도의 호흡곤란"
  ],
  "emergency_action": "응급 신호가 있으면 주변에 도움을 요청하고 119에 연락해 주세요.",
  "emergency_number": "119",
  "allow_resume": false,
  "allow_replacement": false
}
```

`risk_level`은 입력에 따라 `caution` 또는 `emergency`가 될 수 있다. 119 안내는 `emergency_signs` 조건부 문구로 표시하며, 단순 `아파요` 선택을 의료 응급상태로 단정하지 않는다.

## 채팅 저장 계약

현재 `chat_messages`는 구조화 action을 완전히 보존하지 않는다. 새로고침 후에도 확인 상태가 유지되도록 선택 필드를 확장한다.

- `action`
- `action_status`
- `requires_backend_apply`
- `action_data`
- `pending_action_id`

기존 메시지와의 하위 호환을 위해 nullable로 추가한다. `save_chat_exchange`, 조회 DTO와 `ChatStore.MESSAGE_FIELDS`도 함께 갱신한다.

## 장애 처리

- AI timeout, 5xx, 잘못된 응답: 운동을 자동 재개하지 않는다.
- `need_exercise_session_context`: 기존 pending action을 적용하지 않는다.
- 중복 확인 요청: idempotency key로 한 번만 적용한다.
- 적용 후 응답 유실: 최신 세션을 조회해 실제 적용 상태를 반환한다.
- 고위험 action 적용 실패: 사용자에게 운동 중단 상태를 유지하도록 표시하고 서버 오류를 기록한다.

## Backend 테스트 체크리스트

- [ ] 실제 앱 채팅에서 `/chat/orchestrate`가 호출된다.
- [ ] 활성 세션 snapshot은 인증 사용자의 데이터로만 구성된다.
- [ ] 다른 사용자의 세션 ID로 조정·중단할 수 없다.
- [ ] 확인 전에는 운동 item이 변경되지 않는다.
- [ ] 만료·소비·중복 pending action이 차단된다.
- [ ] 세션 version 변경 시 기존 조정안이 거부된다.
- [ ] `exercise_session_adjust`가 현재 `plan_session_id`에만 적용된다.
- [ ] `exercise_session_stop`이 다른 날짜 운동과 추천 전체를 취소하지 않는다.
- [ ] stop 사건은 세션 적용 성공 여부와 독립적으로 append-only 기록된다.
- [ ] `requires_backend_apply=false`여도 `event_recording.required=true`를 누락하지 않는다.
- [ ] pending 확인·취소 endpoint가 소유권·만료·소비·idempotency·세션 version을 검증한다.
- [ ] 취소와 네트워크 오류가 운동 자동 재개로 이어지지 않는다.
- [ ] `data.safety_guidance`가 필드 손실 없이 Frontend에 전달된다.
- [ ] AI 장애나 네트워크 실패 시 운동을 자동 재개하지 않는다.
- [ ] 적용 후 최신 세션과 변경된 item을 다시 조회한다.
- [ ] 기존 식단 pending action과 러닝·건강 챗봇 기능이 회귀하지 않는다.

## E2E 완료 기준

1. 운동 진행 중 챗봇에서 “오른쪽 무릎이 살짝 찌릿해”를 전송한다.
2. 확인 전 DB가 변경되지 않는다.
3. 사용자가 조정을 확인한다.
4. 현재 운동 건너뛰기와 남은 운동 축소가 현재 계획 세션에만 반영된다.
5. 다른 날짜 운동은 변경되지 않는다.
6. “운동 중 가슴 통증이 있어”는 대체 운동 없이 현재 세션 중단으로 처리된다.
7. 새로고침 후에도 채팅 action과 운동 세션 상태가 일치한다.

## 아직 지원하지 않는 범위

실제 운동 종목 자동 교체는 이번 계약에 포함하지 않는다. 현재 CSV에는 `contraindicated_body_areas`, `joint_load`, `impact_level`, `replacement_group` 같은 검증된 안전 메타데이터가 없다. 해당 필드를 준비한 뒤 기존 운동 catalog에 존재하는 운동으로만 교체하는 2단계를 별도로 합의한다.
