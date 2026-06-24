/**
 * Execução: `npx tsx src/prospecting/serpapi-maps.selftest.ts`
 */
import assert from "node:assert/strict";
import {
  defaultMapsMaxPages,
  fetchSerpApiMapsPage,
  mapSerpApiLocalResult,
  searchMapsAllPages,
} from "./serpapi-maps";

const fixturePage1 = {
  search_metadata: { status: "Success" },
  local_results: Array.from({ length: 20 }, (_, i) => ({
    title: i === 0 ? "Alfaiataria Silva" : `Loja ${i}`,
    address: `Rua ${i}, Curitiba - PR`,
    phone: i === 0 ? "(41) 99999-0000" : undefined,
    website: i === 0 ? "https://silva.com.br" : undefined,
    rating: i === 0 ? 4.9 : 4,
    reviews: i === 0 ? 120 : 10,
    type: i === 0 ? "Alfaiate" : "Loja",
    data_cid: i === 0 ? "111" : String(1000 + i),
    gps_coordinates: { latitude: -25.4, longitude: -49.2 },
  })),
};

const fixturePage2 = {
  search_metadata: { status: "Success" },
  local_results: [
    {
      title: "Costura Premium",
      address: "Rua C, Curitiba - PR",
      data_cid: "222",
    },
  ],
};

async function run() {
  const mapped = mapSerpApiLocalResult(fixturePage1.local_results[0]!);
  assert.ok(mapped);
  assert.equal(mapped.title, "Alfaiataria Silva");
  assert.equal(mapped.reviewCount, 120);
  assert.equal(mapped.category, "Alfaiate");
  assert.equal(mapped.cid, "111");

  let call = 0;
  const mockFetch: typeof fetch = async (input) => {
    call++;
    const url = String(input);
    assert.ok(url.includes("engine=google_maps"));
    assert.ok(url.includes("type=search"));
    assert.ok(url.includes("gl=br"));
    if (url.includes("start=0")) {
      return new Response(JSON.stringify(fixturePage1), { status: 200 });
    }
    if (url.includes("start=20")) {
      return new Response(JSON.stringify(fixturePage2), { status: 200 });
    }
    return new Response(JSON.stringify({ local_results: [] }), { status: 200 });
  };

  const page = await fetchSerpApiMapsPage("alfaiataria em Curitiba - PR", "key", {
    start: 0,
    city: "Curitiba",
    state: "PR",
    fetchImpl: mockFetch,
  });
  assert.equal(page.length, 20);

  let capturedUrl = "";
  await fetchSerpApiMapsPage("q", "key", {
    start: 0,
    city: "Curitiba",
    state: "PR",
    fetchImpl: async (input) => {
      capturedUrl = String(input);
      return new Response(JSON.stringify({ local_results: [] }), {
        status: 200,
      });
    },
  });
  assert.ok(decodeURIComponent(capturedUrl).includes("Curitiba"));
  assert.ok(capturedUrl.includes("location="));

  call = 0;
  const all = await searchMapsAllPages(
    "alfaiataria em Curitiba - PR",
    { city: "Curitiba", state: "PR", maxPages: 2 },
    "key",
    mockFetch,
  );
  assert.equal(call, 2);
  assert.equal(all.length, 21);
  assert.equal(all[0]?.title, "Alfaiataria Silva");
  assert.equal(all[20]?.title, "Costura Premium");

  const prev = process.env.SERPAPI_MAPS_MAX_PAGES;
  process.env.SERPAPI_MAPS_MAX_PAGES = "99";
  assert.equal(defaultMapsMaxPages(), 6);
  process.env.SERPAPI_MAPS_MAX_PAGES = "0";
  assert.equal(defaultMapsMaxPages(), 3);
  if (prev === undefined) delete process.env.SERPAPI_MAPS_MAX_PAGES;
  else process.env.SERPAPI_MAPS_MAX_PAGES = prev;

  console.log("serpapi-maps.selftest: ok");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
