# A안 건강 데이터 부분점수 연동 인계 (2026-11-18)

대상: 이승현(renewal-a 프론트엔드·서버 운영), 김현호(back-end·앱 빌드)

## 확정된 동작

- 앱은 AI `/health-analysis`를 직접 호출하지 않는다. 건강 문서 확정 후 백엔드가 AI에 필요한 정규화 수치만 보내고 평가를 저장한다.
- 건강검진과 인바디가 **모두** 확정되어야 현재 AI 계산식으로 건강 데이터 영역 점수를 계산한다. 첫 번째 문서만 확정한 경우 원본 파일과 OCR 원문은 삭제하고, 확인된 측정 수치와 날짜만 남긴다.
- 주간 식단·운동 입력이 부족하면 종합점수를 만들지 않는다. 건강 데이터 영역 점수만 계산 가능하면 별도로 반환한다.
- 기존 `/api/home`의 `health_score`, `/api/health/scores/history`는 `overall_score`가 있는 종합 평가만 사용한다. 부분점수를 종합점수나 티어 점수로 대체하지 않는다.

## 새 읽기 계약

`GET /api/health-assessments/score/latest`

- 기존 앱과 같은 Bearer 토큰 인증. 요청한 사용자 본인의 최신 평가만 반환한다. `Cache-Control: no-store`.
- 평가가 없으면 `404`, 인증이 없으면 `401`, 저장 자료 조회·형식 오류는 `502`.
- `score_status`는 `partial | available`; `health_data.status`는 `available | unavailable`.
- `partial`이면 `overall_score`는 항상 `null`이다. 건강 데이터 영역 점수는 `health_data.status=available`일 때에만 숫자다.

부분 평가 예시:

```json
{
  "assessment_id": "20260916-0000-4000-8000-000000000006",
  "assessed_at": "2026-11-18T07:00:00Z",
  "score_status": "partial",
  "overall_score": null,
  "health_data": {"status": "available", "score": 80.0}
}
```

종합 평가 예시:

```json
{
  "assessment_id": "20260916-0000-4000-8000-000000000007",
  "assessed_at": "2026-11-18T08:00:00Z",
  "score_status": "available",
  "overall_score": 75.5,
  "health_data": {"status": "available", "score": 80.0}
}
```

확정 응답 `POST /api/health-documents/{uploaded_file_id}/confirm`에는 `analysis_status`와 `assessment_id`가 추가되었다. `analysis_status`는 `saved | waiting_for_documents | unavailable | failed`다. `waiting_for_documents`는 두 문서가 아직 모두 없다는 뜻이며, `failed`여도 문서의 확정 수치는 저장되고 원본 삭제는 완료된 상태다. 이때 앱은 저장 실패로 오인해 파일을 다시 올리지 말고 분석 재시도를 안내해야 한다.

## A안 프론트엔드 연결 요청

확인한 원격 `renewal-a` 기준 커밋: `e914bd140ed3e4f370c6d3bb7979115682137e9f`.

1. `frontend/src/api/healthAnalysis.ts`에 새 응답 타입과 `getLatestHealthScore()`를 추가한다. `assessment_id`와 `assessed_at`은 문자열, 점수는 `number | null`이다.
2. `frontend/app/(health-data)/total-analysis.tsx`에서 기존 `getLatestHealthAnalysis()`와 함께 새 점수를 읽는다. `score_status=partial`이고 `health_data.status=available`이면 카드 이름을 **건강 데이터 점수**로 표시하고 `health_data.score / 100점`을 사용한다. 이 상태에서 종합점수 변화·티어 변화·종합 진행 바는 표시하지 않는다.
3. `score_status=available`일 때만 `overall_score`를 종합점수로 표시한다. `/api/home`에 점수가 없다는 이유로 `0점`을 만들지 않는다.
4. 새 점수 API가 `404`이면 아직 평가가 없는 상태로 처리한다. `health_data.status=unavailable`이면 점수 대신 측정 자료 확인 안내를 보여 준다. `latest` 분석이 `404`여도 부분점수가 있으면 부분점수와 분석 대기 안내를 함께 표시한다.
5. `frontend/src/api/healthDocuments.ts`의 확정 응답 타입에 `analysis_status`, `assessment_id`를 추가하고, 두 번째 문서 확정 후 점수 화면을 다시 읽는다.
6. `frontend/app/health-report.tsx`에도 건강 데이터 영역 점수를 놓을지는 이승현님이 화면 구성에 맞춰 결정해 달라. 놓는다면 같은 `partial` 분기를 사용하고 기존 `/api/home`의 종합점수와 구분한다.

## 배포·확인

이 계약은 `back-end` 로컬 커밋 `d5b96a9a`에 구현·시험되어 있으며 아직 원격/운영에 반영되지 않았다. DB 마이그레이션 `20261118035110_exercise_body_regions.sql`, `20261118060000_health_assessment_generation.sql` 적용, 백엔드 배포, 프론트엔드 연동·TestFlight 빌드 순으로 진행한다. 운영 DB 적용과 과거 확정 문서 원본 삭제는 별도 승인·운영 절차가 필요하다.

확인 사례: 한 종류만 확정 → 점수 없음; 두 종류 확정·주간 목표 없음 → 건강 데이터 점수만; 목표·기록 준비 → 종합점수 생성; 기존 종합점수 이력·홈에 부분점수 혼입 없음; 분석 실패 후 문서 재확인으로 재시도.
