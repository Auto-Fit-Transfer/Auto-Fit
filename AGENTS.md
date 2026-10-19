# Auto-Fit Codex Development Guide

## 1. 프로젝트 개요

Auto-Fit은 사용자의 체성분 및 건강 상태를 바탕으로
개인 맞춤형 식단과 운동 정보를 제공하는 헬스케어 AI 서비스다.

Frontend:
- React Native

Backend / AI Server:
- Windows 10 / 11
- Python 3.12
- FastAPI
- Pydantic
- OpenAI API
- LangGraph
- RAG

주요 기능:
- 체성분 / 건강 상태 분석
- 개인 맞춤형 주간 식단 추천
- 공식 음식 DB 기반 영양정보
- 식품의약품안전처 식품안전나라 공식 레시피 연동
- 공식 레시피 exact / similar 검색
- 공식 레시피가 없는 경우 LLM recipe fallback
- 알레르기 및 기피 음식 안전 검사
- 지역 특산물 기반 식단 개인화
- 운동 추천
- 챗봇
- OCR
- 향후 음식 이미지 분석 모델


# 2. 가장 중요한 개발 원칙

기존 코드를 수정하기 전에 반드시 현재 구현과 호출 관계를 먼저 확인한다.

기존 기능이 이미 존재한다면 같은 기능을 수행하는 새로운 Service,
Schema, Repository, Utility를 임의로 추가하지 않는다.

기존 정상 동작 기능을 보존하는 것을 최우선으로 한다.

서비스 이름만 보고 역할을 추측하지 말고 실제 import와 호출 관계를 추적한다.

코드 수정 전 다음을 확인한다.

1. 누가 이 파일을 import하는가
2. 이 파일이 누구를 import하는가
3. 해당 클래스/함수를 실제로 호출하는 Router 또는 Service는 무엇인가
4. 관련 Pydantic Schema는 무엇인가
5. 관련 테스트가 이미 존재하는가


# 3. 코드 수정 규칙

사용자는 수정된 코드의 일부 snippet보다
"수정된 파일 전체 코드"를 선호한다.

Codex가 실제 repository를 수정할 수 있는 경우에는
파일 전체를 직접 수정하면 된다.

작업 완료 시 반드시 다음을 설명한다.

- 수정된 파일
- 수정 이유
- 기존 동작에 미치는 영향
- 실행한 테스트
- 테스트 결과
- 아직 남아 있는 작업

부분적으로 임시 patch를 누적해서
한 파일 안에 동일 책임의 구현이 여러 개 생기지 않도록 한다.

불필요한 대규모 리팩터링은 피한다.

현재 기능 수정과 관계없는 파일은 가급적 변경하지 않는다.


# 4. 삭제 규칙

파일을 임의로 삭제하지 않는다.

특히 아래 종류의 파일은 먼저 사용 여부를 검색한 후 삭제 여부를 판단한다.

- 기존 Service
- Schema
- Router
- 테스트 파일
- RAG 관련 코드
- Food DB 관련 코드
- Recipe 관련 코드

사용되지 않는 코드로 판단되더라도 바로 삭제하지 말고
먼저 사용자에게 삭제 후보와 근거를 알려준다.

`.env` 또는 API Key가 포함된 파일의 내용을 출력하거나 커밋하지 않는다.


# 5. 현재 주요 아키텍처

전체적인 의도는 다음과 같다.

Frontend (React Native)
        |
        v
FastAPI Router
        |
        +------------------------------+
        |                              |
        v                              v
Diet Recommendation              Recipe API
        |                              |
        v                              v
DietRecommendationService       MealRecipeService
        |                              |
        v                              +----------------------+
FoodCatalogService                     |                      |
                                       v                      v
                                RecipeService              OpenAI
                                공식 API 전용             LLM fallback


# 6. DietRecommendationService 역할

주요 파일:

app/services/diet_recommendation_service.py

이 파일은 현재 프로젝트에서 매우 중요한 파일이다.

담당 역할:

- 공식 음식 DB 로딩
- 추천 가능한 음식 필터링
- 사용자 알레르기 필터링
- 사용자 기피 음식 필터링
- 건강 상태 반영
- 한 끼 영양 목표 반영
- 지역 특산물 반영
- 식사 후보 조합 생성
- 간식 후보 생성
- 주간 메뉴 다양성 제어
- 메뉴 family 반복 제한
- 주간 스케줄 생성
- RAG 건강 가이드라인 사용
- OpenAI를 이용한 menu_description / guidance 생성
- 공식 DB 기반 영양값 재검증

중요:

DietRecommendationService에서 레시피를 직접 생성하지 않는다.

레시피는 별도의 Recipe Pipeline에서 처리한다.

현재 식단 생성 LLM은 메뉴 자체를 임의 생성하는 역할보다
서버가 선택한 검증 메뉴에 대한 설명 및 guidance 생성 역할을 한다.


# 7. 추천 메뉴 영양정보 정책

사용자에게 필요한 영양정보는
"각 추천 메뉴 전체 기준"이다.

반드시 유지해야 하는 값:

- calories_kcal
- carbohydrate_g
- protein_g
- fat_g

재료 하나하나에 대해서는 다음 값을 계산하거나 제공할 필요가 없다.

- 재료별 calories
- 재료별 carbohydrate
- 재료별 protein
- 재료별 fat

예:

추천 메뉴:
톳나물 두부무침

메뉴 전체 영양정보:
- calories_kcal
- carbohydrate_g
- protein_g
- fat_g

재료:
- 톳나물 21g
- 두부 56g
- 천일염 0.14g

재료별 탄수화물/단백질/지방/칼로리는 필요 없다.


# 8. RecipeService 역할

주요 파일:

app/services/recipe_service.py

RecipeService는 식품의약품안전처 식품안전나라
공식 레시피 API 접근 전용 Service다.

주요 책임:

- COOKRCP01 API 호출
- search_recipes_by_name()
- 공식 API 응답 row 추출
- 공식 레시피 데이터 정규화
- 공식 레시피 raw 데이터를 Auto-Fit 내부 dict 형태로 변환

RecipeService에서 하지 말아야 할 일:

- LLM fallback
- recipe similarity 정책 결정
- 사용자 알레르기 정책 결정
- 사용자 기피 음식 정책 결정
- 식단 추천 생성

이 책임들은 MealRecipeService 쪽에 둔다.


# 9. MealRecipeService 역할

주요 파일:

app/services/meal_recipe_service.py

MealRecipeService가 Recipe Pipeline의 핵심 orchestration을 담당한다.

처리 우선순위:

1. official_exact
2. official_similar
3. llm_generated
4. unavailable

구조:

food_name
    |
    v
검색어 확장
    |
    v
RecipeService
    |
    v
식품안전나라 공식 레시피 검색
    |
    +-- exact match
    |
    +-- sufficiently similar match
    |
    +-- no acceptable result
             |
             v
          OpenAI
             |
             v
        LLM fallback

MealRecipeService의 주요 책임:

- 음식명 정규화
- 공식 레시피 검색어 확장
- 공식 레시피 이름 유사도 계산
- official_exact 판정
- official_similar 판정
- 알레르기 / 기피 음식 검사
- 공식 레시피가 없을 때 LLM fallback
- LLM 생성 결과 안전성 재검사
- 동일 요청 cache
- concurrent duplicate request 방지
- 최종 Recipe Response 조립


# 10. 공식 레시피 유사도 정책

현재 MealRecipeService에는 공식 유사 레시피 판정을 위한
threshold가 존재한다.

기존 동작을 함부로 변경하지 않는다.

현재 검증 사례:

food_name:
톳나물_두부

공식 레시피:
톳나물 두부무침

결과:
official_similar

과거 테스트에서 유사도 약:
0.9157

이 동작은 regression이 발생하지 않도록 보존해야 한다.


# 11. 공식 Recipe API 검증 상태

식품안전나라 API는 실제 호출이 정상 동작하는 것을 확인했다.

확인된 예:

검색:
톳나물

결과:

recipe_id:
2975

menu_name:
톳나물 두부무침

serving_weight:
50.0

ingredients_text:
톳나물 15g,
두부 40g,
천일염 0.1g,
참깨 0.1g,
참기름 0.1g,
마늘 0.1g

steps도 정상 반환됨.

image_small / image_large도 정상 반환됨.

source:
식품의약품안전처 식품안전나라


# 12. LLM Recipe Fallback 검증 상태

MealRecipeService의 OpenAI fallback도 실제 호출이 되는 것을 확인했다.

공식 레시피를 찾지 못하면:

recipe_source:
llm_generated

official_recipe:
false

matched_recipe_name:
null

match_score:
null

형태로 반환한다.

생성 후 알레르기 / 기피 음식 안전검사를 수행한다.

필요한 경우 최대 2회까지 재생성하는 기존 구조가 존재한다.

이 로직을 중복 구현하지 않는다.


# 13. llm_recipe_service.py 주의사항

프로젝트에 다음 파일이 존재할 수 있다.

app/services/llm_recipe_service.py

하지만 현재 MealRecipeService 내부에 이미
OpenAI Structured Output 기반 recipe fallback이 구현되어 있다.

따라서 llm_recipe_service.py를 현재 Pipeline에
추가로 연결하지 않는다.

향후 전체 Recipe architecture를 명확히 refactor하기 전까지는
중복 기능으로 취급한다.

단, 바로 삭제하지 않는다.

사용 여부를 전체 검색한 뒤 정리 단계에서 결정한다.


# 14. Recipe Ingredient 목표 구조

최종적으로 Recipe 재료는 단순 문자열이 아니라
구조화된 형태를 사용한다.

목표:

{
    "name": "두부",
    "amount_g": 56.0
}

예:

"ingredients": [
    {
        "name": "톳나물",
        "amount_g": 21.0
    },
    {
        "name": "두부",
        "amount_g": 56.0
    },
    {
        "name": "천일염",
        "amount_g": 0.14
    }
]

재료별 영양정보는 추가하지 않는다.


# 15. 공식 레시피 Ingredient 처리 정책

공식 Recipe API는 RCP_PARTS_DTLS /
ingredients_text에서 다음과 같은 정보를 제공한다.

예:

톳나물 15g,
두부 40g,
천일염 0.1g

가능한 경우 다음 형태로 parsing한다.

{
    "name": "톳나물",
    "amount_g": 15.0
}

추천 음식 portion과 공식 recipe serving weight가 다른 경우
필요하다면 ratio를 적용할 수 있다.

예:

공식 serving_weight:
50g

Auto-Fit 추천 portion:
70g

ratio:

70 / 50 = 1.4

공식 두부:
40g

추천 portion 기준:

40 * 1.4 = 56g

단, 단위 또는 원본 데이터가 불명확한 경우
무리하게 값을 만들어내지 않는다.


# 16. LLM Recipe Ingredient 정책

LLM fallback에서 재료를 생성할 경우에도
동일한 구조를 목표로 한다.

{
    "name": string,
    "amount_g": float | null
}

LLM이 재료량을 생성할 때 다음 원칙을 지킨다.

- 현실적인 가정식 기준
- 사용자 알레르기 제외
- 기피 음식 제외
- 음식명과 크게 벗어나지 않는 구성
- 과도한 정밀 수치 생성 금지
- 재료별 영양성분 생성 금지

물처럼 조리 과정에서 흡수/증발되는 재료가 있기 때문에
재료 amount_g 합계가 완성 음식 portion_g와
반드시 같을 필요는 없다.


# 17. Recipe Schema

주요 파일:

app/schemas/recommendation.py

현재 Diet Recipe 관련 Schema가 이미 존재한다.

주요 Schema:

- DietRecipeItemRequest
- DietRecipeRequest
- DietRecipeDetail
- DietRecipeItemResult
- DietRecipeMealResult
- DietRecipeResponse

recipe_source는 다음 상태를 사용한다.

- official_exact
- official_similar
- llm_generated
- unavailable

새로운 Recipe Schema를 다른 파일에 중복으로 만들지 않는다.


# 18. Router Schema 중복 방지

Router에서 Recipe Request / Response Schema를
별도로 다시 정의하지 않는다.

app/schemas/recommendation.py의 Schema를 import하여 사용한다.

Schema의 single source of truth를 유지한다.


# 19. Diet Recommendation과 Recipe의 연결

현재 중요한 향후 작업 중 하나다.

DietRecommendationService 내부에는 실제 식사 후보의
개별 음식 item과 portion 정보가 존재한다.

하지만 최종 주간 식단 Response에서는 일부 정보가
menu_name 중심으로 축약될 수 있다.

향후 Frontend에서 추천 메뉴를 선택하고
Recipe API를 호출할 수 있도록
실제 식단을 구성한 item 정보를 보존해야 한다.

Recipe API에는 다음 정보가 전달될 수 있어야 한다.

- food_name
- portion_g
- calories_kcal
- protein_g
- fat_g
- carbohydrate_g

중요:

portion_g는 내부 계산 및 recipe scaling에 사용할 수 있지만
Frontend에서 반드시 사용자에게 보여줄 필요는 없다.

Frontend에서는 완성 음식 중량보다
Recipe 재료별 중량을 보여주는 방향을 우선한다.


# 20. FoodCatalogService

식단의 칼로리 및 탄단지 계산은
공식 Food DB 기반 값을 우선한다.

LLM이 추천 메뉴의 칼로리와 탄단지를 임의 생성하도록 하지 않는다.

LLM이 생성 결과에서 영양값을 변경하더라도
서버가 검증된 Food DB 값을 다시 적용하는 기존 정책을 유지한다.


# 21. 알레르기와 기피 음식

두 값을 구분한다.

food_allergens:
안전성 우선

disliked_foods:
사용자 선호 기반 제외

Recipe의 공식/LLM 결과 모두에 적용한다.

알레르기의 경우 단순한 이름뿐 아니라
기존 ALLERGY_KEYWORD_MAP에 존재하는 파생 키워드도 고려한다.

관련 기존 로직을 우회하지 않는다.


# 22. RAG 정책

건강 관련 설명 및 guidance에는
프로젝트에서 구축한 검증된 RAG context를 우선한다.

RAG에 존재하지 않는 기관 또는 출처를
LLM이 임의로 만들어내지 않도록 한다.

의료적 진단이나 치료 처방을 생성하지 않는다.

건강 상태는 실제 입력된 metric_statuses를 기반으로 한다.

제공되지 않은 건강 수치를 추측하지 않는다.


# 23. OpenAI 호출 정책

현재 프로젝트에서는 AsyncOpenAI를 사용하며
Structured Output이 필요한 곳에서는 주로 다음 패턴을 사용한다.

client.responses.parse(...)

이미 정상 동작하는 호출 방식을
별도의 임의 wrapper로 교체하지 않는다.

비용과 latency를 고려하여
필요하지 않은 중복 LLM 호출을 만들지 않는다.


# 24. 테스트 정책

코드를 수정할 때 관련 테스트를 반드시 확인한다.

현재 repository에는 식단/Recipe/Food 관련 테스트 파일들이 존재한다.

기존 테스트 파일을 임의로 삭제하지 않는다.

기능이 중복된 테스트라 하더라도
정리하기 전에 어떤 기능을 검증하는 테스트인지 확인한다.

특히 아래 영역에 대한 regression 테스트가 중요하다.

- Recipe API direct call
- Recipe query expansion
- official similar matching
- LLM fallback
- Diet Recipe Schema
- Food Catalog
- weekly diet schedule
- weekly candidate diversity
- local specialty
- no refrigerator mode
- diet e2e

테스트 결과가 실패하면
기존 테스트 자체를 단순히 삭제하거나 완화해서 통과시키지 않는다.

먼저 코드 regression 여부를 확인한다.


# 25. Windows 개발 환경

주 개발 환경은 Windows 10 / Windows 11이다.

Python:
3.12 계열

PowerShell을 주로 사용한다.

한글 테스트 데이터가 존재하므로
UTF-8 encoding을 유지한다.

테스트 Script 또는 파일 저장 encoding은 UTF-8을 사용한다.

PowerShell inline pipe를 이용한 Python 실행에서
한글이 ??? 형태로 깨질 수 있으므로
복잡한 한글 테스트는 .py 파일로 실행하는 것을 선호한다.


# 26. 보안

절대 출력하거나 commit하지 말아야 할 것:

- OPENAI_API_KEY
- 식품안전나라 API Key
- DB Password
- JWT Secret
- 기타 Token
- 실제 사용자 개인정보

`.env` 파일을 수정할 필요가 있으면
key 이름만 설명하고 실제 secret 값은 출력하지 않는다.


# 27. 현재 검증 완료 상태

현재까지 확인된 내용:

- FastAPI 프로젝트 정상 실행 경험 있음
- 공식 Food DB 기반 Diet Recommendation 구현됨
- 주간 Diet 다양성 로직 구현됨
- RAG 연결 존재
- 지역 특산물 로직 존재
- Recipe Schema 존재
- 식품안전나라 Recipe API 정상 호출
- RecipeService 공식 API 기능 복구 완료
- MealRecipeService official search 동작
- MealRecipeService LLM fallback 동작
- Recipe safety 검사 존재
- 공식 Recipe ingredients_text에 실제 g 값 존재
- 메뉴 전체 calories / carbohydrate / protein / fat 사용 방향 확정


# 28. 현재 우선순위

현재 Recipe Pipeline을 먼저 완성한다.

우선 순서:

1. 현재 repository 상태 전체 audit
2. RecipeService / MealRecipeService 연결 확인
3. Recipe Schema 중복 여부 확인
4. 공식 recipe ingredient를 name + amount_g로 구조화
5. LLM fallback ingredient도 name + amount_g로 구조화
6. 추천 메뉴 전체 칼로리 / 탄단지 보존
7. 주간 Diet 결과에서 개별 Food item 정보 보존
8. Frontend에서 Recipe API를 호출할 수 있는 데이터 구조 완성
9. 통합 테스트
10. 사용되지 않는 Recipe 관련 중복 Service 정리


# 29. 향후 전체 프로젝트 우선순위

프로젝트 전체 기능 우선순위는 다음 방향을 참고한다.

- 챗봇
- 체성분 분석
- LLM / RAG
- 음식 이미지 분석 모델

단, 현재 진행 중인 Recipe / Diet Pipeline을
중간에 방치하지 말고 안정화한 뒤 다음 기능으로 넘어간다.


# 30. 작업 시작 시 Codex 행동 규칙

새 작업을 시작하면 바로 코드를 수정하지 않는다.

먼저 repository를 확인하고 아래를 짧게 보고한다.

현재 호출 흐름:
Router → Service → External Service / DB → Schema

관련 파일:
...

현재 구현:
...

문제점:
...

수정 예정 파일:
...

테스트 예정:
...

그 후 필요한 코드를 수정한다.

명백하게 해결 가능한 경우 불필요하게 사용자에게
파일 위치나 코드를 다시 요청하지 않는다.

Codex가 repository에 접근할 수 있으므로
직접 검색하고 확인한다.

다만 요구사항 또는 설계 결정이 불명확하여
잘못된 구현 가능성이 큰 경우에만 질문한다.


# 31. 완료 기준

작업 완료는 단순히 코드가 작성된 상태가 아니다.

최소한 다음이 만족되어야 한다.

- import 오류 없음
- syntax 오류 없음
- 기존 핵심 기능 유지
- 관련 테스트 실행
- 신규 기능 테스트 성공
- API Response Schema 검증 성공
- 기존 official recipe matching regression 없음
- LLM fallback regression 없음
- 알레르기 safety regression 없음

테스트할 수 없는 부분이 있다면
성공했다고 가정하지 말고 명확히 알려준다.