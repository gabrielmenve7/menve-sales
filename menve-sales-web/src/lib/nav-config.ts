import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Calendar,
  CreditCard,
  LayoutGrid,
  List,
  MessageCircle,
  Package,
  Send,
  Settings2,
  Shield,
  Smartphone,
  Target,
  Trello,
  Users,
} from "lucide-react";

export type NavContext = {
  researchEnabled: boolean;
  isSuperAdmin: boolean;
  canManageWorkspace: boolean;
  canConfigureTenant: boolean;
};

export type NavItem = {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  /** Match pathname for active state */
  activeMatch?: (pathname: string) => boolean;
  visible?: (ctx: NavContext) => boolean;
};

export type NavSection = {
  id: string;
  label: string;
  items: NavItem[];
  visible?: (ctx: NavContext) => boolean;
};

export type FooterNavItem = NavItem;

const defaultActive =
  (href: string) => (pathname: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

export const NAV_SECTIONS: NavSection[] = [
  {
    id: "main",
    label: "MENU PRINCIPAL",
    items: [
      {
        id: "dashboard",
        label: "Dashboard",
        href: "/dashboard",
        icon: LayoutGrid,
        activeMatch: defaultActive("/dashboard"),
      },
      {
        id: "pipeline",
        label: "Gestão de leads",
        href: "/pipeline",
        icon: Trello,
        activeMatch: defaultActive("/pipeline"),
      },
      {
        id: "agenda",
        label: "Agenda",
        href: "/agenda",
        icon: Calendar,
        activeMatch: defaultActive("/agenda"),
      },
      {
        id: "relatorios",
        label: "Relatórios",
        href: "/relatorios",
        icon: BarChart3,
        activeMatch: defaultActive("/relatorios"),
      },
    ],
  },
  {
    id: "prospecting",
    label: "PROSPECÇÃO",
    visible: (ctx) => ctx.researchEnabled,
    items: [
      {
        id: "lista",
        label: "Lista",
        href: "/lista",
        icon: List,
        activeMatch: (p) =>
          p === "/lista" ||
          p.startsWith("/lista/") ||
          p === "/pesquisa" ||
          p.startsWith("/pesquisa/"),
      },
      {
        id: "disparo",
        label: "Disparo",
        href: "/disparo",
        icon: Send,
        activeMatch: defaultActive("/disparo"),
      },
      {
        id: "atendimento",
        label: "Atendimento",
        href: "/inbox",
        icon: MessageCircle,
        activeMatch: defaultActive("/inbox"),
      },
      {
        id: "whatsapps",
        label: "WhatsApps",
        href: "/whatsapps",
        icon: Smartphone,
        activeMatch: defaultActive("/whatsapps"),
        visible: (ctx) => ctx.canConfigureTenant,
      },
    ],
  },
  {
    id: "management",
    label: "GESTÃO",
    items: [
      {
        id: "financeiro",
        label: "Financeiro",
        href: "/financeiro",
        icon: CreditCard,
        activeMatch: defaultActive("/financeiro"),
        visible: (ctx) => ctx.canConfigureTenant,
      },
      {
        id: "lead-scoring",
        label: "Lead scoring",
        href: "/lead-scoring",
        icon: Target,
        activeMatch: defaultActive("/lead-scoring"),
        visible: (ctx) => ctx.canConfigureTenant,
      },
      {
        id: "usuarios",
        label: "Usuários",
        href: "/usuarios",
        icon: Users,
        activeMatch: defaultActive("/usuarios"),
        visible: (ctx) => ctx.canManageWorkspace,
      },
      {
        id: "settings",
        label: "Configurações",
        href: "/settings",
        icon: Settings2,
        activeMatch: defaultActive("/settings"),
      },
    ],
  },
];

export const FOOTER_NAV_ITEMS: FooterNavItem[] = [
  {
    id: "produtos",
    label: "Produtos",
    href: "/produtos",
    icon: Package,
    activeMatch: defaultActive("/produtos"),
  },
  {
    id: "contacts",
    label: "Contatos",
    href: "/contacts",
    icon: Users,
    activeMatch: defaultActive("/contacts"),
  },
  {
    id: "admin",
    label: "Admin",
    href: "/admin",
    icon: Shield,
    activeMatch: defaultActive("/admin"),
    visible: (ctx) => ctx.isSuperAdmin,
  },
];

export function filterNavSections(
  sections: NavSection[],
  ctx: NavContext,
): NavSection[] {
  return sections
    .filter((s) => s.visible?.(ctx) !== false)
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => item.visible?.(ctx) !== false),
    }))
    .filter((s) => s.items.length > 0);
}

export function filterFooterItems(
  items: FooterNavItem[],
  ctx: NavContext,
): FooterNavItem[] {
  return items.filter((item) => item.visible?.(ctx) !== false);
}

const LS_SECTIONS = "menve.nav.sections.expanded";

export function readExpandedSections(): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(LS_SECTIONS);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, boolean>;
  } catch {
    return {};
  }
}

export function writeExpandedSections(state: Record<string, boolean>) {
  if (typeof window === "undefined") return;
  localStorage.setItem(LS_SECTIONS, JSON.stringify(state));
}
