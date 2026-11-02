# 러닝 데이터 구조

기준: Figma Auto-fit `Main` 페이지 `1:2`의 운동 설정, 러닝 추천, 코스 목록, 러닝 진행, 완료 화면과 숨김 상태의 직접 코스 설정 레이어. 적용 마이그레이션은 `20261020003021_create_running_domain.sql`, `20261020003855_add_running_course_images_and_custom_courses.sql`, `20261020004759_add_running_saved_courses.sql`, `20261020004906_link_running_saved_courses.sql`, `20261020005035_version_running_course_snapshots.sql`, `20261020005312_preserve_running_favorite_on_reselect.sql`이다.

## 테이블과 조회 경로

| 테이블 | 역할 | 주요 조회 키 |
|---|---|---|
| `running_courses` | 관리자가 등록하는 야외 코스와 카드 썸네일 | `running_course_id`, 활성 코스의 유형·난도 |
| `running_course_points` | 코스의 순서 있는 예정 경로 | `(running_course_id, sequence_number)` |
| `running_custom_courses` | 사용자가 직접 만든 코스와 선택적 썸네일 | `(user_id, created_at)` |
| `running_custom_course_points` | 사용자 코스의 순서 있는 예정 경로 | `(running_custom_course_id, sequence_number)` |
| `running_recommendations` | 사용자 상태·목표·장소와 추천 결과 | `(user_id, created_at)`, 코스 ID |
| `running_sessions` | 일시정지, 종료, 저장 및 운동 결과 | `(user_id, started_at)`, `running_recommendation_id` |
| `running_track_points` | 실제 달린 순서 있는 GPS 경로 | `(running_session_id, sequence_number)` |
| `running_saved_courses` | AI 공식·자동 생성 코스의 선택 시점 전체 스냅샷, 즐겨찾기, 현재 선택 | `(user_id, source_type, source_course_id, snapshot_fingerprint)`; 사용자별 선택 1건 |
| `running_pace_preferences` | 사용자 페이스(분/km) | `user_id` |

러닝 테이블은 기존 `exercise_*` 테이블을 참조하지 않는다. 기존 사용자 데이터와 합쳐 볼 때는 `running_recommendations.user_id` 또는 `running_sessions.user_id`를 `profiles.user_id`에 맞춰 조인한다. 러닝 내부에서는 추천 → 세션 → 실제 경로, 코스 → 예정 경로 순으로 조인한다. 야외 추천은 관리자 코스 ID, 사용자 직접 코스 ID, AI 저장 코스 ID 중 정확히 하나를 가진다. 실내 추천은 모두 비운다. 사용자 소유 코스 참조는 기존 논리 참조 트리거가 같은 사용자 소유인지 검사한다. AI 저장 코스의 동일 upstream ID가 새 경로를 반환하면 fingerprint로 새 버전을 남겨 과거 러닝 기록의 경로를 보존한다.

```sql
select s.running_session_id, s.started_at, s.elapsed_seconds,
       s.distance_meters, s.average_pace_seconds_per_km,
       r.condition_level, r.intensity, r.location_type,
       coalesce(r.course_name_snapshot, '실내 러닝') as course_name,
       coalesce(c.thumbnail_url, cc.thumbnail_url) as course_thumbnail_url,
       sc.source_type, sc.snapshot->'path' as ai_course_path,
       p.nickname
from public.running_sessions s
join public.running_recommendations r
  on r.running_recommendation_id = s.running_recommendation_id
 and r.user_id = s.user_id
left join public.running_courses c on c.running_course_id = r.running_course_id
left join public.running_custom_courses cc
  on cc.running_custom_course_id = r.running_custom_course_id
 and cc.user_id = s.user_id
left join public.running_saved_courses sc
  on sc.running_saved_course_id = r.running_saved_course_id
 and sc.user_id = s.user_id
join public.profiles p on p.user_id = s.user_id
where s.user_id = :authenticated_user_id and s.saved_at is not null
order by s.started_at desc, s.running_session_id desc;
```

코스 이름과 목표 거리·페이스는 추천 시점에 스냅샷으로 저장한다. 코스 카탈로그가 나중에 바뀌어도 이전 추천·기록의 표시는 유지된다. 평균 페이스는 주행 시간과 실제 거리에서 자동 계산한다. 앱에서 보여 주는 현재 페이스는 최근 GPS 점들로 서버가 계산해야 하며, 별도의 영구 컬럼으로 저장하지 않는다.

## 기존 규칙과 범위

물리 FK는 추가하지 않았다. `autofit_integrity.business_references`와 기존 트리거가 러닝 내부 참조의 존재 및 소유자를 검사한다. `user_id`는 기존 사용자 참조 트리거로 활성 계정과 프로필을 검사한다. 계정 삭제는 기존 재귀 정리 절차를 통해 사용자 코스·예정 경로·주행 세션·실제 경로까지 삭제한다.

9개 테이블 모두 RLS를 활성화하고 `anon`·`authenticated`의 직접 접근 권한을 제거했다. 백엔드 `service_role`만 사용자 코스·추천·세션·이동 경로를 기록할 수 있다. 관리자 코스 카탈로그와 예정 경로의 변경은 관리자 마이그레이션으로 처리한다. 실제 위치 기록을 조회할 때는 백엔드가 인증된 `user_id`로 세션 소유자를 확인해야 한다. 썸네일은 안정적인 HTTPS URL만 저장하며 실제 이미지 업로드와 보존은 별도 서비스 책임이다.

Figma의 한강 예시 지도와 코스는 실제 GPS 데이터로 검증되지 않아 초기 데이터로 넣지 않았다. 관리자 코스가 없어도 사용자가 직접 코스를 만들거나 AI 코스를 선택하면 야외 추천에 사용할 수 있다. 실제 위치 수집·주행 세션 API와 모바일 화면 연결은 별도 구현이 필요하다.
