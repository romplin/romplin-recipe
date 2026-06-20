console.log("popup.js loaded");
const extractBtn = document.getElementById("extract-btn");
const restoreBtn = document.getElementById("restore-btn");
const statusEl   = document.getElementById("status");

function setStatus(text, type = "idle") {
  statusEl.textContent = text;
  statusEl.className = `status ${type}`;
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

// Safe wrappers around storage.session (Chrome 102+)
async function sessionGet(key) {
  try { return await chrome.storage.session.get(key); } catch (_) { return {}; }
}
async function sessionSet(obj) {
  try { await chrome.storage.session.set(obj); } catch (_) {}
}
async function sessionRemove(key) {
  try { await chrome.storage.session.remove(key); } catch (_) {}
}

// On open: check if reader is already active on this tab
(async () => {
  try {
    const tab = await getActiveTab();
    if (!tab) return;
    const stored = await sessionGet(`rr_active_${tab.id}`);
    if (stored[`rr_active_${tab.id}`]) {
      setStatus("Recipe view is active.", "active");
      extractBtn.classList.add("hidden");
      restoreBtn.classList.remove("hidden");
    }
  } catch (err) {
    console.warn("romplin-recipe init error:", err);
  }
})();

extractBtn.addEventListener("click", async () => {
  try {
    const tab = await getActiveTab();
    if (!tab) { setStatus("No active tab found.", "error"); return; }
    setStatus("Extracting…", "idle");

    // Inject content script on demand; guard in content.js prevents double-injection.
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content/content.js"]
    });

    chrome.tabs.sendMessage(tab.id, { action: "extractRecipe" }, async (response) => {
      if (chrome.runtime.lastError) {
        setStatus("Could not reach page. Try refreshing.", "error");
        return;
      }
      if (!response || !response.found) {
        setStatus("No recipe found on this page.", "error");
        return;
      }
      setStatus(`Showing: ${response.title || "Recipe"}`, "found");
      await sessionSet({ [`rr_active_${tab.id}`]: true });
      extractBtn.classList.add("hidden");
      restoreBtn.classList.remove("hidden");
    });
  } catch (err) {
    setStatus("Something went wrong.", "error");
    console.error("romplin-recipe extract error:", err);
  }
});

restoreBtn.addEventListener("click", async () => {
  try {
    const tab = await getActiveTab();
    if (!tab) return;
    chrome.tabs.sendMessage(tab.id, { action: "restorePage" }, async () => {
      await sessionRemove(`rr_active_${tab.id}`);
      setStatus("Detect a recipe on this page.", "idle");
      restoreBtn.classList.add("hidden");
      extractBtn.classList.remove("hidden");
    });
  } catch (err) {
    console.error("romplin-recipe restore error:", err);
  }
});
