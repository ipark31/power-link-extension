// Service worker for Power Link
chrome.runtime.onInstalled.addListener(() => {
    console.log('Power Link installed.');
});

// Currently, orchestration is handled in popup.js.
// background.js can be used for cross-tab communication or persistent state if needed.
