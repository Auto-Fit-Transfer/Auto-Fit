# 건강 티어 데이터 구조

이 문서의 기존 `tier_policy_versions` 구조는 Figma Auto-fit **Main** 페이지 `1:2`, 티어 화면 `1323:3256`을 기준으로 만든 **100점 건강 점수 조합 초안**이다. 해당 정책은 여전히 `draft`이며 평가 이력은 없다. 2026-10-29에 채택한 R8 **티어 초안 v1**은 별개의 **활동 누적 티어 점수** 정책이며 아래 구조를 사용한다. 앱은 두 점수를 합산하거나 서로 대체해서는 안 된다.

## R8 티어 초안 v1: 활동 누적 티어 점수

`20261029010527_create_habit_tier_v1.sql`이 실제 Supabase DB에 적용됐다. `tier_habit_policy_versions`에는 활성 버전 1이 있고, `tier_habit_point_rules`에는 적립 규칙 6개, `tier_habit_bands`에는 15개 단계, `user_tier_points`에는 사용자별 추가 전용 적립 이력을 저장한다. 현재 실제 사용자 적립 이력은 없다.

| 활동 | 티어 점수 | 적립 한도 |
|---|---:|---|
| 끼니 기록 | 2 | 하루 3회 |
| 추천 운동 완료 | 5 | 하루 1회 |
| 주간 운동 목표 달성 | 10 | 주 1회 |
| 건강 자료 업로드 | 15 | 월 1회 |
| 챌린지 완료 | 20 | 챌린지별 1회(`source_key` 중복 방지) |
| 7일 연속 기록 | 10 | 주 1회 |

단계 시작점은 CORE 1·2·3 = 0·30·70, BALANCE = 120·180·250, ACTIVE = 330·420·520, FIT = 630·750·880, PEAK = 1020·1170·1330점이다. PEAK 3은 상한이 없다. 이 수치는 Figma의 시험용 예시이므로 팀 실테스트 후 새 정책 버전으로 조정한다. 마일리지(`community_mileage_ledger`)와도 별도 점수다.

백엔드는 실제 완료된 활동의 소유자·상태를 확인하고 안정적인 `source_key`로 적립 이력을 추가해야 한다. DB 트리거는 활성 규칙, 배점, 서울 시간 기준 일·주·월 한도, 중복 키, 사용자 참조를 검사한다. `public.user_habit_tier_progress(user_id)`는 누적 점수와 현재·다음 단계의 시작점을 반환한다. 이 함수와 새 테이블은 `service_role`에서만 접근한다. 앱이 서버 API 없이 직접 호출하는 구조는 아니다. 적립 API와 화면 연결은 아직 구현되지 않았다.

롤백되는 트랜잭션에서 하루 끼니 3회 상한, 중복 적립 방지, PEAK 3 경계와 계정 삭제를 검증했다. 실제 적립 데이터는 남기지 않았다. 기존 100점 정책과 관련된 아래 내용은 이 새 티어 정책의 구현 지침으로 사용하지 않는다.

## 이전 100점 건강 점수 정책 초안

## 테이블

| 테이블 | 역할 | 주요 제약 |
|---|---|---|
| `tier_definitions` | CORE·BALANCE·ACTIVE·FIT·PEAK 표시 정보 | `(code, revision)` 유일, 게시된 정의 수정 금지 |
| `tier_policy_versions` | 산식·배점·정책 상태 | 버전 유일, 활성 정책 최대 1개, 게시 후 불변 |
| `tier_policy_bands` | 정책별 티어·하위 단계·점수 구간 | 구간 중복 금지, 단계 유일, 게시 후 불변 |
| `user_tier_evaluations` | 사용자별 산정 이력 | 사용자·정책·source_key 중복 금지, 점수 합 자동 계산, 추가 전용 |

논리 관계는 `정의 → 구간 ← 정책`, `구간·정책·사용자·선택적 건강평가 → 티어 평가 이력`이다. 기존 규칙에 따라 물리 FK는 만들지 않고 `autofit_integrity.business_references`와 기존 무결성 트리거를 재사용한다. 다른 사용자의 건강평가를 참조할 수 없다.

초기 데이터는 정의 5개와 초안 정책 1개뿐이다. 구간과 평가 이력은 비어 있다. 식단 30·운동 30·건강 데이터 40은 Main에 표시된 **초안 배점**이며 승인된 계산 공식이 아니다. `scoring_rules`는 빈 객체로 활성화를 차단한다. 승급 유지 기간, 강등 유예, 재평가 주기, 데이터 부족 처리도 미정이다.

## 이후 수정 절차

1. 초안에서 배점, 구간, 하위 단계, `scoring_rules`와 변경 사유를 정한다. 산식 실행과 승급·강등 처리는 별도 서버 로직으로 구현하고 검증해야 한다. JSON이 비어 있지 않다는 DB 검사는 업무적 정확성을 대신하지 않는다.
2. 활성화 시 각 코드의 정의 revision이 하나씩 필요하다. 구간은 0부터 총점까지 빈틈 없이 이어져야 한다. 티어 순서는 CORE→BALANCE→ACTIVE→FIT→PEAK이고 각 하위 단계는 1부터 연속이다.
3. 구간은 `[하한, 상한)`이며 마지막 구간만 총점과 동일한 상한을 포함한다.
4. 기존 정책을 `retired`로 바꾸고 새 정책을 `active`로 바꾸는 작업은 **같은 READ COMMITTED 트랜잭션**에서 수행한다.
5. 게시 후 변경은 새 정책 버전을 만든다. 표시 이름·설명이 바뀌면 같은 `code`의 새 `revision`을 만들고 새 정책에서 참조한다. 과거 정책·평가의 표시 정보는 유지된다.

정책 편집과 활성화는 관리자 마이그레이션으로만 한다. 구간 편집은 정책 행을 잠가 활성화와 직렬화된다. 설정 변경은 REPEATABLE READ/SERIALIZABLE에서 거부한다. 재시도 가능한 오류가 발생하면 전체 관리자 트랜잭션을 다시 실행한다.

## 권한과 계정 삭제

4개 테이블 모두 RLS를 켰고 `anon`/`authenticated`의 직접 접근 권한은 없다. `service_role`은 4개 테이블 조회와 이력 추가만 할 수 있다. 정책 편집, 이력 수정·삭제 권한은 주지 않는다. 비밀 키는 앱에 포함하지 않는다. RLS와 테이블 권한은 서로 다른 방어 계층이다([Supabase 공식 문서](https://supabase.com/docs/guides/database/postgres/row-level-security)).

기존 계정 삭제 트리거가 `user_id`와 논리 참조를 따라 티어 이력도 삭제하며 카탈로그는 유지한다. 기존 community 계정 삭제 함수는 교체하지 않는다. 일반적인 건강평가 삭제는 참조 중인 티어 이력이 있으면 거부하므로 향후 문서 삭제 정책과 연동할 때 별도로 처리한다.

현재 티어는 아래 순서로 조회한다. 기준 미정이거나 평가가 없으면 앱에는 `산정 준비 중`을 표시하고 임의의 FIT 2 같은 값을 만들지 않는다.

```sql
select e.*, d.code, d.revision, d.display_name, b.sublevel
from public.user_tier_evaluations e
join public.tier_policy_bands b using (tier_policy_band_id)
join public.tier_definitions d using (tier_definition_id)
where e.user_id = :authenticated_user_id
order by e.evaluated_at desc, e.created_at desc, e.user_tier_evaluation_id desc
limit 1;
```

정정은 새 평가를 추가한다. 같은 입력의 재시도에는 같은 `source_key`를 사용한다. 동일 시각 평가의 UUID 순서는 결정적이지만 삽입 순서는 아니므로 새 정정에는 더 늦은 `evaluated_at`을 지정한다.

## 검증과 되돌리기

`backend/tests/health_tiers_sql.mjs`는 격리된 PGlite PostgreSQL에서 기존 무결성 함수와 새 마이그레이션을 실행한다. 설치된 `@electric-sql/pglite` 패키지 경로를 첫 인자로 전달한다. 원격 DB에는 테스트 데이터를 만들지 않는다.

63개 검증은 초안 시드, 점수 범위·중복·공백, 티어 완전성·코드 순서, 정의 revision, 게시 후 불변성, 소유자 참조, 권한, 계정 삭제, 정책 교체를 포함한다. 단일 연결 테스트이므로 실제 다중 연결 경합은 재현하지 않았으며 잠금 구조는 독립 코드 리뷰로 점검했다.

운영 중 되돌리기는 새 산정 중지 및 활성 정책 종료를 우선한다. 물리 제거가 필요하면 평가가 없음을 확인하고 백업 후 별도 승인된 마이그레이션에서 자식 테이블, 논리 참조 등록, 부모 테이블, 전용 함수를 순서대로 제거한다. 기존 공용 무결성 함수는 제거하지 않는다.

## 적용 기록

2026-10-15 Auto-Fit 프로젝트(`eeeqibyssajykrhvecbv`)에 적용했다. 원격 마이그레이션 이력의 버전 `20261015012742`와 로컬 파일 이름을 맞췄다. 적용 후 정의 5개, 초안 1개, 구간 0개, 평가 0개, RLS 4개, 논리 참조 5개, 물리 FK 0개를 확인했다. `service_role`에는 조회와 평가 추가 권한만 있고 앱 역할에는 권한이 없다. 기존 community 계정 삭제 함수가 유지됨도 확인했다.

보안 Advisor의 새 테이블 항목은 [“RLS enabled, but no policies exist” 안내](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)다. 이는 앱 직접 접근을 막고 백엔드 역할만 사용하는 기존 정책에 따른 의도적인 기본 거부 상태다. 공개 정책을 추가해 해제하지 않는다.

성능 Advisor에는 신규 인덱스가 아직 사용되지 않았다는 안내만 확인됐다. 구간·평가가 비어 있는 초기 상태이므로 조회·참조 검증용 인덱스를 유지한다([공식 안내](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index)).
