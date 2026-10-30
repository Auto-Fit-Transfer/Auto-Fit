# API 서버 담당자 전달 초안 (2026-10-29)

**전달 보류:** 앱·API의 전체 작업과 Render 백업 서버 검증이 끝난 뒤 최종본을 만들어 네이버 공용 서버 담당자에게 한 번에 전달한다. 그 전에는 담당자에게 보내거나 네이버 서버를 변경하지 않는다.

## 서버 역할과 현재 상태

| 대상 | 역할 | 현재 관리·배포 상태 |
|---|---|---|
| 네이버 공용 서버 | 앱의 기본 API | 서버 담당자가 관리한다. 이 작업 공간에서 배포하지 않는다. |
| Render `auto-fit-api-dev` | 백업·개발 API | 이 컴퓨터의 Render Dashboard에서 접근 가능하다. 서비스는 GitHub `backend` 브랜치를 추적하며 자동 배포가 꺼져 있다. 현재 Live 커밋은 `51dcf00e45733ca4df5b6226057c2f5db235f8d6`이다. |
| Supabase `eeeqibyssajykrhvecbv` | 두 API가 사용하는 DB/Auth | 커뮤니티 글 상세·검색 및 아래 마이페이지 마이그레이션을 적용했다. |

앱의 현재 기본 API 주소는 `https://211-233-206-193.sslip.io`다. Render의 주소는 `https://auto-fit-api-dev.onrender.com`이다. 자동 장애 전환은 아직 구현되지 않았다.

## 담당자에게 전달할 코드 범위

완성된 통합 API 코드는 로컬 `front_new` 작업본에 있다. GitHub `backend` 브랜치와는 별도이며, 백엔드 코드가 아직 로컬에서 Git 추적 대상이 아니다. 서버 담당자에게 전달하거나 Render에 배포할 때는 **검증된 커밋/브랜치**를 먼저 만들고 다음 파일을 함께 검토해야 한다.

- `backend/app/main.py`: 새 라우터 등록과 앱 API 통합.
- `backend/app/community.py`: 커뮤니티 검색, 분류별 피드, 1,000자 글쓰기, 태그, 완료 운동 첨부 API.
- `backend/app/`의 새 모듈: `chat_persona.py`, `community_mileage.py`, `habit_tier.py`, `health_report.py`, `posture_analysis.py`, `running_sessions.py`, `saved_workout_routines.py`, `user_settings.py`, `weekly_diet*.py`, `ai_server.py`. `main.py`의 import와 함께 배포해야 한다.
- `backend/requirements.txt` 및 관련 테스트.
- `supabase/migrations/20261029071125_community_post_details_20261029.sql`, `supabase/migrations/20261029071132_community_search_20261029.sql`. **이 두 마이그레이션은 현재 Supabase에 적용 완료**했다. 같은 DB에 다시 적용하지 않는다.
- `supabase/migrations/20261029163000_my_notification_preferences.sql`부터 `20261029170000_community_bookmarks.sql`까지의 마이페이지 마이그레이션 5건도 **적용 완료**했다. 기존 DB에 재실행하지 않는다.

## 이번 커뮤니티 API 계약

| 경로 | 용도 |
|---|---|
| `GET /api/community/search?q=...&limit=10` | 공개 게시글·루틴·사람·클럽 검색. 차단·신고·숨김 글과 클럽 내부 글 제외. |
| `GET /api/community/feed?category=workout\|routine\|diet\|question\|review` | 분류별 서버 페이지네이션. `scope=following`과 함께 사용하지 않는다. |
| `GET /api/community/my-activities` | 로그인한 사용자의 완료 운동 세션 중 글에 첨부 가능한 최근 10개. |
| `POST /api/community/posts` | `content` 최대 1,000자, `category`, `tags` 최대 5개, 선택적 `exercise_session_id`. |
| `POST /api/community/clubs/{club_id}/posts` | 같은 글쓰기 필드. 클럽 회원만 게시 가능. |

운동 첨부는 작성자가 직접 선택한 **본인 소유 완료 세션**만 허용한다. 공개 스냅샷에는 운동명·시간·열량·운동 목록만 담고 메모, 통증·건강 정보는 포함하지 않는다. 사진은 기존 비공개 Storage와 서명 URL 흐름을 유지한다.

## 마이페이지 추가 API 계약

| 경로 | 용도 |
|---|---|
| `GET/PUT /api/notifications/preferences` | 식단·운동·건강·커뮤니티, 푸시, 앱 실행 중 푸시, 방해 금지 시간 설정 저장. 실제 기기 푸시 전송 서비스는 아직 없다. 커뮤니티 알림 생성 규칙에도 현재 스위치가 반영되지 않는다. |
| `GET/PUT /api/app/preferences` | 화면 모드·글자 크기·간편 모드 저장. 앱은 계정별 기기 저장값을 먼저 반영하고 서버 동기화를 재시도한다. R9 다크 색상은 현재 마이 화면과 화면 설정에 적용했고 다른 화면은 남았다. |
| `GET/PUT /api/health/goals/active` | 건강 목표 종류와 설명 저장. |
| `GET/PATCH /api/profile` | 자기소개 `bio` 최대 50자 추가. `community_profile` 응답에도 표시된다. |
| `GET /api/community/mileage/monthly` | 전체 장부에서 이번 달 적립·사용, 지난달 적립 집계. |
| `GET /api/community/activity?kind=comments\|likes` | 본인 댓글·좋아요 활동 페이지 조회. |
| `GET /api/community/bookmarks` | 본인 스크랩 글 페이지 조회. |
| `GET/PUT/DELETE /api/community/posts/{post_id}/bookmark` | 스크랩 상태·추가·취소. |
| `GET /api/health-report` | 기존 6개월 기록과 계정의 체중 목표(`target_weight_kg`) 반환. |

프로필 사진용 공개 Storage 버킷은 사진의 공개 범위에 대한 명시적 결정이 없어 자동 승인 검토에서 거부되어 만들지 않았다. 기존 사용자 `community_enabled` 값을 일괄 변경하는 마이그레이션은 전체 사용자 설정을 덮어쓸 수 있어 거부됐다. `profiles`에 키·몸무게 컬럼을 새로 저장하는 변경도 건강 관련 개인정보 저장에 대한 명시적 승인이 없어 거부됐다. 세 변경은 적용하지 않았고 배포 범위에 포함하지 않는다. 프로필의 키·몸무게 항목은 기존 건강 데이터 관리 화면으로 연결한다.

## 배포 순서와 검증

1. 로컬 변경 전체를 검토해 통합 배포 커밋을 만든다. `backend` 브랜치의 현재 코드와 차이를 확인하고 누락된 새 모듈·마이그레이션을 포함한다.
2. Render 백업 API에 먼저 배포한다. 현재 Dashboard의 **Manual Deploy**는 `backend` 브랜치의 기존 커밋만 다시 배포하므로, 코드가 GitHub에 올라오기 전에는 실행하지 않는다.
3. Render에서 `/health`, `/openapi.json`, 인증 후 위 5개 경로를 검증한다. 검색 결과의 공개 범위, 본인 아닌 운동 세션 첨부 거부, 클럽 회원 제한도 확인한다.
4. 남은 앱·API 작업을 모두 끝내고 Render를 대상으로 iPhone 실호출과 회귀 검증을 마친다. 테스트 앱은 검증할 때만 Render API 주소를 사용한다.
5. 전체 변경 목록, 검증 결과, 마이그레이션 적용 상태, 환경변수 이름을 최종 전달본에 합친다. 그때 네이버 공용 서버 담당자에게 보내고 담당자가 배포·로그 확인을 수행한다. 비밀키 값은 문서·Git에 넣지 않는다.
6. 공용 서버 검증 후 앱 기본 API 주소와 Render 백업 전환 방식을 확정한다.

현재 마이페이지 관련 로컬 검증: 백엔드 관련 테스트 174개 통과, 프론트 타입 검사·린트 통과. 이 검증은 배포된 서버의 인증 실호출을 대신하지 않는다.

## 남은 범위

- F2 대댓글과 공유 루틴을 내 루틴으로 저장하는 동작.
- F4 검색 전체 건수·다음 페이지.
- F5 챌린지·티어 알림 이벤트와 탭 분리.
- Render 새 API 배포 및 iPhone 실호출 확인. 공용 서버 전달·배포는 전체 작업 완료 후 진행.

이 문서는 전달 준비용이다. 서버 담당자에게 전송하거나 공용 서버를 변경하지 않았다.
