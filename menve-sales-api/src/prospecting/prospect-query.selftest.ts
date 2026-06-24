/**
 * Execução: `npx tsx src/prospecting/prospect-query.selftest.ts`
 */
import assert from "node:assert/strict";
import { buildProspectQuery } from "./prospect-query";

assert.equal(
  buildProspectQuery("alfaiataria", "Curitiba", "PR"),
  "alfaiataria em Curitiba - PR",
);

console.log("prospect-query.selftest: ok");
