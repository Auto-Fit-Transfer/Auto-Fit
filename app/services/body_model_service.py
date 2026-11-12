from pathlib import Path
import joblib
from app.schemas.body import BodyAnalysisRequest


class BodyModelService:
    def __init__(self) -> None:
        self.model_path = Path("app/models/body_model/body_model.pkl")
        self.model = None
        if self.model_path.exists():
            self.model = joblib.load(self.model_path)

    def predict(self, data: BodyAnalysisRequest) -> dict:
        # 실제 학습 모델이 아직 없을 때도 API 테스트가 가능하도록 fallback 제공
        if self.model is None:
            return {
                "prediction": None,
                "message": "체성분 모델 파일이 아직 등록되지 않았습니다.",
                "received": data.model_dump(),
            }

        features = [[
            data.age or 0,
            data.height_cm or 0,
            data.weight_kg or 0,
            data.skeletal_muscle_mass_kg or 0,
            data.body_fat_mass_kg or 0,
            data.body_fat_percent or 0,
            data.bmi or 0,
        ]]
        prediction = self.model.predict(features)[0]
        return {"prediction": str(prediction)}


body_model_service = BodyModelService()
