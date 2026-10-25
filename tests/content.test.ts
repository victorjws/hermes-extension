import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createFakeBrowser,
  flush,
  loadScript,
  silenceConsole,
  type FakeBrowser,
} from "./fakeBrowser";
import {
  ALLOW_TARGET,
  DOWNLOAD_ACTION,
  DOWNLOAD_BUTTON,
  PLAY_BUTTON,
  STREAMING_BLOCKED,
  STREAMING_CHOICE,
  TARGET_BLOCKED,
  UNBLOCK_TARGET,
} from "../src/constants";

// content.ts attaches a MutationObserver to document.body at load time, so the
// script is loaded once and each test just swaps the body's contents.
let fake: FakeBrowser;

async function render(html: string) {
  document.body.innerHTML = html;
  await flush();
}

const container = () => document.querySelector<HTMLElement>(".hermes__button");
const downloadButtons = () =>
  Array.from(
    document.querySelectorAll<HTMLButtonElement>(".hermes__button__download")
  );
const playButton = () =>
  document.querySelector<HTMLButtonElement>(".hermes__button__play");

beforeAll(async () => {
  silenceConsole();
  vi.useFakeTimers();
  fake = createFakeBrowser();
  await loadScript("content", fake);
});

afterAll(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

beforeEach(() => {
  document.body.innerHTML = "";
  fake.runtime.sendMessage.mockClear();
});

describe("button injection", () => {
  it("adds a download button labelled with the format to a video", async () => {
    await render(`<div><video src="https://a.test/clip.mp4?x=1"></video></div>`);

    expect(container()).not.toBeNull();
    expect(downloadButtons().map((b) => b.textContent)).toEqual(["⬇MP4"]);
  });

  it("lists <source> children and does not repeat the same url", async () => {
    await render(`
      <div>
        <video src="https://a.test/a.mp4">
          <source src="https://a.test/a.mp4">
          <source src="https://a.test/b.webm">
        </video>
      </div>`);

    expect(downloadButtons().map((b) => b.textContent)).toEqual([
      "⬇MP4",
      "⬇WEBM",
    ]);
  });

  it("falls back to VIDEO when the url has no extension", async () => {
    await render(`<div><video src="https://a.test/stream"></video></div>`);
    expect(downloadButtons().map((b) => b.textContent)).toEqual(["⬇VIDEO"]);
  });

  it("adds nothing to a video without sources", async () => {
    await render(`<div><video></video></div>`);
    expect(container()).toBeNull();
  });

  it("does not add a second container when the DOM changes again", async () => {
    await render(`<div id="w"><video src="https://a.test/a.mp4"></video></div>`);
    document.getElementById("w")!.appendChild(document.createElement("span"));
    await flush();

    expect(document.querySelectorAll(".hermes__button")).toHaveLength(1);
  });

  it("makes a statically positioned parent relative", async () => {
    await render(`<div id="w"><video src="https://a.test/a.mp4"></video></div>`);
    expect(document.getElementById("w")!.style.position).toBe("relative");
  });

  it("shows the buttons on hover and hides them 5s after leaving", async () => {
    await render(`<div><video src="https://a.test/a.mp4"></video></div>`);
    const video = document.querySelector("video")!;

    expect(container()!.style.display).toBe("none");
    video.dispatchEvent(new Event("mouseenter"));
    expect(container()!.style.display).toBe("flex");

    video.dispatchEvent(new Event("mouseleave"));
    vi.advanceTimersByTime(4999);
    expect(container()!.style.display).toBe("flex");
    vi.advanceTimersByTime(1);
    expect(container()!.style.display).toBe("none");
  });
});

describe("download button", () => {
  it("asks the background to download the source url", async () => {
    await render(`<div><video src="https://a.test/clip.mp4"></video></div>`);
    downloadButtons()[0].click();

    expect(fake.runtime.sendMessage).toHaveBeenCalledWith({
      type: DOWNLOAD_ACTION,
      url: "https://a.test/clip.mp4",
    });
  });
});

describe("blocked targets", () => {
  const url = "https://a.test/clip.mp4";

  it("keeps the play button hidden until a target is blocked", async () => {
    await render(`<div><video src="${url}"></video></div>`);
    expect(playButton()!.style.display).toBe("none");
  });

  it("reveals the play button on TARGET_BLOCKED and allows the target on click", async () => {
    await render(`<div><video src="${url}"></video></div>`);
    fake.runtime.onMessage.fire({ type: TARGET_BLOCKED, url, requestId: "r1" });

    expect(playButton()!.style.display).toBe("inline-block");
    expect(playButton()!.dataset.requestId).toBe("r1");

    playButton()!.click();
    expect(fake.runtime.sendMessage).toHaveBeenCalledWith({
      type: ALLOW_TARGET,
      requestId: "r1",
      url,
    });
  });

  it("ignores TARGET_BLOCKED for other urls", async () => {
    await render(`<div><video src="${url}"></video></div>`);
    fake.runtime.onMessage.fire({
      type: TARGET_BLOCKED,
      url: "https://a.test/other.mp4",
      requestId: "r2",
    });

    expect(playButton()!.style.display).toBe("none");
  });

  it("applies targets queued in the background when the page loads", async () => {
    await render(`<div><video src="${url}"></video></div>`);
    fake.runtime.sendMessage.mockResolvedValueOnce({
      targets: [{ url, requestId: "r3" }],
    });
    document.dispatchEvent(new Event("DOMContentLoaded"));
    await flush();

    expect(playButton()!.dataset.requestId).toBe("r3");
    expect(playButton()!.style.display).toBe("inline-block");
  });

  it("reloads the matching video on UNBLOCK_TARGET", async () => {
    await render(`
      <div><video src="${url}"></video></div>
      <div><video src="https://a.test/other.mp4"></video></div>`);
    const load = vi
      .spyOn(HTMLMediaElement.prototype, "load")
      .mockImplementation(() => {});

    fake.runtime.onMessage.fire({ type: UNBLOCK_TARGET, url });

    expect(load).toHaveBeenCalledTimes(1);
    expect(load.mock.contexts[0]).toBe(document.querySelector("video"));
  });
});

describe("streaming prompt", () => {
  const url = "https://a.test/live/index.m3u8?token=once";

  const prompts = () =>
    Array.from(document.querySelectorAll<HTMLElement>(".hermes__prompt"));
  const promptButton = (kind: "play" | "download") =>
    document.querySelector<HTMLButtonElement>(`.hermes__prompt__${kind}`)!;

  it("shows one prompt per blocked url", async () => {
    fake.runtime.onMessage.fire({ type: STREAMING_BLOCKED, url });
    fake.runtime.onMessage.fire({ type: STREAMING_BLOCKED, url });
    fake.runtime.onMessage.fire({
      type: STREAMING_BLOCKED,
      url: "https://a.test/other.mpd",
    });

    expect(prompts()).toHaveLength(2);
    expect(prompts()[0].textContent).toContain("index.m3u8");
    expect(promptButton("play").textContent).toContain(PLAY_BUTTON);
    expect(promptButton("download").textContent).toContain(DOWNLOAD_BUTTON);
  });

  it("sends the download choice and removes the prompt", async () => {
    fake.runtime.onMessage.fire({ type: STREAMING_BLOCKED, url });
    promptButton("download").click();

    expect(fake.runtime.sendMessage).toHaveBeenCalledWith({
      type: STREAMING_CHOICE,
      url,
      choice: "download",
    });
    expect(prompts()).toHaveLength(0);
  });

  it("sends the play choice and hints for 5 seconds", async () => {
    fake.runtime.onMessage.fire({ type: STREAMING_BLOCKED, url });
    promptButton("play").click();

    expect(fake.runtime.sendMessage).toHaveBeenCalledWith({
      type: STREAMING_CHOICE,
      url,
      choice: "play",
    });
    expect(promptButton("play")).toBeNull();
    expect(prompts()).toHaveLength(1);

    vi.advanceTimersByTime(4999);
    expect(prompts()).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(prompts()).toHaveLength(0);
  });

  it("can ask again for a url after its prompt is gone", async () => {
    fake.runtime.onMessage.fire({ type: STREAMING_BLOCKED, url });
    promptButton("download").click();
    fake.runtime.onMessage.fire({ type: STREAMING_BLOCKED, url });

    expect(prompts()).toHaveLength(1);
  });
});
