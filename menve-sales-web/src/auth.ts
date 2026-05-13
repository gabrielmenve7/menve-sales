import path from "node:path";
import { loadEnvConfig } from "@next/env";
import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { AUTH_CREDENTIAL_CODE } from "@/lib/auth-credential-codes";
import type { UserRole } from "@/types/domain";

class MenveInvalidCredentials extends CredentialsSignin {
  code = AUTH_CREDENTIAL_CODE.INVALID_CREDENTIALS;
}

class MenveAuthApiUnreachable extends CredentialsSignin {
  code = AUTH_CREDENTIAL_CODE.API_UNREACHABLE;
}

class MenveAuthServiceError extends CredentialsSignin {
  code = AUTH_CREDENTIAL_CODE.AUTH_SERVICE_ERROR;
}

class MenveAuthApiNotFound extends CredentialsSignin {
  code = AUTH_CREDENTIAL_CODE.AUTH_API_NOT_FOUND;
}

class MenveAuthApiServerError extends CredentialsSignin {
  code = AUTH_CREDENTIAL_CODE.AUTH_API_SERVER_ERROR;
}

class MenveAuthRateLimited extends CredentialsSignin {
  code = AUTH_CREDENTIAL_CODE.AUTH_RATE_LIMITED;
}

class MenveInvalidAuthResponse extends CredentialsSignin {
  code = AUTH_CREDENTIAL_CODE.INVALID_AUTH_RESPONSE;
}

class MenveSessionInvalid extends CredentialsSignin {
  code = AUTH_CREDENTIAL_CODE.SESSION_INVALID;
}

/** Respostas HTTP não OK das rotas públicas `/auth/login` e `/auth/me`. */
function throwForAuthUpstreamError(status: number, mode: "login" | "me") {
  if (status === 401) {
    throw mode === "login"
      ? new MenveInvalidCredentials()
      : new MenveSessionInvalid();
  }
  if (status === 429) throw new MenveAuthRateLimited();
  if (status === 502 || status === 503 || status === 504) {
    throw new MenveAuthApiUnreachable();
  }
  if (status === 404) throw new MenveAuthApiNotFound();
  if (status >= 500) throw new MenveAuthApiServerError();
  throw new MenveAuthServiceError();
}

const cwd = process.cwd();
const monorepoRoot =
  path.basename(cwd) === "menve-sales-web" ? path.resolve(cwd, "..") : cwd;
loadEnvConfig(monorepoRoot);
loadEnvConfig(cwd);

function apiBase() {
  return process.env.INTERNAL_API_URL?.replace(/\/$/, "") ?? "http://localhost:4000";
}

function resolveAuthSecret(): string | undefined {
  const fromEnv =
    process.env.AUTH_SECRET?.trim() || process.env.NEXTAUTH_SECRET?.trim();
  if (fromEnv) return fromEnv;
  if (process.env.NODE_ENV !== "production") {
    console.warn(
      "[menve/auth] Defina AUTH_SECRET ou NEXTAUTH_SECRET no .env (raiz do monorepo ou menve-sales-web). Usando fallback só para desenvolvimento.",
    );
    return "local-dev-only-authjs-secret-min-32-chars!!";
  }
  return undefined;
}

const MAX_JWT_NAME_LEN = 72;
const MAX_JWT_EMAIL_LEN = 96;

/**
 * Cookie Auth.js / JWT não pode carregar lista de workspaces, foto nem URLs longas —
 * a Vercel responde 494 REQUEST_HEADER_TOO_LARGE. UI hidrata via GET /auth/me no SSR.
 */
function shrinkClaimsForSessionCookie(token: Record<string, unknown>) {
  delete token.workspaces;
  delete token.picture;
  const name = token.name;
  if (typeof name === "string" && name.length > MAX_JWT_NAME_LEN) {
    token.name = `${name.slice(0, MAX_JWT_NAME_LEN - 1)}…`;
  }
  const email = token.email;
  if (typeof email === "string" && email.length > MAX_JWT_EMAIL_LEN) {
    token.email = `${email.slice(0, MAX_JWT_EMAIL_LEN - 1)}…`;
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  secret: resolveAuthSecret(),
  session: { strategy: "jwt" },
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Senha", type: "password" },
        accessToken: { label: "accessToken", type: "text" },
      },
      authorize: async (credentials) => {
        const tokenOnly = credentials?.accessToken as string | undefined;
        if (tokenOnly?.trim()) {
          let r: Response;
          try {
            r = await fetch(`${apiBase()}/auth/me`, {
              headers: { Authorization: `Bearer ${tokenOnly.trim()}` },
            });
          } catch (err) {
            console.error(
              "[menve/auth] Falha de rede ao chamar auth/me:",
              `${apiBase()}/auth/me`,
              err,
            );
            throw new MenveAuthApiUnreachable();
          }
          if (!r.ok) {
            const snippet = await r.text().catch(() => "");
            console.error(
              "[menve/auth] auth/me não OK:",
              r.status,
              apiBase(),
              snippet.slice(0, 400),
            );
            throwForAuthUpstreamError(r.status, "me");
          }
          const u = (await r.json()) as {
            id: string;
            email: string;
            name: string | null;
            role: UserRole;
            tenantId: string | null;
            globalRole?: UserRole;
            needsOnboarding?: boolean;
          };
          return {
            id: u.id,
            email: u.email,
            name: u.name,
            role: u.role,
            globalRole: u.globalRole ?? u.role,
            tenantId: u.tenantId,
            accessToken: tokenOnly.trim(),
            needsOnboarding: Boolean(u.needsOnboarding),
          };
        }

        const email = credentials?.email as string | undefined;
        const password = credentials?.password as string | undefined;
        if (!email || !password) throw new MenveInvalidCredentials();

        const base = apiBase();
        const loginUrl = `${base}/auth/login`;
        if (
          process.env.NODE_ENV === "production" &&
          (base.includes("127.0.0.1") || base.includes("localhost"))
        ) {
          console.error(
            "[menve/auth] INTERNAL_API_URL ausente ou apontando para localhost — defina a URL HTTPS da API na Vercel (Production) e faça redeploy.",
          );
        }

        let res: Response;
        try {
          res = await fetch(loginUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password }),
          });
        } catch (err) {
          console.error(
            "[menve/auth] Falha de rede ao chamar auth/login:",
            loginUrl,
            err,
          );
          throw new MenveAuthApiUnreachable();
        }
        if (!res.ok) {
          const snippet = await res.text().catch(() => "");
          console.error(
            "[menve/auth] auth/login não OK:",
            res.status,
            loginUrl,
            snippet.slice(0, 400),
          );
          throwForAuthUpstreamError(res.status, "login");
        }
        const data = (await res.json()) as {
          accessToken?: string;
          needsOnboarding?: boolean;
          user?: {
            id: string;
            email: string;
            name: string | null;
            role: UserRole;
            tenantId: string | null;
            globalRole?: UserRole;
          };
        };
        if (!data.user?.id || !data.accessToken) {
          console.error(
            "[menve/auth] auth/login resposta sem user/accessToken",
            { hasUser: Boolean(data.user), hasToken: Boolean(data.accessToken) },
          );
          throw new MenveInvalidAuthResponse();
        }

        return {
          id: data.user.id,
          email: data.user.email,
          name: data.user.name,
          role: data.user.role,
          globalRole: data.user.globalRole ?? data.user.role,
          tenantId: data.user.tenantId,
          accessToken: data.accessToken,
          needsOnboarding: Boolean(data.needsOnboarding),
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.role = (user as { role: UserRole }).role;
        token.globalRole =
          (user as { globalRole?: UserRole }).globalRole ?? token.role;
        token.tenantId = (user as { tenantId: string | null }).tenantId;
        token.accessToken = (user as { accessToken?: string }).accessToken;
        token.needsOnboarding = (user as { needsOnboarding?: boolean })
          .needsOnboarding;
        token.name = user.name ?? undefined;
        token.email = user.email ?? undefined;
      }
      if (trigger === "update") {
        const s = session as
          | {
              user?: {
                name?: string | null;
              };
              accessToken?: string;
              tenantId?: string | null;
              needsOnboarding?: boolean;
            }
          | undefined;
        if (s?.user?.name !== undefined) {
          token.name = s.user.name ?? undefined;
        }
        if (s?.accessToken !== undefined) {
          token.accessToken = s.accessToken;
        }
        if (s?.tenantId !== undefined) {
          token.tenantId = s.tenantId;
        }
        if (s?.needsOnboarding !== undefined) {
          token.needsOnboarding = s.needsOnboarding;
        }
      }
      if (token.sub && token.accessToken) {
        const roleMissing =
          token.role == null ||
          token.role === "" ||
          (typeof token.role === "string" && token.role.trim() === "");
        const needsTenant =
          token.globalRole === "SUPER_ADMIN"
            ? false
            : token.tenantId == null || token.tenantId === "";
        if (roleMissing || needsTenant) {
          try {
            const r = await fetch(`${apiBase()}/auth/me`, {
              headers: {
                Authorization: `Bearer ${String(token.accessToken)}`,
              },
            });
            if (r.ok) {
              const u = (await r.json()) as {
                role: UserRole;
                tenantId: string | null;
                globalRole?: UserRole;
                name?: string | null;
                needsOnboarding?: boolean;
              };
              token.role = u.role;
              token.globalRole = u.globalRole ?? u.role;
              token.tenantId = u.tenantId;
              token.needsOnboarding = u.needsOnboarding;
              if (u.name !== undefined) token.name = u.name ?? undefined;
            }
          } catch {
            /* keep token as-is */
          }
        }
      }
      shrinkClaimsForSessionCookie(token as Record<string, unknown>);
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub!;
        session.user.role = token.role as UserRole;
        session.user.globalRole = (token.globalRole as UserRole) ?? session.user.role;
        session.user.tenantId = token.tenantId as string | null;
        session.user.accessToken = token.accessToken as string | undefined;
        session.user.workspaces = [];
        session.user.needsOnboarding = Boolean(token.needsOnboarding);
        if (token.name !== undefined) {
          session.user.name = token.name as string | null;
        }
        session.user.image = null;
      }
      return session;
    },
  },
});
