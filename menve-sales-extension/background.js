/**
 * Encaminha telefone detectado no WhatsApp Web para storage e abre o painel pelo ícone da extensão.
 */
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch(() => {});
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== "MENVE_WA_PHONE") {
    sendResponse({ ok: false });
    return false;
  }

  const phone = typeof msg.phone === "string" ? msg.phone : "";
  const jid = typeof msg.jid === "string" ? msg.jid : "";
  const kind =
    msg.kind === "group"
      ? "group"
      : msg.kind === "direct"
        ? "direct"
        : msg.kind === "lid"
          ? "lid"
          : "unknown";

  chrome.storage.local
    .get(["menveWaLastPhone", "menveWaLastJid", "menveWaChatKind"])
    .then((prev) => {
      if (
        prev.menveWaLastPhone === phone &&
        prev.menveWaLastJid === jid &&
        prev.menveWaChatKind === kind
      ) {
        sendResponse({ ok: true, unchanged: true });
        return;
      }
      return chrome.storage.local
        .set({
          menveWaLastPhone: phone,
          menveWaLastJid: jid,
          menveWaChatKind: kind,
          menveWaUpdatedAt: Date.now(),
        })
        .then(() => sendResponse({ ok: true }));
    })
    .catch(() => sendResponse({ ok: false }));
  return true;
});
