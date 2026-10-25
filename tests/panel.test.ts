import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createFakeBrowser,
  flush,
  loadScript,
  silenceConsole,
  type FakeBrowser,
} from "./fakeBrowser";
import {
  ADD_ITEM,
  DOWNLOAD_ACTION,
  DOWNLOAD_BUTTON,
  TARGET_SNIFFER,
} from "../src/constants";

let fake: FakeBrowser;

async function open() {
  document.body.innerHTML = `<ul id="target-list"></ul>`;
  fake = createFakeBrowser();
  await loadScript("panel", fake);
}

const items = () => Array.from(document.querySelectorAll("#target-list li"));

beforeEach(silenceConsole);

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("sniffer panel", () => {
  it("connects to the background as the sniffer", async () => {
    await open();
    expect(fake.runtime.connect).toHaveBeenCalledWith({ name: TARGET_SNIFFER });
  });

  it("lists items received from the background", async () => {
    await open();
    fake.port.onMessage.fire({ type: ADD_ITEM, url: "https://a.test/v.mp4" });

    expect(items()).toHaveLength(1);
    expect(items()[0].textContent).toContain("https://a.test/v.mp4");
    expect(items()[0].querySelector("button")!.innerText).toBe(DOWNLOAD_BUTTON);
  });

  it("sends the url and headers when an item's button is clicked", async () => {
    await open();
    const headers = [{ name: "Referer", value: "https://a.test" }];
    fake.port.onMessage.fire({ type: ADD_ITEM, url: "https://a.test/v.mp4", headers });
    items()[0].querySelector("button")!.click();
    await flush();

    expect(fake.runtime.sendMessage).toHaveBeenCalledWith({
      type: DOWNLOAD_ACTION,
      url: "https://a.test/v.mp4",
      headers,
    });
  });

  it("ignores other message types", async () => {
    await open();
    fake.port.onMessage.fire({ type: "SOMETHING_ELSE", url: "https://a.test/x" });
    expect(items()).toHaveLength(0);
  });
});
