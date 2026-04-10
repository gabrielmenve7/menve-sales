declare global {
  namespace Express {
    interface Request {
      /** Corpo bruto JSON (apenas POST /webhooks/whatsapp/meta) para validar assinatura Meta. */
      rawBody?: Buffer;
    }
  }
}

export {};
