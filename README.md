# Unlimited OCR — One-Shot Document Digitizer

A web application that uses Baidu's **Unlimited-OCR** model (3B parameters, MIT license) to perform OCR on any document type in a single inference pass — preserving cross-page context for multi-page PDFs.

## Screenshots

### System Dashboard
Real-time monitoring of GPU, RAM, inference stats, and job history.

![System Dashboard](pictures/Screenshot%202026-07-25%20140304.png)

### GPU Memory Breakdown
Live donut chart showing active, cached, and free VRAM allocation.

![GPU Memory Breakdown](pictures/Screenshot%202026-07-25%20140357.png)

### OCR Results
Extracted text with tabbed output (Plain Text, Markdown, JSON), copy/download actions, and job history.

![OCR Results](pictures/Screenshot%202026-07-25%20140422.png)

---

## Features

- **Universal OCR**: PDFs, scanned images (JPG, PNG, BMP, TIFF, WebP)
- **Single-pass multi-page parsing**: Preserves cross-page tables, paragraph continuity, and section numbering
- **Multiple output formats**: Plain text, Markdown with layout, JSON
- **GPU-accelerated** with automatic CPU fallback + performance warning
- **Real-time visualization dashboard**: GPU/VRAM/RAM monitors, inference timing charts, job history
- **Live progress tracking**: See model loading, image conversion, inference, and decoding stages in real time
- **Simple web UI**: Drag-and-drop upload, live progress bar, tabbed result viewer
- **Google Colab ready**: One-click setup with T4 GPU acceleration via cloudflared tunnel (no account needed)

---

## Quick Start

### Option 1: Google Colab (Recommended)

1. Open [Google Colab](https://colab.research.google.com)
2. Upload `Fast_api_OCR_Colab.ipynb` or create a new notebook
3. **Runtime > Change runtime type > T4 GPU**
4. Run all cells top to bottom
5. Open the printed `*.trycloudflare.com` URL to use the OCR dashboard

```python
# Cell 1: Clone & Install
!git clone https://github.com/Rahid-Khan/Fast-api-ocr.git /content/Fast-api-ocr
!pip install -q -r /content/Fast-api-ocr/requirements.txt
!pip install -q "Pillow>=11.0,<12.0"
!wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -O /usr/local/bin/cloudflared
!chmod +x /usr/local/bin/cloudflared

# Cell 2: Run Server (uses cloudflared — free, no account needed)
# Just run the cell, it will print a public URL
```

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

---

## How It Works

### Processing Pipeline

```
Upload → Parse File → Convert PDF to Images (PyMuPDF) → GPU Inference (Unlimited-OCR) → Decode Output → Display Results
```

1. **Upload**: User drops a PDF or image into the drag-and-drop zone
2. **Parse**: Server validates file type, size, and creates a job record in SQLite
3. **Convert**: PDFs are rendered to PNG images at 200 DPI using PyMuPDF
4. **Infer**: Images are processed by the 3B-parameter model on GPU in a single pass
5. **Decode**: Model output is saved as .txt, .md, and .json files
6. **Display**: Results appear in a tabbed viewer with copy/download actions

### Real-Time Progress

The processing view shows a live progress bar with stage indicators:

| Stage | Description |
|-------|-------------|
| `loading_model` | Downloading and loading model weights (~6 GB) to GPU |
| `model_ready` | Model loaded, ready for inference |
| `converting` | Rendering PDF pages to images |
| `inferring` | Running OCR inference on GPU |
| `decoding` | Reading output files from disk |
| `done` | Results ready |

---

## System Dashboard

Click the **"System Dashboard"** button in the web UI to see:

| Panel | Description |
|-------|-------------|
| **Compute** | GPU device name, CUDA version, availability status |
| **GPU Memory** | Total VRAM with usage bar (active / cached / free) |
| **System RAM** | Total RAM with usage bar |
| **Model** | Load status and time |
| **Total Jobs** | Number of OCR jobs processed |
| **Characters Extracted** | Total characters across all jobs |
| **Avg Inference Time** | Average time per OCR job |
| **Total Inference** | Cumulative inference time |
| **Job History** | Bar chart of last 20 jobs — color-coded (blue = PDF, green = image) |
| **GPU Memory Breakdown** | Donut chart of VRAM allocation (active, cached, free) |

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | App status and GPU info |
| GET | `/api/gpu-status` | GPU detection details |
| GET | `/api/stats` | Engine statistics and job history |
| GET | `/api/progress` | Real-time processing progress |
| POST | `/api/upload` | Upload PDF/image, start OCR |
| GET | `/api/jobs` | List all jobs |
| GET | `/api/jobs/{id}` | Get full results (text/md/json) |
| GET | `/api/jobs/{id}/status` | Poll job status |
| DELETE | `/api/jobs/{id}` | Delete job and files |

---

## Model Details

| Property | Value |
|----------|-------|
| **Model** | `baidu/Unlimited-OCR` ([Hugging Face](https://huggingface.co/baidu/Unlimited-OCR)) |
| **Architecture** | DeepSeek-OCR (SAM+CLIP vision tower + DeepSeek-V2 MoE decoder) |
| **Parameters** | 3 billion |
| **Context window** | 32,768 tokens |
| **License** | MIT |
| **VRAM required** | ~6 GB (T4 with 15 GB is ideal) |
| **First load time** | 15-30 seconds (varies by network) |
| **Paper** | [arXiv:2606.23050](https://arxiv.org/abs/2606.23050) |

---

## Project Structure

```
Fast-api-ocr/
├── app/
│   ├── main.py              # FastAPI application entry point
│   ├── config.py             # Settings and paths
│   ├── database.py           # SQLite job storage
│   ├── models.py             # Pydantic schemas
│   ├── ocr_engine.py         # Model loading, inference, progress tracking, stats
│   ├── pdf_converter.py      # PDF to image conversion (PyMuPDF)
│   ├── job_manager.py        # Job lifecycle management
│   └── routers/
│       ├── health.py         # Health, GPU status, stats, progress endpoints
│       ├── upload.py         # File upload endpoint
│       └── jobs.py           # Job management endpoints
├── static/
│   ├── index.html            # Single-page frontend
│   ├── css/style.css         # White theme + dashboard styles
│   ├── js/app.js             # Core logic + progress polling + dashboard
│   ├── js/result-viewer.js   # Tabbed output display
│   └── js/visualization.js   # Canvas-based dashboard (GPU ring, history chart)
├── pictures/                 # Screenshots for README
├── Fast_api_OCR_Colab.ipynb  # Google Colab launcher (3 cells)
├── colab_ocr.ipynb           # Alternative Colab notebook
├── requirements.txt          # Python dependencies
└── README.md
```

---

## Technology Stack

| Layer | Technology |
|-------|------------|
| **OCR Model** | Baidu Unlimited-OCR (3B params, MIT license) |
| **ML Framework** | PyTorch + Transformers (Hugging Face) |
| **Backend** | FastAPI + Uvicorn |
| **Database** | SQLite (job storage) |
| **PDF Processing** | PyMuPDF (fitz) |
| **Frontend** | Vanilla HTML/CSS/JS (no frameworks) |
| **Visualization** | HTML5 Canvas (no charting libraries) |
| **Tunnel** | Cloudflare cloudflared (Colab) |
| **GPU** | NVIDIA CUDA (T4 recommended) |

---

## Requirements

- Python 3.12+
- CUDA GPU recommended (CPU works but is 10-50x slower)
- ~8 GB VRAM for the 3B parameter model
- ~6 GB RAM minimum for CPU fallback
- Internet connection for first model download (~6 GB)

### Python Dependencies

```
fastapi
uvicorn[standard]
python-multipart
torch
torchvision
transformers
Pillow>=11.0,<12.0
matplotlib
einops
addict
easydict
pymupdf
psutil
```

---

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

---

## Known Limitations

- No official benchmark numbers published by Baidu
- Training data composition and language coverage undisclosed
- All accuracy/robustness claims should be verified on your own labeled samples
- Model weights are ~6 GB; first load takes 15-30 seconds
- Multi-page PDF inference uses the "base" config (image_size=1024), single images support "gundam" config (image_size=640)

---

## Citation

```bibtex
@misc{yin2026unlimitedocrworks,
      title={Unlimited OCR Works},
      author={Youyang Yin and Huanhuan Liu and YY and Qunyi Xie and Chaorun Liu and
              Shiqi Yang and Shaohua Wang and Zhanlong Liu and Hao Zou and
              Jinyue Chen and Shu Wei and Jingjing Wu and Mingxin Huang and
              Zhen Wu and Guibin Wang and Tengyu Du and Lei Jia},
      year={2026},
      eprint={2606.23050},
      archivePrefix={arXiv},
      primaryClass={cs.CV},
      url={https://arxiv.org/abs/2606.23050},
}
```

---

## License

MIT — same as the underlying Unlimited-OCR model.
