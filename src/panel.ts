import { Message, Header } from "./types";
import {
  ADD_ITEM,
  DOWNLOAD_ACTION,
  DOWNLOAD_BUTTON,
  TARGET_SNIFFER,
} from "./constants";

const targetListElem = document.getElementById(
  "target-list"
) as HTMLUListElement;
const port = browser.runtime.connect({ name: TARGET_SNIFFER });

port.onMessage.addListener((msg) => {
  console.debug("[Panel] port.onMessage.addListener:", msg);

  const message = msg as Message;
  if (message.type === ADD_ITEM) {
    console.log("[Panel] Received ADD_ITEM:", message.url);
    addVideoItem(message.url, message.headers);
  }
});

function addVideoItem(url: string, headers?: Array<Header>) {
  console.debug("[Panel] addVideoItem:", url);
  if (!targetListElem) return;
  const li = document.createElement("li");
  li.textContent = url + " ";

  const btn = document.createElement("button");
  btn.innerText = DOWNLOAD_BUTTON;
  btn.addEventListener("click", () => {
    browser.runtime
      .sendMessage({ type: DOWNLOAD_ACTION, url, headers })
      .then((response) => {
        console.debug("[Panel] Download message response:", response);
      });
  });

  li.appendChild(btn);
  targetListElem.appendChild(li);
}

console.debug("[Panel] loaded");
