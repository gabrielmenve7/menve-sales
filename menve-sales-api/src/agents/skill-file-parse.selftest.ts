import assert from "node:assert/strict";
import { parseFrontmatter } from "./skill-file-parse";

const raw = `---
skillKey: persona
order: 1
---

# Body content`;

const { meta, body } = parseFrontmatter(raw);
assert.equal(meta.skillKey, "persona");
assert.equal(meta.order, "1");
assert.ok(body.includes("Body content"));

console.log("skill-file-parse.selftest.ts OK");
