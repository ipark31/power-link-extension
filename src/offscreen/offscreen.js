// Power Link — offscreen clipboard writer (text/plain + text/html)
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.target !== 'offscreen' || msg.type !== 'copy') return false;
  let ok = false;
  const onCopy = (e) => {
    e.clipboardData.setData('text/plain', msg.text || '');
    if (msg.html) e.clipboardData.setData('text/html', msg.html);
    e.preventDefault();
    ok = true;
  };
  document.addEventListener('copy', onCopy);
  const ta = document.getElementById('t');
  ta.value = msg.text || ' ';
  ta.select();
  try { document.execCommand('copy'); } catch (e) { ok = false; }
  document.removeEventListener('copy', onCopy);
  sendResponse({ ok });
  return false;
});
