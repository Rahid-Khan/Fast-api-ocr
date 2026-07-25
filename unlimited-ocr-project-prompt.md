# Project Prompt: One-Shot Document Digitizer using Baidu Unlimited-OCR

## 1. Project Overview

Build a web application called **"One-Shot Document Digitizer"** that lets a user upload a long, multi-page PDF or a batch of scanned images (contracts, textbooks, government forms, invoices, research papers) and receive back structured, searchable output — plain text, Markdown with preserved layout/tables, and optional JSON with bounding boxes — generated in a **single inference pass** using Baidu's `Unlimited-OCR` model, rather than the usual page-by-page OCR-then-stitch pipeline most tools rely on.

The core differentiator to showcase: `Unlimited-OCR` is a 3B-parameter, MIT-licensed vision-language model built on the DeepSeek-OCR architecture with a 32,768-token context window, capable of parsing multiple pages of a document together instead of independently — meaning it can preserve cross-page context (a table that spans two pages, a paragraph that continues onto the next page, section numbering, etc).

## 2. Goals

- **Primary:** Demonstrate accurate, structure-preserving OCR on long documents in one shot.
- **Secondary:** Provide a side-by-side comparison mode: traditional page-by-page OCR pipeline vs. single-pass multi-page parsing, to visibly show where the model wins (cross-page tables, continued paragraphs, consistent numbering).
- **Tertiary:** Add a lightweight "ask questions about this document" layer on top of the extracted text, since clean structured text makes this cheap to bolt on.
- **Non-goal (for v1):** Don't try to support every document type. Pick one domain to focus on first (see Section 8).

## 3. Model Details to Build Against

- **Model ID:** `baidu/Unlimited-OCR` (Hugging Face)
- **License:** MIT
- **Architecture:** DeepSeek-OCR-based (SAM+CLIP DeepEncoder vision tower + DeepSeek-V2 MoE text decoder), custom code (`trust_remote_code=True` required)
- **Context window:** 32,768 tokens
- **Serving options:** Hugging Face Transformers (native), vLLM, SGLang, Ollama, llama.cpp (GGUF quantized builds exist but require a DeepSeek-OCR–aware llama.cpp fork, not stock)
- **Inference modes:**
  - Single image — two configs:
    - `gundam` mode: `base_size=1024, image_size=640, crop_mode=True` (higher detail, crops)
    - `base` mode: `base_size=1024, image_size=1024, crop_mode=False` (faster, no crop)
  - Multi-page/PDF — uses `model.infer_multi()` with `image_size=1024` only (base mode)
- **Known caveats (important — build your evaluation step around these):**
  - No official benchmark numbers published by Baidu at release.
  - Training data composition and language coverage are undisclosed.
  - Treat all accuracy/robustness claims as unverified until tested on your own labeled sample.

## 4. Reference Inference Code (starting point)

```python
import os
import torch
from transformers import AutoModel, AutoTokenizer

model_name = 'baidu/Unlimited-OCR'
tokenizer = AutoTokenizer.from_pretrained(model_name, trust_remote_code=True)
model = AutoModel.from_pretrained(
    model_name,
    trust_remote_code=True,
    use_safetensors=True,
    torch_dtype=torch.bfloat16,
)
model = model.eval().cuda()

# Single image
model.infer(
    tokenizer,
    prompt='<image>document parsing.',
    image_file='your_image.jpg',
    output_path='your/output/dir',
    base_size=1024,
    image_size=640,
    crop_mode=True,
    max_length=32768,
    no_repeat_ngram_size=35,
    ngram_window=128,
    save_results=True,
)

# Multi-page / PDF
model.infer_multi(
    tokenizer,
    prompt='<image>Multi page parsing.',
    image_files=['page1.png', 'page2.png', 'page3.png'],
    output_path='your/output/dir',
    image_size=1024,
    max_length=32768,
)
```

For higher-throughput serving instead of raw Transformers, SGLang launch example:

```bash
python -m sglang.launch_server \
  --model baidu/Unlimited-OCR \
  --served-model-name Unlimited-OCR \
  --attention-backend fa3 \
  --page-size 1 \
  --mem-fraction-static 0.8 \
  --context-length 32768 \
  --enable-custom-logit-processor \
  --disable-overlap-schedule \
  --skip-server-warmup \
  --host 0.0.0.0 \
  --port 10000
```

Tested environment: Python 3.12.3 + CUDA 12.9, `torch==2.10.0`, `torchvision==0.25.0`, `transformers==4.57.1`, `Pillow==12.1.1`, `matplotlib==3.10.8`, `einops==0.8.2`, `addict==2.4.0`, `easydict==1.13`, `pymupdf==1.27.2.2`, `psutil==7.2.2`.

## 5. System Architecture

```
[User] → [Frontend: Upload UI]
             ↓
   [Backend: FastAPI]
     ├── PDF/image ingestion (pymupdf splits PDF → page images)
     ├── Inference service
     │     ├── Mode: single-page (gundam/base)
     │     └── Mode: multi-page (infer_multi)
     ├── Post-processing
     │     ├── Plain text extraction
     │     ├── Markdown w/ tables & headings
     │     └── JSON w/ bounding boxes ("grounding")
     └── Optional Q&A layer (any LLM over the extracted text)
             ↓
   [Frontend: Result viewer — original vs extracted, side-by-side]
```

**Backend:** FastAPI + Hugging Face Transformers (or SGLang/vLLM for throughput if deploying at scale).
**Frontend:** Simple upload page + result viewer showing original document alongside extracted output, toggleable between text/Markdown/JSON views.
**Storage:** Local filesystem or S3-compatible bucket for uploaded docs and generated outputs; no need for a database in v1 beyond a simple job table (job_id, status, output_paths).

## 6. Feature Checklist (v1 → stretch)

**v1 (MVP):**
- [ ] Upload PDF or images
- [ ] Split PDF into page images (pymupdf)
- [ ] Run `infer_multi()` across all pages in one pass
- [ ] Return plain text + Markdown output
- [ ] Basic web UI: upload → progress → result view

**v1.5:**
- [ ] Toggle between gundam/base single-page mode and multi-page mode, to compare quality/speed
- [ ] JSON output with bounding boxes for layout-aware use cases
- [ ] Side-by-side comparison: traditional page-by-page pipeline output vs. single-pass output (highlight cross-page table/paragraph handling differences)

**Stretch:**
- [ ] Q&A over the digitized document (feed extracted text/Markdown into any LLM with a simple RAG-lite prompt, no need for a vector DB at this scale)
- [ ] Batch processing queue for multiple documents
- [ ] Export to Word/Excel using extracted structure (map tables → xlsx, headings → docx)
- [ ] Confidence/quality flagging — surface pages the model may have struggled with (e.g., very low text density output, garbled tokens) for manual review

## 7. Evaluation Plan (do this before committing further)

Since no benchmarks are published for this model, build a small evaluation harness early:
1. Collect 20–30 pages of your target document type with known ground-truth text.
2. Run both single-page and multi-page inference.
3. Score against ground truth (character error rate / word error rate is a reasonable starting metric; a simple diff-based script works fine for v1).
4. Note failure patterns (languages it struggles with, table structures, handwriting, dense multi-column layouts) — this becomes real project documentation and also tells you whether the single-pass approach is actually adding value over a page-by-page baseline for your chosen domain.

## 8. Choose a Document Domain to Focus On (pick one for v1)

- **Legal contracts** — test cross-page clause continuity and defined-term consistency.
- **Scanned textbooks/academic PDFs** — test multi-column layout and footnote/citation handling.
- **Government/tax forms** — test structured field extraction (labels + values) rather than free text.
- **Invoices/receipts** — test table/line-item extraction, good for a finance/expense-tool angle.

Narrowing to one domain for the MVP makes both the UI and the evaluation harness much easier to get right before generalizing.

## 9. Deliverables

1. Working web app (FastAPI backend + simple frontend) deployable locally with a GPU.
2. Evaluation report on your chosen document domain (accuracy, failure modes, single-pass vs. page-by-page comparison).
3. README documenting setup, known limitations of the model (undisclosed training data/benchmarks), and instructions for swapping in vLLM/SGLang serving for scale.
