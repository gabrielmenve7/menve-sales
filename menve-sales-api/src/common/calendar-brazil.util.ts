/**
 * Datas “de negócio” no fuso de Brasília (sem depender do TZ do servidor).
 * Usado em automações de pipeline e eixos do dashboard.
 */
export const BRAZIL_TIMEZONE = "America/Sao_Paulo";

/** YYYY-MM-DD do calendário em `timeZone` (ex.: hoje em Brasília). */
export function ymdInTimeZone(date: Date, timeZone: string): string {
  return date.toLocaleDateString("en-CA", { timeZone });
}

export function todayYmdBrazil(): string {
  return ymdInTimeZone(new Date(), BRAZIL_TIMEZONE);
}

/**
 * Soma dias a uma data civil YYYY-MM-DD (sem horário; aritmética em UTC evita DST).
 */
export function addCalendarDaysIso(ymd: string, deltaDays: number): string {
  const [ys, ms, ds] = ymd.split("-");
  const y = Number(ys);
  const m = Number(ms);
  const d = Number(ds);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    return ymd;
  }
  const t = Date.UTC(y, m - 1, d + deltaDays);
  return new Date(t).toISOString().slice(0, 10);
}

/** Último dia do mês de `isoYmd` (YYYY-MM-DD). */
export function endOfMonthYmd(isoYmd: string): string {
  const y = Number(isoYmd.slice(0, 4));
  const mo = Number(isoYmd.slice(5, 7));
  if (!Number.isFinite(y) || !Number.isFinite(mo) || mo < 1 || mo > 12) {
    return isoYmd;
  }
  return new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10);
}

export function minYmd(a: string, b: string): string {
  return a <= b ? a : b;
}

/** Lista inclusiva de YYYY-MM-DD de `from` até `to` (lexicográfico = cronológico para ISO). */
export function enumerateYmdInclusive(
  from: string,
  to: string,
  maxDays = 500,
): string[] {
  const out: string[] = [];
  let cur = from;
  while (cur <= to) {
    out.push(cur);
    cur = addCalendarDaysIso(cur, 1);
    if (out.length > maxDays) break;
  }
  return out;
}

/** Conta dias inclusivos entre `from` e `to` (ISO); retorna `maxExclusive` se exceder o limite. */
export function countYmdRangeDaysInclusive(
  from: string,
  to: string,
  maxExclusive = 501,
): number {
  let n = 0;
  let cur = from;
  while (cur <= to) {
    n++;
    if (n >= maxExclusive) return maxExclusive;
    cur = addCalendarDaysIso(cur, 1);
  }
  return n;
}

const pad2 = (n: number) => String(n).padStart(2, "0");

export function parseYmd(ymd: string): { y: number; m: number; d: number } {
  const [ys, ms, ds] = ymd.split("-");
  return {
    y: Number(ys),
    m: Number(ms),
    d: Number(ds),
  };
}

/**
 * Domingo=0 … Sábado=6 para a data civil Y-M-D alinhada a Brasília (UTC−3, sem DST).
 * Usa 15:00 UTC (= meio-dia em BRT) para não depender do TZ do processo Node.
 */
export function weekdaySun0BrazilYmd(ymd: string): number {
  const { y, m, d } = parseYmd(ymd);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return 0;
  return new Date(Date.UTC(y, m - 1, d, 15, 0, 0)).getUTCDay();
}

/** Segunda da semana que contém `ymd` (Brasil), como YYYY-MM-DD. */
export function mondayOfWeekBrazilYmd(ymd: string): string {
  const dow = weekdaySun0BrazilYmd(ymd);
  const offset = dow === 0 ? 6 : dow - 1;
  return addCalendarDaysIso(ymd, -offset);
}

/** Primeiro dia do mês de `ymd` (YYYY-MM-01). */
export function firstOfMonthYmd(ymd: string): string {
  const { y, m } = parseYmd(ymd);
  return `${y}-${pad2(m)}-01`;
}

/** Último dia do mês anterior ao de `ymd`. */
export function lastDayOfPreviousMonthYmd(ymd: string): string {
  const first = firstOfMonthYmd(ymd);
  return addCalendarDaysIso(first, -1);
}

/** Primeiro dia do mês anterior ao de `ymd`. */
export function firstOfPreviousMonthYmd(ymd: string): string {
  const lastPrev = lastDayOfPreviousMonthYmd(ymd);
  return firstOfMonthYmd(lastPrev);
}
