import { BlockedTargetInfo, StreamingChoice, VideoSource } from "./types";
import {
  ALLOW_TARGET,
  DOWNLOAD_ACTION,
  DOWNLOAD_BUTTON,
  GET_BLOCKED_TARGETS,
  UNBLOCK_TARGET,
  TARGET_BLOCKED,
  STREAMING_BLOCKED,
  STREAMING_CHOICE,
  PLAY_BUTTON,
} from "./constants";

const PROMPT_HINT_MS = 5000;

function streamingName(url: string): string {
  try {
    return new URL(url).pathname.split("/").pop() || url;
  } catch {
    return url;
  }
}

function showStreamingPrompt(url: string) {
  const exists = Array.from(
    document.querySelectorAll<HTMLElement>(".hermes__prompt")
  ).some((prompt) => prompt.dataset.url === url);
  if (exists) return;

  const prompt = document.createElement("div");
  prompt.className = "hermes__prompt";
  prompt.dataset.url = url;
  prompt.style.position = "fixed";
  prompt.style.top = "8px";
  prompt.style.right = "8px";
  prompt.style.zIndex = "2147483647";
  prompt.style.padding = "8px";
  prompt.style.background = "#222";
  prompt.style.color = "#fff";
  prompt.style.font = "13px sans-serif";

  const label = document.createElement("span");
  label.textContent = streamingName(url) + " ";
  prompt.appendChild(label);

  const choose = (choice: StreamingChoice) => (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    browser.runtime.sendMessage({ type: STREAMING_CHOICE, url, choice });

    if (choice === "play") {
      prompt.textContent = "Press play again in the player";
      setTimeout(() => prompt.remove(), PROMPT_HINT_MS);
    } else {
      prompt.remove();
    }
  };

  const play = document.createElement("button");
  play.className = "hermes__prompt__play";
  play.textContent = PLAY_BUTTON;
  play.style.margin = "2px";
  play.style.cursor = "pointer";
  play.addEventListener("click", choose("play"));
  prompt.appendChild(play);

  const download = document.createElement("button");
  download.className = "hermes__prompt__download";
  download.textContent = DOWNLOAD_BUTTON;
  download.style.margin = "2px";
  download.style.cursor = "pointer";
  download.addEventListener("click", choose("download"));
  prompt.appendChild(download);

  document.body.appendChild(prompt);
}

function createButtonContainer() {
  const buttonContainer = document.createElement("div");
  buttonContainer.className = "hermes__button";
  buttonContainer.style.position = "absolute";
  buttonContainer.style.top = "8px";
  buttonContainer.style.right = "8px";
  buttonContainer.style.zIndex = "9999";
  buttonContainer.style.display = "none";
  return buttonContainer;
}

function createDownloadButton(source: VideoSource) {
  const button = document.createElement("button");
  button.className = "hermes__button__download";
  button.textContent = `${DOWNLOAD_BUTTON}${source.format}`;
  button.style.margin = "2px";
  button.style.cursor = "pointer";

  button.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    browser.runtime.sendMessage({ type: DOWNLOAD_ACTION, url: source.url });
  });

  return button;
}

function createPlayButton(requestId: string | undefined) {
  const button = document.createElement("button");
  button.className = "hermes__button__play";
  button.textContent = PLAY_BUTTON;
  button.style.margin = "2px";
  button.style.cursor = "pointer";

  if (!requestId) {
    button.style.display = "none";
  } else {
    button.dataset.requestId = requestId;
  }

  button.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const _requestId = button.dataset.requestId;
    const _url = button.dataset.targetUrl;
    if (_requestId) {
      browser.runtime.sendMessage({
        type: ALLOW_TARGET,
        requestId: _requestId,
        url: _url,
      });
    }
  });

  return button;
}

function getFormat(url: string): string {
  try {
    url = new URL(url).pathname;
  } catch {}
  const match = RegExp(/\.([A-Za-z0-9]+)(?:$|\?)/).exec(url);
  const ext = match ? match[1] : "video";
  return ext.toUpperCase();
}

function collectVideoSources(video: HTMLVideoElement): VideoSource[] {
  const sourceElems = Array.from(
    video.querySelectorAll<HTMLSourceElement>("source")
  );
  const videoSources: VideoSource[] = [];

  sourceElems.forEach((source) => {
    const srcUrl = source.src || source.getAttribute("src");
    if (srcUrl) {
      videoSources.push({ url: srcUrl, format: getFormat(srcUrl) });
    }
  });

  if (video.src) {
    const directSrc = video.src;
    const format = getFormat(directSrc);

    if (!videoSources.find((item) => item.url === directSrc)) {
      videoSources.push({ url: directSrc, format });
    }
  }

  return videoSources;
}

function addButtons(
  video: HTMLVideoElement,
  videoSources: VideoSource[]
): void {
  if ((video as any).dataset.hasHermesButton) return;
  (video as any).dataset.hasHermesButton = "true";

  if (videoSources.length === 0) return;

  const buttonContainer = createButtonContainer();

  const parent = video.parentElement;
  if (parent) {
    const parentStyle = window.getComputedStyle(parent);
    if (parentStyle.position === "static") {
      parent.style.position = "relative";
    }
    parent.appendChild(buttonContainer);
  } else {
    document.body.appendChild(buttonContainer);
  }

  const playButton = createPlayButton(video.dataset.requestId);
  buttonContainer.appendChild(playButton);

  videoSources.forEach((source) => {
    const downloadButton = createDownloadButton(source);
    buttonContainer.appendChild(downloadButton);
    console.debug("[Content] " + source.url + " created");
  });

  video.addEventListener("mouseenter", () => {
    buttonContainer.style.display = "flex";
  });
  video.addEventListener("mouseleave", () => {
    setTimeout(() => {
      buttonContainer.style.display = "none";
    }, 5000);
  });
  buttonContainer.addEventListener("mouseenter", () => {
    buttonContainer.style.display = "flex";
  });
  buttonContainer.addEventListener("mouseleave", () => {
    setTimeout(() => {
      buttonContainer.style.display = "none";
    }, 5000);
  });
}

function addBar(): void {
  const videos = document.querySelectorAll<HTMLVideoElement>("video");
  console.debug("[Content] " + videos.length + " exists");

  videos.forEach((video) => {
    if ((video as any).dataset.hasHermesButton) {
      return;
    }

    const sources = collectVideoSources(video);
    console.debug("[Content] " + video.src + " found");

    addButtons(video, sources);
  });
  console.debug("[Content] button added");
}

function getBlockedTargets() {
  browser.runtime
    .sendMessage({ type: GET_BLOCKED_TARGETS })
    .then((response) => {
      if (response.targets) {
        response.targets.forEach((info: BlockedTargetInfo) => {
          console.debug("[Content] Received blocked targets:", info);
          document.querySelectorAll("video").forEach((video) => {
            updatePlayButton(video, info);
          });
        });
      }
    });
}

function updatePlayButton(video: HTMLVideoElement, info: BlockedTargetInfo) {
  if (video.src === info.url) {
    const parent = video.parentElement;
    const container = parent?.querySelector(".hermes__button");
    console.debug("[Content] container:", parent, container);
    if (container) {
      const playButton = container.querySelector(
        ".hermes__button__play"
      ) as HTMLButtonElement;
      console.debug("[Content] playbutton:", playButton);
      if (playButton) {
        playButton.dataset.requestId = info.requestId;
        playButton.dataset.targetUrl = info.url;
        playButton.style.display = "inline-block";
      }
    }
  }
}

document.addEventListener("DOMContentLoaded", () => {
  console.debug("[Content] document.addEventListener('DOMContentLoaded')");

  addBar();
  getBlockedTargets();
});

browser.runtime.onMessage.addListener((message) => {
  console.debug("[Content] browser.runtime.onMessage.addListener:", message);

  if (message.type === TARGET_BLOCKED) {
    console.debug("[Content] Video blocked, showing button:", message.url);

    document.querySelectorAll("video").forEach((video: HTMLVideoElement) => {
      updatePlayButton(video, message);
    });
  } else if (message.type === STREAMING_BLOCKED) {
    console.debug("[Content] Streaming blocked, asking:", message.url);

    showStreamingPrompt(message.url);
  } else if (message.type === UNBLOCK_TARGET) {
    console.debug("[Content] Unblocking target for:", message.url);

    document.querySelectorAll("video").forEach((video: HTMLVideoElement) => {
      if (video.src === message.url) {
        video.load();
      }
    });
  }
});

const observer = new MutationObserver((mutations) => {
  console.debug("[Content] new MutationObserver", mutations);

  for (const m of mutations) {
    if (
      (m.type === "attributes" && m.attributeName === "src") ||
      (m.type === "childList" && m.addedNodes.length > 0)
    ) {
      addBar();
    }
  }
});

observer.observe(document.body, {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ["src"],
});

// 초기 지연 실행 (혹시나 빠르게 로드되는 동적 요소가 있을 경우)
setTimeout(addBar, 2000);
