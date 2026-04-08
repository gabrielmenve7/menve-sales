/**
 * Datas de negócio em America/Sao_Paulo — espelha `menve-sales-api/src/common/calendar-brazil.util.ts`.
 */

export const BRAZIL_TIMEZONE = "America/Sao_Paulo";

export function ymdInTimeZone(date: Date, timeZone: string): string {
  return date.toLocaleDateString("en-CA", { timeZone });
}

export function todayYmdBrazil(): string {
  return ymdInTimeZone(new Date(), BRAZIL_TIMEZONE);
}

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

export function endOfMonthYmd(isoYmd: string): string {
  const y = Number(isoYmd.slice(0, 4));
  const mo = Number(isoYmd.slice(5, 7));
  if (!Number.isFinite(y) || !Number.isFinite(mo) || mo < 1 || mo > 12) {
    return isoYmd;
  }
  return new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10);
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

export function weekdaySun0BrazilYmd(ymd: string): number {
  const { y, m, d } = parseYmd(ymd);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return 0;
  return new Date(Date.UTC(y, m - 1, d, 15, 0, 0)).getUTCDay();
}

export function mondayOfWeekBrazilYmd(ymd: string): string {
  const dow = weekdaySun0BrazilYmd(ymd);
  const offset = dow === 0 ? 6 : dow - 1;
  return addCalendarDaysIso(ymd, -offset);
}

export function firstOfMonthYmd(ymd: string): string {
  const { y, m } = parseYmd(ymd);
  return `${y}-${pad2(m)}-01`;
}

export function lastDayOfPreviousMonthYmd(ymd: string): string {
  const first = firstOfMonthYmd(ymd);
  return addCalendarDaysIso(first, -1);
}

export function firstOfPreviousMonthYmd(ymd: string): string {
  const lastPrev = lastDayOfPreviousMonthYmd(ymd);
  return firstOfMonthYmd(lastPrev);
}
