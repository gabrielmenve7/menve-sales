"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { updateMyProfile } from "@/actions/profile";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fileToResizedJpegDataUrl } from "@/lib/resize-image-client";

function userInitial(name: string | null | undefined, email: string | null) {
  const n = (name ?? "").trim();
  if (n) return n.slice(0, 1).toUpperCase();
  const e = (email ?? "").trim();
  if (e) return e.slice(0, 1).toUpperCase();
  return "?";
}

export function SettingsProfile({
  initialName,
  initialEmail,
  initialImage,
}: {
  initialName: string | null;
  initialEmail: string;
  initialImage: string | null;
}) {
  const router = useRouter();
  const { update } = useSession();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState((initialName ?? "").trim() || "");
  const [imageUrl, setImageUrl] = useState("");
  const [preview, setPreview] = useState<string | null>(initialImage);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !file.type.startsWith("image/")) return;
    if (file.size > 8 * 1024 * 1024) {
      setErr("Imagem muito grande (máx. 8 MB).");
      return;
    }
    setErr(null);
    try {
      const dataUrl = await fileToResizedJpegDataUrl(file);
      if (dataUrl.length > 400_000) {
        setErr("Imagem ainda grande demais após redimensionar. Tente outra foto.");
        return;
      }
      setPreview(dataUrl);
      setImageUrl("");
    } catch {
      setErr("Não foi possível carregar a imagem.");
    }
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setErr("Informe seu nome.");
      return;
    }
    setSaving(true);
    setErr(null);
    const url = imageUrl.trim();
    let imagePayload: string | null | undefined;
    if (preview?.startsWith("data:")) {
      imagePayload = preview;
    } else if (url) {
      imagePayload = url;
    } else if (preview && /^https?:\/\//i.test(preview)) {
      imagePayload = preview;
    } else {
      imagePayload = undefined;
    }
    const res = await updateMyProfile({
      name: trimmed,
      ...(imagePayload !== undefined ? { image: imagePayload } : {}),
    });
    setSaving(false);
    if (!res.ok) {
      setErr(res.error);
      return;
    }
    await update({
      user: {
        name: res.user.name,
        image: res.user.image,
      },
    });
    router.refresh();
    setPreview(res.user.image);
    setImageUrl("");
  }

  async function onRemovePhoto() {
    setSaving(true);
    setErr(null);
    const res = await updateMyProfile({ image: null });
    setSaving(false);
    if (!res.ok) {
      setErr(res.error);
      return;
    }
    setPreview(null);
    setImageUrl("");
    await update({
      user: {
        name: res.user.name,
        image: null,
      },
    });
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Meu perfil</CardTitle>
          <CardDescription>
            Nome e foto usados no workspace (barra lateral e demais telas).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={(e) => void onSave(e)} className="space-y-6">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
              <div className="flex flex-col items-center gap-2">
                <div
                  className="relative flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border/60 bg-muted/50 text-2xl font-semibold text-foreground dark:border-border/50"
                  aria-hidden={!!preview}
                >
                  {preview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={preview}
                      alt=""
                      className="size-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <span>{userInitial(name, initialEmail)}</span>
                  )}
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="sr-only"
                  onChange={(e) => void onPickFile(e)}
                />
                <div className="flex flex-wrap justify-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileRef.current?.click()}
                  >
                    Escolher foto
                  </Button>
                  {preview ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground"
                      disabled={saving}
                      onClick={() => void onRemovePhoto()}
                    >
                      Remover foto
                    </Button>
                  ) : null}
                </div>
              </div>

              <div className="min-w-0 flex-1 space-y-4">
                <div className="grid gap-2">
                  <Label htmlFor="profile-email">Email</Label>
                  <Input
                    id="profile-email"
                    value={initialEmail}
                    disabled
                    className="bg-muted/40"
                  />
                  <p className="text-xs text-muted-foreground">
                    O email não pode ser alterado aqui.
                  </p>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="profile-name">Nome</Label>
                  <Input
                    id="profile-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Seu nome"
                    autoComplete="name"
                    maxLength={120}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="profile-image-url">
                    Ou cole uma URL da imagem (https)
                  </Label>
                  <Input
                    id="profile-image-url"
                    value={imageUrl}
                    onChange={(e) => {
                      setImageUrl(e.target.value);
                      const v = e.target.value.trim();
                      if (/^https?:\/\//i.test(v)) {
                        setPreview(v);
                      }
                    }}
                    placeholder="https://…"
                    type="url"
                  />
                </div>
              </div>
            </div>

            {err ? (
              <p className="text-sm text-destructive" role="alert">
                {err}
              </p>
            ) : null}

            <Button type="submit" disabled={saving}>
              {saving ? "Salvando…" : "Salvar perfil"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
