// Service worker for Smart Link Extractor
chrome.runtime.onInstalled.addListener(() => {
    console.log('Smart Link Extractor installed.');
});

// Currently, orchestration is handled in popup.js.
// background.js can be used for cross-tab communication or persistent state if needed.
