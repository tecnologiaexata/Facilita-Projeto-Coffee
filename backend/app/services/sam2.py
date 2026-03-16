import base64
import json
from contextlib import nullcontext
from io import BytesIO
from pathlib import Path
from uuid import uuid4

import numpy as np
from fastapi import HTTPException, UploadFile
from pydantic import BaseModel, Field
from PIL import Image

from app.config import (
    SAM2_CHECKPOINT,
    SAM2_CONFIG,
    SAM2_DEVICE,
    SAM2_ENABLED,
    SAM2_SESSIONS_DIR,
)
from app.services.monitoring import tracked_task
from app.services.storage import ensure_directory, ensure_storage, now_iso, write_json


class Sam2Point(BaseModel):
    x: float
    y: float
    label: int = Field(..., ge=0, le=1)


class Sam2Box(BaseModel):
    x1: float
    y1: float
    x2: float
    y2: float


class Sam2PredictRequest(BaseModel):
    points: list[Sam2Point] = Field(default_factory=list)
    box: Sam2Box | None = None
    multimask_output: bool = False


class Sam2Runtime:
    def __init__(self) -> None:
        self._predictor = None
        self._import_error: str | None = None
        self._load_error: str | None = None
        self._torch = None
        self._load_optional_modules()

    def _load_optional_modules(self) -> None:
        if not SAM2_ENABLED:
            return
        try:
            import torch  # type: ignore
            from sam2.build_sam import build_sam2  # type: ignore
            from sam2.sam2_image_predictor import SAM2ImagePredictor  # type: ignore

            self._torch = torch
            self._build_sam2 = build_sam2
            self._predictor_cls = SAM2ImagePredictor
        except Exception as exc:  # pragma: no cover - runtime-only optional dependency
            self._import_error = str(exc)

    def status(self) -> dict:
        checkpoint_exists = SAM2_CHECKPOINT.exists()
        available = (
            SAM2_ENABLED
            and self._import_error is None
            and checkpoint_exists
            and self._load_error is None
        )
        reason = None
        if not SAM2_ENABLED:
            reason = "SAM 2 desativado por ambiente."
        elif self._import_error:
            reason = f"SAM 2 nao instalado no backend: {self._import_error}"
        elif not checkpoint_exists:
            reason = f"Checkpoint nao encontrado em {SAM2_CHECKPOINT}"
        elif self._load_error:
            reason = self._load_error
        return {
            "enabled": SAM2_ENABLED,
            "available": available,
            "device": SAM2_DEVICE,
            "config": SAM2_CONFIG,
            "checkpoint_path": str(SAM2_CHECKPOINT),
            "checkpoint_exists": checkpoint_exists,
            "reason": reason,
            "model_loaded": self._predictor is not None,
        }

    def _predictor_context(self):
        if SAM2_DEVICE.startswith("cuda"):
            return self._torch.autocast("cuda", dtype=self._torch.bfloat16)
        return nullcontext()

    def get_predictor(self):
        if self._predictor is not None:
            return self._predictor
        if not SAM2_ENABLED:
            raise HTTPException(status_code=503, detail="SAM 2 nao esta habilitado neste ambiente.")
        if self._import_error:
            raise HTTPException(status_code=503, detail=f"SAM 2 nao instalado: {self._import_error}")
        if not SAM2_CHECKPOINT.exists():
            raise HTTPException(
                status_code=503,
                detail=f"Checkpoint SAM 2 nao encontrado em {SAM2_CHECKPOINT}",
            )
        try:
            model = self._build_sam2(SAM2_CONFIG, str(SAM2_CHECKPOINT), device=SAM2_DEVICE)
            self._predictor = self._predictor_cls(model)
            return self._predictor
        except Exception as exc:  # pragma: no cover - runtime-only optional dependency
            self._load_error = f"Falha ao carregar SAM 2: {exc}"
            raise HTTPException(status_code=503, detail=self._load_error) from exc

    def predict(self, image_rgb: np.ndarray, request: Sam2PredictRequest) -> dict:
        predictor = self.get_predictor()
        point_coords = None
        point_labels = None
        if request.points:
            point_coords = np.array([[point.x, point.y] for point in request.points], dtype=np.float32)
            point_labels = np.array([point.label for point in request.points], dtype=np.int32)
        box = None
        if request.box is not None:
            box = np.array(
                [request.box.x1, request.box.y1, request.box.x2, request.box.y2],
                dtype=np.float32,
            )

        with self._torch.inference_mode(), self._predictor_context():
            predictor.set_image(image_rgb)
            masks, scores, _ = predictor.predict(
                point_coords=point_coords,
                point_labels=point_labels,
                box=box,
                multimask_output=request.multimask_output,
            )

        if masks.ndim == 2:
            masks = masks[None, ...]
        best_index = int(np.argmax(scores)) if np.ndim(scores) else 0
        best_mask = masks[best_index].astype(np.uint8) * 255
        image = Image.fromarray(best_mask, mode="L")
        buffer = BytesIO()
        image.save(buffer, format="PNG")
        return {
            "width": int(best_mask.shape[1]),
            "height": int(best_mask.shape[0]),
            "score": round(float(scores[best_index]), 4) if np.ndim(scores) else None,
            "mask_png_base64": base64.b64encode(buffer.getvalue()).decode("ascii"),
        }


SAM2_RUNTIME = Sam2Runtime()


def sam2_session_paths(session_id: str) -> dict[str, Path]:
    base_dir = SAM2_SESSIONS_DIR / session_id
    return {
        "base": base_dir,
        "image": base_dir / "image.png",
        "metadata": base_dir / "session.json",
    }


def read_upload_image(upload: UploadFile) -> Image.Image:
    try:
        payload = upload.file.read()
        return Image.open(BytesIO(payload)).convert("RGB")
    except Exception as exc:  # pragma: no cover - defensive
        raise HTTPException(status_code=400, detail="Nao foi possivel abrir a imagem enviada.") from exc


def create_sam2_session(image: UploadFile) -> dict:
    with tracked_task(
        kind="sam2_session",
        label="Criar sessao SAM 2",
        metadata={"filename": image.filename or "imagem.png"},
    ) as task:
        ensure_storage()
        if not SAM2_RUNTIME.status()["available"]:
            status = SAM2_RUNTIME.status()
            raise HTTPException(status_code=503, detail=status["reason"] or "SAM 2 indisponivel.")

        task.update(phase="Persistindo imagem da sessao")
        session_id = f"sam2_{uuid4().hex[:12]}"
        paths = sam2_session_paths(session_id)
        ensure_directory(paths["base"])
        pil_image = read_upload_image(image)
        pil_image.save(paths["image"])
        payload = {
            "id": session_id,
            "created_at": now_iso(),
            "original_filename": image.filename or f"{session_id}.png",
            "width": pil_image.width,
            "height": pil_image.height,
        }
        write_json(paths["metadata"], payload)
        task.update(phase="Concluido", metadata={"session_id": session_id})
        return payload


def load_session_image(session_id: str) -> np.ndarray:
    paths = sam2_session_paths(session_id)
    if not paths["image"].exists():
        raise HTTPException(status_code=404, detail="Sessao SAM 2 nao encontrada.")
    return np.array(Image.open(paths["image"]).convert("RGB"))


def predict_for_session(session_id: str, request: Sam2PredictRequest) -> dict:
    with tracked_task(
        kind="sam2_predict",
        label="Predicao SAM 2",
        metadata={
            "session_id": session_id,
            "points": len(request.points),
            "has_box": request.box is not None,
        },
    ) as task:
        if not request.points and request.box is None:
            raise HTTPException(
                status_code=400,
                detail="Envie pelo menos um clique positivo/negativo ou uma caixa para usar o SAM 2.",
            )
        task.update(phase="Carregando imagem da sessao")
        image_rgb = load_session_image(session_id)
        task.update(phase="Executando SAM 2")
        payload = SAM2_RUNTIME.predict(image_rgb, request)
        task.update(phase="Concluido")
        return {"session_id": session_id, **payload}


def sam2_status() -> dict:
    ensure_storage()
    return SAM2_RUNTIME.status()
