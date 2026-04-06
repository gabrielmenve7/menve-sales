import { BadRequestException } from "@nestjs/common";

export const MAX_PROFILE_IMAGE_CHARS = 600_000;

/** URL https ou data URL de imagem (JPEG, PNG, WebP, GIF). */
export function assertValidProfileImage(image: string): string {
  const t = image.trim();
  if (t.length > MAX_PROFILE_IMAGE_CHARS) {
    throw new BadRequestException("Imagem muito grande");
  }
  if (/^https?:\/\//i.test(t)) {
    try {
      // eslint-disable-next-line no-new
      new URL(t);
    } catch {
      throw new BadRequestException("URL da imagem inválida");
    }
    return t;
  }
  if (/^data:image\/(jpeg|jpg|png|webp|gif);base64,/i.test(t)) {
    return t;
  }
  throw new BadRequestException(
    "Use uma URL https ou uma imagem (JPEG, PNG, WebP ou GIF)",
  );
}
