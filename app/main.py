from fastapi import FastAPI

from app.routers.analysis_router import router as analysis_router
from app.routers.body_router import router as body_router
from app.routers.chat_router import router as chat_router
from app.routers.health_router import router as health_router
from app.routers.rag_router import router as rag_router
from app.routers.running_router import router as running_router

from app.routers.recommendation_router import (
    router as recommendation_router,
)

from app.routers.health_analysis_router import (
    router as health_analysis_router,
)

app = FastAPI(
    title="Healthcare AI Server",
    version="0.1.0",
    description=(
        "AI microservice for chatbot, body analysis, "
        "health analysis, diet, recipes, and exercise"
    ),
)


app.include_router(health_router)
app.include_router(chat_router)
app.include_router(body_router)
app.include_router(analysis_router)
app.include_router(rag_router)
app.include_router(running_router)
app.include_router(
    recommendation_router
)
app.include_router(
    health_analysis_router
)

@app.get("/")
async def root():
    return {
        "status": "ok",
        "service": "Auto-Fit AI Server",
    }
