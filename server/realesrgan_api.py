from __future__ import annotations

from io import BytesIO
import os
from pathlib import Path
import sys
import types
from typing import Literal

import cv2
import numpy as np
import torch

# Compatibility shim: some BasicSR versions import
# `torchvision.transforms.functional_tensor.rgb_to_grayscale`,
# which is removed in newer torchvision releases.
try:
    from torchvision.transforms import functional as tv_functional

    if "torchvision.transforms.functional_tensor" not in sys.modules:
        functional_tensor_mod = types.ModuleType(
            "torchvision.transforms.functional_tensor"
        )
        functional_tensor_mod.rgb_to_grayscale = tv_functional.rgb_to_grayscale
        sys.modules["torchvision.transforms.functional_tensor"] = functional_tensor_mod
except Exception:
    # If torchvision is unavailable or import fails, let downstream imports raise
    # a clear error as before.
    pass

from basicsr.archs.rrdbnet_arch import RRDBNet
from basicsr.utils.download_util import load_file_from_url
from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from gfpgan import GFPGANer
from realesrgan import RealESRGANer

app = FastAPI(title="Image Enhancer API", version="1.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

API_KEY = os.getenv("ENHANCER_API_KEY", "").strip()
ENABLE_FACE_ENHANCE = os.getenv("ENABLE_FACE_ENHANCE", "0").strip().lower() in {
    "1",
    "true",
    "yes",
    "on",
}

WEIGHTS_DIR = (
    Path(__file__).resolve().parent.parent / "outputs" / "realesrgan" / "weights"
)
WEIGHTS_DIR.mkdir(parents=True, exist_ok=True)

_x2_upsampler: RealESRGANer | None = None
_x4_upsampler: RealESRGANer | None = None
_face_enhancer: GFPGANer | None = None


def get_x2_upsampler() -> RealESRGANer:
  global _x2_upsampler
  if _x2_upsampler is not None:
      return _x2_upsampler

  model_path = load_file_from_url(
      url=(
          "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.1/"
          "RealESRGAN_x2plus.pth"
      ),
      model_dir=str(WEIGHTS_DIR),
      progress=True,
      file_name=None,
  )
  model = RRDBNet(
      num_in_ch=3,
      num_out_ch=3,
      num_feat=64,
      num_block=23,
      num_grow_ch=32,
      scale=2,
  )
  _x2_upsampler = RealESRGANer(
      scale=2,
      model_path=model_path,
      model=model,
      tile=200,
      tile_pad=10,
      pre_pad=0,
      half=False,
      device=torch.device("cpu"),
  )
  return _x2_upsampler


def get_x4_upsampler() -> RealESRGANer:
  global _x4_upsampler
  if _x4_upsampler is not None:
      return _x4_upsampler

  model_path = load_file_from_url(
      url=(
          "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.1.0/"
          "RealESRGAN_x4plus.pth"
      ),
      model_dir=str(WEIGHTS_DIR),
      progress=True,
      file_name=None,
  )
  model = RRDBNet(
      num_in_ch=3,
      num_out_ch=3,
      num_feat=64,
      num_block=23,
      num_grow_ch=32,
      scale=4,
  )
  _x4_upsampler = RealESRGANer(
      scale=4,
      model_path=model_path,
      model=model,
      tile=200,
      tile_pad=10,
      pre_pad=0,
      half=False,
      device=torch.device("cpu"),
  )
  return _x4_upsampler


def get_face_enhancer() -> GFPGANer:
  global _face_enhancer
  if _face_enhancer is not None:
      return _face_enhancer

  model_path = load_file_from_url(
      url=(
          "https://github.com/TencentARC/GFPGAN/releases/download/v1.3.0/"
          "GFPGANv1.4.pth"
      ),
      model_dir=str(WEIGHTS_DIR),
      progress=True,
      file_name=None,
  )
  _face_enhancer = GFPGANer(
      model_path=model_path,
      upscale=1,
      arch="clean",
      channel_multiplier=2,
      bg_upsampler=None,
      device=torch.device("cpu"),
  )
  return _face_enhancer


def decode_image(raw: bytes) -> np.ndarray:
  np_arr = np.frombuffer(raw, np.uint8)
  image = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
  if image is None:
      raise HTTPException(status_code=400, detail="Invalid image data")
  return image


def weight_from_mode(mode: str) -> float:
  mapping: dict[str, float] = {
      "fidelity": 0.25,
      "balanced": 0.45,
      "sharp": 0.70,
  }
  return mapping.get(mode, 0.25)


def verify_api_key(
  authorization: str | None = Header(default=None),
  x_api_key: str | None = Header(default=None),
) -> None:
  if not API_KEY:
      return

  bearer = ""
  if authorization and authorization.lower().startswith("bearer "):
      bearer = authorization[7:].strip()

  if bearer == API_KEY or (x_api_key or "").strip() == API_KEY:
      return

  raise HTTPException(status_code=401, detail="Unauthorized")


@app.get("/health")
def health() -> dict[str, str | bool]:
  return {
      "status": "ok",
      "auth_required": bool(API_KEY),
      "face_enhance_enabled": ENABLE_FACE_ENHANCE,
  }


@app.post("/enhance")
async def enhance(
  _: None = Depends(verify_api_key),
  image: UploadFile = File(...),
  scale: Literal["2", "4"] = Form("2"),
  mode: Literal["fidelity", "balanced", "sharp"] = Form("fidelity"),
) -> Response:
  raw = await image.read()
  if not raw:
      raise HTTPException(status_code=400, detail="Empty file")

  src = decode_image(raw)

  try:
      upsampler = get_x4_upsampler() if scale == "4" else get_x2_upsampler()
      upscaled, _ = upsampler.enhance(src, outscale=int(scale))
      restored = upscaled
      if ENABLE_FACE_ENHANCE:
          try:
              face_enhancer = get_face_enhancer()
              _, _, restored = face_enhancer.enhance(
                  upscaled,
                  has_aligned=False,
                  only_center_face=False,
                  paste_back=True,
                  weight=weight_from_mode(mode),
              )
          except Exception:
              # Fail open for cloud stability: if face enhancement fails,
              # still return Real-ESRGAN output instead of crashing request.
              restored = upscaled

      ok, encoded = cv2.imencode(".png", restored)
      if not ok:
          raise RuntimeError("PNG encoding failed")
      return Response(content=BytesIO(encoded.tobytes()).getvalue(), media_type="image/png")
  except HTTPException:
      raise
  except Exception as exc:
      raise HTTPException(status_code=500, detail=f"Enhancement failed: {exc}") from exc
