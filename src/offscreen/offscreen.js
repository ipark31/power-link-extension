// Power Link — offscreen clipboard writer (text/plain + text/html)
// The offscreen document never has focus, so navigator.clipboard is unavailable here;
// execCommand('copy') on a selected textarea is the supported path (reason: CLIPBOARD).
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.target !== 'offscreen' || msg.type !== 'copy') return false;
  let fired = false;
  const onCopy = (e) => {
    e.clipboardData.setData('text/plain', msg.text || '');
    if (msg.html) e.clipboardData.setData('text/html', msg.html);
    e.preventDefault();
    fired = true;
  };
  document.addEventListener('copy', onCopy, true);
  const ta = document.getElementById('t');
  ta.value = msg.text || ' ';
  ta.focus();
  ta.select();
  ta.setSelectionRange(0, ta.value.length);
  let ret = false;
  try { ret = document.execCommand('copy'); } catch (e) { ret = false; }
  document.removeEventListener('copy', onCopy, true);
  sendResponse({ ok: fired || ret, fired, ret });
  return false;
});
