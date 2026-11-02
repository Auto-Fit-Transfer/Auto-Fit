# Auto-Fit 챗봇 API 계약 (MVP)

> 2026-11-02 확장: 러닝 코스 검색, 서비스 전반의 인증된 조회, 화면 이동 근거,
> 기록 수정·삭제의 채팅 내 확인 단계를 추가했다. 세부 범위는
> [챗봇 기능 확장](chat-capabilities.md)을 따른다.

상태: 프론트엔드 공유용 확정안

기준일: 2026-09-10

구현 상태(2026-09-08): 저장 API 5개와 요청 제한 구현, 공용 서버 통합 검사 45개 완료.
`20260908012312_chat_message_storage.sql`을 Auto-Fit 프로젝트에 적용했다.
Render 배포 코드 `7e8171f`에서 실제 Auth/DB 연결을 검증했다. 프론트 화면 검증은 별도다.
요청 제한(429)과 메시지 30일 삭제는 구현했다. AI 모델 연동은 아직 미완료이다.
요청 제한 기준 및 프론트 처리는 [요청 제한](chat-rate-limits.md)을 따른다.

## 1. 범위와 결정 사항

- 챗봇은 로그인 사용자의 Supabase 데이터를 먼저 조회한다.
- DB 조회와 서버 계산만으로 충분하면 AI를 호출하지 않는다.
- 자연어 설명이나 종합 해석이 필요할 때만 DB 근거와 함께 AI를 호출한다.
- 개인 데이터가 부족하면 AI가 추측하지 않고 필요한 데이터를 안내한다.
- MVP 응답은 일반 JSON 방식이며 스트리밍은 지원하지 않는다.
- 모든 애플리케이션 데이터 요청은 FastAPI를 통한다.
- `user_id`는 요청 본문에서 받지 않고 Supabase JWT에서 결정한다.
- API 필드명은 기존 Auto-Fit API와 동일하게 `snake_case`를 사용한다.
- DB 관계는 외래키 없이 백엔드의 사용자 소유권 검사로 보호한다.
- 대화 보관기간은 메시지 생성 후 30일(720시간)이다. 만료 후 5분 주기로 삭제하며 상세는 [보관 정책](chat-retention-policy.md)을 따른다.
- 저장형 채팅의 명시적 루틴 생성 요청은 기존 운동 추천 RPC를 호출한다. `answer-preview`는 같은 요청에서도 쓰지 않고 준비 상태만 반환한다.

## 2. 공통 규칙

### 인증

모든 챗봇 API는 다음 헤더가 필요하다.

```http
Authorization: Bearer <supabase_access_token>
Content-Type: application/json
```

### 날짜와 ID

- ID는 UUID 문자열이다.
- 날짜와 시각은 ISO 8601 형식이며 시각에는 타임존을 포함한다.
- 클라이언트는 응답의 커서를 해석하거나 수정하지 않는다.

### 답변 출처

| 값 | 의미 |
| --- | --- |
| `database` | DB 조회와 서버 계산만으로 생성한 답변 |
| `database_ai` | DB 근거를 AI가 자연어로 설명한 답변 |
| `general_ai` | 개인 데이터와 무관한 일반 정보 답변 |
| `need_more_data` | 개인화 답변에 필요한 데이터가 부족한 상태 |

### 오류 형식

```json
{
  "detail": {
    "code": "CHAT_NOT_FOUND",
    "message": "채팅방을 찾을 수 없습니다.",
    "fields": null
  }
}
```

| HTTP | 코드 예시 | 의미 |
| --- | --- | --- |
| `401` | `AUTH_REQUIRED`, `INVALID_SESSION` | 로그인 또는 세션 문제 |
| `404` | `CHAT_NOT_FOUND` | 존재하지 않거나 본인 소유가 아닌 채팅방 |
| `409` | `IDEMPOTENCY_CONFLICT` | 같은 `client_message_id`에 다른 내용을 전송 |
| `409` | `CHAT_ARCHIVED` | 보관된 채팅방에 신규 메시지를 전송 |
| `422` | `VALIDATION_ERROR` | 입력값 검증 실패 |
| `429` | `RATE_LIMITED` | 사용자별 요청 제한 초과 |
| `502` | `DATA_SOURCE_ERROR`, `AI_PROVIDER_ERROR` | 외부 데이터 또는 AI 호출 실패 |

보안을 위해 다른 사용자 소유의 채팅방도 `404 CHAT_NOT_FOUND`로 응답한다.

## 3. 데이터 타입

### Chat

```json
{
  "chat_id": "00000000-0000-0000-0000-000000000000",
  "title": "건강 점수 문의",
  "status": "active",
  "created_at": "2026-09-07T10:30:00+09:00",
  "updated_at": "2026-09-07T10:32:00+09:00"
}
```

`status`는 `active` 또는 `archived`이다.

### Evidence

```json
{
  "metric": "health_score",
  "label": "건강 점수",
  "current_value": 86,
  "previous_value": 91,
  "unit": "점",
  "measured_at": "2026-09-03T09:00:00+09:00"
}
```

`previous_value`, `unit`, `measured_at`은 값이 없으면 `null`이다.

건강 점수 설명 요청에 평가 항목 근거가 있으면 최대 3개를 추가한다. 자식 테이블은
로그인 사용자의 것으로 확인된 `health_assessment_id`로만 조회한다.

```json
{
  "metric": "health_assessment_item",
  "metric_type": "blood_pressure",
  "label": "혈압",
  "current_value": 70,
  "previous_value": 90,
  "unit": "점",
  "measured_at": "2026-09-03T09:00:00+09:00",
  "evaluation_status": "attention"
}
```

이 근거는 평가 항목 점수의 동반 변화를 보여줄 뿐, 전체 점수 변화의 의학적·통계적
인과관계를 뜻하지 않는다. 항목 근거가 없으면 기존처럼
`assessment_explanation_evidence`를 요청한다.

### ChatMessage

```json
{
  "message_id": "00000000-0000-0000-0000-000000000000",
  "chat_id": "00000000-0000-0000-0000-000000000000",
  "sender_type": "assistant",
  "content": "최근 건강 점수는 이전보다 5점 낮아졌습니다.",
  "intent": "health_score_change",
  "response_source": "database",
  "needs_more_data": false,
  "evidence": [],
  "required_data": [],
  "created_at": "2026-09-07T10:32:00+09:00"
}
```

- `sender_type`: `user`, `assistant`, `system`
- 사용자 메시지의 `intent`, `response_source`는 `null`이다.
- `evidence`와 `required_data`는 값이 없어도 빈 배열로 반환한다.

## 4. 엔드포인트

### 채팅방 생성

```http
POST /api/chats
```

요청:

```json
{
  "title": null
}
```

- `title`은 선택값이며 최대 100자이다.
- 본문을 생략하거나 빈 객체를 보내도 된다.
- 제목이 없으면 서버가 첫 질문을 100자 이내로 줄여 제목으로 사용한다.

성공: `201 Created`

```json
{
  "chat": {
    "chat_id": "00000000-0000-0000-0000-000000000000",
    "title": null,
    "status": "active",
    "created_at": "2026-09-07T10:30:00+09:00",
    "updated_at": "2026-09-07T10:30:00+09:00"
  }
}
```

### 채팅방 목록

```http
GET /api/chats?status=active&limit=20&cursor=<opaque_cursor>
```

- `status`: 선택, `active` 또는 `archived`
- `limit`: 기본 20, 최소 1, 최대 50
- 정렬: `updated_at DESC`, 동률이면 `chat_id DESC`

성공: `200 OK`

```json
{
  "chats": [],
  "next_cursor": null,
  "has_more": false
}
```

홈 팝업은 `status=active&limit=1`로 최근 채팅방을 조회하고, 없으면 새 채팅방을 생성한다.

### 메시지 목록

```http
GET /api/chats/{chat_id}/messages?limit=30&before=<opaque_cursor>
```

- `limit`: 기본 30, 최소 1, 최대 100
- 첫 페이지는 최신 메시지를 조회하지만 `messages` 배열은 화면 표시 순서인 과거→최신으로 반환한다.
- `before`는 이전 메시지 페이지를 불러올 때 사용한다.

성공: `200 OK`

```json
{
  "chat_id": "00000000-0000-0000-0000-000000000000",
  "messages": [],
  "next_cursor": null,
  "has_more": false
}
```

### 질문 전송 및 답변 생성

```http
POST /api/chats/{chat_id}/messages
```

요청:

```json
{
  "client_message_id": "00000000-0000-0000-0000-000000000000",
  "content": "최근 건강 점수가 낮아졌는데 이유가 뭘까요?"
}
```

- `client_message_id`는 클라이언트가 요청마다 생성하는 UUID이며 중복 전송 방지에 사용한다.
- `content`는 앞뒤 공백을 제거한 뒤 1~500자여야 한다.
- 동일한 `client_message_id`와 같은 내용을 다시 보내면 중복 저장 없이 기존 결과를 반환한다.
- 동일한 `client_message_id`로 다른 내용을 보내면 `409 IDEMPOTENCY_CONFLICT`를 반환한다.
- 중복 ID의 범위는 사용자 단위이며, 같은 ID를 다른 채팅방에 사용해도 충돌이다.
- 이미 성공한 요청의 재전송은 채팅방을 보관한 이후에도 기존 결과를 반환한다.
- `오늘 운동 루틴 만들어줘`처럼 생성 의도가 명시되면 운동 설정과 미사용 추천 컨텍스트를 확인한 뒤 추천을 저장한다. 성공 답변의 `intent`는 `exercise_routine_generation`이고, `evidence[0]`에 `exercise_recommendation_id`와 다음 호출 경로 `/api/exercise/sessions/start`가 포함된다.
- 운동 설정 또는 추천 컨텍스트가 없으면 생성하지 않고 `need_more_data`로 응답하며 `required_data`에 `exercise_preferences` 또는 `recommendation_context`를 넣는다.

성공: `201 Created`

```json
{
  "is_replay": false,
  "chat": {
    "chat_id": "00000000-0000-0000-0000-000000000000",
    "title": "건강 점수 문의",
    "status": "active",
    "created_at": "2026-09-07T10:30:00+09:00",
    "updated_at": "2026-09-07T10:32:00+09:00"
  },
  "user_message": {
    "message_id": "00000000-0000-0000-0000-000000000001",
    "chat_id": "00000000-0000-0000-0000-000000000000",
    "sender_type": "user",
    "content": "최근 건강 점수가 낮아졌는데 이유가 뭘까요?",
    "intent": null,
    "response_source": null,
    "needs_more_data": false,
    "evidence": [],
    "required_data": [],
    "created_at": "2026-09-07T10:31:59+09:00"
  },
  "assistant_message": {
    "message_id": "00000000-0000-0000-0000-000000000002",
    "chat_id": "00000000-0000-0000-0000-000000000000",
    "sender_type": "assistant",
    "content": "최근 건강 점수는 86점으로 이전 91점보다 5점 낮아졌습니다. 점수 변화의 직접 원인으로 단정할 수는 없지만, 함께 확인된 평가 항목은 혈압 90→70점입니다.",
    "intent": "health_score_change",
    "response_source": "database",
    "needs_more_data": false,
    "evidence": [
      {
        "metric": "health_score",
        "label": "건강 점수",
        "current_value": 86,
        "previous_value": 91,
        "unit": "점",
        "measured_at": "2026-09-03T09:00:00+09:00"
      },
      {
        "metric": "health_assessment_item",
        "metric_type": "blood_pressure",
        "label": "혈압",
        "current_value": 70,
        "previous_value": 90,
        "unit": "점",
        "measured_at": "2026-09-03T09:00:00+09:00",
        "evaluation_status": "attention"
      }
    ],
    "required_data": [],
    "created_at": "2026-09-07T10:32:00+09:00"
  }
}
```

최초 성공 응답은 `201 Created`와 `is_replay=false`를 반환한다. 같은 요청의 안전한 재전송은 `200 OK`와 `is_replay=true`를 반환한다.

전송 핸들러의 처리 제한 시간은 30초이다(인증 시간 별도). 현재 DB 조회가 실패하면 502를
반환하며 질문·답변을 저장하지 않는다. 저장 결과를 받기 전에 연결이 끊기거나 시간이 초과되면
DB에는 저장되었을 수 있으므로 반드시 같은 client_message_id로 재시도한다.
AI 실패 시 대체 응답 처리는 AI 연동 단계에서 구현한다.

### 채팅방 수정

```http
PATCH /api/chats/{chat_id}
```

요청은 하나 이상의 필드를 포함해야 한다.

```json
{
  "title": "운동 기록 상담",
  "status": "archived"
}
```

- `title`: `null` 또는 앞뒤 공백 제거 후 1~100자
- `status`: `active` 또는 `archived`

성공: `200 OK`

```json
{
  "chat": {
    "chat_id": "00000000-0000-0000-0000-000000000000",
    "title": "운동 기록 상담",
    "status": "archived",
    "created_at": "2026-09-07T10:30:00+09:00",
    "updated_at": "2026-09-07T10:40:00+09:00"
  }
}
```

## 5. 프론트엔드 상태 처리

| 상황 | 프론트 처리 |
| --- | --- |
| 질문 전송 중 | 입력 잠금, 전송 버튼 비활성화, 로딩 표시 |
| `database` | 일반 AI 말풍선 표시 |
| `database_ai` | 일반 AI 말풍선 표시 |
| `general_ai` | 일반 정보임을 알려주는 보조 문구 표시 가능 |
| `need_more_data` | 답변과 함께 필요한 데이터 입력·업로드 유도 |
| 네트워크 오류 | 입력 내용을 유지하고 재시도 버튼 제공 |
| `401` | 로그인 화면으로 이동 |
| `is_replay=true` | 기존 메시지 ID를 사용하고 중복 말풍선을 만들지 않음 |
| `409 IDEMPOTENCY_CONFLICT` | 새 `client_message_id`를 생성하기 전에 클라이언트 상태 점검 |

클라이언트는 `response_source`를 보고 DB 조회 여부를 추측하지 말고 서버가 반환한 값을 그대로 사용한다.

## 6. 백엔드 처리 순서

1. JWT를 검증하고 사용자 ID를 확정한다.
2. DB 함수로 소유권과 기존 요청을 확인한다. 재전송이면 기존 메시지 쌍을 반환한다.
3. 신규 요청이면 채팅방 active 상태를 확인한다.
4. 질문 의도를 분류하고 필요한 사용자 데이터를 조회·계산한다.
5. DB 직접 답변 또는 추가 안내를 생성한다. AI 응답은 후속 구현이다.
6. 저장 DB 함수가 요청 ID 잠금과 채팅방 잠금을 획득하고 소유권·중복·상태를 재확인한다.
7. 질문·답변·근거 저장과 제목·updated_at 변경을 하나의 트랜잭션으로 처리한다.
8. 동시 요청 중 이미 저장한 결과가 있으면 그 결과를 반환한다.

응답 생성 중에는 DB 잠금을 유지하지 않는다. 동시 중복 요청이 조회·계산을 중복 수행할 수는
있지만 저장은 한 쌍이다. 미래 AI 호출 비용의 중복 방지는 별도 작업 예약 방식이 필요하다.
목록은 커서 기반이지만 snapshot 조회는 아니다. 조회 중 채팅방 updated_at이 바뀌면 목록을
새로 불러와 chat_id 기준으로 합친다. 기존 assistant 메시지의 출처가 null이면 과거 데이터이며
추측하여 채우지 않는다. 새 저장 API가 만든 답변에는 출처가 포함된다.

## 7. MVP 비지원 범위

- 토큰 단위 실시간 스트리밍
- 이미지·파일 첨부 질문
- 음성 입력
- 그룹 채팅
- 사용자 간 메시지 전달
- 챗봇이 사용자 건강 데이터를 자동 수정하는 기능
- DB 구조나 임의 SQL을 클라이언트에 공개하는 기능

## 8. 계약 테스트 체크리스트

- 인증되지 않은 요청은 `401`이다.
- 요청에 `user_id`를 넣으면 `422`이다.
- 다른 사용자 채팅방은 `404`이다.
- 빈 메시지와 500자 초과 메시지는 `422`이다.
- 같은 `client_message_id`와 같은 내용은 기존 결과를 반환하고 중복 저장되지 않는다.
- 같은 `client_message_id`와 다른 내용은 `409`이다.
- 메시지 목록은 과거→최신 순서다.
- 페이지 커서는 중복과 누락 없이 동작한다.
- 모든 assistant 메시지는 `response_source`를 가진다.
- 데이터 부족 답변은 `needs_more_data=true`와 `required_data`를 가진다.
- DB 답변은 AI를 호출하지 않는다.
- DB+AI 답변은 DB 근거만 개인 정보 문맥으로 사용한다.
- 서비스 키와 액세스 토큰은 응답과 로그에 노출되지 않는다.
