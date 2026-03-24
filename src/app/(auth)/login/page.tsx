"use client";

import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
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
import { ThemeToggle } from "@/components/theme-toggle";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
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
      setError("Email ou senha inválidos.");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-muted/25 px-4 dark:bg-muted/10">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <Card className="w-full max-w-[380px] border-border/60 shadow-sm">
        <CardHeader className="space-y-1 pb-4">
          <CardTitle className="text-xl font-semibold tracking-tight">
            Menve Sales
          </CardTitle>
          <CardDescription className="text-[13px] leading-relaxed">
            Acesse o CRM com sua conta.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-[13px] font-medium">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-10 border-border/60 bg-background"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-[13px] font-medium">
                Senha
              </Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="h-10 border-border/60 bg-background"
              />
            </div>
            {error ? (
              <p className="text-[13px] text-destructive" role="alert">
                {error}
              </p>
            ) : null}
            <Button
              type="submit"
              className="h-10 w-full text-[13px] font-medium"
              disabled={loading}
            >
              {loading ? "Entrando…" : "Entrar"}
            </Button>
          </form>
          <p className="mt-5 text-[11px] leading-relaxed text-muted-foreground">
            Demo: owner@demo.com / admin123 · admin@menve.com / admin123
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
