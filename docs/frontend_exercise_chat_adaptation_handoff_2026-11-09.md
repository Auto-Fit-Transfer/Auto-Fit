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

현재 운동 화면의 `몸이 불편해요` 기능은 선택값과 관계없이 `actionTaken: "adjust"`를 전송한다. 심각도 8인 “아파요”도 같은 조정으로 처리되므로 새 안전 정책과 통일해야 한다.

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

수정 필요:

1. `severity=8`인 “아파요”를 무조건 `adjust`로 보내지 않는다.
2. 어지럼과 호흡곤란 선택지를 추가한다.
3. 고위험 선택은 대체 운동 없이 중단 경로로 보낸다.
4. 경미한 조정도 적용 전 사용자 확인을 받는다.
5. 실제 종목 교체가 아니라 강도·볼륨 축소라면 버튼 문구를 “남은 운동 강도 낮추기”로 표시한다.

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
