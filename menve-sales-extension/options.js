const apiEl = document.getElementById("api");
const tokenEl = document.getElementById("token");
const crmEl = document.getElementById("crm");
const saveBtn = document.getElementById("save");
const msgEl = document.getElementById("msg");

chrome.storage.local.get(
  ["menveApiBaseUrl", "menveAccessToken", "menveCrmBaseUrl"],
  (s) => {
    apiEl.value = s.menveApiBaseUrl || "";
    tokenEl.value = s.menveAccessToken || "";
    crmEl.value = s.menveCrmBaseUrl || "";
  },
);

saveBtn.addEventListener("click", () => {
  chrome.storage.local.set(
    {
      menveApiBaseUrl: apiEl.value.trim(),
      menveAccessToken: tokenEl.value.trim(),
      menveCrmBaseUrl: crmEl.value.trim(),
    },
    () => {
      msgEl.style.display = "block";
      setTimeout(() => {
        msgEl.style.display = "none";
      }, 2500);
    },
  );
});
