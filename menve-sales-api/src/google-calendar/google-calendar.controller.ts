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

  @Get("calendar/google/status")
  googleStatus(@ReqUser() u: RequestUser) {
    return this.googleCalendar.getConnectionStatus(u.userId);
  }

  @Get("calendar/google/connect-url")
  googleConnectUrl(@ReqUser() u: RequestUser) {
    return { url: this.googleCalendar.getAuthRedirectUrl(u.userId) };
  }

  @Post("calendar/events")
  createEvent(
    @ReqUser() u: RequestUser,
    @Body()
    body: {
      title?: string;
      description?: string;
      dueAt?: string;
      durationMinutes?: number;
      attendees?: string[];
      createMeet?: boolean;
      createGoogleMeet?: boolean;
      contactId?: string;
      dealId?: string;
      type?: string;
    },
  ) {
    const createMeet =
      body.createGoogleMeet ?? body.createMeet ?? true;
    return this.googleCalendar.createMeetingForTenant({
      tenantId: u.tenantId,
      userId: u.userId,
      title: body.title ?? "Reunião",
      description: body.description,
      dueAt: body.dueAt ?? new Date().toISOString(),
      durationMinutes: body.durationMinutes,
      contactId: body.contactId,
      dealId: body.dealId,
      createGoogleMeet: createMeet,
    });
  }
}
