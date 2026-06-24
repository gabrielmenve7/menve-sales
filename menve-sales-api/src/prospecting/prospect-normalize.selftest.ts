/**
 * Execução: `npx tsx src/prospecting/prospect-normalize.selftest.ts`
 */
import assert from "node:assert/strict";
import { ProspectSource } from "@prisma/client";
import {
  baseDomain,
  normalizeAndDeduplicate,
  type MapsPlaceResult,
} from "./prospect-normalize";

function run() {
  assert.equal(baseDomain("https://www.Example.COM/path"), "example.com");
  assert.equal(baseDomain(null), null);

  const maps: MapsPlaceResult[] = [
    {
      title: "Loja A",
      address: "Rua 1",
      website: "https://loja-a.com.br",
      rating: 4.5,
      reviewCount: 10,
      category: "Alfaiate",
      cid: "cid-a",
    },
    {
      title: "Loja B",
      address: "Rua 2",
      phone: "(41) 98888-7777",
      rating: 3,
      cid: "cid-b",
    },
  ];

  const { prospects, webCount, mapsCount } = normalizeAndDeduplicate([], maps);
  assert.equal(webCount, 0);
  assert.equal(mapsCount, 2);
  assert.equal(prospects.length, 2);
  assert.equal(prospects[0]?.source, ProspectSource.GOOGLE_MAPS);
  assert.equal(prospects[0]?.snippet, "Alfaiate");
  assert.ok(prospects[0]?.googleMapsUrl?.includes("cid-a"));

  const merged = normalizeAndDeduplicate(
    [
      {
        title: "Loja A Web",
        link: "https://loja-a.com.br/contato",
        snippet: "site",
        position: 1,
      },
    ],
    maps.slice(0, 1),
  );
  assert.equal(merged.prospects.length, 1);
  assert.equal(merged.prospects[0]?.foundInBothSources, true);
  assert.equal(merged.prospects[0]?.phone, null);

  console.log("prospect-normalize.selftest: ok");
}

run();
