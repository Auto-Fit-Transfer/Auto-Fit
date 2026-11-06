# 운동 추천 AI 연동 요청 — Backend 담당자용

> 작성일: 2026-11-03
> 최종 갱신일: 2026-11-04
> 대상: Backend 개발 담당자
> 대상 API: `POST /recommend/exercise`

## 1. 결론

Backend가 저장하는 오늘의 운동 조건을 AI Server의 운동 추천 요청에도 동일하게 전달해야 합니다.

특히 현재 AI 요청 변환에서 누락된 `available_equipment`를 반드시 추가해 주세요. 이 값이 없으면 사용자가 선택한 머신·밴드·덤벨·맨몸 조건을 AI 후보 필터에 반영할 수 없습니다.

## 2. Backend → AI Server 요청 형식

```json
{
  "available_minutes": 60,
  "location": "gym",
  "available_equipment": ["machine", "dumbbell"],
  "condition_level": "보통",
  "discomfort_areas": ["오른쪽 무릎"],
  "condition_note": null
}
```

사용자의 저장된 운동 목표와 경험 수준을 사용할 수 있는 경우 기존 필드도 함께 전달합니다.

```json
{
  "goal_type": "muscle_gain",
  "experience_level": "beginner",
  "available_minutes": 60,
  "location": "gym",
  "available_equipment": ["machine", "dumbbell"],
  "condition_level": "보통",
  "discomfort_areas": ["오른쪽 무릎"],
  "condition_note": null
}
```

## 3. 필드 계약

| 필드 | 형식 | 허용값·정책 |
|---|---|---|
| `available_minutes` | 정수 | 기본 선택값은 `30`, `45`, `60`, `90`, `120`. 직접 입력을 포함해 `5~200`만 허용하며 모든 추천 세션의 목표 시간으로 사용 |
| `location` | 문자열 | `gym`, `home`, `outdoor`, `other` |
| `available_equipment` | 문자열 배열 | `machine`, `band`, `dumbbell`, `mat`, `other` |
| `condition_level` | 문자열 | `좋음`, `보통`, `피곤해요`, `안 좋아요` |
| `discomfort_areas` | 문자열 배열 | 미선택 시 `[]`, 선택 시 현재 화면 기준 최대 한 개 |
| `condition_note` | 문자열 또는 `null` | 추가 컨디션 설명. 없으면 `null` |
| `goal_type` | 문자열 또는 `null` | 저장된 운동 목표가 있을 때 전달 |
| `experience_level` | 문자열 또는 `null` | 저장된 운동 경험 수준이 있을 때 전달 |

`available_equipment`는 복수 선택 배열이며, 선택된 장비 중 하나로 수행할 수 있는 운동을 허용하는 OR 조건으로 사용합니다.

현재 화면의 `mat`는 “맨몸” 선택값이므로 AI Server에서 무장비·맨몸 운동 후보로 변환합니다. Backend에서 임의로 `none`이나 `bodyweight`로 다시 변경하지 말고 화면 계약값인 `mat`를 그대로 전달해 주세요.

## 4. Backend 필수 수정 사항

### AI 요청 변환

- 운동 추천 컨텍스트의 `available_equipment`를 누락하지 않습니다.
- `available_minutes`는 저장과 AI 요청 전에 `5~200` 범위인지 검증합니다.
- `condition_level`의 한글 표시값을 계약 그대로 전달합니다.
- `discomfort_areas`가 없으면 반드시 빈 배열을 전달합니다.
- `condition_note`가 없으면 빈 문자열이 아니라 `null`을 전달합니다.
- 사용자 이름, 이메일, 전화번호 등 식별정보는 전달하지 않습니다.
- 실제 건강검진 원본 수치는 전달하지 않습니다.

### 요청 시점

```text
Frontend 오늘의 운동 설정 저장
→ Backend 운동 추천 context 저장
→ Backend가 저장된 context 조회
→ AI Server POST /recommend/exercise
→ 응답 검증 및 DB 저장
→ Frontend에 추천 결과 반환
```

Frontend가 보낸 원문을 별도로 조합하기보다, 저장에 성공한 최신 운동 추천 context를 기준으로 AI 요청을 생성해 주세요.

### 오류 처리

- AI Server `422`: 요청 계약 또는 enum 불일치로 처리합니다.
- AI Server `503`: 카탈로그 후보 부족 또는 일시적인 추천 서비스 장애로 처리합니다.
- 실패한 AI 결과를 빈 운동 추천으로 정상 저장하지 않습니다.
- 동일한 잘못된 요청을 무제한 재시도하지 않습니다.

## 5. AI 응답 처리

AI Server는 구매한 운동 GIF CSV에 존재하는 운동만 추천하며 각 운동에 `exercise_key`를 반환합니다.

```json
{
  "ok": true,
  "generator": "auto-fit-ai",
  "result": {
    "catalog_version": "sha256:<catalog-hash>",
    "summary": "오늘 컨디션과 장비를 반영한 운동입니다.",
    "weekly_frequency": 3,
    "intensity": "moderate",
    "sessions": [
      {
        "name": "상체 운동",
        "estimated_duration_minutes": 60,
        "exercises": [
          {
            "exercise_key": "ex_846f603683467e",
            "name": "45도 바이시클 트위스트 크런치",
            "catalog_name_en": "45 Degree Bycicle Twisting Crunch",
            "exercise_modes": ["gym"],
            "duration_minutes": 20,
            "intensity": "moderate",
            "instructions": [
              "복부에 힘을 유지하고 천천히 수행하세요."
            ]
          },
          {
            "exercise_key": "ex_25ee07aa74fd15",
            "name": "45도 트위스팅 하이퍼익스텐션",
            "catalog_name_en": "45 Degree Twisting Hyperextension",
            "exercise_modes": ["gym"],
            "duration_minutes": 20,
            "intensity": "moderate",
            "instructions": [
              "허리를 과도하게 꺾지 말고 천천히 수행하세요."
            ]
          },
          {
            "exercise_key": "ex_533a5992c70066",
            "name": "45도 리버스 하이퍼익스텐션",
            "catalog_name_en": "45 Degrees Reverse Hyperextension",
            "exercise_modes": ["gym"],
            "duration_minutes": 20,
            "intensity": "moderate",
            "instructions": [
              "반동 없이 둔근과 허벅지 뒤쪽에 집중하세요."
            ]
          }
        ]
      }
    ],
    "cautions": [],
    "sources": []
  }
}
```

Backend는 응답 수신 후 다음 항목을 검증합니다.

- `result.intensity`가 `low`, `moderate`, `high` 중 하나인지
- 운동별 `intensity`가 생략 또는 `null`이거나 `low`, `moderate`, `high` 중 하나인지
- `catalog_version`이 Backend에 배포된 CSV 버전과 일치하는지
- 모든 `exercise_key`가 Backend CSV에 존재하는지
- 요청 장소와 운동의 `exercise_modes`가 충돌하지 않는지
- 요청한 장비로 수행할 수 있는 운동인지
- 각 세션의 운동별 `duration_minutes` 합계가 요청 시간 이상, `min(요청 시간 + 5분, 200분)` 이하인지
- 각 세션의 `estimated_duration_minutes`가 운동별 시간의 실제 합계와 정확히 일치하는지
- 빈 세션 또는 빈 운동 목록을 정상 추천으로 저장하지 않는지

### 세션 시간 검증 및 저장 계약

`target_minutes = available_minutes`로 정의합니다. Backend는 AI 응답의 각 세션을
독립적으로 다시 계산하고 다음 조건을 모두 만족할 때만 저장합니다.

```text
actual_minutes = sum(session.exercises[*].duration_minutes)
maximum_minutes = min(target_minutes + 5, 200)
target_minutes <= actual_minutes <= maximum_minutes
session.estimated_duration_minutes == actual_minutes
```

AI Server는 LLM 원본 합계가 허용 범위 안이면 그대로 유지하고, 목표 미달 또는 허용
상한 초과인 경우에만 운동 간 시간 비율을 최대한 유지해 `target_minutes`로 보정한다.
보정 후 같은 공식으로 다시 검증하며, 시간 범위 위반만을 이유로 OpenAI를 재호출하지
않는다. 따라서 45분 요청에서 원본이 40분 또는 37분이어도 AI Server 최종 응답은
45분으로 교정될 수 있다.

이 범위는 모든 세션을 합친 주간 총시간에 적용하는 값이 아닙니다. 세션이 여러 개면
모든 세션이 각각 같은 범위를 만족해야 합니다. Backend는 AI가 제공한 예상 시간을
그대로 신뢰하지 않고 운동별 시간을 합산하며, 저장하는 세션 시간과
`recommendation.total_duration_minutes`도 검증된 실제 합계를 사용합니다. 범위를
벗어나거나 예상 시간과 합계가 다르면 해당 결과를 저장하지 말고 AI 응답 검증 실패로
처리합니다.

시간 보정 책임은 AI Server에 있다. Backend는 AI 응답을 다시 보정하지 않고 실제 합계와
예상시간을 독립적으로 재검증한다. 보정된 정상 결과는 저장하되, 범위 또는 합계 일치
계약을 위반한 응답은 그대로 거부해 AI 이상을 숨기지 않는다.

30분 선택의 경계 예시는 다음과 같습니다.

| 운동별 시간 합계 | 결과 | 이유 |
|---:|---|---|
| 29분 | 거부 | 목표 시간 미달 |
| 30분 | 허용 | 하한 포함 |
| 35분 | 허용 | `+5분` 상한 포함 |
| 36분 | 거부 | 허용 상한 초과 |

200분 절대 상한과 요청 경계는 다음과 같습니다.

| 요청 시간 | 운동별 시간 합계 | 결과 | 이유 |
|---:|---:|---|---|
| 198분 | 198분 | 허용 | 하한 포함 |
| 198분 | 200분 | 허용 | 절대 상한 이내 |
| 198분 | 201분 | 거부 | 200분 절대 상한 초과 |
| 200분 | 200분 | 허용 | 요청·절대 상한 일치 |
| 200분 | 201분 | 거부 | 200분 절대 상한 초과 |
| 201분 | - | 요청 거부 | 요청 가능한 목표시간 초과 |

`condition_level="보통"`은 사용자의 현재 컨디션 입력이며 추천 결과의
`intensity`를 `moderate`로 고정한다는 뜻이 아닙니다. AI Server는 운동 목표,
경험 수준, 안전 조건과 실제 운동 구성을 함께 고려해 결과 강도를 결정합니다.
운동별 `intensity`가 생략되거나 `null`이면 Backend는 상위
`result.intensity`를 사용합니다. 화면용 한글 표시는 Backend 또는 Frontend에서
변환하고 AI Server 통신 및 저장 계약에는 영문 코드만 사용합니다.

## 6. GIF 연결 책임

AI Server는 GIF 파일, 외장하드 경로 또는 GIF 바이너리를 반환하지 않습니다.

Backend가 다음 순서로 GIF를 연결합니다.

```text
AI 응답 exercise_key
→ Backend가 동일 CSV에서 primary asset 조회
→ exercise_key + 장소/운동 모드 + 사용자 성별로 GIF 결정
→ 외장하드 또는 Object Storage 객체 확인
→ Frontend용 HTTPS demo_gif_url 생성
```

Frontend에는 `E:\GIFS\...`와 같은 로컬 경로를 전달하지 않습니다. HTTPS URL만 전달합니다.

## 7. 위치·장비 처리 기준

AI Server는 다음 기준으로 후보를 제한할 예정입니다.

| Backend 값 | AI 후보 처리 |
|---|---|
| `location=gym` | 헬스장 카탈로그 후보 |
| `location=home` | 홈트 카탈로그 후보 |
| `location=outdoor` | 맨몸·휴대 장비·유산소·스트레칭 후보 |
| `location=other` | 고정 기구를 가정하지 않는 안전한 후보 |
| `machine` | 머신 운동 후보 |
| `band` | 밴드 운동 후보 |
| `dumbbell` | 덤벨 운동 후보 |
| `mat` | 무장비·맨몸 운동 후보 |
| `other` | 기타 장비로 분류된 후보 |
| 빈 배열 | 특정 장비가 필요 없는 운동 우선 |

## 8. Backend 테스트 요청

- [ ] `available_equipment`가 AI 요청에 포함됩니다.
- [ ] 다중 장비 배열이 순서 변경과 관계없이 정상 전달됩니다.
- [ ] `discomfort_areas=[]` 요청이 정상 처리됩니다.
- [ ] 불편 부위 한 개가 누락 없이 전달됩니다.
- [ ] `condition_level` 네 가지 값이 모두 전달됩니다.
- [ ] `condition_note=null`이 정상 전달됩니다.
- [ ] AI `exercise_key`를 DB에 보존합니다.
- [ ] CSV에 없는 `exercise_key`는 저장하지 않습니다.
- [ ] `catalog_version` 불일치를 정상 결과로 처리하지 않습니다.
- [ ] 30분 요청에서 세션 합계 29분은 거부하고 30분과 35분은 허용하며 36분은 거부합니다.
- [ ] 198분 요청에서 198분과 200분은 허용하고 201분은 거부합니다.
- [ ] 200분 요청에서는 200분만 허용하고 201분 요청은 요청 단계에서 거부합니다.
- [ ] 세션이 여러 개일 때 각 세션의 합계를 독립적으로 검증합니다.
- [ ] `estimated_duration_minutes`와 운동별 시간 합계가 다르면 저장하지 않습니다.
- [ ] 저장되는 세션 시간과 `recommendation.total_duration_minutes`는 검증된 실제 합계를 사용합니다.
- [ ] GIF 로컬 경로와 서버 secret이 Frontend 응답에 포함되지 않습니다.
- [ ] 동일 입력을 여러 사용자가 동시에 보내도 context가 섞이지 않습니다.

## 9. 완료 기준

- [ ] Frontend 선택값이 Backend 저장값과 AI 요청에서 동일합니다.
- [ ] `available_equipment`가 실제 추천 후보에 반영됩니다.
- [ ] 피곤함·좋지 않은 컨디션과 불편 부위가 안전 조건에 반영됩니다.
- [ ] 모든 세션이 선택 시간 이상, `min(선택 시간 + 5분, 200분)` 이하이며 예상 시간이 실제 합계와 일치합니다.
- [ ] AI 추천 운동이 구매한 CSV 카탈로그로 제한됩니다.
- [ ] Backend가 `exercise_key`로 GIF 자산을 정확히 연결할 수 있습니다.
- [ ] Frontend가 Backend의 HTTPS GIF URL을 받아 표시할 수 있습니다.

## 10. 코드 공유 요청

현재 확인 가능한 원격 `backend` 브랜치에는 `backend/app/exercise_ai.py`가 존재하지만,
세션 시간이 목표시간을 초과하는지만 검사하는 이전 로직입니다. 목표 미달 방지와
최대 5분 허용·200분 절대 상한을 같은 커밋에 반영한 뒤 AI Server 요청 Schema 및
E2E 계약과 최종 대조해야 합니다.
