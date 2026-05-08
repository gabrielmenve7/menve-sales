/**
 * Extrai o JID / dígitos do chat ativo no WhatsApp Web (heurística — pode quebrar se a Meta mudar a UI).
 */
function parseChatFromLocation() {
  const blob =
    window.location.pathname +
    window.location.search +
    window.location.hash;
  const m = blob.match(/chat\/([^/?&#]+)/);
  if (!m) return null;
  let jid = m[1];
  try {
    jid = decodeURIComponent(jid);
  } catch {
    /* ignore */
  }
  if (jid.includes("@g.us")) {
    return { kind: "group", jid };
  }
  if (!jid.includes("@")) return null;
  const user = jid.split("@")[0];
  const digits = user.replace(/\D/g, "");
  if (digits.length < 8) return null;
  return { kind: "direct", jid, digits };
}

function publish() {
  const parsed = parseChatFromLocation();
  const finish = () => void chrome.runtime.lastError;
  if (parsed?.kind === "direct") {
    chrome.runtime.sendMessage(
      {
        type: "MENVE_WA_PHONE",
        phone: parsed.digits,
        jid: parsed.jid,
        kind: "direct",
      },
      finish,
    );
  } else if (parsed?.kind === "group") {
    chrome.runtime.sendMessage(
      {
        type: "MENVE_WA_PHONE",
        phone: "",
        jid: parsed.jid,
        kind: "group",
      },
      finish,
    );
  } else {
    chrome.runtime.sendMessage(
      {
        type: "MENVE_WA_PHONE",
        phone: "",
        jid: "",
        kind: "unknown",
      },
      finish,
    );
  }
}

let lastHref = location.href;
function tick() {
  if (location.href !== lastHref) {
    lastHref = location.href;
    publish();
  }
}

publish();
setInterval(tick, 1200);
window.addEventListener("hashchange", publish);
window.addEventListener("popstate", publish);
