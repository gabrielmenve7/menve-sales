/** Códigos lançados pelo provider Credentials em `auth.ts` (Auth.js / NextAuth). */
export const AUTH_CREDENTIAL_CODE = {
  INVALID_CREDENTIALS: "invalid_credentials",
  API_UNREACHABLE: "auth_api_unreachable",
  AUTH_SERVICE_ERROR: "auth_service_error",
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
      return "O servidor de autenticação retornou um erro. Tente novamente em instantes.";
    case AUTH_CREDENTIAL_CODE.INVALID_AUTH_RESPONSE:
      return "Resposta inválida do servidor de autenticação. Contate o suporte.";
    case AUTH_CREDENTIAL_CODE.SESSION_INVALID:
      return "Sessão não pôde ser criada. Tente entrar com e-mail e senha.";
    default:
      return "Não foi possível entrar. Tente novamente ou verifique sua conexão.";
  }
}
