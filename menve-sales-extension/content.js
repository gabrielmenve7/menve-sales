/**
 * Extrai o JID / dígitos do chat ativo no WhatsApp Web (heurística — pode quebrar se a Meta mudar a UI).
 */
function parseChatFromLocation() {
  const blob =
    window.location.pathname +
    window.location.search +
    window.location.hash;

  const phoneParam = blob.match(/[?&]phone=(\d{8,16})\b/);
  if (phoneParam) {
    return {
      kind: "direct",
      jid: `${phoneParam[1]}@c.us`,
      digits: phoneParam[1],
    };
  }

  let segment = blob.match(/chat\/([^/?&#]+)/);
  let jid = segment ? segment[1] : null;

  if (!jid) {
    const embedded = blob.match(/(\d{8,15})@(c\.us|s\.whatsapp\.net)/);
    if (embedded) jid = embedded[0];
  }

  if (!jid) return null;

  try {
    jid = decodeURIComponent(jid);
  } catch {
    /* ignore */
  }

  if (jid.includes("@g.us")) {
    return { kind: "group", jid };
  }
  if (jid.includes("@lid")) {
    return { kind: "lid", jid };
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
  } else if (parsed?.kind === "lid") {
    chrome.runtime.sendMessage(
      {
        type: "MENVE_WA_PHONE",
        phone: "",
        jid: parsed.jid,
        kind: "lid",
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

publish();
setInterval(publish, 2000);
window.addEventListener("hashchange", publish);
window.addEventListener("popstate", publish);
