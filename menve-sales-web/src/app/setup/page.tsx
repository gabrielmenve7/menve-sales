import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getTenantSlugFromRequest } from "@/lib/tenant";

export default async function SetupPage() {
  const resolvedSlug = await getTenantSlugFromRequest();

  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center p-6">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Tenant não encontrado</CardTitle>
          <CardDescription>
            O CRM resolve o tenant pelo host (ex.:{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-sm">crm</code> em{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-sm">
              crm.menvedigital.com.br
            </code>
            ) ou por{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-sm">
              DEFAULT_TENANT_SLUG
            </code>
            . Neste acesso o slug esperado no banco é{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-sm">
              {resolvedSlug}
            </code>
            . Sem esse registro, o app redireciona para esta página.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <p>
            <strong>1)</strong> Faça um <strong>redeploy da API</strong> (Railway)
            com a versão atual do código: ao subir, ela cria automaticamente os
            tenants <strong>demo</strong>, <strong>vendas</strong>,{" "}
            <strong>crm</strong> e <strong>menve-digital</strong> no{" "}
            <code className="rounded bg-muted px-1">DATABASE_URL</code> dela, mais
            pipeline/tags mínimos — desde que{" "}
            <code className="rounded bg-muted px-1">INTERNAL_API_URL</code> na
            Vercel aponte para essa API.
          </p>
          <p>
            <strong>2)</strong> Se ainda aparecer esta página, rode manualmente no
            mesmo Postgres da API:
          </p>
          <pre className="overflow-x-auto rounded-md border bg-muted/50 p-3 text-xs text-foreground">
            {`cd menve-sales-api
npx prisma migrate deploy
npm run db:seed`}
          </pre>
          <p>
            Login <strong>crm</strong>:{" "}
            <code className="rounded bg-muted px-1">
              owner@crm.menvedigital.local
            </code>{" "}
            / <code className="rounded bg-muted px-1">admin123</code> (criado na
            primeira subida da API ou pelo seed).
          </p>
          <div className="flex flex-wrap gap-2 pt-2">
            <Button asChild variant="default">
              <Link href="/dashboard">Tentar de novo</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/login">Ir para o login</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
