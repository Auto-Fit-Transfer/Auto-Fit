from fastapi import APIRouter, Depends
from app.core.security import verify_api_key
from app.schemas.body import BodyAnalysisRequest, BodyAnalysisResponse
from app.services.body_model_service import body_model_service

router = APIRouter(
    prefix="/ai/body-analysis",
    tags=["body-analysis"],
    dependencies=[Depends(verify_api_key)],
)


@router.post("", response_model=BodyAnalysisResponse)
async def body_analysis(request: BodyAnalysisRequest):
    result = body_model_service.predict(request)
    return BodyAnalysisResponse(status="success", result=result)
