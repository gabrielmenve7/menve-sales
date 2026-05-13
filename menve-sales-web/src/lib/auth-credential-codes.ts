/** Códigos lançados pelo provider Credentials em `auth.ts` (Auth.js / NextAuth). */
export const AUTH_CREDENTIAL_CODE = {
  INVALID_CREDENTIALS: "invalid_credentials",
  API_UNREACHABLE: "auth_api_unreachable",
  AUTH_SERVICE_ERROR: "auth_service_error",
  /** POST /auth/login ou GET /auth/me retornou 404 — URL base provavelmente não é a API Nest. */
  AUTH_API_NOT_FOUND: "auth_api_not_found",
  /** API respondeu 5xx (erro interno: Prisma, JWT, exceção não tratada). */
  AUTH_API_SERVER_ERROR: "auth_api_server_error",
  /** API respondeu 429 (limite de requisições). */
  AUTH_RATE_LIMITED: "auth_rate_limited",
  INVALID_AUTH_RESPONSE: "invalid_auth_response",
  /** Bearer em /auth/me inválido ou recusado (ex.: após cadastro). */
  SESSION_INVALID: "session_invalid",
} as const;

export type AuthCredentialCode =
  (typeof AUTH_CREDENTIAL_CODE)[keyof typeof AUTH_CREDENTIAL_CODE];

export function messageForCredentialsSignIn(code: string | undefined): string {
  switch (code) {
    case AUTH_CREDENTIAL_CODE.INVALID_CREDENTIALS:
      return "E-mail ou senha incorretos.";
    case AUTH_CREDENTIAL_CODE.API_UNREACHABLE:
      return "Não foi possível conectar ao servidor de autenticação. Verifique se a API está no ar e se INTERNAL_API_URL está correto.";
    case AUTH_CREDENTIAL_CODE.AUTH_SERVICE_ERROR:
      return "O servidor de autenticação recusou o pedido (não é senha incorreta). Confira INTERNAL_API_URL na Vercel e os logs do servidor (status HTTP nos logs [menve/auth]).";
    case AUTH_CREDENTIAL_CODE.AUTH_API_NOT_FOUND:
      return "A URL da API não expõe /auth/login (HTTP 404). Na Vercel, INTERNAL_API_URL deve ser a base HTTPS da API Nest (Railway), não o domínio do site (crm…). Ex.: https://seu-servico.up.railway.app sem barra no final.";
    case AUTH_CREDENTIAL_CODE.AUTH_API_SERVER_ERROR:
      return "A API de autenticação falhou por erro interno (HTTP 5xx). Abra os logs do serviço da API (Railway): costuma ser banco inacessível, migração pendente ou exceção no login. Confira DATABASE_URL e JWT_SECRET na API.";
    case AUTH_CREDENTIAL_CODE.AUTH_RATE_LIMITED:
      return "Muitas tentativas de login. Aguarde alguns minutos e tente de novo.";
    case AUTH_CREDENTIAL_CODE.INVALID_AUTH_RESPONSE:
      return "Resposta inválida do servidor de autenticação. Contate o suporte.";
    case AUTH_CREDENTIAL_CODE.SESSION_INVALID:
      return "Sessão não pôde ser criada. Tente entrar com e-mail e senha.";
    default:
      return "Não foi possível entrar. Tente novamente ou verifique sua conexão.";
  }
}
