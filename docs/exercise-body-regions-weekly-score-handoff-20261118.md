# 운동 부위·주간 건강점수 Backend 연동 계약

작성일: 2026-11-18. 대상: Backend, AI, Frontend, 서버 운영.

## 운동 부위

AI `/recommend/exercise` 응답의 각 `result.sessions[].exercises[]`는 다음 필드를 보냅니다.

```json
{"exercise_key":"ex_846f603683467e","body_regions":["core"]}
```

- 허용값은 `upper_body`, `core`, `lower_body`, `full_body`입니다. 배열은 1~4개이며 중복 값과 `full_body`를 다른 값과 함께 보내는 경우를 거절합니다.
- Backend는 AI 값이 선택된 `exercise_key`의 서버 카탈로그 분류와 일치하는지 확인합니다. 현재 카탈로그의 `Waist`는 `core`로 매핑합니다. AI가 아직 필드를 보내지 않는 전환 기간에는 같은 카탈로그에서 분류를 만들어 저장합니다.
- 저장 위치는 `exercise_items.body_regions text[]`입니다. 새 Backend가 만든 추천은 비어 있지 않은 배열을 저장합니다. 과거 행이나 DB 마이그레이션과 Backend 배포 사이에 구버전 Backend가 만든 행은 `NULL`일 수 있습니다.
- `GET /api/exercise/recommendations/latest`의 `result.items[].body_regions`, `GET /api/exercise/history`의 `history[].logs[].body_regions`는 저장된 배열을 그대로 반환합니다. 과거·사용자 운동 기록은 `null`일 수 있습니다. `full_body`는 `["full_body"]` 그대로 전달하며 서버에서 세 부위로 분산하지 않습니다.
- 기존 `/api/exercise/progress`의 `category_distribution`은 운동 유형 분포라 유지합니다. A안 리포트는 현재 `/api/exercise/history`를 읽으므로 Frontend는 이 기록의 `body_regions`를 사용해 이름 키워드 추정을 교체해야 합니다. 화면의 `full_body` 표시와 과거 `null` 표시는 Frontend와 확정합니다.

## 주간 운동 점수 입력

`GET /api/health-assessments/input`의 `score_context.weekly_exercise`는 원본 `exercise_logs`, `exercise_sessions`, `exercise_items`, `exercise_recommendations`, 활성 `exercise_goals`를 사용자 범위로 조회해 구성합니다. 이 객체를 AI `/health-analysis`의 `input.score_context.weekly_exercise`로 전달할 수 있습니다.

```json
{"score_context":{"weekly_exercise":{"goal_type":"body_fat_loss","target_minutes":90,"completed_minutes":60,"target_days":3,"completed_days":2,"goal_aligned_completed_days":2}}}
```

- 한국 시간 기준 현재 주 월요일 00:00부터 다음 월요일 00:00 전까지 집계합니다.
- `completed`·`stopped` 세션에서 실제 완료된 항목만 인정합니다. 세트 기반은 `completed_sets >= 1` 및 `duration_minutes >= 1`, 시간 기반은 `duration_minutes >= 1`이 필요합니다. 건너뛴 항목, 미완료, 0분, 진행 중 세션은 제외합니다. 동일 세션·항목 로그는 한 번만 더합니다.
- `completed_days`는 인정 운동이 있는 고유 날짜, `goal_aligned_completed_days`는 활성 목표와 추천 목표가 같은 인정 운동이 있는 날짜입니다. 후자는 전자를 넘지 않습니다.
- Backend 목표명 → AI 목표명: `weight_loss → body_fat_loss`, `muscle_gain → muscle_gain`, `maintenance → weight_management`, `endurance → regular_exercise`. `rehabilitation` 및 `other`에는 AI 대응값이 없어 `weekly_exercise` 전체를 생략합니다.
- 목표나 원본 메타데이터를 안전하게 확인할 수 없으면 `score_context`는 `{}`이고 `weekly_exercise` 키 자체가 없습니다. 완전한 원본을 조회한 결과 운동이 없을 때만 0을 보냅니다.
- 현재 Backend에는 AI `/health-analysis` 호출 경로가 없습니다. 이 입력 응답을 AI 요청에 연결하고 다른 점수 입력(`weekly_diet`, 기준 건강검진 등)을 채우는 작업은 별도 연동이 필요합니다. 이 변경만으로 운영 건강점수가 바뀌지는 않습니다.

## 배포 순서와 검증

1. DB 마이그레이션 `20261118035110_exercise_body_regions.sql`을 적용합니다. 구버전 Backend 요청이 필드를 생략하면 `NULL`로 저장하므로 추천 생성은 계속됩니다. 필드를 제공하면서 빈 배열·중복·잘못된 값이면 즉시 거절합니다.
2. 새 Backend를 배포합니다. 새 API가 컬럼을 조회하므로 DB 마이그레이션이 반드시 먼저입니다.
3. AI가 `body_regions`를 출력하게 배포하고 추천·이력의 `core/lower_body/full_body` 응답을 확인합니다.
4. Frontend는 리포트에서 기록별 배열을 사용하고, TestFlight에서 부위 표시를 확인합니다.
5. 건강점수 AI 요청 조립 경로가 준비되면 `score_context.weekly_exercise` 전달 및 완료·중도 종료 사례를 E2E로 확인합니다.

로컬 검증: Backend Python 시험 1,227개, 격리 PostgreSQL RPC 시험. 운영 DB 적용과 서버 배포는 아직 수행하지 않았습니다.
