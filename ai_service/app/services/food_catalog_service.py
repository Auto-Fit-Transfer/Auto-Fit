from __future__ import annotations



from typing import Any

import asyncio



import httpx



from app.core.config import get_settings

from app.services.local_specialty_service import LocalSpecialtyService





# ==================================================

# 대한민국 전국통합식품영양성분정보 API

# ==================================================



PUBLIC_DATA_API_URL = (

    "https://api.data.go.kr/openapi/"

    "tn_pubr_public_nutri_food_info_api"

)


# ==================================================
# 공식 음식 API 메모리 캐시
#
# - FastAPI 프로세스가 살아있는 동안 재사용
# - FoodCatalogService 인스턴스가 새로 만들어져도 공유
# - 동일 시점 다중 요청의 중복 API 호출 방지
# ==================================================

_FOOD_API_CACHE: list[dict[str, Any]] | None = None
_FOOD_API_CACHE_LOCK = asyncio.Lock()


# ==================================================
# 조합 폭발 방지용 역할별 최대 후보 수
#
# 기존 candidate_limit_per_role이 20이어도
# 실제 조합 생성 전 최대 8개까지만 사용한다.
# ==================================================

MAX_COMBINATION_CANDIDATES_PER_ROLE = 8





# ==================================================

# 건강 식단 기본 제외 음식

# ==================================================



HARD_EXCLUDED_KEYWORDS = {

    # 패스트푸드

    "피자",

    "햄버거",

    "버거",

    "핫도그",

    "치킨너겟",

    "버팔로윙",



    # 디저트 / 간식

    "도넛",

    "도너츠",

    "케이크",

    "쿠키",

    "초콜릿",

    "사탕",

    "젤리",

    "아이스크림",

    "마카롱",

    "와플",

    "크로플",

    "빙수",

    "팥빙수",

    "크레이프",

    "츄러스",

    "허니브레드",

    "브라우니",

    "푸딩",



    # 제과류

    "크림빵",

    "생크림빵",

    "단팥빵",

    "고로케",

    "크로켓",

    "프레즐",



    # 기타

    "감자튀김",

    "후렌치후라이",

    "밀크쉐이크",

    "슬러시",

    "탄산음료",

}





# ==================================================

# 튀김 음식

# ==================================================



FRIED_KEYWORDS = {

    "튀김",

    "후라이드",

    "프라이드",

}





# ==================================================

# 음료

# ==================================================



BEVERAGE_KEYWORDS = {

    "커피",

    "에이드",

    "주스",

    "음료",

    "라떼",

    "스무디",

    "밀크티",

    "피치티",

    "아이스티",

    "탄산",

}





# ==================================================

# 가공식품 패널티 대상

# ==================================================



PROCESSED_FOOD_KEYWORDS = {

    "햄",

    "소시지",

    "베이컨",

    "스팸",

    "런천미트",

    "완자",

    "어묵",

    "맛살",

    "핫바",

    "미트볼",

    "동그랑땡",

    "너겟",

}





# ==================================================

# 고가공식품

# ==================================================



# ==================================================
# 일반 식사 후보에서 완전히 제외할 고가공 식품
#
# 가공식품 패널티만으로는 햄/소시지류가
# 상위 후보에 남을 수 있으므로 일반 식사 후보에서는
# Hard Filter 처리한다.
# ==================================================

HARD_PROCESSED_EXCLUDED_KEYWORDS = {
    "햄",
    "스팸",
    "런천미트",
    "소시지",
    "핫바",
    "너겟",
}


# ==================================================
# 일반 식사 후보에서 제외할 제과/베이커리류
#
# 샌드위치 같은 완성형 식사는 무조건 제외하지 않고,
# 음식명 자체가 제과/빵류인 경우만 걸러낸다.
# ==================================================

BAKERY_EXCLUDED_KEYWORDS = {
    "호두과자",
    "소보로",
    "모닝빵",
    "식빵",
    "크림빵",
    "단팥빵",
    "찐빵",
    "바게트",
    "크루아상",
    "크로와상",
    "페이스트리",
    "머핀",
    "베이글",
    "브리오슈",
    "롤빵",
}


HIGHLY_PROCESSED_KEYWORDS = {

    "스팸",

    "런천미트",

    "핫바",

    "소시지",

    "베이컨",

    "너겟",

}





# ==================================================

# 음식 역할별 portion 후보

# ==================================================



ROLE_PORTION_OPTIONS = {

    "main": [100, 130, 160],

    "carb": [100, 150, 200],

    "side": [50, 70, 100],

    "protein_side": [130, 160, 200],

    "mixed": [250, 300, 350],

}





# ==================================================

# 알레르기 키워드 확장

# ==================================================



ALLERGY_KEYWORD_MAP = {

    "우유": {

        "우유",

        "치즈",

        "버터",

        "크림",

        "생크림",

        "요거트",

        "요구르트",

        "라떼",

    },



    "유제품": {

        "우유",

        "치즈",

        "버터",

        "크림",

        "생크림",

        "요거트",

        "요구르트",

    },



    "계란": {

        "계란",

        "달걀",

        "에그",

    },



    "달걀": {

        "계란",

        "달걀",

        "에그",

    },



    "대두": {

        "대두",

        "콩",

        "두부",

        "된장",

        "간장",

        "콩나물",

    },



    "콩": {

        "콩",

        "두부",

        "된장",

        "간장",

        "콩나물",

    },



    "밀": {

        "밀",

        "빵",

        "면",

        "국수",

        "파스타",

        "샌드위치",

        "만두",

    },



    "메밀": {

        "메밀",

        "막국수",

    },



    "땅콩": {

        "땅콩",

        "피넛",

    },



    "호두": {

        "호두",

    },



    "잣": {

        "잣",

    },



    "새우": {

        "새우",

    },



    "게": {

        "게",

        "꽃게",

        "대게",

        "킹크랩",

    },



    "고등어": {

        "고등어",

    },



    "오징어": {

        "오징어",

    },



    "조개": {

        "조개",

        "바지락",

        "홍합",

        "굴",

        "전복",

        "꼬막",

    },



    "복숭아": {

        "복숭아",

        "피치",

    },



    "토마토": {

        "토마토",

    },



    "돼지고기": {

        "돼지고기",

        "돼지",

        "돈육",

        "삼겹살",

        "목살",

        "제육",

        "베이컨",

        "햄",

    },



    "소고기": {

        "소고기",

        "쇠고기",

        "우육",

        "불고기",

    },



    "닭고기": {

        "닭고기",

        "닭",

        "치킨",

    },

}





class FoodCatalogService:



    def __init__(self) -> None:

        self.settings = get_settings()



        # ==================================================

        # 지역 특산물 서비스

        # ==================================================



        self.local_specialty_service = (

            LocalSpecialtyService()

        )



    # ==================================================

    # 공식 음식 API 한 페이지 조회

    # ==================================================



    async def fetch_foods(

        self,

        page_no: int = 1,

        num_of_rows: int = 100,

    ) -> list[dict[str, Any]]:



        service_key = (

            self.settings.public_data_service_key

        )



        if not service_key:

            raise RuntimeError(

                "PUBLIC_DATA_SERVICE_KEY가 설정되지 않았습니다."

            )



        num_of_rows = min(

            num_of_rows,

            1000,

        )



        params = {

            "serviceKey": service_key,

            "pageNo": page_no,

            "numOfRows": num_of_rows,

            "type": "json",

        }



        async with httpx.AsyncClient(

            timeout=30.0

        ) as client:



            response = await client.get(

                PUBLIC_DATA_API_URL,

                params=params,

            )



            response.raise_for_status()



            data = response.json()



        header = data.get(

            "header",

            {},

        )



        if header.get(

            "resultCode"

        ) != "00":



            raise RuntimeError(

                "공공데이터 API 오류: "

                f"{header.get('resultMsg')}"

            )



        items = (

            data

            .get("body", {})

            .get("items", {})

            .get("item", [])

        )



        if isinstance(

            items,

            dict,

        ):

            items = [items]



        return items



    # ==================================================

    # 전체 음식 조회

    # ==================================================



    async def fetch_all_foods(
        self,
        page_size: int = 1000,
        force_refresh: bool = False,
    ) -> list[dict[str, Any]]:
        """
        공식 음식 데이터를 전체 조회한다.

        성능 최적화:
        - 최초 1회만 공공데이터 API를 호출한다.
        - 이후 요청은 프로세스 메모리 캐시를 재사용한다.
        - force_refresh=True일 때만 다시 조회한다.
        """

        global _FOOD_API_CACHE

        if (
            _FOOD_API_CACHE is not None
            and not force_refresh
        ):
            return _FOOD_API_CACHE

        async with _FOOD_API_CACHE_LOCK:

            # lock 대기 중 다른 요청이 먼저 로딩했을 수 있으므로 재확인
            if (
                _FOOD_API_CACHE is not None
                and not force_refresh
            ):
                return _FOOD_API_CACHE

            page_size = min(
                page_size,
                1000,
            )

            all_items: list[
                dict[str, Any]
            ] = []

            page_no = 1

            while True:

                items = await self.fetch_foods(
                    page_no=page_no,
                    num_of_rows=page_size,
                )

                if not items:
                    break

                all_items.extend(
                    items
                )

                print(
                    f"food page={page_no} "
                    f"loaded={len(items)} "
                    f"total={len(all_items)}"
                )

                if len(items) < page_size:
                    break

                page_no += 1

            _FOOD_API_CACHE = all_items

            return _FOOD_API_CACHE



    # ==================================================

    # 공식 음식 필드 정규화

    # ==================================================



    def normalize_food(

        self,

        item: dict[str, Any],

    ) -> dict[str, Any]:



        return {

            "food_code": self._clean_text(

                item.get("foodCd")

            ),



            "food_name": self._clean_text(

                item.get("foodNm")

            ),



            "data_code": self._clean_text(

                item.get("dataCd")

            ),



            "data_type": self._clean_text(

                item.get("typeNm")

            ),



            "category": self._clean_text(

                item.get("foodLv3Nm")

            ),



            "subcategory": self._clean_text(

                item.get("foodLv6Nm")

            ),



            "serving_basis": self._clean_text(

                item.get("nutConSrtrQua")

            ),



            "calories_kcal": self._to_float(

                item.get("enerc")

            ),



            "protein_g": self._to_float(

                item.get("prot")

            ),



            "fat_g": self._to_float(

                item.get("fatce")

            ),



            "carbohydrate_g": self._to_float(

                item.get("chocdf")

            ),



            "sugar_g": self._to_float(

                item.get("sugar")

            ),



            "fiber_g": self._to_float(

                item.get("fibtg")

            ),



            "sodium_mg": self._to_float(

                item.get("nat")

            ),



            "saturated_fat_g": self._to_float(

                item.get("fasat")

            ),



            "source_name": self._clean_text(

                item.get("srcNm")

            ),

        }



    # ==================================================

    # 기본 건강식 후보 여부

    # ==================================================



    def is_recommendable(

        self,

        food: dict[str, Any],

    ) -> bool:



        if not food.get(

            "food_name"

        ):

            return False



        required_values = [

            food.get("calories_kcal"),

            food.get("protein_g"),

            food.get("fat_g"),

            food.get("carbohydrate_g"),

        ]



        if any(

            value is None

            for value in required_values

        ):

            return False



        if food["calories_kcal"] <= 0:

            return False



        if food["protein_g"] < 0:

            return False



        if food["fat_g"] < 0:

            return False



        if food["carbohydrate_g"] < 0:

            return False



        if self._contains_excluded_keyword(

            food

        ):

            return False



        if not self.passes_basic_health_filter(

            food

        ):

            return False



        return True



    # ==================================================

    # 기본 건강성 필터

    # ==================================================



    def passes_basic_health_filter(

        self,

        food: dict[str, Any],

    ) -> bool:



        calories = food.get(

            "calories_kcal"

        )



        protein = food.get(

            "protein_g"

        )



        fat = food.get(

            "fat_g"

        )



        carbs = food.get(

            "carbohydrate_g"

        )



        sodium = food.get(

            "sodium_mg"

        )



        saturated_fat = food.get(

            "saturated_fat_g"

        )



        if (

            calories is None

            or protein is None

            or fat is None

            or carbs is None

        ):

            return False



        if (

            calories >= 300

            and protein < 8

        ):

            return False



        if fat > 25:

            return False



        if (

            protein < 5

            and fat > 10

        ):

            return False



        if (

            sodium is not None

            and sodium > 1000

        ):

            return False



        if (

            saturated_fat is not None

            and saturated_fat > 10

        ):

            return False



        return True



    # ==================================================

    # 추천 후보 생성 + 중복 제거

    # ==================================================



    def get_recommendable_foods(

        self,

        items: list[dict[str, Any]],

    ) -> list[dict[str, Any]]:



        result: list[

            dict[str, Any]

        ] = []



        seen_names: set[str] = set()



        for item in items:



            food = self.normalize_food(

                item

            )



            if not self.is_recommendable(

                food

            ):

                continue



            name = (

                food["food_name"]

                .strip()

                .lower()

            )



            if name in seen_names:

                continue



            seen_names.add(

                name

            )



            result.append(

                food

            )



        return result



    # ==================================================

    # 사용자 알레르기 검사

    # ==================================================



    def contains_user_allergy(

        self,

        food: dict[str, Any],

        allergies: list[str],

    ) -> bool:



        text = (

            self._build_searchable_text(

                food

            )

        )



        for allergy in allergies:



            allergy = (

                str(allergy)

                .strip()

                .lower()

            )



            if not allergy:

                continue



            if allergy in text:

                return True



            mapped = (

                ALLERGY_KEYWORD_MAP.get(

                    allergy,

                    set(),

                )

            )



            for keyword in mapped:



                if (

                    keyword.lower()

                    in text

                ):

                    return True



        return False



    # ==================================================

    # 사용자 기피음식 검사

    # ==================================================



    def contains_disliked_food(

        self,

        food: dict[str, Any],

        disliked_foods: list[str],

    ) -> bool:



        text = (

            self._build_searchable_text(

                food

            )

        )



        for disliked in disliked_foods:



            disliked = (

                str(disliked)

                .strip()

                .lower()

            )



            if (

                disliked

                and disliked in text

            ):

                return True



        return False



    # ==================================================

    # 사용자 Hard Filter

    # ==================================================



    def filter_foods_for_user(

        self,

        foods: list[dict[str, Any]],

        allergies: list[str] | None = None,

        disliked_foods: list[str] | None = None,

    ) -> list[dict[str, Any]]:



        allergies = allergies or []



        disliked_foods = (

            disliked_foods or []

        )



        result = []



        for food in foods:



            if self.contains_user_allergy(

                food,

                allergies,

            ):

                continue



            if self.contains_disliked_food(

                food,

                disliked_foods,

            ):

                continue



            result.append(

                food

            )



        return result



    # ==================================================

    # 음식 역할 분류

    # ==================================================



    def classify_food_role(

        self,

        food: dict[str, Any],

    ) -> str | None:



        text = (

            self._build_searchable_text(

                food

            )

        )



        protein = (

            food.get("protein_g")

            or 0

        )



        carbs = (

            food.get("carbohydrate_g")

            or 0

        )



        # ==================================================

        # 완성형 음식

        # ==================================================



        mixed_keywords = {

            "비빔밥",

            "덮밥",

            "볶음밥",

            "김밥",

            "삼각김밥",

            "죽",

            "샌드위치",

            "주먹밥",

            "카레라이스",

            "카레밥",

            "샤브샤브",

            "캘리포니아롤",

        }



        if any(

            keyword in text

            for keyword in mixed_keywords

        ):

            return "mixed"



        # ==================================================

        # 단백질 샐러드 / 냉채

        # ==================================================



        protein_keywords = {

            "닭",

            "치킨",

            "참치",

            "연어",

            "새우",

            "계란",

            "달걀",

            "두부",

            "소고기",

            "쇠고기",

            "돼지고기",

            "오리고기",

        }



        if (

            any(

                keyword in text

                for keyword

                in protein_keywords

            )

            and (

                "샐러드" in text

                or "냉채" in text

            )

        ):

            return "protein_side"



        if "샐러드" in text:

            return "side"



        # ==================================================

        # 탄수화물

        # ==================================================



        carb_keywords = {

            "현미밥",

            "잡곡밥",

            "보리밥",

            "콩밥",

            "흑미밥",

            "쌀밥",

            "팥밥",

            "강낭콩밥",

            "검정콩밥",

            "고구마",

            "옥수수",

        }



        if any(

            keyword in text

            for keyword in carb_keywords

        ):



            if carbs >= 15:

                return "carb"



        if (

            "밥" in text

            and carbs >= 15

        ):

            return "carb"



        if (

            "감자" in text

            and "감자전" not in text

            and carbs >= 15

        ):

            return "carb"



        # ==================================================

        # 메인 단백질

        # ==================================================



        main_keywords = {

            "닭",

            "소고기",

            "쇠고기",

            "돼지고기",

            "오리고기",

            "생선",

            "고등어",

            "연어",

            "참치",

            "두부",

            "계란",

            "달걀",

            "새우",

            "오징어",

            "낙지",

        }



        if any(

            keyword in text

            for keyword in main_keywords

        ):



            if protein >= 8:

                return "main"



        if protein >= 15:

            return "main"



        # ==================================================

        # 채소 / 나물

        # ==================================================



        side_keywords = {

            "나물",

            "무침",

            "브로콜리",

            "시금치",

            "콩나물",

            "숙주",

            "오이",

            "버섯",

            "양배추",

            "채소",

            "야채",

            "겉절이",

        }



        if any(

            keyword in text

            for keyword in side_keywords

        ):

            return "side"



        return None



    # ==================================================

    # 역할별 그룹

    # ==================================================



    def group_foods_by_role(

        self,

        foods: list[dict[str, Any]],

    ) -> dict[

        str,

        list[dict[str, Any]],

    ]:



        groups = {

            "main": [],

            "carb": [],

            "side": [],

            "protein_side": [],

            "mixed": [],

        }



        for food in foods:



            role = (

                self.classify_food_role(

                    food

                )

            )



            if role is None:

                continue



            item = food.copy()



            item[

                "role"

            ] = role



            groups[

                role

            ].append(

                item

            )



        return groups



    # ==================================================

    # portion_g 기준 영양 계산

    # ==================================================



    def calculate_portion_nutrition(

        self,

        food: dict[str, Any],

        portion_g: float,

    ) -> dict[str, Any]:



        factor = (

            portion_g

            / 100.0

        )



        def scaled(

            key: str,

        ) -> float | None:



            value = food.get(

                key

            )



            if value is None:

                return None



            return round(

                value

                * factor,

                2,

            )



        return {

            **food,



            "portion_g": round(

                portion_g,

                1,

            ),



            "calories_kcal": scaled(

                "calories_kcal"

            ),



            "protein_g": scaled(

                "protein_g"

            ),



            "fat_g": scaled(

                "fat_g"

            ),



            "carbohydrate_g": scaled(

                "carbohydrate_g"

            ),



            "sugar_g": scaled(

                "sugar_g"

            ),



            "fiber_g": scaled(

                "fiber_g"

            ),



            "sodium_mg": scaled(

                "sodium_mg"

            ),



            "saturated_fat_g": scaled(

                "saturated_fat_g"

            ),

        }



    # ==================================================

    # 한 끼 영양 합산

    # ==================================================



    def calculate_meal_nutrition(

        self,

        items: list[dict[str, Any]],

    ) -> dict[str, float]:



        keys = [

            "calories_kcal",

            "protein_g",

            "fat_g",

            "carbohydrate_g",

            "sugar_g",

            "fiber_g",

            "sodium_mg",

            "saturated_fat_g",

        ]



        totals = {

            key: 0.0

            for key in keys

        }



        for item in items:



            for key in keys:



                value = item.get(

                    key

                )



                if value is not None:



                    totals[

                        key

                    ] += value



        return {

            key: round(

                value,

                2,

            )

            for key, value

            in totals.items()

        }



    # ==================================================

    # 일반적인 한 끼 Health Score

    # ==================================================



    def calculate_meal_health_score(

        self,

        totals: dict[str, float],

    ) -> float:



        score = 100.0



        sodium = totals.get(

            "sodium_mg",

            0.0,

        )



        sugar = totals.get(

            "sugar_g",

            0.0,

        )



        saturated = totals.get(

            "saturated_fat_g",

            0.0,

        )



        fiber = totals.get(

            "fiber_g",

            0.0,

        )



        if sodium > 1200:

            score -= 40



        elif sodium > 900:

            score -= 30



        elif sodium > 700:

            score -= 18



        elif sodium > 500:

            score -= 8



        if sugar > 25:

            score -= 30



        elif sugar > 15:

            score -= 18



        elif sugar > 10:

            score -= 8



        if saturated > 10:

            score -= 30



        elif saturated > 7:

            score -= 20



        elif saturated > 5:

            score -= 10



        if fiber >= 8:

            score += 10



        elif fiber >= 5:

            score += 7



        elif fiber >= 3:

            score += 4



        elif fiber < 2:

            score -= 5



        return round(

            max(

                0.0,

                min(

                    score,

                    100.0,

                ),

            ),

            2,

        )



    # ==================================================

    # 건강상태 문자열 정규화

    #

    # normal / caution / high 로 통일

    # ==================================================



    @staticmethod

    def normalize_health_status(

        status: Any,

    ) -> str:



        if status is None:

            return "normal"



        value = (

            str(status)

            .strip()

            .lower()

        )



        normal_values = {

            "normal",

            "정상",

            "good",

            "ok",

            "stable",

        }



        caution_values = {

            "caution",

            "주의",

            "경계",

            "borderline",

            "elevated",

            "warning",

        }



        high_values = {

            "high",

            "높음",

            "위험",

            "risk",

            "abnormal",

            "poor",

            "very_high",

            "very high",

        }



        if value in normal_values:

            return "normal"



        if value in caution_values:

            return "caution"



        if value in high_values:

            return "high"



        # 알 수 없는 상태는 과도한 의료적 추론을 하지 않고

        # 기본 normal 로 취급

        return "normal"



    # ==================================================

    # 건강상태 기반 추가 패널티

    #

    # 의료 진단이 아닌 추천 순위 조절용 heuristic

    #

    # blood_pressure:

    #   나트륨에 추가 패널티

    #

    # glucose:

    #   당류 및 과도한 탄수화물에 추가 패널티

    #

    # lipid:

    #   포화지방에 추가 패널티

    #

    # obesity:

    #   목표 열량 초과에 추가 패널티

    # ==================================================



    def calculate_health_status_penalty(

        self,

        totals: dict[str, float],

        target: dict[str, float],

        health_profile: dict[str, Any] | None,

    ) -> tuple[

        float,

        list[str],

    ]:



        if not health_profile:



            return (

                0.0,

                [],

            )



        penalty = 0.0



        reasons: list[str] = []



        sodium = totals.get(

            "sodium_mg",

            0.0,

        )



        sugar = totals.get(

            "sugar_g",

            0.0,

        )



        carbs = totals.get(

            "carbohydrate_g",

            0.0,

        )



        saturated_fat = totals.get(

            "saturated_fat_g",

            0.0,

        )



        calories = totals.get(

            "calories_kcal",

            0.0,

        )



        target_carbs = target.get(

            "carbohydrate_g",

            0.0,

        )



        target_calories = target.get(

            "calories_kcal",

            0.0,

        )



        blood_pressure_status = (

            self.normalize_health_status(

                health_profile.get(

                    "blood_pressure"

                )

            )

        )



        glucose_status = (

            self.normalize_health_status(

                health_profile.get(

                    "glucose"

                )

            )

        )



        lipid_status = (

            self.normalize_health_status(

                health_profile.get(

                    "lipid"

                )

            )

        )



        obesity_status = (

            self.normalize_health_status(

                health_profile.get(

                    "obesity"

                )

            )

        )



        # ==================================================

        # 혈압 관리

        # 나트륨에 민감한 추가 패널티

        # ==================================================



        if blood_pressure_status in {

            "caution",

            "high",

        }:



            multiplier = (

                1.0

                if blood_pressure_status

                == "caution"

                else 1.5

            )



            if sodium > 1000:



                value = (

                    12.0

                    * multiplier

                )



                penalty += value



                reasons.append(

                    "blood_pressure_high_sodium"

                )



            elif sodium > 700:



                value = (

                    8.0

                    * multiplier

                )



                penalty += value



                reasons.append(

                    "blood_pressure_sodium"

                )



            elif sodium > 500:



                value = (

                    4.0

                    * multiplier

                )



                penalty += value



                reasons.append(

                    "blood_pressure_moderate_sodium"

                )



        # ==================================================

        # 혈당 관리

        # 당류 + 목표 탄수화물 초과 패널티

        # ==================================================



        if glucose_status in {

            "caution",

            "high",

        }:



            multiplier = (

                1.0

                if glucose_status

                == "caution"

                else 1.5

            )



            if sugar > 20:



                penalty += (

                    12.0

                    * multiplier

                )



                reasons.append(

                    "glucose_high_sugar"

                )



            elif sugar > 10:



                penalty += (

                    6.0

                    * multiplier

                )



                reasons.append(

                    "glucose_sugar"

                )



            if (

                target_carbs > 0

                and carbs

                > target_carbs * 1.15

            ):



                penalty += (

                    6.0

                    * multiplier

                )



                reasons.append(

                    "glucose_excess_carbohydrate"

                )



        # ==================================================

        # 지질 관리

        # 포화지방 추가 패널티

        # ==================================================



        if lipid_status in {

            "caution",

            "high",

        }:



            multiplier = (

                1.0

                if lipid_status

                == "caution"

                else 1.5

            )



            if saturated_fat > 8:



                penalty += (

                    12.0

                    * multiplier

                )



                reasons.append(

                    "lipid_high_saturated_fat"

                )



            elif saturated_fat > 5:



                penalty += (

                    6.0

                    * multiplier

                )



                reasons.append(

                    "lipid_saturated_fat"

                )



        # ==================================================

        # 체중 관리

        # 목표 열량 초과분에 추가 패널티

        # ==================================================



        if obesity_status in {

            "caution",

            "high",

        }:



            multiplier = (

                1.0

                if obesity_status

                == "caution"

                else 1.5

            )



            if (

                target_calories > 0

                and calories

                > target_calories * 1.20

            ):



                penalty += (

                    10.0

                    * multiplier

                )



                reasons.append(

                    "obesity_high_calorie"

                )



            elif (

                target_calories > 0

                and calories

                > target_calories * 1.10

            ):



                penalty += (

                    5.0

                    * multiplier

                )



                reasons.append(

                    "obesity_excess_calorie"

                )



        # ==================================================

        # 건강상태 보정이 식단 전체를 지나치게 압도하지 않도록

        # 최대 패널티 제한

        # ==================================================



        penalty = min(

            penalty,

            35.0,

        )



        return (

            round(

                penalty,

                2,

            ),



            list(

                dict.fromkeys(

                    reasons

                )

            ),

        )



    # ==================================================

    # 가공식품 패널티

    # ==================================================



    def calculate_processing_penalty(

        self,

        meal_items: list[dict[str, Any]],

    ) -> tuple[

        float,

        list[str],

    ]:



        penalty = 0.0



        processed = []



        for food in meal_items:



            text = (

                self._build_searchable_text(

                    food

                )

            )



            name = (

                food.get(

                    "food_name"

                )

                or ""

            )



            if any(

                keyword in text

                for keyword

                in HIGHLY_PROCESSED_KEYWORDS

            ):



                penalty += 12



                processed.append(

                    name

                )



                continue



            if any(

                keyword in text

                for keyword

                in PROCESSED_FOOD_KEYWORDS

            ):



                penalty += 6



                processed.append(

                    name

                )



        return (

            min(

                penalty,

                20.0,

            ),



            list(

                dict.fromkeys(

                    processed

                )

            ),

        )



    # ==================================================

    # 종합 식단 점수

    #

    # Nutrition        65%

    # Health           27.5%

    # Local Specialty   7.5%

    #

    # Processing Penalty 차감

    # Health Status Penalty 차감

    # ==================================================



    def score_meal_for_target(

        self,

        meal_items: list[dict[str, Any]],

        target: dict[str, float],

        local_specialties: list[dict[str, Any]] | None = None,

        health_profile: dict[str, Any] | None = None,

    ) -> dict[str, Any] | None:



        if not meal_items:

            return None



        local_specialties = (

            local_specialties

            or []

        )



        health_profile = (

            health_profile

            or {}

        )



        totals = (

            self.calculate_meal_nutrition(

                meal_items

            )

        )



        target_calories = target.get(

            "calories_kcal"

        )



        target_protein = target.get(

            "protein_g"

        )



        target_fat = target.get(

            "fat_g"

        )



        target_carbs = target.get(

            "carbohydrate_g"

        )



        if (

            target_calories is None

            or target_protein is None

            or target_fat is None

            or target_carbs is None

        ):

            return None



        if (

            target_calories <= 0

            or target_protein <= 0

            or target_fat <= 0

            or target_carbs <= 0

        ):

            return None



        # ==================================================

        # 영양 목표 오차

        # ==================================================



        calorie_error = abs(

            totals["calories_kcal"]

            - target_calories

        ) / target_calories



        protein_error = abs(

            totals["protein_g"]

            - target_protein

        ) / target_protein



        fat_error = abs(

            totals["fat_g"]

            - target_fat

        ) / target_fat



        carb_error = abs(

            totals["carbohydrate_g"]

            - target_carbs

        ) / target_carbs



        weighted_error = (

            calorie_error * 0.25

            + protein_error * 0.35

            + carb_error * 0.25

            + fat_error * 0.15

        )



        nutrition_score = max(

            0.0,

            min(

                100.0,

                100.0

                * (

                    1.0

                    - weighted_error

                ),

            ),

        )



        # ==================================================

        # 일반 건강성

        # ==================================================



        health_score = (

            self.calculate_meal_health_score(

                totals

            )

        )



        # ==================================================

        # 지역 특산물

        # ==================================================



        (

            local_specialty_score,

            matched_specialties,

        ) = (

            self.local_specialty_service

            .calculate_local_specialty_score(

                meal_items=(

                    meal_items

                ),

                specialties=(

                    local_specialties

                ),

            )

        )



        # ==================================================

        # 가공식품

        # ==================================================



        (

            processing_penalty,

            processed_foods,

        ) = (

            self.calculate_processing_penalty(

                meal_items

            )

        )



        # ==================================================

        # 사용자 건강상태 보정

        # ==================================================



        (

            health_status_penalty,

            health_status_reasons,

        ) = (

            self.calculate_health_status_penalty(

                totals=totals,

                target=target,

                health_profile=(

                    health_profile

                ),

            )

        )



        # ==================================================

        # 기본 점수

        # ==================================================



        base_score = (

            nutrition_score * 0.65

            + health_score * 0.275

            + local_specialty_score * 0.075

        )



        # ==================================================

        # 최종 점수

        # ==================================================



        final_score = (

            base_score

            - processing_penalty

            - health_status_penalty

        )



        final_score = max(

            0.0,

            min(

                final_score,

                100.0,

            ),

        )



        return {

            "items": meal_items,



            "totals": totals,



            "nutrition_score": round(

                nutrition_score,

                2,

            ),



            "health_score": round(

                health_score,

                2,

            ),



            "local_specialty_score": round(

                local_specialty_score,

                2,

            ),



            "matched_specialties": (

                matched_specialties

            ),



            "processing_penalty": round(

                processing_penalty,

                2,

            ),



            "processed_foods": (

                processed_foods

            ),



            "health_status_penalty": round(

                health_status_penalty,

                2,

            ),



            "health_status_reasons": (

                health_status_reasons

            ),



            "health_profile": {

                "blood_pressure": (

                    self.normalize_health_status(

                        health_profile.get(

                            "blood_pressure"

                        )

                    )

                ),



                "glucose": (

                    self.normalize_health_status(

                        health_profile.get(

                            "glucose"

                        )

                    )

                ),



                "lipid": (

                    self.normalize_health_status(

                        health_profile.get(

                            "lipid"

                        )

                    )

                ),



                "obesity": (

                    self.normalize_health_status(

                        health_profile.get(

                            "obesity"

                        )

                    )

                ),

            },



            "base_score": round(

                base_score,

                2,

            ),



            "final_score": round(

                final_score,

                2,

            ),

        }



    # ==================================================

    # 식단 후보 생성

    # ==================================================



    def generate_meal_candidates(

        self,

        groups: dict[

            str,

            list[dict[str, Any]]

        ],

        target: dict[str, float],

        local_specialties: list[dict[str, Any]] | None = None,

        health_profile: dict[str, Any] | None = None,

        candidate_limit_per_role: int = 10,

    ) -> list[dict[str, Any]]:



        local_specialties = (

            local_specialties

            or []

        )



        health_profile = (

            health_profile

            or {}

        )



        meals = []



        # ==================================================
        # 조합 폭발 방지
        #
        # 외부에서 20을 전달하더라도 실제 조합 생성에는
        # 최대 8개만 사용한다.
        # ==================================================

        effective_limit = min(
            max(
                int(candidate_limit_per_role),
                1,
            ),
            MAX_COMBINATION_CANDIDATES_PER_ROLE,
        )



        mains = groups.get(

            "main",

            [],

        )[:effective_limit]



        carbs = groups.get(

            "carb",

            [],

        )[:effective_limit]



        sides = groups.get(

            "side",

            [],

        )[:effective_limit]



        protein_sides = groups.get(

            "protein_side",

            [],

        )[:effective_limit]



        mixed = groups.get(

            "mixed",

            [],

        )[:effective_limit]



        # ==================================================

        # Pattern A

        # MAIN + CARB + SIDE

        # ==================================================



        for main in mains:

            for carb in carbs:

                for side in sides:



                    for mp in ROLE_PORTION_OPTIONS[

                        "main"

                    ]:



                        for cp in ROLE_PORTION_OPTIONS[

                            "carb"

                        ]:



                            for sp in ROLE_PORTION_OPTIONS[

                                "side"

                            ]:



                                items = [

                                    self.calculate_portion_nutrition(

                                        main,

                                        mp,

                                    ),



                                    self.calculate_portion_nutrition(

                                        carb,

                                        cp,

                                    ),



                                    self.calculate_portion_nutrition(

                                        side,

                                        sp,

                                    ),

                                ]



                                result = (

                                    self.score_meal_for_target(

                                        meal_items=items,

                                        target=target,

                                        local_specialties=(

                                            local_specialties

                                        ),

                                        health_profile=(

                                            health_profile

                                        ),

                                    )

                                )



                                if result:



                                    result[

                                        "pattern"

                                    ] = (

                                        "main_carb_side"

                                    )



                                    meals.append(

                                        result

                                    )



        # ==================================================

        # Pattern B

        # PROTEIN_SIDE + CARB + SIDE

        # ==================================================



        for protein_side in protein_sides:

            for carb in carbs:

                for side in sides:



                    for pp in ROLE_PORTION_OPTIONS[

                        "protein_side"

                    ]:



                        for cp in ROLE_PORTION_OPTIONS[

                            "carb"

                        ]:



                            for sp in ROLE_PORTION_OPTIONS[

                                "side"

                            ]:



                                items = [

                                    self.calculate_portion_nutrition(

                                        protein_side,

                                        pp,

                                    ),



                                    self.calculate_portion_nutrition(

                                        carb,

                                        cp,

                                    ),



                                    self.calculate_portion_nutrition(

                                        side,

                                        sp,

                                    ),

                                ]



                                result = (

                                    self.score_meal_for_target(

                                        meal_items=items,

                                        target=target,

                                        local_specialties=(

                                            local_specialties

                                        ),

                                        health_profile=(

                                            health_profile

                                        ),

                                    )

                                )



                                if result:



                                    result[

                                        "pattern"

                                    ] = (

                                        "protein_side_carb_side"

                                    )



                                    meals.append(

                                        result

                                    )



        # ==================================================

        # Pattern C

        # MIXED + SIDE

        # ==================================================



        for mixed_food in mixed:

            for side in sides:



                for mp in ROLE_PORTION_OPTIONS[

                    "mixed"

                ]:



                    for sp in ROLE_PORTION_OPTIONS[

                        "side"

                    ]:



                        items = [

                            self.calculate_portion_nutrition(

                                mixed_food,

                                mp,

                            ),



                            self.calculate_portion_nutrition(

                                side,

                                sp,

                            ),

                        ]



                        result = (

                            self.score_meal_for_target(

                                meal_items=items,

                                target=target,

                                local_specialties=(

                                    local_specialties

                                ),

                                health_profile=(

                                    health_profile

                                ),

                            )

                        )



                        if result:



                            result[

                                "pattern"

                            ] = (

                                "mixed_side"

                            )



                            meals.append(

                                result

                            )



        return meals



    # ==================================================

    # 식단 다양성

    # 동일 핵심 메뉴 반복 제한

    # ==================================================



    def select_diverse_meals(

        self,

        meals: list[dict[str, Any]],

        result_limit: int = 10,

        max_primary_repeat: int = 2,

        max_carb_repeat: int = 6,

        max_side_repeat: int = 4,

    ) -> list[dict[str, Any]]:
        """
        최종 후보 다양성 선택.

        규칙:
        1. 음식명 조합이 완전히 같으면 portion이 달라도 같은 메뉴로 취급
        2. 동일 primary 음식은 최대 max_primary_repeat 회
        3. 동일 carb 음식은 최대 max_carb_repeat 회
        4. 동일 side 음식은 최대 max_side_repeat 회
        5. final_score가 높은 후보부터 선택

        사용자 화면에서는 portion_g가 menu_name에 표시되지 않으므로
        음식명 조합 기준으로 중복을 제거한다.
        """

        meals = sorted(

            meals,

            key=lambda meal: (

                meal[

                    "final_score"

                ]

            ),

            reverse=True,

        )



        result = []



        primary_counts: dict[
            str,
            int
        ] = {}



        carb_counts: dict[
            str,
            int
        ] = {}



        side_counts: dict[
            str,
            int
        ] = {}



        seen_menu_combinations: set[
            tuple[str, ...]
        ] = set()



        for meal in meals:



            items = meal.get(

                "items",

                [],

            )



            if not items:

                continue



            # ==================================================
            # 음식명 조합 기준 중복 제거
            # portion_g 차이는 무시
            # ==================================================

            menu_key = tuple(

                str(

                    item.get(

                        "food_name"

                    )

                    or ""

                )

                for item in items

            )



            if (

                menu_key

                in seen_menu_combinations

            ):

                continue



            primary = str(

                items[0].get(

                    "food_name"

                )

                or ""

            )



            if (

                primary

                and primary_counts.get(

                    primary,

                    0,

                )

                >= max_primary_repeat

            ):

                continue



            # ==================================================
            # 역할별 음식 추출
            # ==================================================

            carbs = [

                str(

                    item.get(

                        "food_name"

                    )

                    or ""

                )

                for item in items

                if item.get(

                    "role"

                ) == "carb"

            ]



            sides = [

                str(

                    item.get(

                        "food_name"

                    )

                    or ""

                )

                for item in items

                if item.get(

                    "role"

                ) == "side"

            ]



            # ==================================================
            # 탄수화물 반복 제한
            # ==================================================

            if any(

                carb_counts.get(

                    name,

                    0,

                )

                >= max_carb_repeat

                for name in carbs

                if name

            ):

                continue



            # ==================================================
            # 반찬 반복 제한
            # ==================================================

            if any(

                side_counts.get(

                    name,

                    0,

                )

                >= max_side_repeat

                for name in sides

                if name

            ):

                continue



            seen_menu_combinations.add(

                menu_key

            )



            if primary:

                primary_counts[

                    primary

                ] = (

                    primary_counts.get(

                        primary,

                        0,

                    )

                    + 1

                )



            for name in carbs:

                if not name:

                    continue

                carb_counts[

                    name

                ] = (

                    carb_counts.get(

                        name,

                        0,

                    )

                    + 1

                )



            for name in sides:

                if not name:

                    continue

                side_counts[

                    name

                ] = (

                    side_counts.get(

                        name,

                        0,

                    )

                    + 1

                )



            result.append(

                meal

            )



            if (

                len(result)

                >= result_limit

            ):

                break



        return result



    # ==================================================

    # 최종 개인화 한 끼 추천

    # ==================================================



    def recommend_meal_combinations(

        self,

        groups: dict[

            str,

            list[dict[str, Any]]

        ],

        target: dict[str, float],

        local_specialties: list[dict[str, Any]] | None = None,

        health_profile: dict[str, Any] | None = None,

        candidate_limit_per_role: int = 10,

        result_limit: int = 10,

        max_primary_repeat: int = 2,

        max_carb_repeat: int = 6,

        max_side_repeat: int = 4,

    ) -> list[dict[str, Any]]:



        candidates = (

            self.generate_meal_candidates(

                groups=groups,

                target=target,

                local_specialties=(

                    local_specialties

                ),

                health_profile=(

                    health_profile

                ),

                candidate_limit_per_role=(

                    candidate_limit_per_role

                ),

            )

        )



        filtered = []



        for meal in candidates:



            calories = (

                meal[

                    "totals"

                ][

                    "calories_kcal"

                ]

            )



            protein = (

                meal[

                    "totals"

                ][

                    "protein_g"

                ]

            )



            # ==================================================

            # 목표 열량 ±30% 밖이면 제외

            # ==================================================



            if not (

                target[

                    "calories_kcal"

                ]

                * 0.70

                <= calories

                <= target[

                    "calories_kcal"

                ]

                * 1.30

            ):

                continue



            # ==================================================

            # 단백질 목표 절반 미만 제외

            # ==================================================



            if protein < (

                target[

                    "protein_g"

                ]

                * 0.50

            ):

                continue



            filtered.append(

                meal

            )



        return (

            self.select_diverse_meals(

                meals=filtered,

                result_limit=(

                    result_limit

                ),

                max_primary_repeat=(

                    max_primary_repeat

                ),

                max_carb_repeat=(

                    max_carb_repeat

                ),

                max_side_repeat=(

                    max_side_repeat

                ),

            )

        )



    # ==================================================

    # 기본 제외 필터

    # ==================================================



    def _contains_excluded_keyword(

        self,

        food: dict[str, Any],

    ) -> bool:
        """
        일반 식사 추천 후보에서 제외할 음식 판정.

        구분:
        - 기존 패스트푸드/디저트/튀김/음료
        - 햄/소시지/스팸 등 고가공식품
        - 호두과자/소보로/모닝빵 등 제과류

        제과류는 category 전체가 아니라 food_name 중심으로 검사해서
        샌드위치 같은 완성형 식사까지 과도하게 제외하지 않는다.
        """

        text = (

            self._build_searchable_text(

                food

            )

        )



        food_name = str(

            food.get(

                "food_name"

            )

            or ""

        ).lower()



        # ==================================================
        # 기존 기본 제외 항목
        # ==================================================

        if any(

            keyword in text

            for keyword

            in HARD_EXCLUDED_KEYWORDS

        ):

            return True



        if any(

            keyword in text

            for keyword

            in FRIED_KEYWORDS

        ):

            return True



        if any(

            keyword in text

            for keyword

            in BEVERAGE_KEYWORDS

        ):

            return True



        # ==================================================
        # 고가공 식품 Hard Filter
        # ==================================================

        if any(

            keyword in text

            for keyword

            in HARD_PROCESSED_EXCLUDED_KEYWORDS

        ):

            return True



        # ==================================================
        # 제과/베이커리 음식명 Hard Filter
        # ==================================================

        if any(

            keyword in food_name

            for keyword

            in BAKERY_EXCLUDED_KEYWORDS

        ):

            return True



        # 음식명 자체가 단순 빵류인 경우 추가 제외
        #
        # 단, 샌드위치/토스트처럼 완성형 식사명은
        # 기존 역할 분류 가능성을 남긴다.
        if (

            "빵" in food_name

            and "샌드위치" not in food_name

            and "토스트" not in food_name

        ):

            return True



        return False



    # ==================================================

    # 음식 검색용 문자열

    # ==================================================



    @staticmethod

    def _build_searchable_text(

        food: dict[str, Any],

    ) -> str:



        return " ".join(

            [

                str(

                    food.get(

                        "food_name"

                    )

                    or ""

                ),



                str(

                    food.get(

                        "category"

                    )

                    or ""

                ),



                str(

                    food.get(

                        "subcategory"

                    )

                    or ""

                ),

            ]

        ).lower()



    # ==================================================

    # float 변환

    # ==================================================



    @staticmethod

    def _to_float(

        value: Any,

    ) -> float | None:



        if value is None:

            return None



        value = str(

            value

        ).strip()



        if not value:

            return None



        try:



            return float(

                value

            )



        except (

            TypeError,

            ValueError,

        ):



            return None



    # ==================================================

    # 문자열 정리

    # ==================================================



    @staticmethod

    def _clean_text(

        value: Any,

    ) -> str | None:



        if value is None:

            return None



        value = str(

            value

        ).strip()



        return (

            value

            or None

        )