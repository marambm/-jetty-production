from dotenv import load_dotenv
import os

load_dotenv()  # charge ai-service/.env directement

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routes.health import router as health_router
from routes.predict import router as predict_router
from routes.train import router as train_router
from routes.analyse import router as analyse_router

app = FastAPI(title="AI Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(train_router)
app.include_router(predict_router)
app.include_router(analyse_router)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)