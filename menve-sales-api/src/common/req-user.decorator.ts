import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { RequestUser } from "./request-user";

export const ReqUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestUser => {
    const req = ctx.switchToHttp().getRequest();
    return req.user as RequestUser;
  },
);
