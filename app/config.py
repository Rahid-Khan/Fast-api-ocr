from pathlib import Path
from dataclasses import dataclass, field

BASE_DIR = Path(__file__).resolve().parent.parent


@dataclass
class Settings:
    upload_dir: Path = BASE_DIR / "uploads"
    output_dir: Path = BASE_DIR / "outputs"
    db_path: Path = BASE_DIR / "data" / "jobs.db"
    static_dir: Path = BASE_DIR / "static"

    model_name: str = "baidu/Unlimited-OCR"
    torch_dtype: str = "bfloat16"

    base_size: int = 1024
    image_size: int = 640
    multi_image_size: int = 1024
    max_length: int = 32768
    crop_mode: bool = True

    pdf_dpi: int = 200

    max_upload_size_mb: int = 100
    allowed_image_exts: set = field(default_factory=lambda: {".jpg", ".jpeg", ".png", ".bmp", ".tiff", ".tif", ".webp"})
    allowed_pdf_exts: set = field(default_factory=lambda: {".pdf"})

    def ensure_dirs(self):
        for d in [self.upload_dir, self.output_dir, self.db_path.parent]:
            d.mkdir(parents=True, exist_ok=True)


settings = Settings()
