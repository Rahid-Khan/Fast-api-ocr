# One-Shot Document Digitizer

A web application that uses Baidu's **Unlimited-OCR** model (3B parameters, MIT license) to perform OCR on any document type in a single inference pass — preserving cross-page context for multi-page PDFs.

## Demo

Upload a PDF or image → get structured text output with full visualization dashboard showing GPU usage, inference timing, and job history.

## Features

- **Universal OCR**: PDFs, scanned images (JPG, PNG, BMP, TIFF, WebP)
- **Single-pass multi-page parsing**: Preserves cross-page tables, paragraph continuity, and section numbering
- **Multiple output formats**: Plain text, Markdown with layout, JSON
- **GPU-accelerated** with automatic CPU fallback + performance warning
- **Real-time visualization dashboard**: GPU/VRAM/RAM monitors, inference timing charts, job history
- **Simple web UI**: Drag-and-drop upload, live progress, tabbed result viewer
- **Google Colab ready**: One-click setup with T4 GPU acceleration

## Quick Start

### Option 1: Google Colab (Recommended)

1. Open [Google Colab](https://colab.research.google.com)
2. Upload `Fast_api_OCR_Colab.ipynb` or create a new notebook
3. **Runtime > Change runtime type > T4 GPU**
4. Run the cells:

```python
# Cell 1: Clone & Install
!git clone https://github.com/Rahid-Khan/Fast-api-ocr.git /content/Fast-api-ocr
!pip install -q -r /content/Fast-api-ocr/requirements.txt
!pip install -q "Pillow>=11.0,<12.0" pyngrok

# Cell 2: Run Server
import subprocess, time, threading
from pyngrok import ngrok

proc = subprocess.Popen(
    ['uvicorn', 'app.main:app', '--host', '0.0.0.0', '--port', '8000'],
    cwd='/content/Fast-api-ocr',
    stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1
)
threading.Thread(target=lambda: [print(l, end='') for l in proc.stdout], daemon=True).start()
time.sleep(3)
print(f'Open: {ngrok.connect(8000).public_url}')
```

5. Open the public URL → use the OCR dashboard with visualizations

### Option 2: Local Installation

```bash
git clone https://github.com/Rahid-Khan/Fast-api-ocr.git
cd Fast-api-ocr

# Create virtual environment (recommended)
python -m venv .venv
.venv\Scripts\activate      # Windows
# source .venv/bin/activate  # Linux/Mac

# Install dependencies
pip install -r requirements.txt

# Run the server
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Open [http://localhost:8000](http://localhost:8000) in your browser.

## System Dashboard

Click the **"System Dashboard"** button in the web UI to see:

| Panel | Description |
|-------|-------------|
| **GPU Card** | Device name, CUDA version, model load status |
| **VRAM Card** | Total VRAM with usage bar (active / reserved / free) |
| **RAM Card** | System RAM with usage bar |
| **Model Card** | Load time, current status |
| **Stats Cards** | Total jobs, characters extracted, average inference time |
| **History Chart** | Bar chart of last 20 jobs — time per job, color-coded by file type |
| **GPU Memory Ring** | Donut chart showing active, cached, and free VRAM |

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | App status and GPU info |
| GET | `/api/gpu-status` | GPU detection details |
| GET | `/api/stats` | Engine statistics and job history |
| POST | `/api/upload` | Upload PDF/image, start OCR |
| GET | `/api/jobs` | List all jobs |
| GET | `/api/jobs/{id}` | Get full results (text/md/json) |
| GET | `/api/jobs/{id}/status` | Poll job status |
| DELETE | `/api/jobs/{id}` | Delete job and files |

## Model Details

| Property | Value |
|----------|-------|
| **Model** | `baidu/Unlimited-OCR` (Hugging Face) |
| **Architecture** | DeepSeek-OCR (SAM+CLIP vision tower + DeepSeek-V2 MoE decoder) |
| **Parameters** | 3 billion |
| **Context window** | 32,768 tokens |
| **License** | MIT |
| **VRAM required** | ~6 GB (T4 with 15 GB is ideal) |
| **First load time** | 15-30 seconds |

## Project Structure

```
Fast-api-ocr/
├── app/
│   ├── main.py              # FastAPI application entry point
│   ├── config.py             # Settings and paths
│   ├── database.py           # SQLite job storage
│   ├── models.py             # Pydantic schemas
│   ├── ocr_engine.py         # Model loading, inference, stats tracking
│   ├── pdf_converter.py      # PDF to image conversion
│   ├── job_manager.py        # Job lifecycle management
│   └── routers/
│       ├── health.py         # Health check + GPU status + stats endpoints
│       ├── upload.py         # File upload endpoint
│       └── jobs.py           # Job management endpoints
├── static/
│   ├── index.html            # Single-page frontend
│   ├── css/style.css         # Styling + dashboard styles
│   ├── js/app.js             # Core application logic + dashboard toggle
│   ├── js/result-viewer.js   # Tabbed output display
│   └── js/visualization.js   # Canvas-based dashboard (GPU ring, history chart)
├── Fast_api_OCR_Colab.ipynb  # Google Colab launcher (3 cells)
├── requirements.txt          # Python dependencies
└── README.md
```

## Visualization Dashboard

The dashboard is built with HTML5 Canvas (no external charting libraries) and includes:

- **GPU Memory Ring**: Real-time donut chart of VRAM allocation
- **Usage Bars**: Horizontal progress bars for VRAM and RAM
- **History Chart**: Bar chart of inference times across jobs, color-coded (blue = PDF, green = image)
- **Stats Cards**: Aggregated metrics — total jobs, characters, average time

All visualization code lives in `static/js/visualization.js` and renders directly in the browser.

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

## Requirements

- Python 3.12+
- CUDA GPU recommended (CPU works but is 10-50x slower)
- ~8 GB VRAM for the 3B parameter model
- ~6 GB RAM minimum for CPU fallback

## Known Limitations

- No official benchmark numbers published by Baidu
- Training data composition and language coverage undisclosed
- All accuracy/robustness claims should be verified on your own labeled samples
- Model weights are ~6 GB; first load takes 15-30 seconds

## License

MIT — same as the underlying Unlimited-OCR model.
