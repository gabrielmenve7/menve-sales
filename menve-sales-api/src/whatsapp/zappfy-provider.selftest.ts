import { ZappfyWhatsAppProvider, parseZappfyDownloadResponse } from "./zappfy-provider";

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

const uazapiBody = provider.parseWebhook({
  fromMe: false,
  body: "Oi pelo body",
  number: "5511987654321",
});
assert(uazapiBody.length === 1, "Uazapi body+number");
assert(uazapiBody[0]?.body === "Oi pelo body", "body uazapi");
assert(uazapiBody[0]?.from === "5511987654321", "from number");

const isOnWa = provider.parseWebhook({
  data: {
    fromMe: false,
    body: "Texto sem key",
    isOnWhatsApp: [{ exists: true, jid: "5527997320619@s.whatsapp.net" }],
    messageTimestamp: 1674318916,
  },
});
assert(isOnWa.length === 1, "isOnWhatsApp jid");
assert(isOnWa[0]?.from === "5527997320619", "from isOnWhatsApp");

const nestedMessage = provider.parseWebhook({
  data: {
    fromMe: false,
    message: {
      key: {
        remoteJid: "5527997320619@s.whatsapp.net",
        fromMe: false,
        id: "NESTED1",
      },
      message: { conversation: "Proto aninhado" },
      pushName: "Lead",
    },
  },
});
assert(nestedMessage.length === 1, "message.key aninhado");
assert(nestedMessage[0]?.body === "Proto aninhado", "texto aninhado");

const messageBody = provider.parseWebhook({
  event: "messages",
  data: {
    messages: {
      key: {
        remoteJid: "5527997320619@s.whatsapp.net",
        fromMe: false,
        id: "MB1",
      },
      messageBody: "Via messageBody",
    },
  },
});
assert(messageBody.length === 1, "messageBody");
assert(messageBody[0]?.body === "Via messageBody", "body messageBody");

const lidWithAlt = provider.parseWebhook({
  type: "NEW-MESSAGE",
  data: {
    key: {
      remoteJid: "271361050177610@lid",
      remoteJidAlt: "5519992105272@s.whatsapp.net",
      fromMe: false,
      id: "LID1",
    },
    pushName: "Lead",
    message: { conversation: "Teste 04" },
  },
});
assert(lidWithAlt.length === 1, "LID com remoteJidAlt");
assert(lidWithAlt[0]?.from === "5519992105272", "telefone via remoteJidAlt");

const cleanedPn = provider.parseWebhook({
  type: "NEW-MESSAGE",
  data: {
    key: {
      remoteJid: "271361050177610@lid",
      cleanedSenderPn: "5519992105272",
      fromMe: false,
      id: "LID2",
    },
    message: { conversation: "Oi" },
  },
});
assert(cleanedPn[0]?.from === "5519992105272", "telefone via cleanedSenderPn");

const flatPanel = provider.parseWebhook({
  event: "messages",
  data: {
    chatid: "5519992105272@s.whatsapp.net",
    chatlid: "271361050177610@lid",
    content: "Mensagem teste painel",
    fromMe: false,
    isGroup: false,
    messageid: "FLAT_PANEL_1",
    messageType: "Conversation",
    messageTimestamp: 1_719_000_000,
  },
});
assert(flatPanel.length === 1, "formato painel chatid/chatlid/content");
assert(flatPanel[0]?.body === "Mensagem teste painel", "content como body");
assert(flatPanel[0]?.from === "5519992105272", "telefone via chatid");
assert(flatPanel[0]?.externalId === "FLAT_PANEL_1", "messageid como externalId");

const flatAudio = provider.parseWebhook({
  event: "messages",
  data: {
    chatid: "5519992105272@s.whatsapp.net",
    chatlid: "271361050177610@lid",
    content: "",
    fromMe: false,
    isGroup: false,
    mediaType: "AudioMessage",
    messageid: "AUDIO_FLAT_1",
    messageTimestamp: 1_719_000_000,
  },
});
assert(flatAudio.length === 1, "formato painel audio");
assert(flatAudio[0]?.body === "[Áudio]", "placeholder audio");
assert(flatAudio[0]?.whatsappKeyId === "AUDIO_FLAT_1", "messageid como whatsappKeyId");
assert(flatAudio[0]?.from === "5519992105272", "telefone audio via chatid");

const flatAudioB64 = provider.parseWebhook({
  event: "messages",
  data: {
    chatid: "5519992105272@s.whatsapp.net",
    fromMe: false,
    mediaType: "ptt",
    messageid: "AUDIO_B64",
    convertOptions: { base64: "ZGF0YQ==", mimetype: "audio/ogg" },
  },
});
assert(flatAudioB64[0]?.mediaUrl?.includes("base64"), "base64 em convertOptions");
assert(flatAudioB64[0]?.mediaType === "audio/ogg", "mime convertOptions");

const zappfyDownload = parseZappfyDownloadResponse({
  fileURL: "https://cdn.zappfy.io/files/audio.mp3",
  mimetype: "audio/mpeg",
  base64Data: "ZGF0YQ==",
});
assert(zappfyDownload?.url?.includes("audio.mp3"), "fileURL da doc Zappfy");
assert(zappfyDownload?.base64 === "ZGF0YQ==", "base64Data da doc Zappfy");

console.log("zappfy-provider.selftest: OK");
