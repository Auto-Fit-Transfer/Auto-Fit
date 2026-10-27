# Auto-Fit 테스트 앱

2026-10-15 기준. GitHub 작업 브랜치는 `front_new`이며 기존 `frontend` 및 백엔드 작업은 변경하지 않는다.

## 연결 환경

- EAS: [@gogosi/auto-fit-test](https://expo.dev/accounts/gogosi/projects/auto-fit-test)
- 앱 이름: Auto-Fit Test
- Android / iOS 식별자: `com.gogosi.autofit.test`
- 개발 API: `https://211-233-206-193.sslip.io`
- 로그인: 기존 Supabase Auth. 애플리케이션 데이터는 FastAPI로만 요청한다.
- `.env`는 Git에서 제외한다. EAS `preview`에는 공개 API URL, Supabase URL, publishable key만 설정한다. 서버 secret/service-role key는 앱에 넣지 않는다.

## 실행 및 빌드

Node 22.18 이상을 사용한다. `npm ci` 후 `npm test`, `npm run typecheck`, `npm run lint`를 실행한다. 현재 EAS CLI는 24.14.0으로 확인했다.

```bash
# Android 설치용 APK (Metro가 없어도 실행)
npx eas-cli@24.14.0 build --platform android --profile preview

# iOS 시뮬레이터용 앱: 실제 iPhone에는 설치할 수 없음
npx eas-cli@24.14.0 build --platform ios --profile preview-simulator

# Apple Developer 계정·기기 등록 후 실제 iPhone 내부 배포
npx eas-cli@24.14.0 build --platform ios --profile preview

# 같은 Wi-Fi의 iPhone/Android에서 Expo Go로 실행
npx expo start --go --lan --port 8083
```

Expo Go에서는 표시되는 QR을 스캔한다. 컴퓨터와 휴대폰이 같은 네트워크에 있어야 하며 컴퓨터와 개발 서버를 켜 두어야 한다. 공개 인터넷 터널은 사용하지 않는다. 현재 공식 버전 API의 Expo Go SDK는 57로 프로젝트와 일치한다.

Expo Go의 소셜 OAuth는 독립 앱의 `autofit://auth/callback`과 리디렉션이 다르므로 이 경로의 테스트는 이메일 로그인을 우선 사용한다. 설치형 앱의 Google/Kakao 로그인은 Supabase 허용 리디렉션 및 제공자 설정과 실기기 왕복을 별도로 확인한다.

## 이번 수정과 검증

- 홈 점수 그래프가 API 점수 비율을 사용한다.
- 운동 추천의 세트 수를 서버 응답에서 읽는다.
- 운동 분석은 `/api/exercise/sessions/{id}/analysis` 결과로 표시하며 고정 성공·불편감 없음 예시를 사용하지 않는다.
- 식단 영양 합계는 선택 날짜의 `/api/diet/nutrition-summary` 응답을 사용하고 먹음/건너뜀 저장 후 다시 조회한다. 정보가 없으면 빈 값으로 표시한다.
- 추천 식단 카드는 메뉴 사진과 냉장고 관리 UI를 표시하거나 `/api/diet/inventory`를 호출하지 않는다. 식단 카드에는 음식명과 레시피를 표시한다.
- 추천 API가 빈 목록을 반환하거나 로딩 중일 때는 아침·점심·저녁·간식 임시 식단을 표시하고, 서버 식단 ID가 없는 임시 식단의 기록·재추천 기능은 비활성화한다.
- `다른 음식 먹었어요`에서 카메라 촬영 또는 갤러리 사진을 선택하고 식사를 기록할 수 있다. 저장된 사진은 식사 피드백 응답의 `meal_log_id`를 사용해 `/api/diet/meal-logs/{meal_log_id}/photo`에 업로드한다. 추천 식사의 먹음·건너뜀 기록도 사용할 수 있다.
- 개발 모드에서도 건강 분석 404를 가짜 건강 결과로 대체하지 않는다.
- 회귀 테스트 10개, TypeScript, 린트 오류 없음(기존 chatSessionCache 미사용 변수 경고 1개). Android/iOS/Web 릴리스 번들 생성 및 로컬 Expo Go iOS manifest·번들 응답을 검증했다.
- 의존성 패치를 적용하고 Expo SDK 권장 네이티브 모듈 버전을 맞췄다. npm audit의 critical은 제거됐지만 기존 도구체인의 high/moderate 경고는 남아 있다. Expo 주요 버전 강제 변경은 하지 않았다. 2026-10-22에 다시 점검한다.

## 테스트 범위와 남은 작업

이 빌드는 Figma Main 페이지의 홈, 식단, 운동, 마이, 커뮤니티 빈 상태, 티어 안내, 건강 데이터 업로드/OCR, 종합 분석, 관리 시작, 프로필과 계정 화면을 반영한 테스트 버전이다. 로그인·회원가입과 운동 조건/세션 등 Main에 대응 프레임이 없는 화면은 기존 기능 흐름을 유지한다. 화면별 노드와 API 연결 범위는 `MAIN_DESIGN.md`에 기록한다.

티어 기준, 마일리지, 알림, 커뮤니티 쓰기 API는 아직 확정되거나 연결되지 않았다. 예시 수치를 고정하지 않고 준비 상태로 표시한다.

실사용자 로그인 이후의 전체 서버 왕복, 실기기 카메라/파일 업로드, 알림과 소셜 로그인은 아직 실기기에서 검증하지 않았다. 앱스토어에는 제출하지 않았다.

권장 실기기 확인: 이메일 로그인 → 기존 프로필/건강 데이터 조회 → 홈 → 식단 먹음/건너뜀과 영양 합계 갱신 → 운동 추천·세션·완료 피드백·결과 분석 → 로그아웃. 수치가 없는 계정에서는 예시 수치 대신 빈 상태가 표시되는지 확인한다.
