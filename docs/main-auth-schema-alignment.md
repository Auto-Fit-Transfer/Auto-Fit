# Main·Auth 화면과 데이터 모델 정합성

기준: Figma Auto-fit의 `Main` (`1:2`) 및 `Auth` (`0:1`) 페이지, 2026-10-20 Auto-Fit Supabase 프로젝트의 실제 `public`·`auth` 스키마. `Splash`, `Components`, `Old`는 범위 밖이다.

## 저장 구조

| 화면 | 저장 위치 | 이번 작업 |
|---|---|---|
| Auth 로그인·이메일 인증·소셜 로그인 | Supabase Auth의 `auth.users`, `auth.identities` 등 | 새 앱 테이블 없음. 공급자 연결 및 비밀번호 재설정 만료 시간은 Auth 설정에서 별도 확인 |
| Auth 기본 정보·알레르기·운동 목표 | `profiles`, `user_allergies`, `user_exercise_profiles` | 기존 구조 사용. 약관 테이블은 준비됐지만 약관 내용은 아직 없음 |
| Main 주간 식단 | `weekly_diet_plans` | `20261020044749_weekly_ai_diet_plans.sql`을 원격 적용. 기존 일일 식단과는 별도로 저장 |
| Main 건강 티어 | `tier_definitions`, `tier_policy_versions`, `tier_policy_bands`, `user_tier_evaluations` | 산식·구간·승급 규칙 미확정. 정책을 `draft`로 유지하고 실제 티어로 표시하지 않음 |
| Main 현재 건강 목표 | `user_health_goals` | 현재 목표 1건과 변경 이력 저장 구조 추가. 과거 평가의 목표는 `health_assessments.input_snapshot`에 별도 보존 |
| Main 운동 추천 입력 | `exercise_recommendation_contexts` | 집중 부위·헬스 운동 방식·홈트 스타일 컬럼 추가. 과거 행은 빈 값으로 유지 |
| Main 레시피 | `diet_recipe_snapshots` | 일일 끼니 또는 주간 식단의 특정 버전·요일·끼니에 연결. 음식명 목록에서 재료를 추측해 넣지 않음 |
| Main 커뮤니티 운동 카드 | `community_posts` | 운동 세션 또는 추천 루틴 참조와 공유 시점 스냅샷 추가. 참조 소유자는 기존 논리 참조 트리거로 검사 |
| Main 프로필 키·몸무게 | `body_compositions` | `source_type='manual'` 기록 경로가 이미 있으므로 새 테이블·중복 프로필 컬럼 없음. 프로필 편집 API 연결은 후속 작업 |
| Main OCR 문서 제목 | `upload_files.display_title` | 기술적 파일명과 별도로 사용자가 지정한 제목 저장 |

## 신규 Auth 화면 선택지 대응

첨부된 신규 가입 화면을 기준으로, 가입 중 선택 가능한 성별은 `male`(남성)과 `female`(여성)이다. 기존 `profiles.gender='other'` 데이터와 허용값은 유지한다.

운동 목표는 `체지방 감량 → weight_loss`, `근육량 증가 → muscle_gain`, `체력 향상 → endurance`, `컨디셔닝 / 기능 회복 → rehabilitation`, 직접 입력 → `other`와 `custom_goal`로 저장한다. 가입 화면에 없는 `maintenance`는 기존 사용자 데이터와 다른 운동 목표 화면을 위해 유지한다. 운동 경험은 `초보 → beginner`, `중급 → intermediate`, `고급 → advanced`로 저장한다.

알레르기 선택지는 `allergy_types`의 ID로 저장한다. 화면 표시명 `밀(글루텐)`, `콩(대두)`, `조개`는 각각 기존 카탈로그의 `밀`, `콩`, `조개류`에 대응하며, 나머지 9개는 같은 한국어 이름으로 대응한다. 직접 입력값은 `user_allergies.custom_name`에 저장한다. 표시명 차이 때문에 DB 카탈로그 이름을 변경하지 않는다.

약관 원문과 활성 버전이 아직 없으므로 신규 가입 화면의 동의 입력은 잠시 숨긴다. `user_term_agreements`에 임의 동의 기록을 만들지 않으며, 가입 완료 조건에서도 약관을 검사하지 않는다. 약관이 준비되면 화면과 버전별 저장·검사를 함께 연결한다.

비밀번호 재설정 메일의 앱 복귀 경로는 `autofit://auth/recovery`다. 로컬 `supabase/config.toml`의 허용 주소에 추가했으며, 운영 Supabase Auth의 Redirect URLs에도 같은 주소를 등록해야 실제 메일 링크가 앱으로 돌아온다. 가입 6자리 인증번호 화면은 이메일 템플릿에 `{{ .Token }}`이 있어야 동작한다. 운영 Redirect URLs와 메일 템플릿은 아직 확인되지 않았다.

## Auth 6단계 검증 (2026-10-26)

| 항목 | 결과 | 근거·남은 확인 |
|---|---|---|
| 화면·이동 | 통과 | 웹 빌드에서 로그인, 가입 1~4단계, 비밀번호 찾기·재설정이 표시됨. 로그인↔비밀번호 찾기 이동, 알레르기·운동 목표 선택 확인 |
| 입력 오류·잘못된 재설정 링크 | 통과 | 웹에서 빈 가입 입력 안내가 보이도록 수정 후 재확인. 복구 토큰 없이 `/auth/recovery` 접근 시 비밀번호 찾기로 복귀 |
| 가입 완료 조건 | 통과 | 백엔드 테스트에서 기본 프로필 또는 운동 선호가 없으면 완료를 거부하고, 모두 있으면 완료함 |
| Auth 공급자 설정 | 통과 | 운영 Auth 공개 설정에서 이메일·Google·Kakao 활성 확인. 두 소셜 공급자 인증 시작 요청이 각각 Google·Kakao로 302 이동 |
| 이메일 OTP·재설정 메일 수신 | 미검증 | 실제 메일함 및 운영 메일 템플릿, Redirect URLs 접근이 없어 전달·앱 복귀까지 확인하지 못함 |
| Google·Kakao 로그인 완료 | 미검증 | 외부 계정 승인과 콜백 세션 발급은 테스트 계정이 없어 확인하지 못함 |
| 중단 후 재로그인 | 부분 통과 | 온보딩 상태 API와 미완료 사용자 분기 코드를 확인하고 백엔드 테스트를 통과했으나 실제 계정으로 앱 재실행은 확인하지 못함 |
| 약관 | 보류 | 원문과 활성 버전이 없어 화면·저장·완료 검사를 비워 둠 |

실행 결과: `backend/tests/test_main.py` 95개 통과, 프런트엔드 테스트 10개 통과, TypeScript 검사 통과, Expo 웹 정적 빌드 통과. 웹 확인은 임시 공개 키와 로컬 정적 빌드에서 진행했으며 실제 인증 완료를 뜻하지 않는다.

## 마이그레이션 순서와 접근 제어

2026-10-20 Auto-Fit 원격 프로젝트에 다음 순서로 적용하고 로컬 파일명을 원격 버전에 맞췄다.

1. `20261020044749_weekly_ai_diet_plans.sql`
2. `20261020044807_add_user_health_goals.sql`
3. `20261020044811_capture_exercise_recommendation_choices.sql`
4. `20261020044815_add_diet_recipe_snapshots.sql`
5. `20261020044819_link_community_workout_cards.sql`
6. `20261020044823_add_health_document_display_title.sql`

새 사용자 소유 테이블은 기존 프로젝트 관례에 따라 물리 FK 없이 `autofit_integrity` 참조·소유자·계정 삭제 보호를 사용한다. `public`의 신규 테이블은 RLS를 켜고 `anon`·`authenticated` 직접 권한을 제거하며, 백엔드 `service_role`에 필요한 권한만 부여한다. 레시피·커뮤니티 카드의 JSON 스냅샷은 API에서 구체적 형식과 노출 가능한 필드를 검증해야 한다.

## 연결 전제

- 주간 식단의 원격 테이블은 준비됐다. API는 로컬 코드에 있으며 실제 AI 설정·서버 배포·통합 검증은 별도 단계다.
- 레시피 생성 API는 아직 연결되지 않았다. 생성 응답을 검증하고 알레르기·기피 음식과 충돌하지 않을 때만 레시피 스냅샷을 저장해야 한다.
- 건강 목표, 운동 선택값, 커뮤니티 운동 카드, OCR 표시 제목은 스키마 준비 후 각각 인증된 사용자 소유권을 확인하는 API와 화면 저장 동작을 연결해야 한다.
- 티어는 점수 산식·구간·승급/강등 기준이 확정되기 전까지 `draft` 상태로 둔다.

각 SQL 파일 끝의 주석에 기능 중지 및 데이터 제거를 전제로 한 롤백 순서를 적었다. 기존 사용자 데이터 삭제를 자동 롤백으로 실행하지 않는다.

적용 후 신규 3개 테이블의 RLS 활성화와 `anon`·`authenticated` 조회 권한 없음, `service_role` 조회 권한을 확인했다. 운동·커뮤니티·업로드 컬럼 7개와 레시피·운동 카드 논리 참조 4개도 확인했다. Supabase Advisor의 신규 테이블 `RLS enabled, but no policies exist`는 서버 전용 권한과 함께 쓰는 의도적 기본 거부 상태다. 신규 인덱스의 `unused_index`는 데이터가 없는 초기 상태의 안내다.
