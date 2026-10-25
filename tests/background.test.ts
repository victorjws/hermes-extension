import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createFakeBrowser,
  fakeEvent,
  flush,
  loadScript,
  silenceConsole,
  type FakeBrowser,
} from "./fakeBrowser";
import {
  ADD_ITEM,
  ALLOW_TARGET,
  DEFAULT_API_URL,
  DOWNLOAD_ACTION,
  GET_BLOCKED_TARGETS,
  TARGET_BLOCKED,
  TARGET_DETECTED,
  TARGET_SNIFFER,
  UNBLOCK_TARGET,
} from "../src/constants";

let fake: FakeBrowser;
let fetchMock: ReturnType<typeof vi.fn>;

async function load(storage: Record<string, unknown> = {}) {
  fake = createFakeBrowser(storage);
  await loadScript("background", fake);
}

function lastFetchBody() {
  return JSON.parse(fetchMock.mock.calls.at(-1)![1].body);
}

function connectPanel() {
  const port = {
    name: TARGET_SNIFFER,
    onDisconnect: fakeEvent(),
    postMessage: vi.fn(),
  };
  fake.runtime.onConnect.fire(port);
  return port;
}

beforeEach(() => {
  silenceConsole();
  fetchMock = vi.fn(() => Promise.resolve(new Response()));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("download requests", () => {
  it("posts a created download's url to the default API url", async () => {
    await load();
    fake.downloads.onCreated.fire({ url: "https://a.test/f.zip" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(DEFAULT_API_URL);
    expect(fetchMock.mock.calls[0][1].method).toBe("POST");
    expect(lastFetchBody()).toEqual({ url: "https://a.test/f.zip" });
  });

  it("ignores a download without url", async () => {
    await load();
    fake.downloads.onCreated.fire({ url: "" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses the stored apiUrl", async () => {
    await load({ apiUrl: "http://example.test/dl" });
    fake.downloads.onCreated.fire({ url: "https://a.test/f.zip" });
    expect(fetchMock.mock.calls[0][0]).toBe("http://example.test/dl");
  });

  it("falls back to the default when the stored apiUrl is empty", async () => {
    await load({ apiUrl: "" });
    fake.downloads.onCreated.fire({ url: "https://a.test/f.zip" });
    expect(fetchMock.mock.calls[0][0]).toBe(DEFAULT_API_URL);
  });

  it("follows apiUrl changes from sync storage only", async () => {
    await load();
    fake.storage.onChanged.fire({ apiUrl: { newValue: "http://local.test/x" } }, "local");
    fake.downloads.onCreated.fire({ url: "https://a.test/1" });
    expect(fetchMock.mock.calls[0][0]).toBe(DEFAULT_API_URL);

    fake.storage.onChanged.fire({ apiUrl: { newValue: "http://sync.test/x" } }, "sync");
    fake.downloads.onCreated.fire({ url: "https://a.test/2" });
    expect(fetchMock.mock.calls[1][0]).toBe("http://sync.test/x");
  });
});

describe("context menu", () => {
  it("recreates the download menu on install", async () => {
    await load();
    fake.runtime.onInstalled.fire();
    await flush();

    expect(fake.contextMenus.removeAll).toHaveBeenCalled();
    expect(fake.contextMenus.create).toHaveBeenCalledWith({
      id: "downloadContextMenu",
      title: "Download",
      contexts: ["link"],
    });
  });

  it("downloads the clicked link", async () => {
    await load();
    fake.contextMenus.onClicked.fire({
      menuItemId: "downloadContextMenu",
      linkUrl: "https://a.test/link.mp4",
    });
    expect(lastFetchBody()).toEqual({ url: "https://a.test/link.mp4" });
  });

  it("ignores other menu items and clicks without a link", async () => {
    await load();
    fake.contextMenus.onClicked.fire({ menuItemId: "other", linkUrl: "https://a.test/x" });
    fake.contextMenus.onClicked.fire({ menuItemId: "downloadContextMenu" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("runtime messages", () => {
  it("sends headers as a name/value map and drops undefined values", async () => {
    await load();
    const sendResponse = vi.fn();
    fake.runtime.onMessage.fire(
      {
        type: DOWNLOAD_ACTION,
        url: "https://a.test/v.mp4",
        headers: [
          { name: "Referer", value: "https://a.test" },
          { name: "X-Empty" },
        ],
      },
      {},
      sendResponse
    );

    expect(lastFetchBody()).toEqual({
      url: "https://a.test/v.mp4",
      headers: { Referer: "https://a.test" },
    });
    expect(sendResponse).toHaveBeenCalledWith({
      status: "Request sent to download server",
    });
  });

  it("rejects a download message without url", async () => {
    await load();
    const sendResponse = vi.fn();
    fake.runtime.onMessage.fire({ type: DOWNLOAD_ACTION }, {}, sendResponse);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(sendResponse).toHaveBeenCalledWith({ status: "No URL provided" });
  });

  it("forwards detected targets to the connected panel", async () => {
    await load();
    const port = connectPanel();
    const headers = [{ name: "A", value: "b" }];
    fake.runtime.onMessage.fire(
      { type: TARGET_DETECTED, url: "https://a.test/v.m3u8", headers },
      {},
      vi.fn()
    );

    expect(port.postMessage).toHaveBeenCalledWith({
      type: ADD_ITEM,
      url: "https://a.test/v.m3u8",
      headers,
    });
  });

  it("stops forwarding after the panel disconnects", async () => {
    await load();
    const port = connectPanel();
    port.onDisconnect.fire();
    fake.runtime.onMessage.fire(
      { type: TARGET_DETECTED, url: "https://a.test/v.m3u8" },
      {},
      vi.fn()
    );

    expect(port.postMessage).not.toHaveBeenCalled();
  });

  it("ignores connections that are not the sniffer panel", async () => {
    await load();
    const port = { name: "other", onDisconnect: fakeEvent(), postMessage: vi.fn() };
    fake.runtime.onConnect.fire(port);
    fake.runtime.onMessage.fire({ type: TARGET_DETECTED, url: "u" }, {}, vi.fn());

    expect(port.postMessage).not.toHaveBeenCalled();
  });
});

describe("target blocking", () => {
  const request = { tabId: 7, requestId: "r1", url: "https://a.test/clip.mp4?x=1" };

  it("does nothing while blocking is disabled", async () => {
    await load();
    const [result] = fake.webRequest.onBeforeRequest.fire(request);
    expect(result).toBeUndefined();
    expect(fake.tabs.sendMessage).not.toHaveBeenCalled();
  });

  it("cancels matching requests and notifies the tab", async () => {
    await load({ targetBlockingEnabled: true });
    const [result] = fake.webRequest.onBeforeRequest.fire(request);

    expect(result).toEqual({ cancel: true });
    expect(fake.tabs.sendMessage).toHaveBeenCalledWith(7, {
      type: TARGET_BLOCKED,
      url: request.url,
      requestId: "r1",
    });
  });

  it("lets non-matching requests through", async () => {
    await load({ targetBlockingEnabled: true });
    const [result] = fake.webRequest.onBeforeRequest.fire({
      ...request,
      url: "https://a.test/pic.png",
    });
    expect(result).toBeUndefined();
  });

  it("honors the stored extension list", async () => {
    await load({ targetBlockingEnabled: true, targetExtensions: ["ts"] });
    const [mp4] = fake.webRequest.onBeforeRequest.fire(request);
    const [ts] = fake.webRequest.onBeforeRequest.fire({
      ...request,
      url: "https://a.test/seg.ts",
    });
    expect(mp4).toBeUndefined();
    expect(ts).toEqual({ cancel: true });
  });

  it("queues blocked targets when the tab cannot be reached, once", async () => {
    await load({ targetBlockingEnabled: true });
    fake.tabs.sendMessage.mockRejectedValue(new Error("no receiver"));
    fake.webRequest.onBeforeRequest.fire(request);
    await flush();

    const sender = { tab: { id: 7 } };
    const first = vi.fn();
    fake.runtime.onMessage.fire({ type: GET_BLOCKED_TARGETS }, sender, first);
    expect(first).toHaveBeenCalledWith({
      targets: [{ url: request.url, requestId: "r1" }],
    });

    const second = vi.fn();
    fake.runtime.onMessage.fire({ type: GET_BLOCKED_TARGETS }, sender, second);
    expect(second).toHaveBeenCalledWith({ targets: [] });
  });

  it("answers an empty list when the sender has no tab", async () => {
    await load();
    const sendResponse = vi.fn();
    fake.runtime.onMessage.fire({ type: GET_BLOCKED_TARGETS }, {}, sendResponse);
    expect(sendResponse).toHaveBeenCalledWith({ targets: [] });
  });

  it("allows a target after ALLOW_TARGET and tells the tab to reload it", async () => {
    await load({ targetBlockingEnabled: true });
    const sendResponse = vi.fn();
    fake.runtime.onMessage.fire(
      { type: ALLOW_TARGET, requestId: "r1", url: request.url },
      { tab: { id: 7 } },
      sendResponse
    );

    expect(fake.tabs.sendMessage).toHaveBeenCalledWith(7, {
      type: UNBLOCK_TARGET,
      url: request.url,
    });
    expect(sendResponse).toHaveBeenCalledWith({ status: "Video allowed" });

    const [result] = fake.webRequest.onBeforeRequest.fire(request);
    expect(result).toEqual({});
  });
});

describe("single-use streaming playlists", () => {
  const playlist = {
    tabId: 7,
    requestId: "s1",
    type: "xmlhttprequest",
    url: "https://a.test/live/index.m3u8?token=once",
    requestHeaders: [
      { name: "Cookie", value: "a=b" },
      { name: "Referer", value: "https://a.test/watch" },
    ],
  };

  // The header cache listener and the blocking listener share this event.
  const blockResult = (details: object) =>
    fake.webRequest.onBeforeSendHeaders
      .fire(details)
      .find((result) => result !== undefined);

  afterEach(() => {
    vi.useRealTimers();
  });

  it("cancels the request and sends the url with its headers", async () => {
    await load({ targetBlockingEnabled: true });

    expect(blockResult(playlist)).toEqual({ cancel: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(lastFetchBody()).toEqual({
      url: playlist.url,
      headers: { Cookie: "a=b", Referer: "https://a.test/watch" },
      skip_head: true,
    });
  });

  it("handles playlists requested as media", async () => {
    await load({ targetBlockingEnabled: true });

    expect(blockResult({ ...playlist, type: "media" })).toEqual({ cancel: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("handles .mpd when it is a configured extension", async () => {
    await load({ targetBlockingEnabled: true, targetExtensions: ["mpd"] });

    expect(
      blockResult({ ...playlist, url: "https://a.test/manifest.mpd" })
    ).toEqual({ cancel: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does nothing while blocking is disabled", async () => {
    await load();

    expect(blockResult(playlist)).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("ignores streaming extensions that are not configured", async () => {
    await load({ targetBlockingEnabled: true, targetExtensions: ["mp4"] });

    expect(blockResult(playlist)).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("ignores other request types and non-streaming urls", async () => {
    await load({ targetBlockingEnabled: true });

    expect(blockResult({ ...playlist, type: "image" })).toBeUndefined();
    expect(
      blockResult({ ...playlist, url: "https://a.test/clip.mp4" })
    ).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends the same tab and url once per 5 seconds", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    await load({ targetBlockingEnabled: true });

    expect(blockResult(playlist)).toEqual({ cancel: true });
    vi.advanceTimersByTime(4999);
    expect(blockResult(playlist)).toEqual({ cancel: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1);
    blockResult(playlist);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    blockResult({ ...playlist, tabId: 8 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("is left to the header-aware listener by onBeforeRequest", async () => {
    await load({ targetBlockingEnabled: true });

    const [result] = fake.webRequest.onBeforeRequest.fire({
      tabId: 7,
      requestId: "s1",
      url: playlist.url,
    });
    expect(result).toBeUndefined();
    expect(fake.tabs.sendMessage).not.toHaveBeenCalled();
  });
});

describe("attachment responses", () => {
  const details = { requestId: "r9", url: "https://a.test/file.bin" };

  it("downloads attachments using the cached request headers", async () => {
    await load();
    fake.webRequest.onBeforeSendHeaders.fire({
      requestId: "r9",
      requestHeaders: [{ name: "Cookie", value: "a=b" }],
    });
    fake.webRequest.onHeadersReceived.fire({
      ...details,
      responseHeaders: [
        { name: "Content-Disposition", value: "attachment; filename=file.bin" },
      ],
    });

    expect(lastFetchBody()).toEqual({
      url: details.url,
      headers: { Cookie: "a=b" },
    });
  });

  it("downloads attachments without headers when none were cached", async () => {
    await load();
    fake.webRequest.onHeadersReceived.fire({
      ...details,
      responseHeaders: [
        { name: "Content-Disposition", value: "attachment; filename=file.bin" },
      ],
    });

    expect(lastFetchBody()).toEqual({ url: details.url });
  });

  it("does not download inline responses", async () => {
    await load();
    fake.webRequest.onBeforeSendHeaders.fire({
      requestId: "r9",
      requestHeaders: [{ name: "Cookie", value: "a=b" }],
    });
    fake.webRequest.onHeadersReceived.fire({
      ...details,
      responseHeaders: [{ name: "Content-Type", value: "text/html" }],
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
