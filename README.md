# hermes-extension

hermes-extension is a browser extension (currently available for Firefox) that simplifies downloading videos by adding a convenient download button directly onto video elements. The extension integrates seamlessly with [`hermes-downloader`](https://github.com/victorjws/hermes-downloader), enabling quick and effortless video downloads directly through the browser.

## Features

- **Automatic Video Detection**: The extension scans the current page for video elements and dynamically inserts a download button.
- **Customizable**: Configure which file extensions display the download button and specify which file types should be captured by the Video Sniffer panel.
- **Video Sniffer Panel**: Provides an alternative solution for videos restricted by cross-domain or embed settings, enabling manual detection and downloading through your browser’s developer tools.

## Installation

1. **Download extension**

   - Download the latest release from the [Releases](https://github.com/victorjws/hermes-extension/releases) page.

2. **Load as a Temporary Add-on (Firefox)**

   - Navigate to `about:debugging#/runtime/this-firefox` in your Firefox browser.
   - Click **Load Temporary Add-on**.
   - Select the extension archived (or the manifest file).

3. **Configure `hermes-downloader`**
   - Ensure you have Hermes Downloader installed and running.
   - If the extension requires any specific settings or port configurations, make sure they match between the extension and Hermes Downloader.

## Usage

1. **Start `hermes-downloader`**: Ensure `hermes-downloader` is running before using the extension.
2. **Visit a Web Page with a Video**: When you open a site with a supported video element, the extension will detect the video and overlay a download button (or place it near the video player).
3. **Click the Button**: Selecting the button triggers a call to Hermes Downloader.

### Handling Cross-Site or Embedded Videos

If videos do not appear due to cross-site or embedding restrictions, you can manually capture the video download link using the **Video Sniffer** panel:

1. Open the Video Sniffer Panel: First, open your browser’s developer tools and navigate to the Video Sniffer panel.
2. Reload or Visit the Video Page: After the panel is open, reload the current page or navigate to the page containing the video. The panel will now detect network requests for common video file extensions.
3. Initiate the Download: Once the video requests appear in the Video Sniffer panel, manually start the download by clicking the desired video entry.

### Single-use Streaming Playlists

Some sites serve an HLS (`.m3u8`) or DASH (`.mpd`) playlist from a URL that works only once. Once the page's player has requested it, `hermes-downloader` can no longer fetch it. Enable **Enable Target Request Blocking** in the options page to handle these:

- The playlist request is cancelled before it reaches the server and is sent to `hermes-downloader` together with its request headers (cookies, referer).
- Only extensions that are in **Target Extensions** are handled, so keep `m3u8` (and add `mpd` if you need DASH).
- Because the request is cancelled, the page's own player will not play the stream while this option is on.
