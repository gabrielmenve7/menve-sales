"use client";

import type { CustomField } from "@prisma/client";
import { CUSTOM_FIELD_ENTITY } from "@/lib/custom-field-entity";
import { SettingsCustomFields } from "./settings-custom-fields";

export function SettingsCampos({
  contactCustomFields,
  dealCustomFields,
}: {
  contactCustomFields: CustomField[];
  dealCustomFields: CustomField[];
}) {
  return (
    <div className="space-y-6">
      <SettingsCustomFields
        fields={contactCustomFields}
        entity={CUSTOM_FIELD_ENTITY.CONTACT}
        title="Campos customizados (contatos)"
        description="Definições por tenant. Valores ficam em cada contato (ficha) e no card da oportunidade. Chave técnica única por tenant (slug)."
        listLabel="Campos de contato"
        newFieldTitle="Novo campo (contato)"
        idPrefix="cf-contact"
      />
      <SettingsCustomFields
        fields={dealCustomFields}
        entity={CUSTOM_FIELD_ENTITY.DEAL}
        title="Campos customizados (oportunidades)"
        description="Valores ficam só nesta oportunidade (modal do pipeline). Mesma regra de chave única por tenant."
        listLabel="Campos de oportunidade"
        newFieldTitle="Novo campo (oportunidade)"
        idPrefix="cf-deal"
      />
    </div>
  );
}
