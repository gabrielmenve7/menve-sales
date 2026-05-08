/**
 * Encaminha telefone detectado no WhatsApp Web para storage e abre o painel pelo ícone da extensão.
 */
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch(() => {});
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "MENVE_WA_PHONE") {
    const patch = {
      menveWaLastPhone: typeof msg.phone === "string" ? msg.phone : "",
      menveWaLastJid: typeof msg.jid === "string" ? msg.jid : "",
      menveWaChatKind:
        msg.kind === "group"
          ? "group"
          : msg.kind === "direct"
            ? "direct"
            : "unknown",
      menveWaUpdatedAt: Date.now(),
    };
    chrome.storage.local.set(patch).then(() => sendResponse({ ok: true }));
    return true;
  }
  sendResponse({ ok: false });
  return false;
});
