## Auto-send single-use streaming playlists to hermes-downloader
Goal: streaming playlists (HLS .m3u8, DASH .mpd) that only allow one request are cancelled before they reach the server and sent to hermes-downloader with their request headers.
API: POST apiUrl with `{ url, headers, skip_head: true }`. `skip_head` tells hermes-downloader to send no HEAD request, since a single-use url would be consumed by it. Other download requests are unchanged and omit the field.
Models: none changed.
Rules:
- Applies only when `targetBlockingEnabled` is true, the request type is `media` or `xmlhttprequest` (players such as hls.js fetch playlists via XHR/fetch), and the url ends in a streaming extension (`m3u8`, `mpd`) that is also in the configured `targetExtensions`.
- Handled in a blocking `webRequest.onBeforeSendHeaders` listener: it runs before the request is sent, so a single-use url is not consumed, and it exposes the request headers (cookies, referer).
- The request is cancelled and the url is sent to hermes-downloader with the request headers and `skip_head: true`.
- The same tab+url is sent once per 5 seconds (players retry cancelled requests).
- The existing `onBeforeRequest` media blocking skips streaming urls so it does not cancel them before headers are available. Other media extensions (mp4, mkv, webm, vtt) keep the existing cancel + play-button flow.
- Non-streaming urls, other request types, extensions not in `targetExtensions`, blocking disabled: unchanged.
Errors: hermes-downloader unreachable -> logged, request stays cancelled (existing fetch .catch behavior).
Criteria:
- [ ] A matching `.m3u8` media or xmlhttprequest is cancelled in onBeforeSendHeaders and fetch is called once with `{ url, headers, skip_head: true }`.
- [ ] `.mpd` behaves the same when it is in targetExtensions.
- [ ] Blocking disabled, extension missing from targetExtensions, or other request type: not cancelled, no fetch.
- [ ] Requests that are not streaming auto-sends (context menu, downloads, panel) do not include `skip_head`.
- [ ] The same tab+url within 5s sends one download request; after 5s it sends again.
- [ ] onBeforeRequest does not cancel streaming urls, and still cancels other media as before.
