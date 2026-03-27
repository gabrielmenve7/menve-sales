import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const defaultSlug = process.env.DEFAULT_TENANT_SLUG ?? "demo";

export default function SetupPage() {
  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center p-6">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Tenant não encontrado</CardTitle>
          <CardDescription>
            O CRM precisa de um registro de tenant no banco (slug{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-sm">
              {defaultSlug}
            </code>
            ). Sem isso, todas as páginas do app falham em produção.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <p>
            O deploy na Vercel já roda{" "}
            <code className="rounded bg-muted px-1 py-0.5">prisma db seed</code>{" "}
            após as migrations. Se você vê esta página, aguarde um redeploy
            recente ou rode manualmente no mesmo{" "}
            <code className="rounded bg-muted px-1 py-0.5">DATABASE_URL</code>{" "}
            da Vercel:
          </p>
          <pre className="overflow-x-auto rounded-md border bg-muted/50 p-3 text-xs text-foreground">
            {`npx prisma migrate deploy
npm run db:seed`}
          </pre>
          <p>
            O seed cria o tenant <strong>{defaultSlug}</strong>, pipelines e
            usuários de demonstração. Confira também se{" "}
            <code className="rounded bg-muted px-1 py-0.5">
              DEFAULT_TENANT_SLUG
            </code>{" "}
            na Vercel coincide com o slug existente no banco.
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
