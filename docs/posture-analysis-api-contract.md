# 자세 분석 앱 연동 계약

운영 API 기본 주소는 `https://211-233-206-193.sslip.io`입니다. 아래 모든 요청에는 로그인 사용자의 Supabase access token을 `Authorization: Bearer <token>`으로 보냅니다. 앱은 AI 서버나 비공개 영상 Storage에 직접 요청하지 않습니다. 다른 사용자의 작업은 `404`로 응답합니다.

## 1. 지원 운동 선택

`GET /api/posture/capabilities`는 현재 운영에서 검증된 운동만 반환합니다. 응답의 `schema_version`은 capabilities 형식 버전인 `"1.0"`이며, 분석 결과의 `"1.1"`과 구분합니다.

```json
{
  "schema_version": "1.0",
  "exercises": [
    {
      "exercise_code": "squat",
      "display_name_ko": "스쿼트",
      "camera_view": "side",
      "movement_type": "repetition",
      "analysis_side_required": false,
      "validation_status": "validated",
      "rule_version": "<server value>",
      "catalog_exercise_keys": ["ex_96dcb551b33a8e"],
      "capture_instructions": ["전신이 화면에 보이도록 측면에서 촬영하세요."],
      "limitations": ["관절이 가려지면 분석 정확도가 낮아질 수 있습니다."]
    }
  ]
}
```

위 객체는 필드 설명용 예시입니다. 앱은 운동 코드, 키, 규칙 버전을 고정하지 않고 매번 응답을 사용합니다. `exercises`가 빈 배열이면 자세 분석 시작을 제공하지 않습니다. 촬영 안내와 제한사항은 선택한 항목의 배열을 표시합니다.

## 2. 작업 생성

`POST /api/posture/jobs`에 JSON을 보냅니다.

```json
{
  "exercise_key": "ex_96dcb551b33a8e",
  "exercise_code": "squat",
  "camera_view": "side",
  "analysis_side": null
}
```

`exercise_key`는 선택한 capability의 `catalog_exercise_keys` 중 하나입니다. `exercise_code`와 `camera_view`도 같은 capability 값으로 보냅니다. `analysis_side_required=true`이면 `analysis_side`에 `"left"` 또는 `"right"`를 지정합니다. 서버는 이 조합을 재검증하며 불일치하면 `422`를 반환합니다.

성공 시 `201`과 `posture_analysis_job_id`, 선택한 운동 프로필, `status="awaiting_upload"`을 받습니다. 앱은 작업 ID를 저장합니다. 동일 프로필의 미업로드 작업을 다시 생성하면 기존 작업이 반환될 수 있습니다. 다른 활성 작업이 있으면 `409`입니다.

## 3. 영상 업로드와 상태

`POST /api/posture/jobs/{job_id}/video`는 `multipart/form-data`이고 파일 필드 이름은 **`video`**입니다. MP4, MOV, WebM, AVI만 허용하며 실제 영상 컨테이너와 `Content-Type`이 일치해야 합니다. 파일 크기는 **50,000,000 bytes 이하**, 영상 길이는 **1~30초**이고 video track이 있어야 합니다. HEIC 사진이나 원격 URL은 이 경로의 입력이 아닙니다.

업로드 요청은 서버 분석과 임시 영상 정리까지 기다리는 동기 요청입니다. 성공하면 `200`과 `posture_analysis_job_id`, `status="completed"`를 받습니다. 크기 초과는 `413`, 유효하지 않은 영상은 `422`, 중복 업로드나 종료된 작업은 `409`입니다. 앱은 업로드 중 진행 표시를 유지하고, 응답을 받기 전에 로컬에서 완료로 처리하지 않습니다.

`GET /api/posture/jobs/{job_id}`는 본인 작업의 `status`, `analysis_stage`, `progress_percent`, `failure_code`, `detected_repetitions`와 시각 정보를 반환합니다. 상태 흐름은 `awaiting_upload → processing → cleanup_pending → completed`이며 실패 시 `failed`입니다. 서버의 임시 Storage 경로는 응답에 노출되지 않습니다.

업로드 응답이 끊기거나 오류로 끝나면 **먼저 같은 작업 ID로 상태를 조회**합니다. `awaiting_upload`이면 같은 작업에 재업로드할 수 있고, `processing` 또는 `cleanup_pending`이면 완료·실패까지 상태를 조회합니다. `completed`이면 결과를 읽고, `failed`이면 새 작업을 생성합니다. `502`/`503` 뒤에 상태 확인 없이 같은 작업에 영상을 다시 보내면 `409`가 될 수 있습니다.

## 4. 결과 표시

`GET /api/posture/jobs/{job_id}/result`는 완료 전 `409`, 완료 후 `200`입니다. 결과에는 `job`, `assessment`, `repetitions`, `findings`, `routine_suggestions`가 있습니다.

| 필드 | 앱 처리 |
| --- | --- |
| `assessment.schema_version` | 현재 `"1.1"` |
| `assessment.overall_score`, `verdict`, `summary` | 결과 요약 표시. `verdict`는 `within_current_rules` 또는 `needs_correction` |
| `assessment.passing_score` | Schema 1.1에서는 `null`; 합격선이나 합격 여부를 계산하지 않음 |
| `repetitions[]` | 반복 번호, 구간 시각(ms), 점수, 관절 좌표와 각도를 표시할 때 사용 |
| `findings[]` | `display_order` 순서로 제목, 설명, 반복 범위, `guidance_steps` 표시 |
| `routine_suggestions` | 현재 빈 배열; 운동 추천 카드 생성에 사용하지 않음 |

작업 실패 시 `failure_code`를 확인해 새 작업 시작을 안내합니다. 인증 실패는 `401`, 본인 작업이 없으면 `404`입니다. AI 또는 서버 연결 문제는 `502`/`503`일 수 있으며, 위 상태 확인 절차로 복구합니다.

## 구현 순서

1. 로그인 후 capabilities를 읽고 지원 항목과 촬영 안내를 표시합니다.
2. 선택한 항목의 정확한 키·코드·뷰 조합으로 작업을 생성하고 ID를 보관합니다.
3. 영상 제한을 앱에서도 먼저 확인한 뒤 `video` 필드로 업로드합니다.
4. 완료 상태에서 결과를 조회합니다. 네트워크가 끊기면 작업 상태를 조회해 이어갑니다.

서버 담당자의 2026-11-10 보고에는 운영에서 스쿼트 측면 촬영 13초 영상의 생성·업로드·결과·임시 영상 정리 검증이 포함돼 있습니다. 앱의 실제 기기 촬영 영상으로도 연동 검증해야 합니다.
