# 운동 자세 분석 Backend 출력 계약

이 문서는 Backend가 전달한 `Backend_exercise.txt`의 출력 형식을 AI Server의 Pydantic Schema로 고정한 계약이다.

검증 가능한 합성 fixture는 [posture_analysis_contract_examples.json](posture_analysis_contract_examples.json)을 사용한다.

## 현재 구현 범위

- 진행 정보 Schema: `PostureAnalysisProgress`
- 최종 결과 Schema: `PostureAnalysisResult`
- 관절·각도·회차·교정사항·보조운동의 중첩 Schema 검증
- 사용자 ID, 영상 URL, 원본 영상과 정의되지 않은 필드 차단
- `POST /posture-analysis/analyze` 동기식 영상 분석 endpoint
- MediaPipe Pose Landmarker Full의 33개 관절점 추출
- 측면 스쿼트 회차 분리, EMA 좌표 보정, 관절각·점수·교정사항 계산
- 요청 처리 중 생성한 AI Server 임시 영상의 성공·실패 공통 즉시 삭제

현재 운영 후보 범위는 `squat + side` 한 가지다. AI Server는 최종 결과를 동기식으로 반환한다. Backend가 정의한 작업 생성·상태 저장·완료 처리와 polling/SSE/callback 방식은 아직 합의되지 않았으므로 AI Server에 별도 작업 저장소나 진행 조회 endpoint를 만들지 않았다.

## 영상 분석 요청

```http
POST /posture-analysis/analyze
Authorization: Bearer <AI_SERVER_API_KEY>
Content-Type: multipart/form-data
```

| form field | 형식 | 현재 값 |
|---|---|---|
| `video` | binary | MP4, MOV, WEBM, AVI |
| `posture_analysis_job_id` | UUID | Backend가 생성한 작업 UUID |
| `exercise_code` | string | `squat` |
| `camera_view` | string | `side` |

기본 제한은 파일 50MB, 영상 60초, 분석 목표 15fps다. 환경변수 `POSTURE_VIDEO_MAX_BYTES`, `POSTURE_VIDEO_MAX_SECONDS`, `POSTURE_TARGET_FPS`로 운영 한도를 조정할 수 있다.

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

`model_version` 기본값은 `mediapipe-pose-landmarker-full+squat-rules-v1`이다. 점수는 학습 모델이 직접 반환하는 의료적 평가가 아니라 관절점에 버전이 고정된 결정론적 스쿼트 규칙을 적용한 일반 운동 피드백이다.

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

- `schema_version`은 현재 `1.0`이다.
- `posture_analysis_job_id`는 UUID다.
- `repetitions`는 1~20개이며 `repetition_number`는 1부터 순서대로 증가한다.
- `assessment.repetition_count`는 실제 `repetitions` 길이와 같아야 한다.
- 점수는 0~100이다.
- 정규화 좌표와 confidence는 0~1이다.
- 대표 시점은 `start_offset_ms <= keyframe_offset_ms <= end_offset_ms`를 만족한다.
- 한 회차에서 같은 `joint_code` 또는 `angle_code`를 중복할 수 없다.
- finding의 회차 범위는 실제 인식 회차를 벗어날 수 없다.
- routine suggestion은 존재하는 finding의 `display_order`를 참조해야 한다.
- `passing_score` 기준이 확정되지 않았으면 `null`을 반환한다.

## 허용 관절 코드

- `head`, `neck`
- 좌·우 `shoulder`, `elbow`, `wrist`, `hip`, `knee`, `ankle`, `heel`, `foot_index`

실제 값은 `left_shoulder`, `right_knee`처럼 `left_` 또는 `right_` 접두어를 사용한다.

## 허용 각도 코드

- `torso_lean`
- `knee_flexion`
- `hip_flexion`
- `ankle_dorsiflexion`

## 현재 분석 정책

- 오른쪽과 왼쪽 중 어깨·엉덩이·무릎·발목·뒤꿈치·발끝의 평균 신뢰도가 높은 측면을 사용한다.
- `neck`은 MediaPipe 양쪽 어깨의 중간점으로 계산한다.
- 영상 전체 샘플 중 기본 60% 이상에서 필수 관절이 신뢰도 0.5 이상이고 프레임 내부에 있어야 한다.
- 무릎 각도가 선 자세에서 내려갔다가 최소 깊이를 통과하고 다시 선 자세로 돌아온 경우만 완료 회차로 인정한다.
- 각 회차의 최저 무릎 각도 시점을 대표 시점으로 사용한다.
- 현재 규칙은 몸통 기울기, 스쿼트 깊이와 발뒤꿈치 들림을 감점한다.
- 임상적 또는 제품 수용 기준이 보정되지 않았으므로 `passing_score`는 `null`이다.

## Backend와 추가로 확정할 항목

1. Backend 작업 생성 endpoint와 Frontend 업로드 Request DTO
2. Backend proxy의 최대 업로드 크기·timeout과 AI Server의 50MB·60초 제한 일치 여부
3. 동기식 호출을 유지할지 polling, SSE, callback 중 하나로 전환할지
4. 다음 지원 `exercise_code`와 운동별 허용 `camera_view`
5. 실제 스마트폰 검증 영상으로 점수 임계값과 `passing_score`를 보정하는 절차
6. Backend 공통 오류 형식으로 `422`, `503`을 매핑하는 방식
7. 건강정보를 선택적으로 전달할 때의 최소 DTO와 개인정보 범위

미확정 항목은 임의로 저장하거나 예제 값을 실제 분석 결과처럼 반환하지 않는다.
