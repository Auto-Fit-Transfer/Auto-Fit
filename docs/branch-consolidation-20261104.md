# 2026-11-04 브랜치 통합·배포 기록

## 기준과 보관

- 운영 기준: `539214aad6c5e754436181800131808fc3718e5c` (운영 담당자 보고; SSH 커밋 확인은 별도 필요).
- 통합 대상 backend: `1b2a2e112df49174a61bd0624252f0263808362d`.
- 프론트 기준: `e48cd5a2915933f0805674aedd6432bb421bf4d5`.
- 원격 보관 태그: `archive/operational-backend-20261104`, `archive/backend-before-consolidation-20261104`, `archive/frontend-before-consolidation-20261104`.
- 검토 브랜치: `codex/backend-consolidation-20261104`, `codex/frontend-consolidation-20261104`.

## 통합 범위

운영을 기준으로 식단의 슬롯별 생성·알레르기·재료 검증, 러닝 변경, 운동 분석·캐시, NCP 배포 설정과 보안 검사를 합쳤다. 식단 레시피, 커뮤니티 검색·스크랩·내 활동·월간 마일리지, 알림 설정의 운영 API 11개와 채팅 캐릭터를 유지한다. 채팅에는 읽기 전용 앱 데이터와 러닝 답변을 추가하되, 일반 AI 답변의 채팅당 1회 제한을 유지한다.

`chat_actions`의 변경·삭제 확인은 동시 요청 중복 실행 방지가 부족해 제외했다. `EXERCISE_AI_TEST_USER_IDS` 허용목록과 규칙 추천을 유지한다. 네 식사 전체 AI 생성 및 규칙 추천 차단 마이그레이션은 포함하지 않는다. 비용·전체 공개 결정 후 별도 전환한다.

운동 칼로리의 MET·체중 계산 구현은 찾지 못했다. 프론트는 미산출 값 `0`을 `—`로 표시하며, 과거 기록과 서버 계산 규칙은 유지한다. 계산 도입에는 MET 자료, 체중 선택 기준, 미산출 저장 형식 결정이 필요하다.

## DB 기준 정렬

운영 `schema_migrations`의 80개 버전과 SQL 원문에 파일을 맞췄다. 원격 이력을 삭제하거나 `migration repair`를 실행하지 않았다. 해시는 `supabase/migration-baseline-20261104.json`에 있다. 이전 파일은 보관 태그에 남아 있다.

- `update_regenerated_meal_source_type`: 운영 버전 `20260929044540` 적용됨.
- `community_admin_tools`: 운영 버전 `20261023002812` 적용됨.
- 30일 식단 보존: `20261103070648` 이미 적용됨. 재적용하지 않는다.
- `allow_four_ai_diet_meals`, 규칙 추천 차단, 운동 분석 캐시는 조사 시점 미적용.

운영 함수 두 개는 저장된 마이그레이션 이력과 달랐다. 현재 함수 정의를 읽어 새 `20261104060214_reconcile_live_diet_functions.sql`로 명시했다. 사용 식재료 저장, 혼합 추천, 기존 source_type fallback을 유지하며 데이터 행은 수정하지 않는다. 다음 `20261104060215_cache_exercise_ai_analysis.sql`은 서비스 전용 캐시 테이블을 추가한다. 신규 적용 대상은 이 두 파일뿐이다.

## 비공개 운동 GIF

버킷과 객체는 비공개로 유지한다. 서버에 `EXERCISE_GIF_BUCKET`, 필요하면 `EXERCISE_GIF_PREFIX`, `NCP_ACCESS_KEY_ID`, `NCP_SECRET_ACCESS_KEY`를 설정한다. 키 값은 Git·문서·채팅에 기록하지 않는다. 기본 임시 링크 유효시간은 4시간이고 `EXERCISE_GIF_URL_TTL_SECONDS`는 60~14400초만 허용한다.

서명은 서버 카탈로그의 운동·장소·성별에 맞는 GIF만 대상으로 한다. URL은 응답 시 생성하고 DB에 저장하지 않는다. 링크 자체도 로그에 남기지 않는다. 비공개 버킷 설정이 있으면 기존 공개 URL 설정보다 우선한다. 업로드 도구도 `private` ACL을 사용하도록 변경했으며 이번 통합에서는 업로드나 ACL 변경을 실행하지 않았다.

참고: [Boto3 GET 임시 링크](https://docs.aws.amazon.com/boto3/latest/reference/services/s3/client/generate_presigned_url.html), [NCP presign](https://cli.ncloud-docs.com/docs/en/presign).

## 배포 순서와 확인

1. 저장소 병합 대상과 서버의 현재 커밋·환경을 확인한다. 다른 작업자의 변경이 있으면 다시 비교한다.
2. 새 마이그레이션 두 개만 검토·적용한다. `supabase db push` 전에 pending 목록을 확인하고, 과거 버전이나 규칙 차단이 나오면 중단한다.
3. 운영 환경의 AI 허용목록을 유지한 채 통합 커밋을 배포한다. 분석 캐시 테이블은 코드보다 먼저 있어야 한다.
4. 인증한 테스트 계정으로 식단 조회·레시피, 운동 추천·시작·완료·분석, GIF GET, 채팅·러닝, 커뮤니티·알림을 검증한다. 비허용 계정은 규칙 추천이고 AI 호출이 없어야 한다.
5. 프론트 새 TestFlight 바이너리의 커밋과 buildNumber를 기록하고 설치 흐름을 검증한다.
6. 검증 완료 후 `front_new`를 `front-end`로 정리하고 임시 브랜치를 보관·삭제한다. 열린 PR과 고유 커밋을 다시 확인한다. 최종 브랜치 보호와 AI 자동 배포 제한을 적용한다.

실패하면 운영 보관 태그의 코드로 복구한다. 두 새 마이그레이션은 기존 운영과 호환되므로 롤백 때 캐시 테이블을 삭제할 필요가 없다. 기존 `backend`에 강제 푸시하거나 운영 데이터 삭제로 복구하지 않는다.

## 프론트 빌드

`f499b9c2f2a322aedc1f3cc53d6fada0c0cd8b70`은 e48에 기존 iOS39의 Swift 컴파일러 패치를 이식한 커밋이다. 프론트 테스트 28개, TypeScript, 린트를 통과했다. 최신 확인된 TestFlight는 1.0.0(39)이고 e48보다 먼저 업로드되어 통합 화면을 포함하지 않는다.

Expo 원격 빌드는 무료 월 한도로 거절됐다. 새 빌드는 기존 서명 자격으로 로컬에서 생성한다. `eas build --platform ios --profile testflight --local`을 사용하고, 제출은 생성한 IPA를 명시하여 `eas submit --platform ios --profile production --path <IPA>`로 진행한다. `--latest`는 다른 소스의 원격 빌드를 선택할 수 있으므로 사용하지 않는다.

## 검증 결과

백엔드 테스트 1,018개, PGlite SQL 검사 파일 12개, Bandit 및 pip-audit가 통과했다. 운영 main 경로를 AST로 비교한 결과 삭제된 경로는 없다. 독립 검토에서 새 소유권·파일럿·채팅 비용 경계 문제는 발견하지 못했다. 운영 실호출·기기 설치 검증은 서버 담당자 배포 후 수행해야 한다.

운영 SSH 22번은 시간 초과였으며 사용자가 서버 반영을 담당자에게 맡겼다. 이 작업에서는 운영 코드 배포와 신규 DB 적용을 수행하지 않았다.
