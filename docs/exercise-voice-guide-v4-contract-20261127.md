# A안 운동 음성 안내 v4 응답 계약

## 적용 범위와 출처

- AI `856ba252e8dbb6905f1f51f67c9b1f996ec1a220`의 `exercise_guide_overrides.json` 내용을 Backend에 보관했습니다. Git의 개행 검사에 맞춰 CRLF만 LF로 바꿨고 JSON 값은 그대로입니다. 이 파일은 구매 운동 카탈로그의 **교정 대상 3,080키**만 포함합니다.
- 전달받은 원본 JSON의 SHA-256은 `76ee2e2fbad9e06d34c4d7dd6191e0a194bf403b0db28f28d4a120ceaea90147`, Backend 보관본의 SHA-256은 `4373062124f613851a35cf6c1944ee170653794587d40e3479c539c0523ee536`입니다. `source_catalog_version`은 `sha256:5e231250283742da2deee4e36da0308fb635409999ee8f6a29ff49274c5d97a1`입니다.
- 공통 안내 3,071키, 선택한 자산에 따라 문구가 다른 3키(총 6종), 음성 보류 6키입니다. 별도 제외 목록의 기존 26키도 음성 보류입니다.
- 서버 시작 후 첫 조회에서 JSON의 `source_catalog_version`과 Backend 카탈로그 버전, 키·기본 자산 ID·상대 경로·세 문장·근거 프레임 범위를 검증합니다. 불일치하면 새 안내는 내보내지 않습니다.
- 제공 자료에 구매 GIF 바이너리는 없습니다. `evidence[].sha256` 값의 형식과 카탈로그 자산 매핑은 검사하지만 서버에서 GIF 원본의 SHA-256을 다시 계산하지는 못했습니다. 실제 GIF 변경 시 자산 재검토가 필요합니다.

## 응답 필드

기존 `demo_gif_url`을 유지하며 각 운동 항목에 다음 필드를 더합니다.

| 필드 | 형식 | 의미 |
| --- | --- | --- |
| `demo_asset_id` | `string \| null` | 그 응답에서 선택한 기본 GIF의 카탈로그 자산 ID. GIF URL이 없으면 `null`. |
| `voice_guide_status` | `ready \| blocked_audio \| unavailable \| legacy` | 아래 재생 규칙의 판정값. |
| `voice_guide` | `{method: string, caution: string, focus: string} \| null` | `ready`일 때만 세 문장을 반환. |

`ready`는 실제 선택한 GIF의 `asset_id`가 v4 `evidence`와 일치하고, 해당 GIF URL이 있을 때만 반환합니다. 자산별 안내 3키는 성별 이름이나 운동명으로 고르지 않고 **선택된 자산 ID**로 정확한 문구를 선택합니다.

`blocked_audio`는 v4의 6키 또는 기존 제외 26키입니다. `unavailable`은 교정 대상이지만 GIF가 없거나 자산이 근거와 일치하지 않거나 키를 확인할 수 없는 경우입니다. 두 상태 모두 `voice_guide: null`입니다. `legacy`는 v4 대상·제외 목록 밖의 기존 카탈로그 키이며, 기존 앱에 있던 안내만 계속 사용할 수 있습니다. `legacy`는 새로 검토를 마쳤다는 뜻이 아닙니다.

필드가 추가되는 응답:

- `POST /api/exercise/recommendations/generate`의 `result.items[]`
- `GET /api/exercise/recommendations/latest`의 `result.items[]`
- `POST /api/exercise/sessions/start`의 `result.items[]`
- `GET /api/exercise/saved-routines`의 `routines[].items[]`, `POST /api/exercise/saved-routines`의 `routine.items[]`
- `POST /api/exercise/saved-routines/{routine_id}/start`, `GET /api/exercise/saved-routines/sessions/latest`의 `result.items[]`

저장 루틴 목록·저장 응답에는 아직 **재생할 GIF를 선택하지 않으므로**, v4 대상 키는 `unavailable`입니다. 추천에서 저장한 루틴을 시작하거나 이어 할 때는 원본 추천의 장소와 현재 프로필 성별로 실제 GIF를 선택하고, 일치하는 경우에만 `ready`로 바뀝니다. 직접 만든 루틴은 연결된 자산이 없으므로 `ready`가 되지 않습니다. GIF 설정 또는 원본 추천 문맥을 읽지 못해도 세션 시작·조회 자체는 유지하고 안내만 `unavailable`로 둡니다.

예시: `ex_34c291477983bb`에서 실제 남성 GIF가 `asset_9c5bf5a2555aea07`이면 그 자산의 문구가 `ready`로 내려옵니다. 여성 GIF `asset_730fbce7180066d7`을 선택했다면 다른 문구가 내려옵니다. 다른 자산이나 URL 없음은 `unavailable`입니다.

## 프론트엔드 연동 요청 — 이승현 담당

1. `voice_guide_status === 'ready'`에서만 서버 `voice_guide.method → caution → focus`를 TTS로 읽고, 키·`demo_asset_id`·세 문장의 내용 중 하나라도 바뀌면 기존 음성 큐를 버립니다. 오디오 파일 캐시를 나중에 도입한다면 같은 세 값의 내용 해시를 캐시 키로 사용합니다. 세트·절반 지점의 재생 시점은 앱의 현재 규칙을 유지합니다.
2. `blocked_audio`와 `unavailable`에서는 번들 `exerciseTips.json`, 추천 `instruction`, 과거 음성 캐시, 운동명 유사도 매칭으로 우회하지 않습니다. 내부 `blocked_reason`이나 검토 메모도 읽지 않습니다.
3. `legacy`에서만 기존 번들 안내를 유지합니다. 해당 키가 번들에 없으면 조용히 넘어갑니다. 서버에 새 필드가 없거나 알 수 없는 상태라면 새 음성을 시작하지 않습니다.
4. A안의 현재 번들에서 확인된 기존 안내는 2,215키입니다. 전달 자료가 말하는 비대상 2,217키 중 `ex_1926328986b676`, `ex_a9017f0adf9d4f`는 번들에 없습니다. 이 두 키는 음성 안내를 임의 생성하지 말고 별도 확인 후 반영해 주세요.
5. A안 새 빌드에서 공통 안내, 위 자산별 남·여 두 경우, 보류 6키와 제외 26키, GIF 미제공, `legacy`를 각각 확인해 주세요. 특히 `ex_a19814aeecf8c0`은 현재 카탈로그에 여성 기본 GIF만 있어 남성 응답에서 `unavailable`이 됩니다.

## 배포와 확인

Backend 코드에는 DB 마이그레이션이나 서버 환경 변수 변경이 없습니다. Backend 배포 뒤 앱을 새로 빌드해야 새 판정값을 음성 재생에 적용할 수 있습니다. 이미 설치된 구형 앱은 새 필드를 무시하고 기존 번들 안내를 계속 사용할 수 있으므로, **구형 앱까지 음성 보류가 적용됐다고 판정하면 안 됩니다**.

배포 확인에는 서버 실행 커밋, JSON SHA-256, 카탈로그 버전 일치, 상태별 수량과 실기기 재생 결과를 남겨 주세요. 안내 데이터만 이전 Backend 커밋으로 되돌릴 수 있지만, 되돌린 서버에는 새 필드가 없어 새 앱은 재생을 멈추도록 처리해야 합니다. 운동 기록과 완료 결과 분석 문장은 이 작업에서 변경하지 않습니다.
