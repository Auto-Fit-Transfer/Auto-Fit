# 건강 문서 업로드·OCR·확정 API

Bearer 인증이 필요합니다. 각 파일은 `POST /api/health-documents`를 한 번 호출합니다. 요청은 multipart/form-data이며 `file`은 필수이며 원본 표시명을 `original_file_name`으로 별도 전달할 수 있습니다. 예: `original_file_name=건강검진결과_2026.pdf` (Expo `DocumentPickerAsset.name`). 선택 필드이며 최대 255자, 경로/NUL 제거와 앞뒤 공백 정리 후 DB `upload_files.original_file_name`과 `file_name`에 영구 저장합니다. 생략/공백이면 multipart 파일명을 사용합니다. Storage 경로는 기존 UUID를 유지합니다. `document_type`은 선택 입력이며 기존 클라이언트 호환용입니다. 생략하면 실제 OCR 연결 시 서버가 파일 내용으로 `health_checkup` 또는 `body_composition`을 판별하며, 임시 모드는 아래 샘플 정책을 사용합니다. 빈 문자열 대신 필드 자체를 생략하세요. PDF/PNG/JPEG(JPG)/HEIC, 최대 10 MiB(10,485,760 bytes)를 지원하며 확장자 대신 파일 시그니처로 검사합니다.

## 업로드와 조회

실제 OCR 연결 후 종류 생략 시 서버가 동기 판별·추출을 먼저 수행하고 판별된 종류로 파일과 OCR 결과를 저장합니다. 판별 불가 시 저장하지 않고 422 오류를 반환합니다. OCR URL이 없는 임시 모드에서는 실제 종류 판별을 수행하지 않습니다. 지원하는 PDF/PNG/JPEG/HEIC 파일이면 내용과 무관하게 고정 샘플을 `ocr_status=completed`, `status=awaiting_review`, `error=null`로 반환합니다. 종류 생략 시 기본 `health_checkup` 샘플을 사용합니다. 서버 환경 변수 `HEALTH_DOCUMENT_OCR_MOCK_DOCUMENT_TYPE=body_composition`으로 체성분 샘플을 테스트할 수 있으며 프론트는 계속 파일만 전송합니다. 기존 명시적 `document_type` 지정은 해당 종류 샘플을 반환합니다. 임시 응답의 document_type은 판별 결과가 아니라 샘플 종류입니다. 샘플은 파일 내용과 무관하며 건강검진 날짜·혈압·혈액검사 값과 체성분 측정 시각·근육량·체지방 값이 포함됩니다. 따라서 실제 OCR 서버 없이 POST → GET → PATCH → confirm을 호출할 수 있습니다. confirm은 수정한 샘플도 실제 DB에 저장합니다. 업로드 성공은 201, 조회 성공은 200입니다. POST와 GET 및 PATCH는 동일한 문서별 응답 스키마를 사용합니다. `document_type`을 discriminator로 타입을 구분합니다.

```json
{
  "uploaded_file_id": "20260916-0000-4000-8000-000000000002",
  "document_type": "health_checkup",
  "file_name": "checkup.pdf",
  "original_file_name": "checkup.pdf",
  "uploaded_at": "2026-09-17T00:00:00Z",
  "ocr_status": "completed",
  "status": "awaiting_review",
  "extracted_data": {
    "checkup_date": "2026-09-17",
    "height_cm": "175",
    "weight_kg": "70",
    "bmi": "22.9",
    "systolic_bp": 120,
    "diastolic_bp": 80
  },
  "error": null
}
```

예시는 핵심 필드만 표시했습니다. 전체 응답은 나머지 추출 필드도 null로 포함하고, 기존 클라이언트 호환용 `file`, `ocr_result`도 포함합니다. Decimal 측정값은 응답에서 **문자열 또는 null**입니다. 프론트에서 숫자 표시/계산 시 변환하세요. 정수 혈압은 number, 날짜/시각과 텍스트는 string입니다. PATCH는 Decimal에 숫자 또는 숫자 문자열을 허용합니다.

`ocr_status`: `pending`, `processing`, `completed`, `failed`. 현재 POST는 동기 처리하므로 완료 또는 실패를 반환합니다. `status`는 문서 검토 단계인 `awaiting_review`, `confirmed`, `failed`입니다. OCR 실패에도 파일 저장이 성공하면 201과 파일 ID를 반환하며 `error.code`를 확인해야 합니다. 빈 결과를 완료로 취급하지 않습니다.

## DB 필드와 단위

공통 필드: `height_cm`(cm), `weight_kg`(kg), `bmi`(kg/m²).

| 건강검진 필드 | 타입 / 단위 |
| --- | --- |
| checkup_date | date, YYYY-MM-DD; 확정 필수 |
| systolic_bp, diastolic_bp | integer, mmHg; 혈압은 두 필드로 구분 |
| fasting_glucose, total_cholesterol, hdl_cholesterol, ldl_cholesterol, triglycerides | Decimal, mg/dL |
| ast, alt, gamma_gtp | Decimal, U/L |
| hemoglobin | Decimal, g/dL |
| creatinine | Decimal, mg/dL |
| institution_name, checkup_type | string |

| 체성분 필드 | 타입 / 단위 |
| --- | --- |
| measured_at | datetime, ISO 8601; 시간대 포함 권장; 확정 필수 |
| skeletal_muscle_mass_kg, body_fat_mass_kg | Decimal, kg |
| body_fat_percentage, body_water_percentage, protein_percentage | Decimal, % |
| basal_metabolic_rate | Decimal, kcal/day |
| visceral_fat_level | Decimal, level |
| body_water_liters | Decimal, L |
| device_name | string |

모든 추출 필드는 nullable입니다. 정확한 허용 범위와 문자열 길이는 OpenAPI에 정의되어 있습니다. `exam_date`, `height`, `weight`, `blood_pressure` 같은 별칭은 허용하지 않습니다.

## 수정

`PATCH /api/health-documents/{uploaded_file_id}/ocr-result`

```json
{"extracted_data": {"weight_kg": "69.5", "total_cholesterol": null}}
```

보낸 항목만 변경하고 생략한 항목은 유지합니다. null은 값을 비웁니다. 저장된 문서 종류에 해당하는 필드만 허용하며 알 수 없는 필드/타입/범위는 422입니다. 성공 시 전체 최종 `extracted_data`를 반환합니다. 확정 후 수정은 409 `DOCUMENT_CONFIRMED`입니다. pending/processing 상태는 수정할 수 없습니다. failed 상태에서는 직접 수정할 수 있고, 성공하면 completed로 바꾸고 오류를 지웁니다.

## 재업로드와 여러 파일

재업로드는 새 POST로 **새 uploaded_file_id**를 발급합니다. 기존 문서를 교체하거나 삭제하지 않습니다. 이전 미확정 문서는 검토 대기/실패 상태로 남고, 프론트 검토 큐에서 제외하세요. confirm 전에는 분석용 건강검진/체성분 테이블에 저장되지 않습니다. 이미 확정한 기존 문서의 분석 데이터는 새 업로드로 무효화되지 않습니다.

2개 파일은 POST 2회 → ID 2개 → 검토 1/2, 2/2 → 각각 confirm으로 처리합니다. 순서는 프론트가 관리하고 파일별 실패·재시도도 독립적으로 처리합니다. 여러 파일의 확정은 하나의 일괄 트랜잭션이 아닙니다.

## 확정

`POST /api/health-documents/{uploaded_file_id}/confirm` (요청 body 없음)

completed OCR 결과의 날짜를 검증하고 `health_checkups` 또는 `body_compositions`에 저장합니다. 성공 200:

```json
{
  "uploaded_file_id": "20260916-0000-4000-8000-000000000002",
  "document_type": "health_checkup",
  "status": "confirmed",
  "health_checkup_id": "20260916-0000-4000-8000-000000000003",
  "body_composition_id": null,
  "already_confirmed": false
}
```

체성분은 반대로 `body_composition_id`를 반환합니다. 응답에는 호환용 `file`, `health_data`도 포함합니다. 순차 재호출은 기존 ID와 `already_confirmed: true`를 반환합니다. 프론트는 동일 문서에 대한 수정/확정을 동시에 호출하지 않고 확정 버튼의 중복 클릭을 방지해야 합니다. 현재 DB 저장과 업로드 상태 변경은 별도 요청이므로 서버 간 동시 요청의 원자성은 보장하지 않습니다.

## 오류

HTTP 오류는 아래 형태입니다. 입력값이나 OCR 원문을 오류에 포함하지 않습니다.

```json
{"detail": {"code": "VALIDATION_ERROR", "message": "입력값을 확인해 주세요.", "fields": ["body.extracted_data.weight_kg"]}}
```

| HTTP | code | 상황 |
| --- | --- | --- |
| 401 | AUTH_REQUIRED | 인증 실패/만료 |
| 404 | DOCUMENT_NOT_FOUND | 파일 ID 없음 또는 다른 사용자 소유 |
| 409 | DOCUMENT_CONFIRMED | 확정 문서 수정 |
| 409 | OCR_NOT_READY | OCR 처리 중 수정/확정, 실패 결과 확정 |
| 413 | FILE_TOO_LARGE | 파일 10 MiB 초과 |
| 415 | UNSUPPORTED_FILE_TYPE | 지원하지 않는 파일 시그니처 |
| 422 | VALIDATION_ERROR | 문서 종류/필드/범위/확정 날짜 검증 실패 |
| 422 | UNKNOWN_DOCUMENT / UNSUPPORTED_DOCUMENT | 실제 OCR 연결 시 종류 판별 불가 또는 지원하지 않는 문서; 저장하지 않음 |
| 502 | OCR_FAILED / OCR_INVALID_RESPONSE / OCR_NOT_CONFIGURED / OCR_AUTH_FAILED / OCR_TIMEOUT / OCR_ENGINE_ERROR | 자동 판별 서버 실패/잘못된 응답/설정 없음; 저장하지 않음 |
| 502 | DATA_SOURCE_ERROR | 저장소/DB 응답 실패 |

문서 종류가 결정된 이후 추출 오류는 저장된 문서를 조회할 수 있도록 HTTP 201/200 응답의 `ocr_status=failed`, `error`로 전달합니다. 코드: `OCR_NOT_CONFIGURED`(처리 서버 설정 없음 및 샘플 모드 비활성), `OCR_FAILED`(처리 서버 실패/타임아웃), `DOCUMENT_TYPE_MISMATCH`(종류 불일치), `EXTRACTION_FAILED`(추출 데이터 없음 또는 스키마 검증 실패).

## 삭제

`DELETE /api/health-documents/{uploaded_file_id}` (요청 body 없음)

로그인 사용자가 소유한 confirmed 상태의 건강검진·체성분 문서를 영구 삭제합니다. 원본 Storage 객체와 OCR 결과뿐 아니라 confirm 시 생성된 `health_checkups` 또는 `body_compositions` 레코드도 함께 삭제합니다. 해당 건강 데이터를 참조해 생성된 종합 분석과 그 하위 데이터도 참조 무결성을 위해 함께 삭제됩니다. 성공 후 프론트는 `GET /api/health-documents?status=confirmed`를 다시 호출해 목록과 개수를 갱신하면 됩니다.

성공은 HTTP 200입니다.

```json
{
  "uploaded_file_id": "20260916-0000-4000-8000-000000000002",
  "document_type": "health_checkup",
  "status": "deleted",
  "health_checkup_id": "20260916-0000-4000-8000-000000000003",
  "body_composition_id": null
}
```

체성분 문서는 `body_composition_id`가 채워지고 `health_checkup_id`는 null입니다. 존재하지 않거나 다른 사용자 소유인 ID는 HTTP 404 `DOCUMENT_NOT_FOUND`, confirmed 상태가 아니면 HTTP 409 `DOCUMENT_NOT_CONFIRMED`, Storage 또는 DB 삭제 실패는 HTTP 502 `DATA_SOURCE_ERROR`입니다. 실패 응답은 공통 오류 형식입니다.

```json
{"detail":{"code":"DOCUMENT_NOT_FOUND","message":"Health document was not found","fields":null}}
```

## 서버 OCR 연결 설정

`HEALTH_DOCUMENT_OCR_URL`은 신뢰할 수 있는 내부 OCR 어댑터의 URL입니다. 선택 설정 `HEALTH_DOCUMENT_OCR_TOKEN`은 이 서버에만 Bearer 토큰으로 전달합니다. Supabase 키나 사용자 인증 토큰은 전달하지 않습니다. 서버는 원본 파일을 multipart로 전송하며 최대 60초 대기합니다. 자동 판별 요청에는 document_type을 보내지 않고 판별·추출을 한 번에 요청합니다. 기존 명시적 지정 요청에만 document_type을 전달합니다. unknown/unsupported 문서는 어댑터가 422를 반환하거나 document_type=unknown/unsupported를 반환해야 합니다. 별도 판별 실패 시 클라이언트에 422를 반환하며 임의 종류로 대체하지 않습니다. 어댑터는 다음 JSON을 반환해야 합니다.

```json
{"document_type": "health_checkup", "extracted_data": {"checkup_date": "2026-09-17", "weight_kg": "70"}}
```

`HEALTH_DOCUMENT_OCR_MOCK_ENABLED`는 기본 `true`입니다. URL이 없을 때만 샘플을 사용하며, `false`로 설정하면 기존처럼 `OCR_NOT_CONFIGURED`를 반환합니다. 실제 URL이 설정되어 있으면 샘플 설정과 무관하게 실제 OCR을 호출하고, 실제 호출 실패를 샘플로 대체하지 않습니다.

현재 고정 OCR 주소는 `https://211-233-193-159.sslip.io/ai/ocr`입니다. 필요한 토큰은 `HEALTH_DOCUMENT_OCR_TOKEN`에만 설정합니다. 실제 서버 응답은 내부 OCR 어댑터에서 DB 필드명으로 변환하므로 프론트의 기존 경로와 측정값 응답 스키마는 유지합니다. 2026-09-23 기준 `/health`에서 `clova-general` 엔진의 정상 상태를 확인했습니다.

OCR 엔진 자체는 저장소에 포함되지 않습니다. 샘플 데이터는 실제 파일 판독 결과가 아닙니다. 로컬·배포 설정은 고정 OCR 주소와 `HEALTH_DOCUMENT_OCR_MOCK_ENABLED=false`를 사용하며, 배포 환경에는 별도로 Bearer 토큰을 등록해야 합니다. URL을 비운 개발 환경에서만 명시적으로 활성화한 임시 샘플 정책을 사용할 수 있습니다. [배포·검증 결과](health-documents-deployment-results.md)를 참고하세요.

## 과거 문서 목록

`GET /api/health-documents?limit=20&offset=0` — Bearer 인증 필수. 로그인 사용자의 건강검진·체성분 문서만 조회합니다. 미확정/실패 문서도 포함하며 최신 업로드 순입니다. 동일 시각이면 파일 ID 내림차순입니다. limit은 1~100(기본 20), offset은 0 이상(기본 0)입니다.

```json
{"items":[{"uploaded_file_id":"20260916-0000-4000-8000-000000000002","original_file_name":"건강검진결과_2026.pdf","file_name":"건강검진결과_2026.pdf","document_type":"health_checkup","uploaded_at":"2026-09-17T00:00:00Z","status":"confirmed"}],"limit":20,"offset":0,"has_more":false}
```

POST·개별 GET·PATCH 응답의 최상위 `original_file_name`을 표시하면 됩니다. 목록도 같은 원본명을 반환합니다. 기존 DB 문서에 원본명이 없으면 file_name을 반환합니다. 과거에 UUID만 저장된 문서의 실제 원본명은 복원할 수 없습니다. 목록 조회 시 OCR 추출 데이터나 Storage 경로는 반환하지 않습니다.

원본 파일명·목록 API는 공유 개발 서버에 배포되었으며 POST·GET·목록·DB 보존을 실제 서버에서 검증했습니다. [배포·검증 결과](health-documents-deployment-results.md)를 참고하세요.

## 로그인 초기 화면 분기 (개발 서버 배포 완료)

목록 items의 status는 awaiting_review | confirmed | failed이며 단건 조회와 같은 기준입니다. processing_status=manually_confirmed는 confirmed, 그 외 OCR 실패는 failed, 나머지는 awaiting_review입니다. OCR 결과가 없거나 처리 중인 문서도 awaiting_review입니다. 서버는 페이지 내 소유 문서의 OCR 상태를 일괄 조회하므로 프론트 단건 추가 요청은 필요하지 않습니다.

목록은 페이지 단위이므로 첫 페이지에 confirmed가 없다고 전체 문서가 없다고 판단하지 마세요. 로그인 분기는 `GET /api/health-documents?status=confirmed&limit=1`로 조회하여 items가 하나 이상이면 Home, 빈 배열이면 업로드 화면으로 이동합니다. status 필터는 현재 confirmed만 지원하며, 생략하면 전체 상태를 반환합니다. 인증/서버 오류는 문서 없음으로 처리하지 마세요.


## 실제 OCR 응답 연동 (2026-09-18)

기존 경로와 측정값 응답 타입은 유지합니다. OCR 전용 필드명은 백엔드에서 변환합니다.

| OCR | 백엔드 |
|---|---|
| serum_creatinine | creatinine |
| checkup_center | institution_name |
| body_fat_pct | body_fat_percentage |
| skeletal_muscle_kg | skeletal_muscle_mass_kg |
| basal_metabolic_rate_kcal | basal_metabolic_rate |
| total_body_water_l | body_water_liters |
| measured_date | measured_at |

`measured_date`는 날짜만 제공됩니다. 한국 시간 자정(`YYYY-MM-DDT00:00:00+09:00`)으로 변환하고 `ocr_review.measurement_time_assumed=true`를 반환합니다. 실제 측정 시각을 의미하지 않습니다. 사용자가 measured_at을 수정하면 표시를 false로 바꿉니다.

기존 스키마에서 지원하지 않는 성별·나이·eGFR·종합점수·부위별 근육 등 알려진 추가 항목은 저장하거나 노출하지 않습니다. protein_kg를 protein_percentage로 변환하지 않습니다. 계약에 없는 필드나 상충하는 별칭은 추출 실패입니다. 서비스 용량 제한은 10 MiB이며 OCR 서버의 20MB 제한으로 확대하지 않습니다.

POST·GET·PATCH에 선택 응답 `ocr_review`를 추가합니다. 임시 샘플 또는 이전 문서는 null입니다.

- field_confidence: 기존 백엔드 필드명으로 변환한 OCR 신뢰도(0~1).
- review_required: OCR 검수 필요 항목과 누락 항목. 수정한 필드는 목록과 OCR 신뢰도에서 제거합니다.
- pages_total / pages_read / pages_used / warnings: PDF 일부 페이지 처리 등 검수 안내.
- measurement_time_assumed: 날짜만으로 시각을 채웠는지 여부.

백엔드는 OCR 신뢰도 외에 값 사이의 관계도 교차검증합니다. 신장·체중과 BMI가 크게 다르거나, 체중·체지방량과 체지방률이 맞지 않거나, 골격근량이 체중보다 크면 해당 필드를 `review_required`에 추가하고 `warnings`에 원인을 기록합니다. 건강검진일을 읽지 못한 문서는 빈 양식이나 기준표 오인을 막기 위해 채워진 추출값 전체를 검수 대상으로 표시합니다.

값이 채워진 `review_required` 필드가 남아 있으면 confirm은 `409 OCR_REVIEW_REQUIRED`와 `fields` 목록을 반환합니다. 사용자가 해당 값을 확인해 `PATCH /ocr-result`로 다시 보내면 검수 목록에서 제거됩니다. 값이 없는 선택 필드는 확정을 차단하지 않습니다.

검수 정보는 기존 OCR JSONB의 내부 `_ocr_review` 키에 저장하고 조회 때 분리합니다. 측정값 스키마와 확정 건강 데이터에는 이 키를 넣지 않습니다. DB 마이그레이션은 필요하지 않습니다. 프론트는 검수 정보를 표시하도록 별도 반영해야 합니다. 사용자 confirm 전 분석용 건강 데이터에 저장하지 않는 흐름은 유지합니다.

자동 판별 호출 실패 시 error.code를 구분합니다. UNSUPPORTED_DOCUMENT / DOCUMENT_TYPE_MISMATCH / NO_FIELDS_FOUND / CORRUPTED_FILE / EMPTY_FILE은 422, UNSUPPORTED_FILE_TYPE은 415, FILE_TOO_LARGE는 413입니다. OCR 인증 실패는 사용자 로그인 실패와 구분해 502 OCR_AUTH_FAILED로 반환합니다. OCR_TIMEOUT / OCR_ENGINE_ERROR는 502입니다. 자동 판별에 실패하면 파일과 DB에 저장하지 않습니다. 종류 명시 후 실패하면 기존 계약대로 파일 ID와 ocr_status=failed, error를 반환합니다. upstream 오류 메시지 원문은 전달하지 않습니다.

실제 호출 URL은 `/ai/ocr`를 포함한 전체 주소를 HEALTH_DOCUMENT_OCR_URL에 설정해야 합니다. 토큰은 HEALTH_DOCUMENT_OCR_TOKEN에만 설정하고 코드·문서·로그에 기록하지 않습니다. 환경변수 값 전체를 감싼 작은따옴표·큰따옴표는 전송 전에 제거하지만, Render 등 배포 환경에는 따옴표 없이 입력하는 것을 권장합니다. 실제 연결 시 HEALTH_DOCUMENT_OCR_MOCK_ENABLED=false를 권장합니다. 대기 설정은 기존 60초를 유지합니다.

전달 자료에 따르면 이미지 판독을 위해 CLOVA OCR로 원본이 전송됩니다. 서비스의 외부 전송 안내에 반영해야 합니다. 정확도 수치는 AI 담당자 제공 자료이며 실제 촬영본 검증은 아직 완료되지 않았습니다.

2026-09-23 실제 인바디 1쪽 PDF와 건강검진 4쪽 PDF로 업로드·조회·수정·확정·DB 저장·정리를 검증했습니다. 인바디 그래프 눈금과 빈 건강검진 양식의 정상범위를 값으로 오인하는 사례가 확인되어 위 교차검증과 확정 차단을 추가했습니다. OCR 서버 파서 개선과 실제 건강검진 측정값이 채워진 결과지 재검증은 별도 작업으로 남아 있습니다. 확정 저장과 문서 상태 갱신의 원자성 및 동시 요청 보완도 별도 DB 작업입니다.
