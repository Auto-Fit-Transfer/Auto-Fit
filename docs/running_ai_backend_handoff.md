# Running AI Server Backend Handoff

## 목적

이 문서는 Backend가 Auto-Fit AI Server의 러닝 기능을 공용 환경에 연결할 때 필요한 운영 계약과 전달 항목을 정리한다.

## 필수 5개 경로

| Method | Path | 역할 |
|---|---|---|
| `GET` | `/running/places/search` | 주소·장소 검색과 좌표 반환 |
| `GET` | `/running/courses/recommend` | 거리·지역·GPS 기반 공식 코스 추천 |
| `GET` | `/running/courses/{course_id}` | 공식 코스 상세 조회 |
| `POST` | `/running/routes/preview` | 좌표 기반 실제 도보 경로 미리보기 |
| `POST` | `/running/routes/generate-loop` | 거리 목표 기반 순환 코스 후보 생성 |

모든 경로는 `Authorization: Bearer <AI_SERVER_API_KEY>`가 필요하다. API Key는 Frontend에 전달하지 않고 Backend와 AI Server의 secret 환경변수로만 관리한다.

## 거리·시간·강도 정책

- `distance_option`의 `3km`, `5km`, `10km`, `custom`을 코스 검색의 기본 조건으로 사용한다.
- `custom`일 때만 `custom_distance_km`를 함께 보낸다.
- 목표 시간은 검색 거리로 역산하지 않고 반환된 `estimated_duration_minutes`와 비교하는 보조 목표로 사용한다.
- 사용자의 저장 페이스가 있으면 `pace_minutes_per_km`로 전달한다.
- 저장 페이스가 없으면 생략할 수 있으며 응답의 `pace_assumed=true`를 사용자에게 표시한다.
- Frontend 강도는 `light -> easy`, `moderate -> moderate`, `hard -> hard`로 변환해 선택적 `desired_difficulty`에 전달한다.
- `desired_difficulty`는 거리 허용 범위를 변경하지 않고 후보의 보조 정렬에만 사용한다.

## 지역·장소 검색 정책

- `GET /running/places/search`는 `limit` 1~20을 받으며 기본값은 10이다. 응답 `places`는 요청한 `limit`을 초과하지 않는다.
- `광주광역시 동구청`처럼 상·하위 행정구역이 함께 오면 모든 단계가 일치해야 한다. `동구청` 하나만 같다는 이유로 대구·울산 코스를 반환하지 않는다.
- GPS로 행정구역을 해결할 때도 `region_1depth_name`(시·도)과 `region_2depth_name`(시·군·구)를 함께 보존한다.
- GPS 좌표가 포함된 공식 코스 추천은 코스 출발지가 사용자 위치에서 직선거리 3km 이내인 결과만 반환한다. 출발지 좌표를 확인할 수 없거나 3km를 초과하는 코스는 제외한다. 지역명만 전달한 검색에는 이 반경 제한을 적용하지 않는다.
- `data_sources.official_gpx=disabled`이면 공식 메타데이터 목록 추천은 가능하지만, 해당 코스의 전체 공식 Polyline은 보장하지 않는다. `official_metadata` 상세의 `path=[]`와 `requires_route_validation=true`를 정상 상태로 처리한다.
- 지도에 공식 전체 경로를 표시하려면 `RUNNING_DURUNUBI_ENABLED=true`로 검증된 GPX를 활성화하거나, 메타데이터 출발·도착·경유지 좌표를 확정한 후 `/running/routes/preview`로 Kakao 보행 경로를 따로 검증한다. 후자는 지자체 원본 코스와 동일하다고 표시하면 안 된다.

## 전달 자료

- 상세 계약: `docs/running_backend_e2e_contract.md`
- 실행 예시: `docs/running_api_contract_examples.json`
- 정적 OpenAPI snapshot: `docs/ai-openapi.json`
- 배포 후 기준 OpenAPI: `<AI_SERVER_HTTPS_BASE_URL>/openapi.json`
- 상태 확인: `<AI_SERVER_HTTPS_BASE_URL>/health`

정적 snapshot과 실행 중인 `/openapi.json`이 다르면 실행 중인 배포본을 기준으로 원인을 확인한다.

## Backend 브랜치 대조 결과

`origin/backend`의 실제 `backend/app/running.py`와 `backend/app/running_ai.py`를 기준으로 확인한 계약은 다음과 같다.

- Backend는 필수 5개 AI 경로를 호출한 뒤 사용자별 선택 token을 서명하고 Supabase에 선택·즐겨찾기·페이스·전체 경로 snapshot을 저장한다.
- `POST /running/routes/preview`는 Backend가 최상위 `distance_km`과 `path`를 검증하므로 AI Server는 이 필드를 최상위에 반환한다. 기존 `route` wrapper도 호환을 위해 유지한다.
- Backend의 코스 추천 proxy는 아직 `desired_difficulty`를 AI Server에 전달하지 않는다. Frontend 강도 반영을 위해 Backend query DTO와 전달 params에 이 필드를 추가해야 한다.
- Backend는 `custom_distance_km`를 100km까지, AI Server는 서비스 정책상 50km까지 허용한다. Backend 상한을 50km로 맞춰야 한다.
- Backend route preview는 경유점을 25개까지 허용하지만 AI Server와 현재 Kakao 연동 계약은 최대 5개다. Backend 상한을 5개로 맞춰야 한다.
- Backend의 `region` 최대 길이는 120자, AI Server는 100자다. Backend validation을 100자로 맞춰야 upstream 422를 사전에 방지할 수 있다.

## Backend 환경변수

Backend의 공용 Render 환경에는 다음 값을 secret으로 설정한다.

```text
AI_SERVER_BASE_URL=<AI_SERVER_HTTPS_BASE_URL>
AI_SERVER_API_KEY=<securely-shared-api-key>
AI_SERVER_ENABLED=true
```

실제 URL과 Key는 저장소, 이슈, 채팅 또는 일반 문서에 기록하지 않는다. Render secret 설정 또는 팀이 승인한 비밀관리 경로로 전달한다.

## AI Server 배포 확인

AI Server에는 최소 다음 secret이 필요하다.

```text
AI_SERVER_API_KEY
KAKAO_REST_API_KEY
PUBLIC_DATA_SERVICE_KEY
```

전체 Auto-Fit 기능을 같은 배포에서 제공하면 기존 기능에 필요한 OpenAI·식단·RAG 관련 환경변수도 함께 설정한다. Docker 실행은 Render가 주입하는 `PORT`를 사용하며, 로컬에서는 기본값 `8001`을 사용한다.

## 실연동 점검 순서

1. `/health`가 HTTPS에서 정상 응답하는지 확인한다.
2. 인증 헤더 없이 필수 경로가 `401`을 반환하는지 확인한다.
3. 올바른 Bearer Key로 장소 검색을 실행한다.
4. `5km` 공식 코스 추천과 상세 조회를 실행한다.
5. 공식 코스가 없을 때 `generation_required`를 확인한다.
6. 동일 거리와 출발 좌표로 순환 코스를 생성한다.
7. `matched`, `best_effort`, `unavailable`을 각각 계약대로 처리한다.
8. Backend가 선택·즐겨찾기·페이스·경로 snapshot을 저장하는지 확인한다.
9. Frontend에서 저장 결과와 지도 Polyline을 최종 확인한다.

`POST /running/session/recommend`는 AI Server에 호환 기능으로 남아 있지만, 위 필수 5개 경로의 Backend 운영 계약에는 포함하지 않는다.
