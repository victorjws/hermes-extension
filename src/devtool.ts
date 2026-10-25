import {
  TARGET_DETECTED,
  TARGET_EXTENSIONS,
  DEFAULT_TARGET_EXTENSIONS,
} from "./constants";

function buildRegex(targetExtensions: Array<string>) {
  return new RegExp("\\.(" + targetExtensions.join("|") + ")(?=\\?|$)", "i");
}

let regex = buildRegex(DEFAULT_TARGET_EXTENSIONS);

browser.devtools.network.onRequestFinished.addListener((req) => {
  console.debug(
    "[DevTool] browser.devtools.network.onRequestFinished.addListener:",
    req
  );

  const request = req as unknown as {
    request: {
      url: string;
      headers: { name: string; value: string }[];
    };
  };

  const url = request.request.url;
  const headers = request.request.headers;

  if (regex.test(url)) {
    console.debug("[DevTool] Detected target request:", url, headers);

    browser.runtime.sendMessage({
      type: TARGET_DETECTED,
      url,
      headers,
    });
  }
});

browser.storage.sync.get([TARGET_EXTENSIONS]).then((result) => {
  console.debug(
    "[DevTool] browser.storage.sync.get([VIDEO_EXTENSIONS]):",
    result
  );

  const targetExtensions =
    Array.isArray(result.targetExtensions) && result.targetExtensions.length > 0
      ? result.targetExtensions
      : DEFAULT_TARGET_EXTENSIONS;
  regex = buildRegex(targetExtensions);

  console.debug("[DevTool] VideoExtensions registered:", targetExtensions);
});

browser.storage.onChanged.addListener((changes, areaName) => {
  console.debug(
    "[DevTool] browser.storage.onChanged.addListener:",
    changes,
    areaName
  );

  if (areaName === "sync" && changes[TARGET_EXTENSIONS]) {
    const newExtensions = changes[TARGET_EXTENSIONS].newValue;
    console.debug("[DevTool] VideoExtensions changed:", newExtensions);

    regex = buildRegex(newExtensions);
  }
});

browser.devtools.panels.create("Video Sniffer", "", "panel.html");

console.debug("[DevTool] Extension loaded.");
