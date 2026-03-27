import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { UserRole } from "@prisma/client";

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
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

        const { default: prisma } = await import("@/lib/prisma");
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user?.passwordHash) return null;

        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role as UserRole,
          tenantId: user.tenantId,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.tenantId = user.tenantId;
      }
      if (token.sub) {
        const roleMissing =
          token.role == null ||
          token.role === "" ||
          (typeof token.role === "string" && token.role.trim() === "");
        const needsTenant =
          token.role === UserRole.SUPER_ADMIN
            ? false
            : token.tenantId == null || token.tenantId === "";
        if (roleMissing || needsTenant) {
          try {
            const { default: prisma } = await import("@/lib/prisma");
            const u = await prisma.user.findUnique({
              where: { id: token.sub },
              select: { role: true, tenantId: true },
            });
            if (u) {
              token.role = u.role;
              token.tenantId = u.tenantId;
            }
          } catch {
            // Falha transitória do DB no JWT não deve derrubar toda a sessão;
            // getActiveTenantId() reidrata role/tenantId via Prisma quando precisar.
          }
        }
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub!
        session.user.role = token.role as UserRole;
        session.user.tenantId = token.tenantId as string | null;
      }
      return session;
    },
  },
});
