import {
  fetchLeadScoringRules,
  type LeadScoringRule,
} from "@/actions/lead-scoring";
import { assertCanConfigureTenant } from "@/lib/session";
import { LeadScoringClient } from "./lead-scoring-client";

const DEFAULT_RULES: LeadScoringRule[] = [
  {
    id: "has_whatsapp",
    field: "has_whatsapp",
    value: true,
    points: 15,
    enabled: true,
  },
  {
    id: "has_email",
    field: "has_email",
    value: true,
    points: 10,
    enabled: true,
  },
  {
    id: "has_website",
    field: "has_website",
    value: true,
    points: 5,
    enabled: true,
  },
  {
    id: "replied",
    field: "replied",
    value: true,
    points: 25,
    enabled: true,
  },
  {
    id: "rating_gte",
    field: "rating_gte",
    value: 4,
    points: 10,
    enabled: false,
  },
];

export default async function LeadScoringPage() {
  await assertCanConfigureTenant();

  const payload = await fetchLeadScoringRules().catch(() => null);
  const rules =
    payload?.rules && payload.rules.length > 0
      ? payload.rules
      : DEFAULT_RULES;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 pb-6 pt-3">
      <LeadScoringClient initialRules={rules} />
    </div>
  );
}
