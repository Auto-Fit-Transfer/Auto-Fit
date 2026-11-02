# 러닝 Backend 연동 현황

기준: 모델 개발 담당자의 `running_backend_e2e_contract.md` 계약 1.0. 인증된 앱은 `/api/running/*`만 호출한다. AI 서버 Bearer Key는 백엔드 환경변수에만 둔다.

## 앱 호출 순서

1. `GET /api/running/places/search?query=...`로 출발 좌표를 확정한다.
2. `GET /api/running/courses/recommend?distance_option=5km&latitude=...&longitude=...`로 공식 코스를 찾는다. `generation_required`면 같은 출발지·거리로 4번을 호출한다.
3. 공식 코스는 `GET /api/running/courses/{course_id}`로 상세 경로를 받는다. `requires_route_validation=true`면 좌표를 확정한 뒤 `POST /api/running/routes/preview`로 도보 경로를 확인한다.
4. `POST /api/running/routes/generate-loop`는 `matched`, `best_effort`, `unavailable`을 그대로 전달한다. `best_effort`의 실제 거리와 오차율을 사용자에게 보여 준다.
5. 선택한 코스는 `POST /api/running/saved-courses`에 응답의 코스 객체(`snapshot`)와 `selection_token`을 함께 보낸다. 공식 메타데이터의 검증 경로가 있으면 `preview` 및 `preview_token`도 보낸다. `best_effort` 저장에는 `accept_distance_error: true`가 필요하다.
6. `GET /api/running/saved-courses`, `PATCH /api/running/saved-courses/{id}/favorite`, `GET/PUT /api/running/pace`가 사용자별 저장 상태를 처리한다.

예: 자동 생성 선택 요청

```json
{
  "snapshot": {"course_id": "generated-...", "name": "...", "source": {"source_type": "auto_generated"}, "path": [{"latitude": 37.3948, "longitude": 127.1112}], "within_tolerance": true},
  "selection_token": "응답의 selection_token",
  "is_favorite": true,
  "is_selected": true
}
```

`snapshot`은 AI 응답의 **전체 코스 객체**를 전달해야 한다. 위 예시는 필드 설명용 축약본이다. 백엔드는 사용자와 응답 내용을 묶은 30분 유효 토큰을 검증한 뒤 원본 스냅샷을 저장한다. 같은 AI `course_id`가 다른 경로를 돌려주면 별도 버전으로 저장하므로 이전 러닝 기록의 경로가 바뀌지 않는다. 저장된 코스는 `running_recommendations.running_saved_course_id`로 연결할 수 있다.

## 단위와 상태

- AI 계약: 거리 km, 예상 시간 분, 페이스 분/km, WGS84 `latitude`·`longitude`.
- 기존 러닝 기록 테이블: 거리 m, 시간 초, 페이스 초/km. 기록을 만들 때 변환한다.
- `generation_required`와 `unavailable`은 정상 HTTP 응답의 상태이며 코스 저장을 하지 않는다.
- `official_metadata`는 검증된 전체 경로가 아닐 수 있다. `requires_route_validation`이 참이면 경로 미리보기 없이 저장할 수 없다.
- 사용자 저장 페이스가 없으면 AI 서버에 페이스를 보내지 않는다. AI가 반환하는 기본값과 `pace_assumed`를 앱에 그대로 전달한다.

## R7 E8 자유 러닝 기록

코스 AI가 아직 연결되지 않아도, 사용자가 목표 거리·시간·강도·컨디션을 선택해 **코스 없는 자유 러닝**을 기록할 수 있다. 이 경로는 AI 추천이라고 표시하지 않는다.

1. 앱에서 `expo-location`의 앱 사용 중 위치 권한을 받은 뒤 `POST /api/running/sessions`로 세션을 시작한다. 서버는 사용자 직접 코스(예정 경로 없음), 추천 참조 행, 세션을 기존 DB 제약에 맞춰 생성한다.
2. 앱이 열린 동안 `POST /api/running/sessions/{id}/points`로 위도·경도·정확도·실제 활동 시간을 보낸다. 서버가 거리와 평균 페이스를 계산한다. 정확도 50m 초과, 3m 미만 흔들림, 12m/s를 넘는 좌표 점프는 거리에 반영하지 않는다.
3. `POST /api/running/sessions/{id}/pause`와 `.../resume`으로 중지·재개한다. 화면을 벗어나거나 앱이 백그라운드로 가면 일시정지를 요청한다. 위치 저장이 실패하면 앱은 러닝을 멈추고 오류를 보여 준다.
4. `POST /api/running/sessions/{id}/complete`로 종료·저장한다. `GET /api/running/sessions/{id}`에서 본인 세션과 실제 GPS 경로를 읽는다. `GET /api/running/sessions/active`로 재진입 시 진행 중 세션을 확인하고, `GET /api/running/sessions/history`로 완료 기록을 E9에 표시한다.

모든 세션 요청은 로그인 사용자 소유 행으로 제한한다. 앱에는 service role 키가 없다. 칼로리 계산 기준이 없으므로 0으로 저장하고 화면에는 표시하지 않는다. 시작 시 3개 행을 순서대로 생성하고 실패 시 역순으로 정리하지만, 정리 요청까지 실패하는 네트워크 장애에는 잔여 행 점검이 필요하다. 실기기 GPS·백그라운드 전환·장시간 네트워크 변경 검증은 아직 수행하지 않았다.

## 공용 서버 설정과 남은 연동

공용 Render `auto-fit-api-dev`에는 러닝 API 커밋 `84b150b`가 2026-10-20 배포되었다. 현재 AI 서버 URL과 키가 준비되지 않아 AI 실호출은 아직 검증하지 못했다. 담당자가 URL과 키를 제공하면 Render 환경변수 `AI_SERVER_BASE_URL`, `AI_SERVER_API_KEY`, `AI_SERVER_ENABLED=true`를 설정하고, AI 서버의 `/openapi.json`과 실제 예제 응답으로 필드 이름을 대조해야 한다. 계약이 참조하는 `running_api_contract_examples.json`도 현재 전달된 파일에 포함되지 않았다.

`front_new` 작업본에는 지역·거리별 코스 목록, 상세 조회, 실제 좌표 기반 경로 도식, 검증 후 저장, 본인 저장 코스에서의 러닝 시작, 자유 러닝 진행·완료 화면이 있다. `POST /api/running/sessions/from-saved-course`는 본인 소유 저장 코스의 경로·거리를 확인하고 추천 행과 세션을 만든다. `GET /api/running/sessions/{id}`는 저장 코스의 예정 경로를 본인에게만 반환하며 앱은 예정 경로와 실제 GPS 이동을 함께 그린다. 도식은 지도나 길 안내가 아니다. AI 서버가 없어 실제 코스 응답에 대한 연동 검증은 아직 못했다. 백엔드와 프론트가 서로 다른 작업본에 있으므로 배포 전에 통합해야 한다.
