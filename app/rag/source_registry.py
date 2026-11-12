from typing import Final


HEALTH_RAG_SOURCES: Final[dict[str, dict]] = {

    # =========================================================
    # 혈압
    # =========================================================
    "korean_hypertension_guideline_2026": {
        "topic": "blood_pressure",
        "source_org": "대한고혈압학회",
        "title": "2026년 제6판 고혈압 진료지침(수정본)",
        "document_type": "clinical_guideline",
        "published_year": 2026,

        "page_url": (
            "https://www.koreanhypertension.org/"
            "reference/guide?idno=10446&mode=read"
        ),

        # Google Drive 공유 URL
        "url": (
            "https://drive.google.com/file/d/"
            "1z7EasnJdnsQK8VLHZvIt0tW0DZh03ZCS/"
            "view?usp=sharing"
        ),

        "verified": True,
        "language": "ko",
        "enabled": True,
        "source_type": "pdf",
    },

    # =========================================================
    # 혈당 / 당뇨
    # =========================================================
    "korean_diabetes_guideline_2025": {
        "topic": "glucose",
        "source_org": "대한당뇨병학회",
        "title": "2025 당뇨병 진료지침 제9판",
        "document_type": "clinical_guideline",
        "published_year": 2025,

        "page_url": (
            "https://www.diabetes.or.kr/bbs/"
            "?code=guide&mode=view&number=2078&page=1"
        ),

        # 확인된 전문 PDF 다운로드 엔드포인트
        "url": (
            "https://diabetes.or.kr/bbs/"
            "download.php?code=guide&number=1522"
        ),

        "verified": True,
        "language": "ko",
        "enabled": True,

        "source_type": "pdf",
        "content_selector": None,
    },

    # =========================================================
    # 지질
    # =========================================================
    "korean_lipid_guideline_2026": {
        "topic": "lipid",
        "source_org": "한국지질·동맥경화학회",
        "title": "이상지질혈증 진료지침 2026",
        "document_type": "clinical_guideline",
        "published_year": 2026,

        "page_url": (
            "https://www.lipid.or.kr/reference/"
            "guideline.php?boardid=guideline"
            "&category=&idx=1456&mode=view"
        ),

        "url": (
            "https://www.lipid.or.kr/uploaded/board/"
            "guideline/"
            "_da67726679603e0afd493574c840d10e1.pdf"
        ),

        "verified": True,
        "language": "ko",
        "enabled": True,
        "source_type": "pdf",
    },

    # =========================================================
    # 비만
    # =========================================================
    "kdca_obesity_info": {
        "topic": "obesity",
        "source_org": "질병관리청",
        "title": "비만 관련 국가건강정보",
        "document_type": "public_health_guideline",
        "published_year": None,

        "page_url": None,
        "url": None,

        "verified": True,
        "language": "ko",

        # 정확한 공식 콘텐츠 URL 확인 전까지 비활성화
        "enabled": False,

        "source_type": "html",
        "content_selector": None,
    },

    # =========================================================
    # 운동 / 신체활동
    # =========================================================
    "kdca_physical_activity": {
        "topic": "exercise",
        "source_org": "질병관리청",
        "title": "신체활동 관련 국가건강정보",
        "document_type": "public_health_guideline",
        "published_year": None,

        "page_url": None,
        "url": None,

        "verified": True,
        "language": "ko",

        # 정확한 URL 확인 후 True
        "enabled": False,

        "source_type": "html",
        "content_selector": None,
    },

    # =========================================================
    # 영양
    # =========================================================
    "kdca_nutrition": {
        "topic": "nutrition",
        "source_org": "질병관리청",
        "title": "식이영양 관련 국가건강정보",
        "document_type": "public_health_guideline",
        "published_year": None,

        # 실제 공식 콘텐츠 페이지 URL 확인 전까지 비워둔다.
        "page_url": None,
        "url": None,

        "verified": True,
        "language": "ko",
        "enabled": True,

        "source_type": "html",
        "content_selector": None,
    },

    # =========================================================
    # 신장
    # =========================================================
    "kdca_ckd_info": {
        "topic": "kidney",
        "source_org": "질병관리청",
        "title": "만성콩팥병",
        "document_type": "public_health_guideline",
        "published_year": 2020,

        "page_url": (
            "https://health.kdca.go.kr/healthinfo/"
            "biz/health/gnrlzHealthInfo/"
            "gnrlzHealthInfo/gnrlzHealthInfoView.do"
            "?cntnts_sn=5457"
        ),

        "url": (
            "https://health.kdca.go.kr/healthinfo/"
            "biz/health/gnrlzHealthInfo/"
            "gnrlzHealthInfo/gnrlzHealthInfoView.do"
            "?cntnts_sn=5457"
        ),

        "verified": True,
        "language": "ko",
        "enabled": True,

        "source_type": "html",
        "content_selector": None,
    },

    # =========================================================
    # 간
    # =========================================================
    "kdca_masld_info": {
        "topic": "liver",
        "source_org": "질병관리청",
        "title": "대사이상지방간질환",
        "document_type": "public_health_guideline",
        "published_year": 2025,

        "page_url": (
            "https://health.kdca.go.kr/healthinfo/"
            "biz/health/gnrlzHealthInfo/"
            "gnrlzHealthInfo/gnrlzHealthInfoView.do"
            "?cntnts_sn=6673"
        ),

        "url": (
            "https://health.kdca.go.kr/healthinfo/"
            "biz/health/gnrlzHealthInfo/"
            "gnrlzHealthInfo/gnrlzHealthInfoView.do"
            "?cntnts_sn=6673"
        ),

        "verified": True,
        "language": "ko",
        "enabled": True,

        "source_type": "html",
        "content_selector": None,
    },

    "korean_obesity_guideline_2022": {
        "topic": "obesity",
        "source_org": "대한비만학회",
        "title": "대한비만학회 비만 진료지침 2022 8판",
        "document_type": "clinical_guideline",
        "published_year": 2022,

        "page_url": (
            "https://general.kosso.or.kr/"
        ),

        "url": (
            "https://general.kosso.or.kr/html/user/core/"
            "view/reaction/main/kosso/inc/data/"
            "guideline2022_vol8.pdf"
        ),

        "verified": True,
        "language": "ko",
        "enabled": True,
        "source_type": "pdf",
    },
}