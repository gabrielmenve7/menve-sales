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
import type { RequestUser } from "./request-user";
import { UserRole } from "@prisma/client";

@Injectable()
export class AppAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
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

    if (internalKey && apiKey === internalKey) {
      const userId = req.headers["x-user-id"] as string | undefined;
      const tenantId = req.headers["x-tenant-id"] as string | undefined;
      if (!userId || !tenantId) {
        throw new UnauthorizedException("Missing x-user-id or x-tenant-id");
      }
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, role: true, tenantId: true },
      });
      if (!user) throw new UnauthorizedException("Invalid user");
      if (user.role !== UserRole.SUPER_ADMIN) {
        if (!user.tenantId || user.tenantId !== tenantId) {
          throw new ForbiddenException("Tenant mismatch");
        }
      }
      req.user = {
        userId: user.id,
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
        const payload = await this.jwt.verifyAsync<{
          sub: string;
          role: UserRole;
          tenantId: string | null;
        }>(token);
        const tenantHeader = req.headers["x-tenant-id"] as string | undefined;
        const effectiveTenant =
          payload.role === UserRole.SUPER_ADMIN
            ? tenantHeader
            : payload.tenantId;
        if (!effectiveTenant) {
          throw new UnauthorizedException("Missing tenant context");
        }
        if (payload.role !== UserRole.SUPER_ADMIN) {
          if (payload.tenantId !== effectiveTenant) {
            throw new ForbiddenException("Tenant mismatch");
          }
        }
        req.user = {
          userId: payload.sub,
          role: payload.role,
          userTenantId: payload.tenantId,
          tenantId: effectiveTenant,
        } satisfies RequestUser;
        return true;
      } catch {
        throw new UnauthorizedException("Invalid token");
      }
    }

    throw new UnauthorizedException();
  }
}
