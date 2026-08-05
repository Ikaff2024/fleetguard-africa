import type { Driver, FuelLog, MaintenanceLog, Organization, SafetyEvent, Vehicle } from '../../types';
import type { SafetyCoaching } from './gemini.js';

/**
 * Construction des invites envoyées au modèle et exemples de démonstration.
 *
 * Les exemples ne sont servis qu'en mode démonstration explicite et sont
 * toujours restitués avec `isSimulated: true`.
 */

export function buildFleetAnalysisPrompt(input: {
  organization: Organization;
  vehicles: Vehicle[];
  drivers: Driver[];
  fuelLogs: FuelLog[];
  maintenance: MaintenanceLog[];
  question: string;
}): string {
  const { organization, vehicles, drivers, fuelLogs, maintenance, question } = input;

  return `
Tu es l'assistant d'analyse de FleetGuard Africa pour l'entreprise "${organization.name}" (${organization.country}).

Données de la flotte :
- Devise : ${organization.currency}
- Véhicules : ${vehicles
    .map(
      v =>
        `${v.immatriculation} (${v.make} ${v.model}, statut : ${v.status}, odomètre : ${v.currentOdometerKm} km)`,
    )
    .join(' ; ')}
- Chauffeurs : ${drivers
    .map(d => `${d.fullName} (score : ${d.currentSafetyScore}/100, statut : ${d.status})`)
    .join(' ; ')}
- Ravitaillements : ${fuelLogs
    .map(
      f =>
        `${f.stationName} : ${f.litersAdded} L, consommation ${f.calculatedL100km ?? 'N/A'} L/100km${
          f.suspectedFuelTheft ? ' — ANOMALIE SUSPECTÉE' : ''
        }`,
    )
    .join(' ; ')}
- Maintenance : ${maintenance
    .map(m => `${m.description} (${m.type}, coût : ${m.cost} ${m.currency})`)
    .join(' ; ')}

Question du gestionnaire de flotte :
"${question}"

Consignes de réponse :
- Français professionnel, synthétique, orienté décision.
- Appuie chaque constat sur une donnée fournie ci-dessus ; ne fabrique aucun chiffre.
- Si une donnée manque pour conclure, dis-le explicitement au lieu de l'estimer.
`.trim();
}

export function buildSafetyCoachingPrompt(input: {
  driver: Driver;
  assignedVehicle?: Vehicle;
  events: SafetyEvent[];
  fuelLogs: FuelLog[];
  focusArea?: string;
}): string {
  const { driver, assignedVehicle, events, fuelLogs, focusArea } = input;

  return `
Tu es coach en sécurité routière et éco-conduite pour FleetGuard Africa.
Établis une fiche de coaching personnalisée, encourageante et concrète, en français.

Chauffeur :
- Nom : ${driver.fullName}
- Permis : ${driver.licenseNumber} (${driver.licenseCategory})
- Kilomètres parcourus : ${driver.totalKmDriven.toLocaleString('fr-FR')} km
- Score de sécurité : ${driver.currentSafetyScore}/100
- Véhicule : ${assignedVehicle ? `${assignedVehicle.immatriculation} (${assignedVehicle.make} ${assignedVehicle.model})` : 'Non attribué'}
- Axe prioritaire : ${focusArea || 'Sécurité globale et éco-conduite'}

Événements télématiques récents :
${
  events.length > 0
    ? events
        .map(
          e =>
            `- ${e.recordedAt} : ${e.eventType} (${e.description}, sévérité ${e.severity}, -${e.penaltyPointsDeducted} pts)`,
        )
        .join('\n')
    : '- Aucun événement critique enregistré.'
}

Ravitaillements récents :
${
  fuelLogs.length > 0
    ? fuelLogs.map(f => `- ${f.stationName} : ${f.litersAdded} L, ${f.calculatedL100km ?? 'N/A'} L/100km`).join('\n')
    : '- Consommation nominale.'
}

Réponds UNIQUEMENT par un JSON valide respectant exactement cette structure :
{
  "driverName": "${driver.fullName}",
  "profileSummary": "2 à 3 phrases sur le comportement au volant et les points forts.",
  "overallRatingLabel": "Label court d'évaluation",
  "identifiedRiskTrends": [
    { "title": "Titre court", "severity": "LOW|MEDIUM|HIGH", "description": "Constat factuel appuyé sur les données ci-dessus." }
  ],
  "actionableTips": [
    { "category": "Sécurité Routière|Éco-Conduite & Carburant|Conduite Nocturne|Respect des Corridors",
      "title": "Titre du conseil",
      "recommendation": "Conseil pratique adapté aux corridors routiers africains.",
      "expectedImpact": "Impact mesurable estimé" }
  ],
  "targetMilestone": {
    "targetScore": 92,
    "targetGoal": "Objectif du mois à venir",
    "potentialBonusReward": "Prime estimée en ${'XOF'} ou avantage chauffeur"
  }
}
N'ajoute aucun texte en dehors du JSON.
`.trim();
}

/** Exemple de démonstration — jamais servi sans l'indicateur `isSimulated`. */
export function demoFleetAnalysis(organization: Organization): string {
  return [
    `Exemple d'analyse pour ${organization.name} — données de démonstration.`,
    '',
    "1. **Carburant** : un écart de consommation de +42 % par rapport au référentiel du véhicule justifie un contrôle du circuit d'alimentation et un recoupement avec les arrêts non planifiés.",
    "2. **Sécurité** : les excès de vitesse répétés sur un même tronçon relèvent généralement d'une contrainte de planning, pas d'un comportement isolé — vérifier les horaires imposés avant toute sanction.",
    '3. **Maintenance** : toute visite technique arrivant à échéance sous 30 jours doit être programmée immédiatement ; les créneaux des centres agréés sont rares en fin de trimestre.',
  ].join('\n');
}

/** Exemple de démonstration — jamais servi sans l'indicateur `isSimulated`. */
export function demoSafetyCoaching(driver: Driver): SafetyCoaching {
  const isHighScorer = driver.currentSafetyScore >= 88;
  const isMidScorer = driver.currentSafetyScore >= 75 && driver.currentSafetyScore < 88;

  return {
    driverName: driver.fullName,
    profileSummary: isHighScorer
      ? `${driver.fullName} fait preuve d'une conduite régulière et respectueuse des limitations sur les corridors longue distance.`
      : isMidScorer
        ? `${driver.fullName} maintient un niveau satisfaisant, avec des pics de vitesse occasionnels et quelques freinages appuyés en traversée urbaine.`
        : `${driver.fullName} nécessite un accompagnement renforcé : excès de vitesse répétés et conduite nocturne exigeante.`,
    overallRatingLabel: isHighScorer
      ? 'Excellent conducteur'
      : isMidScorer
        ? 'Satisfaisant — vigilance recommandée'
        : 'Priorité coaching',
    identifiedRiskTrends: [
      {
        title: 'Variations de vitesse sur axes inter-États',
        severity: isHighScorer ? 'LOW' : 'HIGH',
        description: 'Franchissements réguliers des limitations sur les tronçons fluides.',
      },
      {
        title: 'Régularité en milieu urbain',
        severity: 'MEDIUM',
        description: 'Freinages appuyés à l\'approche des carrefours et des postes de péage.',
      },
      {
        title: 'Fatigue et horaires tardifs',
        severity: isHighScorer ? 'LOW' : 'MEDIUM',
        description: 'Sessions de conduite entamées entre 23 h et 4 h, créneau où la vigilance chute.',
      },
    ],
    actionableTips: [
      {
        category: 'Sécurité Routière',
        title: 'Anticipation aux entrées de villes',
        recommendation:
          'Réduire progressivement la vitesse 300 mètres avant les agglomérations pour éviter les freinages brusques.',
        expectedImpact: 'Moins de freinages d\'urgence, garnitures préservées',
      },
      {
        category: 'Éco-Conduite & Carburant',
        title: 'Maintien du régime économique',
        recommendation: 'Garder le compte-tours entre 1 200 et 1 500 tr/min en côte chargée.',
        expectedImpact: 'Consommation réduite',
      },
      {
        category: 'Conduite Nocturne',
        title: 'Pauses systématiques sur le corridor',
        recommendation: 'Observer une pause de 20 minutes après 2 heures de conduite nocturne continue.',
        expectedImpact: 'Risque lié à la fatigue fortement réduit',
      },
      {
        category: 'Respect des Corridors',
        title: 'Limiteur adapté aux zones sensibles',
        recommendation: "Activer le limiteur dès l'entrée dans les zones portuaires et industrielles.",
        expectedImpact: 'Zéro franchissement de zone',
      },
    ],
    targetMilestone: {
      targetScore: Math.min(100, Math.round(driver.currentSafetyScore + 6)),
      targetGoal: 'Maintenir un score supérieur à 90/100 sur 30 jours.',
      potentialBonusReward: 'Éligibilité à la prime trimestrielle sécurité',
    },
  };
}
