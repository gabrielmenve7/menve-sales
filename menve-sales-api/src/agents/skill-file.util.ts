import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { parseFrontmatter } from "./skill-file-parse";

export type ParsedSkillFile = {
  skillKey: string;
  order: number;
  content: string;
  sourcePath: string;
};

export type ParsedAgentDefinition = {
  agentKey: string;
  displayName: string;
  description: string;
  sourcePath: string;
  skills: ParsedSkillFile[];
};

const CURSOR_RULES_DIR = path.join(process.cwd(), "..", ".cursor", "rules");

function bundledDefinitionsDir(): string {
  return path.join(__dirname, "definitions");
}

export function resolveRulesDir(): string {
  return CURSOR_RULES_DIR;
}

/** `agent-gabriel.mdc` → `gabriel` */
export function agentKeyFromFilename(filename: string): string | null {
  const m = /^agent-(.+)\.mdc$/i.exec(filename);
  return m?.[1]?.trim().toLowerCase() ?? null;
}

/** Título da seção → skillKey (ex.: "Qualificação" → qualificacao). */
export function slugifySkillKey(title: string): string {
  return title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

const SKILL_KEY_ALIASES: Record<string, string> = {
  persona: "persona",
  qualificacao: "qualificacao",
  objecoes: "objecoes",
  agendamento: "agendamento",
  handoff: "handoff",
  guardrails: "guardrails",
};

export function parseAgentSections(
  body: string,
  sourcePath: string,
): ParsedSkillFile[] {
  const chunks = body.split(/\n(?=## )/);
  const skills: ParsedSkillFile[] = [];
  let order = 0;

  for (const chunk of chunks) {
    const trimmed = chunk.trim();
    if (!trimmed.startsWith("## ")) continue;

    const nl = trimmed.indexOf("\n");
    const headingLine =
      nl === -1 ? trimmed.slice(3).trim() : trimmed.slice(3, nl).trim();
    const rawContent = nl === -1 ? "" : trimmed.slice(nl + 1).trim();

    const slug = slugifySkillKey(headingLine);
    const skillKey = SKILL_KEY_ALIASES[slug] ?? slug;
    if (!skillKey) continue;

    order += 1;
    skills.push({
      skillKey,
      order,
      content: rawContent ? `## ${headingLine}\n\n${rawContent}` : `## ${headingLine}`,
      sourcePath,
    });
  }

  return skills;
}

async function resolveAgentFilePath(
  agentKey: string,
): Promise<{ fullPath: string; sourcePath: string }> {
  const filename = `agent-${agentKey}.mdc`;
  const bundled = path.join(bundledDefinitionsDir(), filename);
  try {
    await access(bundled);
    return {
      fullPath: bundled,
      sourcePath: `src/agents/definitions/${filename}`,
    };
  } catch {
    const cursor = path.join(CURSOR_RULES_DIR, filename);
    return { fullPath: cursor, sourcePath: `.cursor/rules/${filename}` };
  }
}

export async function loadAgentDefinition(
  agentKey: string,
): Promise<ParsedAgentDefinition> {
  const { fullPath, sourcePath } = await resolveAgentFilePath(agentKey);
  const raw = await readFile(fullPath, "utf8");
  const { meta, body } = parseFrontmatter(raw);

  return {
    agentKey: meta.agentKey?.trim() || agentKey,
    displayName: meta.displayName?.trim() || agentKey,
    description: meta.description?.trim() || "",
    sourcePath,
    skills: parseAgentSections(body, sourcePath),
  };
}

export async function listAgentKeys(): Promise<string[]> {
  try {
    const bundled = bundledDefinitionsDir();
    const files = await readdir(bundled);
    const keys = files
      .map(agentKeyFromFilename)
      .filter((k): k is string => Boolean(k));
    if (keys.length > 0) return keys.sort();
  } catch {
    // fallback para dev local com .cursor/rules
  }

  const files = await readdir(CURSOR_RULES_DIR);
  return files
    .map(agentKeyFromFilename)
    .filter((k): k is string => Boolean(k))
    .sort();
}

/** Compat: skills do Gabriel a partir de `agent-gabriel.mdc`. */
export async function loadGabrielSkillFiles(): Promise<ParsedSkillFile[]> {
  const agent = await loadAgentDefinition("gabriel");
  return agent.skills;
}
