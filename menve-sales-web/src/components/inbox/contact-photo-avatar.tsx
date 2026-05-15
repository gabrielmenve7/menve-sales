"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { initials } from "./inbox-utils";

type ContactPhotoAvatarProps = {
  photoUrl: string | null | undefined;
  name: string;
  /** Ex.: `size-9`, `size-10` */
  sizeClass?: string;
  className?: string;
  imgClassName?: string;
  fallbackClassName?: string;
};

/**
 * Prioriza foto do WhatsApp (`whatsappProfilePhotoUrl`); se falhar ao carregar
 * ou não existir, mostra iniciais no círculo (sem ícone de imagem quebrada).
 */
export function ContactPhotoAvatar({
  photoUrl,
  name,
  sizeClass = "size-9",
  className,
  imgClassName,
  fallbackClassName,
}: ContactPhotoAvatarProps) {
  const [failed, setFailed] = useState(false);
  const url = photoUrl?.trim() || null;

  useEffect(() => {
    setFailed(false);
  }, [url]);

  const showImg = Boolean(url) && !failed;
  const label = initials(name);

  if (showImg) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url!}
        alt=""
        onError={() => setFailed(true)}
        className={cn(
          "rounded-full object-cover",
          sizeClass,
          imgClassName,
          className,
        )}
      />
    );
  }

  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground",
        sizeClass,
        fallbackClassName,
        className,
      )}
      aria-hidden
    >
      {label}
    </span>
  );
}
