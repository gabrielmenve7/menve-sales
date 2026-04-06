import {
  Body,
  Controller,
  Get,
  Headers,
  Patch,
  Post,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { AuthService } from "./auth.service";
import { Public } from "../common/public.decorator";
import { ReqUser } from "../common/req-user.decorator";
import type { RequestUser } from "../common/request-user";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly jwt: JwtService,
  ) {}

  @Public()
  @Post("login")
  async login(@Body() body: { email?: string; password?: string }) {
    const email = body.email?.trim();
    const password = body.password;
    if (!email || !password) {
      return { error: "missing_credentials" };
    }
    return this.auth.login(email, password);
  }

  /** Server-side profile refresh (Next session) — x-api-key + x-user-id only. */
  @Public()
  @Get("profile")
  profile(
    @Headers("x-api-key") apiKey: string | undefined,
    @Headers("x-user-id") userId: string | undefined,
  ) {
    const expected = process.env.INTERNAL_API_KEY?.trim();
    if (!expected || apiKey !== expected || !userId) {
      throw new UnauthorizedException();
    }
    return this.auth.getMe(userId);
  }

  /** JWT only (NextAuth refresh); no x-tenant-id required. */
  @Public()
  @Get("me")
  async me(@Headers("authorization") authorization?: string) {
    if (!authorization?.startsWith("Bearer ")) {
      throw new UnauthorizedException();
    }
    const token = authorization.slice(7);
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string }>(token);
      return this.auth.getMe(payload.sub);
    } catch {
      throw new UnauthorizedException();
    }
  }

  /** Nome e foto do usuário logado (app interno: x-api-key + x-user-id + x-tenant-id). */
  @Patch("profile")
  patchProfile(
    @ReqUser() u: RequestUser,
    @Body() body: { name?: string; image?: string | null },
  ) {
    return this.auth.updateProfile(u.userId, body);
  }
}
