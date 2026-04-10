import { type DefaultSession } from "next-auth";
import type { UserRole } from "@/types/domain";

type WorkspaceRow = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  image?: string | null;
  role: UserRole;
};

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      id: string;
      role: UserRole;
      globalRole: UserRole;
      tenantId: string | null;
      accessToken?: string;
      workspaces: WorkspaceRow[];
      needsOnboarding: boolean;
    };
  }

  interface User {
    role: UserRole;
    globalRole: UserRole;
    tenantId: string | null;
    accessToken?: string;
    workspaces?: WorkspaceRow[];
    needsOnboarding?: boolean;
    image?: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role: UserRole;
    globalRole: UserRole;
    tenantId: string | null;
    accessToken?: string;
    workspaces?: WorkspaceRow[];
    needsOnboarding?: boolean;
    name?: string | null;
    email?: string | null;
    picture?: string | null;
  }
}
