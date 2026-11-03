# 운동 추천 AI 연동 요청 — Backend 담당자용

> 작성일: 2026-11-03
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
| `available_minutes` | 정수 | `30`, `45`, `60`, `90`, `120` 중 하나 |
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
    "intensity": "보통",
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
            "duration_minutes": 5,
            "intensity": "보통",
            "instructions": [
              "복부에 힘을 유지하고 천천히 수행하세요."
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

- `catalog_version`이 Backend에 배포된 CSV 버전과 일치하는지
- 모든 `exercise_key`가 Backend CSV에 존재하는지
- 요청 장소와 운동의 `exercise_modes`가 충돌하지 않는지
- 요청한 장비로 수행할 수 있는 운동인지
- 운동 시간이 유효한지
- 빈 세션 또는 빈 운동 목록을 정상 추천으로 저장하지 않는지

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
- [ ] GIF 로컬 경로와 서버 secret이 Frontend 응답에 포함되지 않습니다.
- [ ] 동일 입력을 여러 사용자가 동시에 보내도 context가 섞이지 않습니다.

## 9. 완료 기준

- [ ] Frontend 선택값이 Backend 저장값과 AI 요청에서 동일합니다.
- [ ] `available_equipment`가 실제 추천 후보에 반영됩니다.
- [ ] 피곤함·좋지 않은 컨디션과 불편 부위가 안전 조건에 반영됩니다.
- [ ] AI 추천 운동이 구매한 CSV 카탈로그로 제한됩니다.
- [ ] Backend가 `exercise_key`로 GIF 자산을 정확히 연결할 수 있습니다.
- [ ] Frontend가 Backend의 HTTPS GIF URL을 받아 표시할 수 있습니다.

## 10. 코드 공유 요청

현재 확인 가능한 원격 `backend` 브랜치에는 안내받은 `backend/app/exercise_ai.py`가 아직 존재하지 않습니다. 해당 변환 코드가 GitHub에 반영되면 AI Server 요청 Schema 및 E2E 계약과 최종 대조가 필요합니다.
