# 운동 자세 분석 Backend 출력 계약

이 문서는 Backend가 전달한 `Backend_exercise.txt`의 출력 형식을 AI Server의 Pydantic Schema로 고정한 계약이다.

검증 가능한 합성 fixture는 [posture_analysis_contract_examples.json](posture_analysis_contract_examples.json)을 사용한다.

## 현재 구현 범위

- 진행 정보 Schema: `PostureAnalysisProgress`
- 최종 결과 Schema: `PostureAnalysisResult`
- 관절·각도·회차·교정사항·보조운동의 중첩 Schema 검증
- 사용자 ID, 영상 URL, 원본 영상과 정의되지 않은 필드 차단
- `GET /posture-analysis/capabilities` 지원 운동·촬영 방향·운동 자산 key 조회
- `POST /posture-analysis/analyze` 동기식 영상 분석 endpoint
- MediaPipe Pose Landmarker Full의 33개 관절점 추출
- 운동별 analyzer registry, EMA 좌표 보정, 회차·각도·점수·교정사항 계산
- 현재 규칙 기준 `within_current_rules` / `needs_correction` 판정
- 요청 처리 중 생성한 AI Server 임시 영상의 성공·실패 공통 즉시 삭제

현재 Docker 실영상까지 검증된 운영 후보는 `squat + side` 한 가지다. 나머지 9개 반복형 profile은 코드·합성 관절점 계약 검증을 완료했지만 실제 스마트폰 영상 보정 전이므로 `experimental`이다. Backend는 capabilities의 상태를 확인하고 운영 화면에는 `validated`만 노출해야 한다. AI Server는 최종 결과를 동기식으로 반환하며 별도 작업 저장소나 진행 조회 endpoint는 만들지 않았다.

## 지원 운동 조회

```http
GET /posture-analysis/capabilities
Authorization: Bearer <AI_SERVER_API_KEY>
```

이 응답이 운동 코드, 촬영 방향과 허용 운동 자산의 single source of truth다. 운동명을 부분 일치시켜 analyzer를 선택하지 않는다.

| `exercise_code` | 촬영 | 상태 | 허용 `exercise_key` |
|---|---|---|---|
| `squat` | `side` | `validated` | `ex_96dcb551b33a8e`, `ex_3fb808cb84e33d` |
| `push_up` | `side` | `experimental` | `ex_f6c866501f5ac0` |
| `glute_bridge` | `side` | `experimental` | `ex_1bb869dd7b0cc4` |
| `biceps_curl` | `side` | `experimental` | `ex_a0b65fb7225b0a` |
| `calf_raise` | `side` | `experimental` | `ex_4da43055d05edf` |
| `lunge` | `side` | `experimental` | `ex_b34acd08bef11a` |
| `split_squat` | `side` | `experimental` | `ex_65d9303b043376` |
| `jumping_jack` | `front` | `experimental` | `ex_3ecaba64725e87` |
| `shoulder_press` | `front` | `experimental` | `ex_b81e8a03ab0cb0` |
| `lateral_raise` | `front` | `experimental` | `ex_f830e9dd981059` |

`exercise_code`는 자세 규칙 식별자이고 `exercise_key`는 구매 운동 자산 CSV의 `ex_<hash>` 식별자다. 두 값을 동일하게 취급하지 않는다. 스쿼트 twist, 점프 스쿼트, 푸시업 row, 머신·바벨 변형 등은 이름이 비슷해도 위 allowlist에 없으면 지원하지 않는다.

## 영상 분석 요청

```http
POST /posture-analysis/analyze
Authorization: Bearer <AI_SERVER_API_KEY>
Content-Type: multipart/form-data
```

| form field | 형식 | 정책 |
|---|---|---|
| `video` | binary | MP4, MOV, WEBM, AVI |
| `posture_analysis_job_id` | UUID | Backend가 생성한 작업 UUID |
| `exercise_key` | string/null | 신규 운동은 필수. 스쿼트 기존 호출만 생략 호환 |
| `exercise_code` | string | capabilities의 자세 규칙 코드 |
| `camera_view` | string | capabilities의 고정 `side` 또는 `front` |
| `analysis_side` | `left`/`right`/null | 런지·스플릿 스쿼트 필수, 정면 운동은 전송 금지 |

AI Server는 `exercise_key → exercise_code → camera_view` 조합을 exact allowlist로 검증한다. 신규 운동에서 key가 없거나 다른 운동의 key를 보내거나 촬영 방향이 다르면 `422`다. 공백·대소문자·유사 이름 기반 fuzzy fallback은 없다.

운영 기본값 `POSTURE_ALLOW_EXPERIMENTAL=false`에서는 9개 experimental profile의 POST 분석을 `422`로 차단한다. 팀 검증 서버에서만 이를 `true`로 설정해 실제 영상을 보정하며, validated 전환 후에는 다시 기본값을 유지한다.

기본 제한은 파일 50MB, 영상 30초, 분석 목표 15fps다. 환경변수 `POSTURE_VIDEO_MAX_BYTES`, `POSTURE_VIDEO_MAX_SECONDS`, `POSTURE_TARGET_FPS`로 운영 한도를 조정할 수 있다. 30초 상한은 현재 Backend 회차 offset 저장 제약과 일치하며, Frontend MVP 촬영은 약 8~10초를 사용한다.

분석 본체는 FastAPI event loop를 막지 않도록 worker thread에서 실행하며, 기본 동시 분석 수는 서버 프로세스당 2개다. `POSTURE_MAX_CONCURRENT_ANALYSES`는 실제 CPU·메모리 부하 테스트 후 조정한다.

AI Server는 업로드 원본을 DB나 응답에 저장하지 않는다. 디코딩을 위한 임시 파일은 요청 처리 중에만 존재하고 성공·오류와 관계없이 삭제한다.

### 응답 상태

| HTTP | 의미 |
|---|---|
| `200` | 실제 관절 추출과 완료 회차 분석 성공 |
| `401` | 서버 간 Bearer 인증 실패 |
| `422` | 형식·길이·화질·전신 가시성 부족, 완료 회차 미검출 또는 미지원 운동/시점 |
| `503` | MediaPipe/OpenCV 또는 모델 파일 미설정, 모델 추론 장애 |
| `500` | 분류되지 않은 서버 오류 |

영상 품질이 부족하거나 완료 회차가 없으면 예제 결과를 대신 반환하지 않는다.

## 모델 준비

기본 경로는 `app/models/pose_landmarker_full.task`다. 로컬 개발 환경에서는 다음 명령으로 Google 공식 Full 모델을 받는다.

```powershell
.\.venv\Scripts\python.exe app\scripts\download_pose_model.py
```

Docker image는 build 중 같은 스크립트를 실행한다. 모델 파일은 Git에 커밋하지 않는다. 다른 경로를 사용하면 `POSTURE_MODEL_PATH`를 설정한다.

현재 모델 파일 SHA-256은 `4eaa5eb7a98365221087693fcc286334cf0858e2eb6e15b506aa4a7ecdcec4ad`다. 다운로드와 추론 시작 전에 이 값을 검증하며, 일치하지 않으면 모델을 사용하지 않는다. 환경변수는 다음 세 값을 함께 관리한다.

- `POSTURE_MODEL_PATH=app/models/pose_landmarker_full.task`
- `POSTURE_MODEL_SHA256=4eaa5eb7a98365221087693fcc286334cf0858e2eb6e15b506aa4a7ecdcec4ad`
- `POSTURE_MODEL_VERSION=mediapipe-pose-full-4eaa5eb7`

환경변수에 과거 스쿼트 rule suffix가 포함돼 있어도 응답에서는 `+` 앞의 landmark 모델 식별자에 실제 선택된 운동의 `rule_version`을 결합한다. 예를 들어 푸시업 응답은 `mediapipe-pose-full-4eaa5eb7+push-up-side-rules-v1`이다. 모델 파일을 교체할 때는 SHA-256과 `POSTURE_MODEL_VERSION`의 landmark 모델 식별자를 함께 갱신한다. 점수는 학습 모델이 직접 반환하는 의료적 평가가 아니라 관절점에 버전이 고정된 운동별 결정론 규칙을 적용한 일반 운동 피드백이다.

## 진행 정보

```json
{
  "posture_analysis_job_id": "00000000-0000-4000-8000-000000000001",
  "analysis_stage": "joint_detection",
  "progress_percent": 60,
  "processed_frames": 180,
  "total_frames": 300,
  "detected_repetitions": 3
}
```

`analysis_stage`는 `joint_detection`, `posture_scoring`, `result_summary` 중 하나다. 완료·실패 상태와 임시 영상 삭제는 Backend가 관리한다.

## 최종 결과 핵심 규칙

- `schema_version`은 현재 `1.1`이다.
- `posture_analysis_job_id`는 UUID다.
- `repetitions`는 1~20개이며 `repetition_number`는 1부터 순서대로 증가한다.
- `assessment.repetition_count`는 실제 `repetitions` 길이와 같아야 한다.
- 회차 점수와 종합 점수는 0~100 범위의 정수다.
- `assessment.verdict`는 `within_current_rules` 또는 `needs_correction`이다.
- 하나 이상의 `finding_type=correction`이 있으면 반드시 `needs_correction`이며, 없으면 `within_current_rules`다.
- 정규화 좌표와 confidence는 0~1이다.
- 각도는 0~180도 범위다.
- 회차의 모든 offset은 0~30,000ms 범위다.
- 대표 시점은 `start_offset_ms <= keyframe_offset_ms <= end_offset_ms`를 만족한다.
- 한 회차에서 같은 `joint_code` 또는 `angle_code`를 중복할 수 없다.
- finding의 회차 범위는 실제 인식 회차를 벗어날 수 없다.
- routine suggestion은 존재하는 finding의 `display_order`를 참조해야 한다.
- `passing_score` 기준이 확정되지 않았으면 `null`을 반환한다.

`within_current_rules`는 선택된 운동·촬영 방향의 현재 규칙에서 교정 항목이 검출되지 않았다는 뜻이다. 의료적으로 안전하거나 모든 관절의 자세가 완벽하다는 판정이 아니다.

## 허용 관절 코드

- `head`, `neck`
- 좌·우 `shoulder`, `elbow`, `wrist`, `hip`, `knee`, `ankle`, `heel`, `foot_index`

실제 값은 `left_shoulder`, `right_knee`처럼 `left_` 또는 `right_` 접두어를 사용한다.

## 각도 코드

- `torso_lean`
- `knee_flexion`
- `elbow_flexion`
- `body_alignment`
- `hip_extension`
- `upper_arm_drift`
- `ankle_flexion`
- `shoulder_abduction`
- `leg_abduction`
- `bilateral_asymmetry`

운동별로 실제 판정에 사용하는 각도만 반환한다. `hip_flexion`, `ankle_dorsiflexion`은 향후 임계값 검증 후 사용할 예약 코드다. 모든 반환 각도에는 `target_min_degrees` 또는 `target_max_degrees` 중 하나 이상이 있어야 한다.

## 공통 분석 정책

- 측면 운동은 필수 관절의 평균 신뢰도가 높은 신체 방향을 사용한다.
- 정면 운동은 좌우 필수 관절을 모두 요구하고 좌우 각도의 평균을 사용한다.
- `neck`은 MediaPipe 양쪽 어깨의 중간점으로 계산한다.
- 영상 전체 샘플 중 기본 60% 이상에서 필수 관절이 신뢰도 0.5 이상이고 프레임 내부에 있어야 한다.
- 운동별 시작 자세에서 목표 방향으로 움직여 최소 회차 경계를 통과하고 시작 자세로 돌아온 경우만 완료 회차로 인정한다.
- 굽힘 동작은 최소각, 폄·올림 동작은 최대각 시점을 대표 시점으로 사용한다.
- 회차 검출 경계와 자세 목표 범위는 분리한다. 완료 회차로 인정돼도 목표 범위를 벗어나면 correction을 반환한다.
- 임상적 또는 제품 수용 기준이 보정되지 않았으므로 `passing_score`는 `null`이다.
- `routine_suggestions`는 구매 운동 자산의 조건 계약이 추가될 때까지 빈 배열이다.

플랭크와 월싯은 MediaPipe 관절점을 추출할 수 있지만 현재 결과가 반복 횟수 중심이므로 지원 목록에 넣지 않았다. 추후 `movement_type=hold`, 유지 구간·유지 시간 Schema와 Frontend 표시 계약을 먼저 추가한다. 데드리프트, 올림픽 리프트, 케틀벨 스윙, 착지 동작, 기구가 관절을 가리는 운동은 단일 2D 카메라로 안전한 자세를 단정할 수 없어 초기 자동 판정 대상에서 제외한다.

## 현재 검증 상태

- 10개 등록 운동의 exact key·촬영 방향 registry와 반복 주기, 점수, 판정, 교정사항, 계약을 합성 각도 주기로 자동 테스트한다.
- 카프 레이즈는 실제 합성 좌표의 정규화된 뒤꿈치 상승량으로 회차를 검증하고, 정면 운동은 실제 좌우 관절 좌표로 최악 측 점수와 비대칭 계산을 검증한다.
- 모델 파일 존재와 SHA-256 무결성을 검증한다.
- Linux Docker에서 MediaPipe `1.2.2`, OpenCV `5.0.0`, Pose Landmarker Full 모델의 네이티브 로딩을 확인했다.
- TensorFlow 공식 테스트 자산 [`pose_squats.mp4`](https://github.com/tensorflow/tfjs-models/blob/master/pose-detection/test_data/pose_squats.mp4)로 실제 API `200`, 2회 인식, Schema `1.1` 검증과 AI Server 임시 파일 0건을 확인했다. 테스트 자산 SHA-256은 `ea9151e447b301985d5d65666551ef863b369a2e0f3a71ddd58abef2e722f96a`다.
- 사람이 없는 실제 AVI는 모델 추론 후 `422`, 인증 없는 요청은 `401`로 반환됐다.
- 스쿼트를 제외한 9개 profile은 실제 스마트폰 촬영 조건별 임계값 보정 전인 `experimental`이다.
- 현재 Windows 로컬 보안 정책에서는 MediaPipe 네이티브 DLL 로딩이 `WinError 4551`로 차단되지만, 동일 코드의 Linux Docker 추론은 정상이다.

## Backend와 추가로 확정할 항목

1. Backend 작업 생성 endpoint와 Frontend 업로드 Request DTO
2. `GET /posture-analysis/capabilities` proxy 또는 검증 snapshot cache
3. 작업에 exact `exercise_key`, `exercise_code`, `camera_view`, `rule_version`, `validation_status` 저장
4. 기존 DB의 `exercise_code=squat`, `camera_view=side` check constraint를 capabilities 조합으로 migration
5. `posture_joint_angles.angle_code` allowlist에 신규 6개 코드 반영
6. 운영 화면에서는 `validation_status=validated`만 활성화하고 experimental은 팀 검증 화면에서만 사용
7. Backend proxy의 최대 업로드 크기·timeout과 AI Server의 50MB·30초 제한 일치 여부
8. 동기식 호출을 유지할지 polling, SSE, callback 중 하나로 전환할지
9. 실제 스마트폰 검증 영상으로 9개 experimental profile의 임계값을 보정하고 단계적으로 validated 전환하는 절차
10. Backend 공통 오류 형식으로 `422`, `503`을 매핑하는 방식
11. `routine_suggestions`를 운동 자산 CSV의 `exercise_key`와 연결하는 조건 계약

Backend 저장 시 `routine_suggestions[].finding_display_order`는 AI 응답 내부 참조값이다. Backend는 finding을 먼저 저장한 뒤 해당 `display_order`의 실제 finding ID로 매핑해야 한다.

현재 `routine_suggestions`는 빈 배열이다. 자세 분석 요청에는 장비·장소 등 운동 후보 필터 조건이 없고, Auto-Fit은 구매 운동 자산 CSV에 존재하는 운동만 추천해야 하므로 임의 운동명을 생성하지 않는다. 향후 Backend 요청에 필요한 운동 조건을 추가하고 AI 응답을 `exercise_key` 중심으로 확장한 뒤 활성화한다.

미확정 항목은 임의로 저장하거나 예제 값을 실제 분석 결과처럼 반환하지 않는다.
