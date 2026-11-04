# Backend 운동 추천시간 계약 수정 안내

> 작성일: 2026-11-04
>
> 대상: Backend 개발 담당자
>
> 기준 AI 코드 커밋: `e3f0f93`
>
> 대상 API: Backend 운동 추천 생성 → AI Server `POST /recommend/exercise`

## 1. 결론

Backend는 AI가 반환한 각 운동 세션을 다음 공식으로 검증해야 합니다.

```text
target_minutes = available_minutes
maximum_minutes = min(target_minutes + 5, 200)
actual_minutes = sum(session.exercises[*].duration_minutes)

target_minutes <= actual_minutes <= maximum_minutes
```

- `available_minutes` 요청값은 `5~200`만 허용합니다.
- 여러 세션이 있으면 각 세션을 독립적으로 검증합니다.
- 어떤 세션도 200분을 초과할 수 없습니다.
- `estimated_duration_minutes`는 해당 세션의 `actual_minutes`와 같아야 합니다.
- 목표보다 짧거나 허용 상한보다 긴 결과는 저장하지 않습니다.

## 2. 현재 Backend에서 확인된 문제

현재 원격 `backend` 브랜치 `b72181c` 기준으로 다음 차이가 있습니다.

1. `backend/app/main.py`
   - `ExerciseRecommendationContextRequest.available_minutes`가 최대 300분입니다.
2. `backend/app/exercise_ai.py`
   - `AIExercise.duration_minutes`가 최대 300분입니다.
   - `AISession`이 `estimated_duration_minutes`를 받지 않습니다.
   - `build_plan()`은 `session_minutes > available_minutes`만 거부합니다.
   - 따라서 목표보다 짧은 세션은 통과하고, 정상적인 `목표+1~5분` 세션은 거부합니다.
3. `backend/tests/test_exercise_ai.py`
   - 30분 요청에서 5분 또는 10분 세션을 정상 fixture로 사용합니다.

## 3. 수정 대상

### 3.1 `backend/app/main.py`

`ExerciseRecommendationContextRequest`의 목표시간 상한을 200분으로 변경합니다.

```python
class ExerciseRecommendationContextRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    available_minutes: int = Field(ge=5, le=200)
```

주의: `ExerciseItemResultRequest.duration_minutes`는 사용자가 실제로 수행한 결과 기록입니다.
이번 추천시간 계약과 다른 필드이므로 별도 정책 결정 없이 기존 상한을 변경하지 않습니다.

### 3.2 `backend/app/exercise_ai.py`

AI 응답 운동 항목의 상한을 200분으로 맞춥니다.

```python
class AIExercise(BaseModel):
    # 기존 필드 유지
    duration_minutes: int = Field(ge=1, le=200)
```

AI Server가 반환하는 세션 예상시간을 명시적으로 받습니다.

```python
class AISession(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    focus: str | None = Field(default=None, max_length=200)
    estimated_duration_minutes: int = Field(ge=1, le=200)
    exercises: list[AIExercise] = Field(min_length=1, max_length=4)
```

`build_plan()`의 기존 상한 전용 검사를 다음 의미로 교체합니다.

```python
target_minutes = int(context["available_minutes"])
if not 5 <= target_minutes <= 200:
    raise ExerciseAIError("Exercise target time is out of range")

maximum_minutes = min(target_minutes + 5, 200)

# 각 session의 exercise를 순회하여 계산한 값
actual_minutes = session_minutes

if not target_minutes <= actual_minutes <= maximum_minutes:
    raise ExerciseAIError("Exercise AI returned an invalid session duration")

if session.estimated_duration_minutes != actual_minutes:
    raise ExerciseAIError("Exercise AI returned inconsistent session duration")
```

검증을 통과한 `actual_minutes`를 다음 값에 사용합니다.

- `plan_sessions[].duration_minutes`
- 해당 세션 저장값
- 오늘 수행할 첫 세션을 나타내는 `recommendation.total_duration_minutes`

### 3.3 과거 저장 데이터 확인

신규 요청 Schema만 변경해도 기존 DB에 저장된 201~300분 context는 남아 있을 수 있습니다.

- 배포 전 `available_minutes > 200` 데이터 존재 여부를 조회합니다.
- 기존 데이터를 임의 삭제하거나 조용히 200분으로 바꾸지 않습니다.
- 해당 값으로 추천을 생성하려 할 때 재선택이 필요하다는 오류를 반환합니다.
- 필요하면 사용자 동의를 받는 별도 마이그레이션 정책을 정합니다.

## 4. 필수 테스트

### `backend/tests/test_exercise_ai.py`

기존 30분 요청 fixture의 모든 세션 합계를 30~35분으로 수정해야 합니다.

| 목표시간 | 세션 합계 | 기대 결과 |
|---:|---:|---|
| 30 | 29 | 거부 |
| 30 | 30 | 허용 |
| 30 | 35 | 허용 |
| 30 | 36 | 거부 |
| 195 | 195 | 허용 |
| 195 | 200 | 허용 |
| 195 | 201 | 거부 |
| 198 | 198 | 허용 |
| 198 | 200 | 허용 |
| 198 | 201 | 거부 |
| 200 | 200 | 허용 |
| 200 | 201 | 거부 |

다음 사례도 추가합니다.

- 여러 세션 중 하나만 범위를 벗어나도 전체 결과 거부
- `estimated_duration_minutes`와 실제 합계 불일치 거부
- 운동 하나의 `duration_minutes=201` 응답 거부
- 검증된 실제 합계가 저장되는지 확인

### Backend API Schema 테스트

- `available_minutes=200`: 허용
- `available_minutes=201`: `422`
- 과거 저장값이 201분 이상인 경우 추천 생성 차단

## 5. 배포 순서

1. Backend의 요청·응답 검증과 테스트를 먼저 반영합니다.
2. Backend 테스트를 통과시킵니다.
3. AI Server의 최신 `ai` 브랜치를 배포합니다.
4. `30`, `45`, `198`, `200`분 조건으로 Backend → AI Server 통합 테스트를 수행합니다.
5. 실제 앱에서는 기본 선택값과 직접 입력값 모두 확인합니다.

Backend가 기존 `session_minutes > available_minutes` 검사를 유지하면 AI Server가 반환한
정상적인 `목표+1~5분` 결과가 502로 거부될 수 있으므로, 양쪽 배포 시점을 맞춰야 합니다.

## 6. 변경하지 않아야 하는 항목

- 운동 CSV 카탈로그 및 `exercise_key` 검증
- `catalog_version` 검증
- 장소·장비 검증
- `low`, `moderate`, `high` 강도 계약
- 실제 운동 완료 기록의 시간 정책
- GIF 저장·제공 구조

## 7. 완료 조건

- 목표보다 짧은 추천이 저장되지 않습니다.
- 목표보다 최대 5분까지만 긴 추천을 허용합니다.
- 추천 세션 총시간이 절대 200분을 넘지 않습니다.
- 예상시간과 운동별 시간 합계가 일치합니다.
- 모든 Backend 단위 테스트와 Frontend → Backend → AI Server 통합 테스트가 통과합니다.
