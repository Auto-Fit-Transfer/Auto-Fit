import logging

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
)

from fastapi.security import (
    HTTPAuthorizationCredentials,
)

from app.core.config import get_settings
from app.core.security import (
    security,
    verify_api_key,
)

from app.schemas.chat import (
    BackendChatRequest,
    BackendChatResponse,
    ChatIntentResult,
    ChatRequest,
    ChatResponse,
)

from app.services.chat_intent_service import (
    classify_chat_intent,
)

from app.services.chat_orchestrator_service import (
    process_chat,
)

from app.services.llm_service import (
    generate_backend_chat_response,
)


logger = logging.getLogger(
    __name__
)


router = APIRouter(
    tags=["chat"],
)


# =========================================================
# Backend Compatibility Chat API
# =========================================================


@router.post(
    "/chat",
    response_model=BackendChatResponse,
)
async def backend_compatible_chat(
    request: BackendChatRequest,
    credentials: HTTPAuthorizationCredentials | None = Depends(
        security
    ),
) -> BackendChatResponse:
    """
    기존 Auto-Fit Backend와 호환되는 Chat API.

    Backend 계약:
    request:
        question
        user_info
        chat_history

    response:
        answer
        model
    """

    verify_api_key(
        credentials
    )

    try:
        answer = await generate_backend_chat_response(
            request
        )

        settings = get_settings()

        return BackendChatResponse(
            answer=answer,
            model=settings.openai_model,
        )

    except Exception:
        # 사용자 질문 및 개인정보는 로그에 기록하지 않는다.
        logger.exception(
            "Backend-compatible chat failed."
        )

        raise HTTPException(
            status_code=500,
            detail="Chat processing failed.",
        )


# =========================================================
# Internal / Future Chat Orchestration API
# =========================================================


@router.post(
    "/chat/orchestrate",
    response_model=ChatResponse,
)
async def orchestrate_chat(
    request: ChatRequest,
    credentials: HTTPAuthorizationCredentials | None = Depends(
        security
    ),
) -> ChatResponse:
    """
    AI Server 내부 확장형 챗봇 API.

    context/history 기반 개인화 기능을 사용할 수 있다.
    """

    verify_api_key(
        credentials
    )

    try:
        return await process_chat(
            request
        )

    except Exception:
        logger.exception(
            "Chat orchestration failed."
        )

        raise HTTPException(
            status_code=500,
            detail="Chat processing failed.",
        )


# =========================================================
# Development Intent Test
# =========================================================


@router.post(
    "/chat/intent-test",
    response_model=ChatIntentResult,
)
async def test_chat_intent(
    request: ChatRequest,
    credentials: HTTPAuthorizationCredentials | None = Depends(
        security
    ),
) -> ChatIntentResult:
    """
    개발용 intent 분류 확인 API.
    """

    verify_api_key(
        credentials
    )

    try:
        return await classify_chat_intent(
            message=request.content,
            history=request.history,
            health_score_available=(
                request.context is not None
                and request.context.health_score is not None
            ),
        )

    except Exception:
        logger.exception(
            "Chat intent classification failed."
        )

        raise HTTPException(
            status_code=500,
            detail="Chat intent classification failed.",
        )
