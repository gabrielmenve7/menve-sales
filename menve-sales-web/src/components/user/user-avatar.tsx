"use client";

import { cn } from "@/lib/utils";

export type UserAvatarFields = {
  name: string | null;
  email: string;
  image?: string | null;
};

function fallbackLetters(user: {
  name: string | null;
  email?: string | null;
}): string {
  const n = user.name?.trim();
  if (n) {
    const parts = n.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      const a = parts[0]![0];
      const b = parts[parts.length - 1]![0];
      return `${a}${b}`.toUpperCase();
    }
    return n.slice(0, 2).toUpperCase();
  }
  const e = user.email?.trim();
  if (e) return e.slice(0, 2).toUpperCase();
  return "?";
}

/**
 * Avatar circular: foto (`User.image`) ou iniciais. URLs https e data URLs.
 */
export function UserAvatar({
  user,
  size = "md",
  mutedFallback = false,
  className,
}: {
  user: UserAvatarFields;
  size?: "sm" | "md";
  mutedFallback?: boolean;
  className?: string;
}) {
  const src = user.image?.trim();
  const letters = fallbackLetters(user);

  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-full font-medium leading-none",
        size === "sm" ? "size-6 text-[10px]" : "size-7 text-xs",
        mutedFallback
          ? "bg-muted text-foreground"
          : "bg-violet-600 text-white dark:bg-violet-500",
        className,
      )}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- data URLs e URLs arbitrárias do perfil
        <img
          src={src}
          alt=""
          className="size-full object-cover"
          referrerPolicy="no-referrer"
        />
      ) : (
        letters
      )}
    </span>
  );
}
