import {
  buildSystemPrompt,
  buildUserPrompt,
  formatCombinedPrompt,
  hasApiKey,
  normalizeSettings,
  normalizeUiOptions,
  parsePromptResponse,
  STATUS_TEXT
} from "../shared/config.js";
import {
  getHistory,
  getSettings,
  getState,
  pushHistory,
  setState
} from "../shared/storage.js";

let lastTargetTab = null;

chrome.runtime.onInstalled.addListener(() => {
  configureSidePanel();
  setState({
    status: "idle",
    message: STATUS_TEXT.idle,
    result: null,
    lastError: ""
  }).catch(() => {});
});

chrome.runtime.onStartup.addListener(() => {
  configureSidePanel();
});

chrome.action.onClicked.addListener((tab) => {
  rememberTargetTab(tab);
  openSidePanel(tab).catch(() => {});
});

chrome.tabs.onActivated.addListener((activeInfo) => {
  getTabById(activeInfo.tabId)
    .then((tab) => rememberTargetTab(tab))
    .catch(() => {});
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tab?.active && changeInfo.status === "complete") {
    rememberTargetTab(tab);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender)
    .then((response) => sendResponse(response))
    .catch((error) => sendResponse({
      ok: false,
      error: toErrorMessage(error)
    }));
  return true;
});

async function handleMessage(message, sender) {
  if (!message || typeof message.type !== "string") {
    return { ok: false, error: "Invalid message" };
  }

  switch (message.type) {
    case "PL_GET_STATE":
      return {
        ok: true,
        state: await getState(),
        settings: await getSettings(),
        history: await getHistory()
      };

    case "PL_START_PICK":
      return beginSelection("image_pick", message.options);

    case "PL_START_AREA":
      return beginSelection("area_capture", message.options);

    case "PL_SELECTION_READY":
      if (!sender.tab || !sender.tab.id) {
        return { ok: false, error: "Missing sender tab" };
      }
      processSelection(sender.tab, message.selection).catch(() => {});
      return { ok: true };

    case "PL_SELECTION_ERROR":
      return setSelectionError(message.message);

    case "PL_SELECTION_CANCELLED":
      return setSelectionCancelled();

    case "PL_TEST_CONNECTION":
      return testConnection(message.settings);

    default:
      return { ok: false, error: `Unknown message type: ${message.type}` };
  }
}

async function beginSelection(selectionType, rawOptions) {
  const options = normalizeUiOptions(rawOptions);
  const settings = await getSettings();

  if (!hasApiKey(settings)) {
    const state = await setState({
      status: "missing_key",
      message: STATUS_TEXT.missing_key,
      promptMode: options.promptMode,
      language: options.language,
      result: null,
      lastError: ""
    });
    broadcastState(state);
    return { ok: false, error: STATUS_TEXT.missing_key };
  }

  let tab;
  try {
    tab = await getActiveTab();
    assertInjectableTab(tab);
    await injectContentScript(tab.id);
  } catch (error) {
    const message = toErrorMessage(error);
    const state = await setState({
      status: "error",
      message,
      promptMode: options.promptMode,
      language: options.language,
      result: null,
      lastError: message
    });
    broadcastState(state);
    return { ok: false, error: message };
  }

  const status = selectionType === "area_capture" ? "selecting_area" : "selecting";
  const state = await setState({
    status,
    message: STATUS_TEXT[status],
    promptMode: options.promptMode,
    language: options.language,
    result: null,
    lastError: ""
  });

  await sendTabMessage(tab.id, {
    type: "PL_START_SELECTION",
    selectionType,
    options
  });
  broadcastState(state);

  return { ok: true };
}

async function processSelection(tab, rawSelection) {
  const tabId = tab.id;
  const options = normalizeUiOptions(rawSelection || {});
  const selection = {
    selectionType: rawSelection?.selectionType || "image_pick",
    rect: rawSelection?.rect,
    sourceUrl: rawSelection?.sourceUrl || "",
    pageUrl: tab.url || "",
    pageTitle: tab.title || "",
    devicePixelRatio: Number(rawSelection?.devicePixelRatio) || 1
  };

  try {
    const settings = await getSettings();
    if (!hasApiKey(settings)) {
      throw new Error(STATUS_TEXT.missing_key);
    }

    await updateBoth(tabId, {
      status: "capturing",
      message: STATUS_TEXT.capturing,
      promptMode: options.promptMode,
      language: options.language,
      result: null,
      lastError: ""
    });

    const screenshotDataUrl = await captureVisibleTab(tab.windowId);
    const cropResponse = await sendTabMessage(tabId, {
      type: "PL_CROP_CAPTURE",
      screenshotDataUrl,
      rect: selection.rect,
      devicePixelRatio: selection.devicePixelRatio
    });

    if (!cropResponse || !cropResponse.ok || !cropResponse.imageDataUrl) {
      throw new Error(cropResponse?.error || "截图裁剪失败");
    }

    await updateBoth(tabId, {
      status: "analyzing",
      message: STATUS_TEXT.analyzing,
      promptMode: options.promptMode,
      language: options.language,
      result: null,
      lastError: ""
    });

    const promptResult = await generatePrompt(settings, cropResponse.imageDataUrl, {
      promptMode: options.promptMode,
      language: options.language
    });
    const combined = formatCombinedPrompt(promptResult.prompt);

    const item = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      createdAt: new Date().toISOString(),
      selectionType: selection.selectionType,
      sourceUrl: selection.sourceUrl,
      pageUrl: selection.pageUrl,
      pageTitle: selection.pageTitle,
      promptMode: options.promptMode,
      language: options.language,
      prompt: promptResult.prompt,
      combined
    };

    await pushHistory(item);
    const state = await setState({
      status: "done",
      message: STATUS_TEXT.done,
      promptMode: options.promptMode,
      language: options.language,
      result: item,
      lastError: ""
    });

    broadcastState(state);
  } catch (error) {
    const message = toErrorMessage(error);
    const state = await setState({
      status: "error",
      message,
      promptMode: options.promptMode,
      language: options.language,
      result: null,
      lastError: message
    });

    broadcastState(state);
  }
}

async function updateBoth(tabId, partialState) {
  const state = await setState(partialState);
  broadcastState(state);
  return state;
}

async function setSelectionError(message) {
  const text = message || "选择失败，请重试";
  const state = await setState({
    status: "error",
    message: text,
    result: null,
    lastError: text
  });
  broadcastState(state);
  return { ok: true };
}

async function setSelectionCancelled() {
  const state = await setState({
    status: "idle",
    message: "已取消选择",
    result: null,
    lastError: ""
  });
  broadcastState(state);
  return { ok: true };
}

async function generatePrompt(settings, imageDataUrl, options) {
  const normalized = normalizeSettings(settings);
  const response = await fetch(normalized.apiUrl, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${normalized.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: normalized.model,
      messages: [
        {
          role: "system",
          content: buildSystemPrompt()
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: buildUserPrompt(options)
            },
            {
              type: "image_url",
              image_url: {
                url: imageDataUrl,
                detail: "high"
              }
            }
          ]
        }
      ],
      temperature: normalized.temperature,
      max_tokens: normalized.maxTokens
    })
  });

  const payload = await readJsonOrText(response);
  if (!response.ok) {
    throw new Error(formatApiError(payload, response.status));
  }

  const content = payload?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("模型没有返回提示词内容");
  }

  return parsePromptResponse(content);
}

async function testConnection(rawSettings) {
  const settings = normalizeSettings(rawSettings);
  if (!settings.apiKey) {
    return { ok: false, error: "请先填写 API Key" };
  }

  const response = await fetch(settings.apiUrl, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${settings.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: settings.model,
      messages: [
        {
          role: "user",
          content: "Connection test. Reply with OK only."
        }
      ],
      temperature: 0,
      max_tokens: 16
    })
  });

  const payload = await readJsonOrText(response);
  if (!response.ok) {
    return {
      ok: false,
      error: formatApiError(payload, response.status)
    };
  }

  const content = payload?.choices?.[0]?.message?.content;
  return {
    ok: true,
    message: `连接成功${content ? `：${String(content).slice(0, 60)}` : ""}`
  };
}

async function readJsonOrText(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function formatApiError(payload, status) {
  if (typeof payload === "string") {
    return `API 请求失败 (${status})：${payload.slice(0, 300)}`;
  }

  const message = payload?.error?.message || payload?.message || JSON.stringify(payload);
  return `API 请求失败 (${status})：${message}`;
}

async function getActiveTab() {
  const focusedTab = await getLastFocusedNormalTab().catch(() => null);
  if (isInjectableTabCandidate(focusedTab)) {
    rememberTargetTab(focusedTab);
    return focusedTab;
  }

  const rememberedTab = await getRememberedTargetTab().catch(() => null);
  if (isInjectableTabCandidate(rememberedTab)) {
    return rememberedTab;
  }

  if (focusedTab) {
    return focusedTab;
  }

  throw new Error("找不到当前普通网页标签页，请先切到网页后再使用");
}

function assertInjectableTab(tab) {
  const url = tab.url || "";
  if (!/^(https?|file):/i.test(url)) {
    throw new Error("当前页面不支持注入脚本，请先切到普通网页后再使用");
  }
}

async function getLastFocusedNormalTab() {
  const focusedWindow = await getLastFocusedNormalWindow();
  if (!focusedWindow?.id) {
    return null;
  }

  const tabs = await queryTabs({
    active: true,
    windowId: focusedWindow.id
  });

  return tabs?.[0] || null;
}

function getLastFocusedNormalWindow() {
  return new Promise((resolve, reject) => {
    chrome.windows.getLastFocused({
      windowTypes: ["normal"]
    }, (windowInfo) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve(windowInfo);
    });
  });
}

function queryTabs(queryInfo) {
  return new Promise((resolve, reject) => {
    chrome.tabs.query(queryInfo, (tabs) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve(tabs || []);
    });
  });
}

function getTabById(tabId) {
  return new Promise((resolve, reject) => {
    chrome.tabs.get(tabId, (tab) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve(tab);
    });
  });
}

async function getRememberedTargetTab() {
  if (!lastTargetTab?.tabId) {
    return null;
  }

  return getTabById(lastTargetTab.tabId);
}

function rememberTargetTab(tab) {
  if (!tab?.id || !tab.windowId) {
    return;
  }

  lastTargetTab = {
    tabId: tab.id,
    windowId: tab.windowId,
    url: tab.url || "",
    title: tab.title || "",
    updatedAt: Date.now()
  };
}

function isInjectableTabCandidate(tab) {
  return Boolean(tab?.id && /^(https?|file):/i.test(tab.url || ""));
}

function injectContentScript(tabId) {
  return new Promise((resolve, reject) => {
    chrome.scripting.executeScript({
      target: { tabId },
      files: ["src/content/content-script.js"]
    }, () => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve();
    });
  });
}

function captureVisibleTab(windowId) {
  return new Promise((resolve, reject) => {
    chrome.tabs.captureVisibleTab(windowId, {
      format: "jpeg",
      quality: 90
    }, (dataUrl) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve(dataUrl);
    });
  });
}

function sendTabMessage(tabId, message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve(response);
    });
  });
}

function broadcastState(state) {
  chrome.runtime.sendMessage({
    type: "PL_STATE_UPDATED",
    state
  }, () => {
    void chrome.runtime.lastError;
  });
}

function toErrorMessage(error) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return String(error || "未知错误");
}

function configureSidePanel() {
  if (!chrome.sidePanel?.setPanelBehavior) {
    return;
  }

  chrome.sidePanel.setPanelBehavior({
    openPanelOnActionClick: true
  }).catch(() => {});
}

async function openSidePanel(tab) {
  if (!chrome.sidePanel?.open || !tab?.windowId) {
    return;
  }

  await chrome.sidePanel.open({
    windowId: tab.windowId
  });
}
