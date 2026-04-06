-- Pesquisa (prospecção): flag por workspace; default true preserva comportamento atual.
ALTER TABLE "Tenant" ADD COLUMN "researchEnabled" BOOLEAN NOT NULL DEFAULT true;
