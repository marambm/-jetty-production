from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict
from models.forecaster import predict_model

router = APIRouter()


class PredictRequest(BaseModel):
    date: str
    workUnit: str
    features: dict | None = None
    previous_predictions: list[float] | None = None


class PredictResponse(BaseModel):
    model_config = ConfigDict(protected_namespaces=())
    yhat: float
    yhat_lower: float
    yhat_upper: float
    confidence: float
    model_version: str


@router.post("/predict", response_model=PredictResponse)
def predict(req: PredictRequest):
    try:
        return predict_model(
            req.date,
            req.workUnit,
            req.features or {},
            req.previous_predictions or [],
        )
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))