import { Header } from "./types";
import {
  ADD_ITEM,
  DOWNLOAD_ACTION,
  TARGET_DETECTED,
  TARGET_BLOCKED,
  GET_BLOCKED_TARGETS,
  ALLOW_TARGET,
  UNBLOCK_TARGET,
  API_URL,
  TARGET_EXTENSIONS,
  TARGET_BLOCKING_ENABLED,
  DEFAULT_API_URL,
  DEFAULT_TARGET_EXTENSIONS,
  DEFAULT_TARGET_BLOCKING_ENABLED,
  TARGET_SNIFFER,
} from "./constants";

const blockedVideos: Record<number, { url: string; requestId: string }[]> = {};
const allowedVideos: Record<number, { url: string; requestId: string }[]> = {};
const requestHeadersCache: Record<string, Array<Header>> = {};

let apiUrl = DEFAULT_API_URL;
let targetExtensions = DEFAULT_TARGET_EXTENSIONS;
let targetBlockingEnabled = DEFAULT_TARGET_BLOCKING_ENABLED;
let activePanelPort: browser.runtime.Port | null = null;

browser.storage.sync.get(API_URL).then((result) => {
  console.debug("[Background] browser.storage.sync.get(API_URL):", result);

  if (result.apiUrl !== undefined && result.apiUrl !== "") {
    apiUrl = result.apiUrl;
  }
  console.debug("[Background] Loaded apiUrl from storage:", apiUrl);
});

browser.storage.sync.get(TARGET_EXTENSIONS).then((result) => {
  console.debug(
    "[Background] browser.storage.sync.get(VIDEO_EXTENSIONS):",
    result
  );

  if (result.targetExtensions && Array.isArray(result.targetExtensions)) {
    targetExtensions = result.targetExtensions;
  }
  console.debug(
    "[Background] Loaded targetExtensions from storage:",
    targetExtensions
  );
});

browser.storage.sync.get(TARGET_BLOCKING_ENABLED).then((result) => {
  console.debug(
    "[Background] browser.storage.sync.get(VIDEO_BLOCKING_ENABLED):",
    result
  );

  if (result.targetBlockingEnabled !== undefined) {
    targetBlockingEnabled = result.targetBlockingEnabled;
  }
  console.debug(
    "[Background] Loaded targetBlockingEnabled from storage:",
    targetBlockingEnabled
  );
});

browser.storage.onChanged.addListener((changes, areaName) => {
  console.debug(
    "[Background] browser.storage.onChanged.addListener:",
    changes,
    areaName
  );

  if (areaName === "sync") {
    if (changes[API_URL]) {
      apiUrl = changes[API_URL].newValue;
    } else if (changes[TARGET_EXTENSIONS]) {
      targetExtensions = changes[TARGET_EXTENSIONS].newValue;
    } else if (changes[TARGET_BLOCKING_ENABLED]) {
      targetBlockingEnabled = changes[TARGET_BLOCKING_ENABLED].newValue;
    }
  }
});

function sendDownloadRequest(url: string, headers?: Array<Header>) {
  if (!url) {
    console.warn("[Background] No URL provided to sendDownloadRequest");
    return;
  }

  const requestBody = {
    url,
    headers: headers ? transformHeaders(headers) : undefined,
  };
  const jsonData = JSON.stringify(requestBody);

  fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: jsonData,
    mode: "cors",
  }).catch((error) =>
    console.error("[Background] Download request failed:", error)
  );
}

function transformHeaders(headers: Header[]): { [key: string]: string } {
  const headerMap: { [key: string]: string } = {};
  headers.forEach((header: Header) => {
    if (header.value !== undefined) {
      headerMap[header.name] = header.value;
    }
  });
  return headerMap;
}

browser.runtime.onInstalled.addListener(() => {
  console.debug("[Background] browser.runtime.onInstalled.addListener");

  browser.contextMenus.removeAll().then(() => {
    console.debug("[Background] browser.contextMenus.removeAll");

    browser.contextMenus.create({
      id: "downloadContextMenu",
      title: "Download",
      contexts: ["link"],
    });
  });
  console.log("[Background] Hermes Extension Installed");
});

browser.downloads.onCreated.addListener(
  (downloadItem: browser.downloads.DownloadItem) => {
    console.debug(
      "[Background] browser.downloads.onCreated.addListener:",
      downloadItem
    );

    if (!downloadItem.url) {
      console.warn("[Background] Download URL is missing.");
      return;
    }

    console.debug("[Background] Download detected:", downloadItem.url);

    sendDownloadRequest(downloadItem.url);
  }
);

browser.contextMenus.onClicked.addListener(
  (info: browser.contextMenus.OnClickData) => {
    console.debug(
      "[Background] browser.contextMenus.onClicked.addListener:",
      info
    );

    if (info.menuItemId === "downloadContextMenu" && info.linkUrl) {
      sendDownloadRequest(info.linkUrl);
    } else {
      console.warn("[Background] Invalid context menu click detected.");
    }
  }
);

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.debug(
    "[Background] browser.runtime.onMessage.addListener",
    message,
    sender,
    sendResponse
  );

  if (message.type === DOWNLOAD_ACTION) {
    if (!message.url) {
      console.warn(
        "[Background] No URL provided in message, ignoring request."
      );
      sendResponse({ status: "No URL provided" });
      return;
    }

    console.debug("[Background] Processing download for URL:", message.url);
    sendDownloadRequest(message.url, message.headers);
    sendResponse({ status: "Request sent to download server" });
  } else if (message.type === TARGET_DETECTED) {
    console.debug(
      "[Background] Detected target:",
      message.url,
      message.headers
    );

    if (activePanelPort) {
      console.debug("[Background] Sending to panel:", message.url);
      activePanelPort.postMessage({
        type: ADD_ITEM,
        url: message.url,
        headers: message.headers,
      });
    } else {
      console.warn("[Background] Panel is not open, message ignored.");
    }
    sendResponse({ status: "Background processed VIDEO_DETECTED" });
  }
  return true;
});

browser.runtime.onConnect.addListener((port) => {
  console.debug("[Background] browser.runtime.onConnect.addListener:", port);

  if (port.name === TARGET_SNIFFER) {
    console.debug("[Background] Panel connected:", port);
    activePanelPort = port;

    port.onDisconnect.addListener(() => {
      console.warn("[Background] Panel disconnected");
      activePanelPort = null;
    });
  }
});

browser.webRequest.onBeforeRequest.addListener(
  (details) => {
    console.debug(
      "[Background] browser.webRequest.onBeforeRequest.addListener:",
      details
    );

    if (!targetBlockingEnabled) {
      return;
    }

    const tabId = details.tabId;
    if (
      tabId !== undefined &&
      allowedVideos[tabId]?.some((item) => details.url === item.url)
    ) {
      console.debug("[Background] Allowed target request:", details.url);
      return {};
    }

    const regex = new RegExp(
      "\\.(" + targetExtensions.join("|") + ")(?=\\?|$)",
      "i"
    );

    if (regex.test(details.url)) {
      console.debug("[Background] Blocking target request:", details.url);

      const blockedMessage = { url: details.url, requestId: details.requestId };

      browser.tabs
        .sendMessage(tabId, {
          type: TARGET_BLOCKED,
          ...blockedMessage,
        })
        .catch(() => {
          if (!blockedVideos[tabId]) {
            blockedVideos[tabId] = [];
          }
          blockedVideos[tabId].push(blockedMessage);
        });

      return { cancel: true };
    }
  },
  { urls: ["<all_urls>"], types: ["media"] },
  ["blocking"]
);

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.debug(
    "[Background] browser.runtime.onMessage.addListener:",
    message,
    sender,
    sendResponse
  );

  if (message.type === ALLOW_TARGET && message.requestId) {
    console.debug("[Background] Allowing target:", message.requestId);

    if (sender.tab?.id !== undefined) {
      const tabId = sender.tab.id;
      if (!allowedVideos[tabId]) {
        allowedVideos[tabId] = [];
      }
      allowedVideos[tabId].push({
        url: message.url,
        requestId: message.requestId,
      });
      browser.tabs.sendMessage(tabId, {
        type: UNBLOCK_TARGET,
        url: message.url,
      });
    }

    sendResponse({ status: "Video allowed" });
  } else if (message.type === GET_BLOCKED_TARGETS) {
    console.debug("[Background] Get blocked targets:", message, sender);

    const tabId = sender.tab?.id;
    if (tabId === undefined) {
      sendResponse({ targets: [] });
      return;
    }

    const targets = blockedVideos[tabId] || [];
    blockedVideos[tabId] = [];
    sendResponse({ targets });
  }
});

browser.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    const headers = details.requestHeaders;
    if (headers !== undefined) {
      requestHeadersCache[details.requestId] = headers;
    }
  },
  { urls: ["<all_urls>"] },
  ["requestHeaders"]
);

browser.webRequest.onHeadersReceived.addListener(
  (details) => {
    const responseHeaders = details.responseHeaders || [];
    const contentDisposition = responseHeaders.find(
      (h) => h.name.toLowerCase() === "content-disposition"
    );

    if (
      contentDisposition &&
      /attachment/i.test(contentDisposition.value || "")
    ) {
      const contentType = responseHeaders.find(
        (h) => h.name.toLowerCase() === "content-type"
      );

      const reqHeaders = requestHeadersCache[details.requestId] || {};

      sendDownloadRequest(details.url, reqHeaders);

      delete requestHeadersCache[details.requestId];
    } else {
      delete requestHeadersCache[details.requestId];
    }
  },
  { urls: ["<all_urls>"] },
  ["responseHeaders"]
);
