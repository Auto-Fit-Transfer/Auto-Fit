# Backend 후속 작업: 공식 Recipe 유사 매칭 보정

> 작성일: 2026-11-03
> 대상: Auto-Fit Backend 개발자
> 관련 API: `POST /recommend/diet/recipe`
> AI 코드 기준 커밋: `1134328`

## 1. 결론

AI Server에서 공식 Recipe 이름 유사 매칭을 보수적으로 변경했다.

- Recipe 요청 DTO 변경 없음
- Recipe 응답 DTO 변경 없음
- `recipe_source` enum 변경 없음
- 공식 exact 우선 정책 유지
- 검증되지 않은 포함 관계는 LLM fallback으로 전환

Backend 코드에서 API DTO를 변경할 필요는 없지만, 기존에 저장된 잘못된
`official_similar` 결과는 재검증 또는 삭제 후 다시 생성해야 한다.

## 2. Backend 데이터 정리 대상

최소한 다음 매핑이 저장됐는지 확인한다.

| 요청 음식 | 잘못 연결된 공식 메뉴 |
|---|---|
| 그릭요거트 | 당근&그릭요거트 케이크 |
| 현미밥 | 무 현미밥 |
| 비빔밥 | 채소비빔밥 |
| 김치찌개 | 완자김치찌개 |
| 된장찌개 | 부대된장찌개 |
| 닭가슴살 샐러드 | 퀴노아닭가슴살샐러드 |

위 조합은 삭제하거나 무효화한 뒤 수정된 AI Server에 다시 요청한다.

특정 테이블명이나 SQL은 Backend 저장 구조를 확인하지 않은 상태에서 임의로
작성하지 않는다. 다음 응답 필드를 기준으로 대상을 식별한다.

```text
food_name
recipe_source=official_similar
matched_recipe_name
match_score
```

가능하면 기존 `official_similar` 저장 결과 전체를 새 AI 규칙으로 재검증하고,
통과하지 못한 항목만 무효화한다. 정상 사례인
`톳나물_두부 → 톳나물 두부무침`은 유지해야 한다.

## 3. 배포 후 확인 시나리오

수정된 AI Server 배포 후 다음을 확인한다.

| 요청 음식 | 기대 결과 |
|---|---|
| 톳나물_두부 | `official_similar`, 톳나물 두부무침 |
| 공식 메뉴명과 완전 일치하는 음식 | `official_exact` |
| 위 6개 오매칭 사례 | 해당 공식 후보와 연결되지 않음 |

오매칭 후보가 거부된 뒤 결과는 상황에 따라 `llm_generated` 또는
`unavailable`일 수 있다. Backend가 이를 다시 `official_similar`로 변환하면 안 된다.

## 4. 저장 및 화면 처리

- `official_exact`: 기존과 동일하게 공식 Recipe로 저장
- `official_similar`: `matched_recipe_name`과 `match_score`를 함께 저장
- `llm_generated`: AI 생성 Recipe로 구분하여 저장·표시
- `unavailable`: Recipe 없음 상태로 저장하고 공식 Recipe를 임의 연결하지 않음

AI Server 재배포 시 프로세스 메모리 cache는 초기화되지만 Backend DB에 이미
저장된 결과는 자동으로 삭제되지 않는다.

## 5. 러닝 강도 전달

Frontend의 `intensity`를 AI Server의 `desired_difficulty`로 전달할 때 다음처럼
변환한다.

```text
light    → easy
moderate → moderate
hard     → hard
```

`desired_difficulty`는 거리 허용 범위를 바꾸지 않고, 같은 거리 후보의 보조 정렬에
사용한다.

## 6. Backend 완료 기준

- 잘못 저장된 6개 매핑이 제거 또는 무효화됨
- 기존 `official_similar` 저장 결과가 새 규칙으로 재검증됨
- 정상 `톳나물_두부` 매칭이 유지됨
- 잘못된 포함 관계가 다시 저장되지 않음
- `llm_generated`와 `unavailable`을 기존 계약대로 처리함
- 러닝 `intensity → desired_difficulty` 매핑이 적용됨
