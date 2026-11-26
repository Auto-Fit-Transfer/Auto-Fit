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
- KDRI 2025 기반 영양 목표
- 일반식 / 건강식 메뉴 스타일 개인화
- 한 끼 재추천 및 내일 네 끼 변경안
- 식품의약품안전처 식품안전나라 공식 레시피 연동
- 공식 레시피 exact / similar 검색
- 공식 레시피가 없는 경우 LLM recipe fallback
- 알레르기 및 기피 음식 안전 검사
- 지역 특산물 기반 식단 개인화
- 구매 운동 카탈로그 기반 운동 추천
- 운동 완료 결과 분석
- Kakao / 공공데이터 / 두루누비 기반 러닝 추천
- MediaPipe 기반 운동 자세 분석
- 음식 사진 인식 및 공식 Food DB 영양 재계산
- 건강점수 / 건강 리포트 / RAG
- 개인화 챗봇 및 확인형 action orchestration


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

전체적인 의도는 다음과 같다. Frontend는 AI Server를 직접 호출하지 않고,
Backend가 인증, 사용자 상태 조립, 저장, transaction을 담당한다.

Frontend (React Native)
        |
        v
Backend API
인증 / DB / Supabase / 사용자 상태 / 저장
        |
        v
AI Server FastAPI Router
        |
        +----------------+----------------+----------------+
        |                |                |                |
        v                v                v                v
Diet / Recipe       Exercise /       Chat / Health    Food Image
                    Posture / Running  RAG / LangGraph
        |                |                |                |
        +----------------+----------------+----------------+
                         |
                         v
        공식 Food DB / 식품안전나라 / 공공데이터 / Kakao /
        두루누비 / MediaPipe / OpenAI

AI Server는 사용자 DB를 직접 수정하지 않는다.

- AI Server: 검증, 분석, 추천, 구조화 응답 생성
- Backend: 인증, 최신 사용자 데이터 전달, 응답 재검증, 저장, 버전 충돌,
  pending action, 원자적 transaction
- Frontend: 사용자 입력, 선택, 확인, 표시


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

현재 구현은 주간 식단의 실제 음식 item과 portion 정보를 보존하고,
사용자가 특정 한 끼의 레시피를 요청할 때 기존 Recipe API로 전달한다.

식단 생성과 Recipe 조회는 분리한다. 주간 식단 생성 시 28끼의
레시피를 일괄 생성하지 않고, 사용자가 레시피 보기를 선택했을 때
`POST /recommend/diet/recipe`를 호출한다.

식단과 Recipe 연결에서 다음 정보를 계속 보존한다.

- food_name
- portion_g
- calories_kcal
- protein_g
- fat_g
- carbohydrate_g

가능한 경우 공식 Food 식별자인 `food_code`, `data_code`,
`source_name`도 optional 값으로 보존한다.

중요:

portion_g는 내부 계산 및 recipe scaling에 사용할 수 있지만
Frontend에서 반드시 사용자에게 보여줄 필요는 없다.

Frontend에서는 완성 음식 중량보다
Recipe 재료별 중량을 보여주는 방향을 우선한다.

Backend가 AI 응답을 저장할 때 item 상세값을 menu_name만 남기고
축약하지 않도록 계약 문서와 실제 DTO를 함께 확인한다.


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

추천 후보 로그에는 건강상태, 건강목표 원문, 알레르기·기피 음식, 위치,
사용자 입력 또는 전체 metadata를 남기지 않는다. 운영에 필요한 후보 수,
target source, 메뉴 스타일, 정책 코드처럼 명시적으로 허용한 값만 기록한다.


# 27. 현재 검증 완료 상태

현재까지 확인된 내용:

- FastAPI Router와 Backend Bearer 인증 계약 존재
- 공식 Food DB 기반 7일 28끼 식단과 주간 다양성 구현
- KDRI 2025, 건강목표, 지역 특산물, 메뉴 스타일 반영
- 한 끼 재추천 및 내일 네 끼 전체 변경안 구현
- 추천 Food item의 중량, 열량, 탄단지, optional 공식 식별자 보존
- Recipe `official_exact → official_similar → llm_generated → unavailable` 구현
- 구조화 Recipe ingredient `name + amount_g` 구현
- Recipe 알레르기 / 기피 음식 안전검사와 관측 지표 존재
- 구매 GIF 카탈로그로 제한한 운동 추천과 `body_regions` 구현
- 운동 완료 결과 분석 구현
- Kakao / 공공데이터 / 두루누비 러닝 경로 계약 구현
- 챗봇 persona, intent, pending action, 운동 중 안전 중단 흐름 구현
- MediaPipe 자세 분석과 구조화 실패 코드 구현
- 음식 사진 분석과 공식 Food DB 영양 재계산 구현
- 건강분석, 건강점수, RAG / LangGraph 연결 존재

위 목록은 코드가 존재한다는 의미다. 실제 운영 배포, 외부 Provider 키,
Frontend → Backend → AI E2E 완료 여부는 매 작업 시 다시 확인한다.


# 28. 현재 우선순위

기능의 기본 구현보다 계약 안정화와 실제 통합 검증을 우선한다.

작업 시작 시 `docs/ai_server_update_handoff.md`의 최신 항목과 실제
Backend / Frontend 원격 코드를 다시 확인한 뒤 순서를 조정한다.

기본 우선 순서:

1. 기존 기능 회귀 방지와 OpenAPI 계약 일치
2. Backend 저장 / 조회 / 원자적 적용 계약 연결
3. Frontend → Backend → AI Server E2E
4. 식단 KDRI / 메뉴 스타일 저장·전달 및 내일 네 끼 변경 적용
5. 챗봇 pending action 확인·취소·적용 연결
6. 자세 분석 experimental 종목의 실제 영상 검증
7. 러닝 Provider / GPS / 지도 경로 실기기 검증
8. 음식 사진 사용자 수정·확정·저장 흐름 검증
9. 비용, latency, 동시 요청, 장애 fallback 검증


# 29. 향후 전체 프로젝트 우선순위

프로젝트 방향은 "검증된 데이터 + 결정론적 안전 규칙 + 필요한 곳에만
LLM"이다.

- 영양, 운동 카탈로그, 점수, 안전 판정은 가능한 한 공식 데이터와
  Rule Engine으로 결정한다.
- LLM은 설명, 요약, 자연어 상호작용, 검증 후보 조립을 보조한다.
- LLM이 공식 영양값, 운동 부위, 건강점수, 실제 경로를 임의 생성하지 않는다.
- 사용자 상태 변경은 항상 확인 가능한 action으로 제안하고 Backend가 적용한다.
- 의료 진단, 치료 처방, 확인되지 않은 건강 수치 추측은 하지 않는다.
- 기능 수를 늘리는 것보다 E2E, 안전성, 관측성, 비용 통제를 우선한다.


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


# 32. Repository 범위와 브랜치 소유권

공식 저장소:

`https://github.com/Auto-Fit-Transfer/Auto-Fit.git`

이 작업공간에서 수정·커밋·푸시할 대상은 AI Server뿐이다.

- 로컬 작업 브랜치: `ai`
- 원격 작업 브랜치: `origin/ai`
- 읽기 전용 참고 브랜치: `origin/back-end`, `origin/renewal-a`, `origin/ocr`

`back-end`가 현재 Backend 브랜치 이름이다. 과거 이름 또는 다른 ref인
`backend`와 혼동하지 않는다.

Backend, Frontend, OCR 코드는 비교·검색·계약 확인에만 사용한다.
이 작업공간에서 해당 브랜치 파일을 수정, stage, commit, push하지 않는다.
다른 담당자의 수정이 필요하면 Markdown 계약 문서로 전달한다.

커밋 또는 푸시 전에 반드시 사용자에게 다음을 먼저 확인한다.

1. 작업할 로컬 절대 경로
2. 로컬 브랜치
3. 원격 브랜치 / remote
4. 포함할 파일 목록

승인 후에도 `git add .` 또는 광범위한 glob을 사용하지 않는다.
대상 파일을 명시적으로 stage하고 아래를 확인한다.

- `git diff --cached --name-status`
- `git diff --cached --check`
- `git status --short --branch`

사용자가 만든 미추적 파일, audit 디렉터리, 발표자료, 임시 산출물은
명시적 승인 없이 stage하거나 삭제하지 않는다.

파일을 repository의 공식 구현으로 판단하기 전에 필요하면 다음으로
Git 추적 여부를 확인한다.

```powershell
git ls-files --error-unmatch "app/path/to/file.py"
```

예시 경로를 실제 확인할 파일 경로로 바꿔 실행한다.

미추적 legacy / 임시 파일은 실행 import와 호출 관계를 확인하기 전까지
공식 source of truth로 사용하지 않는다.


# 33. 새 로컬 환경에서 작업 재개

새 환경의 Codex는 대화 기억을 가정하지 않고 다음 순서로 시작한다.

```powershell
git clone https://github.com/Auto-Fit-Transfer/Auto-Fit.git
cd Auto-Fit
git fetch origin
$aiBranch = git branch --list ai
if ($aiBranch) {
    git switch ai
} else {
    git switch --track origin/ai
}
git pull --ff-only origin ai
git status --short --branch
git rev-list --left-right --count HEAD...origin/ai
```

그 다음 반드시 다음을 수행한다.

1. 루트 `AGENTS.md`를 처음부터 끝까지 읽는다.
2. `docs/ai_server_update_handoff.md`의 최신 항목을 확인한다.
3. `docs/backend_ai_integration_spec.md`와 `docs/ai-openapi.json`을 확인한다.
4. 작업 대상의 Router → Schema → Service → Test import / 호출 흐름을 찾는다.
5. 필요하면 `origin/back-end`, `origin/renewal-a`, `origin/ocr`를 fetch하고
   `git show`, `git grep` 등 읽기 전용 방식으로 비교한다.

Windows / Python 환경 기본 준비:

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m pip install pytest pytest-asyncio
if (-not (Test-Path -LiteralPath .env)) {
    Copy-Item -LiteralPath .env.example -Destination .env
}
```

`.env`의 실제 값은 사용자 또는 서버 관리자에게 안전한 경로로 전달받는다.
기존 PC의 `.env`를 Git으로 복구할 수 있다고 가정하지 않는다.

개발 서버 실행 예:

```powershell
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8001
```

Git clone으로 복구되지 않는 항목:

- `.env`
- `data/chroma/`
- `data/rag_sources/`
- `data/external_source_data/`
- `app/models/**/*.task`, `*.pkl`, `*.pt`, `*.pth`

자세 모델은 `app/scripts/download_pose_model.py`, RAG 자료는
`fetch_registered_sources.py`, `fetch_pdf_sources.py`,
`ingest_registered_sources.py`의 실제 동작을 먼저 확인한 후 준비한다.
모델 checksum과 version을 검증하지 않은 임의 파일로 대체하지 않는다.


# 34. Source of Truth와 문서 우선순위

로컬 개발 중 충돌이 있으면 다음 순서로 사실을 확인한다.

1. 현재 checkout된 실행 코드와 Pydantic Schema
2. 관련 테스트
3. 로컬 `app.openapi()`
4. `docs/ai-openapi.json`
5. `docs/backend_ai_integration_spec.md`
6. 기능별 계약 문서
7. `docs/ai_server_update_handoff.md`의 날짜별 이력

운영 장애 또는 E2E를 확인할 때는 다음 순서로 본다.

1. 배포 서버 `/health`, `/openapi.json`, 같은 시각의 로그
2. 실제 배포 커밋
3. 해당 커밋의 실행 코드와 테스트

로컬 최신 계약과 배포 계약이 같다고 가정하지 않는다.
배포 상태는 문서에 적힌 과거 커밋만 보고 판단하지 않는다.

특정 커밋 해시, 테스트 통과 개수, 배포 시각은 변동 정보다.
영구 규칙처럼 `AGENTS.md`에 고정하지 않는다.


# 35. AI Server / Backend / Frontend 책임 경계

AI Server 책임:

- 입력 Schema 검증
- 공식 데이터와 Rule Engine 기반 분석 / 추천
- 필요한 범위의 OpenAI / RAG 호출
- 구조화된 응답과 안전 상태 반환
- 외부 Provider 장애의 명확한 4xx / 5xx 구분

Backend 책임:

- 사용자 인증과 권한
- 사용자 프로필, 알레르기, 건강자료, 저장 식단 / 운동 조회
- AI 요청 context 조립
- AI 응답 재검증
- Supabase / DB 저장
- version conflict, quota, pending action, 확인 / 취소
- 여러 레코드 변경의 원자적 transaction과 rollback

Frontend 책임:

- 위치, 사진, 영상, 선택값 입력
- AI 제안과 가정값 표시
- 사용자 확인 / 수정 / 취소 UI
- Backend API 호출과 오류 안내

Frontend가 AI Server Bearer Key를 보유하거나 AI Server를 직접 호출하는
구조로 변경하지 않는다. AI Server가 Backend DB를 직접 수정하지 않는다.


# 36. 현재 기능 지도

실제 endpoint와 Schema는 `app/main.py`, 각 Router,
`docs/ai-openapi.json`을 기준으로 한다.

식단 / Recipe:

- `POST /recommend/diet`
- `POST /recommend/diet/replace-meal`
- `POST /recommend/diet/replace-day`
- `POST /recommend/diet/recipe`
- 주요 Service: `diet_recommendation_service.py`,
  `food_catalog_service.py`, `kdri_nutrition_service.py`,
  `meal_recipe_service.py`, `recipe_service.py`

운동:

- `POST /recommend/exercise`
- `POST /analyze/exercise-session`
- 주요 Service: `exercise_catalog_service.py`,
  `exercise_recommendation_service.py`,
  `exercise_session_analysis_service.py`

자세 분석:

- `GET /posture-analysis/capabilities`
- `POST /posture-analysis/analyze`
- 주요 Service: `posture_analysis_service.py`

러닝:

- `GET /running/places/search`
- `GET /running/courses/recommend`
- `GET /running/courses/{course_id}`
- `POST /running/routes/preview`
- `POST /running/routes/generate-loop`
- `POST /running/session/recommend`

챗봇:

- `POST /chat`: 기존 Backend 호환 경로
- `POST /chat/orchestrate`: context / intent / action 경로
- `POST /chat/intent-test`: 개발용 분류 확인

음식 사진:

- `POST /food-analysis/analyze`
- `POST /food-analysis/recalculate`

건강 / 분석:

- `POST /analysis`
- `POST /health-analysis`
- `POST /health-analysis/diet-refresh`
- `POST /ai/body-analysis`
- `GET /health` 및 기능별 health endpoint


# 37. 최신 식단 정책

KDRI:

- 기준 데이터: `data/nutrition_reference/kdri_2025_summary_ko.json`
- `nutrition_profile.age_years`는 KDRI 성인 기준인 19~120세만 허용한다.
- AI Server는 전달된 프로필의 연령 범위를 검증한다. 서비스 전체의 미성년자
  가입·프로필 수정·식단 생성 차단과 만 나이 계산은 Backend 책임이다.
- Backend는 미성년자의 `nutrition_profile`을 생략하여 기존 기본 목표로
  우회하지 않는다.
- 명시적 `meal_target`이 최우선이다.
- 없으면 유효한 `nutrition_profile + KDRI_2025`를 사용한다.
- 둘 다 없으면 기존 기본 목표를 유지한다.
- KDRI 집단 기준을 의료적 개인 처방으로 표현하지 않는다.

메뉴 스타일:

- `balanced`: 메인 식사 일반식 17 + 건강식 4
- `everyday`: 메인 식사 일반식 21
- `health_focused`: 메인 식사 건강식 21
- 간식 7끼는 스타일 비율에 포함하지 않는다.
- 필드 생략은 `balanced`다.
- 명시적 JSON `null`은 현재 AI Schema에서 422다. Backend 저장값이
  `null`이면 AI 요청 전에 필드를 생략하거나 `balanced`로 변환한다.

재추천:

- 일부 한 끼 변경은 `/recommend/diet/replace-meal`을 사용한다.
- 일반 한 끼 재추천은 `adjustment_policy`와
  `requested_calorie_reduction_kcal`을 생략하며 기존 동작을 유지한다.
- 사용자가 고른 끼니를 가볍게 조정할 때만
  `adjustment_policy="gentle_rebalance_v1"`을 사용한다. 이때 `meal_target`은
  낮춘 목표가 아니라 해당 슬롯의 원래 목표이며, 간식도 원래 간식 목표를
  전달한다.
- 선택형 완만한 보정은 요청 감소량을 원래 목표의 최대 15%까지만 반영하고,
  실제 후보를 원래 목표의 85~100% 범위로 엄격히 제한한다. 요청량보다 더
  많이 차감하지 않으며 범위 내 공식 후보가 없으면 범위 밖 후보로 대체하지
  않고 503을 반환한다.
- 선택형 보정 응답의 `adjustment`에는 기준 목표, 요청·허용·실제 감소량,
  미반영량, 선택 비율을 결정론적으로 기록한다.
- 85%·100% 경계와 `adjustment` 비율 계산은 반올림 전 원값으로 검증한다.
  Backend / Frontend 표시 형식 때문에 내부 기준값을 먼저 반올림하지 않는다.
- 오늘 과다 섭취 후 내일 네 끼 전체 변경안은
  `/recommend/diet/replace-day`를 사용한다.
- `/replace-day`의 85~100% 규칙은 네 끼 전체 후보의 soft priority이고,
  선택형 `/replace-meal`의 strict range와 혼동하지 않는다.
- 내일 네 끼 API는 제안만 반환한다. 사용자 확인과 네 끼 원자적 저장은
  Backend 책임이다.
- 여러 끼를 선택형 보정하는 경우도 AI Server는 슬롯별 미리보기만 반환한다.
  Backend가 사용자 확인 후 선택한 슬롯 전체를 원자적으로 저장한다.
- 최초 생성 당시의 영양 / 알레르기 / 목표 / 메뉴 스타일 snapshot을
  재추천에도 보존한다.

식단 메뉴와 영양은 공식 Food DB 후보에서 결정한다.
LLM은 검증된 메뉴의 설명과 guidance를 보조하며 영양값을 덮어쓰지 않는다.


# 38. 운동 추천과 자세 분석 정책

운동 추천:

- 추천 가능한 운동은 `data/exercise_assets/exercise_asset_catalog.csv`의
  활성 `exercise_key`로 제한한다.
- LLM이 CSV에 없는 운동명을 새로 만들지 않는다.
- `body_regions`는 카탈로그에서 결정하며 LLM이 추측하지 않는다.
- 강도 허용값은 `low`, `moderate`, `high`다.
- 각 `sessions[]`의 `exercises[].duration_minutes` 합계는 사용자 선택 시간
  이상, `min(선택 시간 + 5분, 200분)` 이하여야 한다.
- 장소, 장비, 컨디션, 불편 부위를 함께 반영한다.

운동 음성 안내 자료:

- 카탈로그의 `auto_mapped`와 추천 가능 상태는 원본 GIF를 대조한 안내 문구의
  검토 완료를 의미하지 않는다. 안내 TXT는 현재 추천 서비스가 읽는 입력이 아니다.
- 안내의 `[원본 동작 확인 필요]` 표시는 해당 `exercise_key`의 primary 자산을
  직접 확인한 뒤 그 항목에 한해서 해제한다. 이름만 보고 일괄 해제하지 않는다.
- 운동 방법·주의사항·집중 포인트를 세 문장으로 제공하고, 원본 영문명과
  식별키를 보존한다. 같은 키를 수록한 전체·헬스·홈트 자료를 일관되게 갱신한다.
- 원본 대조 기록은 검토한 자산과 checksum, 확인 범위를 남긴다. 구매 GIF 자체는
  별도 허가 없이 Git에 추가하지 않으며 자세 분석 `validated` 상태와 혼동하지 않는다.
- 문구 전달 후 실제 음성 안내 데이터 갱신과 앱 재생 확인은 담당 파트에서 수행한다.
  안내 파일의 Git 업로드만으로 운영 앱 반영 완료로 보고하지 않는다.
- 대조 결과는 `data/exercise_assets/exercise_guide_overrides.json`에서 관리하고,
  읽기용 자료는 `docs/exercise_guides/`에 둔다. 이 JSON은 전달용 자료이며 현재
  추천 API의 LLM `instructions`를 자동 교체하는 runtime 입력이 아니다.
- 같은 키의 primary GIF가 서로 다른 동작이면 `asset_specific_guides`로 분리하고,
  선택된 `asset_id`의 안내만 적용한다. 사용자 성별이나 파일명 유사도로 대신 고르지 않는다.
- `blocked_audio`는 확인할 수 없는 힘의 방향·접촉·동작이 남은 항목이다.
  안내 완료로 위장하거나 placeholder를 음성으로 재생하지 않는다. 기존 CSV 안내
  제외 항목도 유지하며, 새 원본/전문가 근거가 확보되면 그 항목만 다시 검토한다.
- 검토 근거의 `reviewed_frame_indices`는 실제 확인한 0-based 프레임만 기록한다.
  샘플 대조를 전체 프레임 검증 또는 개인별 운동 안전 인증으로 표현하지 않는다.
- Backend 안내 반영 시 기존 제외 목록을 먼저 적용한다. `blocked_audio` 또는
  자산 매칭 실패를 LLM `instructions`나 이전 음성 캐시로 우회하지 않도록
  인계서에 명시한다. JSON에 없는 키는 기존 검토 상태를 보존한다.
- 교정 자료의 `source_catalog_version`은 기존 runtime과 같은 LF 정규화 해시다.
  검토 당시 원본 바이트의 `source_catalog_sha256`과 구분해 Windows/Linux
  줄바꿈 차이를 내용 변경으로 오판하지 않도록 한다. GIF 해시는 원본 바이너리 기준이다.

운동 완료 분석:

- `/analyze/exercise-session`의 새 결과는 `summary`, `insights`,
  `next_session_adjustments`, `safety_notice`의 모든 문장을 자연스러운 해요체로
  생성한다. 목록 항목에도 적용하며 하십시오체·반말·명사형 종결을 섞지 않는다.
- 문체 변경으로 기록 근거, 의료 진단 금지, 필요한 운동 중단·상담 안내를
  약화하지 않는다. 필요하지 않은 `safety_notice`의 `null` 계약을 유지한다.
- 말투는 기존 생성 호출의 지침에서 지정한다. 별도 문체 변환 호출이나
  기존 저장 결과 일괄 변환을 추가하지 않는다. 기존 저장 문장은 Backend가 유지한다.

자세 분석:

- MediaPipe Pose 관절점과 운동별 결정론적 규칙을 사용한다.
- 원본 영상을 영구 저장하지 않는다.
- Frontend에 노출할 종목은 하드코딩하지 않고
  `GET /posture-analysis/capabilities`의 `validated` 상태를 기준으로 한다.
- 성별별 운동 자산이 서로 다른 `exercise_key`를 사용하면 catalog 의미가 같은
  후보만 `experimental` descriptor에 추가하고, 실제 영상으로 동일한 기본 동작을
  확인한 exact key만 `validated` allowlist에 남긴다.
- 같은 기본 동작의 카메라 POV suffix 때문에 별도 key가 생긴 경우에는 성별,
  raw 운동명, 운동 mode, training type, 장비가 모두 일치하는지 검증한 뒤
  기존·저장 루틴용 exact 호환 key로 등록할 수 있다. 이 등록만으로
  `needs_review` catalog row를 추천 후보나 GIF primary 자산으로 승격하지 않는다.
- 푸시업·플랭크·런지는 남성 실기기 검증을 위한 exact 후보 key가 등록되어 있지만
  실제 영상 보정 전까지 `experimental`을 유지한다.
- 힙 브리지는 남성 바닥 양발 기본 동작 자산이 현재 없으므로 Heel/bench 변형을
  이름 유사만으로 연결하지 않는다.
- `experimental` 종목은 실제 영상 검증 전 운영 지원 완료로 표현하지 않는다.
- 사람 미검출, 영상 길이, 촬영 방향, 관절 부족, 동작 미완료 등
  구조화 error code를 유지한다.


# 39. 러닝 정책

- 장소 검색과 도보 경로는 Kakao 계약을 사용한다.
- 공식 코스 후보는 전국길관광정보표준데이터와 두루누비를 사용한다.
- 지도에 표시하는 코스는 좌표 순서와 path / geometry 상태를 검증한다.
- WGS84 API 표현은 `latitude, longitude`, GeoJSON은
  `longitude, latitude`, Kakao는 `x=longitude, y=latitude`다.
- GPS 추천 반경, 기본 페이스, 거리 허용 오차는 설정값을 사용하고
  코드 여러 곳에 중복 하드코딩하지 않는다.
- path가 없는 메타데이터 코스를 정상 지도 경로처럼 표시하지 않는다.
- 목표 거리 밖 결과는 실제 거리와 오차를 명시하고 `best_effort` 또는
  실패 상태로 구분한다.
- 즐겨찾기, 선택 코스, 사용자 페이스, 러닝 기록 저장은 Backend 책임이다.


# 40. 챗봇 / 건강 / 음식 사진 정책

챗봇:

- `/chat`은 레거시 Backend 호환 답변 경로다.
- 식단 / 러닝 / 운동 변경 action은 `/chat/orchestrate`를 사용한다.
- 확인이 필요한 action은 `awaiting_confirmation → ready_for_backend_apply`
  흐름을 유지한다.
- AI Server는 pending action을 영속화하거나 실제 사용자 기록을 수정하지 않는다.
- 캐릭터 / 말투는 `character_id`를 통해 전체 응답에 적용하되,
  급성 증상 안전 정책이 persona보다 우선한다.
- 아픔, 어지러움, 호흡 곤란 등 고위험 신호는 결정론적 중단 안내를 우선한다.

건강:

- 건강점수는 `health_score_service.py`의 결정론적 계산을 사용한다.
- LLM이 점수를 임의 생성하거나 입력되지 않은 건강 수치를 추측하지 않는다.
- 인바디와 건강검진이 모두 필요한 계산 조건을 우회하지 않는다.
- 진단이나 치료 처방 대신 생활관리 정보와 의료진 상담 기준을 제공한다.

음식 사진:

- OpenAI Vision은 음식 후보와 추정 중량 인식에만 사용한다.
- 열량과 탄단지는 공식 Food DB에서 재계산한다.
- OCR / FoodLens 별도 서버는 현재 Pipeline에 연결하지 않는다.
- 이미지를 영구 저장하지 않는다.
- 사용자가 결과를 확인 / 수정한 뒤 저장 여부를 선택한다.


# 41. 외부 Provider와 환경변수

환경변수 이름과 기본값의 single source of truth는 `.env.example`과
`app/core/config.py`다.

주요 secret 이름:

- `AI_SERVER_API_KEY`
- `OPENAI_API_KEY`
- `FOOD_SAFETY_RECIPE_API_KEY`
- `PUBLIC_DATA_SERVICE_KEY`
- `DURUNUBI_API_KEY`
- `KAKAO_REST_API_KEY`

Frontend용 Kakao JavaScript Key와 Backend / AI용 REST Key를 혼동하지 않는다.
실제 secret 값, 계정 정보, 유료 호출 결과 원문은 문서나 로그에 남기지 않는다.

외부 API의 지원 여부, 가격, quota, 라이선스는 변경될 수 있으므로
기억에 의존하지 않고 공식 문서를 다시 확인한다.


# 42. API와 OpenAPI 변경 절차

API 변경은 다음을 한 작업 단위로 처리한다.

1. 기존 Router / Schema / Service / Test 사용처 audit
2. 기존 Pydantic Schema 재사용 또는 일관된 확장
3. Service 구현
4. Router 연결과 오류 매핑
5. unit / contract / regression 테스트
6. `docs/ai-openapi.json`을 현재 `app.openapi()`와 동기화
7. `docs/backend_ai_integration_spec.md` 갱신
8. 기능별 Backend / Frontend 계약 문서 갱신
9. `docs/ai_server_update_handoff.md`에 날짜별 변경 추가

Router 내부에 같은 Request / Response Schema를 다시 만들지 않는다.
OpenAPI snapshot만 수정하고 실행 Schema를 수정하지 않는 방식도 금지한다.


# 43. 테스트 실행 매트릭스

최소 검증:

```powershell
.\.venv\Scripts\python.exe -m py_compile app/schemas/recommendation.py
.\.venv\Scripts\python.exe -m pytest -q test_backend_ai_integration_contract.py
git diff --check
```

위 파일명은 실행 가능한 예시다. 실제 작업에서는 수정한 Python 파일과
관련 테스트 파일 경로로 바꿔 실행한다.

API 변경 시 필수:

```powershell
.\.venv\Scripts\python.exe -m pytest -q test_backend_ai_integration_contract.py
```

넓은 회귀가 필요하면 `-m "not live"`로 외부 호출 없는 테스트부터 실행한다.
`live` marker 테스트, 실제 OpenAI 호출, 유료 Vision, 공공 API 실호출은
사용자 승인, 키 설정, 예상 비용을 확인한 경우에만 실행한다.

Windows sandbox에서 일부 asyncio socketpair 테스트가 멈출 수 있다.
이 경우 코드 실패와 실행환경 제한을 구분하고, 같은 프로젝트 Python 3.12
환경에서 재실행한 근거를 보고한다.

테스트 개수를 통과 기준으로 고정하지 않는다. 실행한 명령, 통과 / 실패,
제외한 테스트와 이유를 매번 보고한다.


# 44. 기능별 핵심 문서 색인

- 누적 AI 인계: `docs/ai_server_update_handoff.md`
- Backend 전체 계약: `docs/backend_ai_integration_spec.md`
- OpenAPI snapshot: `docs/ai-openapi.json`
- KDRI / 메뉴 스타일:
  `docs/diet_kdri_menu_style_frontend_backend_contract_2026-11-19.md`
- 내일 네 끼 변경:
  `docs/diet_replace_day_backend_contract_2026-11-19.md`
- Recipe payload: `docs/diet_recipe_backend_payload_contract.md`
- Chat: `docs/chat_api_contract.md`
- Running: `docs/running_ai_backend_handoff.md`,
  `docs/running_backend_e2e_contract.md`
- 자세 분석: `docs/posture_analysis_backend_contract.md`,
  `docs/posture_analysis_error_backend_handoff_2026-11-18.md`
- 음식 사진: `docs/food_image_backend_contract.md`
- 운동 부위 / 건강점수:
  `docs/exercise_body_regions_health_score_backend_handoff_2026-11-18.md`
- 건강 리포트 / Chat:
  `docs/health_report_chat_backend_contract.md`

문서가 없거나 오래된 경우 파일명만 믿지 말고 실행 코드와 테스트를 먼저 본다.


# 45. AGENTS.md 유지보수 규칙

이 파일은 새 환경에서도 유지되어야 하는 아키텍처, 안전 규칙, 책임 경계,
작업 재개 절차를 기록한다.

사용자 고정 규칙:

- 코드가 한 줄이라도 수정된 작업은 완료 전에 반드시 루트 `AGENTS.md`도
  함께 수정한다.
- 수정한 코드의 기능, 계약, 책임 경계, 안전 조건, 테스트 기준 중
  새 환경에서 알아야 할 내용을 관련 섹션에 반영한다.
- 단순히 변경 이력을 쌓기보다 기존 설명을 현재 구현에 맞게 고쳐서
  서로 충돌하는 옛 지침이 남지 않게 한다.
- 코드 커밋·푸시 대상 파일을 확인할 때 `AGENTS.md` 포함 여부도 반드시
  점검하고, 코드와 같은 커밋에 포함한다.
- `AGENTS.md`가 수정되지 않은 코드 변경은 작업 완료로 보고하지 않는다.

다음 변화가 생기면 같은 작업에서 `AGENTS.md`도 검토한다.

- 작업 대상 브랜치 또는 책임 경계 변경
- 주요 Pipeline 교체
- 공식 source of truth 변경
- 신규 도메인 기능 추가
- 보안 / 비용 / live test 정책 변경
- 완료된 대형 우선순위와 다음 프로젝트 방향 변경

다음 정보는 이 파일에 누적하지 않는다.

- 특정 시점 최신 커밋 해시
- 운영 서버 URL과 worker PID
- 실제 API Key / Token
- 일시적인 배포 시각
- 고정 테스트 통과 개수
- 개인 로컬 절대 경로
- 확인되지 않은 외부 API 가격 / quota

변동 이력은 `docs/ai_server_update_handoff.md`, API 계약은 기능별 문서,
실행 계약은 Schema / OpenAPI에 기록한다.
