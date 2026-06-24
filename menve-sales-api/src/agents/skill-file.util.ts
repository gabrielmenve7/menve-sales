import { readFile, readdir } from "node:fs/promises";
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

const RULES_DIR = path.join(process.cwd(), "..", ".cursor", "rules");

export function resolveRulesDir(): string {
  return RULES_DIR;
}

/** `agent-larissa.mdc` → `larissa` */
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

export async function loadAgentDefinition(
  agentKey: string,
): Promise<ParsedAgentDefinition> {
  const rulesDir = resolveRulesDir();
  const filename = `agent-${agentKey}.mdc`;
  const fullPath = path.join(rulesDir, filename);
  const raw = await readFile(fullPath, "utf8");
  const { meta, body } = parseFrontmatter(raw);
  const sourcePath = `.cursor/rules/${filename}`;

  return {
    agentKey: meta.agentKey?.trim() || agentKey,
    displayName: meta.displayName?.trim() || agentKey,
    description: meta.description?.trim() || "",
    sourcePath,
    skills: parseAgentSections(body, sourcePath),
  };
}

export async function listAgentKeys(): Promise<string[]> {
  const rulesDir = resolveRulesDir();
  const files = await readdir(rulesDir);
  return files
    .map(agentKeyFromFilename)
    .filter((k): k is string => Boolean(k))
    .sort();
}

/** Compat: skills da Larissa a partir de `agent-larissa.mdc`. */
export async function loadLarissaSkillFiles(): Promise<ParsedSkillFile[]> {
  const agent = await loadAgentDefinition("larissa");
  return agent.skills;
}
