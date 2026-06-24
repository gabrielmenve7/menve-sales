import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Res,
} from "@nestjs/common";
import type { Response } from "express";
import { Public } from "../common/public.decorator";
import { ReqUser } from "../common/req-user.decorator";
import type { RequestUser } from "../common/request-user";
import { GoogleCalendarService } from "./google-calendar.service";

@Controller()
export class GoogleCalendarController {
  constructor(private readonly googleCalendar: GoogleCalendarService) {}

  @Get("auth/google")
  authGoogle(@ReqUser() u: RequestUser, @Res() res: Response) {
    const url = this.googleCalendar.getAuthRedirectUrl(u.userId);
    return res.redirect(url);
  }

  @Public()
  @Get("auth/google/callback")
  async authGoogleCallback(
    @Query("code") code: string,
    @Query("state") state: string,
    @Res() res: Response,
  ) {
    await this.googleCalendar.handleOAuthCallback(code ?? "", state ?? "");
    const web =
      process.env.PUBLIC_WEB_URL?.replace(/\/$/, "") ??
      process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ??
      "http://localhost:3000";
    return res.redirect(`${web}/settings?googleCalendar=connected`);
  }

  @Post("calendar/events")
  createEvent(
    @ReqUser() u: RequestUser,
    @Body()
    body: {
      title?: string;
      dueAt?: string;
      attendees?: string[];
      createMeet?: boolean;
    },
  ) {
    return this.googleCalendar.createEvent(u.userId, {
      title: body.title ?? "Reunião",
      dueAt: body.dueAt ?? new Date().toISOString(),
      attendees: body.attendees,
      createMeet: body.createMeet,
    });
  }
}
