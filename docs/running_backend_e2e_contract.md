# Auto-Fit 러닝 Backend ↔ AI Server E2E 계약

- 계약 버전: `1.2`
- 작성일: `2026-10-20`
- 대상: Auto-Fit Backend, Frontend, AI Server 개발자
- 기준 Schema: `app/schemas/running.py`
- 검증 예제: [running_api_contract_examples.json](running_api_contract_examples.json)
- 정적 OpenAPI snapshot: [ai-openapi.json](ai-openapi.json)
- 배포 기준 OpenAPI: 실행 중인 AI Server의 `GET /openapi.json`

## 1. 목적

이 문서는 사용자가 공식 러닝 코스를 조회하거나 현재 위치에서 순환 코스를 자동 생성하고, 최종 선택 결과를 Backend에 저장하기까지의 E2E 호출 순서와 데이터 책임을 정의한다.

AI Server는 공식 코스 조회, 실제 도보 경로 검증, 거리 계산과 후보 생성을 담당한다. 사용자별 즐겨찾기, 선택 코스와 러닝 페이스의 영구 저장은 Backend가 담당한다.

## 2. 시스템 경계

```text
React Native Frontend
        |
        | 사용자 인증
        v
Backend
        |
        | Authorization: Bearer <AI_SERVER_API_KEY>
        v
AI Server
        |
        +-- 전국길관광정보표준데이터
        +-- 한국관광공사 두루누비 GPX (활성화된 경우)
        +-- Kakao Local / 도보 경로 API
```

- Frontend는 AI Server API Key를 보유하거나 AI Server를 직접 호출하지 않는다.
- Backend는 사용자 권한과 저장 transaction을 담당한다.
- AI Server 응답의 `message`는 표시용이다. 상태 분기는 enum 필드로 처리한다.

## 3. 공통 규칙

### 3.1 인증

모든 러닝 API 요청에는 다음 헤더가 필요하다.

```http
Authorization: Bearer <AI_SERVER_API_KEY>
Content-Type: application/json
```

API Key, 사용자 위치 원문과 외부 API 응답 전문을 운영 로그에 남기지 않는다.

### 3.2 좌표와 단위

| 데이터 | 규칙 |
|---|---|
| 좌표계 | WGS84 |
| API 좌표 필드 | `latitude`, `longitude` |
| GeoJSON 변환 | `[longitude, latitude]` 순서로 변환 필요 |
| 거리 | km |
| 페이스 | 분/km |
| 예상 시간 | 분 |
| Kakao 원본 시간 | 초 |

위도와 경도를 바꾸어 저장하거나 지도에 표시하지 않는다.

### 3.3 거리 옵션

`distance_option`은 다음 중 하나다.

- `3km`
- `5km`
- `10km`
- `custom`

`custom`인 경우에만 `custom_distance_km`를 함께 전달한다. 초기 거리 허용 범위는 목표 거리의 ±10%다.

### 3.4 페이스

- 사용자 저장 페이스가 있으면 `pace_minutes_per_km`로 전달한다.
- 전달하지 않으면 AI Server 기본 페이스를 사용한다.
- 응답의 `pace_source=user`는 사용자 페이스, `pace_source=default`는 가정값이다.
- `pace_assumed=true`이면 Frontend에서 수정 가능한 기본값임을 표시한다.

## 4. Endpoint 목록

| 순서 | Endpoint | 역할 |
|---|---|---|
| 1 | `GET /running/places/search` | 주소·장소 검색으로 출발지 선택 |
| 2 | `GET /running/courses/recommend` | 지역·거리·GPS 기반 공식 코스 추천 |
| 3 | `GET /running/courses/{course_id}` | 선택한 공식 코스 상세 조회 |
| 4 | `POST /running/routes/preview` | 지정 좌표의 실제 Kakao 도보 경로 검증 |
| 5 | `POST /running/routes/generate-loop` | 출발지 복귀형 자동 순환 코스 생성 |

## 5. 전체 E2E 상태 전이

```text
거리 선택(3km/5km/10km/custom) + 출발지/GPS 확보
    |
    v
GET /running/courses/recommend
    |
    +-- status=matched
    |       |
    |       +-- official_gpx
    |       |       -> GET /running/courses/{id}
    |       |       -> path 표시
    |       |       -> 사용자 선택 시 Backend 저장
    |       |
    |       +-- official_metadata
    |               -> GET /running/courses/{id}
    |               -> 필요 시 POST /running/routes/preview
    |               -> 검증된 경로를 사용자에게 표시
    |               -> 사용자 선택 시 Backend 저장
    |
    +-- status=generation_required
            |
            v
        POST /running/routes/generate-loop
            |
            +-- matched
            |       -> 후보 표시 -> 선택 시 Backend 저장
            |
            +-- best_effort
            |       -> 실제 거리·오차 표시
            |       -> 사용자 명시 선택 시에만 저장
            |
            +-- unavailable
                    -> 출발지 또는 seed 변경 후 재시도 안내
```

AI Server가 Backend DB를 직접 변경하는 단계는 없다.

Frontend의 목표 시간은 코스 검색 조건으로 사용하지 않는다. Backend 또는 Frontend가 각 코스의 `estimated_duration_minutes`와 목표 시간을 비교하여 보조 정보로 표시한다. 러닝 강도 선택은 `light → easy`, `moderate → moderate`, `hard → hard`로 변환해 선택적 `desired_difficulty`로 전달할 수 있다. 이 값은 거리 허용 범위를 바꾸지 않고 같은 거리 후보의 보조 정렬에만 사용한다.

## 6. 공식 코스 추천

### 6.1 요청

```http
GET /running/courses/recommend?region=성남시&distance_option=5km&latitude=37.3948&longitude=127.1112&pace_minutes_per_km=6.5&desired_difficulty=easy&limit=10
```

| Query | 필수 | 설명 |
|---|---:|---|
| `region` | 조건부 | 지역명. GPS가 없으면 필수 |
| `latitude` | 조건부 | `longitude`와 항상 함께 전달 |
| `longitude` | 조건부 | `latitude`와 항상 함께 전달 |
| `distance_option` | 예 | 기본값 `5km` |
| `custom_distance_km` | 조건부 | `distance_option=custom`일 때 필수 |
| `pace_minutes_per_km` | 아니요 | 2~20 |
| `desired_difficulty` | 아니요 | `easy`, `moderate`, `hard`; 거리 필터 후 보조 정렬 |
| `limit` | 아니요 | 1~20, 기본값 10 |

GPS만 전달하면 AI Server가 Kakao 행정구역 API로 `resolved_region`을 계산한다.

### 6.2 `status=matched`

`courses`가 하나 이상 존재한다. Backend와 Frontend는 `source.source_type`에 따라 처리한다.

| source type | 의미 | 후속 처리 |
|---|---|---|
| `official_metadata` | 지자체 공식 메타데이터 | 상세 조회 후 실제 경로 검증 여부 확인 |
| `official_gpx` | 두루누비 GPX 검증 코스 | 상세 조회의 `path`를 지도에 표시 |

`official_metadata`는 전체 Polyline을 보장하지 않는다. 다음 필드를 함께 확인한다.

- `geometry_status`
- `geometry_distance_km`
- `requires_route_validation`

`requires_route_validation=true`인 코스를 실제 경로가 검증된 것처럼 표시하지 않는다.

### 6.3 `status=generation_required`

```json
{
  "status": "generation_required",
  "courses": [],
  "generation_recommended": true
}
```

HTTP 오류가 아니다. Backend는 동일한 사용자 거리와 출발 좌표로 `POST /running/routes/generate-loop`를 호출한다.

### 6.4 데이터 공급자 상태

`data_sources`의 각 항목은 다음 상태를 사용한다.

- `available`
- `disabled`
- `unavailable`

두루누비가 `disabled` 또는 `unavailable`이어도 전국길 메타데이터 추천이 정상이라면 전체 요청은 성공할 수 있다.

## 7. 공식 코스 상세

```http
GET /running/courses/{course_id}?pace_minutes_per_km=6.5
```

- `official_gpx` 코스 ID는 현재 `durunubi-` prefix를 사용한다.
- GPX 상세의 `path`는 지도 Polyline으로 사용할 수 있다.
- `official_metadata` 상세는 `path=[]`일 수 있다.
- `404`이면 오래된 선택 상태를 제거하고 추천 목록을 다시 조회한다.
- 자동 생성 ID인 `generated-...`는 이 endpoint로 다시 조회하지 않는다.

## 8. 메타데이터 코스 실제 경로 검증

```http
POST /running/routes/preview
```

```json
{
  "start": {"latitude": 37.3948, "longitude": 127.1112},
  "end": {"latitude": 37.3948, "longitude": 127.1112},
  "waypoints": [
    {"latitude": 37.4000, "longitude": 127.1200}
  ],
  "pace_minutes_per_km": 6.5
}
```

추천 메타데이터의 `waypoints`는 장소 이름 문자열이며 이 API의 `waypoints`는 좌표다. Backend가 문자열을 좌표처럼 전달하면 안 된다. Frontend에서 사용자가 위치를 선택하거나 `GET /running/places/search`로 좌표를 확정한 뒤 전달한다.

이 endpoint가 반환한 최상위 `distance_km`과 `path`는 Kakao가 검증한 실제 도보 경로다. 현재 AI Server는 기존 클라이언트 호환을 위해 동일한 값을 `route.distance_km`, `route.path`에도 함께 반환하며 응답 Schema가 두 표현을 항상 같은 값으로 맞춘다. Backend는 최상위 필드를 서명·저장 대상으로 사용한다. 다만 해당 경로가 원본 지자체 코스 전체와 동일하다는 의미는 아니다.

## 9. 순환 코스 자동 생성

### 9.1 요청

```http
POST /running/routes/generate-loop
```

```json
{
  "start": {
    "latitude": 37.3948,
    "longitude": 127.1112
  },
  "distance_option": "5km",
  "pace_minutes_per_km": 6.5,
  "candidate_count": 3,
  "seed": 0
}
```

| Field | 필수 | 설명 |
|---|---:|---|
| `start` | 예 | GPS 또는 장소 검색으로 확정한 출발 좌표 |
| `distance_option` | 예 | 거리 preset 또는 `custom` |
| `custom_distance_km` | 조건부 | 사용자 지정 거리 |
| `pace_minutes_per_km` | 아니요 | 사용자 저장 페이스 |
| `candidate_count` | 아니요 | 1~3, 기본값 3 |
| `seed` | 아니요 | 동일 방향 후보 재현 및 다른 코스 생성에 사용 |

### 9.2 결과 상태

| status | 의미 | Backend 처리 |
|---|---|---|
| `matched` | 반환 후보가 목표 거리 ±10% 안에 있음 | 일반 후보로 표시 가능 |
| `best_effort` | 경로는 있으나 모든 후보가 허용 범위 밖 | 실제 거리와 오차를 강조하고 사용자 선택 시에만 저장 |
| `unavailable` | 제한된 횟수 내 경로 생성 실패 | 저장 금지, 위치 또는 seed 변경 안내 |

각 후보에서 반드시 사용할 필드:

- `course_id`
- `target_distance_km`
- `distance_km`
- `distance_error_km`
- `distance_error_percent`
- `within_tolerance`
- `estimated_duration_minutes`
- `pace_source`
- `start`, `end`, `waypoints`
- `path`
- `generation_seed`
- `source`

`best_effort`를 `matched`로 변환하거나 오차를 숨기지 않는다.

### 9.3 다른 코스 다시 생성

사용자가 다른 코스를 요청하면 같은 출발지와 거리로 새 `seed`를 전달한다. Backend는 사용자별 최근 seed를 저장할 수 있지만 AI Server가 이를 보존한다고 가정하지 않는다.

## 10. Backend 저장 계약

Backend 저장 API 이름과 DB Schema는 Backend 구현에 맞추되 다음 정보를 손실 없이 보존한다.

| 저장 필드 | 설명 |
|---|---|
| 사용자 ID | Backend 인증 사용자 |
| `course_id` | AI 응답의 코스 식별자 |
| `source_type` | `official_metadata`, `official_gpx`, `auto_generated` |
| 코스 이름·지역 | 사용자 표시용 snapshot |
| 목표 거리 | 자동 생성 요청 거리, 해당하는 경우 |
| 실제 거리 | AI 응답 `distance_km` |
| 거리 오차 | 자동 생성의 km와 percent |
| `within_tolerance` | 자동 생성 정상 범위 여부 |
| 예상 시간·사용 페이스 | 선택 시점 snapshot |
| 난이도·순환 여부 | 선택 시점 snapshot |
| 출발·도착 좌표 | WGS84 |
| 경유점 | 이름 또는 좌표를 타입에 맞게 보존 |
| 전체 `path` | GPX 또는 자동 생성 경로 |
| 공급자 정보 | provider, dataset, source ID, 기준일 |
| 생성 seed | 자동 생성 후보 재현 정보 |

자동 생성 `course_id`는 AI Server DB의 영구 ID가 아니다. Backend는 사용자가 선택한 자동 생성 후보의 전체 경로 snapshot을 반드시 함께 저장해야 한다.

코스 이름만으로 중복 여부를 판단하지 않는다. 사용자별 즐겨찾기 중복 정책은 Backend가 `course_id`, source와 저장 snapshot을 기준으로 정한다.

## 11. Backend → Frontend 전달 규칙

- Frontend에는 AI Server API Key를 전달하지 않는다.
- `path`는 지도 Polyline용 좌표 배열로 전달한다.
- `pace_assumed=true`이면 기본 페이스라는 문구와 수정 기능을 제공한다.
- `requires_route_validation=true`이면 미검증 경로 상태를 표시한다.
- `best_effort`이면 실제 거리와 오차율을 숨기지 않는다.
- `unavailable`이면 빈 코스를 정상 후보처럼 만들지 않는다.
- `source.provider`와 공식 데이터 여부를 표시할 수 있도록 보존한다.

## 12. 오류 처리와 재시도

| HTTP/상태 | 의미 | 처리 |
|---|---|---|
| `200 + matched` | 정상 후보 | 화면 표시 |
| `200 + generation_required` | 공식 후보 없음 | 자동 생성 흐름으로 이동 |
| `200 + best_effort` | 거리 오차가 큰 자동 생성 후보 | 오차 표시 후 사용자 선택 대기 |
| `200 + unavailable` | 자동 생성 실패 | 위치 또는 seed 변경 안내 |
| `401` | 인증 누락/불일치 | 자동 재시도 금지, 서버 설정 확인 |
| `404` | 공식 코스 없음 | 선택 상태 제거 후 목록 갱신 |
| `422` | 요청 검증 실패 | DTO 매핑 수정 후 재요청 |
| `500` | AI Server 설정 또는 내부 오류 | 제한 재시도 후 운영 확인 |
| `502` | 외부 지도/공공데이터 장애 | 짧은 backoff로 제한 재시도 |
| `503` | 필수 외부 설정 미완료 | 설정 확인, 무한 재시도 금지 |

자동 생성 요청은 외부 경로 API 호출을 포함하므로 Backend timeout은 일반 조회보다 길게 설정한다. 동일 요청을 무제한 자동 재시도하지 않는다.

## 13. 동시성·멱등성

- 추천과 자동 생성은 사용자별 독립 요청이다.
- `seed`가 없는 자동 생성은 매번 다른 결과가 가능하다.
- 같은 요청의 네트워크 재전송을 저장 transaction 재실행과 혼동하지 않는다.
- Backend 저장 endpoint는 사용자 ID와 선택 코스 식별자를 기준으로 중복 저장을 방지한다.
- 사용자가 마지막으로 선택한 결과만 저장할 경우 Backend transaction에서 기존 선택을 교체한다.

## 14. E2E 수용 시나리오

### 시나리오 A: 공식 메타데이터 코스

1. GPS와 5km로 공식 추천 요청
2. `status=matched`
3. `source_type=official_metadata`
4. 상세 조회
5. 필요 시 장소 좌표 확정 후 route preview
6. 사용자 선택
7. Backend가 검증 상태와 snapshot 저장

### 시나리오 B: 두루누비 GPX 코스

1. 공식 추천에서 `source_type=official_gpx` 선택
2. 상세 조회
3. `geometry_status=verified_polyline`
4. `path` 지도 표시
5. 사용자 선택 후 Backend 저장

### 시나리오 C: 공식 코스 없음

1. 공식 추천에서 `status=generation_required`
2. 동일 출발지와 거리로 loop generation 호출
3. `status=matched`
4. 후보 지도 표시
5. 사용자 선택 후 전체 path snapshot 저장

### 시나리오 D: 거리 오차

1. loop generation 결과 `status=best_effort`
2. `within_tolerance=false`와 오차율 표시
3. 사용자가 명시적으로 선택하거나 다른 seed로 재생성
4. 자동 선택 금지

### 시나리오 E: 생성 실패

1. loop generation 결과 `status=unavailable`
2. 후보 목록이 비어 있음을 확인
3. 저장 금지
4. 출발지 또는 seed 변경 안내

## 15. 현재 제한사항

- 두루누비 API 권한이 승인되고 `RUNNING_DURUNUBI_ENABLED=true`인 환경에서만 GPX 공급자가 활성화된다.
- 자동 생성 코스는 AI Server에 영구 저장되지 않는다.
- 즐겨찾기와 선택 코스 저장 endpoint는 Backend가 제공한다.
- 실제 Frontend ↔ Backend ↔ AI Server 통합 E2E는 Backend 저장 API와 DTO가 준비된 뒤 실행한다.

## 16. Backend 체크리스트

- [ ] AI Server URL과 Bearer Key를 환경별로 분리했다.
- [ ] Frontend가 AI Server를 직접 호출하지 않는다.
- [ ] WGS84 `latitude`, `longitude` 순서를 유지한다.
- [ ] 거리 선택을 `distance_option`과 `custom_distance_km`로 변환한다.
- [ ] 목표 시간은 `estimated_duration_minutes`와 비교하는 보조값으로 사용한다.
- [ ] 러닝 강도를 사용할 경우 `desired_difficulty`로 변환한다.
- [ ] `pace_assumed`를 사용자에게 표시한다.
- [ ] `generation_required`를 오류가 아닌 자동 생성 전이로 처리한다.
- [ ] `official_metadata`와 `official_gpx`를 구분한다.
- [ ] `requires_route_validation`을 보존한다.
- [ ] `matched`, `best_effort`, `unavailable`을 구분한다.
- [ ] 자동 생성 후보의 전체 `path`를 선택 시 저장한다.
- [ ] 기본 페이스 사용 여부를 Frontend에 전달한다.
- [ ] 사용자별 즐겨찾기와 선택 저장을 transaction으로 처리한다.
- [ ] `401`, `404`, `422`, `502`, `503` 정책을 구현한다.
- [ ] [running_api_contract_examples.json](running_api_contract_examples.json)을 Backend DTO fixture로 사용한다.

## 17. 계약 변경 규칙

필드 삭제, 이름 변경, enum 제거는 계약 버전을 올린 뒤 Backend와 동시에 배포한다. 선택 필드 추가와 enum 추가도 Backend가 알 수 없는 값을 안전하게 처리하는지 먼저 확인한다. 변경 후 다음 테스트를 반드시 통과시킨다.

- `test_running_api_contract_examples.py`
- `test_running_e2e_contract.py`
- `test_running_openapi.py`
- `test_backend_ai_integration_contract.py`
- 러닝 관련 기존 단위·실연동 테스트

기본 `pytest` 실행에서는 외부 Kakao·공공데이터 제공기관을 호출하는
`live` 테스트를 건너뛴다. 승인된 개발 또는 배포 환경에서 실제 secret을
설정한 뒤 `RUN_LIVE_RUNNING_TESTS=1`을 명시한 경우에만 라이브 테스트를
실행한다. API Key 값은 명령 출력, 테스트 로그 또는 저장소에 기록하지
않는다.
