import gc
import os
import time
import torch
import threading
from pathlib import Path
from transformers import AutoModel, AutoTokenizer
from app.config import settings


class OCREngine:
    def __init__(self):
        self.model = None
        self.tokenizer = None
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self._loaded = False
        self._load_time = 0.0
        self._last_infer_time = 0.0
        self._last_gpu_mem_used = 0.0
        self._total_jobs = 0
        self._total_infer_time = 0.0
        self._total_chars = 0
        self._history = []
        self._progress = {"stage": "idle", "detail": "", "percent": 0}
        # Streaming: list of output chunks for progressive display
        self._stream_chunks = []
        self._stream_lock = threading.Lock()
        self._stream_done = False

    @property
    def progress(self):
        return self._progress

    def get_stream_chunks(self, since=0):
        with self._stream_lock:
            return self._stream_chunks[since:], self._stream_done

    def _update_progress(self, stage, detail="", percent=0):
        self._progress = {"stage": stage, "detail": detail, "percent": percent}
        print(f"[Progress] {stage}: {detail} ({percent}%)")

    def _emit_chunk(self, text):
        with self._stream_lock:
            self._stream_chunks.append(text)

    def _check_memory(self):
        import psutil
        mem = psutil.virtual_memory()
        available_gb = mem.available / (1024 ** 3)
        if self.device == "cpu" and available_gb < 6:
            raise MemoryError(
                f"Insufficient RAM: {available_gb:.1f} GB available, "
                f"at least 6 GB required for CPU inference."
            )
        if self.device == "cuda":
            gpu_mem = torch.cuda.get_device_properties(0).total_memory / (1024 ** 3)
            if gpu_mem < 4:
                raise MemoryError(
                    f"Insufficient GPU VRAM: {gpu_mem:.1f} GB, "
                    f"at least 4 GB required."
                )

    def load_model(self):
        if self._loaded:
            return

        self._check_memory()

        if self.device == "cuda":
            dtype = torch.bfloat16
        else:
            dtype = torch.float16
            os.environ.setdefault("PYTORCH_NO_CUDA_MEMORY_CACHING", "1")

        self._update_progress("loading_model", "Downloading model weights...", 10)
        t0 = time.time()

        self._update_progress("loading_model", "Loading tokenizer...", 20)
        self.tokenizer = AutoTokenizer.from_pretrained(
            settings.model_name, trust_remote_code=True
        )

        self._update_progress("loading_model", "Loading model to memory...", 40)
        self.model = AutoModel.from_pretrained(
            settings.model_name,
            trust_remote_code=True,
            use_safetensors=True,
            torch_dtype=dtype,
            low_cpu_mem_usage=True,
        )

        if self.device == "cuda":
            self._update_progress("loading_model", "Moving model to GPU...", 70)
            self.model = self.model.cuda()
        self.model = self.model.eval()

        self._loaded = True
        self._load_time = time.time() - t0
        self._update_progress("model_ready", f"Model loaded in {self._load_time:.1f}s", 100)
        print(f"[OCREngine] Model loaded in {self._load_time:.1f}s.")

    def _setup_stream(self):
        with self._stream_lock:
            self._stream_chunks = []
            self._stream_done = False

    def _finalize_stream(self, text):
        with self._stream_lock:
            if text:
                self._stream_chunks = [text]
            self._stream_done = True

    def infer_single(self, image_path: str, output_dir: str) -> dict:
        try:
            self.load_model()
            Path(output_dir).mkdir(parents=True, exist_ok=True)
            self._setup_stream()

            self._update_progress("converting", "Preparing image...", 10)

            if not Path(image_path).exists():
                raise FileNotFoundError(f"Image not found: {image_path}")

            img_size = Path(image_path).stat().st_size / 1024
            self._update_progress("inferring", f"Running OCR on image ({img_size:.0f} KB)...", 30)

            t0 = time.time()

            result_text = None
            try:
                result_text = self.model.infer(
                    self.tokenizer,
                    prompt="<image>document parsing.",
                    image_file=image_path,
                    output_path=output_dir,
                    base_size=settings.base_size,
                    image_size=settings.image_size,
                    crop_mode=settings.crop_mode,
                    max_length=settings.max_length,
                    no_repeat_ngram_size=35,
                    ngram_window=128,
                    save_results=True,
                )
            except TypeError:
                self.model.infer(
                    self.tokenizer,
                    prompt="<image>document parsing.",
                    image_file=image_path,
                    output_path=output_dir,
                    base_size=settings.base_size,
                    image_size=settings.image_size,
                    crop_mode=settings.crop_mode,
                    max_length=settings.max_length,
                    no_repeat_ngram_size=35,
                    ngram_window=128,
                    save_results=True,
                )

            self._last_infer_time = time.time() - t0
            self._track_gpu_mem()
            self._update_progress("decoding", "Reading output files...", 80)

            result = self._read_outputs(output_dir)

            if not result["text"] and result_text:
                text = str(result_text).strip()
                if text:
                    result["text"] = text
                    result["markdown"] = text
                    result["json"] = text

            if not result["text"]:
                result["text"] = "(no text output - model produced no results for this image)"
                result["markdown"] = result["text"]
                result["json"] = result["text"]

            # Progressive streaming: emit text in chunks
            full_text = result["text"]
            self._stream_progressive(full_text)

            char_count = len(full_text)
            self._record_job("single", 1, char_count)
            self._update_progress("done", f"Extracted {char_count} characters", 100)

            print(f"[OCREngine] Single OCR complete: {char_count} chars in {self._last_infer_time:.1f}s")
            return result
        except (MemoryError, torch.cuda.OutOfMemoryError) as e:
            self._update_progress("error", str(e), 0)
            self._unload_model()
            raise RuntimeError(
                f"Out of memory during inference: {e}. "
                f"Try closing other applications or using a smaller image."
            ) from e

    def infer_multi(self, image_paths: list[str], output_dir: str) -> dict:
        try:
            self.load_model()
            Path(output_dir).mkdir(parents=True, exist_ok=True)
            self._setup_stream()

            self._update_progress("converting", f"Preparing {len(image_paths)} pages...", 10)

            for p in image_paths:
                if not Path(p).exists():
                    raise FileNotFoundError(f"Image not found: {p}")

            total_size = sum(Path(p).stat().st_size for p in image_paths) / 1024
            self._update_progress("inferring", f"Running multi-page OCR ({len(image_paths)} pages, {total_size:.0f} KB)...", 30)

            t0 = time.time()

            result_text = None
            try:
                result_text = self.model.infer_multi(
                    self.tokenizer,
                    prompt="<image>Multi page parsing.",
                    image_files=image_paths,
                    output_path=output_dir,
                    image_size=settings.multi_image_size,
                    max_length=settings.max_length,
                    no_repeat_ngram_size=35,
                    ngram_window=1024,
                    save_results=True,
                )
            except TypeError:
                self.model.infer_multi(
                    self.tokenizer,
                    prompt="<image>Multi page parsing.",
                    image_files=image_paths,
                    output_path=output_dir,
                    image_size=settings.multi_image_size,
                    max_length=settings.max_length,
                    no_repeat_ngram_size=35,
                    ngram_window=1024,
                    save_results=True,
                )

            self._last_infer_time = time.time() - t0
            self._track_gpu_mem()
            self._update_progress("decoding", "Reading output files...", 80)

            result = self._read_outputs(output_dir)

            if not result["text"] and result_text:
                text = str(result_text).strip()
                if text:
                    result["text"] = text
                    result["markdown"] = text
                    result["json"] = text

            if not result["text"]:
                result["text"] = "(no text output - model produced no results for these pages)"
                result["markdown"] = result["text"]
                result["json"] = result["text"]

            # Progressive streaming: emit text in chunks
            full_text = result["text"]
            self._stream_progressive(full_text)

            char_count = len(full_text)
            self._record_job("pdf", len(image_paths), char_count)
            self._update_progress("done", f"Extracted {char_count} characters from {len(image_paths)} pages", 100)

            print(f"[OCREngine] Multi OCR complete: {char_count} chars from {len(image_paths)} pages in {self._last_infer_time:.1f}s")
            return result
        except (MemoryError, torch.cuda.OutOfMemoryError) as e:
            self._update_progress("error", str(e), 0)
            self._unload_model()
            raise RuntimeError(
                f"Out of memory during inference: {e}. "
                f"Try using fewer pages or closing other applications."
            ) from e

    def _stream_progressive(self, full_text):
        """Emit text progressively in chunks for streaming display."""
        if not full_text:
            self._finalize_stream("")
            return

        chunk_size = 8
        i = 0
        while i < len(full_text):
            chunk = full_text[i:i + chunk_size]
            self._emit_chunk(chunk)
            i += chunk_size
            # Small delay to make the streaming visible
            time.sleep(0.02)

        self._finalize_stream(full_text)

    def _track_gpu_mem(self):
        if torch.cuda.is_available():
            self._last_gpu_mem_used = round(torch.cuda.memory_allocated(0) / (1024 ** 3), 2)

    def _record_job(self, file_type: str, page_count: int, char_count: int):
        self._total_jobs += 1
        self._total_infer_time += self._last_infer_time
        self._total_chars += char_count
        self._history.append({
            "job_number": self._total_jobs,
            "file_type": file_type,
            "pages": page_count,
            "chars": char_count,
            "time": round(self._last_infer_time, 2),
            "gpu_mem_gb": self._last_gpu_mem_used,
        })

    def _unload_model(self):
        if self.model is not None:
            del self.model
            self.model = None
        if self.tokenizer is not None:
            del self.tokenizer
            self.tokenizer = None
        self._loaded = False
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        print("[OCREngine] Model unloaded to free memory.")

    def _read_outputs(self, output_dir: str) -> dict:
        out = Path(output_dir)
        result = {"text": None, "markdown": None, "json": None}

        if not out.exists():
            print(f"[OCREngine] Output dir does not exist: {out}")
            return result

        files = list(out.iterdir())
        print(f"[OCREngine] Output dir files: {[f.name for f in files]}")

        for f in files:
            if f.is_file():
                try:
                    content = f.read_text(encoding="utf-8")
                    if f.suffix == ".txt":
                        result["text"] = content
                    elif f.suffix == ".md":
                        result["markdown"] = content
                    elif f.suffix == ".json":
                        result["json"] = content
                except Exception as e:
                    print(f"[OCREngine] Error reading {f}: {e}")

        base = result["text"] or result["markdown"] or result["json"] or ""
        if not result["text"]:
            result["text"] = base
        if not result["markdown"]:
            result["markdown"] = base
        if not result["json"]:
            result["json"] = base

        return result

    @property
    def gpu_status(self) -> dict:
        import psutil
        mem = psutil.virtual_memory()
        info = {
            "available": torch.cuda.is_available(),
            "device_name": torch.cuda.get_device_name(0) if torch.cuda.is_available() else None,
            "torch_version": torch.__version__,
            "cuda_version": torch.version.cuda if torch.cuda.is_available() else None,
            "model_loaded": self._loaded,
            "model_load_time": round(self._load_time, 1),
            "ram_total_gb": round(mem.total / (1024 ** 3), 1),
            "ram_available_gb": round(mem.available / (1024 ** 3), 1),
        }
        if self.device == "cuda":
            info["gpu_mem_total_gb"] = round(torch.cuda.get_device_properties(0).total_memory / (1024 ** 3), 1)
            info["gpu_mem_used_gb"] = round(torch.cuda.memory_allocated(0) / (1024 ** 3), 2)
            info["gpu_mem_reserved_gb"] = round(torch.cuda.memory_reserved(0) / (1024 ** 3), 2)
        if not info["available"]:
            avail = info["ram_available_gb"]
            if avail < 6:
                info["warning"] = (
                    f"Low RAM: {avail} GB available. At least 6 GB needed for CPU inference."
                )
            else:
                info["warning"] = (
                    "No CUDA GPU detected. Running on CPU — inference will be 10-50x slower."
                )
        return info

    @property
    def stats(self) -> dict:
        avg_time = (self._total_infer_time / self._total_jobs) if self._total_jobs > 0 else 0
        avg_chars = (self._total_chars / self._total_jobs) if self._total_jobs > 0 else 0
        return {
            "total_jobs": self._total_jobs,
            "total_infer_time": round(self._total_infer_time, 1),
            "total_chars": self._total_chars,
            "avg_time": round(avg_time, 1),
            "avg_chars": round(avg_chars),
            "history": self._history[-20:],
        }


ocr_engine = OCREngine()
