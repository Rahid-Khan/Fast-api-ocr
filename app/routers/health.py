from fastapi import APIRouter
from app.models import HealthResponse, GpuStatus, EngineStats
from app.ocr_engine import ocr_engine

router = APIRouter()


@router.get("/health", response_model=HealthResponse)
async def health_check():
    gpu = ocr_engine.gpu_status
    return HealthResponse(
        status="ok",
        gpu=GpuStatus(**gpu),
    )


@router.get("/gpu-status", response_model=GpuStatus)
async def gpu_status():
    return GpuStatus(**ocr_engine.gpu_status)


@router.get("/stats", response_model=EngineStats)
async def engine_stats():
    return EngineStats(**ocr_engine.stats)
