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

        const res = await fetch(`${apiBase()}/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        if (!res.ok) return null;
        const data = (await res.json()) as {
          accessToken?: string;
          user?: {
            id: string;
            email: string;
            name: string | null;
            role: UserRole;
            tenantId: string | null;
          };
        };
        if (!data.user?.id) return null;

        return {
          id: data.user.id,
          email: data.user.email,
          name: data.user.name,
          role: data.user.role,
          tenantId: data.user.tenantId,
          accessToken: data.accessToken,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as { role: UserRole }).role;
        token.tenantId = (user as { tenantId: string | null }).tenantId;
        token.accessToken = (user as { accessToken?: string }).accessToken;
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
              };
              token.role = u.role;
              token.tenantId = u.tenantId;
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
      }
      return session;
    },
  },
});
