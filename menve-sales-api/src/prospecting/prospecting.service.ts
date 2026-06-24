import {
  BadRequestException,
  ForbiddenException,
  forwardRef,
  Inject,
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
import { DealsService } from "../deals/deals.service";
import { PrismaService } from "../prisma/prisma.service";
import { resolveBrazilianPhoneFromCandidates } from "./phone-utils";
import {
  filterBusinessWebResults,
  sanitizeMapsResults,
} from "./business-result-filter";
import { buildProspectQuery } from "./prospect-query";
import {
  baseDomain,
  normalizeAndDeduplicate,
  searchMaps,
  searchWeb,
  SERPER_WEB_RESULTS_PER_REQUEST,
} from "./serper";
import { scrapeWebsite } from "./website-scraper";

const engineSchema = z.enum(["maps", "search"]);

const structuredSearchBody = z.object({
  segment: z.string().min(3).max(200),
  state: z.string().min(2).max(2),
  city: z.string().min(2).max(120),
  engines: z.array(engineSchema).min(1).max(2),
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
  pipelineId: z.string(),
  title: z.string().optional(),
  value: z.number().optional(),
  /** Número exibido na Pesquisa (prioridade na resolução do telefone do contato). */
  phoneOverride: z.string().max(80).optional(),
});

const bulkConvertSchema = z.object({
  resultIds: z.array(z.string()).min(1).max(50),
  pipelineId: z.string(),
});

@Injectable()
export class ProspectingService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => DealsService))
    private readonly dealsService: DealsService,
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

  private serperKey(): string | null {
    const k = process.env.SERPER_API_KEY?.trim();
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
    const parsed = searchBody.parse(raw);
    const key = this.serperKey();
    if (!key) {
      throw new BadRequestException(
        "SERPER_API_KEY não configurada na API",
      );
    }

    let query: string;
    let segment: string | null = null;
    let state: string | null = null;
    let city: string | null = null;
    let engines: string[] = ["maps", "search"];

    if ("query" in parsed) {
      query = parsed.query;
      segment = parsed.query;
    } else {
      segment = parsed.segment.trim();
      state = parsed.state.trim().toUpperCase();
      city = parsed.city.trim();
      engines = [...new Set(parsed.engines)];
      query = buildProspectQuery(segment, city, state);
    }

    const useMaps = engines.includes("maps");
    const useSearch = engines.includes("search");

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
        webExhausted: !useSearch,
      },
    });

    try {
      const [webRaw, mapsRaw] = await Promise.all([
        useSearch
          ? searchWeb(query, key, {
              page: 1,
              num: SERPER_WEB_RESULTS_PER_REQUEST,
            })
          : Promise.resolve([]),
        useMaps ? searchMaps(query, key) : Promise.resolve([]),
      ]);
      const web = filterBusinessWebResults(webRaw);
      const maps = sanitizeMapsResults(mapsRaw);
      const { prospects, webCount, mapsCount } = normalizeAndDeduplicate(
        web,
        maps,
      );

      const qualifiedCount = this.countQualified(prospects);
      const needsEnrichment = prospects.some(
        (p) => p.hasWebsite && p.website,
      );

      await this.prisma.prospectSearch.update({
        where: { id: searchRow.id },
        data: {
          webCount,
          mapsCount,
          totalCount: prospects.length,
          qualifiedCount,
          status: needsEnrichment
            ? ProspectSearchStatus.ENRICHING
            : ProspectSearchStatus.DONE,
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

      const search = await this.prisma.prospectSearch.findUniqueOrThrow({
        where: { id: searchRow.id },
      });

      return { search, results };
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Falha na busca Serper";
      await this.prisma.prospectSearch.update({
        where: { id: searchRow.id },
        data: {
          status: ProspectSearchStatus.ERROR,
          errorMessage: message,
        },
      });
      throw e;
    }
  }

  /**
   * Próxima página da busca orgânica (Serper `page`), deduplicada contra resultados já salvos.
   * Maps não é refeito (evita duplicar créditos e a 1ª leva já cobre a região).
   */
  async loadMoreWeb(
    tenantId: string,
    searchId: string,
  ): Promise<{ added: number; exhausted: boolean; totalCount: number }> {
    await this.ensureResearchEnabled(tenantId);
    const search = await this.prisma.prospectSearch.findFirst({
      where: { id: searchId, tenantId },
    });
    if (!search) throw new NotFoundException();
    if (!search.engines.includes("search")) {
      throw new BadRequestException(
        "Esta busca não incluiu a rede de pesquisa.",
      );
    }
    if (search.webExhausted) {
      throw new BadRequestException(
        "Não há mais páginas de resultado web para esta busca.",
      );
    }

    const key = this.serperKey();
    if (!key) {
      throw new BadRequestException(
        "SERPER_API_KEY não configurada na API",
      );
    }

    const nextPage = search.lastWebPageFetched + 1;
    const webRaw = await searchWeb(search.query, key, {
      page: nextPage,
      num: SERPER_WEB_RESULTS_PER_REQUEST,
    });

    await this.prisma.prospectSearch.update({
      where: { id: searchId },
      data: { lastWebPageFetched: nextPage },
    });

    if (webRaw.length === 0) {
      await this.prisma.prospectSearch.update({
        where: { id: searchId },
        data: { webExhausted: true },
      });
      const totalCount = await this.prisma.prospectResult.count({
        where: { searchId },
      });
      await this.syncSearchAggregates(searchId);
      return { added: 0, exhausted: true, totalCount };
    }

    const web = filterBusinessWebResults(webRaw);
    const { prospects } = normalizeAndDeduplicate(web, []);

    const existing = await this.prisma.prospectResult.findMany({
      where: { searchId, tenantId },
      select: { website: true, googleMapsUrl: true, phone: true },
    });

    const seenDomains = new Set<string>();
    const seenPhones = new Set<string>();
    for (const r of existing) {
      const d = baseDomain(r.website);
      if (d) seenDomains.add(d);
      if (r.phone) seenPhones.add(r.phone);
    }

    const fresh: (typeof prospects)[number][] = [];
    for (const p of prospects) {
      const d = baseDomain(p.website);
      if (d && seenDomains.has(d)) continue;
      if (d) seenDomains.add(d);
      if (p.phone && seenPhones.has(p.phone)) continue;
      if (p.phone) seenPhones.add(p.phone);
      fresh.push(p);
    }

    if (fresh.length > 0) {
      await this.prisma.prospectResult.createMany({
        data: fresh.map((p) => ({
          tenantId,
          searchId,
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
      const hasNewSites = fresh.some((p) => p.hasWebsite && p.website);
      if (hasNewSites) {
        await this.prisma.prospectSearch.update({
          where: { id: searchId },
          data: { status: ProspectSearchStatus.ENRICHING },
        });
      }
    }

    const totalCount = await this.prisma.prospectResult.count({
      where: { searchId },
    });
    await this.syncSearchAggregates(searchId);

    return {
      added: fresh.length,
      exhausted: false,
      totalCount,
    };
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

    if (search.status === ProspectSearchStatus.ENRICHING) {
      await this.processEnrichmentChunk(tenantId, searchId, 5);
    }

    const results = await this.prisma.prospectResult.findMany({
      where: { searchId },
      orderBy: { createdAt: "asc" },
    });

    const totalWithSite = results.filter(
      (r) => r.hasWebsite && r.website,
    ).length;
    const enrichedCount = results.filter((r) => r.enrichedAt != null).length;
    const isComplete =
      totalWithSite === 0 || enrichedCount >= totalWithSite;

    const updatedSearch = await this.syncSearchAggregates(
      searchId,
      isComplete ? ProspectSearchStatus.DONE : ProspectSearchStatus.ENRICHING,
    );

    return {
      search: updatedSearch,
      results,
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

    const pipeline = await this.prisma.pipeline.findFirst({
      where: { id: data.pipelineId, tenantId },
      include: { stages: { orderBy: { sortOrder: "asc" } } },
    });
    if (!pipeline?.stages.length) {
      throw new BadRequestException("Pipeline inválido");
    }

    const stage0 = pipeline.stages[0]!;

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

    const assignedToId = await this.assigneeUserIdForTenant(
      tenantId,
      actorUserId,
    );

    const created = await this.dealsService.create(tenantId, actorUserId, {
      contactId: contact.id,
      pipelineId: pipeline.id,
      stageId: stage0.id,
      title,
      value: data.value,
    });

    if (assignedToId) {
      await this.dealsService.patch(tenantId, actorUserId, created.id, {
        assignedToId,
      });
    }

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
