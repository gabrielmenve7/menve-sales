"use server";

import { apiServer } from "@/lib/api-server";
import type { WidgetDataResult, WidgetQuerySpec } from "@/lib/dashboard-builder-types";

export async function queryDashboardWidget(spec: WidgetQuerySpec): Promise<WidgetDataResult> {
  return apiServer<WidgetDataResult>("/dashboard/widgets/query", {
    method: "POST",
    json: { spec },
  });
}

export async function queryDashboardWidgetsBulk(
  specs: WidgetQuerySpec[],
): Promise<WidgetDataResult[]> {
  if (specs.length === 0) return [];
  return apiServer<WidgetDataResult[]>("/dashboard/widgets/query-bulk", {
    method: "POST",
    json: { specs },
  });
}
