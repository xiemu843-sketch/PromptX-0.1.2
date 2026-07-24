import {
  DEFAULT_UI_OPTIONS,
  STATUS_TEXT,
  hasApiKey,
  normalizePromptText,
  normalizeUiOptions
} from "../shared/config.js";
import {
  getHistory,
  getSettings,
  getState
} from "../shared/storage.js";

const elements = {
  accountStatus: document.querySelector("#accountStatus"),
  settingsButton: document.querySelector("#settingsButton"),
  pickButton: document.querySelector("#pickButton"),
  areaButton: document.querySelector("#areaButton"),
  statusText: document.querySelector("#statusText"),
  resultText: document.querySelector("#resultText"),
  copyButton: document.querySelector("#copyButton"),
  historyList: document.querySelector("#historyList"),
  modeButtons: [...document.querySelectorAll("[data-mode]")],
  languageButtons: [...document.querySelectorAll("[data-language]")]
};

let uiOptions = { ...DEFAULT_UI_OPTIONS };
let currentResult = null;
let settings = null;

document.addEventListener("DOMContentLoaded", init);

async function init() {
  settings = await getSettings();
  const state = await getState();
  const history = await getHistory();
  uiOptions = normalizeUiOptions({
    promptMode: state.promptMode || DEFAULT_UI_OPTIONS.promptMode,
    language: state.language || DEFAULT_UI_OPTIONS.language
  });

  bindEvents();
  renderSettings();
  renderOptions();
  renderState(state);
  renderHistory(history);
}

function bindEvents() {
  elements.settingsButton.addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });

  elements.pickButton.addEventListener("click", () => startSelection("PL_START_PICK"));
  elements.areaButton.addEventListener("click", () => startSelection("PL_START_AREA"));

  elements.modeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      uiOptions.promptMode = button.dataset.mode;
      renderOptions();
    });
  });

  elements.languageButtons.forEach((button) => {
    button.addEventListener("click", () => {
      uiOptions.language = button.dataset.language;
      renderOptions();
    });
  });

  elements.copyButton.addEventListener("click", copyCurrentPrompt);

  chrome.storage.onChanged.addListener(async (changes, areaName) => {
    if (areaName !== "local") return;
    const state = await getState();
    const history = await getHistory();
    settings = await getSettings();
    renderSettings();
    renderState(state);
    renderHistory(history);
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "PL_STATE_UPDATED") {
      renderState(message.state);
    }
  });
}

async function startSelection(type) {
  if (!hasApiKey(settings)) {
    renderStatus("请先点击右上角设置并填写 API Key");
    return;
  }

  setBusy(true);
  const response = await chrome.runtime.sendMessage({
    type,
    options: uiOptions
  });
  setBusy(false);

  if (!response?.ok) {
    renderStatus(response?.error || "启动选择失败");
    return;
  }
}

function renderSettings() {
  const ready = hasApiKey(settings);
  elements.accountStatus.textContent = ready
    ? `已配置 · ${settings.model}`
    : "未配置 API Key";
  elements.pickButton.disabled = !ready;
  elements.areaButton.disabled = !ready;
}

function renderOptions() {
  elements.modeButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.mode === uiOptions.promptMode);
  });
  elements.languageButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.language === uiOptions.language);
  });
}

function renderState(state) {
  uiOptions = normalizeUiOptions({
    promptMode: state?.promptMode || uiOptions.promptMode,
    language: state?.language || uiOptions.language
  });
  renderOptions();

  renderStatus(state?.message || STATUS_TEXT.idle);
  currentResult = state?.result || null;
  const promptText = getPromptText(currentResult);
  elements.resultText.value = getResultTextForState(state, currentResult, promptText);
  elements.copyButton.disabled = !promptText;
}

function renderStatus(message) {
  elements.statusText.textContent = message || STATUS_TEXT.idle;
}

function renderHistory(history) {
  elements.historyList.innerHTML = "";

  if (!history.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "暂无记录";
    elements.historyList.appendChild(empty);
    return;
  }

  history.forEach((item) => {
    const promptText = getPromptText(item);
    const button = document.createElement("button");
    button.className = "history-item";
    button.type = "button";
    button.innerHTML = `
      <strong>${item.language === "zh" ? "中文" : "English"} · ${item.promptMode === "detailed" ? "详细" : "简洁"}</strong>
      <span>${escapeHtml(promptText)}</span>
    `;
    button.addEventListener("click", () => {
      currentResult = item;
      elements.resultText.value = promptText;
      elements.copyButton.disabled = !promptText;
      renderStatus("已加载历史提示词");
    });
    elements.historyList.appendChild(button);
  });
}

function getResultTextForState(state, result, promptText) {
  if (promptText) {
    return promptText;
  }

  const status = state?.status;
  const message = state?.message || "";
  if (status === "analyzing") {
    return "正在生成提示词...";
  }
  if (status === "capturing") {
    return "正在截取图片区域...";
  }
  if (status === "selecting") {
    return "请在网页中点击一张图片。";
  }
  if (status === "selecting_area") {
    return "请在网页中拖拽截选区域。";
  }
  if (status === "error") {
    return message || "生成失败，请重试。";
  }
  if (status === "missing_key") {
    return "请先在设置页配置 API Key。";
  }

  return "";
}

function getPromptText(item) {
  if (!item) return "";
  if (typeof item.prompt === "string" && item.prompt.trim()) {
    return normalizePromptText(item.prompt);
  }

  return normalizeLegacyPrompt(item.combined || item.positive || "");
}

function normalizeLegacyPrompt(value) {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }

  // 0.1.1 stored positive and negative prompts as two blank-line-separated parts.
  const firstPart = text.split(/\n\s*\n/)[0].trim();
  return normalizePromptText(firstPart);
}

async function copyCurrentPrompt() {
  const promptText = getPromptText(currentResult);
  if (!promptText) return;

  try {
    await navigator.clipboard.writeText(promptText);
    const originalText = elements.copyButton.textContent;
    elements.copyButton.textContent = "已复制";
    elements.copyButton.disabled = true;
    window.setTimeout(() => {
      elements.copyButton.textContent = originalText;
      elements.copyButton.disabled = false;
    }, 900);
  } catch {
    renderStatus("复制失败，请手动选择文本复制");
  }
}

function setBusy(isBusy) {
  elements.pickButton.disabled = isBusy || !hasApiKey(settings);
  elements.areaButton.disabled = isBusy || !hasApiKey(settings);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
