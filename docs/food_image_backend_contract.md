# Auto-Fit 푸드샷 AI 분석 계약 v1

이 문서는 AI Server 내부 API의 확정 계약이다. Frontend는 이 API를 직접
호출하지 않고 Backend 인증 프록시를 통해 사용한다. Backend 외부 endpoint와
공통 wrapper는 Backend 계약에서 별도로 정한다.

## 책임 분리

- Frontend: 스마트폰 카메라 촬영, 분석 결과 표시, 음식명·중량 수정, 저장 여부 확인
- Backend: 사용자 인증, AI Server 인증, 이미지 전달, 사용자가 확정한 결과 저장
- AI Server: 이미지 검증·개인정보 메타데이터 제거, 음식 후보 인식,
  공식 Food DB 매칭, 중량별 영양 계산
- OCR: 건강검진·인바디 문서 전용이며 푸드샷에는 사용하지 않음

AI Server는 업로드 이미지를 파일이나 DB에 영구 저장하지 않는다.

## 공통 인증

```http
Authorization: Bearer <AI_SERVER_API_KEY>
```

API Key는 Frontend에 전달하지 않는다.

## 1. 최초 이미지 분석

```http
POST /food-analysis/analyze
Content-Type: multipart/form-data
```

| field | 형식 | 필수 | 설명 |
|---|---|---:|---|
| `image` | binary | 예 | JPEG, PNG 또는 WEBP 음식 이미지 |

기본 이미지 최대 크기는 10MB, 최대 픽셀 수는 2천만 픽셀이다. 실제 이미지
decode에 성공해야 하며, EXIF orientation을 적용한 뒤 GPS·촬영기기 등 EXIF를
제거하고 최대 변 1,600px JPEG로 재인코딩한 데이터만 OpenAI에 전달한다.
HEIC 이미지는 Frontend 또는 Backend에서 JPEG, PNG, WEBP 중 하나로 변환해야 한다.

응답의 음식명, `amount_g`, `confidence`는 사진 기반 추정값이다. 칼로리와 탄수화물·단백질·지방은 OpenAI가 생성하지 않고 공식 Food DB에 매칭된 항목만 계산한다.

```json
{
  "ok": true,
  "generator": "auto-fit-ai",
  "status": "completed",
  "recognition_source": "openai_vision",
  "nutrition_source": "official_food_catalog",
  "items": [
    {
      "name": "김치볶음밥",
      "amount_g": 250.0,
      "amount_estimated": true,
      "confidence": 0.92,
      "alternative_names": ["볶음밥"],
      "catalog_matched": true,
      "matched_food_code": "[공식 DB 코드]",
      "matched_food_name": "김치볶음밥",
      "match_score": 1.0,
      "calories_kcal": 400.0,
      "carbohydrate_g": 62.5,
      "protein_g": 12.5,
      "fat_g": 10.0,
      "nutrition_source": "대한민국 전국통합식품영양성분정보",
      "requires_user_confirmation": true,
      "warnings": [
        "사진 기반 음식명과 중량은 추정값이므로 저장 전에 확인해야 합니다."
      ]
    }
  ],
  "total_nutrition": {
    "calories_kcal": 400.0,
    "carbohydrate_g": 62.5,
    "protein_g": 12.5,
    "fat_g": 10.0
  },
  "nutrition_complete": true,
  "requires_user_confirmation": true,
  "message": "음식 인식과 공식 Food DB 영양 계산이 완료되었습니다."
}
```

`status` 의미:

- `completed`: 모든 음식에 공식 DB 영양정보와 중량이 있음
- `partial`: 일부 음식이 매칭되지 않았거나 중량을 확정하지 못함
- `unavailable`: 사진에서 음식을 찾지 못함

`total_nutrition`은 공식 DB 매칭과 중량 계산이 완료된 항목의 합이다.
`nutrition_complete=false`이면 일부 항목이 합계에서 제외되었거나 인식 신뢰도가
낮으므로 최종 기록값으로 바로 저장하면 안 된다.

사진 분석 결과는 낮은 신뢰도, 숨은 재료, 알레르기 성분을 확정할 수 없다.
따라서 `requires_user_confirmation`은 항상 `true`이며 Frontend는 확인 단계 없이
분석 결과를 저장하면 안 된다.

## 2. 사용자 수정 후 영양 재계산

사용자가 음식명 또는 중량을 수정한 경우 이미지를 다시 보내지 않는다.

```http
POST /food-analysis/recalculate
Content-Type: application/json
```

```json
{
  "items": [
    {
      "name": "김치볶음밥",
      "amount_g": 200.0,
      "matched_food_code": "[최초 분석에서 확정한 공식 DB 코드]"
    },
    {
      "name": "미역국",
      "amount_g": 180.0
    }
  ]
}
```

응답은 최초 분석과 동일한 `FoodAnalysisResponse`다. 다만 `recognition_source`는
`user_input`, 각 항목의 `amount_estimated`는 `false`, `confidence`는 `null`이다.

`matched_food_code`는 선택값이지만, 최초 분석 결과를 그대로 확정하거나 중량만
수정할 때 반드시 되돌려 보내는 것을 권장한다. 코드가 있으면 정확한 code lookup만
수행하며 존재하지 않는 코드를 다른 이름으로 조용히 대체하지 않는다. 사용자가
음식명 자체를 변경했다면 기존 코드를 제거하고 Backend의 공식 음식 검색에서 새
항목을 선택한 뒤 그 code를 보낸다.

## 오류 계약

| HTTP | 의미 | Backend 처리 권장 |
|---:|---|---|
| `401` | 서버 간 Bearer 인증 실패 | Frontend에 세부정보를 숨기고 설정 점검 |
| `413` | 파일 용량 또는 픽셀 수 초과 | 사진 축소·재촬영 안내 |
| `415` | 형식 불일치, 미지원 또는 애니메이션 이미지 | JPEG/PNG/WebP 변환 안내 |
| `422` | 빈 파일, 손상 파일 또는 JSON 검증 실패 | 입력 수정 안내 |
| `502` | OpenAI Vision timeout/실패/미파싱 | 직접 입력 fallback 제공 |
| `503` | 공식 Food DB 장애 또는 동시 분석 한도 초과 | 헤더가 있으면 `Retry-After`에 따라 재시도, 확정 영양 저장 금지 |

사진에서 음식이 보이지 않는 경우는 장애가 아니므로 HTTP 200과
`status="unavailable"`을 반환한다. 공식 DB 장애는 정상 미매칭인 `partial`로
숨기지 않고 503으로 구분한다.

## 권장 E2E 순서

1. Frontend가 사진을 촬영하거나 선택한다.
2. Backend 분석 프록시가 `file`을 받아 AI의 `image` field로 전달한다.
3. AI 임시 결과를 Frontend가 표시한다.
4. 사용자가 음식 추가·삭제, 이름, g을 확인한다.
5. 이름·중량이 바뀌면 Backend를 통해 `/food-analysis/recalculate`를 호출한다.
6. `nutrition_complete=true`인지 확인한 후에만 실제 섭취 기록을 저장한다.
7. 식사 기록 ID가 생성된 뒤 원본 사진을 기존 private storage endpoint에 저장한다.

분석 전 원본 사진과 임시 결과는 AI Server가 저장하지 않는다. Backend는 사용자별
rate limit과 idempotency를 적용하고 AI Server API Key를 Frontend에 노출하지 않는다.

## Backend·Frontend 구현 시 확정할 값

- Backend 외부 endpoint와 AI Server 내부 endpoint 매핑
- Backend 공개 multipart field(`file` 권장)와 AI 내부 field `image`의 변환
- Backend 공통 성공·오류 wrapper
- 요청 추적 ID를 Header 또는 Form field 중 어디에 둘지
- 이미지 최대 크기와 Backend timeout
- Backend에서 허용할 스마트폰 이미지 형식과 변환 위치
- 분석 결과를 Backend에 임시 보관할지 여부와 보관 기간
- 일반 식사 기록과 추천 식단 변경 기록을 구분하는 최종 저장 DTO
- 사용자별 rate limit, idempotency key와 사진 교체 정책

위 항목은 Backend/Frontend 계약에서 조정하며 이미지 분석 및 공식 Food DB 계산
로직에는 사용자 저장 책임을 추가하지 않는다.
