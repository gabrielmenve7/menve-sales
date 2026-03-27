import { NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { getTenantFromRequest } from "@/lib/tenant";
import { UserRole } from "@prisma/client";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const tenant = await getTenantFromRequest();
  if (!tenant) {
    return NextResponse.json({ error: "tenant" }, { status: 400 });
  }

  if (
    session.user.role !== UserRole.SUPER_ADMIN &&
    session.user.tenantId !== tenant.id
  ) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const conversations = await prisma.conversation.findMany({
    where: { tenantId: tenant.id },
    orderBy: { lastMessageAt: "desc" },
    include: {
      contact: true,
      whatsappConnection: true,
      messages: { orderBy: { createdAt: "asc" }, take: 50 },
      internalNotes: {
        orderBy: { createdAt: "desc" },
        take: 30,
        include: { user: { select: { name: true, email: true } } },
      },
    },
  });

  return NextResponse.json({ conversations });
}
