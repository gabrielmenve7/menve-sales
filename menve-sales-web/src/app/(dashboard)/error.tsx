"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 p-6">
      <h2 className="text-lg font-semibold">Algo deu errado</h2>
      <p className="max-w-md text-center text-sm text-muted-foreground">
        {error.message || "Erro ao carregar esta área do CRM."}
      </p>
      <Button type="button" onClick={() => reset()}>
        Tentar novamente
      </Button>
    </div>
  );
}
