/**
 * Extrai JID / dígitos do chat ativo — URL, lista lateral (salvo ou não), cabeçalho e fallback no painel principal.
 */

function jidFromDataId(raw) {
  if (!raw || typeof raw !== "string") return null;
  const id = raw.trim();
  if (id.includes("@g.us")) return { kind: "group", jid: id };
  if (id.includes("@lid")) return { kind: "lid", jid: id };
  if (!id.includes("@c.us") && !id.includes("@s.whatsapp.net")) return null;
  const user = id.split("@")[0];
  const digits = user.replace(/\D/g, "");
  if (digits.length < 8) return null;
  const jid = id.includes("@") ? id : `${digits}@c.us`;
  return { kind: "direct", jid, digits };
}

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
 * Lista de conversas à esquerda: a linha ativa quase sempre tem data-id="...@c.us",
 * mesmo quando o cabeçalho só mostra nome (contato salvo na agenda).
 */
function parseChatFromSidebar() {
  const side = document.querySelector("#pane-side");
  if (!side) return null;

  const selected = side.querySelectorAll('[aria-selected="true"]');
  for (const marker of selected) {
    let node = marker;
    for (let depth = 0; depth < 12 && node; depth++) {
      const withIds = node.querySelectorAll?.("[data-id]");
      if (withIds?.length) {
        for (const el of withIds) {
          const hit = jidFromDataId(el.getAttribute("data-id"));
          if (hit?.kind === "direct") return hit;
          if (hit?.kind === "group" || hit?.kind === "lid") return hit;
        }
      }
      const selfId = jidFromDataId(node.getAttribute?.("data-id"));
      if (selfId?.kind === "direct") return selfId;
      if (selfId?.kind === "group" || selfId?.kind === "lid") return selfId;
      node = node.parentElement;
    }

    const nested = marker.querySelector?.("[data-id*='@']");
    if (nested) {
      const hit = jidFromDataId(nested.getAttribute("data-id"));
      if (hit?.kind === "direct") return hit;
      if (hit?.kind === "group" || hit?.kind === "lid") return hit;
    }
  }

  const ariaCurrent = side.querySelector("[aria-current='true'], [aria-current=\"true\"]");
  if (ariaCurrent) {
    const hit = jidFromDataId(
      ariaCurrent.closest("[data-id]")?.getAttribute("data-id") ||
        ariaCurrent.querySelector("[data-id*='@']")?.getAttribute("data-id"),
    );
    if (hit?.kind === "direct") return hit;
    if (hit?.kind === "group" || hit?.kind === "lid") return hit;
  }

  return null;
}

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

/** Último recurso: qualquer JID no HTML do painel da conversa (mensagens / preload). */
function parseJidFromMainInnerHtml() {
  const main = document.querySelector("#main");
  if (!main) return null;
  const html = main.innerHTML;
  const all = [...html.matchAll(/(\d{8,15})@(c\.us|s\.whatsapp\.net)/g)];
  if (all.length === 0) return null;
  let bestDigits = null;
  for (const m of all) {
    const d = m[1];
    if (!bestDigits || d.length >= bestDigits.length) bestDigits = d;
  }
  if (!bestDigits || bestDigits.length < 8) return null;
  return {
    kind: "direct",
    jid: `${bestDigits}@c.us`,
    digits: bestDigits,
  };
}

function resolveActiveChat() {
  return (
    parseChatFromLocation() ||
    parseChatFromSidebar() ||
    parseChatFromMainDom() ||
    parseJidFromMainInnerHtml()
  );
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

let sideObserverAttached = false;
function attachSideObserver() {
  if (sideObserverAttached) return true;
  const side = document.querySelector("#pane-side");
  if (!side) return false;
  sideObserverAttached = true;
  const mo = new MutationObserver(() => schedulePublish());
  mo.observe(side, { subtree: true, childList: true, attributes: true });
  return true;
}

if (!attachMainObserver()) {
  const bootMain = setInterval(() => {
    if (attachMainObserver()) clearInterval(bootMain);
  }, 400);
}

if (!attachSideObserver()) {
  const bootSide = setInterval(() => {
    if (attachSideObserver()) clearInterval(bootSide);
  }, 400);
}
