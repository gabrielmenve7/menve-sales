const apiEl = document.getElementById("api");
const tokenEl = document.getElementById("token");
const crmEl = document.getElementById("crm");
const saveBtn = document.getElementById("save");
const msgEl = document.getElementById("msg");

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

chrome.storage.local.get(
  ["menveApiBaseUrl", "menveAccessToken", "menveCrmBaseUrl"],
  (s) => {
    apiEl.value = s.menveApiBaseUrl || "";
    tokenEl.value = s.menveAccessToken || "";
    crmEl.value = s.menveCrmBaseUrl || "";
  },
);

saveBtn.addEventListener("click", () => {
  const api = normalizeHttpOrigin(apiEl.value);
  const crm = normalizeHttpOrigin(crmEl.value);
  chrome.storage.local.set(
    {
      menveApiBaseUrl: api,
      menveAccessToken: tokenEl.value.trim(),
      menveCrmBaseUrl: crm,
    },
    () => {
      apiEl.value = api;
      crmEl.value = crm;
      msgEl.style.display = "block";
      setTimeout(() => {
        msgEl.style.display = "none";
      }, 2500);
    },
  );
});
