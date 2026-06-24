import { redirect } from "next/navigation";

/** Configuração de agentes IA ficou em Prospecção → Agentes IA. */
export default function AgentesPage() {
  redirect("/lista/agentes");
}
