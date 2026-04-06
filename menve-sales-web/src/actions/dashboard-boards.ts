"use server";

import { apiServer } from "@/lib/api-server";
import type { DashboardBoardDto, LayoutJson } from "@/lib/dashboard-builder-types";
import { revalidatePath } from "next/cache";

export async function listDashboardBoards(): Promise<DashboardBoardDto[]> {
  return apiServer<DashboardBoardDto[]>("/dashboard/boards");
}

export async function createDashboardBoard(name?: string): Promise<DashboardBoardDto> {
  const b = await apiServer<DashboardBoardDto>("/dashboard/boards", {
    method: "POST",
    json: name ? { name } : {},
  });
  revalidatePath("/dashboard");
  return b;
}

export async function updateDashboardBoard(
  id: string,
  patch: { name?: string; layoutJson?: LayoutJson },
): Promise<DashboardBoardDto> {
  const b = await apiServer<DashboardBoardDto>(`/dashboard/boards/${id}`, {
    method: "PATCH",
    json: patch,
  });
  revalidatePath("/dashboard");
  return b;
}

export async function deleteDashboardBoard(id: string): Promise<void> {
  await apiServer(`/dashboard/boards/${id}`, { method: "DELETE" });
  revalidatePath("/dashboard");
}

export async function duplicateDashboardBoard(id: string): Promise<DashboardBoardDto> {
  const b = await apiServer<DashboardBoardDto>(`/dashboard/boards/${id}/duplicate`, {
    method: "POST",
  });
  revalidatePath("/dashboard");
  return b;
}
