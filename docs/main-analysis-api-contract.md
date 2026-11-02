# 종합 건강 분석 메인 API

`GET /api/health-assessments/latest`는 로그인한 사용자의 최신 평가에 저장된 개인화 분석을 우선 반환한다. 저장값이 없으면 평가 당시 목표와 확인된 팝업 판정으로 임시 문구를 구성한다. `Authorization: Bearer <Supabase access token>`이 필요하다. 최신 평가는 조회 시점 이전의 `assessed_at` 내림차순, 평가 ID 내림차순으로 고른다.

## 응답

```json
{
  "assessment_id": "20260916-0000-4000-8000-000000000006",
  "headline": {"title": "목표는 유지하고, 방향은 더 건강하게"},
  "summary": {"title": "지금은 근육을 지키며 감량해야 해요", "description": "평가 시 저장한 개인화 요약"},
  "goal": {"text": "결혼식 준비를 위한 단기간 체중 감량"},
  "strategy": {
    "title": "근육을 지키는 결혼식 맞춤 감량 전략",
    "tags": ["체지방 감량", "근육 유지", "식단·근력 병행"],
    "message": "빠른 감량보다 건강한 체성분 개선을 우선해요."
  },
  "key_metric_keys": ["body_fat_percentage", "skeletal_muscle_mass_kg", "fasting_glucose"],
  "recommendation_reasons": [{
    "title": "체중보다 체성분을 우선했어요",
    "description": "평가 시 저장한 추천 근거",
    "evidence_metric_keys": ["bmi", "weight_kg", "body_fat_mass_kg"]
  }],
  "final_direction": {"from": "단기간 체중 감량", "to": "근육 유지 기반 체지방 감량"},
  "diet_suggestion": {
    "title": "Auto-Fit 냉장고 맞춤 제안",
    "message": "유통기한이 가까운 두부부터 식사에 활용해 보세요.",
    "action_items": ["두부 활용하기", "브로콜리 활용하기"],
    "evidence_metric_keys": ["body_fat_percentage", "skeletal_muscle_mass_kg"],
    "used_inventory_item_ids": ["20260916-0000-4000-8000-000000000011"]
  },
  "refrigerator_context": {
    "captured_at": "2026-09-28T10:00:00+09:00",
    "available_count": 2,
    "expiring_soon_count": 1,
    "allergy_excluded_count": 0,
    "used_items": ["두부", "브로콜리"],
    "expiring_soon_items": ["두부"]
  }
}
```

위 문구와 수치는 **계약 형식을 설명하는 예시**다. 서버는 이 예시를 기본값으로 반환하지 않는다. 평가 생성 과정은 `health_assessments.raw_result.total_analysis`에 `assessment_id`를 제외한 위 구조를 저장할 수 있다. 저장값이 있으면 이를 검증하고 필요한 필드만 반환한다. 저장값이 없는 평가에는 아래의 제한된 임시 문구 생성 규칙을 적용한다.

백엔드 평가 작성기는 `backend.app.analysis_summary.attach_main_analysis(existing_raw_result, analysis)`를 호출해 분석 내용을 검증하고 기존 `popup_criteria` 등 다른 `raw_result` 필드를 보존한 뒤, **평가 저장과 같은 트랜잭션에서** 결과를 기록한다. 이 함수는 데이터베이스에 직접 쓰지 않으며, 생성 문구나 건강 판단을 만들어 내지 않는다.

`diet_suggestion`과 `refrigerator_context`는 선택 필드다. 평가 당시 `input_snapshot.diet_context`가 있으면 임시 분석도 냉장고 맞춤 제안을 생성한다. 과거 평가처럼 스냅샷이 없으면 두 필드는 `null`이며 현재 냉장고 데이터를 과거 평가에 조용히 섞지 않는다. `used_inventory_item_ids`는 실제 제안 문구에 사용한 평가 시점 재료만 포함한다.

## 통합 분석 입력과 냉장고 스냅샷

`GET /api/health-assessments/input`은 건강검진·체성분과 함께 `diet_context`를 반환한다. `diet_context`에는 조회 시각, 사용 가능한 냉장고 재료, 등록된 알레르기가 포함된다. 서버는 KST 조회일 기준 유통기한 경과, 수량 0, 사용 불가 재료를 제외하고 저장된 `freshness_status`를 신뢰하지 않고 다시 계산한다.

평가 생성기는 이 `diet_context`를 `health_assessments.input_snapshot.diet_context`에 같은 형태로 저장해야 한다. 그래야 이후 재료가 추가·삭제되더라도 과거 분석의 문구와 근거 재료를 재현할 수 있다. 분석 조회는 식단 추천을 자동 저장하지 않는다. 실제 식단 생성은 기존 `POST /api/diet/recommendations/generate`의 명시적 요청으로만 수행한다.

기존 평가에 현재 냉장고 맞춤 제안을 명시적으로 연결하려면 `POST /api/health-assessments/{assessment_id}/diet-personalization/refresh`를 호출한다. 요청 본문은 없으며 본인 평가만 갱신한다. 서버는 현재 재료·알레르기를 다시 조회하고, 건강 분석의 핵심 지표와 문구는 유지한 채 `diet_suggestion`, `refrigerator_context`만 다시 만든다. DB RPC가 `input_snapshot.diet_context`와 `raw_result.total_analysis`를 한 트랜잭션에서 병합하므로 다른 팝업 기준·모델 결과 필드는 보존된다.

성공 응답은 갱신된 `MainAnalysisResponse`다. 평가가 없으면 404, 연결할 종합 분석이 아직 없으면 409, 저장 또는 기존 결과 형식 오류는 502다. 이 호출은 실제 `diet_recommendations` 레코드를 생성하지 않는다.

## 저장값이 없을 때의 임시 문구

평가의 `input_snapshot.goal.text`가 있어야 한다. 선택 필드 `goal_type: "weight_loss"`, `short_term: true`와 체지방률 `high`, 골격근량 `low`, 공복혈당 `caution`이 함께 확인되면 [문구 협의안](main-analysis-frontend-alignment.md)의 A안을 반환한다. 나머지 목표와 판정 조합은 확인된 지표 이름·판정만 언급하는 일반 문구를 반환한다. 지표는 측정값, 평가 당시 `criteria_id`, `source_ids`, 확정 판정(`low`, `normal`, `caution`, `high`)이 모두 있어야 사용한다. 핵심 지표는 최대 3개를 백엔드가 선택한다. 목표 또는 사용 가능한 지표가 없으면 404다. 임시 문구는 조회 시 계산하며 DB에 저장하지 않는다. 기존 평가에 필요한 목표·판정 스냅샷이 없으면 404가 유지된다.

`key_metric_keys`는 표시 순서대로 최대 3개다. `recommendation_reasons`도 저장 순서대로 반환하며, 각 `evidence_metric_keys`는 팝업 지표와 연결된다. 지원 키는 `bmi`, `weight_kg`, `body_fat_mass_kg`, `body_fat_percentage`, `skeletal_muscle_mass_kg`, `fasting_glucose`, `systolic_bp`, `diastolic_bp`다. 그 밖의 지표를 사용하려면 [팝업 API](analysis-popup-api-contract.md)의 `metrics[]`도 먼저 확장해야 한다. 존재하지 않는 키나 필수 내용이 빠진 저장값은 형식 오류로 처리한다.

프론트는 메인 응답의 `assessment_id`로 `GET /api/health-assessments/{assessment_id}/popups`를 호출한다. 각 키를 `metrics[].key`에 매칭하고, `display_value`, `unit`, `status_label`, `ranges`, `source_ids`를 표시한다. 팝업에 해당 값이나 기준이 없는 경우 UI에서 측정값 없음 또는 판정 보류 상태를 표시한다. 프론트는 지표 순위, 판정 또는 추천 문구를 다시 계산하지 않는다.

화면별 표시 대상은 구분한다. **주요 지표 판정 기준** 목록에는 메인 응답의 `key_metric_keys[]`에 있는 지표만, 해당 배열 순서대로 표시한다. 이 목록이 3개라면 팝업에도 3개만 보인다. **추가 지표 보기** 팝업은 선택한 `recommendation_reasons[i].evidence_metric_keys[]`에 연결된 지표를 표시한다. `PopupResponse.metrics[]`는 두 화면에서 함께 쓰는 전체 지표 목록이므로 서버에서 핵심 3개로 잘라 반환하지 않는다.

## 실패 응답

| 상태 | 의미 |
|---|---|
| 401 | 인증 필요 |
| 404 | 평가가 없거나, 저장된 분석이 없고 임시 문구 생성에 필요한 목표·확정 판정도 없음 |
| 502 | 저장소 조회 실패 또는 저장된 분석 형식 오류 |

저장된 `total_analysis`가 잘못된 형식이면 임시 문구로 대체하지 않고 502를 반환한다. 임시 문구는 검증 가능한 데이터가 있을 때만 제공하며, 평가 생성 경로에서 결과를 저장하면 그 결과가 우선한다.
