/**
 * Extrait la documentation d'architecture vers `docs/architecture/`.
 *
 * Ce contenu vivait dans `src/data/sprint0-docs.ts` et s'affichait dans un
 * écran de l'application. Il n'a rien à y faire : c'est de la documentation
 * d'équipe, pas une fonctionnalité produit, et l'exposer à un client donne
 * l'impression d'un chantier plutôt que d'un logiciel fini.
 *
 * Script conservé pour la traçabilité de cette extraction.
 * Usage : node scripts/extract-architecture-docs.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { SPRINT_0_DOCS } from '../src/data/sprint0-docs.ts';

const outputDir = path.join(process.cwd(), 'docs', 'architecture');
mkdirSync(outputDir, { recursive: true });

const slug = key =>
  key
    .replace(/([A-Z])/g, '-$1')
    .toLowerCase()
    .replace(/^-/, '');

const skip = new Set(['title', 'version', 'date', 'author']);

/**
 * Titres lisibles et langage des blocs de code.
 *
 * Les contenus qui ne sont pas de la prose (diagramme, schéma) sont enveloppés
 * dans un bloc de code : GitHub les rend correctement, et le formateur Markdown
 * n'en écrase pas l'indentation — ce qui rendrait un diagramme Mermaid invalide.
 */
const META = {
  architectureDecisions: { title: "Décisions d'architecture" },
  monorepoStructure: { title: 'Structure du monorepo' },
  mermaidDiagram: { title: 'Diagramme de flux', fence: 'mermaid' },
  prismaSchemaText: { title: 'Schéma de données initial', fence: 'prisma' },
  gpsProtocolSpec: { title: "Protocole d'ingestion GPS" },
  testPlan: { title: 'Plan de tests' },
};
const written = [];

for (const [key, value] of Object.entries(SPRINT_0_DOCS)) {
  if (skip.has(key)) continue;

  let title = key;
  let body = null;

  if (typeof value === 'string') {
    body = value;
  } else if (value && typeof value === 'object' && 'content' in value) {
    title = value.title ?? key;
    body = value.content;
  }

  if (!body) continue;

  const meta = META[key] ?? {};
  const heading = meta.title ?? title;
  const content = meta.fence
    ? `\`\`\`${meta.fence}\n${String(body).trim()}\n\`\`\``
    : String(body).trim();

  const file = path.join(outputDir, `${slug(key)}.md`);
  writeFileSync(file, `# ${heading}\n\n${content}\n`, 'utf8');
  written.push(path.basename(file));
}

console.log(`${written.length} fichiers écrits dans docs/architecture/ :`);
written.forEach(name => console.log(`  ${name}`));
