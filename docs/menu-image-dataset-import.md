# 식단 이미지 데이터셋 가져오기

AI 모델 개발자가 전달한 `images/`와 `labels.jsonl`을 검증하고 식단 이미지 캐시에
등록하는 운영 절차다. 가져오기 도구는 `quality_status=approved`인 PNG 또는 WebP만 등록한다.

## 입력 구조

```text
autofit-menu-images/
├── images/
│   └── menu_000001.png
└── labels.jsonl
```

지원 이미지 규격은 다음 두 가지다.

- PNG 1024×1024, 최대 10MB
- WebP 512×512, 최대 500KB

라벨의 `format`, `width`, `height`는 실제 파일과 일치해야 한다. `image_id`와 파일명이 같아야 하고,
상대 경로만 허용한다. 중복 ID·경로, 누락 파일, 잘못된 PNG·WebP 헤더와 크기는 전체 작업을
중단시킨다.

## 1. 검증만 실행

```bash
backend/.venv/bin/python -m backend.scripts.import_menu_image_dataset \
  /path/to/autofit-menu-images/labels.jsonl \
  --dataset-name batch-20260930
```

기본값은 dry-run이다. Supabase 환경변수가 없어도 파일과 라벨 검증을 수행한다.

## 2. DB 마이그레이션 적용

`supabase/migrations/20260930090000_menu_image_dataset_matching.sql`을 먼저 적용한다.
이 마이그레이션은 다음을 수행한다.

- `menu_images.meal_type`과 조회 인덱스 추가
- 생성 이미지 Storage 상대 경로 허용
- `claim_menu_image`에 `meal_type` 입력 추가
- 자정 식단 RPC가 `menu_image_key`, `image_storage_path`를 저장하도록 수정

## 3. 승인 이미지를 실제 등록

```bash
SUPABASE_URL=https://PROJECT.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=... \
backend/.venv/bin/python -m backend.scripts.import_menu_image_dataset \
  /path/to/autofit-menu-images/labels.jsonl \
  --dataset-name batch-20260930 \
  --apply
```

이미지는 `menu-images/datasets/<dataset-name>/`에 멱등 업로드된다. 캐시 행은
`dataset:<image_id>`를 `image_key`로 사용해 upsert되므로 같은 배치를 재실행할 수 있다.
서비스 역할 키는 서버 운영 환경에서만 사용하고 로그나 문서에 기록하지 않는다.

## 매칭 기준

식단의 음식명에서 단백질·탄수화물·일반·정규화 식재료 태그를 만들고 완성된 캐시
이미지와 비교한다. 주 단백질 40점, 주 탄수화물 30점, 일반 태그 10점, 끼니 유형
일치 10점, 라벨 음식명 일치당 10점을 부여한다. 50점 미만, 미승인 라벨,
완성 파일이 없는 이미지는 선택하지 않는다. 적합한 사진이 없으면 기존 흐름대로
`pending` 캐시 행을 만들어 향후 이미지 생성 작업 대상으로 남긴다.

## 음식 이미지 서버 연동

미리 등록된 사진이 없고 `FOOD_IMAGE_ENABLED=true`이면 백엔드는 아래 서버에 한 끼씩
직렬로 생성 요청을 보낸다.

```text
https://lee-com.tailb6e4ed.ts.net/generate-food-image
```

필수·권장 환경변수:

```text
FOOD_IMAGE_ENABLED=true
FOOD_IMAGE_URL=https://lee-com.tailb6e4ed.ts.net/generate-food-image
FOOD_IMAGE_API_KEY=<server-secret>
FOOD_IMAGE_FORMAT=webp
FOOD_IMAGE_TIMEOUT_SECONDS=300
FOOD_IMAGE_MAX_ATTEMPTS=2
```

생성 서버에는 현재 OpenAPI 계약대로 항상 1024×1024 PNG를 요청한다. 외부 응답의
식별자, MIME, Base64, 실제 파일 시그니처, 해상도와 크기를 검증한다. 이후
`FOOD_IMAGE_FORMAT=webp`이면 백엔드에서 512×512 WebP로 변환·압축해 저장하고,
`png`이면 검증한 원본 PNG를 저장한다.
서버 오류나 검증 실패는 캐시를 `failed`로 표시하지만 식단 생성 자체는 유지한다.
비밀키와 Base64 본문은 로그에 기록하지 않는다.
