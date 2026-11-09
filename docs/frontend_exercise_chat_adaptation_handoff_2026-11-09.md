# Frontend 전달사항 · 운동 중 챗봇 능동 조정

작성일: 2026-11-09

대상: Auto-Fit React Native 담당자

호출 원칙: Frontend → Backend → AI Server

## 결론

운동 중 챗봇에서 사용자가 통증·피로·어지럼·호흡 불편을 말하면 운동을 먼저 일시정지하고, Backend가 반환한 구조화 action에 따라 추가 질문·조정 확인·세션 중단 화면을 표시해야 한다.

Frontend는 AI Server를 직접 호출하거나 `AI_SERVER_API_KEY`를 보관하지 않는다. 답변 문구를 파싱해 동작을 추론하지 않고 Backend가 전달한 `action`, `action_status`, `requires_backend_apply`, `action_data`를 사용한다.

## 현재 화면과의 차이

현재 채팅은 주로 `content` 문자열만 표시하며 다음 구조화 상태를 사용하지 않는다.

- `action`
- `action_status`
- `requires_backend_apply`
- `action_data`
- `pending_action_id`

2026-11-09 Frontend 작업본에서는 `어지러워요`, `숨쉬기 힘들어요` 선택지가 추가됐고 `아파요·어지러워요·숨쉬기 힘들어요`는 로컬 중단, `뻐근해요·찌릿해요`는 사용자가 “남은 운동 강도 낮추기”를 눌렀을 때만 조정하는 흐름으로 바뀌었다. 이 방향은 AI Server 정책과 일치한다. 남은 작업은 Backend action 계약 연결, 안전 사건 기록, 새로고침 복원이다.

## 권장 사용자 흐름

```text
진행 중 운동 화면
→ 운동 중 챗봇 진입
→ 타이머 즉시 일시정지
→ 증상 메시지 전송
→ 추가 질문 또는 조정 확인 카드
→ Backend 적용
→ 최신 운동 세션 재조회
→ 사용자가 명시적으로 재개
```

운동 화면에서 여는 챗봇에는 “운동 중 불편함 상담” 진입 버튼을 두는 것이 안전하다. 일반 채팅 화면에서 단순 키워드만 보고 로컬 운동을 임의 중단하는 별도 판정 로직은 만들지 않는다.

## 채팅 타입 확장

기존 메시지와 호환되도록 다음을 모두 optional로 추가한다.

```ts
type ChatActionStatus =
  | 'completed'
  | 'needs_input'
  | 'awaiting_confirmation'
  | 'ready_for_backend_apply'
  | 'unable_to_apply';

type ExerciseChatAction =
  | 'need_exercise_session_context'
  | 'need_exercise_symptom_details'
  | 'confirm_exercise_adjustment'
  | 'exercise_adjustment_cancelled'
  | 'exercise_session_adjust'
  | 'exercise_session_stop';

type ChatMessage = {
  // 기존 필드 유지
  action?: ExerciseChatAction | string | null;
  action_status?: ChatActionStatus | null;
  requires_backend_apply?: boolean;
  action_data?: Record<string, unknown> | null;
  pending_action_id?: string | null;
};
```

stop action의 `action_data`에는 다음 구조를 optional로 정의한다.

```ts
type ExerciseSafetyGuidance = {
  level: 'stop';
  risk_level: 'caution' | 'emergency';
  title: string;
  immediate_action: string;
  medical_advice: string;
  emergency_signs: string[];
  emergency_action: string;
  emergency_number: '119';
  allow_resume: false;
  allow_replacement: false;
};

type ExerciseEventRecording = {
  required: boolean;
  mode: 'append_only';
  independent_of_session_apply: boolean;
};
```

Frontend는 AI의 원본 `pending_action` 전체를 신뢰 가능한 승인 정보로 저장하지 않는다. Backend가 반환한 `pending_action_id`만 확인/취소 요청에 사용한다.

## Action별 UI

| action | 화면 처리 |
|---|---|
| `need_exercise_session_context` | “운동 정보를 새로 불러오는 중” 표시, 최신 세션 재조회. 자동 재개 금지 |
| `need_exercise_symptom_details` | 증상·부위·0~10 정도 입력 UI 표시 |
| `confirm_exercise_adjustment` | “남은 운동 조정하기”와 “조정 취소” 버튼 표시 |
| `exercise_adjustment_cancelled` | 조정 취소 안내. 운동은 일시정지 상태 유지 |
| `exercise_session_adjust` | 적용 완료 후 최신 세션을 재조회하고 변경 항목 표시 |
| `exercise_session_stop` | action status와 관계없이 로컬 운동을 즉시 중단하고 고위험 안내와 “운동 종료”만 표시. 재개·대체 운동 버튼 숨김 |

`action_status=ready_for_backend_apply`가 Frontend에 보인다고 직접 AI 결과를 적용하지 않는다. Backend가 DB transaction을 완료한 최종 응답을 받은 뒤 화면 상태를 갱신한다.

`exercise_session_stop`에서는 `action_data.safety_guidance`를 렌더링한다. `message` 문자열에서 “119”, “중단”, “대체 운동”을 검색해 버튼을 결정하지 않는다. `allow_resume=false`, `allow_replacement=false`이면 두 버튼을 모두 숨긴다.

`action_data.event_recording.required=true`는 Backend의 사건 기록 책임을 나타낸다. Frontend가 AI Server에 직접 기록하거나 AI payload를 DB 저장 형식으로 재조립하지 않는다. Backend 응답에 기록 실패 상태가 있더라도 화면의 로컬 중단 상태는 유지한다.

## 추가 정보 입력 UI

`need_exercise_symptom_details`의 `action_data.missing_fields`를 이용한다.

가능한 값:

- `symptom_type`
- `severity`
- `body_areas`

권장 입력:

- 증상: 통증, 피로, 어지럼, 호흡 불편, 기타
- 부위: 복수 선택 가능
- 정도: 0~10

사용자가 입력을 완료하면 자연어를 임의 조합하기보다 Backend와 합의한 구조화 입력을 채팅 메시지와 함께 전달하는 방식을 권장한다. 현재 Backend 채팅 계약이 문자열만 받는다면 우선 “오른쪽 무릎 통증, 3/10”처럼 명확한 문자열로 전달하고 이후 DTO를 확장한다.

## 타이머와 세션 상태

### 일시정지

토글 함수는 빠른 연속 입력에서 다시 재생될 수 있다. `togglePause()`만 재사용하지 말고 다음 성질을 가진 idempotent `pauseSession()`을 둔다.

- 이미 일시정지면 아무 동작도 하지 않는다.
- 운동 중 챗봇 진입 시 한 번만 실행한다.
- 네트워크 오류가 나도 자동 재개하지 않는다.
- 조정 취소도 자동 재개하지 않는다.

### 적용 완료

Backend 적용 성공 후 `GET /api/exercise/sessions/latest` 또는 Backend가 정한 현재 세션 조회 API로 최신 상태를 가져온다.

- `adjusted_items`가 있으면 기존 `ExerciseSessionContext`에 ID 기준으로 병합한다.
- 현재 item이 건너뛰어졌으면 다음 미완료 item으로 이동한다.
- `stop` 성공이면 로컬 운동 상태를 종료 상태로 맞춘다.
- 사용자가 직접 재개를 선택하기 전에는 타이머를 시작하지 않는다.

## 기존 `몸이 불편해요` 화면 통일

챗봇과 기존 불편 신고 화면이 서로 다른 안전 정책을 사용하면 안 된다.

확정 매핑:

| 화면 선택값 | 화면 처리 | 서버 처리 |
|---|---|---|
| `아파요` | 즉시 로컬 중단. 재개·대체 운동 버튼 숨김 | Backend에 stop 사건 기록 요청. 의료 응급상태로 단정하지 않음 |
| `어지러워요` | 즉시 로컬 중단. 재개·대체 운동 버튼 숨김 | Backend에 stop 사건 기록 요청 |
| `숨쉬기 힘들어요` | 즉시 로컬 중단. 재개·대체 운동 버튼 숨김 | Backend에 stop 사건 기록 요청 |
| `뻐근해요` | 일시정지 유지 후 “남은 운동 강도 낮추기” 표시 | 사용자가 버튼을 눌렀을 때만 adjust 요청 |
| `찌릿해요` | 일시정지 유지 후 “남은 운동 강도 낮추기” 표시 | 사용자가 버튼을 눌렀을 때만 adjust 요청 |

이 표는 정도 입력이 없는 직접 선택 화면 전용 정책이다. 챗봇 자연어에서 “오른쪽 무릎이 살짝 아파요”처럼 부위·정도가 있는 입력은 AI의 추가 질문·확인 흐름을 따른다.

중단 안내 문구:

> 즉시 운동을 멈추고 넘어지지 않도록 앉거나 편한 자세를 취해 주세요. 증상이 심하거나 계속되면 의료진과 상담해 주세요. 가슴 통증·압박, 실신할 것 같은 느낌, 의식 변화 또는 말하기 힘들 정도의 호흡곤란이 있으면 주변에 도움을 요청하고 119에 연락해 주세요.

문구는 `action_data.safety_guidance` 필드별로 표시하며, 위 문장을 소스 코드에 별도 중복 저장하지 않는 것을 권장한다.

## Pending action 확인·취소 호출

Backend가 다음 공개 API를 제공하면 `pending_action_id`만 사용해 호출한다.

```http
POST /api/chats/{chat_id}/pending-actions/{pending_action_id}/confirm
POST /api/chats/{chat_id}/pending-actions/{pending_action_id}/cancel
```

```json
{
  "idempotency_key": "클라이언트가 생성한 UUID"
}
```

- 확인·취소 버튼을 누른 즉시 같은 idempotency key로 요청 상태를 고정한다.
- timeout 뒤 새 pending action을 만들지 않고 같은 key로 재시도하거나 Backend 상태를 조회한다.
- `409`이면 최신 세션과 채팅 action을 다시 조회한다.
- 취소 성공, 실패 또는 네트워크 오류 모두 운동을 자동 재개하지 않는다.
- AI의 원본 `pending_action` JSON은 Frontend 저장소에 보관하거나 다시 보내지 않는다.

## 오류와 중복 처리

- 확인 버튼을 누른 즉시 비활성화하고 요청 ID를 유지한다.
- timeout 후 같은 요청을 무작정 새로 생성하지 말고 Backend에서 적용 상태를 조회한다.
- 409 또는 세션 version 불일치 응답이면 최신 세션을 다시 불러온다.
- AI/Backend 5xx에서는 “운동을 계속하세요”라는 fallback을 표시하지 않는다.
- 채팅 화면을 닫아도 일시정지 상태를 유지한다.
- 앱 재실행·새로고침 시 Backend 저장 action과 현재 운동 세션을 복원한다.

## 접근성과 문구

- 위험 안내는 색상만으로 구분하지 않고 아이콘·제목·본문을 함께 사용한다.
- 중단 화면에서 대체 운동 추천 CTA를 표시하지 않는다.
- “AI가 진단했다”는 표현을 사용하지 않는다.
- “증상에 따라 안전을 위해 운동을 중단했습니다”처럼 일반 안전 안내로 표현한다.
- 응급 안내 번호와 문구는 출시 국가 정책을 Backend/기획과 최종 확인한다.

## Frontend 테스트 체크리스트

- [ ] 운동 중 챗봇 진입 시 타이머가 한 번만 정지한다.
- [ ] 일반 채팅 진입은 운동 상태를 잘못 변경하지 않는다.
- [ ] 정보 부족 응답에서 필요한 입력 UI가 표시된다.
- [ ] 경미한 증상에서 확인 전 운동 계획이 변경되지 않는다.
- [ ] 조정 확인·취소 버튼이 중복 요청을 만들지 않는다.
- [ ] 조정 취소 후 운동이 자동 재개되지 않는다.
- [ ] 고위험 응답에서는 재개·대체 운동 버튼이 표시되지 않는다.
- [ ] 직접 선택 `아파요·어지러워요·숨쉬기 힘들어요`는 모두 즉시 로컬 중단된다.
- [ ] `뻐근해요·찌릿해요`는 명시적 버튼 입력 전 adjust 요청을 보내지 않는다.
- [ ] `safety_guidance`를 필드로 렌더링하고 `message`를 파싱하지 않는다.
- [ ] pending 확인·취소 요청은 동일 idempotency key로 중복 적용되지 않는다.
- [ ] stop 기록 실패 또는 네트워크 오류에도 중단 화면이 유지된다.
- [ ] 적용 성공 후 최신 세션과 변경 item이 표시된다.
- [ ] 네트워크·AI 장애 시 자동 재개되지 않는다.
- [ ] 새로고침 후 action과 운동 세션 상태가 복원된다.
- [ ] 기존 식단·러닝·건강 챗봇 메시지가 정상 표시된다.

## E2E 완료 기준

1. 스쿼트 진행 중 운동 챗봇을 연다.
2. 타이머가 즉시 일시정지된다.
3. “오른쪽 무릎이 살짝 찌릿해”를 보낸다.
4. 조정 확인 카드를 보고 사용자가 승인한다.
5. 현재 운동 건너뛰기 또는 남은 운동 축소 결과가 표시된다.
6. 다른 날짜 운동은 변경되지 않는다.
7. “운동 중 가슴 통증이 있어”에서는 운동 종료 안내만 표시된다.

## 아직 지원하지 않는 범위

이번 단계는 현재 운동 건너뛰기, 남은 운동 강도·운동량 축소, 현재 세션 중단까지 지원한다. 실제 운동 종목 자동 교체는 검증된 금기 부위와 대체 운동군 메타데이터가 운동 CSV에 추가된 뒤 별도 계약으로 연결한다.
