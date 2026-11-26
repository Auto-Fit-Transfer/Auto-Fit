# 운동 음성 안내 전수 대상 교정본 적용 안내

대상: Backend / Frontend 담당자

기준: 2026-11-26, AI 브랜치의 구매 운동 카탈로그

기존 안내에서 원본 확인이 필요했던 3,080개 키 중 먼저 처리한 1개와 나머지 3,079개를 모두 실제 GIF와 대조했습니다. 동작을 확인한 항목에는 방법·주의사항·집중 포인트를 작성했고, 자산마다 동작이 다르면 안내를 나눴습니다. 동작을 확정할 수 없는 항목은 음성 안내를 보류합니다. 정확한 최종 수량은 [검증 결과](exercise_guides/검증결과.json)를 기준으로 확인해 주세요.

이번 수정은 안내 자료입니다. 추천 API, 추천 카탈로그, OpenAPI, 자세 분석의 validated 상태는 변경하지 않았습니다. GitHub 업로드만으로 운영 앱의 음성 안내가 바뀌지 않습니다.

최종 3,080개 중 공통 안내는 3,071개, 자산별 안내는 3개(각 2종), 음성 보류는 6개입니다. 이번 추가 3,079개 기준으로는 공통 안내 3,070개·자산별 3개·보류 6개입니다. 보류 항목까지 안내 사용이 가능해진 것으로 해석하지 마세요.

## 전달 자료

- [기계 처리용 JSON](../data/exercise_assets/exercise_guide_overrides.json): 교정 대상 3,080개 키의 안내, 상태, 원본 근거
- [전체 5,297개 TXT](exercise_guides/AutoFit_전체운동_3줄안내_v4.txt)
- [헬스 2,189개 TXT](exercise_guides/AutoFit_헬스운동_3줄안내_v4.txt)
- [홈트 3,139개 TXT](exercise_guides/AutoFit_홈트운동_3줄안내_v4.txt)
- [기존 CSV 제외 26개](exercise_guides/AutoFit_안내제외목록_26개.txt)
- [추가 음성 안내 보류 목록](exercise_guides/AutoFit_추가_음성안내보류.txt)
- [기존 CSV 교정 보완 내역](exercise_guides/AutoFit_CSV반영_추가정리내역.txt)

전체 TXT에는 이번 대상이 아닌 기존 기본 안내 2,217개도 보존돼 있습니다. 이 2,217개까지 이번에 새로 GIF 대조를 마쳤다는 뜻은 아닙니다. JSON은 교정 대상만 포함한 덮어쓰기 자료이며 전체 운동 카탈로그를 대신하지 않습니다. 기존 CSV의 제외 26개를 다시 활성화하지 마세요.

## 현재 호출 관계

추천 요청은 recommendation_router → exercise_recommendation_service → exercise_catalog_service의 CSV 후보 → RAG/OpenAI → ExerciseItem 응답으로 처리됩니다.

현재 ExerciseItem.instructions는 추천 생성 결과의 문장이며, 이번 TXT/JSON을 읽지 않습니다. 기존 음성 안내용 데이터에 이번 교정본을 반영하는 작업은 Backend/Frontend 담당 파트에서 수행해야 합니다. AI 서버에서 Backend의 DB를 수정하지 않습니다.

## Backend 적용 규칙

### 우선 적용 순서

아래는 Backend 담당자에게 요청하는 적용 절차입니다. 이번 AI 작업에서 Backend 코드 수정이나 운영 반영을 수행한 것은 아닙니다. 기존 운동 추천·저장 API를 그대로 사용하며 신규 API 주소나 DTO 필드를 확정하는 문서가 아닙니다.

1. 이 문서와 같은 AI 커밋의 JSON·제외 목록을 받아 기존 안내 데이터와 캐시 버전을 보관합니다.
2. 저장 없이 먼저 대조합니다. 교정 대상 3,080키가 모두 매칭되는지, 실제 제공 GIF의 asset_id와 원본이 evidence에 포함되는지 확인합니다. 미매칭 키·자산은 따로 보고하고 이름 유사도로 자동 연결하지 않습니다.
3. 기존 제외 26개와 추가 blocked_audio 6개는 음성 생성·재생을 막습니다. 이미 만든 음성 캐시도 재사용하지 않습니다.
4. 공통 안내 3,071키와 자산별 안내 3키를 구분해 기존 안내 저장 구조에 반영합니다. 세 문장은 method, caution, focus 순서이며 자산별 3키는 총 6종의 문구가 있습니다.
5. 변경된 안내의 음성·앱 캐시를 갱신하고 아래 검증 사례를 시험합니다. 운동 기록이나 완료 결과 분석 문장을 일괄 수정하지 않습니다.
6. 적용 버전, 매칭·반영·보류 수량, 미매칭 목록, 앱 재생 결과를 회신해 주세요. 문제가 생기면 안내 데이터·캐시 버전만 되돌릴 수 있도록 준비합니다.

### 안내 선택 규칙

1. exercise_key로 기존 안내 레코드와 대조합니다. 한글 설명 이름으로 매칭하지 않습니다.
2. 추천 CSV의 asset_id와 선택한 GIF를 확인합니다. evidence의 relative_path, sha256은 검토한 원본을 확인하는 근거입니다. 원본 파일이 바뀌었거나 다른 자산이면 검토 상태를 그대로 상속하지 않습니다.
3. 아래 guide_status에 따라 처리합니다.
4. method → caution → focus 순서로 기존 음성 규약에 맞춰 반영합니다.
5. 안내의 버전 또는 내용 해시가 달라졌으면 기존 캐시·생성 음성을 갱신합니다. 이미 확인된 파일을 재사용하는 기존 정책은 유지하세요.
6. 대상 외 2,217개 안내와 기존 제외 26개는 일괄 덮어쓰거나 활성화하지 않습니다.

| guide_status | 필드 | 적용 |
|---|---|---|
| visual_reviewed | guide에 세 문장 | evidence에 포함된 실제 GIF와 일치할 때 사용 |
| asset_specific_guides | guide=null, asset_guides에 자산별 세 문장 | 선택된 GIF의 asset_id와 정확히 일치하는 안내만 사용 |
| blocked_audio | guide=null, asset_guides=[] | 수행 음성 생성·재생 금지, blocked_reason 확인 후 원본 보완 |

asset_specific_guides를 사용자 성별로 선택하지 마세요. 같은 키라도 실제 선택된 자산이 기준입니다. 자산을 특정할 수 없다면 공통 문장을 임의 생성하지 않고 음성 안내를 보류합니다.

처리 우선순위는 기존 제외 목록 확인 → JSON의 상태 확인 → 실제 제공 GIF 확인 → 해당 자산의 문구 선택입니다. JSON에 없는 키는 기존 정책을 유지하며, JSON에 없다는 이유만으로 새로 안내 검토 완료 처리하지 않습니다.

blocked_audio, 미매칭 GIF, 자산별 안내 선택 실패를 추천 응답의 LLM instructions나 이전 음성으로 우회하지 마세요. 내부 검토 사유를 운동 방법처럼 TTS로 읽는 것도 금지합니다. 자산 경로는 원본 대조용이며 앱에 외장하드 경로를 전달하라는 뜻이 아닙니다.

분리 대상은 다음과 같습니다.

- ex_34c291477983bb / Lying Around The World: 남성은 엎드린 자세, 여성은 바로 누운 자세
- ex_649534ee973416 / Bent Leg Side Kick (kneeling): 무릎을 펴는 옆차기와 굽힌 무릎을 옆으로 드는 동작
- ex_e052767201f97a / Seated Neck Stretch: 목을 앞으로 숙이는 동작과 옆으로 기울이는 동작

보류 목록에는 실제 운동을 확인할 수 없는 원본 또는 장소와 동작의 충돌이 포함됩니다. 예를 들어 Swimming Crawl Style은 실제 수영 동작이므로 홈트 바닥 운동으로 안내하지 않습니다. 이번 자료 변경이 추천 후보에서 해당 키를 자동 제외하는 것은 아닙니다. 보류 키가 실제 추천에 나타나면 해당 원본·카탈로그 조건을 담당자와 확인한 뒤 대체 동작 또는 후보 제외를 별도 결정해야 합니다.

| 보류 키 | 확인할 사항 |
|---|---|
| ex_47d3ee547cf2ac | Barbell Pullover To Press 이름과 달리 벤치프레스만 보여 자산 매핑 확인 |
| ex_7d8826503fd1a5 | Roll Side Lat Stretch 이름·부위와 허벅지 바깥쪽 롤링 영상 불일치 |
| ex_ebbe2ec66928bf | Dumbbell Standing Hands Torsion의 손목 회전 방향 불명확 |
| ex_00cbeed19527c5 | EZ Bar Legs Side Pull In Sit Up의 바 지지·다리 이동 관계 불명확 |
| ex_19f5c728fafb67 | Swimming Crawl Style은 실제 수영이므로 Gym/Home 안내로 사용할 수 없음 |
| ex_82e4aeabb8a6e1 | Jaw Stretch에서 손이 턱 접촉과 움직임을 가려 추가 각도 필요 |

## JSON 읽기

schema_version=1이며 entries[]의 exercise_key가 식별자입니다.

카탈로그 버전은 최상위 source_catalog_version을 비교하세요. 기존 AI의 catalog_version과 같은 방식으로 CSV 바이트의 CRLF와 CR을 LF로 바꾼 뒤 SHA-256을 계산한 `sha256:...` 형식입니다. source_catalog_sha256은 검토 당시 Windows 파일 원본 바이트 해시이므로 Linux checkout이나 runtime catalog_version과 직접 비교하면 안 됩니다. 개별 GIF의 evidence[].sha256은 줄바꿈 변환 없이 바이너리 원본을 해시한 값입니다.

카탈로그 버전이 다르면 해당 키·자산·GIF의 일치 여부를 재대조하고 미매칭을 보고하세요. 검토 자료의 해시만 임의로 바꿔 일치 처리하지 않습니다.

- guide: method, caution, focus
- asset_guides[]: asset_id, guide
- evidence[]: asset_id, relative_path, sha256, frame_count, reviewed_frame_indices, inspection
- observed_motion: 원본에서 관찰한 동작
- blocked_reason: 음성을 보류한 근거
- review_note: 이름과 실제 시범 차이 등 추가 설명이 있을 때만 제공

reviewed_frame_indices는 0부터 시작합니다. sampled_frames는 시간순 샘플 대조, all_frames는 해당 GIF의 전체 프레임 대조를 뜻합니다. 구매 GIF와 검토용 이미지는 배포 자료에 포함하지 않았습니다.

## Backend 완료 확인 사례

| 시험 | 기대 결과 |
|---|---|
| ex_a19814aeecf8c0 + 원본과 일치하는 GIF | 제자리걸음과 양팔 밀기 방법·주의·집중 3문장 사용 |
| 자산별 안내 3키의 남녀 GIF 각각 선택 | 실제 asset_id에 맞는 총 6종 문구 선택; 다른 영상의 문구 혼합 없음 |
| 자산별 키에 asset_id 없음/미일치 | 음성 보류, 다른 자산 또는 LLM 문장으로 대체하지 않음 |
| blocked_audio 6키와 기존 CSV 제외 26키 | 이전 음성 캐시가 있더라도 재생하지 않음 |
| 원본 SHA-256 또는 연결 자산 변경 | 검토 완료 상태를 자동 상속하지 않음; 재대조 대상 보고 |
| 이번 JSON에 없는 기존 안내 | 기존 문구·상태 유지; 제외 목록 우선 적용 |
| 같은 교정본 재적용 | 안내 중복 생성 없이 같은 버전 유지; 불필요한 TTS 재생성 없음 |
| 갱신된 안내를 앱에서 재생 | 기존 placeholder와 오래된 캐시 대신 최신 문구 재생 |

회신에는 적용한 AI 커밋, Backend 수정 커밋/배포 여부, 매칭된 3,080키 수량, 3,071 공통·3 자산별·6 보류 처리 결과, 기존 제외 26개 유지, 미매칭 목록, 시험 계정의 실제 재생 결과를 포함해 주세요. 이 문서 전달만으로 Backend 적용 완료를 뜻하지 않습니다.

## Frontend 확인

- 실제 추천의 exercise_key와 표시 GIF의 asset_id가 안내에 맞는지 확인합니다.
- 공통 안내, 자산별 안내, 보류 상태를 각각 시험합니다.
- 보류 항목의 내부 검토 문장을 수행 지시처럼 TTS로 읽지 않습니다.
- 기존 CSV 제외 운동에서 음성이 다시 활성화되지 않는지 확인합니다.
- 안내 교체 후 앱 캐시를 포함한 실제 음성 재생을 확인합니다.

## 검증 범위와 남은 작업

로컬 검증은 키 누락·중복, 카탈로그 자산 매칭, 세 문장 존재, 근거 프레임 범위, 전체/헬스/홈트 일관성, 기존 비대상 안내와 제외 목록 보존을 확인합니다. 운동 추천 관련 기존 테스트도 별도로 실행합니다.

실행 결과: 운동 카탈로그·Frontend 조건 반영 관련 기존 테스트 63개 통과, 독립 파일 검증 오류 0건, 실제 GIF 12개 SHA-256 재계산 일치입니다. 교정 JSON에 기록된 검토 근거는 primary 자산 3,579개입니다.

GIF 대조는 시범과 문구가 맞는지 확인한 것이며 개인별 안전 인증이나 전문가의 모든 동작 검증은 아닙니다. 새 원본이 필요한 보류 항목, Backend 안내 데이터 반영, TTS 갱신, 실제 앱 재생은 후속 작업입니다. OpenAI·유료 Vision·TTS 호출이나 운영 DB 변경은 수행하지 않았습니다.
