# Auto-Fit 푸드샷 Backend·Frontend 연동 인계서

작성일: 2026-11-09
AI Server 기준 브랜치: `ai`

## 결론

AI Server의 푸드샷 분석·공식 영양 재계산 API는 구현되어 있다. 현재 앱은
사진 촬영 후 자동 분석 API를 호출하지 않고 수동 입력 화면으로 이동하므로,
Backend 프록시와 Frontend 상태 연결이 남아 있다.

OCR 서버는 건강검진·인바디 문서 전용이며 푸드샷에 연결하지 않는다.

## AI Server 계약

### 최초 분석

```http
POST /food-analysis/analyze
Authorization: Bearer <AI_SERVER_API_KEY>
Content-Type: multipart/form-data
```

AI 내부 multipart field는 `image`다.

### 사용자 확인·수정 후 재계산

```http
POST /food-analysis/recalculate
Authorization: Bearer <AI_SERVER_API_KEY>
Content-Type: application/json
```

```json
{
  "items": [
    {
      "name": "김치볶음밥",
      "amount_g": 200.0,
      "matched_food_code": "[공식 Food DB 코드]"
    }
  ]
}
```

`matched_food_code`가 있으면 이름 fuzzy match 없이 공식 code로 조회한다. 이름을
바꿨다면 이전 code를 재사용하지 말고 새 공식 음식 선택 결과의 code를 보낸다.

### 운영 상태

```http
GET /health/food-image
```

이미지나 사용자 정보 없이 worker별 요청·실패·partial·미파싱·공식 DB 장애
카운터를 반환한다.

상세 응답과 오류 계약은
[food_image_backend_contract.md](food_image_backend_contract.md)를 따른다.

## Backend 필수 작업

1. 인증된 공개 분석 endpoint를 추가한다.
2. Frontend multipart field `file`을 AI 내부 field `image`로 전달한다.
3. 기존 JSON 전용 AI client와 분리해 multipart streaming/size 제한을 지원한다.
4. AI Server Bearer key는 Backend에서만 보관한다.
5. AI 응답을 OpenAPI 기반 DTO로 검증한다.
6. `413`, `415`, `422`, `502`, `503`을 사용자용 오류로 매핑한다.
7. 사용자별 rate limit과 idempotency key를 적용한다.
8. 분석 결과는 사용자가 확정하기 전 DB에 영구 저장하지 않는다.
9. `nutrition_complete=false` 결과를 확정 영양값으로 저장하지 않는다.
10. 일반 실제 식사 기록을 항상 `different_food`로 저장하지 않도록 식사 기록
    의미를 확정한다.

기존 `/api/diet/meal-logs/{meal_log_id}/photo`는 확정된 식사 사진 저장용이다.
분석 프록시로 재사용하지 않는다.

## Frontend 필수 작업

1. 사진 선택 직후 `recognition_failed`로 이동하는 임시 동작을 제거한다.
2. Backend 분석 endpoint를 호출한다.
3. `분석 중`, `completed`, `partial`, `unavailable`, `실패` 상태를 구분한다.
4. AI 응답 전용 임시 DTO에 다음 필드를 보존한다.
   - `name`
   - `amount_g`
   - `confidence`
   - `catalog_matched`
   - `matched_food_code`
   - `matched_food_name`
   - `calories_kcal`
   - `carbohydrate_g`
   - `protein_g`
   - `fat_g`
   - `warnings`
5. `amount_g=null`, 낮은 confidence, 미매칭 항목은 사용자 입력을 요구한다.
6. 사용자는 음식명과 g을 수정하고, 영양값은 직접 임의 수정하지 않는다.
7. 수정 후 Backend 재계산 endpoint를 호출한다.
8. `nutrition_complete=true`이고 사용자가 확인했을 때만 식사를 기록한다.
9. 기록 성공 후 기존 private photo endpoint에 원본 사진을 저장한다.
10. JPEG/PNG/WebP만 보내고 HEIC는 전송 전에 변환한다.

## 필드 매핑

| AI 응답 | Front 임시 모델 | Backend 실제 섭취 저장 |
|---|---|---|
| `name` | `name` | `food_name` |
| `amount_g` | `amount`, `unit="g"` | `quantity`, `unit="g"` |
| `calories_kcal` | `kcal` | `calories` |
| `carbohydrate_g` | `carbs` | `carbohydrates` |
| `protein_g` | `protein` | `protein` |
| `fat_g` | `fat` | `fat` |
| `matched_food_code` | 분석 임시 상태에 보존 | 재계산 요청에 재전송 |

AI는 인분 수를 반환하지 않는다. `amount_g`를 임의로 `1인분`이라고 표시하지
말고, 푸드샷 확인 화면은 g을 기준으로 표시한다. ml를 밀도 정보 없이 g으로
변환하지 않는다.

## E2E 확인 시나리오

1. JPEG 음식 사진 1장을 촬영한다.
2. 두 개 이상의 음식이 분리되는지 확인한다.
3. 한 항목의 g만 수정하고 같은 `matched_food_code`로 재계산한다.
4. 한 항목의 음식명을 바꾸고 새 공식 code로 재계산한다.
5. `nutrition_complete=true` 후 식사와 사진을 저장한다.
6. 새로고침 후 음식·탄단지·사진이 동일하게 보이는지 확인한다.
7. 손상 파일, HEIC, 대용량 사진, 음식이 아닌 사진의 오류 UI를 확인한다.
8. 공식 Food DB 또는 OpenAI 장애 시 수동 입력 fallback을 확인한다.

실제 OpenAI 사진 호출은 비용이 발생하므로 단위·계약 테스트 후 승인된 사진
1건으로 수행한다.
