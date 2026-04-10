import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import { PrismaService } from "../prisma/prisma.service";
import { IS_PUBLIC_KEY } from "./public.decorator";
import { OPTIONAL_ACTIVE_TENANT_KEY } from "./optional-active-tenant.decorator";
import type { RequestUser } from "./request-user";
import { UserRole, WorkspaceRole } from "@prisma/client";
import { useWorkspaceMembership } from "./use-workspace-membership";
import { WorkspaceAccessService } from "../workspaces/workspace-access.service";
import { workspaceRoleToUserRole } from "./workspace-role.util";

type LegacyJwt = {
  sub: string;
  role: UserRole;
  tenantId: string | null;
};

type MembershipJwt = {
  sub: string;
  globalRole: UserRole;
  tenantId: string | null;
  workspaceRole: WorkspaceRole | null;
};

function isMembershipJwt(p: unknown): p is MembershipJwt {
  return (
    typeof p === "object" &&
    p !== null &&
    "globalRole" in p &&
    typeof (p as MembershipJwt).globalRole === "string"
  );
}

@Injectable()
export class AppAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly workspaceAccess: WorkspaceAccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest();
    const internalKey = process.env.INTERNAL_API_KEY?.trim();
    const apiKey = req.headers["x-api-key"] as string | undefined;
    const membershipFlag = useWorkspaceMembership();
    const optionalActiveTenant = this.reflector.getAllAndOverride<boolean>(
      OPTIONAL_ACTIVE_TENANT_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (internalKey && apiKey === internalKey) {
      const userId = req.headers["x-user-id"] as string | undefined;
      const tenantId = req.headers["x-tenant-id"] as string | undefined;
      if (!userId) {
        throw new UnauthorizedException("Missing x-user-id");
      }
      if (!tenantId && !(optionalActiveTenant && membershipFlag)) {
        throw new UnauthorizedException("Missing x-tenant-id");
      }
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, role: true, tenantId: true },
      });
      if (!user) throw new UnauthorizedException("Invalid user");

      if (user.role === UserRole.SUPER_ADMIN) {
        req.user = {
          userId: user.id,
          globalRole: user.role,
          role: UserRole.SUPER_ADMIN,
          userTenantId: user.tenantId,
          tenantId: tenantId ?? "__bootstrap__",
        } satisfies RequestUser;
        return true;
      }

      if (!tenantId && optionalActiveTenant && membershipFlag) {
        req.user = {
          userId: user.id,
          globalRole: user.role,
          role: user.role,
          userTenantId: user.tenantId,
          tenantId: "__bootstrap__",
        } satisfies RequestUser;
        return true;
      }

      if (membershipFlag) {
        const m = await this.workspaceAccess.getMembership(userId, tenantId!);
        if (!m) {
          throw new ForbiddenException("Tenant mismatch");
        }
        req.user = {
          userId: user.id,
          globalRole: user.role,
          role: workspaceRoleToUserRole(m.role),
          userTenantId: user.tenantId,
          tenantId: tenantId!,
        } satisfies RequestUser;
        return true;
      }

      if (!user.tenantId || user.tenantId !== tenantId) {
        throw new ForbiddenException("Tenant mismatch");
      }
      req.user = {
        userId: user.id,
        globalRole: user.role,
        role: user.role,
        userTenantId: user.tenantId,
        tenantId,
      } satisfies RequestUser;
      return true;
    }

    const auth = req.headers.authorization as string | undefined;
    if (auth?.startsWith("Bearer ")) {
      const token = auth.slice(7);
      try {
        const raw = await this.jwt.verifyAsync<LegacyJwt | MembershipJwt>(token);

        if (isMembershipJwt(raw)) {
          const payload = raw;
          const tenantHeader = req.headers["x-tenant-id"] as string | undefined;
          const effectiveTenant =
            payload.globalRole === UserRole.SUPER_ADMIN
              ? tenantHeader
              : payload.tenantId;
          if (
            !effectiveTenant &&
            optionalActiveTenant &&
            payload.globalRole !== UserRole.SUPER_ADMIN
          ) {
            req.user = {
              userId: payload.sub,
              globalRole: payload.globalRole,
              role: payload.workspaceRole
                ? workspaceRoleToUserRole(payload.workspaceRole)
                : UserRole.SELLER,
              userTenantId: payload.tenantId,
              tenantId: "__bootstrap__",
            } satisfies RequestUser;
            return true;
          }
          if (!effectiveTenant) {
            throw new UnauthorizedException("Missing tenant context");
          }
          if (payload.globalRole !== UserRole.SUPER_ADMIN) {
            if (payload.tenantId !== effectiveTenant) {
              throw new ForbiddenException("Tenant mismatch");
            }
            if (membershipFlag) {
              await this.workspaceAccess.assertMember(
                payload.sub,
                effectiveTenant,
              );
            }
          }
          const effectiveRole =
            payload.globalRole === UserRole.SUPER_ADMIN
              ? UserRole.SUPER_ADMIN
              : payload.workspaceRole
                ? workspaceRoleToUserRole(payload.workspaceRole)
                : UserRole.SELLER;
          req.user = {
            userId: payload.sub,
            globalRole: payload.globalRole,
            role: effectiveRole,
            userTenantId: payload.tenantId,
            tenantId: effectiveTenant,
          } satisfies RequestUser;
          return true;
        }

        const payload = raw as LegacyJwt;
        const tenantHeader = req.headers["x-tenant-id"] as string | undefined;
        const effectiveTenant =
          payload.role === UserRole.SUPER_ADMIN
            ? tenantHeader
            : payload.tenantId;
        if (
          !effectiveTenant &&
          optionalActiveTenant &&
          payload.role !== UserRole.SUPER_ADMIN
        ) {
          req.user = {
            userId: payload.sub,
            globalRole: payload.role,
            role: payload.role,
            userTenantId: payload.tenantId,
            tenantId: "__bootstrap__",
          } satisfies RequestUser;
          return true;
        }
        if (!effectiveTenant) {
          throw new UnauthorizedException("Missing tenant context");
        }
        if (payload.role !== UserRole.SUPER_ADMIN) {
          if (payload.tenantId !== effectiveTenant) {
            throw new ForbiddenException("Tenant mismatch");
          }
          if (membershipFlag) {
            await this.workspaceAccess.assertMember(
              payload.sub,
              effectiveTenant,
            );
            const m = await this.workspaceAccess.getMembership(
              payload.sub,
              effectiveTenant,
            );
            req.user = {
              userId: payload.sub,
              globalRole: payload.role,
              role: m ? workspaceRoleToUserRole(m.role) : payload.role,
              userTenantId: payload.tenantId,
              tenantId: effectiveTenant,
            } satisfies RequestUser;
            return true;
          }
        }
        req.user = {
          userId: payload.sub,
          globalRole: payload.role,
          role: payload.role,
          userTenantId: payload.tenantId,
          tenantId: effectiveTenant,
        } satisfies RequestUser;
        return true;
      } catch (e) {
        if (e instanceof ForbiddenException || e instanceof UnauthorizedException)
          throw e;
        throw new UnauthorizedException("Invalid token");
      }
    }

    throw new UnauthorizedException();
  }
}
