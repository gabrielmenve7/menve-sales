import assert from "node:assert/strict";
import {
  buildChatHistory,
  buildLarissaSystemPrompt,
} from "./prompt-builder";

const skills = [
  {
    skillKey: "persona",
    content: "Seja Larissa.",
    sortOrder: 1,
  },
  {
    skillKey: "qualificacao",
    content: "Pergunte sobre necessidade.",
    sortOrder: 2,
  },
];

const prompt = buildLarissaSystemPrompt({
  skills,
  journey: {
    name: "João",
    company: "Acme",
    phone: "+5511999999999",
    website: "https://acme.com",
  },
  tenantName: "Menve",
});

assert.ok(prompt.includes("Larissa"));
assert.ok(prompt.includes("João"));
assert.ok(prompt.includes("Acme"));
assert.ok(prompt.includes("Skill: persona"));
assert.ok(prompt.includes("Skill: qualificacao"));

const history = buildChatHistory(
  [
    { direction: "INBOUND", body: "Oi", senderType: "LEAD" },
    { direction: "OUTBOUND", body: "Olá!", senderType: "AI_AGENT" },
  ],
  10,
);

assert.equal(history.length, 2);
assert.equal(history[0]?.role, "user");
assert.equal(history[1]?.role, "assistant");

console.log("prompt-builder.selftest.ts OK");
