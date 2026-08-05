import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import { env } from '../env.js';
import { ApiError } from '../http/errors.js';
import { logger } from '../logger.js';

/**
 * Accès au modèle génératif, sous garde-fous.
 *
 * Règle non négociable : toute réponse issue d'un exemple pré-écrit porte
 * `isSimulated: true` et l'interface l'affiche. La version initiale renvoyait un
 * diagnostic inventé avec un statut 200 quand la clé manquait — un gestionnaire
 * pouvait sanctionner un chauffeur sur une donnée qui n'existait pas.
 */

let client: GoogleGenAI | null = null;

if (env.GEMINI_API_KEY) {
  client = new GoogleGenAI({
    apiKey: env.GEMINI_API_KEY,
    httpOptions: { headers: { 'User-Agent': 'fleetguard-africa' } },
  });
  logger.info({ model: env.GEMINI_MODEL }, 'Client IA initialisé');
} else if (env.AI_DEMO_MODE) {
  logger.warn(
    'GEMINI_API_KEY absente — mode démonstration actif : les analyses seront marquées comme simulées.',
  );
} else {
  logger.warn('GEMINI_API_KEY absente — les routes IA répondront 503.');
}

export function isAiConfigured(): boolean {
  return client !== null;
}

/** Échec explicite quand l'IA n'est ni configurée ni en mode démonstration. */
function aiUnavailable(): never {
  throw ApiError.serviceUnavailable(
    "Le moteur d'analyse est indisponible : aucune clé API n'est configurée sur ce serveur. " +
      "Aucune analyse ne peut être produite — contactez l'administrateur de la plateforme.",
    'AI_NOT_CONFIGURED',
  );
}

async function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () =>
        reject(
          ApiError.serviceUnavailable(
            `Le moteur d'analyse n'a pas répondu dans le délai imparti (${label}).`,
            'AI_TIMEOUT',
          ),
        ),
      env.GEMINI_TIMEOUT_MS,
    );
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export interface AiTextResult {
  answer: string;
  isSimulated: boolean;
  model: string | null;
  generatedAt: string;
}

/** Analyse libre de la flotte (Fleet Intelligence Hub). */
export async function generateFleetAnalysis(prompt: string, demoAnswer: string): Promise<AiTextResult> {
  if (!client) {
    if (!env.AI_DEMO_MODE) aiUnavailable();
    return {
      answer: demoAnswer,
      isSimulated: true,
      model: null,
      generatedAt: new Date().toISOString(),
    };
  }

  const response = await withTimeout(
    client.models.generateContent({ model: env.GEMINI_MODEL, contents: prompt }),
    'analyse de flotte',
  );

  const answer = response.text?.trim();
  if (!answer) {
    throw ApiError.serviceUnavailable(
      "Le moteur d'analyse a renvoyé une réponse vide.",
      'AI_EMPTY_RESPONSE',
    );
  }

  return { answer, isSimulated: false, model: env.GEMINI_MODEL, generatedAt: new Date().toISOString() };
}

/**
 * Schéma de la fiche de coaching.
 * Le modèle est faillible : sa sortie est validée avant d'atteindre l'interface,
 * sinon un champ manquant fait planter le rendu chez le client.
 */
export const safetyCoachingSchema = z.object({
  driverName: z.string(),
  profileSummary: z.string(),
  overallRatingLabel: z.string(),
  identifiedRiskTrends: z
    .array(
      z.object({
        title: z.string(),
        severity: z.enum(['LOW', 'MEDIUM', 'HIGH']),
        description: z.string(),
      }),
    )
    .min(1),
  actionableTips: z
    .array(
      z.object({
        category: z.string(),
        title: z.string(),
        recommendation: z.string(),
        expectedImpact: z.string(),
      }),
    )
    .min(1),
  targetMilestone: z.object({
    targetScore: z.number().min(0).max(100),
    targetGoal: z.string(),
    potentialBonusReward: z.string(),
  }),
});

export type SafetyCoaching = z.infer<typeof safetyCoachingSchema>;

export async function generateSafetyCoaching(
  prompt: string,
  demoCoaching: SafetyCoaching,
): Promise<SafetyCoaching & { isSimulated: boolean; model: string | null; generatedAt: string }> {
  const generatedAt = new Date().toISOString();

  if (!client) {
    if (!env.AI_DEMO_MODE) aiUnavailable();
    return { ...demoCoaching, isSimulated: true, model: null, generatedAt };
  }

  const response = await withTimeout(
    client.models.generateContent({
      model: env.GEMINI_MODEL,
      contents: prompt,
      config: { responseMimeType: 'application/json' },
    }),
    'coaching chauffeur',
  );

  const raw = (response.text ?? '').replace(/```json/gi, '').replace(/```/g, '').trim();

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    logger.error({ rawPreview: raw.slice(0, 200) }, 'Réponse IA non parsable en JSON');
    throw ApiError.serviceUnavailable(
      "Le moteur d'analyse a renvoyé une réponse illisible. Aucune fiche de coaching n'a été produite.",
      'AI_INVALID_JSON',
    );
  }

  const validated = safetyCoachingSchema.safeParse(parsedJson);
  if (!validated.success) {
    logger.error({ issues: validated.error.issues }, 'Réponse IA hors schéma');
    throw ApiError.serviceUnavailable(
      "Le moteur d'analyse a renvoyé une fiche incomplète. Réessayez dans un instant.",
      'AI_SCHEMA_MISMATCH',
    );
  }

  return { ...validated.data, isSimulated: false, model: env.GEMINI_MODEL, generatedAt };
}
