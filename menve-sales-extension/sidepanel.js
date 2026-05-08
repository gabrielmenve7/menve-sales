const root = document.getElementById("root");

function esc(s) {
  const d = document.createElement("div");
  d.textContent = s ?? "";
  return d.innerHTML;
}

function fmtMoney(v) {
  if (v == null || v === "") return "—";
  const n = typeof v === "string" ? Number(v) : Number(v);
  if (!Number.isFinite(n)) return String(v);
  return n.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });
}

function dealStatusPt(s) {
  const m = {
    OPEN: "Aberta",
    WON: "Ganha",
    LOST: "Perdida",
    ARCHIVED: "Arquivada",
  };
  return m[s] || s || "—";
}

async function loadSettings() {
  return chrome.storage.local.get([
    "menveApiBaseUrl",
    "menveAccessToken",
    "menveCrmBaseUrl",
    "menveWaLastPhone",
    "menveWaChatKind",
    "menveWaLastJid",
  ]);
}

function normalizeHttpOrigin(raw) {
  const t = (raw || "").trim();
  if (!t) return "";
  let u = t.replace(/\/$/, "");
  if (/^https?:\/\//i.test(u)) return u;
  const hostPart = u.split("/")[0].toLowerCase();
  if (
    hostPart.startsWith("localhost") ||
    hostPart.startsWith("127.0.0.1") ||
    hostPart === "[::1]"
  ) {
    return `http://${u}`;
  }
  return `https://${u}`;
}

function joinApiUrl(base, path) {
  const b = normalizeHttpOrigin(base);
  const p = path.startsWith("/") ? path : `/${path}`;
  return b + p;
}

async function fetchResolve(apiBase, token, phone) {
  const u = new URL(joinApiUrl(apiBase, "/contacts/resolve"));
  u.searchParams.set("phone", phone);
  const res = await fetch(u.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { ok: res.ok, status: res.status, json };
}

/** Evita que respostas antigas sobrescrevam o painel após troca rápida de chat. */
let paintGeneration = 0;

async function paint() {
  const gen = ++paintGeneration;
  const s = await loadSettings();

  if (!s.menveApiBaseUrl?.trim() || !s.menveAccessToken?.trim()) {
    root.innerHTML =
      '<div class="card"><p class="muted">Configure a URL da API e o token JWT.</p><p><button type="button" id="openOpts" style="padding:8px 12px;cursor:pointer;font-weight:600">Abrir opções</button></p></div>';
    queueMicrotask(() => {
      document.getElementById("openOpts")?.addEventListener("click", () => {
        chrome.runtime.openOptionsPage?.();
      });
    });
    return;
  }

  if (s.menveWaChatKind === "group") {
    root.innerHTML =
      '<div class="card"><p class="muted">Chat em grupo: não há um único cadastro de telefone. Abra uma conversa direta para ver o lead.</p></div>';
    return;
  }

  if (s.menveWaChatKind === "lid") {
    root.innerHTML =
      '<div class="card"><p class="muted">Este chat usa identificador interno do WhatsApp (lid). Abra uma conversa 1:1 em que o número apareça na lista à esquerda ou na URL.</p></div>';
    return;
  }

  const phone = (s.menveWaLastPhone || "").trim();
  if (!phone) {
    root.innerHTML =
      '<div class="card"><p><span class="pulse"></span> <strong>Aguardando número do chat…</strong></p><p class="muted">Clique na conversa na <strong>lista à esquerda</strong> no WhatsApp Web. Se não atualizar em alguns segundos, pressione <strong>F5</strong> na aba do WhatsApp.</p></div>';
    return;
  }

  root.innerHTML =
    '<div class="card muted"><strong>Buscando lead no Menve…</strong><br/><code>' +
    esc(phone) +
    "</code></div>";

  try {
    const { ok, status, json } = await fetchResolve(
      s.menveApiBaseUrl.trim(),
      s.menveAccessToken.trim(),
      phone,
    );

    if (gen !== paintGeneration) return;

    if (!ok) {
      let msg =
        json?.message ||
        json?.error ||
        json?.statusMessage ||
        "Erro ao consultar API";
      if (Array.isArray(msg)) msg = msg.join(", ");
      if (typeof msg !== "string") msg = JSON.stringify(msg);
      root.innerHTML =
        '<div class="card"><p class="err">HTTP ' +
        esc(String(status)) +
        "</p><p class=\"err\">" +
        esc(msg) +
        '</p><p class="muted">Token JWT expirado ou workspace errado — gere novo token (<code>POST /auth/login</code>) e salve em Opções.</p></div>';
      return;
    }

    if (!json.found) {
      const tried = Array.isArray(json.triedVariants)
        ? json.triedVariants.join(", ")
        : "";
      root.innerHTML =
        '<div class="card"><p><strong>Nenhum lead encontrado</strong> no Menve para este número.</p>' +
        '<p class="muted">Dígitos no WhatsApp: <code>' +
        esc(phone) +
        "</code></p>" +
        (tried
          ? '<p class="muted">Formatos tentados na API: <code>' +
            esc(tried) +
            "</code></p>"
          : "") +
        '<p class="muted">Cadastre o <strong>telefone</strong> no contato no CRM (com ou sem 55).</p></div>';
      return;
    }

    const c = json.contact;
    const crm = normalizeHttpOrigin(s.menveCrmBaseUrl || "");
    const detailUrl = crm
      ? crm + "/contacts/" + encodeURIComponent(c.id)
      : "";

    const tags =
      (c.contactTags || [])
        .map((ct) => ct.tag)
        .filter(Boolean)
        .map(
          (t) =>
            '<span class="tag" title="' +
            esc(t.name) +
            '">' +
            esc(t.name) +
            "</span>",
        )
        .join("") || '<span class="muted">Sem tags</span>';

    const origin =
      c.campaignSource?.name != null
        ? '<p class="muted">Origem: <strong>' +
          esc(c.campaignSource.name) +
          "</strong></p>"
        : "";

    const deals = Array.isArray(c.deals) ? c.deals : [];
    const dealsHtml =
      deals.length === 0
        ? '<p class="muted">Nenhuma oportunidade.</p>'
        : deals
            .map((d) => {
              const pipe = d.pipeline?.name || "—";
              const stage = d.stage?.name || "—";
              const st = dealStatusPt(d.status);
              const owner = d.assignedTo?.name || d.assignedTo?.email || "";
              const ownerLine = owner
                ? '<span class="muted"> · Resp.: ' + esc(owner) + "</span>"
                : "";
              return (
                '<div class="deal"><strong>' +
                esc(d.title || "(sem título)") +
                "</strong><br/><span class=\"muted\">" +
                esc(pipe) +
                " · " +
                esc(stage) +
                " · " +
                esc(st) +
                "</span>" +
                ownerLine +
                "<br/>" +
                fmtMoney(d.value) +
                "</div>"
              );
            })
            .join("");

    root.innerHTML =
      '<div class="card">' +
      "<p style=\"font-size:14px;margin:0 0 8px\"><strong>" +
      esc(c.name) +
      "</strong></p>" +
      '<p class="muted" style="margin:0 0 8px">' +
      esc(c.phone || phone) +
      (c.email
        ? '<br/><a href="mailto:' +
          esc(c.email) +
          '">' +
          esc(c.email) +
          "</a>"
        : "") +
      (c.company ? "<br/>" + esc(c.company) : "") +
      (c.jobTitle ? "<br/>" + esc(c.jobTitle) : "") +
      "</p>" +
      origin +
      "<div style=\"margin-top:8px\">" +
      tags +
      "</div>" +
      (detailUrl
        ? '<p style="margin-top:12px"><a class="btn" target="_blank" rel="noopener noreferrer" href="' +
          esc(detailUrl) +
          '">Abrir ficha no CRM</a></p>'
        : "") +
      "</div>" +
      '<div class="card"><p style="margin:0 0 8px;font-weight:600">Oportunidades</p>' +
      dealsHtml +
      "</div>";
  } catch (e) {
    if (gen !== paintGeneration) return;
    root.innerHTML =
      '<div class="card"><p class="err">' +
      esc(e instanceof Error ? e.message : String(e)) +
      "</p></div>";
  }
}

chrome.storage.onChanged.addListener(() => paint());

document.getElementById("btnRefresh")?.addEventListener("click", () => paint());
document.getElementById("btnOpts")?.addEventListener("click", () => {
  chrome.runtime.openOptionsPage?.();
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") paint();
});

window.addEventListener("focus", () => paint());

paint();
