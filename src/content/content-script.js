(() => {
  if (window.__PROMPT_LENS_CONTENT_LOADED__) {
    return;
  }
  window.__PROMPT_LENS_CONTENT_LOADED__ = true;

  const MAX_IMAGE_SIDE = 1536;
  const MIN_SELECTION_SIZE = 8;
  const Z_INDEX = 2147483000;

  let currentSelection = null;
  let hoverBox = null;
  let areaOverlay = null;
  let areaBox = null;

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || typeof message.type !== "string") {
      return false;
    }

    if (message.type === "PL_START_SELECTION") {
      startSelection(message.selectionType, message.options || {});
      sendResponse({ ok: true });
      return false;
    }

    if (message.type === "PL_CROP_CAPTURE") {
      cropCapture(message)
        .then((imageDataUrl) => sendResponse({ ok: true, imageDataUrl }))
        .catch((error) => sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : String(error)
        }));
      return true;
    }

    return false;
  });

  function startSelection(selectionType, options) {
    stopSelection();
    currentSelection = {
      selectionType,
      promptMode: options.promptMode === "detailed" ? "detailed" : "concise",
      language: options.language === "zh" ? "zh" : "en"
    };

    if (selectionType === "area_capture") {
      startAreaSelection();
      return;
    }

    startImagePickSelection();
  }

  function startImagePickSelection() {
    ensureHoverBox();
    document.addEventListener("mousemove", onPickMove, true);
    document.addEventListener("click", onPickClick, true);
    document.addEventListener("keydown", onSelectionKeyDown, true);
    document.documentElement.style.cursor = "crosshair";
  }

  function onPickMove(event) {
    const target = findPickTarget(event.clientX, event.clientY);
    if (!target) {
      hideHoverBox();
      return;
    }

    const rect = clampRect(target.getBoundingClientRect());
    if (!rect) {
      hideHoverBox();
      return;
    }

    updateHoverBox(rect);
  }

  function onPickClick(event) {
    const target = findPickTarget(event.clientX, event.clientY);
    if (!target) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const rect = clampRect(target.getBoundingClientRect());
    if (!rect) {
      sendSelectionError("选中的图片区域太小");
      return;
    }

    const selection = buildSelectionPayload({
      rect,
      sourceUrl: getElementSourceUrl(target)
    });

    stopSelection();
    chrome.runtime.sendMessage({
      type: "PL_SELECTION_READY",
      selection
    });
  }

  function startAreaSelection() {
    areaOverlay = document.createElement("div");
    areaOverlay.style.cssText = [
      "position:fixed",
      "inset:0",
      `z-index:${Z_INDEX + 20}`,
      "cursor:crosshair",
      "background:rgba(2,6,12,0.18)",
      "user-select:none"
    ].join(";");

    areaBox = document.createElement("div");
    areaBox.style.cssText = [
      "position:fixed",
      "display:none",
      `z-index:${Z_INDEX + 21}`,
      "border:2px solid #38dff2",
      "background:rgba(56,223,242,0.16)",
      "box-shadow:0 0 0 9999px rgba(0,0,0,0.28)",
      "pointer-events:none"
    ].join(";");

    document.documentElement.appendChild(areaOverlay);
    document.documentElement.appendChild(areaBox);

    let startX = 0;
    let startY = 0;
    let dragging = false;

    areaOverlay.addEventListener("mousedown", (event) => {
      dragging = true;
      startX = event.clientX;
      startY = event.clientY;
      areaBox.style.display = "block";
      updateAreaBox(startX, startY, startX, startY);
      event.preventDefault();
    }, true);

    areaOverlay.addEventListener("mousemove", (event) => {
      if (!dragging) return;
      updateAreaBox(startX, startY, event.clientX, event.clientY);
      event.preventDefault();
    }, true);

    areaOverlay.addEventListener("mouseup", (event) => {
      if (!dragging) return;
      dragging = false;

      const rect = rectFromPoints(startX, startY, event.clientX, event.clientY);
      if (!rect || rect.width < MIN_SELECTION_SIZE || rect.height < MIN_SELECTION_SIZE) {
        stopSelection();
        sendSelectionError("截选区域太小，请重新选择。");
        return;
      }

      const selection = buildSelectionPayload({
        rect,
        sourceUrl: ""
      });

      stopSelection();
      chrome.runtime.sendMessage({
        type: "PL_SELECTION_READY",
        selection
      });
    }, true);

    document.addEventListener("keydown", onSelectionKeyDown, true);
  }

  function onSelectionKeyDown(event) {
    if (event.key === "Escape") {
      stopSelection();
      chrome.runtime.sendMessage({
        type: "PL_SELECTION_CANCELLED"
      });
    }
  }

  function stopSelection() {
    document.removeEventListener("mousemove", onPickMove, true);
    document.removeEventListener("click", onPickClick, true);
    document.removeEventListener("keydown", onSelectionKeyDown, true);
    document.documentElement.style.cursor = "";

    if (hoverBox) {
      hoverBox.remove();
      hoverBox = null;
    }

    if (areaOverlay) {
      areaOverlay.remove();
      areaOverlay = null;
    }

    if (areaBox) {
      areaBox.remove();
      areaBox = null;
    }

    currentSelection = null;
  }

  function buildSelectionPayload({ rect, sourceUrl }) {
    return {
      ...(currentSelection || {}),
      rect,
      sourceUrl,
      pageUrl: location.href,
      pageTitle: document.title,
      devicePixelRatio: window.devicePixelRatio || 1
    };
  }

  function ensureHoverBox() {
    if (hoverBox) return hoverBox;

    hoverBox = document.createElement("div");
    hoverBox.style.cssText = [
      "position:fixed",
      `z-index:${Z_INDEX + 10}`,
      "border:2px solid #38dff2",
      "box-shadow:0 0 0 2px rgba(56,223,242,0.22)",
      "background:rgba(56,223,242,0.08)",
      "pointer-events:none",
      "display:none"
    ].join(";");
    document.documentElement.appendChild(hoverBox);
    return hoverBox;
  }

  function updateHoverBox(rect) {
    ensureHoverBox();
    hoverBox.style.display = "block";
    hoverBox.style.left = `${rect.left}px`;
    hoverBox.style.top = `${rect.top}px`;
    hoverBox.style.width = `${rect.width}px`;
    hoverBox.style.height = `${rect.height}px`;
  }

  function hideHoverBox() {
    if (hoverBox) {
      hoverBox.style.display = "none";
    }
  }

  function updateAreaBox(x1, y1, x2, y2) {
    const rect = rectFromPoints(x1, y1, x2, y2);
    if (!rect) return;

    areaBox.style.left = `${rect.left}px`;
    areaBox.style.top = `${rect.top}px`;
    areaBox.style.width = `${rect.width}px`;
    areaBox.style.height = `${rect.height}px`;
  }

  function findPickTarget(x, y) {
    let node = document.elementFromPoint(x, y);
    let depth = 0;

    while (node && depth < 8) {
      if (node.nodeType !== Node.ELEMENT_NODE) {
        node = node.parentElement;
        depth += 1;
        continue;
      }

      const element = node;

      const tagName = element.tagName.toLowerCase();
      if (tagName === "img" || tagName === "canvas" || tagName === "video") {
        if (clampRect(element.getBoundingClientRect())) {
          return element;
        }
      }

      if (tagName !== "html" && tagName !== "body") {
        const style = window.getComputedStyle(element);
        if (style.backgroundImage && style.backgroundImage !== "none") {
          if (clampRect(element.getBoundingClientRect())) {
            return element;
          }
        }
      }

      node = element.parentElement;
      depth += 1;
    }

    return null;
  }

  function getElementSourceUrl(element) {
    const tagName = element.tagName.toLowerCase();
    if (tagName === "img") {
      return element.currentSrc || element.src || "";
    }

    const style = window.getComputedStyle(element);
    const match = /url\((['"]?)(.*?)\1\)/.exec(style.backgroundImage || "");
    if (match && match[2]) {
      try {
        return new URL(match[2], location.href).href;
      } catch {
        return match[2];
      }
    }

    return "";
  }

  function rectFromPoints(x1, y1, x2, y2) {
    return clampRect({
      left: Math.min(x1, x2),
      top: Math.min(y1, y2),
      right: Math.max(x1, x2),
      bottom: Math.max(y1, y2),
      width: Math.abs(x2 - x1),
      height: Math.abs(y2 - y1)
    });
  }

  function clampRect(rect) {
    if (!rect) return null;

    const left = Math.max(0, Math.min(window.innerWidth, rect.left));
    const top = Math.max(0, Math.min(window.innerHeight, rect.top));
    const right = Math.max(0, Math.min(window.innerWidth, rect.right));
    const bottom = Math.max(0, Math.min(window.innerHeight, rect.bottom));
    const width = right - left;
    const height = bottom - top;

    if (width < MIN_SELECTION_SIZE || height < MIN_SELECTION_SIZE) {
      return null;
    }

    return { left, top, width, height, right, bottom };
  }

  function sendSelectionError(message) {
    chrome.runtime.sendMessage({
      type: "PL_SELECTION_ERROR",
      message
    });
  }

  function cropCapture(message) {
    return new Promise((resolve, reject) => {
      const rect = clampRect(message.rect);
      if (!rect) {
        reject(new Error("缺少有效的截图区域"));
        return;
      }

      const image = new Image();
      image.onload = () => {
        try {
          const scaleX = image.naturalWidth / window.innerWidth;
          const scaleY = image.naturalHeight / window.innerHeight;
          const sx = Math.max(0, Math.round(rect.left * scaleX));
          const sy = Math.max(0, Math.round(rect.top * scaleY));
          const sw = Math.min(image.naturalWidth - sx, Math.round(rect.width * scaleX));
          const sh = Math.min(image.naturalHeight - sy, Math.round(rect.height * scaleY));

          if (sw < MIN_SELECTION_SIZE || sh < MIN_SELECTION_SIZE) {
            reject(new Error("裁剪后的图片区域太小"));
            return;
          }

          const resizeRatio = Math.min(1, MAX_IMAGE_SIDE / sw, MAX_IMAGE_SIDE / sh);
          const dw = Math.max(1, Math.round(sw * resizeRatio));
          const dh = Math.max(1, Math.round(sh * resizeRatio));
          const canvas = document.createElement("canvas");
          canvas.width = dw;
          canvas.height = dh;

          const context = canvas.getContext("2d", { alpha: false });
          context.drawImage(image, sx, sy, sw, sh, 0, 0, dw, dh);
          resolve(canvas.toDataURL("image/jpeg", 0.88));
        } catch (error) {
          reject(error);
        }
      };

      image.onerror = () => reject(new Error("截图加载失败"));
      image.src = message.screenshotDataUrl;
    });
  }
})();
