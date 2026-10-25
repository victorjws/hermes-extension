import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createFakeBrowser,
  flush,
  loadScript,
  silenceConsole,
  type FakeBrowser,
} from "./fakeBrowser";
import { TARGET_DETECTED } from "../src/constants";

let fake: FakeBrowser;

async function load(storage: Record<string, unknown> = {}) {
  fake = createFakeBrowser(storage);
  await loadScript("devtool", fake);
}

function finished(url: string, headers = [{ name: "Accept", value: "*/*" }]) {
  fake.devtools.network.onRequestFinished.fire({ request: { url, headers } });
}

beforeEach(silenceConsole);

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("devtool", () => {
  it("registers the Video Sniffer panel", async () => {
    await load();
    expect(fake.devtools.panels.create).toHaveBeenCalledWith(
      "Video Sniffer",
      "",
      "panel.html"
    );
  });

  it("reports finished requests that match the stored extensions", async () => {
    await load({ targetExtensions: ["mp4"] });
    const headers = [{ name: "Referer", value: "https://a.test" }];
    finished("https://a.test/v.mp4?token=1", headers);

    expect(fake.runtime.sendMessage).toHaveBeenCalledWith({
      type: TARGET_DETECTED,
      url: "https://a.test/v.mp4?token=1",
      headers,
    });
  });

  it("ignores requests with other extensions", async () => {
    await load({ targetExtensions: ["mp4"] });
    finished("https://a.test/pic.png");
    finished("https://a.test/v.mp4.txt");

    expect(fake.runtime.sendMessage).not.toHaveBeenCalled();
  });

  it("uses the default extensions when storage has none", async () => {
    await load();
    finished("https://a.test/list.m3u8");
    expect(fake.runtime.sendMessage).toHaveBeenCalledTimes(1);
  });

  it("uses the default extensions when the stored list is empty", async () => {
    await load({ targetExtensions: [] });
    finished("https://a.test/list.m3u8");
    expect(fake.runtime.sendMessage).toHaveBeenCalledTimes(1);
  });

  it("detects newly configured extensions after a sync storage change", async () => {
    await load({ targetExtensions: ["mp4"] });
    finished("https://a.test/seg.ts");
    expect(fake.runtime.sendMessage).not.toHaveBeenCalled();

    fake.storage.onChanged.fire({ targetExtensions: { newValue: ["ts"] } }, "sync");
    await flush();
    finished("https://a.test/seg.ts");

    expect(fake.runtime.sendMessage).toHaveBeenCalledTimes(1);
  });

  it("stops detecting removed extensions and reports each request once", async () => {
    await load({ targetExtensions: ["mp4"] });
    fake.storage.onChanged.fire({ targetExtensions: { newValue: ["mp4", "ts"] } }, "sync");
    await flush();

    finished("https://a.test/v.mp4");
    expect(fake.runtime.sendMessage).toHaveBeenCalledTimes(1);

    fake.runtime.sendMessage.mockClear();
    fake.storage.onChanged.fire({ targetExtensions: { newValue: ["ts"] } }, "sync");
    await flush();

    finished("https://a.test/v.mp4");
    expect(fake.runtime.sendMessage).not.toHaveBeenCalled();
    finished("https://a.test/seg.ts");
    expect(fake.runtime.sendMessage).toHaveBeenCalledTimes(1);
  });

  it("ignores storage changes from other areas", async () => {
    await load({ targetExtensions: ["mp4"] });
    const before = fake.devtools.network.onRequestFinished.addListener.mock.calls.length;
    fake.storage.onChanged.fire({ targetExtensions: { newValue: ["ts"] } }, "local");

    expect(fake.devtools.network.onRequestFinished.addListener.mock.calls).toHaveLength(
      before
    );
  });
});
