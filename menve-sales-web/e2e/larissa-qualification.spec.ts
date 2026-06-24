/**
 * Roteiro E2E manual / Playwright (futuro):
 * 1. Ativar Larissa em /agentes e sincronizar skills
 * 2. Disparo para lead de teste (campanha)
 * 3. Simular resposta inbound (webhook Zappfy ou POST manual)
 * 4. Verificar thread no /inbox: Abordagem → Lead → Larissa
 * 5. Agendar Meet (Larissa tool ou ScheduleMeetDialog)
 * 6. Verificar handoff (composer liberado) e lead em /pipeline
 */
import { test, expect } from "@playwright/test";

test.describe("Larissa qualificação (smoke)", () => {
  test.skip(true, "Requer tenant com Zappfy + OPENAI_API_KEY + seed de campanha");

  test("página agentes carrega", async ({ page }) => {
    await page.goto("/agentes");
    await expect(page.getByRole("heading", { name: /Agentes IA/i })).toBeVisible();
    await expect(page.getByText(/Larissa/i)).toBeVisible();
  });
});
