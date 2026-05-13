import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { AuthService } from "./auth.service";
import { AuthController } from "./auth.controller";
import { WorkspacesModule } from "../workspaces/workspaces.module";

@Module({
  imports: [
    WorkspacesModule,
    JwtModule.registerAsync({
      global: true,
      useFactory: () => {
        const fromEnv = process.env.JWT_SECRET?.trim();
        if (process.env.NODE_ENV === "production") {
          if (!fromEnv) {
            throw new Error(
              "JWT_SECRET é obrigatório em produção. Sem ele a API não consegue emitir tokens e o login falha.",
            );
          }
          return {
            secret: fromEnv,
            signOptions: { expiresIn: "7d" } as const,
          };
        }
        return {
          secret: fromEnv || "dev-jwt-secret-change-in-production",
          signOptions: { expiresIn: "7d" } as const,
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
