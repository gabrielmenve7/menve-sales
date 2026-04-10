#!/usr/bin/env node
/**
 * Vercel roda `prisma migrate deploy` no build. Com Neon, o advisory lock costuma
 * dar P1002 via pooler; o schema usa `directUrl = env("DIRECT_URL")` com host sem "-pooler".
 */
const u = process.env.DIRECT_URL;
if (!u || !String(u).trim()) {
  console.error(
    "[vercel] DIRECT_URL is missing. Add it in Vercel → Environment Variables: Neon “Direct” / non-pooling URL (host without “-pooler”). Same database as DATABASE_URL.",
  );
  process.exit(1);
}
if (String(u).includes("-pooler")) {
  console.error(
    '[vercel] DIRECT_URL looks like the Neon pooler (contains "-pooler"). Use the Direct connection string for migrations.',
  );
  process.exit(1);
}
