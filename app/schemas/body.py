from pydantic import BaseModel, Field


class BodyAnalysisRequest(BaseModel):
    age: int | None = Field(default=None, ge=0, le=120)
    sex: str | None = None
    height_cm: float | None = Field(default=None, gt=0)
    weight_kg: float | None = Field(default=None, gt=0)
    skeletal_muscle_mass_kg: float | None = Field(default=None, ge=0)
    body_fat_mass_kg: float | None = Field(default=None, ge=0)
    body_fat_percent: float | None = Field(default=None, ge=0, le=100)
    bmi: float | None = Field(default=None, ge=0)


class BodyAnalysisResponse(BaseModel):
    status: str
    result: dict
