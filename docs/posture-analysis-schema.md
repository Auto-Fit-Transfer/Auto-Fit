# 자세 분석 E16~E18 DB 구조

2026-10-29 기준 R7의 E16 자세 촬영, E17 분석 중, E18 자세 점검 결과와 첨부 화면을 대상으로 한다. 실제 Supabase 프로젝트 `eeeqibyssajykrhvecbv`에 `20261029012432_posture_analysis_e16_e18.sql`, 트리거 보정 `20261029012948_fix_posture_result_write_guard.sql`, 결과 표시 필드 보정 `20261029013154_add_posture_result_display_fields.sql`, 진행률 필드 `20261029013234_add_posture_analysis_progress.sql`를 적용했다. E16 기기 내 촬영 UI와 E17·E18의 데이터 기반 화면 및 읽기 API를 구현했다. 사용자가 분석 AI가 아직 없다고 확인했으므로 영상 업로드·분석·삭제 API와 촬영 후 자동 진입은 아직 없다.

## 관계와 저장 내용

```text
exercise_sessions (선택) ── posture_analysis_jobs (사용자, 처리 상태, 임시 영상 경로)
                               └─ posture_assessments (총점, 분석 버전, 요약)
                                  ├─ posture_repetitions (회차, 점수, 대표 시점)
                                  │  ├─ posture_joint_keypoints (대표 시점의 정규화된 관절 좌표)
                                  │  └─ posture_joint_angles (측정 각도와 결과 당시 목표 범위)
                                  ├─ posture_findings (교정/잘한 점, 해당 회차)
                                  │  └─ posture_guidance_steps (번호가 있는 교정 안내)
                                  └─ posture_routine_suggestions (맞춤 운동, 루틴 반영 이력)
```

초기 범위는 옆면 스쿼트, 최대 30초 영상과 최대 20회 반복이다. 100점 만점 총점·회차별 점수와 각도, 대표 시점 관절·발 좌표를 저장한다. 이전 점수와의 차이, 회차 그래프, 고칠 점 개수는 저장된 결과에서 계산한다. 그래프 기준 점수는 분석 모델이 결과별로 제공할 때만 저장하며 시안의 80점을 기본값으로 넣지 않는다. 영상·프레임·얼굴 임베딩은 DB에 저장하지 않는다. 관절 좌표는 각 회차의 대표 시점만 저장한다.

각도 목표 범위는 결과 생성 시 사용한 모델 버전과 함께 스냅샷으로 저장한다. 화면의 45°·100° 예시를 공통 기준으로 시드하지 않았다. 실제 판정 기준과 모델 버전은 자세 분석 담당자가 제공해야 한다. `posture_routine_suggestions.applied_routine_item_id`는 기존 사용자 루틴 항목을 가리키며, 같은 사용자 소유인지 논리 참조 트리거가 검사한다.

## 영상 삭제와 상태 제약

백엔드는 작업 행을 먼저 만들고 사용자 UUID 하위의 비공개 임시 영상 경로를 기록한다. 상태는 `awaiting_upload → processing → cleanup_pending → completed`이며, 실패 시에도 영상 업로드가 있었다면 먼저 삭제한 뒤 `failed`로 끝낸다. `completed`에는 임시 경로가 NULL이고 `video_deleted_at`이 있어야 하며, 총 회차 수만큼 점수·관절 좌표·각도가 있어야 한다. 결과는 처리 중에만 추가하거나 수정할 수 있고, 완료 후에는 루틴 반영 이력만 한 번 연결할 수 있다.

E17의 단계·진행률은 같은 작업 행의 `analysis_stage`, `progress_percent`, `processed_frames`, `total_frames`, `detected_repetitions`에서 읽는다. 처리 프레임은 전체 프레임을 넘을 수 없고 완료 상태는 `complete` 단계·100%만 허용한다. 앱이 직접 테이블을 읽지 않고 인증된 백엔드 API로 조회한다.

읽기 API는 `GET /api/posture/jobs/{job_id}`와 `GET /api/posture/jobs/{job_id}/result`다. 둘 다 로그인 사용자 ID로 작업을 먼저 조회하며, 본인 작업이 없으면 404를 반환한다. 결과 조회는 작업이 `completed`일 때만 가능하고 그 전에는 409를 반환한다. 작업 응답에는 임시 Storage 경로를 포함하지 않는다. 결과는 평가, 회차별 점수·관절 좌표·각도, 교정/잘한 점·안내 단계, 루틴 제안을 반환한다. 앱 E17은 이 상태를 3초 간격으로 조회하고 완료되면 E18로 이동한다. E18은 실제 서버 값만 표시한다. 아직 생성 API가 없어 일반 촬영 흐름에서 두 화면에 진입하지 않는다.

**DB는 실제 Storage 파일 삭제를 직접 확인하지 못한다.** 영상 파일은 [Supabase Storage API의 삭제 기능](https://supabase.com/docs/guides/storage/management/delete-objects)으로 지운 뒤 같은 백엔드 흐름에서 경로 제거·삭제 시각·완료 상태를 기록해야 한다. 중간에 실패한 작업의 임시 경로를 정리할 재시도 작업과, 업로드 성공 후 DB 기록 실패로 생길 수 있는 고아 파일을 찾는 버킷 정리 작업도 필요하다. 임시 영상 버킷과 업로드·삭제 API는 아직 만들지 않았다. Storage 메타데이터만 SQL로 삭제하지 않는다.

## 접근·무결성

8개 새 테이블 모두 RLS를 켰고 `anon`/`authenticated`에 직접 권한을 주지 않았다. `service_role`에는 조회·추가·수정만 허용하며 삭제는 허용하지 않는다. 앱은 인증된 사용자로 백엔드 API를 호출하고, 백엔드는 그 사용자의 작업·세션·루틴 소유권을 확인해야 한다. 논리 참조 트리거가 DB 내부의 부모 존재와 소유자 일치를 재검사한다. 계정 삭제는 기존 `auth.users` 삭제 트리거가 논리 참조를 따라 결과를 제거하도록 연결했다.

## 검증

- 롤백되는 실제 DB 트랜잭션에서 작업 생성 → 분석 결과·관절 좌표·각도 저장 → 영상 경로 제거 → 완료까지 통과했다.
- 영상 경로가 남은 완료, 선언한 회차 수를 넘는 기록, 빈 결과의 완료, 완료 후 관절 좌표 추가가 거부됨을 확인했다.
- 기준 점수 80과 발뒤꿈치 좌표를 포함한 완료 흐름, 전체 프레임을 넘는 진행률 거부를 확인했다.
- 다른 사용자의 분석 결과에 연결된 교정 항목을 루틴 제안에 연결하려는 시도가 거부됨을 확인했다.
- 새 테이블의 RLS, 앱 역할 권한 없음, 백엔드 역할 조회 가능, 시험 데이터 0건을 확인했다.
- 읽기 API의 작업 소유권 필터, 타인 작업/결과 404, 미완료 결과 409, 임시 영상 경로 미노출과 하위 결과 조회를 모의 HTTP 테스트 4개로 검증했다.
- 계정 삭제까지 포함한 긴 시험 쿼리는 Supabase 연결 시간 제한으로 결과를 받지 못했다. 이후 조회에서 시험 작업·결과·계정 0건을 확인했다. 계정 삭제 경로의 실행 검증은 API 작업 때 별도로 수행한다.

Supabase Advisor에는 새 테이블의 [RLS 정책 없음 안내](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)와 [초기 미사용 인덱스 안내](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index)만 추가됐다. 직접 앱 접근을 막는 현재 백엔드 전용 구조에서는 RLS 정책 없음이 의도된 기본 거부 상태다.
