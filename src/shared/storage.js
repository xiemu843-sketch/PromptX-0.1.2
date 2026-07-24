import {
  DEFAULT_SETTINGS,
  STORAGE_KEYS,
  getDefaultState,
  normalizeSettings
} from "./config.js";

export function storageGet(keys) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(keys, (items) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve(items);
    });
  });
}

export function storageSet(items) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(items, () => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve();
    });
  });
}

export async function getSettings() {
  const items = await storageGet(STORAGE_KEYS.SETTINGS);
  return normalizeSettings(items[STORAGE_KEYS.SETTINGS] || DEFAULT_SETTINGS);
}

export async function setSettings(settings) {
  await storageSet({
    [STORAGE_KEYS.SETTINGS]: normalizeSettings(settings)
  });
}

export async function getState() {
  const items = await storageGet(STORAGE_KEYS.STATE);
  return items[STORAGE_KEYS.STATE] || getDefaultState();
}

export async function setState(state) {
  const nextState = {
    ...getDefaultState(),
    ...state,
    updatedAt: Date.now()
  };
  await storageSet({
    [STORAGE_KEYS.STATE]: nextState
  });
  return nextState;
}

export async function getHistory() {
  const items = await storageGet(STORAGE_KEYS.HISTORY);
  return Array.isArray(items[STORAGE_KEYS.HISTORY]) ? items[STORAGE_KEYS.HISTORY] : [];
}

export async function pushHistory(item) {
  const history = await getHistory();
  const nextHistory = [item, ...history].slice(0, 10);
  await storageSet({
    [STORAGE_KEYS.HISTORY]: nextHistory
  });
  return nextHistory;
}
