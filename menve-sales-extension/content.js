/**
 * Extrai JID / dígitos do chat ativo.
 * 1) URL (quando a Meta expõe chat/...@c.us ou phone=)
 * 2) DOM — muitas sessões não atualizam a URL; o número ou JID aparece no cabeçalho #main.
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

/**
 * Cabeçalho da conversa aberta: título, subtítulo com telefone mascarado, ou JID em atributos.
 */
function parseChatFromMainDom() {
  const main = document.querySelector("#main");
  if (!main) return null;

  const header = main.querySelector("header");
  if (!header) return null;

  const candidates = [];

  header.querySelectorAll("[title]").forEach((el) => {
    const raw = (el.getAttribute("title") || "").trim();
    const d = raw.replace(/\D/g, "");
    if (d.length >= 10 && d.length <= 15) {
      candidates.push({ digits: d, weight: d.startsWith("55") ? 3 : 2 });
    }
  });

  const html = header.innerHTML;
  const jidMatch = html.match(/(\d{8,15})@(c\.us|s\.whatsapp\.net)/);
  if (jidMatch) {
    const d = jidMatch[1].replace(/\D/g, "");
    if (d.length >= 8) {
      candidates.push({ digits: d, weight: 4 });
    }
  }

  const text = header.innerText || "";
  const runs = text.match(/\d[\d\s().-]{7,22}\d/g);
  if (runs) {
    for (const run of runs) {
      const d = run.replace(/\D/g, "");
      if (d.length >= 10 && d.length <= 15) {
        candidates.push({ digits: d, weight: d.startsWith("55") ? 3 : 1 });
      }
    }
  }

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => b.weight - a.weight);
  const best = candidates[0].digits;
  return {
    kind: "direct",
    jid: `${best}@c.us`,
    digits: best,
  };
}

function resolveActiveChat() {
  return parseChatFromLocation() || parseChatFromMainDom();
}

function publish() {
  const parsed = resolveActiveChat();
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

let debounceTimer = null;
function schedulePublish() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(publish, 120);
}

publish();
setInterval(publish, 2000);
window.addEventListener("hashchange", schedulePublish);
window.addEventListener("popstate", schedulePublish);

let mainObserverAttached = false;
function attachMainObserver() {
  if (mainObserverAttached) return true;
  const main = document.querySelector("#main");
  if (!main) return false;
  mainObserverAttached = true;
  const mo = new MutationObserver(() => schedulePublish());
  mo.observe(main, { subtree: true, childList: true });
  return true;
}

if (!attachMainObserver()) {
  const boot = setInterval(() => {
    if (attachMainObserver()) clearInterval(boot);
  }, 400);
}
