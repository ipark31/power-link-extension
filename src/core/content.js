// Content script for Power Link
console.log('Power Link content script loaded.');

function getYouTubeChannelName() {
    // 1. 영상 페이지
    let el =
        document.querySelector('ytd-channel-name a') ||
        document.querySelector('#channel-name yt-formatted-string') ||
        document.querySelector('yt-formatted-string#text');

    if (!el) return null;

    return el.textContent.trim();
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'GET_YT_CHANNEL_NAME') {
        sendResponse({
            channelName: getYouTubeChannelName()
        });
    }
});
