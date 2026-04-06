import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../prisma/prisma.service";
import { UserRole } from "@prisma/client";

const MAX_IMAGE_CHARS = 600_000;
const MAX_NAME_LEN = 120;

function assertValidProfileImage(image: string) {
  const t = image.trim();
  if (t.length > MAX_IMAGE_CHARS) {
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

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async validateCredentials(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user?.passwordHash) return null;
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return null;
    return user;
  }

  async login(email: string, password: string) {
    const user = await this.validateCredentials(email, password);
    if (!user) throw new UnauthorizedException("Credenciais inválidas");
    const payload = {
      sub: user.id,
      role: user.role as UserRole,
      tenantId: user.tenantId,
    };
    const accessToken = await this.jwt.signAsync(payload);
    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        image: user.image,
        role: user.role,
        tenantId: user.tenantId,
      },
    };
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        image: true,
        role: true,
        tenantId: true,
      },
    });
    if (!user) throw new UnauthorizedException();
    return user;
  }

  async updateProfile(
    userId: string,
    body: { name?: string; image?: string | null },
  ) {
    const data: { name?: string; image?: string | null } = {};

    if (body.name !== undefined) {
      const n = body.name.trim();
      if (!n) {
        throw new BadRequestException("Nome não pode ser vazio");
      }
      if (n.length > MAX_NAME_LEN) {
        throw new BadRequestException("Nome muito longo");
      }
      data.name = n;
    }

    if (body.image !== undefined) {
      if (body.image === null || body.image === "") {
        data.image = null;
      } else {
        data.image = assertValidProfileImage(body.image);
      }
    }

    if (Object.keys(data).length === 0) {
      return this.getMe(userId);
    }

    await this.prisma.user.update({
      where: { id: userId },
      data,
    });
    return this.getMe(userId);
  }
}
