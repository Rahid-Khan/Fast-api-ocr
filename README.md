# One-Shot Document Digitizer

A web application that uses Baidu's **Unlimited-OCR** model (3B parameters, MIT license) to perform OCR on any document type in a single inference pass — preserving cross-page context for multi-page PDFs.

## Features

- **Universal OCR**: PDFs, scanned images (JPG, PNG, BMP, TIFF, WebP)
- **Single-pass multi-page parsing**: Preserves cross-page tables, paragraph continuity, and section numbering
- **Multiple output formats**: Plain text, Markdown with layout, JSON
- **GPU-accelerated** with automatic CPU fallback + performance warning
- **Simple web UI**: Drag-and-drop upload, live progress, tabbed result viewer

## Requirements

- Python 3.12+
- CUDA GPU recommended (CPU works but is 10-50x slower)
- ~8 GB VRAM for the 3B parameter model

## Setup

```bash
cd d:/rcode/ocr

# Create virtual environment (recommended)
python -m venv .venv
.venv\Scripts\activate      # Windows
# source .venv/bin/activate  # Linux/Mac

# Install dependencies
pip install -r requirements.txt
```

## Running

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Open http://localhost:8000 in your browser.

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | App status and GPU info |
| GET | `/api/gpu-status` | GPU detection details |
| POST | `/api/upload` | Upload PDF/image, start OCR |
| GET | `/api/jobs` | List all jobs |
| GET | `/api/jobs/{id}` | Get full results (text/md/json) |
| GET | `/api/jobs/{id}/status` | Poll job status |
| DELETE | `/api/jobs/{id}` | Delete job and files |

## Model Details

- **Model**: `baidu/Unlimited-OCR` (Hugging Face)
- **Architecture**: DeepSeek-OCR (SAM+CLIP vision tower + DeepSeek-V2 MoE decoder)
- **Context window**: 32,768 tokens
- **License**: MIT

### Known Limitations

- No official benchmark numbers published by Baidu
- Training data composition and language coverage undisclosed
- All accuracy/robustness claims should be verified on your own labeled samples
- Model weights are ~6 GB; first load takes 15-30 seconds

## Scaling to Production

For higher throughput, replace raw Transformers with SGLang serving:

```bash
python -m sglang.launch_server \
  --model baidu/Unlimited-OCR \
  --served-model-name Unlimited-OCR \
  --attention-backend fa3 \
  --page-size 1 \
  --mem-fraction-static 0.8 \
  --context-length 32768 \
  --enable-custom-logit-processor \
  --host 0.0.0.0 \
  --port 10000
```

Then update `app/ocr_engine.py` to call the SGLang OpenAI-compatible endpoint instead of loading the model locally.

## Project Structure

```
app/
  main.py          - FastAPI application
  config.py        - Settings and paths
  database.py      - SQLite job storage
  models.py        - Pydantic schemas
  ocr_engine.py    - Model loading and inference
  pdf_converter.py - PDF to image conversion
  job_manager.py   - Job lifecycle management
  routers/
    health.py      - Health check endpoints
    upload.py      - File upload endpoint
    jobs.py        - Job management endpoints
static/
  index.html       - Single-page frontend
  css/style.css    - Styling
  js/app.js        - Core application logic
  js/result-viewer.js - Tabbed output display
```
