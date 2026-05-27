// Content script — runs in the context of web pages.
// Has access to the DOM but not to chrome.* APIs directly (some are available).

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "ping") {
    sendResponse({ message: `Pong from ${document.title || location.href}` });
  }
  return true;
});
