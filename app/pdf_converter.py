import fitz
from pathlib import Path
from app.config import settings


def pdf_to_images(pdf_path: str, output_dir: str, dpi: int = None) -> list[str]:
    dpi = dpi or settings.pdf_dpi
    doc = fitz.open(pdf_path)
    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)

    image_paths = []
    zoom = dpi / 72
    matrix = fitz.Matrix(zoom, zoom)

    for page_num in range(len(doc)):
        page = doc[page_num]
        pix = page.get_pixmap(matrix=matrix)
        img_path = out / f"page_{page_num + 1:04d}.png"
        pix.save(str(img_path))
        image_paths.append(str(img_path))

    doc.close()
    return image_paths


def get_pdf_page_count(pdf_path: str) -> int:
    doc = fitz.open(pdf_path)
    count = len(doc)
    doc.close()
    return count
