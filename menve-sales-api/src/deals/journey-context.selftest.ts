import assert from "node:assert/strict";
import {
  mergeCustomDataWebsite,
  readWebsiteFromCustomData,
} from "./journey-context.util";

function testReadWebsiteFromCustomData() {
  assert.equal(readWebsiteFromCustomData(null), null);
  assert.equal(
    readWebsiteFromCustomData({ website: "https://loja.com" }),
    "https://loja.com",
  );
  assert.equal(readWebsiteFromCustomData({ other: 1 }), null);
}

function testMergeCustomDataWebsite() {
  const merged = mergeCustomDataWebsite({ foo: "bar" }, "https://site.com");
  assert.equal(merged.foo, "bar");
  assert.equal(merged.website, "https://site.com");
  const kept = mergeCustomDataWebsite({ website: "https://a.com" }, null);
  assert.equal(kept.website, "https://a.com");
}

testReadWebsiteFromCustomData();
testMergeCustomDataWebsite();
console.log("journey-context.selftest.ts: ok");
