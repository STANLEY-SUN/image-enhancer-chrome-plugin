const DEFAULT_LOCAL_ENDPOINT = "http://127.0.0.1:8765/enhance";
const LOCALHOST_ENDPOINT = "http://localhost:8765/enhance";
const REQUEST_TIMEOUT_MS = 90000;
const PROBE_TIMEOUT_MS = 3500;

const state = {
  originalFile: null,
  originalDataUrl: "",
  originalWidth: 0,
  originalHeight: 0,
  enhancedBlob: null,
  enhancedDataUrl: "",
  enhancedWidth: 0,
  enhancedHeight: 0,
  engineUsed: ""
};

const ui = {
  dropZone: document.getElementById("dropZone"),
  fileInput: document.getElementById("fileInput"),
  scaleSelect: document.getElementById("scaleSelect"),
  modeSelect: document.getElementById("modeSelect"),
  backendModeSelect: document.getElementById("backendModeSelect"),
  endpointInput: document.getElementById("endpointInput"),
  apiKeyInput: document.getElementById("apiKeyInput"),
  allowFallbackCheckbox: document.getElementById("allowFallbackCheckbox"),
  testEndpointBtn: document.getElementById("testEndpointBtn"),
  autoDetectBtn: document.getElementById("autoDetectBtn"),
  enhanceBtn: document.getElementById("enhanceBtn"),
  resetBtn: document.getElementById("resetBtn"),
  downloadBtn: document.getElementById("downloadBtn"),
  status: document.getElementById("status"),
  backendHelp: document.getElementById("backendHelp"),
  progressBar: document.getElementById("progressBar"),
  previewSection: document.getElementById("previewSection"),
  originalImg: document.getElementById("originalImg"),
  enhancedImg: document.getElementById("enhancedImg"),
  enhancedLayer: document.getElementById("enhancedLayer"),
  compareSlider: document.getElementById("compareSlider"),
  metaText: document.getElementById("metaText")
};

bootstrap().catch((error) => {
  setStatus(`Failed to initialize: ${error.message}`, true);
});

async function bootstrap() {
  const stored = await chrome.storage.local.get([
    "backendMode",
    "enhancerEndpoint",
    "backendApiKey",
    "allowLocalFallback"
  ]);
  ui.backendModeSelect.value = stored.backendMode || "auto";
  ui.endpointInput.value = stored.enhancerEndpoint || "";
  ui.apiKeyInput.value = stored.backendApiKey || "";
  ui.allowFallbackCheckbox.checked = Boolean(stored.allowLocalFallback);

  bindEvents();
  setBackendHelp("");
  if (ui.backendModeSelect.value !== "cloud" && !normalizeEndpoint(ui.endpointInput.value)) {
    autoDetectEndpoint(false);
  }
  tryLoadImageFromQuery();
}

function bindEvents() {
  ui.dropZone.addEventListener("click", () => ui.fileInput.click());

  ui.fileInput.addEventListener("change", async (event) => {
    const [file] = event.target.files || [];
    if (file) {
      await loadFile(file);
    }
  });

  ui.dropZone.addEventListener("dragover", (event) => {
    event.preventDefault();
    ui.dropZone.classList.add("drag-over");
  });

  ui.dropZone.addEventListener("dragleave", () => {
    ui.dropZone.classList.remove("drag-over");
  });

  ui.dropZone.addEventListener("drop", async (event) => {
    event.preventDefault();
    ui.dropZone.classList.remove("drag-over");
    const [file] = event.dataTransfer?.files || [];
    if (file) {
      await loadFile(file);
    }
  });

  ui.enhanceBtn.addEventListener("click", () => processImage());
  ui.resetBtn.addEventListener("click", resetEnhancement);
  ui.downloadBtn.addEventListener("click", downloadEnhanced);

  ui.compareSlider.addEventListener("input", () => {
    const value = Number(ui.compareSlider.value);
    ui.enhancedLayer.style.width = `${value}%`;
  });

  ui.endpointInput.addEventListener("change", async () => {
    await chrome.storage.local.set({ enhancerEndpoint: ui.endpointInput.value.trim() });
  });

  ui.backendModeSelect.addEventListener("change", async () => {
    await chrome.storage.local.set({ backendMode: ui.backendModeSelect.value });
  });

  ui.apiKeyInput.addEventListener("change", async () => {
    await chrome.storage.local.set({ backendApiKey: ui.apiKeyInput.value.trim() });
  });

  ui.allowFallbackCheckbox.addEventListener("change", async () => {
    await chrome.storage.local.set({
      allowLocalFallback: ui.allowFallbackCheckbox.checked
    });
  });

  ui.testEndpointBtn.addEventListener("click", () => testEndpoint());
  ui.autoDetectBtn.addEventListener("click", () => autoDetectEndpoint(true));
}

async function testEndpoint() {
  const backendMode = ui.backendModeSelect.value;
  const endpoint = normalizeEndpoint(ui.endpointInput.value);
  const apiKey = ui.apiKeyInput.value.trim();
  const effectiveEndpoint =
    endpoint || (backendMode === "cloud" ? "" : DEFAULT_LOCAL_ENDPOINT);
  if (!effectiveEndpoint) {
    setStatus("Cloud mode requires a backend endpoint.", true);
    return;
  }

  setStatus("Testing backend connection...", false);
  setBackendHelp("");
  const result = await probeEndpoint(effectiveEndpoint, apiKey);
  if (result.ok) {
    setStatus(`Backend reachable: ${effectiveEndpoint}`, false);
    return;
  }
  setStatus("Backend is unavailable.", true);
  showBackendUnavailableHelp(effectiveEndpoint, result.error, backendMode);
}

async function autoDetectEndpoint(showMessage) {
  const current = normalizeEndpoint(ui.endpointInput.value);
  const apiKey = ui.apiKeyInput.value.trim();
  const candidates = uniqueEndpoints([
    current,
    DEFAULT_LOCAL_ENDPOINT,
    LOCALHOST_ENDPOINT
  ]);

  for (const endpoint of candidates) {
    const result = await probeEndpoint(endpoint, apiKey);
    if (result.ok) {
      ui.endpointInput.value = endpoint;
      await chrome.storage.local.set({ enhancerEndpoint: endpoint });
      if (showMessage) {
        setStatus(`Detected backend: ${endpoint}`, false);
        setBackendHelp("");
      }
      return endpoint;
    }
  }

  if (showMessage) {
    setStatus("No local backend detected.", true);
    showBackendUnavailableHelp(
      candidates[0] || DEFAULT_LOCAL_ENDPOINT,
      "No backend responded.",
      "local"
    );
  }
  return null;
}

async function tryLoadImageFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const imageUrl = params.get("imageUrl");
  if (!imageUrl) {
    return;
  }

  try {
    setStatus("Loading image from page...", false);
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const blob = await response.blob();
    const type = blob.type || "image/png";
    const file = new File([blob], "web-image", { type });
    await loadFile(file);
    setStatus("Image loaded. Choose scale and click Enhance.", false);
  } catch (error) {
    setStatus(`Could not load page image: ${error.message}`, true);
  }
}

async function loadFile(file) {
  if (!file.type.startsWith("image/")) {
    setStatus("Please choose an image file.", true);
    return;
  }

  state.originalFile = file;
  state.originalDataUrl = await readAsDataUrl(file);

  const originalInfo = await measureImage(state.originalDataUrl);
  state.originalWidth = originalInfo.width;
  state.originalHeight = originalInfo.height;

  state.enhancedBlob = null;
  state.enhancedDataUrl = "";
  state.engineUsed = "";

  ui.originalImg.src = state.originalDataUrl;
  ui.enhancedImg.src = state.originalDataUrl;
  ui.enhancedLayer.style.width = "50%";
  ui.compareSlider.value = "50";

  ui.previewSection.classList.remove("hidden");
  ui.enhanceBtn.disabled = false;
  ui.resetBtn.disabled = false;
  ui.downloadBtn.disabled = true;

  ui.metaText.textContent = `Original: ${state.originalWidth} x ${state.originalHeight}`;
  setStatus("Image ready. Click Enhance.", false);
}

async function processImage() {
  if (!state.originalFile) {
    return;
  }

  const scale = Number(ui.scaleSelect.value);
  const mode = ui.modeSelect.value;
  const backendMode = ui.backendModeSelect.value;
  const endpointInput = normalizeEndpoint(ui.endpointInput.value);
  const apiKey = ui.apiKeyInput.value.trim();
  const allowFallback = ui.allowFallbackCheckbox.checked;
  await chrome.storage.local.set({
    backendMode,
    enhancerEndpoint: endpointInput,
    backendApiKey: apiKey
  });

  setWorking(true);
  setStatus("Enhancing image...", false);
  setBackendHelp("");

  try {
    let enhancedBlob = null;
    let engine = "backend";
    let usingEndpoint = "";
    const endpointCandidates = resolveEndpointCandidates({
      backendMode,
      endpointInput
    });

    if (endpointCandidates.length === 0) {
      throw new Error("Cloud mode requires endpoint. Please set one in Advanced.");
    }

    let backendError = null;
    for (const candidate of endpointCandidates) {
      try {
        enhancedBlob = await enhanceViaBackend({
          file: state.originalFile,
          scale,
          mode,
          endpoint: candidate,
          apiKey
        });
        usingEndpoint = candidate;
        break;
      } catch (error) {
        backendError = error;
      }
    }

    if (!enhancedBlob) {
      if (!allowFallback) {
        showBackendUnavailableHelp(
          endpointCandidates[0],
          backendError?.message || String(backendError || "Unknown"),
          backendMode
        );
        throw new Error(
          "High-quality backend unavailable. Enable fallback only if you accept lower quality."
        );
      }
      engine = "local-fallback";
      setStatus("Backend unavailable. Using local fallback...", false);
      enhancedBlob = await enhanceLocally(state.originalFile, scale, mode);
    } else if (usingEndpoint) {
      ui.endpointInput.value = usingEndpoint;
      await chrome.storage.local.set({ enhancerEndpoint: usingEndpoint });
    }

    state.enhancedBlob = enhancedBlob;
    state.engineUsed = engine;
    state.enhancedDataUrl = await readAsDataUrl(enhancedBlob);
    const enhancedInfo = await measureImage(state.enhancedDataUrl);
    state.enhancedWidth = enhancedInfo.width;
    state.enhancedHeight = enhancedInfo.height;

    ui.enhancedImg.src = state.enhancedDataUrl;
    ui.downloadBtn.disabled = false;
    ui.metaText.textContent =
      `Original: ${state.originalWidth} x ${state.originalHeight} | ` +
      `Enhanced: ${state.enhancedWidth} x ${state.enhancedHeight} | Engine: ${engine}` +
      (engine === "backend" ? ` | Endpoint: ${usingEndpoint}` : "");
    setStatus("Enhancement complete.", false);
  } catch (error) {
    setStatus(error.message || "Enhancement failed.", true);
  } finally {
    setWorking(false);
  }
}

function resetEnhancement() {
  if (!state.originalFile) {
    return;
  }

  state.enhancedBlob = null;
  state.enhancedDataUrl = "";
  state.enhancedWidth = 0;
  state.enhancedHeight = 0;
  state.engineUsed = "";
  ui.enhancedImg.src = state.originalDataUrl;
  ui.enhancedLayer.style.width = "50%";
  ui.compareSlider.value = "50";
  ui.downloadBtn.disabled = true;
  ui.metaText.textContent = `Original: ${state.originalWidth} x ${state.originalHeight}`;
  setStatus("Reset complete. Click Enhance to run again.", false);
}

async function downloadEnhanced() {
  if (!state.enhancedBlob) {
    return;
  }

  const mode = ui.modeSelect.value;
  const scale = ui.scaleSelect.value;
  const engineTag = state.engineUsed || "unknown";
  const filename = `enhanced-${engineTag}-${mode}-x${scale}-${Date.now()}.png`;
  const blobUrl = URL.createObjectURL(state.enhancedBlob);

  await chrome.downloads.download({
    url: blobUrl,
    filename,
    saveAs: true
  });

  setTimeout(() => URL.revokeObjectURL(blobUrl), 30_000);
}

async function enhanceViaBackend({ file, scale, mode, endpoint, apiKey }) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const formData = new FormData();
    formData.append("image", file, file.name || "image.png");
    formData.append("scale", String(scale));
    formData.append("mode", mode);

    const response = await fetch(endpoint, {
      method: "POST",
      headers: buildAuthHeaders(apiKey),
      body: formData,
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.startsWith("image/")) {
      throw new Error("Response is not an image");
    }

    return await response.blob();
  } finally {
    clearTimeout(timeoutId);
  }
}

function resolveEndpointCandidates({ backendMode, endpointInput }) {
  if (backendMode === "cloud") {
    return uniqueEndpoints([endpointInput]);
  }

  if (backendMode === "local") {
    return uniqueEndpoints([
      endpointInput,
      DEFAULT_LOCAL_ENDPOINT,
      LOCALHOST_ENDPOINT
    ]);
  }

  // auto: cloud endpoint first, then local defaults.
  return uniqueEndpoints([
    endpointInput,
    DEFAULT_LOCAL_ENDPOINT,
    LOCALHOST_ENDPOINT,
    swapLoopbackHost(endpointInput)
  ]);
}

function normalizeEndpoint(value) {
  const endpoint = (value || "").trim();
  if (!endpoint) {
    return "";
  }

  try {
    const url = new URL(endpoint);
    return url.toString().replace(/\/$/, "");
  } catch {
    return endpoint;
  }
}

function swapLoopbackHost(endpoint) {
  try {
    const url = new URL(endpoint);
    if (url.hostname === "127.0.0.1") {
      url.hostname = "localhost";
      return url.toString().replace(/\/$/, "");
    }
    if (url.hostname === "localhost") {
      url.hostname = "127.0.0.1";
      return url.toString().replace(/\/$/, "");
    }
    return "";
  } catch {
    return "";
  }
}

function uniqueEndpoints(items) {
  const seen = new Set();
  const output = [];
  for (const raw of items) {
    const endpoint = normalizeEndpoint(raw);
    if (!endpoint || seen.has(endpoint)) {
      continue;
    }
    seen.add(endpoint);
    output.push(endpoint);
  }
  return output;
}

async function probeEndpoint(endpoint, apiKey) {
  const headers = buildAuthHeaders(apiKey);
  const healthUrl = toHealthUrl(endpoint);
  const viaHealth = await fetchWithTimeout(
    healthUrl,
    { method: "GET", headers },
    PROBE_TIMEOUT_MS
  );
  if (viaHealth.ok) {
    return { ok: true };
  }

  const direct = await fetchWithTimeout(
    endpoint,
    { method: "GET", headers },
    PROBE_TIMEOUT_MS
  );
  if (direct.ok || (typeof direct.status === "number" && direct.status > 0)) {
    return { ok: true };
  }

  return {
    ok: false,
    error: viaHealth.error || direct.error || "No response from backend."
  };
}

function toHealthUrl(endpoint) {
  try {
    const url = new URL(endpoint);
    url.pathname = "/health";
    url.search = "";
    return url.toString();
  } catch {
    return endpoint;
  }
}

function buildAuthHeaders(apiKey) {
  const key = (apiKey || "").trim();
  if (!key) {
    return {};
  }
  return {
    Authorization: `Bearer ${key}`,
    "X-API-Key": key
  };
}

async function fetchWithTimeout(url, init, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal
    });
    return { ok: response.ok, status: response.status };
  } catch (error) {
    return { ok: false, error: error?.message || String(error) };
  } finally {
    clearTimeout(timeoutId);
  }
}

function showBackendUnavailableHelp(endpoint, reason, backendMode) {
  const localGuide =
    "本地后端启动命令：\n" +
    'cd "/Users/yu_sun/Documents/New project 💰/image-enhancer- chrome-plugin (CodeX)"\n' +
    "source .venv-realesrgan/bin/activate\n" +
    "pip install fastapi uvicorn python-multipart\n" +
    "uvicorn server.realesrgan_api:app --host 127.0.0.1 --port 8765";

  const cloudGuide =
    "云端模式检查项：\n" +
    "1) 确认 endpoint 是 https://.../enhance\n" +
    "2) 如果服务需要鉴权，请填写 API key\n" +
    "3) 服务端需允许 OPTIONS/POST 和 Authorization 头";

  const text =
    `当前后端地址不可用：${endpoint || "(empty)"}\n` +
    `原因：${reason || "Unknown"}\n\n` +
    (backendMode === "cloud"
      ? `${cloudGuide}\n\n切回本地可用：\n${localGuide}`
      : `${localGuide}\n\n也可以切到 Cloud only 使用云端常驻服务。`);
  setBackendHelp(text);
}

async function enhanceLocally(file, scale, mode) {
  const bitmap = await createImageBitmap(file);
  const outputWidth = Math.max(1, Math.round(bitmap.width * scale));
  const outputHeight = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = outputWidth;
  canvas.height = outputHeight;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    throw new Error("Canvas context unavailable");
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, outputWidth, outputHeight);

  const blurPx = mode === "fidelity" ? 0.45 : mode === "balanced" ? 0.35 : 0.2;
  const sharpenAmount = mode === "fidelity" ? 0.18 : mode === "balanced" ? 0.28 : 0.42;

  // Mild deblocking pass by blending a low-radius blur with original upscaled image.
  const blurCanvas = document.createElement("canvas");
  blurCanvas.width = outputWidth;
  blurCanvas.height = outputHeight;
  const blurCtx = blurCanvas.getContext("2d");
  if (!blurCtx) {
    throw new Error("Blur context unavailable");
  }
  blurCtx.filter = `blur(${blurPx}px)`;
  blurCtx.drawImage(canvas, 0, 0);

  ctx.globalAlpha = 0.28;
  ctx.drawImage(blurCanvas, 0, 0);
  ctx.globalAlpha = 1;

  const original = ctx.getImageData(0, 0, outputWidth, outputHeight);
  const blurred = blurCtx.getImageData(0, 0, outputWidth, outputHeight);
  const result = ctx.createImageData(outputWidth, outputHeight);

  for (let i = 0; i < original.data.length; i += 4) {
    for (let c = 0; c < 3; c += 1) {
      const detail = original.data[i + c] - blurred.data[i + c];
      result.data[i + c] = clamp255(original.data[i + c] + detail * sharpenAmount);
    }
    result.data[i + 3] = original.data[i + 3];
  }

  ctx.putImageData(result, 0, 0);

  const blob = await canvasToBlob(canvas, "image/png", 0.96);
  bitmap.close();
  return blob;
}

function clamp255(value) {
  return Math.min(255, Math.max(0, Math.round(value)));
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Failed to create output blob"));
        return;
      }
      resolve(blob);
    }, type, quality);
  });
}

function readAsDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(blob);
  });
}

function measureImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error("Failed to parse image"));
    img.src = dataUrl;
  });
}

function setWorking(isWorking) {
  ui.enhanceBtn.disabled = isWorking || !state.originalFile;
  ui.resetBtn.disabled = isWorking || !state.originalFile;
  ui.testEndpointBtn.disabled = isWorking;
  ui.autoDetectBtn.disabled = isWorking;
  if (isWorking) {
    ui.downloadBtn.disabled = true;
  } else {
    ui.downloadBtn.disabled = !state.enhancedBlob;
  }

  ui.progressBar.classList.toggle("hidden", !isWorking);
}

function setStatus(text, isError) {
  ui.status.textContent = text;
  ui.status.classList.toggle("error", Boolean(isError));
}

function setBackendHelp(text) {
  ui.backendHelp.textContent = text;
  ui.backendHelp.classList.toggle("hidden", !text);
}
