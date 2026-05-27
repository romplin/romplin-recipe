// Background service worker
// Clears the reader-active flag when the popup signals the reader was closed inline.

chrome.runtime.onInstalled.addListener(() => {
  console.log("romplin-recipe installed.");
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "readerClosed" && sender.tab?.id) {
    chrome.storage.session.remove(`rr_active_${sender.tab.id}`);
  }
  sendResponse({ ok: true });
  return true;
});
