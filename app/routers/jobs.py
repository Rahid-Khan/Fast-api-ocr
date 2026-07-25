from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pathlib import Path
from app.models import JobResponse, JobDetail, JobListResponse, FileType, JobStatus
from app.database import get_job, list_jobs, count_jobs
from app.job_manager import remove_job

router = APIRouter()


@router.get("/jobs", response_model=JobListResponse)
async def get_jobs(limit: int = 50, offset: int = 0):
    jobs = list_jobs(limit=limit, offset=offset)
    total = count_jobs()
    return JobListResponse(
        jobs=[
            JobResponse(
                id=j["id"],
                filename=j["filename"],
                file_type=FileType(j["file_type"]),
                status=JobStatus(j["status"]),
                page_count=j["page_count"],
                error_message=j["error_message"],
                created_at=j["created_at"],
                completed_at=j["completed_at"],
            )
            for j in jobs
        ],
        total=total,
    )


@router.get("/jobs/{job_id}", response_model=JobDetail)
async def get_job_detail(job_id: str):
    job = get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return JobDetail(
        id=job["id"],
        filename=job["filename"],
        file_type=FileType(job["file_type"]),
        status=JobStatus(job["status"]),
        page_count=job["page_count"],
        error_message=job["error_message"],
        created_at=job["created_at"],
        completed_at=job["completed_at"],
        result_text=job["result_text"],
        result_markdown=job["result_markdown"],
        result_json=job["result_json"],
    )


@router.get("/jobs/{job_id}/status", response_model=JobResponse)
async def get_job_status(job_id: str):
    job = get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return JobResponse(
        id=job["id"],
        filename=job["filename"],
        file_type=FileType(job["file_type"]),
        status=JobStatus(job["status"]),
        page_count=job["page_count"],
        error_message=job["error_message"],
        created_at=job["created_at"],
        completed_at=job["completed_at"],
    )


@router.delete("/jobs/{job_id}", status_code=204)
async def delete_job_endpoint(job_id: str):
    job = get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    remove_job(job_id)
