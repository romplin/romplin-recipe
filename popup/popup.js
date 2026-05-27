document.getElementById("action-btn").addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  // Send a message to the content script on the current tab
  chrome.tabs.sendMessage(tab.id, { action: "ping" }, (response) => {
    const status = document.getElementById("status");
    if (chrome.runtime.lastError) {
      status.textContent = "Error: " + chrome.runtime.lastError.message;
    } else {
      status.textContent = response?.message ?? "No response.";
    }
  });
});
