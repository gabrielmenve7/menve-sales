import "./load-env";
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { json, urlencoded } from "express";
import { AppModule } from "./app.module";

/** Limite do body parser (webhooks Evolution/WhatsApp podem enviar payloads > 100kb). */
const BODY_LIMIT = process.env.BODY_JSON_LIMIT ?? "10mb";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.use(json({ limit: BODY_LIMIT }));
  app.use(urlencoded({ extended: true, limit: BODY_LIMIT }));
  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(",").map((s) => s.trim()) ?? true,
    credentials: true,
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "x-api-key",
      "x-user-id",
      "x-tenant-id",
    ],
  });
  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port, "0.0.0.0");
  // eslint-disable-next-line no-console
  console.log(`Menve API listening on http://0.0.0.0:${port}`);
}

bootstrap();
