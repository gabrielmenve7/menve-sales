export const DEFAULT_OUTREACH_TEMPLATE = `Olá {{nome}}! Tudo bem?

Somos da Menve e vimos a {{empresa}}. Podemos conversar?

WhatsApp: {{telefone}}`;

export function previewOutreachTemplate(template: string): string {
  return template
    .replace(/\{\{nome\}\}/gi, "Maria")
    .replace(/\{\{empresa\}\}/gi, "Empresa Exemplo")
    .replace(/\{\{telefone\}\}/gi, "(48) 99999-0000");
}
