import { expect, test } from "@playwright/test";

test("GET /api/health returns ok when DB is up", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.ok()).toBeTruthy();
  const body = (await res.json()) as { ok?: boolean; db?: string };
  expect(body.ok).toBe(true);
  expect(body.db).toBe("up");
});
