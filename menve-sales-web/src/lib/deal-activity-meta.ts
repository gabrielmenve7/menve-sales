/** Igual ao prefixo em `menve-sales-api/src/deals/deals.service.ts`. */
export const MENVE_ACTIVITY_META_PREFIX = "__MENVE_META__:";

export type MenveActivityMeta =
  | {
      k: "stage_change";
      from: { name: string; color: string | null };
      to: { name: string; color: string | null };
    }
  | {
      k: "assignee";
      action: "set" | "remove";
      from?: { name: string } | null;
      to?: { name: string; id: string };
    }
  | { k: "deal_outcome"; outcome: "WON" | "LOST"; reason?: string }
  | { k: "deal_created"; title: string }
  | { k: "deal_custom"; fields: string[] };

export function parseMenveActivityMeta(
  description: string | null,
): MenveActivityMeta | null {
  if (!description?.startsWith(MENVE_ACTIVITY_META_PREFIX)) return null;
  try {
    return JSON.parse(
      description.slice(MENVE_ACTIVITY_META_PREFIX.length),
    ) as MenveActivityMeta;
  } catch {
    return null;
  }
}
