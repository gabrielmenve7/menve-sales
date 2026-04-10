"use client";

import { signIn, useSession } from "next-auth/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchInvitePreview,
  registerAccount,
} from "@/actions/auth-register";
import { acceptWorkspaceInvite } from "@/actions/workspace";
import { AuthSplitLayout } from "@/components/auth/auth-split-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, status, update } = useSession();
  const inviteToken = searchParams.get("invite")?.trim() ?? "";
  const modeParam = searchParams.get("mode");
  const errorParam = searchParams.get("error");

  const [mode, setMode] = useState<"login" | "register">(
    modeParam === "register" ? "register" : "login",
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [inviteBanner, setInviteBanner] = useState<{
    workspaceName: string;
    email?: string;
  } | null>(null);
  const inviteHandled = useRef(false);

  useEffect(() => {
    if (!inviteToken) return;
    let cancelled = false;
    void (async () => {
      const data = await fetchInvitePreview(inviteToken);
      if (cancelled || !data.ok) return;
      setInviteBanner({
        workspaceName: data.workspaceName,
        email: data.email,
      });
      if (data.email) setEmail(data.email);
    })();
    return () => {
      cancelled = true;
    };
  }, [inviteToken]);

  useEffect(() => {
    if (errorParam === "tenant") {
      setError("Sessão expirada ou workspace inválido. Entre novamente.");
    }
  }, [errorParam]);

  const afterAuthRedirect = useCallback(async () => {
    if (inviteToken) {
      if (inviteHandled.current) {
        router.push("/dashboard");
        router.refresh();
        return;
      }
      inviteHandled.current = true;
      try {
        const data = await acceptWorkspaceInvite(inviteToken);
        await update({
          accessToken: data.accessToken,
          tenantId: data.user.tenantId,
          workspaces: data.workspaces,
          needsOnboarding: data.needsOnboarding,
        });
      } catch (e) {
        inviteHandled.current = false;
        setError(
          e instanceof Error
            ? e.message
            : "Não foi possível aceitar o convite. Verifique o e-mail da conta.",
        );
        return;
      }
    }
    router.push("/dashboard");
    router.refresh();
  }, [inviteToken, router, update]);

  useEffect(() => {
    if (status !== "authenticated" || !session?.user) return;
    if (
      session.user.needsOnboarding &&
      !session.user.tenantId &&
      !inviteToken
    ) {
      router.replace("/workspace");
      return;
    }
    if (inviteToken && !inviteHandled.current) {
      void afterAuthRedirect();
    }
  }, [status, session, inviteToken, router, afterAuthRedirect]);

  async function onSubmitLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });
    setLoading(false);
    if (res?.error) {
      setError("Credenciais inválidas ou API indisponível.");
      return;
    }
    if (inviteToken) {
      await afterAuthRedirect();
      return;
    }
    const s = await fetch("/api/auth/session").then((r) => r.json()) as {
      user?: { needsOnboarding?: boolean; tenantId?: string | null };
    };
    if (s?.user?.needsOnboarding && !s?.user?.tenantId) {
      router.push("/workspace");
      router.refresh();
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  async function onSubmitRegister(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    if (password !== confirm) {
      setError("As senhas não coincidem.");
      setLoading(false);
      return;
    }
    try {
      const result = await registerAccount({
        email,
        password,
        name: name || undefined,
      });
      if (!result.ok) {
        setError(result.message);
        setLoading(false);
        return;
      }
      const res = await signIn("credentials", {
        accessToken: result.accessToken,
        redirect: false,
      });
      setLoading(false);
      if (res?.error) {
        setError("Sessão não pôde ser criada. Tente entrar com e-mail e senha.");
        return;
      }
      if (inviteToken) {
        await afterAuthRedirect();
        return;
      }
      router.push("/workspace");
      router.refresh();
    } catch {
      setError("Falha de rede ao cadastrar.");
      setLoading(false);
    }
  }

  return (
    <AuthSplitLayout>
      {inviteBanner ? (
        <div
          className="mb-6 rounded-xl border border-primary/25 bg-primary/5 px-4 py-3 text-sm dark:border-primary/30 dark:bg-primary/10"
          role="status"
        >
          <p className="font-medium text-foreground">
            Convite para{" "}
            <span className="text-primary-solid">{inviteBanner.workspaceName}</span>
          </p>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Entre ou cadastre-se com o e-mail convidado para aceitar.
          </p>
        </div>
      ) : null}

      <div className="mb-6 flex rounded-lg border border-border/60 bg-muted/30 p-1 dark:bg-muted/20">
        <button
          type="button"
          className={`flex-1 rounded-md py-2 text-[13px] font-medium transition-colors ${
            mode === "login"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => setMode("login")}
        >
          Entrar
        </button>
        <button
          type="button"
          className={`flex-1 rounded-md py-2 text-[13px] font-medium transition-colors ${
            mode === "register"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => setMode("register")}
        >
          Cadastre-se
        </button>
      </div>

      {mode === "login" ? (
        <form onSubmit={onSubmitLogin} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email" className="text-[13px]">
              E-mail
            </Label>
            <Input
              id="email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              readOnly={Boolean(inviteBanner?.email)}
              className="h-10"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password" className="text-[13px]">
              Senha
            </Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="h-10"
            />
          </div>
          {error ? (
            <p className="text-[13px] text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          <Button type="submit" className="h-10 w-full text-[13px]" disabled={loading}>
            {loading ? "Entrando…" : "Entrar"}
          </Button>
        </form>
      ) : (
        <form onSubmit={onSubmitRegister} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name" className="text-[13px]">
              Nome
            </Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-10"
              autoComplete="name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="reg-email" className="text-[13px]">
              E-mail
            </Label>
            <Input
              id="reg-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              readOnly={Boolean(inviteBanner?.email)}
              className="h-10"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="reg-password" className="text-[13px]">
              Senha
            </Label>
            <Input
              id="reg-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="h-10"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm" className="text-[13px]">
              Confirmar senha
            </Label>
            <Input
              id="confirm"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              className="h-10"
            />
          </div>
          {error ? (
            <p className="text-[13px] text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          <Button type="submit" className="h-10 w-full text-[13px]" disabled={loading}>
            {loading ? "Criando conta…" : "Criar conta"}
          </Button>
        </form>
      )}

      <p className="mt-6 text-center text-[12px] text-muted-foreground">
        {mode === "login" ? (
          <>
            Não tem conta?{" "}
            <button
              type="button"
              className="font-medium text-primary-solid hover:underline"
              onClick={() => setMode("register")}
            >
              Cadastre-se
            </button>
          </>
        ) : (
          <>
            Já tem conta?{" "}
            <button
              type="button"
              className="font-medium text-primary-solid hover:underline"
              onClick={() => setMode("login")}
            >
              Entrar
            </button>
          </>
        )}
      </p>

      <p className="mt-4 text-center text-[11px] text-muted-foreground">
        <Link href="/" className="hover:underline">
          Voltar ao início
        </Link>
      </p>
    </AuthSplitLayout>
  );
}
