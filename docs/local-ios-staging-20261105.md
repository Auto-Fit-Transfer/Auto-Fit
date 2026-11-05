# 정식 앱 로컬 iOS 검증 (2026-11-05)

## 실행 범위

- 공용 GitHub의 `front-end`를 조회했다. 최초 네이티브 개발 빌드의 기준 커밋은 `ff3df41c484465bdb00a9f8cd5b92fa9babb9645`이며, 앱 버전은 `1.0.0`, iOS `CFBundleVersion`은 `1`이다. Expo EAS 빌드 번호가 아니라 로컬 개발 빌드 번호다.
- 테스트 중 `front-end`가 `f336fdb7ca9b3acea44e36efc82869176ea4c01a`로 진행되어 최신 JavaScript를 새 로컬 작업 트리에서 실행했다. 최신 커밋용 보관 기록 UI 패치를 적용했고 `npm run typecheck`, `npm run lint`, `npm test`(42개)가 통과했다. 네이티브 설정과 의존성은 두 커밋 사이에 바뀌지 않았다.
- iPhone 18 Pro 시뮬레이터(iOS 27.0)에서 실행했다. API는 `http://127.0.0.1:18080`, Supabase는 로컬 `http://127.0.0.1:54321`, Metro는 `http://localhost:8082`에 연결했다. 로컬 Supabase의 가짜 계정만 사용했다. 운영 API·DB·유료 스테이징은 사용하지 않았다.

## 확인한 결과

- 첫 로컬 iOS 빌드는 완료됐지만 앱 실행 시 `ExpoCamera.framework`가 `ExpoModulesCore`의 `AnyModule.classTypes` 심볼을 찾지 못해 종료됐다. `EXPO_USE_PRECOMPILED_MODULES=0`으로 Pods를 설치하고 다시 빌드한 뒤 앱이 실행됐다. 이 빌드 설정은 정식 iOS 배포 경로에서도 검증해야 한다.
- 로컬 계정으로 로그인하고 홈·식단·운동·커뮤니티·마이 탭을 확인했다. 운동 기록 화면과 채팅의 `운동 기록 알려줘` 응답도 확인했다. 최신 `f336fdb` JavaScript로 다섯 탭과 운동 기록·채팅을 다시 열었을 때 화면 오류나 추가 네이티브 크래시는 관찰되지 않았다.
- 웹 검증에서는 로컬 가짜 `legacy/cancelled` 기록의 참고용 안내와 저장 버튼 숨김, API의 저장 거부(HTTP 409)를 확인했다. 이 가짜 기록이 없는 iOS 테스트 계정에서는 보관 기록 화면을 직접 확인하지 않았다.

## 남은 문제와 제한

- 최신 정식 `front-end`에는 보관 기록 UI 패치가 없다. 현재 정식 앱의 운동 기록은 완료 상태와 추천 ID만으로 `내 루틴으로 저장` 버튼을 표시할 수 있다. 프런트엔드 담당자가 [`frontend-archive-ui-f336fdb.patch`](patches/frontend-archive-ui-f336fdb.patch)를 검토·적용해야 한다. `front-end`에는 커밋하거나 푸시하지 않았다.
- `frontend/app/splash.tsx`는 앱 시작 3초 뒤 항상 `/login`으로 이동한다. 실제 재실행에서도 로그인 화면이 나왔다. 로그인 유지가 의도된 동작인지 프런트엔드 담당자와 확정하고, 의도된 동작이 아니라면 세션 상태를 확인해 분기해야 한다.
- EAS `preview` 환경은 운영 API·Supabase를 가리키며, `preview` 빌드 설정에는 `EXPO_USE_PRECOMPILED_MODULES=0`이 없다. 따라서 이번 검증은 EAS 빌드나 사용자 기기 설치 테스트를 포함하지 않는다. 실제 AI 추천, OCR, 외부 HTTPS 연동도 검증하지 않았다.
- 사용자가 비용 지출을 중단하도록 지시했으므로 유료 Supabase 스테이징 프로젝트를 만들지 않았다. 운영 마이그레이션·배포·기존 브랜치 삭제도 하지 않았다.

이 결과는 로컬 주요 화면과 백엔드 계약의 동작 증거다. 전체 앱에 문제가 없다는 최종 판정이나 운영 전환 승인은 아니다.
