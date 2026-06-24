import { ZappfyWhatsAppProvider } from "./zappfy-provider";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

const provider = new ZappfyWhatsAppProvider({
  baseUrl: "https://api.zappfy.io",
  instanceToken: "test-token",
});

const simple = provider.parseWebhook({
  event: "messages",
  data: {
    messageId: "m1",
    from: "5511999999999",
    text: "olá",
    fromMe: false,
    timestamp: 1_700_000_000_000,
  },
});
assert(simple.length === 1, "texto simples");
assert(simple[0]?.body === "olá", "body texto");

const audio = provider.parseWebhook({
  type: "NEW-MESSAGE",
  data: {
    key: {
      remoteJid: "5527997320619@s.whatsapp.net",
      fromMe: false,
      id: "BAE5DA285CEE647A",
    },
    message: {
      audioMessage: {
        url: "https://zapfy-bucket.example.com/temp-files/BAE5DA285CEE647A.m4a",
        mimetype: "audio/mp4",
        ptt: true,
      },
    },
    messageTimestamp: { low: 1_674_326_566, high: 0, unsigned: true },
  },
});
assert(audio.length === 1, "NEW-MESSAGE áudio");
assert(audio[0]?.body === "[Áudio]", "placeholder áudio");
assert(
  audio[0]?.mediaUrl?.includes("BAE5DA285CEE647A.m4a"),
  "mediaUrl do áudio",
);
assert(audio[0]?.mediaType === "audio/mp4", "mediaType áudio");
assert(audio[0]?.whatsappKeyId === "BAE5DA285CEE647A", "whatsappKeyId");

const skipped = provider.parseWebhook({
  type: "MESSAGE-UPDATED",
  data: { key: { id: "x", remoteJid: "5511999999999@s.whatsapp.net" } },
});
assert(skipped.length === 0, "MESSAGE-UPDATED ignorado");

const inboundText = provider.parseWebhook({
  type: "NEW-MESSAGE",
  data: {
    key: {
      remoteJid: "5527997320619@s.whatsapp.net",
      fromMe: false,
      id: "3EB0CBF3275965A42934",
    },
    pushName: "Lead Teste",
    messageTimestamp: 1674318916,
    message: { conversation: "Opa, beleza?" },
  },
});
assert(inboundText.length === 1, "NEW-MESSAGE texto recebido");
assert(inboundText[0]?.body === "Opa, beleza?", "conversation texto");
assert(inboundText[0]?.from === "5527997320619", "from digits");

console.log("zappfy-provider.selftest: OK");
