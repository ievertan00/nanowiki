import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIRS = ['sources', 'notes', 'moc', 'meta', 'templates/personas', 'templates/structures'];
const moduleDir = path.dirname(fileURLToPath(import.meta.url));

const DEFAULT_TEMPLATES = {
  'personas/skeptical-reviewer.md': `You are a highly critical, world-class peer reviewer. 
When analyzing this material:
- Actively seek out unstated assumptions, leaps in logic, and potential biases.
- Evaluate the strength of the evidence presented; flag small sample sizes, missing control groups, or over-generalized conclusions.
- Distinguish strictly between what the source actually proved versus what the authors claim or speculate.
- Maintain an objective, analytical, and slightly skeptical tone.`,

  'personas/systems-architect.md': `You are a pragmatic, veteran Principal Systems Architect.
When answering or summarizing:
- Focus heavily on operational constraints, scalability bottlenecks, and failure modes.
- Look at security implications (threat vectors, data boundaries).
- Keep descriptions dry, technical, and concrete.
- Prioritize real-world engineering trade-offs (e.g., maintenance overhead vs. performance gains) over theoretical ideals.`,

  'personas/feynman-tutor.md': `You are an expert tutor who explains complex concepts using the Feynman Technique.
- Break down jargon into plain, clear language.
- Use intuitive, real-world analogies to ground abstract concepts.
- Explain the "why" before the "how."
- Keep the tone encouraging, clear, and accessible, without sounding condescending.`,

  'structures/api-eval.md': `- **Developer Experience (DX):** Setup friction, quality of docs, type safety.
- **Performance:** Runtime overhead, memory usage, latency profiles, dependency footprint.
- **Ecosystem Fit:** Versioning frequency, community support, ease of testing/mocking.
- **Alternatives:** How it compares directly to the leading industry standard.`,

  'structures/system-design.md': `- **Bottlenecks:** Network, disk I/O, or CPU limits; scaling limitations.
- **State & Storage:** Database choices, consistency guarantees, cache-invalidation strategies.
- **Failover:** What happens if a node or region goes down?
- **Trade-offs:** Which coordinates of the CAP theorem, cost, or complexity were sacrificed?`,

  'structures/paper-summary.md': `- **Core Hypothesis:** The exact problem statement and proposed solution.
- **Methodology Summary:** How they tested it, variables controlled, and metrics measured.
- **Key Benchmarks:** Exact percentage improvements, speeds, or parameters.
- **Limitations:** Self-admitted or obvious flaws in the research or implementation.`
};

export function initVault(wikiPath, config = {}) {
  for (const dir of DIRS) {
    const fullPath = path.join(wikiPath, dir);
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
    }
  }

  // Seed default templates. Idempotent — existing templates are never overwritten.
  for (const [relPath, content] of Object.entries(DEFAULT_TEMPLATES)) {
    const fullPath = path.join(wikiPath, 'templates', relPath);
    if (!fs.existsSync(fullPath)) {
      fs.writeFileSync(fullPath, content);
    }
  }

  // Seed config + schema doc on first use. Idempotent — existing files are never
  // overwritten, so the human's edits and the live taxonomy are preserved.
  const configPath = path.join(wikiPath, 'wiki-config.json');
  if (!fs.existsSync(configPath)) {
    const defaults = { language: config.language || 'zh', domains: {} };
    fs.writeFileSync(configPath, JSON.stringify(defaults, null, 2));
  }

  const wikiFile = path.join(wikiPath, 'WIKI.md');
  if (!fs.existsSync(wikiFile)) {
    // The CLI's own copy of the template; each skill folder ships its own copy too
    // (kept in sync by hand) so they stay self-contained for `npx add-skill`.
    const template = path.join(moduleDir, 'WIKI.template.md');
    if (fs.existsSync(template)) fs.copyFileSync(template, wikiFile);
  }
}

export function getVaultFiles(wikiPath) {
  const notesDir = path.join(wikiPath, 'notes');
  if (!fs.existsSync(notesDir)) return [];
  return fs.readdirSync(notesDir)
    .filter(f => f.endsWith('.md'))
    .map(f => path.basename(f, '.md'));
}

export function appendLog(wikiPath, operation, title, details = []) {
  const logPath = path.join(wikiPath, 'meta', 'log.md');
  const date = new Date().toISOString().slice(0, 10);
  const detailBlock = details.length ? details.map(d => `- ${d}`).join('\n') + '\n\n' : '';
  const entry = `## [${date}] ${operation} | ${title}\n\n${detailBlock}`;
  fs.appendFileSync(logPath, entry);
}
