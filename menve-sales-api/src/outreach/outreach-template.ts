export type OutreachTemplateVars = {
  nome?: string | null;
  empresa?: string | null;
  telefone?: string | null;
};

/** Substitui `{{nome}}`, `{{empresa}}` e `{{telefone}}` (case-insensitive). */
export function renderOutreachTemplate(
  template: string,
  vars: OutreachTemplateVars,
): string {
  const nome = vars.nome?.trim() ?? "";
  const empresa = vars.empresa?.trim() ?? "";
  const telefone = vars.telefone?.trim() ?? "";
  return template
    .replace(/\{\{nome\}\}/gi, nome)
    .replace(/\{\{empresa\}\}/gi, empresa)
    .replace(/\{\{telefone\}\}/gi, telefone);
}
