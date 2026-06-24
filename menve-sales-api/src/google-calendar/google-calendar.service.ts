import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { createHmac, randomBytes } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";

type GoogleTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
};

type CalendarEventResponse = {
  id: string;
  htmlLink?: string;
  hangoutLink?: string;
  conferenceData?: {
    entryPoints?: { entryPointType?: string; uri?: string }[];
  };
};

function googleEnv() {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  const redirectUri = process.env.GOOGLE_REDIRECT_URI?.trim();
  if (!clientId || !clientSecret || !redirectUri) {
    throw new BadRequestException(
      "Google Calendar não configurado (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI)",
    );
  }
  return { clientId, clientSecret, redirectUri };
}

function stateSecret() {
  return (
    process.env.GOOGLE_OAUTH_STATE_SECRET?.trim() ||
    process.env.INTERNAL_API_KEY?.trim() ||
    "menve-google-oauth-state"
  );
}

function signState(userId: string) {
  const nonce = randomBytes(8).toString("hex");
  const payload = `${userId}.${nonce}.${Date.now()}`;
  const sig = createHmac("sha256", stateSecret())
    .update(payload)
    .digest("base64url");
  return Buffer.from(`${payload}.${sig}`).toString("base64url");
}

function verifyState(state: string): string {
  let decoded: string;
  try {
    decoded = Buffer.from(state, "base64url").toString("utf8");
  } catch {
    throw new UnauthorizedException("State OAuth inválido");
  }
  const parts = decoded.split(".");
  if (parts.length !== 4) throw new UnauthorizedException("State OAuth inválido");
  const [userId, nonce, ts, sig] = parts;
  const payload = `${userId}.${nonce}.${ts}`;
  const expected = createHmac("sha256", stateSecret())
    .update(payload)
    .digest("base64url");
  if (sig !== expected) throw new UnauthorizedException("State OAuth inválido");
  const age = Date.now() - Number(ts);
  if (!Number.isFinite(age) || age > 15 * 60 * 1000) {
    throw new UnauthorizedException("State OAuth expirado");
  }
  return userId;
}

@Injectable()
export class GoogleCalendarService {
  constructor(private readonly prisma: PrismaService) {}

  getAuthRedirectUrl(userId: string): string {
    const { clientId, redirectUri } = googleEnv();
    const state = signState(userId);
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: CALENDAR_SCOPE,
      access_type: "offline",
      prompt: "consent",
      state,
    });
    return `${GOOGLE_AUTH_URL}?${params.toString()}`;
  }

  async handleOAuthCallback(code: string, state: string) {
    const userId = verifyState(state);
    const { clientId, clientSecret, redirectUri } = googleEnv();

    const res = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      throw new BadRequestException(`Falha ao trocar código Google: ${t}`);
    }
    const tokens = (await res.json()) as GoogleTokenResponse;
    if (!tokens.refresh_token) {
      throw new BadRequestException(
        "Google não retornou refresh_token; revogue o acesso e tente novamente com prompt=consent",
      );
    }

    await this.prisma.userGoogleCalendar.upsert({
      where: { userId },
      create: {
        userId,
        refreshToken: tokens.refresh_token,
        calendarId: "primary",
      },
      update: {
        refreshToken: tokens.refresh_token,
        connectedAt: new Date(),
      },
    });

    return { ok: true as const, userId };
  }

  private async getAccessToken(userId: string): Promise<string> {
    const row = await this.prisma.userGoogleCalendar.findUnique({
      where: { userId },
    });
    if (!row) {
      throw new NotFoundException("Google Calendar não conectado para este usuário");
    }
    const { clientId, clientSecret } = googleEnv();
    const res = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: row.refreshToken,
        grant_type: "refresh_token",
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      throw new BadRequestException(`Falha ao renovar token Google: ${t}`);
    }
    const tokens = (await res.json()) as GoogleTokenResponse;
    return tokens.access_token;
  }

  async createEvent(
    userId: string,
    body: {
      title: string;
      dueAt: string;
      attendees?: string[];
      createMeet?: boolean;
    },
  ) {
    const accessToken = await this.getAccessToken(userId);
    const row = await this.prisma.userGoogleCalendar.findUnique({
      where: { userId },
    });
    const calendarId = row?.calendarId ?? "primary";
    const start = new Date(body.dueAt);
    if (Number.isNaN(start.getTime())) {
      throw new BadRequestException("dueAt inválido");
    }
    const end = new Date(start.getTime() + 60 * 60 * 1000);

    const eventPayload: Record<string, unknown> = {
      summary: body.title,
      start: { dateTime: start.toISOString() },
      end: { dateTime: end.toISOString() },
    };

    const attendees = (body.attendees ?? [])
      .map((e) => e.trim())
      .filter((e) => e.includes("@"));
    if (attendees.length > 0) {
      eventPayload.attendees = attendees.map((email) => ({ email }));
    }

    if (body.createMeet !== false) {
      eventPayload.conferenceData = {
        createRequest: {
          requestId: randomBytes(8).toString("hex"),
          conferenceSolutionKey: { type: "hangoutsMeet" },
        },
      };
    }

    const url = new URL(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
    );
    if (body.createMeet !== false) {
      url.searchParams.set("conferenceDataVersion", "1");
    }

    const res = await fetch(url.toString(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(eventPayload),
    });
    if (!res.ok) {
      const t = await res.text();
      throw new BadRequestException(`Falha ao criar evento: ${t}`);
    }
    const created = (await res.json()) as CalendarEventResponse;
    const meetLink =
      created.hangoutLink ??
      created.conferenceData?.entryPoints?.find(
        (e) => e.entryPointType === "video",
      )?.uri ??
      null;

    return {
      id: created.id,
      htmlLink: created.htmlLink ?? null,
      meetLink,
    };
  }
}
