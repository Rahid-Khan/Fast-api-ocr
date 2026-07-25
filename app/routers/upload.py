import shutil
from pathlib import Path
from fastapi import APIRouter, UploadFile, File, BackgroundTasks, HTTPException
from app.config import settings
from app.models import JobResponse, FileType
from app.job_manager import create_document_job, process_job, generate_job_id

router = APIRouter()


@router.post("/upload", response_model=JobResponse, status_code=202)
async def upload_file(file: UploadFile = File(...), background_tasks: BackgroundTasks = None):
    filename = file.filename or "unknown"
    ext = Path(filename).suffix.lower()

    all_exts = settings.allowed_image_exts | settings.allowed_pdf_exts
    if ext not in all_exts:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{ext}'. Allowed: {', '.join(sorted(all_exts))}",
        )

    job_id = generate_job_id()
    save_path = settings.upload_dir / f"{job_id}_{filename}"

    try:
        with open(save_path, "wb") as f:
            shutil.copyfileobj(file.file, f)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save file: {e}")

    file_size = save_path.stat().st_size
    if file_size == 0:
        save_path.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    max_bytes = settings.max_upload_size_mb * 1024 * 1024
    if file_size > max_bytes:
        save_path.unlink(missing_ok=True)
        raise HTTPException(
            status_code=400,
            detail=f"File too large ({file_size / 1024 / 1024:.1f} MB). Max: {settings.max_upload_size_mb} MB",
        )

    job = create_document_job(filename, str(save_path))

    if background_tasks:
        background_tasks.add_task(process_job, job["id"])

    return JobResponse(
        id=job["id"],
        filename=job["filename"],
        file_type=FileType(job["file_type"]),
        status=job["status"],
        page_count=job["page_count"],
        created_at=job["created_at"],
    )
