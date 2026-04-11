import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import { UserRole, WorkspaceRole, type User } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { assertValidProfileImage } from "../common/profile-image.util";
import { WorkspaceAccessService } from "../workspaces/workspace-access.service";
import { useWorkspaceMembership } from "../common/use-workspace-membership";
import { workspaceRoleToUserRole } from "../common/workspace-role.util";
import { WorkspacesService } from "../workspaces/workspaces.service";

const MAX_NAME_LEN = 120;

type LoginResponseUser = {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  role: UserRole;
  tenantId: string | null;
  globalRole: UserRole;
  workspaceRole: WorkspaceRole | null;
};

type MembershipJwtPayload = {
  sub: string;
  globalRole: UserRole;
  tenantId: string | null;
  workspaceRole: WorkspaceRole | null;
};

type LegacyJwtPayload = {
  sub: string;
  role: UserRole;
  tenantId: string | null;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly workspaceAccess: WorkspaceAccessService,
    private readonly workspaces: WorkspacesService,
  ) {}

  async validateCredentials(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user?.passwordHash) return null;
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return null;
    return user;
  }

  private async signAccessToken(user: User, activeTenantId: string | null) {
    const flag = useWorkspaceMembership();
    if (!flag) {
      const payload: LegacyJwtPayload = {
        sub: user.id,
        role: user.role,
        tenantId: user.tenantId,
      };
      return this.jwt.signAsync(payload);
    }

    if (user.role === UserRole.SUPER_ADMIN) {
      const payload: MembershipJwtPayload = {
        sub: user.id,
        globalRole: UserRole.SUPER_ADMIN,
        tenantId: user.tenantId ?? user.lastActiveTenantId,
        workspaceRole: null,
      };
      return this.jwt.signAsync(payload);
    }

    let tenantId = activeTenantId;
    let workspaceRole: WorkspaceRole | null = null;

    if (tenantId) {
      const m = await this.workspaceAccess.getMembership(user.id, tenantId);
      if (m) workspaceRole = m.role;
      else tenantId = null;
    }

    if (!tenantId) {
      const memberships = await this.workspaceAccess.listForUser(user.id);
      if (memberships.length > 0) {
        const preferred =
          memberships.find((x) => x.tenantId === user.lastActiveTenantId) ??
          memberships[0];
        tenantId = preferred.tenantId;
        workspaceRole = preferred.role;
      }
    }

    const payload: MembershipJwtPayload = {
      sub: user.id,
      globalRole: user.role,
      tenantId,
      workspaceRole,
    };
    return this.jwt.signAsync(payload);
  }

  private async toLoginResponse(user: User, activeTenantId?: string | null) {
    const flag = useWorkspaceMembership();
    let resolvedTenant = activeTenantId ?? null;
    let workspaceRole: WorkspaceRole | null = null;

    if (flag && user.role !== UserRole.SUPER_ADMIN) {
      const memberships = await this.workspaceAccess.listForUser(user.id);
      if (resolvedTenant) {
        const m = memberships.find((x) => x.tenantId === resolvedTenant);
        if (m) workspaceRole = m.role;
        else resolvedTenant = null;
      }
      if (!resolvedTenant && memberships.length > 0) {
        const preferred =
          memberships.find((x) => x.tenantId === user.lastActiveTenantId) ??
          memberships[0];
        resolvedTenant = preferred.tenantId;
        workspaceRole = preferred.role;
      }
    } else if (!flag) {
      resolvedTenant = user.tenantId;
    } else {
      resolvedTenant = user.tenantId ?? user.lastActiveTenantId;
    }

    const accessToken = await this.signAccessToken(user, resolvedTenant);

    let workspaces: Array<{
      id: string;
      name: string;
      slug: string;
      plan: string;
      image: string | null;
      role: UserRole;
    }> = [];
    if (flag) {
      const rows = await this.workspaceAccess.listForUser(user.id);
      workspaces = rows.map((m) => ({
        id: m.tenant.id,
        name: m.tenant.name,
        slug: m.tenant.slug,
        plan: m.tenant.plan,
        image: m.tenant.image,
        role: workspaceRoleToUserRole(m.role),
      }));
    } else if (user.tenantId) {
      const t = await this.prisma.tenant.findUnique({
        where: { id: user.tenantId },
      });
      if (t) {
        workspaces = [
          {
            id: t.id,
            name: t.name,
            slug: t.slug,
            plan: t.plan,
            image: t.image,
            role: user.role,
          },
        ];
      }
    }

    const effectiveRole =
      flag && workspaceRole
        ? workspaceRoleToUserRole(workspaceRole)
        : user.role;

    const userOut: LoginResponseUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.image,
      role: effectiveRole,
      tenantId: resolvedTenant,
      globalRole: user.role,
      workspaceRole,
    };

    return {
      accessToken,
      user: userOut,
      needsOnboarding:
        flag &&
        user.role !== UserRole.SUPER_ADMIN &&
        (await this.workspaceAccess.listForUser(user.id)).length === 0,
      workspaces,
    };
  }

  async login(email: string, password: string) {
    const user = await this.validateCredentials(email, password);
    if (!user) throw new UnauthorizedException("Credenciais inválidas");
    return this.toLoginResponse(user);
  }

  async register(body: {
    email?: string;
    password?: string;
    name?: string;
  }) {
    const email = body.email?.trim().toLowerCase();
    const password = body.password;
    const name = body.name?.trim();
    if (!email || !email.includes("@")) {
      throw new BadRequestException("E-mail inválido");
    }
    if (!password || password.length < 6) {
      throw new BadRequestException("Senha deve ter pelo menos 6 caracteres");
    }
    const exists = await this.prisma.user.findUnique({ where: { email } });
    if (exists) {
      throw new ConflictException("E-mail já cadastrado");
    }
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        name: name && name.length > 0 ? name.slice(0, MAX_NAME_LEN) : null,
        role: UserRole.SELLER,
        tenantId: null,
      },
    });
    return this.toLoginResponse(user);
  }

  async setActiveWorkspaceFromBearer(
    authorization: string | undefined,
    tenantId: string | undefined,
  ) {
    if (!authorization?.startsWith("Bearer ")) {
      throw new UnauthorizedException();
    }
    const token = authorization.slice(7);
    let userId: string;
    try {
      const p = await this.jwt.verifyAsync<MembershipJwtPayload | LegacyJwtPayload>(
        token,
      );
      userId = p.sub;
    } catch {
      throw new UnauthorizedException("Invalid token");
    }
    const tid = tenantId?.trim();
    if (!tid) throw new BadRequestException("tenantId obrigatório");
    await this.workspaces.patchActiveWorkspace(userId, tid);
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    return this.toLoginResponse(user, tid);
  }

  async getMe(userId: string, activeTenantIdHint?: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        image: true,
        role: true,
        tenantId: true,
        lastActiveTenantId: true,
      },
    });
    if (!user) throw new UnauthorizedException();

    const flag = useWorkspaceMembership();
    const workspaces = flag
      ? (await this.workspaceAccess.listForUser(userId)).map((m) => ({
          id: m.tenant.id,
          name: m.tenant.name,
          slug: m.tenant.slug,
          plan: m.tenant.plan,
          image: m.tenant.image,
          role: workspaceRoleToUserRole(m.role),
        }))
      : [];

    let tenantId: string | null = user.tenantId;
    let workspaceRole: WorkspaceRole | null = null;
    let displayRole = user.role;

    if (flag && user.role !== UserRole.SUPER_ADMIN) {
      const memberships = await this.workspaceAccess.listForUser(userId);
      const hint = activeTenantIdHint?.trim();
      const preferred =
        (hint ? memberships.find((x) => x.tenantId === hint) : undefined) ??
        memberships.find((x) => x.tenantId === user.lastActiveTenantId) ??
        memberships[0];
      if (preferred) {
        tenantId = preferred.tenantId;
        workspaceRole = preferred.role;
        displayRole = workspaceRoleToUserRole(preferred.role);
      } else {
        tenantId = null;
      }
    }

    return {
      ...user,
      role: displayRole,
      tenantId,
      globalRole: user.role,
      workspaceRole,
      workspaces,
      needsOnboarding:
        flag &&
        user.role !== UserRole.SUPER_ADMIN &&
        (await this.workspaceAccess.listForUser(userId)).length === 0,
    };
  }

  async updateProfile(
    userId: string,
    body: { name?: string; image?: string | null },
  ) {
    const data: { name?: string; image?: string | null } = {};

    if (body.name !== undefined) {
      const n = body.name.trim();
      if (!n) {
        throw new BadRequestException("Nome não pode ser vazio");
      }
      if (n.length > MAX_NAME_LEN) {
        throw new BadRequestException("Nome muito longo");
      }
      data.name = n;
    }

    if (body.image !== undefined) {
      if (body.image === null || body.image === "") {
        data.image = null;
      } else {
        data.image = assertValidProfileImage(body.image);
      }
    }

    if (Object.keys(data).length === 0) {
      return this.getMe(userId);
    }

    await this.prisma.user.update({
      where: { id: userId },
      data,
    });
    return this.getMe(userId);
  }
}
