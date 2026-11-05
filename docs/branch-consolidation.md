# 브랜치 통합 기록 — 2026-11-05

기존 GitHub의 43개 브랜치 끝 커밋을 조회해 로컬 원격 참조와 일치함을 확인했습니다. API·Supabase·AI·OCR 코드가 섞인 브랜치도 모두 후보에 포함했습니다. 조사용 원본 52개 고유 스냅샷은 이 통합본과 별도의 `outputs/backend-code-collection-20261105/`에 보관되어 있습니다. 공용 저장소의 새 `back-end` 브랜치에는 실행 기준 코드와 필요한 계약만 담습니다. 기존 `backend` 브랜치는 유지합니다.

## 채택한 기준

| 서비스 | 기준 브랜치 | 커밋 | 이유 |
| --- | --- | --- | --- |
| API·Supabase | `codex/backend-consolidation-20261104` | `8d3b70fb` | 최신 API 기능·SQL·테스트를 가장 넓게 포함 |
| AI | `ai` | `a5acc729` | 운동 계약과 식단·채팅 기능의 최신 독립 서비스 |
| OCR | `ocr` | `d26fd502` | 독립 OCR 서버의 최신 소스 |

## 선택적으로 이식한 차이

| 출처 | 반영 내용 | 파일 |
| --- | --- | --- |
| `4937fdd6` | AI가 식품명에 설명 문장을 섞으면 거절하고 재시도하도록 검증 | `backend/app/diet_ai.py` |
| `e215c9b7` | 알레르기 해석 실패를 사용자 정보 없이 고정 코드로 기록 | `backend/app/diet_refresh.py` |
| `5fee87f3` | AI 체성분 분석 경로에도 서버 간 Bearer 인증 적용 | `ai_service/app/routers/body_router.py` |
| 로컬 작업 트리 | Supabase 인증 복귀 리디렉션 설정 | `supabase/config.toml` |

기준본에 이미 들어 있는 알레르기 차단, 열량 보정 재시도, 일일·주간 식단, 운동 문맥과 기간 검증, 커뮤니티 SQL, 식단 보존·재생성 로직은 이전 브랜치 코드를 다시 덮어쓰지 않았습니다. 특히 `0c9870c9`의 커뮤니티 메시지 SQL은 기준본의 `20261019023132_community_direct_messages.sql`과 바이트 단위로 동일합니다. AI의 오래된 `/ai/chat` 경로 변경과 느슨한 운동 시간 제한은 현재 API 계약을 깨뜨리므로 제외했습니다.

아래 표는 **원격 브랜치 삭제 명령이 아닙니다.** 이전 브랜치는 원격에 그대로 있고, 통합본의 기능·배포 검증이 끝난 뒤 소유자가 정리 여부를 판단할 수 있습니다.

## 전체 브랜치 점검표

<!-- Generated from the verified collection manifest; decisions are conservative. -->
| 브랜치 | 끝 커밋 | 발견 코드 | 결정 |
| --- | --- | --- | --- |
| `Unused_branch(Former_frontend)` | `5010e749` | API | 대조 후 직접 병합 생략 |
| `ai` | `a5acc729` | AI | 기준 채택 |
| `backend` | `1b2a2e11` | API, DB | 대조 후 직접 병합 생략 |
| `codex/ai-body-analysis-auth` | `5fee87f3` | AI | 체성분 분석 인증 이식 |
| `codex/backend-consolidation-20261104` | `8d3b70fb` | API, DB | 기준 채택 |
| `codex/community-sql-rollout` | `c8e98665` | API, DB | 대조 후 직접 병합 생략 |
| `codex/daily-recipe-snapshot-20261103` | `fe0f21f7` | API, DB | 대조 후 직접 병합 생략 |
| `codex/diet-ai-answer-retry-20261103` | `64393804` | API, DB | 대조 후 직접 병합 생략 |
| `codex/diet-allergy-on-6439380` | `e215c9b7` | API, DB | 안전 진단 로그 일부 이식 |
| `codex/diet-hide-weekly-tab-20261103` | `d795ce4c` | API, DB | 대조 후 직접 병합 생략 |
| `codex/diet-refresh-safe-retry-20261103` | `02fa81b5` | API, DB | 대조 후 직접 병합 생략 |
| `codex/exercise-ai-backend-contract` | `b2bbceba` | API, DB | 대조 후 직접 병합 생략 |
| `codex/exercise-ai-on-6439380` | `d58f2712` | API, DB | 대조 후 직접 병합 생략 |
| `codex/exercise-ai-pilot-20261103` | `348f737b` | API, DB | 대조 후 직접 병합 생략 |
| `codex/exercise-ai-pilot-followup-20261104` | `4937fdd6` | API, DB | 식품명 검증 일부 이식 |
| `codex/exercise-gif-mobile` | `dd11556e` | API, DB | 대조 후 직접 병합 생략 |
| `codex/exercise-pilot-followup-20261104` | `539214aa` | API, DB | 대조 후 직접 병합 생략 |
| `codex/exercise-pilot-ui-20261104` | `80d9872b` | API, DB | 대조 후 직접 병합 생략 |
| `codex/exercise-summary-context-20261104` | `74dc3dcf` | API, DB | 대조 후 직접 병합 생략 |
| `codex/exercise-team-test-20261104` | `96e90bd0` | API, DB | 대조 후 직접 병합 생략 |
| `codex/exercise-weekly-mobile` | `4332bd13` | API, DB | 대조 후 직접 병합 생략 |
| `codex/frontend-consolidation-20261104` | `24d3506c` | API, DB | 대조 후 직접 병합 생략 |
| `codex/naver-backend-pin-20261102` | `b45f0fb4` | API, DB | 대조 후 직접 병합 생략 |
| `codex/naver-diet-cache-refresh-20261103` | `b53a3d18` | API, DB | 대조 후 직접 병합 생략 |
| `codex/naver-running-36d34e4` | `36d34e46` | API, DB | 대조 후 직접 병합 생략 |
| `codex/render-backup-api` | `49852bab` | API, DB | 대조 후 직접 병합 생략 |
| `codex/running-selection-token-normalization` | `0f99c4e5` | API, DB | 대조 후 직접 병합 생략 |
| `codex/testflight-diet-tabs-swift-20261103` | `6184c111` | API, DB | 대조 후 직접 병합 생략 |
| `codex/testflight-hide-weekly-tab-20261103` | `81d2f1f3` | API, DB | 대조 후 직접 병합 생략 |
| `codex/testflight-ncp-20261102` | `53f31b60` | API, DB | 대조 후 직접 병합 생략 |
| `codex/weekly-diet-retention-30d-proposal` | `104a152b` | API, DB | 대조 후 직접 병합 생략 |
| `codex/weekly-diet-retention-review-20261103` | `a28ecaed` | API, DB | 대조 후 직접 병합 생략 |
| `codex/weekly-diet-testflight-20261102` | `78f3d853` | API, DB | 대조 후 직접 병합 생략 |
| `community-backend` | `4c36fcb9` | API, DB | 대조 후 직접 병합 생략 |
| `community-frontend` | `5010e749` | API | 대조 후 직접 병합 생략 |
| `develop` | `722903b4` | — | 백엔드 코드 없음 |
| `feat/step1-foundation-20261103` | `e48cd5a2` | API, DB | 대조 후 직접 병합 생략 |
| `front_new` | `e48cd5a2` | API, DB | 대조 후 직접 병합 생략 |
| `hide-ranking-messages` | `91b30c22` | API, DB | 대조 후 직접 병합 생략 |
| `korean-word-break` | `e358fcbb` | API, DB | 대조 후 직접 병합 생략 |
| `main` | `4c6d4408` | API | 대조 후 직접 병합 생략 |
| `ocr` | `d26fd502` | OCR | 기준 채택 |
| `redesign-foundation` | `c697b262` | API, DB | 대조 후 직접 병합 생략 |
