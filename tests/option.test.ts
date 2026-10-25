import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createFakeBrowser,
  flush,
  loadScript,
  silenceConsole,
  type FakeBrowser,
} from "./fakeBrowser";
import {
  API_URL,
  DEFAULT_API_URL,
  DEFAULT_TARGET_EXTENSIONS_INPUT,
  TARGET_BLOCKING_ENABLED,
  TARGET_EXTENSIONS,
} from "../src/constants";

let fake: FakeBrowser;

// Mirrors src/option.html.
const MARKUP = `
  <form id="options-form">
    <input type="text" id="${API_URL}" />
    <input type="text" id="${TARGET_EXTENSIONS}" />
    <input type="checkbox" id="${TARGET_BLOCKING_ENABLED}" />
    <button type="submit">Save</button>
  </form>`;

const apiUrl = () => document.getElementById(API_URL) as HTMLInputElement;
const extensions = () =>
  document.getElementById(TARGET_EXTENSIONS) as HTMLInputElement;
const blocking = () =>
  document.getElementById(TARGET_BLOCKING_ENABLED) as HTMLInputElement;

async function open(storage: Record<string, unknown> = {}) {
  document.body.innerHTML = MARKUP;
  fake = createFakeBrowser(storage);
  await loadScript("option", fake);
  document.dispatchEvent(new Event("DOMContentLoaded"));
  await flush();
}

function submit() {
  document
    .getElementById("options-form")!
    .dispatchEvent(new Event("submit", { cancelable: true }));
}

beforeEach(() => {
  silenceConsole();
  vi.stubGlobal("alert", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("options page", () => {
  it("shows the defaults when nothing is stored", async () => {
    await open();

    expect(apiUrl().value).toBe(DEFAULT_API_URL);
    expect(extensions().value).toBe(DEFAULT_TARGET_EXTENSIONS_INPUT);
    expect(blocking().checked).toBe(false);
  });

  it("shows the stored settings", async () => {
    await open({
      apiUrl: "http://example.test/dl",
      targetBlockingEnabled: true,
      targetExtensions: ["mp4", "ts"],
    });

    expect(apiUrl().value).toBe("http://example.test/dl");
    expect(extensions().value).toBe("mp4, ts");
    expect(blocking().checked).toBe(true);
  });

  it("saves normalized settings on submit", async () => {
    await open();
    apiUrl().value = "http://example.test/dl";
    extensions().value = " .mp4, mkv ,, webm";
    blocking().checked = true;
    submit();
    await flush();

    expect(fake.storage.sync.set).toHaveBeenCalledWith({
      apiUrl: "http://example.test/dl",
      targetBlockingEnabled: true,
      targetExtensions: ["mp4", "mkv", "webm"],
    });
    expect(alert).toHaveBeenCalledWith("Options saved.");
  });

  it("reports a failed save instead of staying silent", async () => {
    await open();
    fake.storage.sync.set.mockRejectedValueOnce(new Error("no extension id"));
    submit();
    await flush();

    expect(alert).toHaveBeenCalledWith(
      "Failed to save options: Error: no extension id"
    );
  });

  it("prevents the default form submission", async () => {
    await open();
    const event = new Event("submit", { cancelable: true });
    document.getElementById("options-form")!.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });
});
