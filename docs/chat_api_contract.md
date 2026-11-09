# Auto-Fit Chat API Backend Contract

이 계약은 Auto-Fit Backend가 AI Server 챗봇을 연결할 때 따라야 하는 요청, 응답, 상태 전이와 저장 책임을 정의한다. 신규 개인화 기능은 `POST /chat/orchestrate`를 사용하며, 기존 `POST /chat`은 이전 Backend 호환용 일반 답변 경로로 유지한다.

전체 JSON 예제는 [chat_api_contract_examples.json](chat_api_contract_examples.json)에 있으며 `test_chat_contract_examples.py`가 실제 Pydantic 스키마와의 일치 여부를 검증한다.

## Endpoint selection

| Endpoint | 용도 | Action 지원 | Backend DB 변경 |
|---|---|---|---|
| `POST /chat` | 기존 Backend 호환 일반 답변 | 없음 | 없음 |
| `POST /chat/orchestrate` | 건강 RAG, 건강 리포트 설명, 저장된 운동·식단 조회, 운동 중 증상 대응, 식단 변경, GPS 기반 러닝 추천·순환 코스 생성 | 건강 점수 설명, 현재 운동 조정·중단 제안, 식단 변경 및 러닝 조회·생성 지원 | AI Server는 직접 변경하지 않음 |
| `POST /chat/intent-test` | 개발 중 의도 분류 확인 | 실행하지 않음 | 없음 |

모든 endpoint에는 다음 인증 헤더가 필요하다.

```http
Authorization: Bearer <AI_SERVER_API_KEY>
Content-Type: application/json
```

인증 누락 또는 잘못된 API Key는 `401`, 유효하지 않은 요청 스키마는 `422`로 반환한다.

## Legacy chat contract

`POST /chat`은 `question`, `user_info`, `chat_history`를 받으며 `answer`, `model`과 OpenAI가 사용량을 제공한 경우 선택 필드 `usage`를 반환한다. `user_info`는 계약 호환을 위해 수신하지만 현재 개인화 계산에는 사용하지 않는다.

```json
{
  "question": "운동 방향을 알려줘",
  "user_info": {},
  "chat_history": [
    {
      "role": "user",
      "content": "무리하지 않는 운동을 원해"
    }
  ]
}
```

`chat_history.role`은 `user` 또는 `assistant`만 허용한다. history는 최대 20개이며 각 메시지는 최대 2,000자다. OpenAI 오류, 빈 응답 또는 timeout이 발생하면 HTTP 500 대신 안전한 fallback 문장을 반환한다.

성공 응답 예시는 다음과 같다. `usage`를 얻지 못했거나 OpenAI 호출 전 fallback이 발생한 경우 해당 필드는 생략될 수 있다.

```json
{
  "answer": "저장된 정보 범위에서 운동 방향을 안내합니다.",
  "model": "configured-openai-model",
  "usage": {
    "input_tokens": 120,
    "cached_input_tokens": 20,
    "output_tokens": 80,
    "reasoning_tokens": 30,
    "total_tokens": 200
  }
}
```

`usage`는 요청 단위 관측값이며 최종 청구 금액 자체가 아니다. Backend는 이 필드를 선택 필드로 처리한다. 주간 식단 생성에는 이 일반 채팅 endpoint를 사용하지 않는다.

## Orchestrated chat request

`POST /chat/orchestrate`의 요청 구조는 다음과 같다.

| Field | 필수 | 설명 |
|---|---|---|
| `content` | 예 | 현재 사용자 메시지, 1~500자 |
| `history` | 아니요 | 최근 대화 최대 6개, 각 1~500자 |
| `context` | 아니요 | Backend가 보유한 건강·운동·식단 정보 |
| `pending_action` | 아니요 | 직전 응답에서 받은 확인 대기 action |

`history`는 문맥 참고용이며 변경 승인으로 사용되지 않는다. 식단 변경 승인은 현재 요청의 `pending_action`과 명시적인 확인 문구가 모두 있을 때만 처리한다.

운동 중 증상 대응에서는 Backend가 `context.active_exercise_session`에 현재 세션 snapshot을 전달한다. 증상 분류와 고위험 중단 판단은 OpenAI를 호출하지 않는 결정론적 규칙으로 처리한다. 경미한 조정도 `pending_action`과 명시적 확인이 모두 있을 때만 `ready_for_backend_apply`가 된다.

### Health score context

건강 리포트 질문에는 Backend가 가장 최근 `/health-analysis` 응답의 `analysis.health_score`를 `context.health_score`로 전달한다. AI Server는 이 snapshot을 다시 계산하지 않고 설명만 제공한다.

```json
{
  "content": "지난주보다 좋아졌어?",
  "history": [],
  "context": {
    "health_score": {
      "status": "available",
      "total_score": 77.2,
      "maximum": 100,
      "scoring_version": "health-score-v1",
      "tier": "FIT",
      "tier_level": 1,
      "comparison_status": "available",
      "previous_total_score": 70.5,
      "score_delta": 6.7,
      "trend": "improved",
      "section_trends": {
        "diet": {
          "previous_score": 65.0,
          "current_score": 80.0,
          "score_delta": 15.0,
          "trend": "improved"
        },
        "exercise": {
          "previous_score": 70.0,
          "current_score": 72.0,
          "score_delta": 2.0,
          "trend": "improved"
        },
        "health_data": {
          "previous_score": 75.0,
          "current_score": 79.0,
          "score_delta": 4.0,
          "trend": "improved"
        }
      },
      "change_reasons": [],
      "priority_actions": [],
      "diet": {
        "status": "available",
        "score": 80.0,
        "maximum": 100,
        "message": "식단 점수 계산 완료",
        "breakdown": {}
      },
      "exercise": {
        "status": "available",
        "score": 72.0,
        "maximum": 100,
        "message": "운동 점수 계산 완료",
        "breakdown": {}
      },
      "health_data": {
        "status": "available",
        "score": 79.0,
        "maximum": 100,
        "message": "건강데이터 점수 계산 완료",
        "breakdown": {}
      },
      "health_metric_adjustments": []
    }
  },
  "pending_action": null
}
```

지원 질문 유형은 다음과 같다.

| 질문 유형 | 예시 | `data.query_type` |
|---|---|---|
| 현재 요약 | “내 건강 점수를 알려줘” | `summary` |
| 이전 주 비교 | “지난주보다 좋아졌어?” | `comparison` |
| 변화 이유 | “운동 점수가 낮은 이유가 뭐야?” | `reason` |
| 우선 행동 | “무엇부터 개선해야 해?” | `priority` |

응답 `data`에는 점수·등급·영역별 추세·변화 사유·우선 행동만 포함한다. 첫 번째 우선 행동에 따라 `recommended_next_feature`는 `diet_recommendation`, `exercise_recommendation`, `health_analysis` 중 하나를 제공하며, Frontend가 해당 기능으로 이동할 때 사용할 수 있다. 러닝이 적합한지는 건강 점수만으로 추측하지 않으며 사용자가 러닝을 선택한 뒤 기존 러닝 추천 흐름을 사용한다. 인바디나 건강검진의 원본 수치가 포함된 `health_metric_adjustments`는 챗봇 응답으로 다시 노출하지 않는다. `context.health_score`가 없거나 점수 상태가 `unavailable`이면 `need_health_score_context / needs_input`을 반환한다.

### Running context

러닝 코스 추천 또는 순환 코스 생성 시 Backend는 `context.running`에 현재 요청 시점의 위치와 사용자 설정을 전달한다. 사용자가 메시지로 지역을 직접 말하지 않아도 `latitude`와 `longitude`가 있으면 GPS 기반 추천이 가능하다.

| Field | 필수 | 설명 |
|---|---|---|
| `latitude`, `longitude` | GPS 추천 시 함께 필수 | WGS84 위도·경도. 둘 중 하나만 전달할 수 없음 |
| `region` | GPS가 없을 때 추천에 필요 | 시·군·구 단위 검색 지역. 순환 코스 생성은 GPS 좌표 필요 |
| `distance_option` | 조건부 | `3km`, `5km`, `10km`, `custom` |
| `custom_distance_km` | `distance_option=custom`일 때 필수 | 0.5~50km |
| `pace_minutes_per_km` | 아니요 | 저장된 사용자 페이스. 없으면 AI Server 기본 페이스 사용 |
| `desired_difficulty` | 아니요 | `easy`, `moderate`, `hard` |
| `candidate_count` | 아니요 | 자동 생성 후보 수, 1~3개. 기본 3개 |
| `seed` | 아니요 | 동일 조건 후보 재현 또는 다른 후보 생성용 정수 |

메시지에서 새 지역을 명시하면 해당 지역이 기존 GPS context보다 우선한다. 그 외에는 GPS 좌표를 사용해 Kakao 역지오코딩으로 지역을 확인하고, 코스 출발점까지의 거리를 계산하여 가까운 코스를 우선한다. 정밀 GPS 좌표는 러닝·지도 서비스에만 사용하며 OpenAI 질문 context에는 전달하지 않는다.

## Orchestrated chat response

| Field | 설명 |
|---|---|
| `intent` | 분류된 사용자 의도 |
| `message` | 사용자에게 표시할 답변 |
| `action` | Frontend와 Backend가 처리할 동작 코드 |
| `action_status` | action 진행 상태 |
| `requires_backend_apply` | Backend DB 반영 필요 여부 |
| `pending_action` | 다음 요청에 그대로 전달할 확인 대기 정보 |
| `target_day` | `monday`부터 `sunday`까지의 대상 요일 |
| `target_meal` | `breakfast`, `lunch`, `dinner`, `snack` 중 대상 식사 |
| `data` | Backend가 반영할 구조화 결과 |
| `sources` | 실제 건강 RAG 결과에 존재하는 기관·문서 출처 |

Backend 로직은 사용자 표시용 `message` 문구를 비교하지 않고 `intent`, `action`, `action_status`, `requires_backend_apply`를 기준으로 분기해야 한다.

## Action handling matrix

| Action | Status | Backend 처리 |
|---|---|---|
| `health_score_context` | `completed` | `data`의 확정 점수·추세·우선 행동과 설명 표시. DB 변경 없음 |
| `need_health_score_context` | `needs_input` | 최신 `/health-analysis` 결과를 조회하거나 생성한 뒤 재요청 |
| `health_rag` | `completed` | 답변과 `sources` 표시 |
| `exercise_context` | `completed` | 저장된 운동 설명 표시 |
| `exercise_replace_unavailable` | `unable_to_apply` | 변경 버튼을 완료 처리하지 않고 안내 표시 |
| `need_exercise_session_context` | `needs_input` | 운동을 자동 재개하지 않고 인증 사용자의 최신 활성 세션을 조회해 재요청 |
| `need_exercise_symptom_details` | `needs_input` | 운동 일시정지 유지, 증상·부위·0~10 정도 요청 |
| `confirm_exercise_adjustment` | `awaiting_confirmation` | 조정 전 `pending_action`을 사용자·채팅·세션별로 안전하게 보존 |
| `exercise_adjustment_cancelled` | `completed` | pending action 폐기. 취소를 운동 자동 재개로 해석하지 않음 |
| `exercise_session_adjust` | `ready_for_backend_apply` | 세션 소유권·version 재검증 후 현재 세션에만 `adjust` 적용 |
| `exercise_session_stop` | `ready_for_backend_apply` 또는 `unable_to_apply` | 화면에서는 즉시 중단. 적용 가능하면 현재 세션에만 `stop`; context가 없으면 최신 세션 조회 후 별도 저장. 대체 운동을 제공하지 않음 |
| `running_context` | `completed` | 저장된 러닝 조건을 사용한 설명 표시 |
| `need_running_distance` | `needs_input` | 거리 선택 또는 직접 입력 요청 |
| `need_running_location` | `needs_input` | 위치 권한 허용, 지역 또는 정확한 출발지 요청 |
| `running_courses_recommended` | `completed` | `data.courses`를 추천 후보로 표시. DB 변경 없음 |
| `running_generation_required` | `completed` | 공식 코스 없음 안내 후 GPS 기반 순환 코스 생성 선택 제공 |
| `running_loops_generated` | `completed` | `data.candidates`와 실제 거리·오차·경로 표시. DB 변경 없음 |
| `running_unavailable` | `unable_to_apply` | 부정확한 결과를 정상 처리하지 말고 오류·재시도 안내 표시 |
| `diet_context` | `completed` | 저장된 식단 설명 표시 |
| `need_target_day` | `needs_input` | 사용자에게 요일 요청 |
| `need_target_meal` | `needs_input` | 사용자에게 식사 종류 요청 |
| `need_diet_context` | `needs_input` | 최신 저장 식단을 포함해 재요청 |
| `meal_not_found` | `unable_to_apply` | 저장 식단 동기화 후 다시 시도 |
| `confirm_diet_replace` | `awaiting_confirmation` | `pending_action` 보존 후 확인 또는 취소 입력 대기 |
| `diet_replace_cancelled` | `completed` | 보존한 `pending_action` 폐기 |
| `diet_replace` | `ready_for_backend_apply` | `data`를 검증한 뒤 해당 식단 슬롯에 반영 |
| `general_chat` | `completed` | 일반 답변 표시 |

## Active exercise discomfort flow

운동 진행 중 사용자가 통증, 피로, 어지럼, 호흡 불편 또는 신체 이상을 말하면 일반 운동 답변이나 LLM 상담으로 보내지 않고 `exercise_session_discomfort`로 처리한다.

Backend는 인증된 사용자의 최신 활성 세션을 다음 형태로 전달한다.

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

`version`은 Backend가 현재 세션의 변경 여부를 확인할 수 있는 불투명 문자열이다. `updated_at`, row version 또는 동일 목적의 값을 안정적으로 직렬화해 사용할 수 있다. AI Server는 사용자 ID와 원본 건강 수치를 요구하지 않는다.

판정 규칙은 다음과 같다.

| 상태 | AI 응답 | 적용 정책 |
|---|---|---|
| 증상·정도 정보 부족 | `need_exercise_symptom_details` | 일시정지 유지 후 추가 질문 |
| 경미한 피로 | `confirm_exercise_adjustment` | 확인 후 남은 운동량·강도 축소 |
| 경미한 국소 통증 | `confirm_exercise_adjustment` | 확인 후 현재 운동 건너뛰기와 남은 운동량·강도 축소 |
| 가슴 통증·압박, 실신/심한 어지럼, 심한 호흡곤란, 비정상 심계항진, 심한 통증 | `exercise_session_stop` | 대체 운동 없이 현재 세션 중단 |
| AI/Backend context 불일치 | `need_exercise_session_context` | 기존 pending action을 적용하지 않고 일시정지 유지 |

조정 제안의 `pending_action`은 `session_id`, `plan_session_id`, `exercise_item_id`, `session_version`, 증상 정보와 `adjustment_strategy`를 보존한다. 확인 요청에서 최신 세션 ID와 version이 다르면 AI Server는 변경을 준비하지 않는다.

`adjustment_strategy`는 다음 두 값만 사용한다.

- `reduce_remaining_volume`: 남은 운동 강도·시간·세트·횟수 축소
- `skip_current_and_reduce_remaining`: 현재 운동을 건너뛰고 남은 운동량 축소

현재 운동 CSV에는 검증된 금기 부위, 관절 부담, 충격도, 대체 운동군이 없다. 따라서 이 버전은 LLM이 임의 종목을 교체하지 않는다. 종목 자동 교체는 해당 안전 메타데이터와 Backend의 세션 단위 교체 transaction이 준비된 뒤 기존 운동 catalog 안에서만 별도로 활성화한다.

확인 완료 응답 예시는 다음과 같다.

```json
{
  "intent": "exercise_session_discomfort",
  "action": "exercise_session_adjust",
  "action_status": "ready_for_backend_apply",
  "requires_backend_apply": true,
  "pending_action": null,
  "data": {
    "session_id": "11111111-1111-1111-1111-111111111111",
    "plan_session_id": "22222222-2222-2222-2222-222222222222",
    "exercise_item_id": "33333333-3333-3333-3333-333333333333",
    "session_version": "session-version-1",
    "adjustment_strategy": "skip_current_and_reduce_remaining",
    "discomfort_event": {
      "symptom_type": "pain",
      "severity": 3,
      "body_areas": ["오른쪽 무릎"],
      "action_taken": "adjust"
    }
  }
}
```

Backend는 `message` 문구를 파싱하지 않고 구조화 필드로만 적용한다. `requires_backend_apply=true`여도 인증·소유권·세션 상태·version·중복 적용을 다시 검증해야 한다.

## GPS-based running course recommendation

사용자가 지역을 말하지 않고 “5km 러닝 코스 추천해줘”라고 요청하는 경우의 권장 요청이다.

```json
{
  "content": "현재 위치에서 쉬운 5km 러닝 코스를 추천해줘",
  "history": [],
  "context": {
    "running": {
      "latitude": 37.3948,
      "longitude": 127.1112,
      "pace_minutes_per_km": 6.5,
      "desired_difficulty": "easy"
    }
  },
  "pending_action": null
}
```

거리와 난이도는 현재 메시지에서 추출한 값이 `context.running`보다 우선한다. 응답 `data`는 `RunningCourseRecommendationResponse`와 동일하며 다음 정보를 포함한다.

- `resolved_region`: GPS로 확인한 검색 지역
- `target_distance_km`, `distance_min_km`, `distance_max_km`: 목표 거리와 허용 범위
- `courses`: 가까운 출발점, 목표 거리 오차, 난이도와 경로 품질을 반영한 최대 3개 후보
- `courses[].distance_to_user_km`: 좌표가 확인된 코스 출발점까지의 직선거리
- `courses[].estimated_duration_minutes`: 사용자 페이스 또는 기본 페이스 기준 예상 시간
- `courses[].geometry_status`: 실제 경로 형상 검증 수준
- `generation_recommended`: 지도에 표시할 검증 경로 후보가 없을 때 자동 생성 권장 여부. 공식 메타데이터 카드가 있어도 전체 Polyline이 없으면 `true`

공식 코스가 없거나 공식 메타데이터만 있고 지도용 전체 경로가 없으면 `running_generation_required`를 반환한다. 메타데이터 카드는 숨기지 말고 이름·거리·난이도·설명·경유지 이름을 표시하며, `상세 경로 좌표 미제공` 상태와 자동 생성 버튼을 함께 제공한다. Frontend가 사용자의 생성 선택을 받은 뒤 같은 GPS 좌표로 “순환 코스를 만들어줘” 요청을 보내야 한다. AI Server가 이 응답만으로 코스를 자동 저장하지 않는다.

## GPS-based loop generation

순환 코스 생성은 지역명만으로 실행하지 않으며 정확한 `latitude`와 `longitude`가 필요하다. 반환된 실제 도보 경로 길이를 목표 거리의 ±10%와 비교하고, 제한된 재시도 후에도 범위에 들지 않으면 `best_effort` 또는 `unavailable`을 명시한다.

```json
{
  "content": "현재 위치에서 5km 순환 코스를 만들어줘",
  "history": [],
  "context": {
    "running": {
      "latitude": 37.3948,
      "longitude": 127.1112,
      "pace_minutes_per_km": 6.5,
      "candidate_count": 3
    }
  },
  "pending_action": null
}
```

`running_loops_generated`의 `data.status`는 `matched` 또는 `best_effort`일 수 있다. `best_effort`는 정상 오차 범위로 가장해서는 안 되며 각 후보의 `distance_error_km`, `distance_error_percent`, `within_tolerance`를 표시해야 한다. 생성 실패는 `running_unavailable`로 처리한다.

## Diet replacement state flow

```text
변경 요청
  -> confirm_diet_replace / awaiting_confirmation
      -> 취소: diet_replace_cancelled / completed
      -> 확인: diet_replace / ready_for_backend_apply
          -> Backend가 data 검증
          -> Backend가 해당 사용자 식단 슬롯에 저장
```

### Step 1 proposal

Backend는 현재 사용자의 최신 `diet_summary`, 알레르기와 기피 음식을 포함한다.

```json
{
  "content": "월요일 점심을 바꿔줘",
  "history": [],
  "context": {
    "metric_statuses": {},
    "food_allergens": [],
    "disliked_foods": [],
    "diet_summary": {
      "weekly_plan": [
        {
          "day": "monday",
          "meals": {
            "lunch": {
              "menu_name": "기존 점심",
              "items": [
                {
                  "food_name": "현미밥",
                  "portion_g": 100.0
                }
              ]
            }
          }
        }
      ]
    }
  },
  "pending_action": null
}
```

AI Server는 이 단계에서 재추천을 실행하지 않고 확인 정보를 반환한다.

```json
{
  "intent": "diet_replace_request",
  "message": "monday lunch의 '기존 점심' 메뉴를 변경할까요?",
  "action": "confirm_diet_replace",
  "action_status": "awaiting_confirmation",
  "requires_backend_apply": false,
  "pending_action": {
    "action": "diet_replace",
    "target_day": "monday",
    "target_meal": "lunch"
  },
  "target_day": "monday",
  "target_meal": "lunch",
  "data": null,
  "sources": []
}
```

### Step 2 confirmation

Backend는 직전 응답의 `pending_action`을 수정하지 않고 최신 식단 context와 함께 다시 전달한다.

```json
{
  "content": "네, 진행해줘",
  "history": [],
  "context": {
    "metric_statuses": {},
    "food_allergens": [],
    "disliked_foods": [],
    "diet_summary": {
      "weekly_plan": [
        {
          "day": "monday",
          "meals": {
            "lunch": {
              "menu_name": "기존 점심",
              "items": [
                {
                  "food_name": "현미밥",
                  "portion_g": 100.0
                }
              ]
            }
          }
        }
      ]
    }
  },
  "pending_action": {
    "action": "diet_replace",
    "target_day": "monday",
    "target_meal": "lunch"
  }
}
```

`action_status=ready_for_backend_apply`와 `requires_backend_apply=true`가 함께 반환된 경우에만 `data`를 저장 후보로 처리한다. AI Server 응답만으로 DB가 변경된 것으로 간주해서는 안 된다.

### Cancellation

사용자가 취소하면 동일한 `pending_action`을 포함해 요청한다. 응답이 `diet_replace_cancelled`이면 Backend는 저장된 확인 대기 정보를 폐기한다.

## Health sources

건강 질문의 `sources`에는 실제 RAG 검색 결과에서 확인된 `source_org`와 `title`만 포함된다. OpenAI fallback 또는 RAG 실패 시 빈 배열이다.

```json
{
  "intent": "health_question",
  "message": "건강 관리 답변",
  "action": "health_rag",
  "action_status": "completed",
  "requires_backend_apply": false,
  "pending_action": null,
  "target_day": null,
  "target_meal": null,
  "data": null,
  "sources": [
    {
      "source_org": "대한고혈압학회",
      "title": "고혈압 진료지침"
    }
  ]
}
```

## General exercise plan replacement before API integration

주간 운동 계획의 일반적인 종목 교체는 아직 실행하지 않는다. 이 제한은 위의
`exercise_session_discomfort` 안전 흐름에서 현재 세션을 축소하거나 중단하는
기능과 구분한다.

```json
{
  "intent": "exercise_replace_request",
  "message": "현재는 운동 계획 변경 기능을 지원하지 않습니다.",
  "action": "exercise_replace_unavailable",
  "action_status": "unable_to_apply",
  "requires_backend_apply": false,
  "pending_action": null,
  "target_day": null,
  "target_meal": null,
  "data": null,
  "sources": []
}
```

## Backend responsibilities

Backend는 다음 책임을 가진다.

1. 사용자별 `history`, `context`, `pending_action`을 분리해 보존한다.
2. 매 요청에 최신 건강 상태와 저장된 운동·식단을 전달한다.
3. AI Server가 반환한 `pending_action`을 임의로 수정하지 않는다.
4. `ready_for_backend_apply`와 `requires_backend_apply=true`를 모두 확인한다.
5. `data.day`, `data.meal_type`, 응답의 `target_day`, `target_meal`이 요청한 슬롯과 일치하는지 검증한다.
6. 검증 후 DB transaction으로 해당 사용자 식단 슬롯만 갱신한다.
7. 저장 성공 후 최신 식단을 다시 조회해 Frontend에 반환한다.
8. 다른 사용자의 history, context 또는 pending action을 재사용하지 않는다.
9. Frontend에서 위치 권한을 받은 경우에만 최신 GPS 좌표를 요청 context에 포함한다.
10. GPS 좌표를 사용자 메시지 문자열이나 LLM용 history에 삽입하지 않는다.
11. 러닝 추천·생성 응답은 조회 결과이며, 즐겨찾기·선택·경로 snapshot 저장은 Backend의 별도 `/api/running/*` 처리에서 수행한다.
12. 저장 전 `course_id`, 거리, 경로 좌표와 응답 상태를 검증하고 `unavailable` 결과를 저장하지 않는다.
13. 운동 중 챗봇 요청에는 인증 사용자의 최신 활성 세션 snapshot과 변경 감지용 `version`을 전달한다.
14. 운동 조정 pending action은 서버에서 사용자·채팅·세션별로 격리하고 만료·소비·중복 적용을 검사한다.
15. 운동 `adjust`와 `stop`은 현재 `plan_session_id`에만 적용하며 다른 날짜 세션이나 주간 추천 전체 상태를 변경하지 않는다.
16. 운동 증상 action 처리 중 AI 장애, context 불일치 또는 네트워크 실패가 발생해도 운동을 자동 재개하지 않는다.

## HTTP and recovery behavior

| HTTP status | 의미 | Backend 처리 |
|---|---|---|
| `200` | 정상 또는 안전한 LLM fallback | 응답의 action과 status에 따라 처리 |
| `401` | 인증 누락 또는 API Key 불일치 | 요청을 재시도하지 말고 서버 설정 확인 |
| `422` | 요청 스키마 오류 | payload 수정 후 재요청 |
| `500` | AI Server 내부 처리 실패 | 제한된 횟수로 재시도하고 로그·health endpoint 확인 |

운영 상태는 `GET /health/chat`, 식단 생성 상태는 `GET /health/diet`, 레시피 상태는 `GET /health/recipe`에서 확인한다.
