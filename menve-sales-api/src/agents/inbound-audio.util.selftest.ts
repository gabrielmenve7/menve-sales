import assert from "node:assert/strict";
import {
  isInboundAudioMessage,
  llmContentFromInboundMessage,
} from "./inbound-audio.util";

assert.equal(isInboundAudioMessage({ body: "[Áudio]" }), true);
assert.equal(
  isInboundAudioMessage({ body: "oi", mediaType: "audio/mpeg" }),
  true,
);
assert.equal(isInboundAudioMessage({ body: "oi" }), false);

assert.equal(
  llmContentFromInboundMessage({
    body: "[Áudio]",
    audioTranscript: "Quero agendar uma demo",
  }),
  "[Áudio do lead]: Quero agendar uma demo",
);

console.log("inbound-audio.util selftest OK");
