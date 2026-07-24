import {
  DEFAULT_SETTINGS,
  normalizeSettings,
  originPatternFromApiUrl
} from "../shared/config.js";
import {
  getSettings,
  setSettings
} from "../shared/storage.js";

const elements = {
  form: document.querySelector("#settingsForm"),
  apiUrl: document.querySelector("#apiUrl"),
  model: document.querySelector("#model"),
  apiKey: document.querySelector("#apiKey"),
  maxTokens: document.querySelector("#maxTokens"),
  temperature: document.querySelector("#temperature"),
  toggleKeyButton: document.querySelector("#toggleKeyButton"),
  testButton: document.querySelector("#testButton"),
  resetButton: document.querySelector("#resetButton"),
  clearButton: document.querySelector("#clearButton"),
  statusText: document.querySelector("#statusText")
};

document.addEventListener("DOMContentLoaded", init);

async function init() {
  fillForm(await getSettings());
  bindEvents();
}

function bindEvents() {
  elements.form.addEventListener("submit", async (event) => {
    event.preventDefault();
    await saveSettingsFromForm();
  });

  elements.testButton.addEventListener("click", testConnection);

  elements.resetButton.addEventListener("click", () => {
    fillForm({
      ...DEFAULT_SETTINGS,
      apiKey: elements.apiKey.value
    });
    showStatus("已恢复默认 API URL 和模型名，保存后生效。");
  });

  elements.clearButton.addEventListener("click", async () => {
    elements.apiKey.value = "";
    await saveSettingsFromForm("API Key 已清空。");
  });

  elements.toggleKeyButton.addEventListener("click", () => {
    const shouldShow = elements.apiKey.type === "password";
    elements.apiKey.type = shouldShow ? "text" : "password";
    elements.toggleKeyButton.textContent = shouldShow ? "隐藏" : "显示";
  });
}

function fillForm(settings) {
  const normalized = normalizeSettings(settings);
  elements.apiUrl.value = normalized.apiUrl;
  elements.model.value = normalized.model;
  elements.apiKey.value = normalized.apiKey;
  elements.maxTokens.value = String(normalized.maxTokens);
  elements.temperature.value = String(normalized.temperature);
}

function readForm() {
  return normalizeSettings({
    apiUrl: elements.apiUrl.value,
    model: elements.model.value,
    apiKey: elements.apiKey.value,
    maxTokens: elements.maxTokens.value,
    temperature: elements.temperature.value
  });
}

async function saveSettingsFromForm(successMessage = "配置已保存。") {
  try {
    const settings = readForm();
    await requestApiHostPermission(settings.apiUrl);
    await setSettings(settings);
    showStatus(successMessage, "ok");
  } catch (error) {
    showStatus(error instanceof Error ? error.message : String(error), "error");
  }
}

async function testConnection() {
  try {
    const settings = readForm();
    await requestApiHostPermission(settings.apiUrl);
    showStatus("正在测试连接...");

    const response = await chrome.runtime.sendMessage({
      type: "PL_TEST_CONNECTION",
      settings
    });

    if (!response?.ok) {
      showStatus(response?.error || "连接测试失败", "error");
      return;
    }

    showStatus(response.message || "连接成功。", "ok");
  } catch (error) {
    showStatus(error instanceof Error ? error.message : String(error), "error");
  }
}

async function requestApiHostPermission(apiUrl) {
  const pattern = originPatternFromApiUrl(apiUrl);
  const hasPermission = await permissionContains(pattern);
  if (hasPermission) return;

  const granted = await permissionRequest(pattern);
  if (!granted) {
    throw new Error(`需要授权访问 API 域名：${pattern}`);
  }
}

function permissionContains(pattern) {
  return new Promise((resolve) => {
    chrome.permissions.contains({ origins: [pattern] }, (result) => {
      resolve(Boolean(result));
    });
  });
}

function permissionRequest(pattern) {
  return new Promise((resolve) => {
    chrome.permissions.request({ origins: [pattern] }, (granted) => {
      resolve(Boolean(granted));
    });
  });
}

function showStatus(message, type = "") {
  elements.statusText.textContent = message;
  elements.statusText.className = `status ${type}`.trim();
}
