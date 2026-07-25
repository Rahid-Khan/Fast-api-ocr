import uuid
import shutil
from datetime import datetime, timezone
from pathlib import Path
from app.config import settings
from app.database import create_job, update_job, get_job, delete_job as db_delete_job
from app.ocr_engine import ocr_engine
from app.pdf_converter import pdf_to_images, get_pdf_page_count


def generate_job_id() -> str:
    return uuid.uuid4().hex[:12]


def create_document_job(filename: str, source_path: str) -> dict:
    ext = Path(filename).suffix.lower()
    is_pdf = ext in settings.allowed_pdf_exts
    file_type = "pdf" if is_pdf else "image"

    page_count = 1
    if is_pdf:
        page_count = get_pdf_page_count(source_path)

    job_id = generate_job_id()
    return create_job(
        job_id=job_id,
        filename=filename,
        original_path=source_path,
        file_type=file_type,
        page_count=page_count,
    )


def process_job(job_id: str):
    job = get_job(job_id)
    if not job:
        return

    try:
        update_job(job_id, status="processing", updated_at=_now())

        output_dir = str(settings.output_dir / job_id)
        source_path = job["original_path"]

        if job["file_type"] == "pdf":
            image_dir = str(settings.output_dir / job_id / "pages")
            image_paths = pdf_to_images(source_path, image_dir)
            result = ocr_engine.infer_multi(image_paths, output_dir)
        else:
            result = ocr_engine.infer_single(source_path, output_dir)

        update_job(
            job_id,
            status="completed",
            output_dir=output_dir,
            result_text=result.get("text"),
            result_markdown=result.get("markdown"),
            result_json=result.get("json"),
            completed_at=_now(),
            updated_at=_now(),
        )
    except Exception as e:
        update_job(
            job_id,
            status="failed",
            error_message=str(e),
            updated_at=_now(),
        )


def remove_job(job_id: str):
    job = get_job(job_id)
    if job:
        Path(job["original_path"]).unlink(missing_ok=True)
        if job["output_dir"]:
            shutil.rmtree(job["output_dir"], ignore_errors=True)
    db_delete_job(job_id)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()
