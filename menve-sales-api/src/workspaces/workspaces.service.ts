import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import { UserRole, WorkspaceRole } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { ensureDefaultWorkspace } from "../prisma/workspace-bootstrap";
import { WorkspaceAccessService } from "./workspace-access.service";
import { useWorkspaceMembership } from "../common/use-workspace-membership";
import { assertCanManageWorkspaceFeatures } from "../common/rbac";
import type { RequestUser } from "../common/request-user";
import { workspaceRoleToUserRole } from "../common/workspace-role.util";

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function hashInviteToken(raw: string) {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

function slugify(input: string) {
  return input
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

async function sendInviteEmail(to: string, inviteUrl: string) {
  const key = process.env.RESEND_API_KEY?.trim();
  const from =
    process.env.RESEND_FROM?.trim() ?? "Menve Sales <onboarding@resend.dev>";
  if (!key) {
    console.warn("[workspaces/invite] RESEND_API_KEY ausente — link:", inviteUrl);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: "Convite — Menve Sales",
      html: `<p>Você foi convidado para um workspace no Menve Sales.</p><p><a href="${inviteUrl}">Entrar ou criar conta</a></p>`,
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    console.error("[workspaces/invite] Resend error:", res.status, t);
  }
}

@Injectable()
export class WorkspacesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceAccess: WorkspaceAccessService,
  ) {}

  async listWorkspaces(userId: string) {
    if (!useWorkspaceMembership()) {
      const u = await this.prisma.user.findUnique({
        where: { id: userId },
        include: { tenant: true },
      });
      if (!u?.tenant) return [];
      return [
        {
          id: u.tenant.id,
          name: u.tenant.name,
          slug: u.tenant.slug,
          plan: u.tenant.plan,
          image: u.tenant.image,
          role: u.role,
        },
      ];
    }
    const rows = await this.workspaceAccess.listForUser(userId);
    return rows.map((m) => ({
      id: m.tenant.id,
      name: m.tenant.name,
      slug: m.tenant.slug,
      plan: m.tenant.plan,
      image: m.tenant.image,
      role: workspaceRoleToUserRole(m.role),
    }));
  }

  async createWorkspace(
    userId: string,
    body: { name: string; slug?: string },
  ) {
    const name = body.name?.trim();
    if (!name) throw new BadRequestException("Nome é obrigatório");
    let slug = body.slug?.trim() ? slugify(body.slug) : slugify(name);
    if (!slug) slug = `ws-${randomBytes(4).toString("hex")}`;

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException();

    const result = await this.prisma.$transaction(async (tx) => {
      let attempt = 0;
      let finalSlug = slug;
      while (attempt < 8) {
        const exists = await tx.tenant.findUnique({
          where: { slug: finalSlug },
        });
        if (!exists) break;
        attempt += 1;
        finalSlug = `${slug}-${randomBytes(2).toString("hex")}`;
      }
      const tenant = await tx.tenant.create({
        data: { name, slug: finalSlug, plan: "free" },
      });

      if (useWorkspaceMembership()) {
        await tx.workspaceMembership.create({
          data: {
            userId,
            tenantId: tenant.id,
            role: WorkspaceRole.OWNER,
          },
        });
        await tx.user.update({
          where: { id: userId },
          data: {
            lastActiveTenantId: tenant.id,
            tenantId: user.tenantId ?? tenant.id,
          },
        });
      } else {
        await tx.user.update({
          where: { id: userId },
          data: { tenantId: tenant.id, role: UserRole.OWNER },
        });
      }
      return tenant;
    });

    await ensureDefaultWorkspace(this.prisma, result.id);
    return result;
  }

  async patchActiveWorkspace(userId: string, tenantId: string) {
    if (!useWorkspaceMembership()) {
      const u = await this.prisma.user.findUnique({ where: { id: userId } });
      if (!u) throw new NotFoundException();
      if (u.tenantId !== tenantId) {
        throw new ForbiddenException("Workspace inválido");
      }
      return { tenantId };
    }
    await this.workspaceAccess.assertMember(userId, tenantId);
    await this.prisma.user.update({
      where: { id: userId },
      data: { lastActiveTenantId: tenantId },
    });
    return { tenantId };
  }

  async invitePreview(rawToken: string) {
    if (!rawToken?.trim()) {
      return { valid: false as const, reason: "missing_token" };
    }
    const tokenHash = hashInviteToken(rawToken.trim());
    const inv = await this.prisma.workspaceInvite.findFirst({
      where: { tokenHash, revokedAt: null, acceptedAt: null },
      include: { tenant: { select: { name: true } } },
    });
    if (!inv) {
      return { valid: false as const, reason: "not_found" };
    }
    if (inv.expiresAt.getTime() < Date.now()) {
      return { valid: false as const, reason: "expired" };
    }
    return {
      valid: true as const,
      workspaceName: inv.tenant.name,
      email: inv.emailNormalized,
      expiresAt: inv.expiresAt.toISOString(),
    };
  }

  async createInvite(
    u: RequestUser,
    tenantId: string,
    body: { email: string; role?: WorkspaceRole },
  ) {
    assertCanManageWorkspaceFeatures(u.role);
    if (useWorkspaceMembership()) {
      await this.workspaceAccess.assertMember(u.userId, tenantId);
    } else if (u.userTenantId !== tenantId) {
      throw new ForbiddenException("Workspace inválido");
    }
    const inviterMembership = await this.workspaceAccess.getMembership(
      u.userId,
      tenantId,
    );
    if (!inviterMembership) throw new ForbiddenException();

    const email = normalizeEmail(body.email);
    if (!email.includes("@")) {
      throw new BadRequestException("E-mail inválido");
    }
    const role = body.role ?? WorkspaceRole.SELLER;

    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });
    if (existingUser) {
      const already = await this.workspaceAccess.getMembership(
        existingUser.id,
        tenantId,
      );
      if (already) {
        throw new ConflictException("Usuário já é membro deste workspace");
      }
    }

    const rawToken = randomBytes(32).toString("base64url");
    const tokenHash = hashInviteToken(rawToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await this.prisma.workspaceInvite.create({
      data: {
        tenantId,
        emailNormalized: email,
        role,
        tokenHash,
        expiresAt,
        invitedByUserId: u.userId,
      },
    });

    const base =
      process.env.PUBLIC_WEB_URL?.replace(/\/$/, "") ??
      process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ??
      "http://localhost:3000";
    const inviteUrl = `${base}/login?invite=${encodeURIComponent(rawToken)}`;
    await sendInviteEmail(email, inviteUrl);

    return { ok: true as const, inviteUrl };
  }

  async acceptInvite(userId: string, rawToken: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    const tokenHash = hashInviteToken(rawToken.trim());
    const inv = await this.prisma.workspaceInvite.findFirst({
      where: { tokenHash, revokedAt: null, acceptedAt: null },
    });
    if (!inv) throw new BadRequestException("Convite inválido");
    if (inv.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException("Convite expirado");
    }
    const email = normalizeEmail(user.email);
    if (email !== inv.emailNormalized) {
      throw new ForbiddenException(
        "Entre com o e-mail para o qual o convite foi enviado",
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.workspaceMembership.upsert({
        where: {
          userId_tenantId: { userId, tenantId: inv.tenantId },
        },
        create: {
          userId,
          tenantId: inv.tenantId,
          role: inv.role,
        },
        update: { role: inv.role },
      });
      await tx.workspaceInvite.update({
        where: { id: inv.id },
        data: { acceptedAt: new Date() },
      });
      await tx.user.update({
        where: { id: userId },
        data: {
          lastActiveTenantId: inv.tenantId,
          tenantId: user.tenantId ?? inv.tenantId,
        },
      });
    });

    return { tenantId: inv.tenantId };
  }
}
