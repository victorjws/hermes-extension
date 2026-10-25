## Ask play-or-download for single-use streaming playlists
Goal: streaming playlists (HLS .m3u8, DASH .mpd) that only allow one request are cancelled before they reach the server, and the user chooses whether the browser player or hermes-downloader gets to use them.
API: on "download", POST apiUrl with `{ url, headers, skip_head: true }`. `skip_head` tells hermes-downloader to send no HEAD request, since a single-use url would be consumed by it. Other download requests are unchanged and omit the field.
Messages (constants.ts):
- `STREAMING_BLOCKED` background -> tab `{ type, url }`: a streaming request was cancelled, ask the user.
- `STREAMING_CHOICE` content -> background `{ type, url, choice: "play" | "download" }`; the tab comes from `sender.tab`.
Models: none changed.
Rules:
- Applies only when `targetBlockingEnabled` is true, the request type is `media` or `xmlhttprequest` (players such as hls.js fetch playlists via XHR/fetch), and the url ends in a streaming extension (`m3u8`, `mpd`) that is also in the configured `targetExtensions`.
- Handled in a blocking `webRequest.onBeforeSendHeaders` listener: it runs before the request is sent, so a single-use url is not consumed, and it exposes the request headers (cookies, referer).
- A url the user already chose to play in that tab is let through (`{}`), as with `ALLOW_TARGET` for other media.
- Otherwise the request is cancelled. The first cancelled request of a tab+url stores its headers and sends `STREAMING_BLOCKED` to the tab. Further cancelled requests of the same tab+url (player retries) are cancelled silently and send nothing.
- `choice: "download"` sends the stored url + headers with `skip_head: true`, once. The tab+url stays recorded, so retries remain silent and never prompt again.
- `choice: "play"` forgets the stored request and allows the url in that tab. The user starts playback again and the request passes.
- A choice for a url with no stored request, or from a sender without a tab, is ignored.
- Stored requests and allowed urls of a tab are dropped when the tab closes or starts loading a new page.
- The content script shows one fixed-position prompt per url in the top-right of the page with a play button and a download button (reusing `PLAY_BUTTON` / `DOWNLOAD_BUTTON`). A click sends `STREAMING_CHOICE` and removes the prompt. After "play" a hint to press play again in the player is shown for 5 seconds. A second `STREAMING_BLOCKED` for a url that already has a prompt is ignored.
- The existing `onBeforeRequest` media blocking skips streaming urls so it does not cancel them before headers are available. Other media extensions (mp4, mkv, webm, vtt) keep the existing cancel + play-button flow.
- Non-streaming urls, other request types, extensions not in `targetExtensions`, blocking disabled: unchanged.
Errors: hermes-downloader unreachable -> logged, request stays cancelled (existing fetch .catch behavior). Tab unreachable for `STREAMING_BLOCKED` -> ignored.
Criteria:
- [ ] A matching `.m3u8` media or xmlhttprequest is cancelled in onBeforeSendHeaders, `STREAMING_BLOCKED` is sent to the tab, and fetch is not called.
- [ ] `.mpd` behaves the same when it is in targetExtensions.
- [ ] Blocking disabled, extension missing from targetExtensions, or other request type: not cancelled, no message, no fetch.
- [ ] Repeated cancelled requests of the same tab+url send one `STREAMING_BLOCKED`; another tab sends its own.
- [ ] `download` choice calls fetch once with `{ url, headers, skip_head: true }`; later retries of that url neither prompt nor fetch.
- [ ] `play` choice makes the next request of that tab+url pass; other tabs and urls are still cancelled.
- [ ] A choice without a stored request or without a sender tab does nothing.
- [ ] Closing or reloading a tab forgets its stored requests and allowed urls.
- [ ] Requests that are not streaming (context menu, downloads, panel) do not include `skip_head`.
- [ ] onBeforeRequest does not cancel streaming urls, and still cancels other media as before.
- [ ] Content script: `STREAMING_BLOCKED` renders one prompt per url; each button sends `STREAMING_CHOICE` with its choice and removes the prompt; "play" shows a hint that disappears after 5s.
