from pydantic import BaseModel
from enum import Enum


class JobStatus(str, Enum):
    pending = "pending"
    processing = "processing"
    completed = "completed"
    failed = "failed"


class FileType(str, Enum):
    image = "image"
    pdf = "pdf"


class JobResponse(BaseModel):
    id: str
    filename: str
    file_type: FileType
    status: JobStatus
    page_count: int
    error_message: str | None = None
    created_at: str
    completed_at: str | None = None


class JobDetail(JobResponse):
    result_text: str | None = None
    result_markdown: str | None = None
    result_json: str | None = None


class JobListResponse(BaseModel):
    jobs: list[JobResponse]
    total: int


class GpuStatus(BaseModel):
    available: bool
    device_name: str | None = None
    torch_version: str
    cuda_version: str | None = None
    model_loaded: bool
    warning: str | None = None
    ram_total_gb: float | None = None
    ram_available_gb: float | None = None


class HealthResponse(BaseModel):
    status: str
    gpu: GpuStatus
