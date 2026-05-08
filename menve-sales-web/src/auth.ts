import path from "node:path";
import { loadEnvConfig } from "@next/env";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import type { UserRole } from "@/types/domain";

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

type WorkspaceRow = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  image?: string | null;
  role: UserRole;
};

/** Poucos itens no JWT; lista completa vem de GET /workspaces no layout do dashboard. */
const MAX_WORKSPACES_IN_JWT = 10;
const MAX_WS_NAME_IN_JWT = 48;
const MAX_WS_SLUG_IN_JWT = 40;

/**
 * JWT vira cookie; muitos workspaces / strings longas estouram REQUEST_HEADER_TOO_LARGE na Vercel.
 * Avatar do workspace continua funcionando via inicial quando `image` some.
 */
function compactWorkspacesForJwt(
  ws: WorkspaceRow[] | undefined,
  preferredTenantId?: string | null,
): WorkspaceRow[] {
  if (!ws?.length) return [];
  const mapped = ws.map((w) => ({
    id: w.id,
    name:
      w.name.length > MAX_WS_NAME_IN_JWT
        ? `${w.name.slice(0, MAX_WS_NAME_IN_JWT - 1)}…`
        : w.name,
    slug:
      w.slug.length > MAX_WS_SLUG_IN_JWT
        ? `${w.slug.slice(0, MAX_WS_SLUG_IN_JWT - 1)}…`
        : w.slug,
    plan: w.plan,
    role: w.role,
  }));
  const pref = preferredTenantId?.trim();
  let ordered = mapped;
  if (pref) {
    const ix = mapped.findIndex((x) => x.id === pref);
    if (ix > 0) {
      ordered = [mapped[ix], ...mapped.slice(0, ix), ...mapped.slice(ix + 1)];
    }
  }
  return ordered.slice(0, MAX_WORKSPACES_IN_JWT);
}

function compactPictureForJwt(url: unknown): string | undefined {
  if (typeof url !== "string" || !url.trim()) return undefined;
  const t = url.trim();
  if (t.length > 180) return undefined;
  return t;
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
          const r = await fetch(`${apiBase()}/auth/me`, {
            headers: { Authorization: `Bearer ${tokenOnly.trim()}` },
          });
          if (!r.ok) return null;
          const u = (await r.json()) as {
            id: string;
            email: string;
            name: string | null;
            image?: string | null;
            role: UserRole;
            tenantId: string | null;
            globalRole?: UserRole;
            workspaces?: WorkspaceRow[];
            needsOnboarding?: boolean;
          };
          return {
            id: u.id,
            email: u.email,
            name: u.name,
            image: u.image ?? undefined,
            role: u.role,
            globalRole: u.globalRole ?? u.role,
            tenantId: u.tenantId,
            accessToken: tokenOnly.trim(),
            workspaces: u.workspaces ?? [],
            needsOnboarding: Boolean(u.needsOnboarding),
          };
        }

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
          needsOnboarding?: boolean;
          workspaces?: WorkspaceRow[];
          user?: {
            id: string;
            email: string;
            name: string | null;
            image?: string | null;
            role: UserRole;
            tenantId: string | null;
            globalRole?: UserRole;
          };
        };
        if (!data.user?.id || !data.accessToken) return null;

        return {
          id: data.user.id,
          email: data.user.email,
          name: data.user.name,
          image: data.user.image ?? undefined,
          role: data.user.role,
          globalRole: data.user.globalRole ?? data.user.role,
          tenantId: data.user.tenantId,
          accessToken: data.accessToken,
          workspaces: data.workspaces ?? [],
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
        token.workspaces = compactWorkspacesForJwt(
          (user as { workspaces?: WorkspaceRow[] }).workspaces,
          (user as { tenantId?: string | null }).tenantId,
        );
        token.needsOnboarding = (user as { needsOnboarding?: boolean })
          .needsOnboarding;
        token.name = user.name ?? undefined;
        token.email = user.email ?? undefined;
        token.picture = compactPictureForJwt(
          typeof (user as { image?: string | null }).image === "string"
            ? ((user as { image?: string | null }).image ?? undefined)
            : undefined,
        );
      }
      if (trigger === "update") {
        const s = session as
          | {
              user?: {
                name?: string | null;
                image?: string | null;
              };
              accessToken?: string;
              tenantId?: string | null;
              workspaces?: WorkspaceRow[];
              needsOnboarding?: boolean;
            }
          | undefined;
        if (s?.user?.name !== undefined) {
          token.name = s.user.name ?? undefined;
        }
        if (s?.user?.image !== undefined) {
          token.picture = compactPictureForJwt(s.user.image ?? undefined);
        }
        if (s?.accessToken !== undefined) {
          token.accessToken = s.accessToken;
        }
        if (s?.tenantId !== undefined) {
          token.tenantId = s.tenantId;
        }
        if (s?.workspaces !== undefined) {
          token.workspaces = compactWorkspacesForJwt(
            s.workspaces,
            token.tenantId as string | null | undefined,
          );
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
                image?: string | null;
                workspaces?: WorkspaceRow[];
                needsOnboarding?: boolean;
              };
              token.role = u.role;
              token.globalRole = u.globalRole ?? u.role;
              token.tenantId = u.tenantId;
              token.workspaces = compactWorkspacesForJwt(
                u.workspaces,
                token.tenantId as string | null | undefined,
              );
              token.needsOnboarding = u.needsOnboarding;
              if (u.name !== undefined) token.name = u.name ?? undefined;
              if (u.image !== undefined) {
                token.picture = compactPictureForJwt(u.image ?? undefined);
              }
            }
          } catch {
            /* keep token as-is */
          }
        }
      }
      token.workspaces = compactWorkspacesForJwt(
        token.workspaces as WorkspaceRow[] | undefined,
        token.tenantId as string | null | undefined,
      );
      token.picture = compactPictureForJwt(token.picture);
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub!;
        session.user.role = token.role as UserRole;
        session.user.globalRole = (token.globalRole as UserRole) ?? session.user.role;
        session.user.tenantId = token.tenantId as string | null;
        session.user.accessToken = token.accessToken as string | undefined;
        session.user.workspaces = (token.workspaces as WorkspaceRow[]) ?? [];
        session.user.needsOnboarding = Boolean(token.needsOnboarding);
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
