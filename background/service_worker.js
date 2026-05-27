// Background service worker (MV3)
// Runs as an event-driven worker — no persistent state between events.

chrome.runtime.onInstalled.addListener(() => {
  console.log("Romplin Recipe installed.");
});

// Example: listen for messages from popup or content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("Background received:", message, "from", sender);
  sendResponse({ ok: true });
  return true; // keep channel open for async response
});
