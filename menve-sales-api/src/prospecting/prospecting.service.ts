import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  Prisma,
  ProspectSearchStatus,
  ProspectSource,
  ProspectStatus,
} from "@prisma/client";
import { z } from "zod";
import { PrismaService } from "../prisma/prisma.service";
import { ProspectListsService } from "../prospect-lists/prospect-lists.service";
import { resolveBrazilianPhoneFromCandidates } from "./phone-utils";
import { sanitizeMapsResults } from "./business-result-filter";
import { buildProspectQuery } from "./prospect-query";
import { normalizeAndDeduplicate } from "./prospect-normalize";
import { searchMapsAllPages } from "./serpapi-maps";
import { scrapeWebsite } from "./website-scraper";

const engineSchema = z.enum(["maps", "search"]);

const structuredSearchBody = z.object({
  segment: z.string().min(3).max(200),
  state: z.string().min(2).max(2),
  city: z.string().min(2).max(120),
  engines: z.array(engineSchema).optional(),
});

const legacySearchBody = z.object({
  query: z.string().min(3).max(200),
});

const searchBody = z.union([structuredSearchBody, legacySearchBody]);

const patchResultSchema = z.object({
  status: z.nativeEnum(ProspectStatus).optional(),
  notes: z.string().max(5000).optional(),
});

const convertBodySchema = z.object({
  pipelineId: z.string().optional(),
  title: z.string().optional(),
  value: z.number().optional(),
  /** Número exibido na Pesquisa (prioridade na resolução do telefone do contato). */
  phoneOverride: z.string().max(80).optional(),
});

const bulkConvertSchema = z.object({
  resultIds: z.array(z.string()).min(1).max(50),
  pipelineId: z.string().optional(),
});

@Injectable()
export class ProspectingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly prospectLists: ProspectListsService,
  ) {}

  private async ensureResearchEnabled(tenantId: string) {
    const t = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { researchEnabled: true },
    });
    if (!t?.researchEnabled) {
      throw new ForbiddenException(
        "Pesquisa desativada para este workspace",
      );
    }
  }

  private serpApiKey(): string | null {
    const k = process.env.SERPAPI_API_KEY?.trim();
    return k || null;
  }

  async ensureProspectingSource(tenantId: string) {
    let s = await this.prisma.campaignSource.findFirst({
      where: { tenantId, code: "prospecting" },
    });
    if (!s) {
      s = await this.prisma.campaignSource.create({
        data: {
          tenantId,
          name: "Prospecção Ativa",
          code: "prospecting",
        },
      });
    }
    return s;
  }

  async getStats(tenantId: string) {
    await this.ensureResearchEnabled(tenantId);
    const [searches, companies, qualified] = await Promise.all([
      this.prisma.prospectSearch.count({ where: { tenantId } }),
      this.prisma.prospectResult.count({ where: { tenantId } }),
      this.prisma.prospectResult.count({
        where: { tenantId, hasWebsite: true },
      }),
    ]);
    return { searches, companies, qualified };
  }

  private countQualified(results: { hasWebsite: boolean }[]): number {
    return results.filter((r) => r.hasWebsite).length;
  }

  private async syncSearchAggregates(
    searchId: string,
    status?: ProspectSearchStatus,
  ) {
    const results = await this.prisma.prospectResult.findMany({
      where: { searchId },
      select: { hasWebsite: true, enrichedAt: true, website: true },
    });
    const totalCount = results.length;
    const qualifiedCount = this.countQualified(results);
    const totalWithSite = results.filter(
      (r) => r.hasWebsite && r.website,
    ).length;
    const enrichedCount = results.filter((r) => r.enrichedAt != null).length;
    const isComplete =
      totalWithSite === 0 || enrichedCount >= totalWithSite;

    let nextStatus = status;
    if (nextStatus == null) {
      nextStatus = isComplete
        ? ProspectSearchStatus.DONE
        : ProspectSearchStatus.ENRICHING;
    }

    return this.prisma.prospectSearch.update({
      where: { id: searchId },
      data: {
        totalCount,
        qualifiedCount,
        status: nextStatus,
      },
    });
  }

  async search(tenantId: string, userId: string, raw: unknown) {
    await this.ensureResearchEnabled(tenantId);

    let parsed: z.infer<typeof searchBody>;
    try {
      parsed = searchBody.parse(raw);
    } catch (e) {
      if (e instanceof z.ZodError) {
        throw new BadRequestException(
          e.errors[0]?.message ?? "Dados de captura inválidos",
        );
      }
      throw e;
    }

    const key = this.serpApiKey();
    if (!key) {
      throw new BadRequestException(
        "SERPAPI_API_KEY não configurada na API. Adicione a chave do SerpApi nas variáveis de ambiente do serviço da API (Railway).",
      );
    }

    let query: string;
    let segment: string | null = null;
    let state: string | null = null;
    let city: string | null = null;
    const engines = ["maps"];

    if ("query" in parsed) {
      query = parsed.query;
      segment = parsed.query;
    } else {
      segment = parsed.segment.trim();
      state = parsed.state.trim().toUpperCase();
      city = parsed.city.trim();
      query = buildProspectQuery(segment, city, state);
    }

    const searchRow = await this.prisma.prospectSearch.create({
      data: {
        tenantId,
        userId,
        query,
        segment,
        state,
        city,
        engines,
        status: ProspectSearchStatus.RUNNING,
        lastWebPageFetched: 1,
        webExhausted: true,
      },
    });

    try {
      const mapsRaw = await searchMapsAllPages(
        query,
        { city, state },
        key,
      );
      const maps = sanitizeMapsResults(mapsRaw);
      const { prospects, mapsCount } = normalizeAndDeduplicate([], maps);

      const qualifiedCount = this.countQualified(prospects);

      await this.prisma.prospectSearch.update({
        where: { id: searchRow.id },
        data: {
          webCount: 0,
          mapsCount,
          totalCount: prospects.length,
          qualifiedCount,
          status: ProspectSearchStatus.DONE,
        },
      });

      if (prospects.length > 0) {
        await this.prisma.prospectResult.createMany({
          data: prospects.map((p) => ({
            tenantId,
            searchId: searchRow.id,
            source: p.source,
            position: p.position,
            name: p.name,
            website: p.website,
            hasWebsite: p.hasWebsite,
            phone: p.phone,
            address: p.address,
            snippet: p.snippet,
            rating: p.rating,
            reviewCount: p.reviewCount,
            googleMapsUrl: p.googleMapsUrl,
            enrichmentData: p.foundInBothSources
              ? ({ foundInBothSources: true } as Prisma.InputJsonValue)
              : undefined,
          })),
        });
      }

      const results = await this.prisma.prospectResult.findMany({
        where: { searchId: searchRow.id },
        orderBy: { createdAt: "asc" },
      });

      if (results.length > 0) {
        await this.prospectLists.addResultsToPrimaryList(
          tenantId,
          userId,
          results.map((r) => r.id),
        );
      }

      const search = await this.prisma.prospectSearch.findUniqueOrThrow({
        where: { id: searchRow.id },
      });

      return { search, results };
    } catch (e) {
      const message =
        e instanceof BadRequestException
          ? String(e.message)
          : e instanceof Error
            ? e.message
            : "Falha na busca SerpApi";
      await this.prisma.prospectSearch.update({
        where: { id: searchRow.id },
        data: {
          status: ProspectSearchStatus.ERROR,
          errorMessage: message,
        },
      });
      throw new BadRequestException(
        message.startsWith("SerpApi")
          ? `Falha ao consultar o Google (SerpApi): ${message}`
          : message,
      );
    }
  }

  async processEnrichmentChunk(
    tenantId: string,
    searchId: string,
    batchSize = 5,
  ) {
    const pending = await this.prisma.prospectResult.findMany({
      where: {
        tenantId,
        searchId,
        hasWebsite: true,
        website: { not: null },
        enrichedAt: null,
      },
      orderBy: [
        { source: "asc" },
        { phone: "asc" },
        { createdAt: "asc" },
      ],
    });

    // Prioriza rede de pesquisa sem telefone (diferencial do enriquecimento)
    pending.sort((a, b) => {
      const score = (r: typeof a) => {
        let s = 0;
        if (r.source === ProspectSource.GOOGLE_SEARCH) s += 2;
        if (!r.phone) s += 1;
        return s;
      };
      return score(b) - score(a);
    });

    const batch = pending.slice(0, batchSize);

    for (const r of batch) {
      const url = r.website!;
      const prev =
        (r.enrichmentData as Record<string, unknown> | null) ?? {};
      try {
        const scraped = await scrapeWebsite(url);
        const enrichmentData: Prisma.InputJsonValue = {
          ...prev,
          phones: scraped.phones,
          emails: scraped.emails,
          social: scraped.social,
          metaDescription: scraped.metaDescription,
          hasContactForm: scraped.hasContactForm,
          scrapeOk: true,
        };
        await this.prisma.prospectResult.update({
          where: { id: r.id },
          data: {
            enrichedAt: new Date(),
            whatsapp: scraped.whatsapp,
            email: scraped.emails[0] ?? undefined,
            phone: r.phone ?? scraped.phones[0] ?? undefined,
            enrichmentData,
          },
        });
      } catch {
        await this.prisma.prospectResult.update({
          where: { id: r.id },
          data: {
            enrichedAt: new Date(),
            enrichmentData: {
              ...prev,
              scrapeError: true,
            } as Prisma.InputJsonValue,
          },
        });
      }
    }
  }

  async listSearches(tenantId: string) {
    await this.ensureResearchEnabled(tenantId);
    return this.prisma.prospectSearch.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        user: { select: { name: true, email: true } },
      },
    });
  }

  async getSearchStatus(tenantId: string, searchId: string) {
    await this.ensureResearchEnabled(tenantId);
    const search = await this.prisma.prospectSearch.findFirst({
      where: { id: searchId, tenantId },
    });
    if (!search) throw new NotFoundException();

    const mapsOnly = !search.engines.includes("search");

    if (
      search.status === ProspectSearchStatus.ENRICHING &&
      !mapsOnly
    ) {
      await this.processEnrichmentChunk(tenantId, searchId, 5);
    }

    const results = await this.prisma.prospectResult.findMany({
      where: { searchId },
      orderBy: [
        { hasWebsite: "desc" },
        { reviewCount: "desc" },
        { createdAt: "asc" },
      ],
    });

    const outreachStatuses =
      await this.prospectLists.resolveOutreachStatusForResults(
        tenantId,
        results,
      );
    const resultsWithOutreach = results.map((r, i) => ({
      ...r,
      outreachStatus: outreachStatuses[i] ?? null,
    }));

    const totalWithSite = results.filter(
      (r) => r.hasWebsite && r.website,
    ).length;
    const enrichedCount = results.filter((r) => r.enrichedAt != null).length;
    const isComplete =
      mapsOnly || totalWithSite === 0 || enrichedCount >= totalWithSite;

    const updatedSearch = await this.syncSearchAggregates(
      searchId,
      isComplete ? ProspectSearchStatus.DONE : ProspectSearchStatus.ENRICHING,
    );

    return {
      search: updatedSearch,
      results: resultsWithOutreach,
      totalWithSite,
      enrichedCount,
      isComplete,
    };
  }

  async patchResult(tenantId: string, resultId: string, raw: unknown) {
    await this.ensureResearchEnabled(tenantId);
    const data = patchResultSchema.parse(raw);
    const r = await this.prisma.prospectResult.findFirst({
      where: { id: resultId, tenantId },
    });
    if (!r) throw new NotFoundException();
    return this.prisma.prospectResult.update({
      where: { id: resultId },
      data: {
        ...(data.status != null ? { status: data.status } : {}),
        ...(data.notes !== undefined ? { notes: data.notes } : {}),
      },
    });
  }

  async deleteSearch(tenantId: string, searchId: string) {
    await this.ensureResearchEnabled(tenantId);
    const s = await this.prisma.prospectSearch.findFirst({
      where: { id: searchId, tenantId },
    });
    if (!s) throw new NotFoundException();
    await this.prisma.prospectSearch.delete({ where: { id: searchId } });
    return { ok: true };
  }

  /** Usuário do workspace que pode ser responsável por deal (mesma regra do PATCH /deals). */
  private async assigneeUserIdForTenant(
    tenantId: string,
    userId: string,
  ): Promise<string | null> {
    const u = await this.prisma.user.findFirst({
      where: { id: userId, tenantId },
      select: { id: true },
    });
    return u?.id ?? null;
  }

  async convertResult(
    tenantId: string,
    actorUserId: string,
    resultId: string,
    raw: unknown,
  ): Promise<
    | { ok: true; contactId: string }
    | {
        ok: false;
        duplicate: true;
        contactId: string;
        message: string;
      }
  > {
    await this.ensureResearchEnabled(tenantId);
    const data = convertBodySchema.parse(raw);
    const result = await this.prisma.prospectResult.findFirst({
      where: { id: resultId, tenantId },
    });
    if (!result) throw new NotFoundException();
    if (result.status === ProspectStatus.CONVERTED) {
      throw new BadRequestException("Resultado já convertido");
    }

    const enrichment =
      (result.enrichmentData as Record<string, unknown> | null) ?? null;
    const scrapedPhones: string[] = [];
    const phonesRaw = enrichment?.phones;
    if (Array.isArray(phonesRaw)) {
      for (const p of phonesRaw) {
        if (typeof p === "string" && p.trim()) scrapedPhones.push(p.trim());
      }
    }
    const enrichWa =
      typeof enrichment?.whatsapp === "string"
        ? enrichment.whatsapp.trim()
        : "";

    const candidates: (string | null | undefined)[] = [
      data.phoneOverride?.trim(),
      result.whatsapp,
      result.phone,
      enrichWa || undefined,
      ...scrapedPhones,
    ];

    const phone = resolveBrazilianPhoneFromCandidates(candidates);

    if (phone) {
      const dup = await this.prisma.contact.findFirst({
        where: { tenantId, phone },
      });
      if (dup) {
        return {
          ok: false,
          duplicate: true,
          contactId: dup.id,
          message: "Já existe contato com este telefone",
        };
      }
    }

    const campaign = await this.ensureProspectingSource(tenantId);
    const utmMedium =
      result.source === ProspectSource.GOOGLE_MAPS
        ? "google_maps"
        : "google_search";

    const customData: Prisma.InputJsonValue = {
      website: result.website,
      googleRating: result.rating,
      reviewCount: result.reviewCount,
      address: result.address,
      googleMapsUrl: result.googleMapsUrl,
      snippet: result.snippet,
    };

    const contact = await this.prisma.contact.create({
      data: {
        tenantId,
        name: result.name,
        phone,
        email: result.email?.trim() || null,
        company: result.name,
        utmSource: "prospecting",
        utmMedium,
        campaignSourceId: campaign.id,
        customData,
      },
    });

    const title =
      data.title?.trim() && data.title.trim().length > 0
        ? data.title.trim()
        : `Prospecção: ${result.name}`;

    void title;

    await this.prisma.prospectResult.update({
      where: { id: resultId },
      data: {
        status: ProspectStatus.CONVERTED,
        contactId: contact.id,
      },
    });

    return { ok: true, contactId: contact.id };
  }

  async convertBulk(tenantId: string, actorUserId: string, raw: unknown) {
    await this.ensureResearchEnabled(tenantId);
    const data = bulkConvertSchema.parse(raw);
    let converted = 0;
    let skippedDuplicate = 0;
    const errors: string[] = [];

    for (const id of data.resultIds) {
      try {
        const r = await this.convertResult(tenantId, actorUserId, id, {
          pipelineId: data.pipelineId,
        });
        if (r.ok) converted++;
        else if ("duplicate" in r && r.duplicate) skippedDuplicate++;
      } catch (e) {
        errors.push(
          id + ": " + (e instanceof Error ? e.message : "erro"),
        );
      }
    }

    return { converted, skippedDuplicate, errors };
  }
}
