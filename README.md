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
- **Progressive streaming output**: Watch text appear in real-time as the model extracts it
- **Simple web UI**: Drag-and-drop upload, live progress bar, tabbed result viewer
- **Unlimited free usage**: Run as many OCR jobs as you want via Google Colab (free T4 GPU)

---

## Run Unlimited OCR for Free via Google Colab

This project is designed to run **unlimited times** for free using Google Colab's free T4 GPU. Here's exactly how it works:

### What You Get

| Resource | Details |
|----------|---------|
| **GPU** | NVIDIA T4 (15 GB VRAM) — free on Colab |
| **RAM** | ~12 GB — free on Colab |
| **Cost** | $0 — completely free |
| **Usage limit** | Unlimited — upload as many documents as you want |
| **Model** | Baidu Unlimited-OCR (3B params) stays loaded in GPU after first upload |

### How It Works (Step by Step)

```
┌─────────────────────────────────────────────────────────────────┐
│  YOUR BROWSER                                                   │
│  (any device — phone, laptop, tablet)                           │
│                                                                 │
│  Opens public URL from cloudflared                              │
│  → Upload documents                                             │
│  → See progressive text extraction in real-time                 │
│  → Download results                                             │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           │ HTTPS (via cloudflared tunnel)
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│  GOOGLE COLAB (Free T4 GPU)                                     │
│                                                                 │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────┐  │
│  │  FastAPI      │◄──│  OCR Engine   │◄──│  Unlimited-OCR   │  │
│  │  (port 8000) │    │  (tracks      │    │  (3B params on   │  │
│  │              │    │   progress)   │    │   GPU)           │  │
│  └──────────────┘    └──────────────┘    └──────────────────┘  │
│                                                                 │
│  cloudflared creates a public URL (no account needed)           │
└─────────────────────────────────────────────────────────────────┘
```

### Step 1: Open Google Colab

1. Go to [https://colab.research.google.com](https://colab.research.google.com)
2. Click **File → Upload notebook**
3. Upload `Fast_api_OCR_Colab.ipynb` from this repository

### Step 2: Enable GPU (Required)

1. Click **Runtime → Change runtime type**
2. Set **Hardware accelerator** to **T4 GPU**
3. Click **Save**

> Without GPU, the model runs on CPU which is 10-50x slower. GPU is essential.

### Step 3: Run Cell 1 — Clone & Install (~2 minutes)

Click the play button on Cell 1. This will:

```
1. Clone the repository from GitHub
2. Install Python dependencies (torch, transformers, Pillow, etc.)
3. Download cloudflared binary (free tunnel from Cloudflare)
```

You'll see `Done` when installation completes.

### Step 4: Run Cell 2 — Start Server (~1 minute)

Click the play button on Cell 2. This will:

```
1. Start the FastAPI web server on port 8000
2. Launch cloudflared tunnel — creates a public URL
3. Print a URL like: https://abc-xyz.trycloudflare.com
```

**Copy that URL** and open it in your browser. You'll see the OCR web dashboard.

### Step 5: Upload Documents (Unlimited)

Now you can use the OCR **unlimited times**:

1. **Drag & drop** a PDF or image onto the upload zone
2. Watch the **split-view** — document preview on left, text appearing on right
3. See the **progress ring** fill as the model processes
4. View results in **Plain Text / Markdown / JSON** tabs
5. **Copy** or **Download** the extracted text
6. Click **"Upload Another"** to process more documents

**The model stays loaded in GPU memory** — after the first upload, subsequent documents process much faster (no 30-second model load each time).

### Step 6: Use the Dashboard

Click **"System Dashboard"** to see:

- **GPU status**: Device name, VRAM usage, CUDA version
- **RAM usage**: System memory allocation
- **Statistics**: Total jobs, characters extracted, average inference time
- **Job history chart**: Bar chart of all processed documents
- **GPU memory ring**: Donut chart of VRAM allocation

### Step 7: Stop When Done

Run Cell 3 to stop the server and free GPU resources.

---

### What Happens If Colab Disconnects?

Google Colab may disconnect after ~90 minutes of inactivity. When this happens:

1. **Your results are safe** — the output files are still in the Colab runtime
2. **Re-run Cell 2** to restart the server
3. **Re-run Cell 1** only if the runtime was reset (you'll see import errors)

If the runtime was fully reset (all variables cleared):
1. Re-run Cell 1 (install)
2. Re-run Cell 2 (server)
3. The model will reload (~30 seconds first time)

### Colab Usage Tips

| Tip | Why |
|-----|-----|
| **Keep the tab open** | Prevents idle disconnect |
| **Upload small files first** | Tests that everything works before large PDFs |
| **Use PDF for multi-page docs** | Preserves page order and cross-page context |
| **Check the dashboard** | Monitor GPU memory to avoid out-of-memory errors |
| **Download results** | Save extracted text before Colab disconnects |

---

## Local Installation (Alternative)

If you have a GPU on your own machine:

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
6. **Stream**: Text appears progressively in the UI via Server-Sent Events
7. **Display**: Final results appear in a tabbed viewer with copy/download actions

### Real-Time Progress

The processing view shows a live progress ring and split-view:

| Stage | Description |
|-------|-------------|
| `loading_model` | Downloading and loading model weights (~6 GB) to GPU |
| `model_ready` | Model loaded, ready for inference |
| `converting` | Rendering PDF pages to images |
| `inferring` | Running OCR inference on GPU |
| `decoding` | Reading output files from disk |
| `done` | Results ready — text streams into the output panel |

### Progressive Streaming

Text is streamed character-by-character via Server-Sent Events (SSE):
- **Left panel**: Original document preview
- **Right panel**: Extracted text appearing in real-time with blinking cursor
- **Progress ring**: SVG ring fills as processing advances
- **Character counter**: Live count of extracted characters

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
| GET | `/api/progress` | Real-time processing progress (polling) |
| GET | `/api/progress/stream` | Real-time processing progress (SSE) |
| POST | `/api/upload` | Upload PDF/image, start OCR |
| GET | `/api/jobs` | List all jobs |
| GET | `/api/jobs/{id}` | Get full results (text/md/json) |
| GET | `/api/jobs/{id}/status` | Poll job status |
| GET | `/api/jobs/{id}/stream` | Stream OCR output progressively (SSE) |
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
│   ├── ocr_engine.py         # Model loading, inference, progress tracking, streaming
│   ├── pdf_converter.py      # PDF to image conversion (PyMuPDF)
│   ├── job_manager.py        # Job lifecycle management
│   └── routers/
│       ├── health.py         # Health, GPU status, stats, progress SSE endpoints
│       ├── upload.py         # File upload endpoint
│       └── jobs.py           # Job management + streaming SSE endpoint
├── static/
│   ├── index.html            # Single-page frontend with split-view
│   ├── css/style.css         # White theme + dashboard + streaming styles
│   ├── js/app.js             # Core logic + SSE streaming + typewriter effect
│   ├── js/result-viewer.js   # Tabbed output display
│   └── js/visualization.js   # Canvas-based dashboard (GPU ring, history chart)
├── pictures/                 # Screenshots for README
├── Fast_api_OCR_Colab.ipynb  # Google Colab launcher (3 cells)
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
| **Streaming** | Server-Sent Events (SSE) for real-time progress + text output |
| **Database** | SQLite (job storage) |
| **PDF Processing** | PyMuPDF (fitz) |
| **Frontend** | Vanilla HTML/CSS/JS (no frameworks) |
| **Visualization** | HTML5 Canvas (no charting libraries) |
| **Tunnel** | Cloudflare cloudflared (free, no account needed) |
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
- Colab may disconnect after ~90 minutes of inactivity
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
