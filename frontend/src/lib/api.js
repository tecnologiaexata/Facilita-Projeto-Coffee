const RETRIABLE_STATUS_CODES = new Set([408, 425, 429, 502, 503, 504]);
const NETWORK_ERROR_MESSAGE =
  "Nao foi possivel conectar ao backend. Verifique se a API e o proxy do frontend estao ativos.";
const TEMPORARY_BACKEND_ERROR_MESSAGE =
  "Backend temporariamente indisponivel. Aguarde alguns segundos e tente novamente.";

async function readJson(response) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return response.json();
  }
  return { detail: await response.text() };
}

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function methodAllowsRetry(method) {
  return ["GET", "HEAD", "OPTIONS"].includes(method);
}

function isNetworkError(error) {
  return error instanceof TypeError || error?.name === "AbortError";
}

function buildHttpErrorMessage(response, payload) {
  if (RETRIABLE_STATUS_CODES.has(response.status)) {
    return TEMPORARY_BACKEND_ERROR_MESSAGE;
  }

  const detail =
    typeof payload?.detail === "string"
      ? payload.detail.trim()
      : typeof payload?.message === "string"
        ? payload.message.trim()
        : "";

  if (!detail) {
    return "Falha na requisicao.";
  }

  if (detail.startsWith("<") || detail.toLowerCase().includes("<html")) {
    return response.status >= 500 ? TEMPORARY_BACKEND_ERROR_MESSAGE : "Falha na requisicao.";
  }

  return detail;
}

async function request(path, options = {}) {
  const { retry, ...fetchOptions } = options;
  const method = (fetchOptions.method || "GET").toUpperCase();
  const safeToRetry = retry?.safeToRetry ?? methodAllowsRetry(method);
  const attempts = Math.max(1, retry?.attempts ?? (safeToRetry ? 3 : 1));
  const baseDelayMs = Math.max(150, retry?.baseDelayMs ?? 600);

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(path, fetchOptions);
      const payload = await readJson(response);
      if (response.ok) {
        return payload;
      }

      const shouldRetry = safeToRetry && attempt < attempts - 1 && RETRIABLE_STATUS_CODES.has(response.status);
      if (shouldRetry) {
        await sleep(baseDelayMs * (attempt + 1));
        continue;
      }

      throw new Error(buildHttpErrorMessage(response, payload));
    } catch (error) {
      const shouldRetry = safeToRetry && attempt < attempts - 1 && isNetworkError(error);
      if (shouldRetry) {
        await sleep(baseDelayMs * (attempt + 1));
        continue;
      }

      if (isNetworkError(error)) {
        throw new Error(NETWORK_ERROR_MESSAGE);
      }

      throw error;
    }
  }

  throw new Error(TEMPORARY_BACKEND_ERROR_MESSAGE);
}

function withQuery(path, params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    query.set(key, String(value));
  });
  const serialized = query.toString();
  return serialized ? `${path}?${serialized}` : path;
}

export function getMeta() {
  return request("/api/meta");
}

export function getHealth(options = {}) {
  return request("/api/health", options);
}

export function getMonitoring() {
  return request("/api/monitoring");
}

export function getSam2Status() {
  return request("/api/sam2/status");
}

export function getAnnotations(params = {}) {
  return request(withQuery("/api/annotations", params));
}

export function getAnnotation(sampleId) {
  return request(`/api/annotations/${sampleId}`);
}

export function saveAnnotation(originalImage, maskBlob, sampleId = "", requestId = "") {
  const formData = new FormData();
  formData.append("original_image", originalImage);
  formData.append("mask_image", maskBlob, "mask.png");
  if (sampleId) {
    formData.append("sample_id", sampleId);
  }
  if (requestId) {
    formData.append("request_id", requestId);
  }
  return request("/api/annotations", {
    method: "POST",
    body: formData,
    retry: {
      safeToRetry: Boolean(sampleId || requestId),
      attempts: sampleId || requestId ? 3 : 1,
    },
  });
}

export function deleteAnnotation(sampleId) {
  return request(`/api/annotations/${sampleId}`, {
    method: "DELETE",
  });
}

export function runTraining() {
  return request("/api/training/run", {
    method: "POST",
    retry: { safeToRetry: true, attempts: 2 },
  });
}

export function getTraining() {
  return request("/api/training");
}

export function runInference(imageFile) {
  const formData = new FormData();
  formData.append("image", imageFile);
  return request("/api/inference", {
    method: "POST",
    body: formData,
  });
}

export function getInferences() {
  return request("/api/inferences");
}

export function deleteInference(runId) {
  return request(`/api/inferences/${runId}`, {
    method: "DELETE",
  });
}

export function createSam2Session(imageFile, requestId = "") {
  const formData = new FormData();
  formData.append("image", imageFile);
  if (requestId) {
    formData.append("request_id", requestId);
  }
  return request("/api/sam2/sessions", {
    method: "POST",
    body: formData,
    retry: {
      safeToRetry: Boolean(requestId),
      attempts: requestId ? 3 : 1,
    },
  });
}

export function predictSam2Mask(sessionId, payload) {
  return request(`/api/sam2/sessions/${sessionId}/predict`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    retry: {
      safeToRetry: true,
      attempts: 3,
    },
  });
}
