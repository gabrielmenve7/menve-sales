import { BadRequestException } from "@nestjs/common";
import { z } from "zod";
import type { PrismaService } from "../prisma/prisma.service";

const TEXT_MAX = 2048;

function parseMoneyBrl(raw: unknown): number {
  if (typeof raw === "number") {
    if (!Number.isFinite(raw) || raw < 0) {
      throw new BadRequestException("Valor em reais inválido");
    }
    return Math.round(raw * 100) / 100;
  }
  const s0 = String(raw)
    .trim()
    .replace(/R\$\s?/gi, "")
    .replace(/\s/g, "");
  if (!s0) throw new BadRequestException("Valor em reais inválido");
  let normalized = s0;
  if (/,/.test(s0) && /\d,\d{1,2}$/.test(s0)) {
    normalized = s0.replace(/\./g, "").replace(",", ".");
  } else {
    normalized = s0.replace(/,/g, "");
  }
  const n = Number(normalized);
  if (!Number.isFinite(n) || n < 0) {
    throw new BadRequestException("Valor em reais inválido");
  }
  return Math.round(n * 100) / 100;
}

function coerceUrl(raw: unknown): string {
  let u: URL;
  try {
    u = new URL(String(raw).trim());
  } catch {
    throw new BadRequestException("URL inválida");
  }
  if (!/^https?:$/i.test(u.protocol)) {
    throw new BadRequestException("URL deve usar http ou https");
  }
  return u.toString();
}

function coercePhone(raw: unknown): string {
  const s = String(raw).trim();
  if (s.length < 8 || s.length > 32) {
    throw new BadRequestException("Telefone inválido");
  }
  return s;
}

function coerceEmail(raw: unknown): string {
  const s = String(raw).trim();
  const r = z.string().email().safeParse(s);
  if (!r.success) throw new BadRequestException("E-mail inválido");
  return r.data.toLowerCase();
}

/**
 * Converte entrada do cliente JSON para valor persistível em `customData`.
 * `raw` já vem sem null/"" (tratado pelo caller).
 */
export async function coerceCustomFieldValue(
  prisma: Pick<PrismaService, "user">,
  tenantId: string,
  fieldType: string,
  raw: unknown,
  options: unknown,
): Promise<unknown> {
  switch (fieldType) {
    case "TEXT": {
      const s = String(raw).trim();
      if (s.length > TEXT_MAX) {
        throw new BadRequestException("Texto muito longo");
      }
      return s;
    }
    case "NUMBER": {
      const n =
        typeof raw === "number" ? raw : Number(typeof raw === "string" ? raw.trim() : raw);
      if (!Number.isFinite(n)) {
        throw new BadRequestException("Valor numérico inválido");
      }
      return n;
    }
    case "DATE": {
      const s = String(raw).trim();
      const d = new Date(s);
      if (Number.isNaN(d.getTime())) {
        throw new BadRequestException("Data inválida");
      }
      return s;
    }
    case "SELECT": {
      const opts = Array.isArray(options) ? options.map(String) : [];
      const v = String(raw).trim();
      if (!opts.includes(v)) throw new BadRequestException("Opção inválida");
      return v;
    }
    case "MONEY_BRL":
      return parseMoneyBrl(raw);
    case "URL":
      return coerceUrl(raw);
    case "PHONE":
      return coercePhone(raw);
    case "EMAIL":
      return coerceEmail(raw);
    case "USER": {
      const id = String(raw).trim();
      const u = await prisma.user.findFirst({
        where: { id, tenantId },
        select: { id: true },
      });
      if (!u) throw new BadRequestException("Usuário inválido");
      return id;
    }
    default:
      throw new BadRequestException("Tipo de campo não suportado");
  }
}
