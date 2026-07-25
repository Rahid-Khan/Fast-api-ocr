import json
import asyncio
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from app.models import HealthResponse, GpuStatus, EngineStats, ProgressResponse
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


@router.get("/progress", response_model=ProgressResponse)
async def engine_progress():
    p = ocr_engine.progress
    return ProgressResponse(**p)


@router.get("/progress/stream")
async def progress_stream():
    async def event_generator():
        last_stage = None
        last_detail = None
        last_percent = -1
        while True:
            p = ocr_engine.progress
            if (p["stage"] != last_stage or p["detail"] != last_detail or p["percent"] != last_percent):
                last_stage = p["stage"]
                last_detail = p["detail"]
                last_percent = p["percent"]
                yield f"data: {json.dumps(p)}\n\n"
            if p["stage"] in ("done", "error"):
                yield f"data: {json.dumps(p)}\n\n"
                break
            await asyncio.sleep(0.3)
    return StreamingResponse(event_generator(), media_type="text/event-stream")
