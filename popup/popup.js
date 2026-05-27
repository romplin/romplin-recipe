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

// On open: check if reader is already active on this tab
(async () => {
  const tab = await getActiveTab();
  const stored = await chrome.storage.session.get(`rr_active_${tab.id}`);
  if (stored[`rr_active_${tab.id}`]) {
    setStatus("Recipe view is active.", "active");
    extractBtn.classList.add("hidden");
    restoreBtn.classList.remove("hidden");
  }
})();

extractBtn.addEventListener("click", async () => {
  const tab = await getActiveTab();
  setStatus("Extracting…", "idle");

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
    await chrome.storage.session.set({ [`rr_active_${tab.id}`]: true });
    extractBtn.classList.add("hidden");
    restoreBtn.classList.remove("hidden");
  });
});

restoreBtn.addEventListener("click", async () => {
  const tab = await getActiveTab();
  chrome.tabs.sendMessage(tab.id, { action: "restorePage" }, async () => {
    await chrome.storage.session.remove(`rr_active_${tab.id}`);
    setStatus("Detect a recipe on this page.", "idle");
    restoreBtn.classList.add("hidden");
    extractBtn.classList.remove("hidden");
  });
});
