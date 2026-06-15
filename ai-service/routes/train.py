from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict
from models.forecaster import train_model

router = APIRouter()


class TrainRecord(BaseModel):
    date: str
    workUnit: str
    y: float
    workSeconds: float | None = None


class TrainRequest(BaseModel):
    records: list[TrainRecord]


class TrainMetrics(BaseModel):
    mae: float | None = None
    rmse: float | None = None
    test_size: int | None = None


class TrainResult(BaseModel):
    model_config = ConfigDict(protected_namespaces=())
    work_unit: str
    model_version: str
    train_size: int
    features: list[str]
    metrics: TrainMetrics
    evaluation_path: str | None = None


class TrainResponse(BaseModel):
    models: list[TrainResult]


@router.post("/train", response_model=TrainResponse)
def train(req: TrainRequest):
    if not req.records:
        raise HTTPException(status_code=400, detail="No records provided")

    by_unit: dict[str, list] = {}
    for r in req.records:
        row = {k: v for k, v in r.model_dump().items() if v is not None}
        by_unit.setdefault(r.workUnit, []).append(row)

    results, errors = [], []
    for unit, rows in by_unit.items():
        try:
            results.append(train_model(rows, unit))
        except Exception as e:
            errors.append(f"{unit}: {str(e)}")

    if not results and errors:
        raise HTTPException(status_code=500, detail="; ".join(errors))

    return {"models": results}