# KDRI 식단·메뉴 성향 배포 인계 (2026-11-19)

## 이번 백엔드 변경

- `GET/PUT /api/diet/preferences`는 인증된 사용자의 `menu_style_preference`를 조회·저장한다. 요청값은 `everyday`, `health_focused`, `null`이다. 응답은 `{ "preferences": { "menu_style_preference": ... } }`이고, `null`은 선택하지 않은 상태다.
- `20261119042903_diet_menu_style_preference.sql`은 기존 `user_app_preferences`에 nullable 열과 허용값 제약만 추가한다. 기존 행의 표시 설정과 식단 성향은 그대로 유지한다.
- 만 19세 미만 생일로 `PATCH /api/profile`을 변경할 수 없다. 식단 생성·재추천과 자정 자동 생성은 한국 시간 기준 만 19~120세만 사용한다. 기존 식단 조회와 기록은 삭제하지 않는다.
- 주간 식단의 신규 AI 입력은 확정된 체성분·검진 수치, 활성 건강 목표, 검증된 건강 지표 상태, 메뉴 성향을 사용한다. 원본 업로드 파일·OCR 원문·사용자 식별자는 AI로 보내지 않는다. 입력은 `weekly_diet_plans.request_context`에 생성 시점 스냅샷으로 남고, 한 끼 재추천은 그 스냅샷을 사용한다.
- AI의 선택형 한 끼 응답 `adjustment`는 15% 상한과 열량 계산의 일관성을 검사한다. 여러 끼 미리보기·최종 일괄 저장 API는 이번 변경에 없다.

## 배포 순서

1. 이병희 님의 운영 AI `GET /openapi.json`에서 `/recommend/diet`, `/recommend/diet/replace-meal` 요청에 `nutrition_profile`, `reference_standard`, `menu_style_preference`가 있고, 한 끼 응답에 `adjustment`가 있는지 확인한다. 소스 커밋만으로 운영 반영을 단정하지 않는다.
2. 운영 DB에 `20261119042903_diet_menu_style_preference.sql`을 적용한다. 이 작업은 아직 수행하지 않았다.
3. 이승현 님이 새 백엔드를 배포한다. `DIET_KDRI_ENABLED`의 기본값은 `false`이므로 이 상태에서는 기존 AI 요청 형식을 유지한다. 기존 A안 빌드에도 새 선택 UI는 연결되지 않았다.
4. 운영 AI 계약과 DB 적용을 재확인한 뒤 백엔드 환경변수 `DIET_KDRI_ENABLED=true`로 전환한다. 생성 결과가 `health_records`/`basic_profile`과 저장된 성향에 맞는지 시험한다.
5. 이승현 님이 A안에서 선택값 API를 연결한다. 미선택 `null`은 서버가 AI 요청에서 `balanced`로 변환한다. 명시적 `everyday`/`health_focused`가 503이면 안전한 후보 부족 안내를 표시한다.

AI를 이전 버전으로 되돌려 `DIET_KDRI_ENABLED=false`로 내리면 신규 생성은 기존 형식을 쓰지만, KDRI 입력으로 이미 만든 주간 식단의 재생성·한 끼 재추천은 `AI_KDRI_DISABLED`(503)로 중단한다. 그 식단 조회는 계속 가능하다.

## 프론트 연동에서 확정할 점

현재 `renewal-a`의 식단 탭은 오늘 식단을 일일 추천 `/api/diet/recommendations/generate`와 해당 날짜 조회에서 우선 읽고, `/api/diet/weekly-recommendations`는 빈 자리를 채운다. 새 KDRI·메뉴 성향 계약은 주간 AI 경로에 연결됐다. 따라서 선택 UI를 단순히 `GET/PUT /api/diet/preferences`에 연결하는 것만으로 오늘의 일일 추천 메뉴가 스타일대로 바뀌지는 않는다. 오늘 식단의 기본 출처와 기록·피드백 연결을 이승현 님과 정해야 한다.

## 검증과 한계

- 생성 뒤 저장 직전에 사용자 입력을 다시 읽어 변경을 감지한다. 새 메뉴 성향·건강 목표·건강 수치 변경과 최종 DB 저장 사이의 아주 짧은 경합은 DB 트리거로 잠그지 않았다. 저장된 스냅샷은 실제 AI 요청에 사용한 값을 나타내며, 최신값을 다시 적용하려면 식단을 재생성한다.
- `DIET_KDRI_ENABLED=true`인 성인이라도 생일·성별·키·몸무게가 AI 허용 범위에 없으면 주간 생성은 `DIET_PROFILE_INCOMPLETE`(422)로 막는다. 없는 측정 수치를 정상으로 추정하지 않는다.
- `내일 맞추기`의 사용자 선택 끼니 미리보기, 초과 열량 분배, 최저 섭취 기준, 선택 끼니 일괄 저장은 별도 API·정책 합의 후 구현해야 한다.
