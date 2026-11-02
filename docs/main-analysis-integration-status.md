# 종합 건강 분석 연동 상태

확인일: 2026-09-28. 이 문서는 구현과 검증 상태를 기록한다. API 형식은 [메인 분석 계약](main-analysis-api-contract.md)을 따른다.
[프론트엔드 문구·화면 협의안](main-analysis-frontend-alignment.md)에 화면 매핑과 결정할 항목을 정리했다.

| 단계 | 상태 | 확인 결과 |
|---|---|---|
| 메인 조회 API | 구현 | 본인 최신 평가의 저장된 `raw_result.total_analysis`를 우선 반환. 없으면 확인된 평가 당시 목표·팝업 판정으로 임시 문구 생성 |
| 통합 분석 입력 API | 구현 | 본인의 확정된 최신 건강검진 OCR 값·인바디·사용 가능한 냉장고 재료·알레르기를 `GET /api/health-assessments/input` 한 응답으로 반환. 만료·수량 0·사용 불가 재료는 제외 |
| 팝업 연결 | 공유 서버에서 검증 | 합성 계정으로 메인 조회, 평가 ID 팝업, 최신 팝업이 모두 200. 평가 ID와 지표 키가 매칭되고 핵심 3개 판정이 적용됨 |
| 분석 생성·저장 | 냉장고 개인화 갱신 저장 구현, 최초 평가 생성 미연결 | `POST /api/health-assessments/{assessment_id}/diet-personalization/refresh`가 현재 냉장고·알레르기를 스냅샷하고 기존 분석에 맞춤 제안을 RPC로 병합함. 최초 건강 평가·모델 분석을 생성하는 경로는 아직 연결되지 않음 |
| 프론트 화면 | 미연결 | 원격 `frontend` 브랜치의 `frontend/app/(health-data)/total-analysis.tsx`는 기존 정적 시안이며 현재 메인 API 응답 구조와 화면 구성이 다름 |
| 개발 DB 데이터 | 프론트 연동용 합성 평가 준비 | 별도 합성 계정 `autofit-main-demo-d4accb4c7a17@example.com`의 평가 `9bfaac95-1396-4503-8a3a-a035bf25b1f4`와, 기존 프론트 테스트 계정 `frontend-test-4ae50b1f@example.invalid`의 새 평가 `b25e8b03-7dbb-47c4-be16-9fb923d22a7e`를 준비. 두 평가 모두 연결된 체성분·검진 자료와 테스트 표식이 있음 |
| 공유 서버 배포 | 기존 분석 조회까지 완료, 냉장고 개인화 갱신 미배포 | Render `auto-fit-api-dev`의 기존 배포는 메인·팝업 조회까지 포함한다. 신규 refresh API와 `20260928044131_refresh_health_assessment_personalization.sql`은 아직 공유 서버에 적용하지 않음 |

## 연결 순서

1. 최초 평가 생성기 위치와 소유 팀을 확정한다. 평가를 저장할 때 `input_snapshot.goal.text`, `input_snapshot.popup_context`, `input_snapshot.diet_context`, `raw_result.popup_criteria`를 같은 평가 시점에 저장한다. 기존 평가의 냉장고 개인화 갱신은 구현된 refresh API를 사용한다.
2. 합성 평가로 인증된 `GET /api/health-assessments/latest`, `GET /api/health-assessments/{assessment_id}/popups`, `GET /api/health-assessments/latest/popups`의 200 응답을 확인했다. 세 핵심 지표의 `high`·`low`·`caution` 판정과 추천 근거 3개를 확인했다. 테스트 계정의 비밀번호는 저장소 문서에 기록하지 않는다.
3. 프론트 담당이 실제 사용 중인 종합 분석 화면에서 API 데이터를 연결하고, 로딩·404·판정 보류·조회 실패 상태를 처리한다. 현재 원격 `frontend` 화면은 요청된 추천 근거 아코디언 시안과 다르므로 화면 대상을 먼저 확정한다.
4. 개발 서버 배포와 별도 합성 사용자 200 응답 검증은 완료했다. 기존 프론트 테스트 계정의 새 평가도 DB에서 최신 평가·지표 3개·추천 근거 3개로 확인했다. 이 계정의 인증된 API·화면 표시는 프론트 로그인 후 확인한다. 실제 평가 생성 경로에 목표·판정 스냅샷을 연결하는 작업은 별도다.

## 프론트 테스트 후 정리 대상

기존 `frontend-test-4ae50b1f@example.invalid` 계정과 기존 평가 4건은 보존한다. 이번에 추가한 평가 `b25e8b03-7dbb-47c4-be16-9fb923d22a7e`, 체성분 `95ec19d2-ba9e-43b0-958c-9556687d5cde`, 검진 `f0e4e1d9-2437-4e0e-91ac-29b618867c2a`만 화면 테스트가 끝난 뒤 정리한다. 별도 합성 계정의 자료는 그 계정의 화면 테스트가 끝나면 함께 정리한다.
