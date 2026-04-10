import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { AuthService } from "./auth.service";
import { AuthController } from "./auth.controller";
import { WorkspacesModule } from "../workspaces/workspaces.module";

const jwtSecret =
  process.env.NODE_ENV === "production"
    ? (process.env.JWT_SECRET?.trim() ?? "")
    : (process.env.JWT_SECRET?.trim() || "dev-jwt-secret-change-in-production");

@Module({
  imports: [
    WorkspacesModule,
    JwtModule.register({
      global: true,
      secret: jwtSecret,
      signOptions: { expiresIn: "7d" },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
