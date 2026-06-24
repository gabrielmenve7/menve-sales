import assert from "node:assert/strict";
import {
  parseAgentSections,
  slugifySkillKey,
  agentKeyFromFilename,
} from "./skill-file.util";

assert.equal(slugifySkillKey("Qualificação"), "qualificacao");
assert.equal(slugifySkillKey("Objeções"), "objecoes");
assert.equal(agentKeyFromFilename("agent-gabriel.mdc"), "gabriel");
assert.equal(agentKeyFromFilename("squad-inbox.mdc"), null);

const body = `# Intro

Texto introdutório.

## Persona

Tom profissional.

## Qualificação

Pergunte sobre necessidade.
`;

const skills = parseAgentSections(body, ".cursor/rules/agent-gabriel.mdc");
assert.equal(skills.length, 2);
assert.equal(skills[0]?.skillKey, "persona");
assert.equal(skills[1]?.skillKey, "qualificacao");
assert.ok(skills[0]?.content.includes("Tom profissional"));

console.log("agent-file.selftest.ts OK");
