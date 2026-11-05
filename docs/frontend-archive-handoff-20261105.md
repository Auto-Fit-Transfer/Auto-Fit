# 정식 프런트엔드 운동 기록 전환 인수인계 (2026-11-05)

조회 기준: 기존 GitHub `front-end` 브랜치 `ff3df41c484465bdb00a9f8cd5b92fa9babb9645`. 기존 GitHub는 조회만 했고 이 브랜치에는 커밋하거나 푸시하지 않았다. 정식 프런트엔드 소유자가 검토할 수 있도록 로컬 조회본에 적용한 수정안을 [`docs/patches/frontend-archive-ui-ff3df41.patch`](patches/frontend-archive-ui-ff3df41.patch)로 보관했다.

## API 계약

`GET /api/exercise/history`의 각 `history[].session`에 다음 두 필드를 추가했다. 연결된 추천이 없거나 상태 조회가 일시적으로 실패하면 둘 다 `null`이다. 과거 세션·로그·피드백은 그대로 반환한다.

```json
{
  "session": {
    "exercise_recommendation_id": "...",
    "status": "completed",
    "recommendation_generator": "legacy",
    "recommendation_status": "cancelled"
  },
  "logs": [],
  "feedback": null
}
```

- `recommendation_generator`: `auto-fit-ai`, `legacy`, 또는 `null`.
- `recommendation_status`: 추천의 현재 상태 또는 `null`.
- `POST /api/exercise/saved-routines`는 `source_recommendation_id`가 있는 경우 소유자와 `auto-fit-ai` 생성 방식을 검증한다. `legacy` 추천 저장은 HTTP 409와 `보관된 운동 추천은 새 루틴으로 저장할 수 없습니다.`를 반환한다.

## 정식 앱에서 필요한 변경

1. `frontend/app/exercise/history.tsx`의 저장 버튼 조건을 `completed && id && session.recommendation_generator === 'auto-fit-ai'`로 좁힌다. `save()`에서도 같은 조건을 확인한다. 생성 방식이 `null`이면 안전하게 저장 액션을 숨긴다.
2. `legacy`인 완료·중단 기록에는 `이전 추천 기록 · 참고용` 같은 안내를 표시한다. 세션, 운동 항목, 기존 피드백은 계속 읽을 수 있어야 한다.
3. 저장 요청이 이미 진행 중이거나 409가 반환되더라도 저장 실패 문구를 화면에서 확인할 수 있어야 한다. 동일 추천을 이미 저장한 경우의 기존 409 처리는 유지한다.
4. 수정 후 `legacy`, `auto-fit-ai`, `null` 각 기록의 버튼·안내 상태를 확인한다. 백엔드의 소유권 및 409 검증은 유지한다.
5. Expo 웹의 운동 추천 생성 오류도 점검한다. 로컬 파일럿 미허용 계정에서 생성 API가 HTTP 403을 반환했지만 `frontend/app/exercise/condition.tsx`의 `Alert.alert` 실패 안내는 웹 화면에 나타나지 않았다. 웹에서는 화면 내 오류 문구가 필요하다.

기존 `ff3df41`의 `history.tsx`는 `session.status === 'completed' && id`만으로 버튼을 표시했다. 로컬 패치에서는 생성 방식까지 확인하고 웹 오류 안내를 추가했다. 타입 검사·린트·프런트엔드 테스트 33개가 통과했다. 로컬 Supabase의 가짜 `legacy/cancelled` 기록으로 실제 웹에서 참고용 문구와 저장 버튼 숨김을 확인했고, API의 저장 시도는 HTTP 409였다. 정식 GitHub 브랜치에는 이 변경이 아직 반영되지 않았다.

정식 프런트엔드 소유자는 최신 `front-end` 브랜치에서 패치가 적용 가능한지 먼저 확인한 뒤 코드를 통합하고 `npm run typecheck`, `npm run lint`, `npm test`를 실행하면 된다. 패치는 조회 당시 HEAD `ff3df41`에 깨끗하게 적용되는 것을 별도 로컬 작업 트리에서 확인했다. 브랜치가 더 진행됐다면 충돌 부분을 현재 UI에 맞게 옮겨야 한다.
