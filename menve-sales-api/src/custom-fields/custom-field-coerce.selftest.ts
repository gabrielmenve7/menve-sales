/**
 * Execução: `npx tsx src/custom-fields/custom-field-coerce.selftest.ts`
 * Valida coerção sem subir o Nest.
 */
import assert from "node:assert/strict";
import { BadRequestException } from "@nestjs/common";
import { coerceCustomFieldValue } from "./custom-field-coerce";

const tenantId = "t1";

const prismaMock = {
  user: {
    findFirst: async (args: { where: { id: string; tenantId: string } }) =>
      args.where.id === "u_ok" && args.where.tenantId === tenantId
        ? { id: args.where.id }
        : null,
  },
};

async function run() {
  const p = prismaMock as never;

  assert.equal(
    await coerceCustomFieldValue(p, tenantId, "TEXT", "  a  ", null),
    "a",
  );

  assert.equal(await coerceCustomFieldValue(p, tenantId, "NUMBER", 42, null), 42);
  assert.equal(
    await coerceCustomFieldValue(p, tenantId, "NUMBER", "3.5", null),
    3.5,
  );

  await assert.rejects(
    () => coerceCustomFieldValue(p, tenantId, "NUMBER", "x", null),
    BadRequestException,
  );

  assert.equal(
    await coerceCustomFieldValue(p, tenantId, "MONEY_BRL", 10.126, null),
    10.13,
  );
  assert.equal(
    await coerceCustomFieldValue(p, tenantId, "MONEY_BRL", "1.234,56", null),
    1234.56,
  );
  await assert.rejects(
    () => coerceCustomFieldValue(p, tenantId, "MONEY_BRL", -1, null),
    BadRequestException,
  );

  assert.equal(
    await coerceCustomFieldValue(p, tenantId, "URL", "https://menve.com", null),
    "https://menve.com/",
  );

  await assert.rejects(
    () => coerceCustomFieldValue(p, tenantId, "URL", "ftp://x", null),
    BadRequestException,
  );

  assert.equal(
    await coerceCustomFieldValue(p, tenantId, "EMAIL", "A@B.COM", null),
    "a@b.com",
  );

  assert.equal(
    await coerceCustomFieldValue(p, tenantId, "SELECT", "a", ["a", "b"]),
    "a",
  );
  await assert.rejects(
    () => coerceCustomFieldValue(p, tenantId, "SELECT", "c", ["a", "b"]),
    BadRequestException,
  );

  assert.equal(
    await coerceCustomFieldValue(p, tenantId, "USER", "u_ok", null),
    "u_ok",
  );
  await assert.rejects(
    () => coerceCustomFieldValue(p, tenantId, "USER", "no", null),
    BadRequestException,
  );

  await assert.rejects(
    () => coerceCustomFieldValue(p, tenantId, "UNKNOWN", "x", null),
    BadRequestException,
  );

  console.log("custom-field-coerce.selftest: OK");
}

void run().catch((e) => {
  console.error(e);
  process.exit(1);
});
