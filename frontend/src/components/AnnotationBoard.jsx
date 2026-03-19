import { useEffect, useMemo, useRef, useState } from "react";
import { createSam2Session, predictSam2Mask } from "../lib/api";

const NOOP = () => {};

const EDITOR_LEVELS = {
  fundo: 1,
  folhagem: 85,
  fruto: 170,
};

const CLASS_LABELS = {
  fundo: "Descarte",
  folhagem: "Folhas",
  fruto: "Fruto",
};

const CLASS_COLORS = {
  fundo: [229, 78, 78],
  folhagem: [109, 201, 255],
  fruto: [245, 210, 74],
};

const LAYER_VISUALS = {
  1: { color: CLASS_COLORS.fundo, alpha: 138 },
  85: { color: CLASS_COLORS.folhagem, alpha: 146 },
  170: { color: CLASS_COLORS.fruto, alpha: 164 },
};

const PREVIEW_BACKGROUND_VISUAL = { color: CLASS_COLORS.fundo, alpha: 112 };

const MAX_HISTORY_ENTRIES = 8;
const FRAME_HORIZONTAL_PADDING = 36;
const MIN_ZOOM_LEVEL = 0.5;
const MAX_ZOOM_LEVEL = 5;
const ZOOM_STEP = 0.25;
const BRUSH_MIN = 6;
const BRUSH_MAX = 96;

const TOOL_OPTIONS = [
  { id: "brush", label: "Pincel" },
  { id: "erase", label: "Borracha" },
  { id: "sam-positive", label: "SAM +" },
  { id: "sam-negative", label: "SAM -" },
  { id: "sam-box", label: "SAM Caixa" },
];

function createClientRequestId(prefix = "request") {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function classColor(classSlug, alpha = 0.45) {
  const [red, green, blue] = CLASS_COLORS[classSlug] || CLASS_COLORS.fruto;
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Nao foi possivel carregar a mascara existente."));
    image.src = src;
  });
}

export default function AnnotationBoard({
  imageFile,
  initialMaskUrl = "",
  selectedClass,
  lockedClassSlugs = [],
  brushSize,
  sam2Status,
  samAllowed = false,
  isPreviewMode = false,
  canSave = false,
  isSaving = false,
  backendAvailable = true,
  backendStatusMessage = "",
  onBrushSizeChange,
  onReadyChange = NOOP,
  onDirtyChange,
  onStepEdit,
  onExportMask,
}) {
  const imageRef = useRef(null);
  const frameRef = useRef(null);
  const displayCanvasRef = useRef(null);
  const maskCanvasRef = useRef(document.createElement("canvas"));
  const suggestionCanvasRef = useRef(document.createElement("canvas"));
  const lastPointRef = useRef(null);
  const boxStartRef = useRef(null);
  const activePointerIdRef = useRef(null);
  const historyRef = useRef([]);
  const dirtyRef = useRef(false);

  const [imageSrc, setImageSrc] = useState("");
  const [imageInfo, setImageInfo] = useState(null);
  const [frameWidth, setFrameWidth] = useState(0);
  const [isDrawing, setIsDrawing] = useState(false);
  const [toolMode, setToolMode] = useState("brush");
  const [zoomLevel, setZoomLevel] = useState(1);
  const [sam2Session, setSam2Session] = useState(null);
  const [sam2RequestState, setSam2RequestState] = useState({ kind: "idle", message: "" });
  const [sam2Points, setSam2Points] = useState([]);
  const [sam2Box, setSam2Box] = useState(null);
  const [draftBox, setDraftBox] = useState(null);
  const [suggestionMeta, setSuggestionMeta] = useState(null);
  const [historyDepth, setHistoryDepth] = useState(0);

  const backendUnavailableMessage =
    backendStatusMessage || "Backend indisponivel ou reiniciando. Aguarde a API voltar.";
  const samEnabled = backendAvailable && samAllowed && Boolean(sam2Status?.available);
  const sam2SessionRequestId = useMemo(
    () => (imageFile ? createClientRequestId("sam2-session") : ""),
    [imageFile]
  );

  useEffect(() => {
    if (!imageFile) {
      setImageSrc("");
      setImageInfo(null);
      setSam2Session(null);
      setSam2Points([]);
      setSam2Box(null);
      setDraftBox(null);
      setSuggestionMeta(null);
      setToolMode("brush");
      setZoomLevel(1);
      historyRef.current = [];
      dirtyRef.current = false;
      setHistoryDepth(0);
      setSam2RequestState({ kind: "idle", message: "" });
      onDirtyChange?.(false);
      onReadyChange(false);
      return undefined;
    }

    const objectUrl = URL.createObjectURL(imageFile);
    setImageSrc(objectUrl);
    setZoomLevel(1);
    historyRef.current = [];
    dirtyRef.current = false;
    setHistoryDepth(0);
    return () => URL.revokeObjectURL(objectUrl);
  }, [imageFile, onReadyChange]);

  useEffect(() => {
    if (!imageSrc) return;
    const image = new Image();
    image.onload = () => {
      imageRef.current = image;
      const displayCanvas = displayCanvasRef.current;
      const maskCanvas = maskCanvasRef.current;
      const suggestionCanvas = suggestionCanvasRef.current;
      displayCanvas.width = image.naturalWidth;
      displayCanvas.height = image.naturalHeight;
      maskCanvas.width = image.naturalWidth;
      maskCanvas.height = image.naturalHeight;
      suggestionCanvas.width = image.naturalWidth;
      suggestionCanvas.height = image.naturalHeight;

      const maskContext = maskCanvas.getContext("2d");
      maskContext.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
      maskContext.fillStyle = "rgb(0, 0, 0)";
      maskContext.fillRect(0, 0, maskCanvas.width, maskCanvas.height);

      const suggestionContext = suggestionCanvas.getContext("2d");
      suggestionContext.clearRect(0, 0, suggestionCanvas.width, suggestionCanvas.height);

      setImageInfo({ width: image.naturalWidth, height: image.naturalHeight });
      renderOverlay();
      onReadyChange(true);
    };
    image.src = imageSrc;
  }, [imageSrc, onReadyChange]);

  useEffect(() => {
    if (!imageInfo) return undefined;
    let isActive = true;

    async function hydrateStoredMask() {
      const maskCanvas = maskCanvasRef.current;
      const maskContext = maskCanvas.getContext("2d");
      const nextImageData = maskContext.createImageData(maskCanvas.width, maskCanvas.height);

      if (!initialMaskUrl) {
        maskContext.putImageData(nextImageData, 0, 0);
        renderOverlay();
        return;
      }

      try {
        const image = await loadImageElement(initialMaskUrl);
        if (!isActive) return;
        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = maskCanvas.width;
        tempCanvas.height = maskCanvas.height;
        const tempContext = tempCanvas.getContext("2d");
        tempContext.drawImage(image, 0, 0, tempCanvas.width, tempCanvas.height);
        const storedMask = tempContext.getImageData(0, 0, tempCanvas.width, tempCanvas.height);

        for (let index = 0; index < storedMask.data.length; index += 4) {
          const value = storedMask.data[index];
          const nextValue =
            value === 2 ? EDITOR_LEVELS.fruto : value === 1 ? EDITOR_LEVELS.folhagem : 0;
          nextImageData.data[index] = nextValue;
          nextImageData.data[index + 1] = nextValue;
          nextImageData.data[index + 2] = nextValue;
          nextImageData.data[index + 3] = 255;
        }

        maskContext.putImageData(nextImageData, 0, 0);
        renderOverlay();
      } catch (error) {
        if (!isActive) return;
        setSam2RequestState({ kind: "error", message: error.message });
      }
    }

    hydrateStoredMask();
    return () => {
      isActive = false;
    };
  }, [imageInfo, imageSrc, initialMaskUrl]);

  useEffect(() => {
    if (!imageInfo) return;
    renderOverlay();
  }, [imageInfo, isPreviewMode, selectedClass, sam2Points, sam2Box, draftBox]);

  useEffect(() => {
    setIsDrawing(false);
    lastPointRef.current = null;
    clearPromptArtifacts();
    if (!samAllowed || isPreviewMode) {
      setToolMode("brush");
    }
    dirtyRef.current = false;
  }, [isPreviewMode, selectedClass, samAllowed]);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return undefined;

    function updateFrameWidth(nextWidth = frame.clientWidth) {
      setFrameWidth(Math.max(nextWidth - FRAME_HORIZONTAL_PADDING, 1));
    }

    updateFrameWidth();
    if (typeof ResizeObserver === "undefined") return undefined;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      updateFrameWidth(entry.contentRect.width);
    });
    observer.observe(frame);
    return () => observer.disconnect();
  }, [imageSrc]);

  useEffect(() => {
    let isActive = true;

    setSam2Session(null);
    setSam2Points([]);
    setSam2Box(null);
    setDraftBox(null);
    clearSuggestion();

    if (!imageFile || !samAllowed) {
      setSam2RequestState({ kind: "idle", message: "" });
      return undefined;
    }

    if (!backendAvailable) {
      setToolMode("brush");
      setSam2RequestState({
        kind: "error",
        message: backendUnavailableMessage,
      });
      return undefined;
    }

    if (!sam2Status) {
      setSam2RequestState({ kind: "loading", message: "Verificando disponibilidade do SAM 2..." });
      return undefined;
    }

    if (!sam2Status.available) {
      setToolMode("brush");
      setSam2RequestState({
        kind: "error",
        message: sam2Status.reason || "SAM 2 indisponivel no backend.",
      });
      return undefined;
    }

    async function bootSession() {
      setSam2RequestState({ kind: "loading", message: "Preparando sessao do SAM 2..." });
      try {
        const payload = await createSam2Session(imageFile, sam2SessionRequestId);
        if (!isActive) return;
        setSam2Session(payload.item);
        setSam2RequestState({
          kind: "success",
          message: "Sessao pronta. Use pontos ou caixa para sugerir a mascara.",
        });
      } catch (error) {
        if (!isActive) return;
        setToolMode("brush");
        setSam2RequestState({ kind: "error", message: error.message });
      }
    }

    bootSession();
    return () => {
      isActive = false;
    };
  }, [backendAvailable, backendUnavailableMessage, imageFile, sam2Status, samAllowed, sam2SessionRequestId]);

  const lockedLevels = useMemo(
    () =>
      lockedClassSlugs
        .map((slug) => EDITOR_LEVELS[slug])
        .filter((value) => Number.isFinite(value)),
    [lockedClassSlugs]
  );

  const fitScale = useMemo(() => {
    if (!imageInfo || !frameWidth) return 1;
    return Math.min(1, frameWidth / imageInfo.width);
  }, [frameWidth, imageInfo]);

  const effectiveScale = useMemo(() => fitScale * zoomLevel, [fitScale, zoomLevel]);
  const zoomLabel = useMemo(() => `${Math.round(zoomLevel * 100)}%`, [zoomLevel]);
  const availableTools = useMemo(
    () =>
      samAllowed
        ? TOOL_OPTIONS
        : TOOL_OPTIONS.filter((tool) => tool.id === "brush" || tool.id === "erase"),
    [samAllowed]
  );
  const visibleLevels = useMemo(() => {
    if (isPreviewMode) return null;
    const levels = new Set([EDITOR_LEVELS[selectedClass], ...lockedLevels].filter((value) => Number.isFinite(value)));
    return levels;
  }, [isPreviewMode, lockedLevels, selectedClass]);

  function syncCurrentStepOccupancy(maskPixels) {
    if (isPreviewMode || !selectedClass || !maskPixels) return;
    const currentLevel = EDITOR_LEVELS[selectedClass];
    if (!Number.isFinite(currentLevel)) return;

    let hasPixels = false;
    for (let index = 0; index < maskPixels.data.length; index += 4) {
      if (maskPixels.data[index] !== currentLevel) continue;
      hasPixels = true;
      break;
    }

    if (dirtyRef.current === hasPixels) return;
    dirtyRef.current = hasPixels;
    onDirtyChange?.(hasPixels);
  }

  function renderOverlay() {
    const displayCanvas = displayCanvasRef.current;
    const maskCanvas = maskCanvasRef.current;
    const suggestionCanvas = suggestionCanvasRef.current;
    if (!displayCanvas || !maskCanvas || !suggestionCanvas || !imageRef.current) return;

    const context = displayCanvas.getContext("2d");
    context.clearRect(0, 0, displayCanvas.width, displayCanvas.height);
    context.drawImage(imageRef.current, 0, 0);

    const maskContext = maskCanvas.getContext("2d");
    const maskPixels = maskContext.getImageData(0, 0, maskCanvas.width, maskCanvas.height);
    const suggestionContext = suggestionCanvas.getContext("2d");
    const suggestionPixels = suggestionContext.getImageData(
      0,
      0,
      suggestionCanvas.width,
      suggestionCanvas.height
    );
    const overlayImage = context.createImageData(maskCanvas.width, maskCanvas.height);
    const selectedOverlay = CLASS_COLORS[selectedClass] || CLASS_COLORS.fruto;

    for (let index = 0; index < maskPixels.data.length; index += 4) {
      const value = maskPixels.data[index];
      const layerVisual =
        value === 0 && isPreviewMode
          ? PREVIEW_BACKGROUND_VISUAL
          : visibleLevels === null || visibleLevels.has(value)
            ? LAYER_VISUALS[value]
            : null;
      if (layerVisual) {
        overlayImage.data[index] = layerVisual.color[0];
        overlayImage.data[index + 1] = layerVisual.color[1];
        overlayImage.data[index + 2] = layerVisual.color[2];
        overlayImage.data[index + 3] = layerVisual.alpha;
      }
      if (suggestionPixels.data[index] > 0) {
        overlayImage.data[index] = selectedOverlay[0];
        overlayImage.data[index + 1] = selectedOverlay[1];
        overlayImage.data[index + 2] = selectedOverlay[2];
        overlayImage.data[index + 3] = 118;
      }
    }

    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = maskCanvas.width;
    tempCanvas.height = maskCanvas.height;
    tempCanvas.getContext("2d").putImageData(overlayImage, 0, 0);
    context.drawImage(tempCanvas, 0, 0);

    const visibleBox = draftBox || sam2Box;
    context.lineWidth = 2;
    context.setLineDash([10, 8]);
    context.strokeStyle = classColor(selectedClass, 0.95);
    if (visibleBox) {
      const { x1, y1, x2, y2 } = visibleBox;
      context.strokeRect(x1, y1, x2 - x1, y2 - y1);
    }
    context.setLineDash([]);

    for (const point of sam2Points) {
      context.beginPath();
      context.fillStyle = point.label === 1 ? "rgba(245, 210, 74, 0.95)" : "rgba(229, 78, 78, 0.95)";
      context.strokeStyle = "rgba(255, 250, 243, 0.95)";
      context.lineWidth = 3;
      context.arc(point.x, point.y, 9, 0, Math.PI * 2);
      context.fill();
      context.stroke();
    }

    syncCurrentStepOccupancy(maskPixels);
  }

  function translatePoint(event) {
    const canvas = displayCanvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    };
  }

  function markDirty() {
    if (!imageInfo) return;
    const maskContext = maskCanvasRef.current.getContext("2d");
    const maskPixels = maskContext.getImageData(0, 0, imageInfo.width, imageInfo.height);
    syncCurrentStepOccupancy(maskPixels);
    onStepEdit?.();
  }

  function captureMaskSnapshot() {
    if (!imageInfo) return;
    const maskContext = maskCanvasRef.current.getContext("2d");
    const imageData = maskContext.getImageData(0, 0, imageInfo.width, imageInfo.height);
    const compactMask = new Uint8ClampedArray(imageInfo.width * imageInfo.height);
    for (let index = 0, pixelIndex = 0; index < imageData.data.length; index += 4, pixelIndex += 1) {
      compactMask[pixelIndex] = imageData.data[index];
    }
    historyRef.current = [...historyRef.current, compactMask].slice(-MAX_HISTORY_ENTRIES);
    setHistoryDepth(historyRef.current.length);
  }

  function restoreMaskSnapshot(snapshot) {
    if (!imageInfo || !snapshot) return;
    const maskContext = maskCanvasRef.current.getContext("2d");
    const nextImageData = maskContext.createImageData(imageInfo.width, imageInfo.height);
    for (let index = 0, pixelIndex = 0; pixelIndex < snapshot.length; index += 4, pixelIndex += 1) {
      const value = snapshot[pixelIndex];
      nextImageData.data[index] = value;
      nextImageData.data[index + 1] = value;
      nextImageData.data[index + 2] = value;
      nextImageData.data[index + 3] = 255;
    }
    maskContext.putImageData(nextImageData, 0, 0);
    renderOverlay();
  }

  function undoLastAction() {
    const nextHistory = [...historyRef.current];
    const previousSnapshot = nextHistory.pop();
    if (!previousSnapshot) return;
    historyRef.current = nextHistory;
    setHistoryDepth(nextHistory.length);
    restoreMaskSnapshot(previousSnapshot);
    clearPromptArtifacts();
    markDirty();
    setSam2RequestState({
      kind: "success",
      message: "Ultima alteracao desfeita.",
    });
  }

  function drawLine(from, to) {
    if (!imageInfo) return;
    const targetLevel = EDITOR_LEVELS[selectedClass];
    const isEraseMode = toolMode === "erase";
    const radius = Math.max(brushSize / 2, 1);
    const minX = Math.max(0, Math.floor(Math.min(from.x, to.x) - radius - 2));
    const minY = Math.max(0, Math.floor(Math.min(from.y, to.y) - radius - 2));
    const maxX = Math.min(imageInfo.width, Math.ceil(Math.max(from.x, to.x) + radius + 2));
    const maxY = Math.min(imageInfo.height, Math.ceil(Math.max(from.y, to.y) + radius + 2));
    const width = Math.max(1, maxX - minX);
    const height = Math.max(1, maxY - minY);

    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = width;
    tempCanvas.height = height;
    const tempContext = tempCanvas.getContext("2d");
    tempContext.lineJoin = "round";
    tempContext.lineCap = "round";
    tempContext.lineWidth = brushSize;
    tempContext.strokeStyle = "rgba(255, 255, 255, 1)";
    tempContext.fillStyle = "rgba(255, 255, 255, 1)";
    tempContext.beginPath();
    tempContext.moveTo(from.x - minX, from.y - minY);
    tempContext.lineTo(to.x - minX, to.y - minY);
    tempContext.stroke();
    tempContext.beginPath();
    tempContext.arc(to.x - minX, to.y - minY, radius, 0, Math.PI * 2);
    tempContext.fill();

    const maskCanvas = maskCanvasRef.current;
    const context = maskCanvas.getContext("2d");
    const currentMask = context.getImageData(minX, minY, width, height);
    const strokeMask = tempContext.getImageData(0, 0, width, height);

    for (let index = 0; index < strokeMask.data.length; index += 4) {
      if (strokeMask.data[index + 3] === 0) continue;
      if (lockedLevels.includes(currentMask.data[index])) continue;
      if (isEraseMode) {
        if (currentMask.data[index] !== targetLevel) continue;
        currentMask.data[index] = 0;
        currentMask.data[index + 1] = 0;
        currentMask.data[index + 2] = 0;
        currentMask.data[index + 3] = 255;
        continue;
      }
      currentMask.data[index] = targetLevel;
      currentMask.data[index + 1] = targetLevel;
      currentMask.data[index + 2] = targetLevel;
      currentMask.data[index + 3] = 255;
    }

    context.putImageData(currentMask, minX, minY);
    renderOverlay();
    markDirty();
  }

  function handlePointerDown(event) {
    if (!imageRef.current || isSaving || isPreviewMode) return;
    event.preventDefault();
    if (event.button !== 0) return;
    activePointerIdRef.current = event.pointerId;
    if (event.currentTarget.setPointerCapture) {
      event.currentTarget.setPointerCapture(event.pointerId);
    }

    const point = translatePoint(event);
    if (toolMode === "sam-positive" || toolMode === "sam-negative") {
      setSam2Points((current) => [
        ...current,
        { ...point, label: toolMode === "sam-positive" ? 1 : 0 },
      ]);
      return;
    }

    if (toolMode === "sam-box") {
      boxStartRef.current = point;
      setDraftBox({ x1: point.x, y1: point.y, x2: point.x, y2: point.y });
      return;
    }

    captureMaskSnapshot();
    setIsDrawing(true);
    lastPointRef.current = point;
    drawLine(point, point);
  }

  function handlePointerMove(event) {
    if (isPreviewMode) return;
    event.preventDefault();
    const currentPoint = translatePoint(event);
    if (toolMode === "sam-box" && boxStartRef.current) {
      setDraftBox({
        x1: boxStartRef.current.x,
        y1: boxStartRef.current.y,
        x2: currentPoint.x,
        y2: currentPoint.y,
      });
      return;
    }
    if (!isDrawing || !lastPointRef.current || (toolMode !== "brush" && toolMode !== "erase")) return;
    drawLine(lastPointRef.current, currentPoint);
    lastPointRef.current = currentPoint;
  }

  function endDrawing(event) {
    if (event) {
      event.preventDefault();
      if (
        activePointerIdRef.current !== null &&
        event.currentTarget.releasePointerCapture &&
        event.currentTarget.hasPointerCapture?.(activePointerIdRef.current)
      ) {
        event.currentTarget.releasePointerCapture(activePointerIdRef.current);
      }
    }

    activePointerIdRef.current = null;
    if (isPreviewMode) return;
    if (toolMode === "sam-box" && boxStartRef.current && draftBox) {
      setSam2Box({
        x1: Math.min(draftBox.x1, draftBox.x2),
        y1: Math.min(draftBox.y1, draftBox.y2),
        x2: Math.max(draftBox.x1, draftBox.x2),
        y2: Math.max(draftBox.y1, draftBox.y2),
      });
      setDraftBox(null);
      boxStartRef.current = null;
      return;
    }

    if (!isDrawing) return;
    setIsDrawing(false);
    lastPointRef.current = null;
  }

  function resetCurrentStepMask() {
    if (!imageInfo || isSaving) return;
    captureMaskSnapshot();
    const maskCanvas = maskCanvasRef.current;
    const context = maskCanvas.getContext("2d");
    const maskImage = context.getImageData(0, 0, maskCanvas.width, maskCanvas.height);
    const currentLevel = EDITOR_LEVELS[selectedClass];
    for (let index = 0; index < maskImage.data.length; index += 4) {
      if (maskImage.data[index] !== currentLevel) continue;
      maskImage.data[index] = 0;
      maskImage.data[index + 1] = 0;
      maskImage.data[index + 2] = 0;
      maskImage.data[index + 3] = 255;
    }
    context.putImageData(maskImage, 0, 0);
    clearPromptArtifacts();
    renderOverlay();
    markDirty();
    setSam2RequestState({
      kind: "success",
      message: `${CLASS_LABELS[selectedClass] || selectedClass} reiniciado nesta etapa.`,
    });
  }

  function buildMaskBlob() {
    return new Promise((resolve) => {
      maskCanvasRef.current.toBlob((blob) => resolve(blob), "image/png");
    });
  }

  async function exportMask() {
    if (isSaving || !canSave || !backendAvailable) return;
    const blob = await buildMaskBlob();
    if (!blob) return;
    await onExportMask(blob);
  }

  function clearSuggestion() {
    const canvas = suggestionCanvasRef.current;
    const context = canvas.getContext("2d");
    context.clearRect(0, 0, canvas.width, canvas.height);
    setSuggestionMeta(null);
  }

  function clearPromptArtifacts() {
    setSam2Points([]);
    setSam2Box(null);
    setDraftBox(null);
    clearSuggestion();
    renderOverlay();
  }

  function handleToolChange(nextTool) {
    if (isPreviewMode) return;
    if (!["brush", "erase"].includes(nextTool) && !samEnabled) return;
    setToolMode(nextTool);
  }

  function updateZoom(nextZoom) {
    setZoomLevel(Math.min(MAX_ZOOM_LEVEL, Math.max(MIN_ZOOM_LEVEL, nextZoom)));
  }

  async function requestSuggestion() {
    if (!backendAvailable) {
      setSam2RequestState({ kind: "error", message: backendUnavailableMessage });
      return;
    }
    if (!sam2Session?.id || isSaving || isPreviewMode) return;
    if (!sam2Points.length && !sam2Box) {
      setSam2RequestState({
        kind: "error",
        message: "Adicione um clique ou uma caixa antes de pedir a sugestao do SAM 2.",
      });
      return;
    }
    setSam2RequestState({ kind: "loading", message: "Gerando mascara sugerida..." });
    try {
      const payload = await predictSam2Mask(sam2Session.id, {
        points: sam2Points.map(({ x, y, label }) => ({ x, y, label })),
        box: sam2Box,
        multimask_output: false,
      });
      await drawSuggestionMask(payload.item.mask_png_base64);
      setSuggestionMeta({ score: payload.item.score });
      setSam2RequestState({
        kind: "success",
        message: "Sugestao pronta. Revise e aplique na camada atual.",
      });
    } catch (error) {
      setSam2RequestState({ kind: "error", message: error.message });
    }
  }

  function drawSuggestionMask(base64Mask) {
    return new Promise((resolve) => {
      const image = new Image();
      image.onload = () => {
        const canvas = suggestionCanvasRef.current;
        const context = canvas.getContext("2d");
        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = canvas.width;
        tempCanvas.height = canvas.height;
        const tempContext = tempCanvas.getContext("2d");
        tempContext.clearRect(0, 0, tempCanvas.width, tempCanvas.height);
        tempContext.drawImage(image, 0, 0, tempCanvas.width, tempCanvas.height);

        const suggestionImage = tempContext.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
        if (lockedLevels.length > 0) {
          const maskContext = maskCanvasRef.current.getContext("2d");
          const currentMask = maskContext.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
          for (let index = 0; index < suggestionImage.data.length; index += 4) {
            if (suggestionImage.data[index + 3] === 0) continue;
            if (!lockedLevels.includes(currentMask.data[index])) continue;
            suggestionImage.data[index] = 0;
            suggestionImage.data[index + 1] = 0;
            suggestionImage.data[index + 2] = 0;
            suggestionImage.data[index + 3] = 0;
          }
        }

        context.clearRect(0, 0, canvas.width, canvas.height);
        context.putImageData(suggestionImage, 0, 0);
        renderOverlay();
        resolve();
      };
      image.src = `data:image/png;base64,${base64Mask}`;
    });
  }

  async function applySuggestion() {
    if (isSaving || isPreviewMode) return;
    const maskCanvas = maskCanvasRef.current;
    const suggestionCanvas = suggestionCanvasRef.current;
    const maskContext = maskCanvas.getContext("2d");
    const suggestionContext = suggestionCanvas.getContext("2d");
    const maskImage = maskContext.getImageData(0, 0, maskCanvas.width, maskCanvas.height);
    const suggestionImage = suggestionContext.getImageData(
      0,
      0,
      suggestionCanvas.width,
      suggestionCanvas.height
    );
    const level = EDITOR_LEVELS[selectedClass];
    let appliedPixels = 0;

    captureMaskSnapshot();
    for (let index = 0; index < suggestionImage.data.length; index += 4) {
      if (suggestionImage.data[index] === 0) continue;
      if (lockedLevels.includes(maskImage.data[index])) continue;
      if (maskImage.data[index] === level) continue;
      maskImage.data[index] = level;
      maskImage.data[index + 1] = level;
      maskImage.data[index + 2] = level;
      maskImage.data[index + 3] = 255;
      appliedPixels += 1;
    }

    if (!appliedPixels) {
      historyRef.current = historyRef.current.slice(0, -1);
      setHistoryDepth(historyRef.current.length);
      setSam2RequestState({
        kind: "error",
        message: "A sugestao nao trouxe novos pixels para esta etapa.",
      });
      return;
    }

    maskContext.putImageData(maskImage, 0, 0);
    clearPromptArtifacts();
    renderOverlay();
    markDirty();
    setSam2RequestState({
      kind: "success",
      message: "Sugestao aplicada. Revise a camada e siga para o Preview quando terminar.",
    });
  }

  return (
    <div className="annotator annotator--single-column">
      <div className="annotator__control-bar">
        <label className="inline-control">
          <span>Zoom {zoomLabel}</span>
          <input
            className="inline-control__range"
            type="range"
            min={MIN_ZOOM_LEVEL * 100}
            max={MAX_ZOOM_LEVEL * 100}
            step={ZOOM_STEP * 100}
            value={Math.round(zoomLevel * 100)}
            onChange={(event) => updateZoom(Number(event.target.value) / 100)}
            disabled={!imageInfo}
          />
        </label>

        {!isPreviewMode ? (
          <label className="inline-control">
            <span>Pincel {brushSize}px</span>
            <input
              className="inline-control__range"
              type="range"
              min={BRUSH_MIN}
              max={BRUSH_MAX}
              value={brushSize}
              onChange={(event) => onBrushSizeChange(Number(event.target.value))}
              disabled={!imageInfo || isSaving}
            />
          </label>
        ) : (
          <div className="annotator__legend">
            <span className="legend-chip" style={{ "--chip-color": classColor("fruto", 1) }}>
              Fruto
            </span>
            <span className="legend-chip" style={{ "--chip-color": classColor("folhagem", 1) }}>
              Folhas
            </span>
            <span className="legend-chip" style={{ "--chip-color": classColor("fundo", 1) }}>
              Descarte
            </span>
          </div>
        )}

        {!isPreviewMode ? (
          <div className="annotator__toolset">
            {availableTools.map((tool) => (
              <button
                key={tool.id}
                type="button"
                className={`tool-chip${toolMode === tool.id ? " tool-chip--active" : ""}`}
                disabled={
                  (!["brush", "erase"].includes(tool.id) && !samEnabled) || !imageInfo || isSaving
                }
                onClick={() => handleToolChange(tool.id)}
              >
                {tool.label}
              </button>
            ))}
          </div>
        ) : (
          <div className="annotator__preview-label">Preview final da anotacao</div>
        )}

        <div className="annotator__actions">
          {!isPreviewMode ? <span className="annotator__counter">Pontos: {sam2Points.length}</span> : null}
          {!isPreviewMode ? (
            <button
              className="button button--ghost"
              type="button"
              onClick={undoLastAction}
              disabled={!historyDepth || isSaving}
            >
              Desfazer
            </button>
          ) : null}
          {!isPreviewMode ? (
            <button
              className="button button--ghost"
              type="button"
              onClick={resetCurrentStepMask}
              disabled={!imageInfo || isSaving}
            >
              Reiniciar etapa
            </button>
          ) : null}
          {canSave ? (
            <button
              className="button"
              type="button"
              onClick={exportMask}
              disabled={!backendAvailable || !imageInfo || isSaving}
            >
              {isSaving ? <span className="button-spinner" aria-hidden="true" /> : null}
              {isSaving ? "Salvando..." : "Salvar anotacao"}
            </button>
          ) : null}
        </div>
      </div>

      {canSave && !backendAvailable ? (
        <div className="status status--error status--inline">
          <span>{backendUnavailableMessage}</span>
        </div>
      ) : null}

      {samAllowed && !isPreviewMode ? (
        <div className="annotator__sam-panel">
          <div className="annotator__sam-actions">
            <button
              className="button button--ghost"
              type="button"
              onClick={requestSuggestion}
              disabled={!backendAvailable || !sam2Session?.id || (!sam2Points.length && !sam2Box) || isSaving}
            >
              Sugerir com SAM 2
            </button>
            <button
              className="button button--ghost"
              type="button"
              onClick={applySuggestion}
              disabled={!suggestionMeta || isSaving}
            >
              Aplicar sugestao
            </button>
            <button
              className="button button--ghost"
              type="button"
              onClick={clearPromptArtifacts}
              disabled={(!sam2Points.length && !sam2Box && !suggestionMeta) || isSaving}
            >
              Limpar prompts
            </button>
          </div>
          {sam2RequestState.message ? (
            <div className={`status status--${sam2RequestState.kind} status--inline`}>
              {sam2RequestState.kind === "loading" ? <span className="button-spinner" aria-hidden="true" /> : null}
              <span>{sam2RequestState.message}</span>
              {suggestionMeta?.score ? <span>Score {suggestionMeta.score}</span> : null}
              {lockedClassSlugs.length ? (
                <span>
                  Protegidas: {lockedClassSlugs.map((slug) => CLASS_LABELS[slug] || slug).join(", ")}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {!imageSrc ? (
        <div className="annotator__frame annotator__frame--empty">
          <div className="annotator__placeholder">Selecione uma imagem no primeiro card do wizard.</div>
        </div>
      ) : (
        <div className="annotator__frame" ref={frameRef}>
          <canvas
            ref={displayCanvasRef}
            className="annotator__canvas"
            style={
              imageInfo
                ? {
                    width: `${Math.round(imageInfo.width * effectiveScale)}px`,
                    height: `${Math.round(imageInfo.height * effectiveScale)}px`,
                    cursor: isPreviewMode ? "default" : undefined,
                  }
                : undefined
            }
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={endDrawing}
            onPointerLeave={endDrawing}
            onPointerCancel={endDrawing}
            onContextMenu={(event) => event.preventDefault()}
          />
        </div>
      )}
    </div>
  );
}
