# Auto-Fit Backend

프론트엔드는 Supabase Auth만 직접 사용하고, 애플리케이션 데이터는 FastAPI를 통해 접근합니다.

챗봇 프론트엔드 연동 규격은 [챗봇 API 계약](docs/chat-api-contract.md)을 기준으로 합니다.

전체 화면 연동은 [프론트엔드 협업용 API 안내](docs/frontend-api-handoff.md),
[입력 필드 참조](docs/api-input-reference.md), [OpenAPI](docs/openapi.json)를 확인하세요.

커뮤니티(피드·사진·좋아요·공유·댓글·신고·차단) 연동은 [커뮤니티 API 계약](docs/community-api-contract.md)을 확인하세요.

홈 화면 로딩 개선용 `GET /api/home` 연동은 [홈 API 전달사항](docs/frontend-home-api-handoff.md)을 확인하세요.

종합 분석의 체성분 추가 지표·판정 기준·출처 팝업 설계와 계산식은
[종합 분석 팝업 명세](docs/total-analysis-popup-spec.md)를 확인하세요.
팝업 API 조회·응답 매핑은 [종합 분석 팝업 API](docs/analysis-popup-api-contract.md)를 확인하세요.

## 로컬 OAuth 및 DB 왕복 테스트

1. 백엔드 환경 파일을 준비합니다.

   ```bash
   cp backend/.env.example backend/.env
   ```

   `backend/.env`의 Publishable Key와 Service Role Key를 Supabase 프로젝트 값으로 교체합니다. Service Role Key는 서버 전용이며 브라우저 코드나 Git에 포함하면 안 됩니다.

2. 백엔드를 실행합니다.

   ```bash
   python3 -m venv backend/.venv
   backend/.venv/bin/pip install -r backend/requirements.txt
   backend/.venv/bin/uvicorn backend.app.main:app --reload --port 8000 --env-file backend/.env
   ```

3. 별도 터미널에서 테스트 페이지를 실행합니다.

   ```bash
   python3 -m http.server 3000
   ```

4. `http://localhost:3000/g.html`에서 Google 또는 Kakao 로그인 후 **FastAPI 왕복 테스트**를 누릅니다.

성공하면 브라우저가 보낸 테스트 문구와 로그인 사용자의 `profiles` 데이터가 함께 표시됩니다. 액세스 토큰과 Service Role Key는 화면에 출력하지 않습니다.

## 발표 시나리오 검증

로컬 회귀 테스트는 프로필 저장부터 운동 완료·요약 조회까지 전체 API 흐름을 검증합니다.

```bash
python -m pytest -q backend/tests/test_presentation_flow.py
```

실제 테스트 Supabase 프로젝트에서는 `backend/.env`를 설정한 뒤 다음 opt-in 검사를 실행합니다.
임시 Auth 사용자와 합성 운동 데이터를 생성하며, 정상 종료 시 해당 리소스를 정리합니다.

```bash
python -m backend.tests.chat_live_integration \
  --project eeeqibyssajykrhvecbv \
  --presentation
```

배포 서버까지 검사하려면 승인된 개발 서버 옵션을 추가합니다.

```bash
python -m backend.tests.chat_live_integration \
  --project eeeqibyssajykrhvecbv \
  --api-base https://auto-fit-api-dev.onrender.com \
  --presentation
```

배포된 식단 API의 인증·소유권·DB 왕복은 전용 합성 사용자 테스트로 확인합니다. 테스트
사용자와 생성 데이터는 종료 시 자동 정리됩니다.

```bash
backend/.venv/bin/python -m backend.tests.diet_live_integration \
  --project eeeqibyssajykrhvecbv \
  --api-base https://auto-fit-api-dev.onrender.com
```

## API

- `GET /health`: FastAPI 실행 상태 확인
- `GET /api/home`: 본인 이름·최근 건강 점수·이전 평가 대비 변화량을 한 번에 조회
- `POST /api/test/roundtrip`: Supabase JWT 검증 후 로그인 사용자의 프로필 조회
- `GET /api/profile`: 로그인 사용자의 기본 프로필·온보딩 상태와 연결된 운동 설정 조회
- `PATCH /api/profile`: 검증된 JWT의 사용자 ID로 본인 프로필 저장 후 재조회
- `GET /api/allergies`: 활성 알레르기 기준정보와 본인 선택 조회
- `PUT /api/allergies`: 본인 알레르기 복수 선택을 트랜잭션으로 전체 교체
- `POST /api/onboarding/complete`: 필수 프로필 입력 여부를 검사하고 회원가입 완료 시각 저장
- `POST /api/health-documents`: 건강검진/인바디 PDF·이미지 업로드 및 수동 검토용 임시 OCR 결과 생성
- `GET /api/health-documents/{uploaded_file_id}`: 본인 업로드 파일 메타데이터와 임시 OCR 결과 조회
- `PATCH /api/health-documents/{uploaded_file_id}/ocr-result`: 추출값 수동 입력·수정
- `POST /api/health-documents/{uploaded_file_id}/confirm`: 검토값을 건강검진 또는 체성분 데이터로 확정 저장
- `GET /api/exercise/preferences`: 본인의 운동 목표와 경험 수준 조회
- `PUT /api/exercise/preferences`: 본인의 운동 목표와 경험 수준 저장 또는 갱신
- `GET /api/exercise/recommendation-contexts/latest`: 본인의 최근 운동 추천 입력 조건 조회
- `POST /api/exercise/recommendation-contexts`: 운동 가능 시간·장소·장비·컨디션·불편 부위 입력 스냅샷 저장
- `POST /api/exercise/recommendations/generate`: 최근 미사용 운동 환경과 운동 설정으로 추천 및 세부 루틴 생성
- `GET /api/exercise/recommendations/latest`: 본인의 최근 운동 추천과 순서별 운동 항목 조회
- `POST /api/exercise/sessions/start`: 최근 활성 추천으로 운동 세션 시작
- `POST /api/exercise/sessions/{session_id}/items/{item_id}`: 세션 운동 항목 완료 또는 건너뜀 기록
- `POST /api/exercise/sessions/{session_id}/complete`: 모든 항목 처리 후 운동 세션 완료
- `GET /api/exercise/sessions/latest`: 본인의 최근 운동 세션과 수행 로그 조회
- `POST /api/exercise/sessions/{session_id}/discomfort`: 운동 중 불편 상태 기록 후 남은 운동 조정·계속·종료 처리
- `GET /api/exercise/sessions/{session_id}/discomfort`: 해당 세션의 불편 상태 기록 조회
- `PUT /api/exercise/sessions/{session_id}/feedback`: 완료·종료 세션의 체감 난이도, 운동 후 상태, 불편 부위 저장 또는 수정
- `GET /api/exercise/sessions/{session_id}/feedback`: 해당 세션의 완료 피드백 조회
- `GET /api/exercise/sessions/{session_id}/analysis`: 세션 수행 기록과 완료 피드백을 합친 결과 분석 조회
- `GET /api/exercise/goals/active`: 본인의 현재 활성 운동 목표 조회
- `PUT /api/exercise/goals/active`: 주간 횟수·시간·목표 기간을 포함한 활성 운동 목표 저장 또는 갱신
- `GET /api/exercise/history?from_date=YYYY-MM-DD&to_date=YYYY-MM-DD`: 최대 367일 범위의 완료·종료 운동 기록 조회
- `GET /api/exercise/progress?period=week|month|three_months`: 기간별 운동 합계·주간 추이·카테고리 분포·연속 운동일 조회
- `GET /api/exercise/summary`: 최근 7일과 누적 완료 운동 횟수·종목 수·시간·열량 조회
- `GET /api/diet/inventory`: 본인의 사용 가능한 냉장고 재료 조회
- `POST /api/diet/inventory`: 본인의 냉장고 재료·수량·구매일·유통기한 추가
- `PATCH /api/diet/inventory/{inventory_id}`: 본인의 냉장고 재료 일부 필드 수정
- `DELETE /api/diet/inventory/{inventory_id}`: 본인의 냉장고 재료를 멱등하게 소프트 삭제
- `POST /api/diet/recommendations/generate`: 냉장고 재료와 알레르기를 반영해 오늘 식단 추천 생성
- `GET /api/diet/recommendations?date=YYYY-MM-DD`: KST 날짜별 최신 식단 추천 조회
- `GET /api/diet/recommendations/latest`: 최근 활성 식단과 끼니별 추천 음식 조회
- `GET /api/diet/nutrition-summary?date=YYYY-MM-DD`: KST 날짜별 영양 목표와 실제 섭취량 조회
- `POST /api/diet/meals/{diet_meal_id}/regenerate`: 추천 식단의 선택한 한 끼만 재추천
- `POST /api/diet/meals/{diet_meal_id}/feedback`: 추천 식사를 먹음·변경·건너뜀으로 기록
- `PATCH /api/diet/meals/{diet_meal_id}/feedback`: 기존 추천 식사 피드백 수정
- `GET /api/diet/meal-logs?from_date=YYYY-MM-DD&to_date=YYYY-MM-DD`: 최대 367일 범위의 식사 기록 조회

`PATCH /api/profile`은 클라이언트가 보낸 `user_id`를 허용하지 않습니다. 서버가 검증한 Supabase 사용자 ID만 쿼리 조건으로 사용합니다.

알레르기 저장도 동일하게 JWT의 사용자 ID만 사용합니다. DB 함수 실행 권한은 `service_role`에만 부여되어 브라우저에서 직접 호출할 수 없습니다.

회원가입 완료 API는 클라이언트의 사용자 ID나 완료 시각을 받지 않습니다. 서버가 검증한 사용자 프로필의 이름, 생년월일, 성별을 확인하고 서버 UTC 시각으로 완료 처리합니다. 반복 호출은 기존 완료 시각을 유지합니다.

운동 설정은 `user_exercise_profiles`에 사용자당 한 행으로 저장합니다. 클라이언트는 정해진 목표와 경험 수준만 전송하며, 사용자 ID는 검증된 JWT에서 가져옵니다. 테이블은 브라우저 역할에 공개하지 않고 백엔드 `service_role`만 접근합니다.

운동 추천 조건은 `exercise_recommendation_contexts`에 요청 시점별 스냅샷으로 저장합니다. 추천 생성 전에는 `exercise_recommendation_id`가 비어 있고, 실제 추천 결과가 생성된 뒤 연결합니다. 이 테이블 역시 브라우저 역할의 직접 접근을 막고 백엔드만 접근합니다.

운동 추천 생성은 기본 프로필의 활동 수준도 반영하며, `create_exercise_recommendation` RPC에서 추천, 운동 항목, 입력 컨텍스트 연결을 한 트랜잭션으로 처리합니다. 외래키는 사용하지 않으며 `(exercise_recommendation_id, sequence_order)` 고유 인덱스와 백엔드 검증으로 중복·부분 저장을 방지합니다. 현재 `rules_v1`은 데이터 흐름 검증용 규칙 기반 생성기이며 이후 AI 생성기로 교체할 수 있습니다. 저장형 채팅에서 사용자가 명시적으로 루틴 생성을 요청하면 같은 생성 흐름을 실행하고 추천 ID와 다음 세션 시작 경로를 답변 근거로 반환합니다.

운동 세션과 불편 상태 기록도 외래키 없이 RPC 내부의 사용자 소유권·세션 상태·추천 항목 소속 검증으로 처리합니다. `adjust` 조치는 현재 운동을 제외한 미완료 항목의 시간·횟수·중량·예상 칼로리를 20% 완화하고 강도를 한 단계 낮춥니다. `stop` 조치는 남은 항목을 건너뜀으로 기록하고 세션을 종료합니다.

운동 완료 피드백은 기존 `exercise_session_feedback` 테이블에 세션당 한 건으로 원자적 upsert합니다. 결과 분석의 `generator: rules_v1`은 실제 AI 연동 전 데이터 왕복 검증용 규칙 기반 결과이며 진단을 제공하지 않습니다.

운동 목표 저장 RPC는 다른 종류의 기존 활성 목표를 `cancelled`로 전환해 이력을 보존하고, 동일 종류의 활성 목표는 갱신합니다. 외래키 없이 사용자 ID와 상태 인덱스, 백엔드의 JWT 사용자 검증으로 소유권을 관리합니다. 현재 운동 로그에는 신체 부위 기준값이 없으므로 진행 현황은 임의의 부위 값을 만들지 않고 `exercise_types.category` 기준 운동 카테고리 분포를 반환합니다.

식단 추천은 냉장고 재료와 등록된 알레르기를 조회한 뒤 `create_diet_recommendation` RPC에서 추천·끼니·음식 항목을 한 트랜잭션으로 저장합니다. 한 끼 재추천은 AI로 새 메뉴를 생성하고 `replace_diet_meal` RPC가 기존 식사 ID와 순서를 유지하며 음식 항목을 원자적으로 교체합니다. 외부 AI에는 사용자 식별자나 보유량 대신 안전한 재료명만 전달하고, 백엔드가 결과를 원본 inventory ID·수량과 다시 매핑해 `used_ingredients`로 반환합니다. 추천 식사 기록도 `record_recommended_meal` RPC에서 식사 로그·음식 항목·피드백·추천 상태를 함께 처리합니다. 외래키는 사용하지 않으며 사용자 소유권 검증과 고유 인덱스로 중복 기록을 막습니다. 식단 기능은 의료적 진단이나 처방을 제공하지 않습니다.

한 끼 AI 재추천을 배포할 때는 `supabase/migrations/20260929044540_update_regenerated_meal_source_type.sql`까지 대상 Supabase에 적용되어 있어야 합니다.
