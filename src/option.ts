import {
  API_URL,
  TARGET_EXTENSIONS,
  TARGET_BLOCKING_ENABLED,
  DEFAULT_TARGET_EXTENSIONS_INPUT,
  DEFAULT_API_URL,
  DEFAULT_TARGET_BLOCKING_ENABLED,
} from "./constants";

document.addEventListener("DOMContentLoaded", () => {
  console.debug("[Option] document.addEventListener('DOMContentLoaded')");

  const apiUrlInput = document.getElementById(API_URL) as HTMLInputElement;
  const targetBlockingEnabledInput = document.getElementById(
    TARGET_BLOCKING_ENABLED
  ) as HTMLInputElement;
  const targetExtensionsInput = document.getElementById(
    TARGET_EXTENSIONS
  ) as HTMLInputElement;
  const optionsForm = document.getElementById(
    "options-form"
  ) as HTMLFormElement;

  // Load existing settings from storage
  browser.storage.sync
    .get([API_URL, TARGET_BLOCKING_ENABLED, TARGET_EXTENSIONS])
    .then((result) => {
      console.debug(
        "[Option] browser.storage.sync.get([API_URL, TARGET_BLOCKING_ENABLED, TARGET_EXTENSIONS])",
        result
      );

      apiUrlInput.value =
        result.apiUrl !== undefined ? result.apiUrl : DEFAULT_API_URL;
      targetBlockingEnabledInput.checked =
        result.targetBlockingEnabled !== undefined
          ? result.targetBlockingEnabled
          : DEFAULT_TARGET_BLOCKING_ENABLED;
      targetExtensionsInput.value = result.targetExtensions
        ? result.targetExtensions.join(", ")
        : DEFAULT_TARGET_EXTENSIONS_INPUT;
    });

  // Save settings when the form is submitted
  optionsForm.addEventListener("submit", (e: Event) => {
    console.debug(
      "[Option] optionsForm.addEventListener('submit', (e: Event))",
      e
    );

    e.preventDefault();
    const url = apiUrlInput.value;
    const enabled = targetBlockingEnabledInput.checked;
    const extensionsInputValue = targetExtensionsInput.value;
    const extensions = extensionsInputValue
      .split(",")
      .map((ext: string) => ext.trim().replace(/^\./, ""))
      .filter((ext: string) => ext.length > 0);

    browser.storage.sync
      .set({
        apiUrl: url,
        targetBlockingEnabled: enabled,
        targetExtensions: extensions,
      })
      .then(() => {
        alert("Options saved.");
      });
  });
});
