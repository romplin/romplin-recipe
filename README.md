# Romplin Recipe — Chrome Extension

A Manifest V3 Chrome extension.

## Structure

```
manifest.json          ← extension entry point & permissions
popup/
  popup.html           ← toolbar icon click → opens this
  popup.js             ← popup logic
  popup.css            ← popup styles
background/
  service_worker.js    ← event-driven background script
content/
  content.js           ← injected into web pages
icons/                 ← 16, 32, 48, 128 px PNGs
```

## Load in Chrome (dev mode)

1. Go to `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select this folder

Changes to JS/HTML/CSS take effect after clicking the **↺ refresh** button on the extension card.
The service worker reloads automatically on change.

## Key concepts

| File | Context | DOM access | `chrome.*` APIs |
|---|---|---|---|
| `popup.js` | Extension page | popup only | most |
| `service_worker.js` | Background (no DOM) | ✗ | most |
| `content.js` | Page context | ✓ | limited subset |
