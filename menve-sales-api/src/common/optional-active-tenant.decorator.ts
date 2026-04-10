import { SetMetadata } from "@nestjs/common";

/** JWT válido sem tenant ativo (onboarding). Só use em rotas que não consultam dados por tenant. */
export const OPTIONAL_ACTIVE_TENANT_KEY = "optionalActiveTenant";

export const OptionalActiveTenant = () =>
  SetMetadata(OPTIONAL_ACTIVE_TENANT_KEY, true);
