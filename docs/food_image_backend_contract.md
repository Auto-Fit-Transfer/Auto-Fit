# Auto-Fit 음식 사진 분석 계약 초안

이 문서는 Backend API가 확정되기 전 AI Server 내부에서 검증하는 임시 계약이다.
Backend 담당자와 협의 후 endpoint 이름, 파일 field 이름, 공통 응답 wrapper는 변경할 수 있다.
음식 인식과 공식 영양 계산 Service는 Router 계약과 분리되어 있으므로 이 변경의 영향을 받지 않는다.

## 책임 분리

- Frontend: 스마트폰 카메라 촬영, 분석 결과 표시, 음식명·중량 수정, 저장 여부 확인
- Backend: 사용자 인증, AI Server 인증, 이미지 전달, 사용자가 확정한 결과 저장
- AI Server: 이미지 검증, 음식 후보 인식, 공식 Food DB 매칭, 중량별 영양 계산
- OCR: Backend 범위이며 이 AI Server endpoint에서는 수행하지 않음

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

기본 이미지 최대 크기는 10MB이며 환경설정으로 변경할 수 있다. HEIC 이미지는 Frontend 또는 Backend에서 JPEG, PNG, WEBP 중 하나로 변환해야 한다.

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

`total_nutrition`은 공식 DB 매칭과 중량 계산이 완료된 항목의 합이다. `nutrition_complete=false`이면 일부 항목이 합계에서 제외되었으므로 최종 기록값으로 바로 저장하면 안 된다.

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
      "amount_g": 200.0
    },
    {
      "name": "미역국",
      "amount_g": 180.0
    }
  ]
}
```

응답은 최초 분석과 동일한 `FoodAnalysisResponse`다. 다만 `recognition_source`는 `user_input`, 각 항목의 `amount_estimated`는 `false`, `confidence`는 `null`이다.

## Backend 협의 후 확인할 값

- Backend 외부 endpoint와 AI Server 내부 endpoint 매핑
- multipart 파일 field 이름이 `image`인지 여부
- Backend 공통 성공·오류 wrapper
- 요청 추적 ID를 Header 또는 Form field 중 어디에 둘지
- 이미지 최대 크기와 Backend timeout
- Backend에서 허용할 스마트폰 이미지 형식과 변환 위치
- 분석 결과 임시 보관 기간
- 사용자 수정 결과의 최종 저장 DTO

위 항목은 Router와 문서 계약에서 조정하며 이미지 분석 및 공식 Food DB 계산 로직에는 사용자 저장 책임을 추가하지 않는다.
