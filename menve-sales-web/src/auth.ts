import path from "node:path";
import { loadEnvConfig } from "@next/env";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import type { UserRole } from "@/types/domain";

// Turbopack pode carregar este módulo cedo; garante .env da raiz antes de ler o secret.
const cwd = process.cwd();
const monorepoRoot =
  path.basename(cwd) === "menve-sales-web" ? path.resolve(cwd, "..") : cwd;
loadEnvConfig(monorepoRoot);
loadEnvConfig(cwd);

function apiBase() {
  return process.env.INTERNAL_API_URL?.replace(/\/$/, "") ?? "http://localhost:4000";
}

/** Auth.js exige `secret` não vazio. Em dev, fallback se não houver .env. Em produção, defina no deploy ou verá MissingSecret em runtime. */
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
      },
      authorize: async (credentials) => {
        const email = credentials?.email as string | undefined;
        const password = credentials?.password as string | undefined;
        if (!email || !password) return null;

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
          return null;
        }
        if (!res.ok) {
          const snippet = await res.text().catch(() => "");
          console.error(
            "[menve/auth] auth/login não OK:",
            res.status,
            snippet.slice(0, 400),
          );
          return null;
        }
        const data = (await res.json()) as {
          accessToken?: string;
          user?: {
            id: string;
            email: string;
            name: string | null;
            image?: string | null;
            role: UserRole;
            tenantId: string | null;
          };
        };
        if (!data.user?.id) return null;

        return {
          id: data.user.id,
          email: data.user.email,
          name: data.user.name,
          image: data.user.image ?? undefined,
          role: data.user.role,
          tenantId: data.user.tenantId,
          accessToken: data.accessToken,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.role = (user as { role: UserRole }).role;
        token.tenantId = (user as { tenantId: string | null }).tenantId;
        token.accessToken = (user as { accessToken?: string }).accessToken;
        token.name = user.name ?? undefined;
        token.email = user.email ?? undefined;
        token.picture =
          typeof (user as { image?: string | null }).image === "string"
            ? ((user as { image?: string | null }).image ?? undefined)
            : undefined;
      }
      if (trigger === "update") {
        const s = session as
          | { user?: { name?: string | null; image?: string | null } }
          | undefined;
        if (s?.user?.name !== undefined) {
          token.name = s.user.name ?? undefined;
        }
        if (s?.user?.image !== undefined) {
          token.picture = s.user.image ?? undefined;
        }
      }
      if (token.sub && token.accessToken) {
        const roleMissing =
          token.role == null ||
          token.role === "" ||
          (typeof token.role === "string" && token.role.trim() === "");
        const needsTenant =
          token.role === "SUPER_ADMIN"
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
                name?: string | null;
                image?: string | null;
              };
              token.role = u.role;
              token.tenantId = u.tenantId;
              if (u.name !== undefined) token.name = u.name ?? undefined;
              if (u.image !== undefined) {
                token.picture = u.image ?? undefined;
              }
            }
          } catch {
            /* keep token as-is */
          }
        }
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub!;
        session.user.role = token.role as UserRole;
        session.user.tenantId = token.tenantId as string | null;
        if (token.name !== undefined) {
          session.user.name = token.name as string | null;
        }
        session.user.image =
          typeof token.picture === "string" && token.picture !== ""
            ? token.picture
            : null;
      }
      return session;
    },
  },
});
