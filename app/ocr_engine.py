import gc
import os
import torch
import psutil
from pathlib import Path
from transformers import AutoModel, AutoTokenizer
from app.config import settings


class OCREngine:
    def __init__(self):
        self.model = None
        self.tokenizer = None
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self._loaded = False

    def _check_memory(self):
        mem = psutil.virtual_memory()
        available_gb = mem.available / (1024 ** 3)
        if self.device == "cpu" and available_gb < 6:
            raise MemoryError(
                f"Insufficient RAM: {available_gb:.1f} GB available, "
                f"at least 6 GB required for CPU inference. "
                f"Close other applications or increase your page file size."
            )
        if self.device == "cuda":
            gpu_mem = torch.cuda.get_device_properties(0).total_mem / (1024 ** 3)
            if gpu_mem < 4:
                raise MemoryError(
                    f"Insufficient GPU VRAM: {gpu_mem:.1f} GB, "
                    f"at least 4 GB required."
                )

    def load_model(self):
        if self._loaded:
            return

        self._check_memory()

        # Use float16 on CPU to halve memory (3B * 2 bytes = ~6GB instead of ~12GB)
        if self.device == "cuda":
            dtype = torch.bfloat16
        else:
            dtype = torch.float16
            # Force low memory usage on CPU
            os.environ.setdefault("PYTORCH_NO_CUDA_MEMORY_CACHING", "1")

        print(f"[OCREngine] Loading model on {self.device} with {dtype}...")
        self.tokenizer = AutoTokenizer.from_pretrained(
            settings.model_name, trust_remote_code=True
        )
        self.model = AutoModel.from_pretrained(
            settings.model_name,
            trust_remote_code=True,
            use_safetensors=True,
            torch_dtype=dtype,
            low_cpu_mem_usage=True,
        )
        if self.device == "cuda":
            self.model = self.model.cuda()
        self.model = self.model.eval()
        self._loaded = True
        print("[OCREngine] Model loaded successfully.")

    def infer_single(self, image_path: str, output_dir: str) -> dict:
        try:
            self.load_model()
            Path(output_dir).mkdir(parents=True, exist_ok=True)

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
            return self._read_outputs(output_dir)
        except (MemoryError, torch.cuda.OutOfMemoryError) as e:
            self._unload_model()
            raise RuntimeError(
                f"Out of memory during inference: {e}. "
                f"Try closing other applications or using a smaller image."
            ) from e

    def infer_multi(self, image_paths: list[str], output_dir: str) -> dict:
        try:
            self.load_model()
            Path(output_dir).mkdir(parents=True, exist_ok=True)

            self.model.infer_multi(
                self.tokenizer,
                prompt="<image>Multi page parsing.",
                image_files=image_paths,
                output_path=output_dir,
                image_size=settings.multi_image_size,
                max_length=settings.max_length,
            )
            return self._read_outputs(output_dir)
        except (MemoryError, torch.cuda.OutOfMemoryError) as e:
            self._unload_model()
            raise RuntimeError(
                f"Out of memory during inference: {e}. "
                f"Try using fewer pages or closing other applications."
            ) from e

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
            return result

        for f in out.iterdir():
            if f.suffix == ".txt":
                result["text"] = f.read_text(encoding="utf-8")
            elif f.suffix == ".md":
                result["markdown"] = f.read_text(encoding="utf-8")
            elif f.suffix == ".json":
                result["json"] = f.read_text(encoding="utf-8")

        base = result["text"] or result["markdown"] or ""
        if not result["text"]:
            result["text"] = base
        if not result["markdown"]:
            result["markdown"] = base
        if not result["json"]:
            result["json"] = base

        return result

    @property
    def gpu_status(self) -> dict:
        mem = psutil.virtual_memory()
        info = {
            "available": torch.cuda.is_available(),
            "device_name": torch.cuda.get_device_name(0) if torch.cuda.is_available() else None,
            "torch_version": torch.__version__,
            "cuda_version": torch.version.cuda if torch.cuda.is_available() else None,
            "model_loaded": self._loaded,
            "ram_total_gb": round(mem.total / (1024 ** 3), 1),
            "ram_available_gb": round(mem.available / (1024 ** 3), 1),
        }
        if not info["available"]:
            avail = info["ram_available_gb"]
            if avail < 6:
                info["warning"] = (
                    f"Low RAM: {avail} GB available. At least 6 GB needed for CPU inference. "
                    f"Close other applications or increase your page file size."
                )
            else:
                info["warning"] = (
                    "No CUDA GPU detected. Running on CPU — inference will be 10-50x slower. "
                    f"You have {avail} GB RAM available."
                )
        return info


ocr_engine = OCREngine()
