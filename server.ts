import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import { MOCK_ORGANIZATIONS, MOCK_VEHICLES, MOCK_DRIVERS, MOCK_SAFETY_EVENTS, MOCK_SCORE_CONFIG, MOCK_MAINTENANCE_LOGS, MOCK_FUEL_LOGS, MOCK_COMPLIANCE_DOCS } from './src/data/mock-data.js';
import { calculateDriverSafetyScore } from './src/data/scoring-engine.js';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Initialize Gemini AI Client Server-side with User-Agent
  let ai: GoogleGenAI | null = null;
  if (process.env.GEMINI_API_KEY) {
    ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }

  // API v1 Routes
  app.get('/api/v1/health', (req, res) => {
    res.json({ status: 'ok', service: 'FleetGuard Africa Backend', version: '1.0.0-MVP' });
  });

  // Auth & Tenant Info
  app.get('/api/v1/organizations/me', (req, res) => {
    const orgId = (req.query.organizationId as string) || 'org_transafrik_cotonou';
    const org = MOCK_ORGANIZATIONS.find(o => o.id === orgId) || MOCK_ORGANIZATIONS[0];
    res.json({ statusCode: 200, data: org });
  });

  // Fleet Vehicles
  app.get('/api/v1/vehicles', (req, res) => {
    const orgId = (req.query.organizationId as string) || 'org_transafrik_cotonou';
    const vehicles = MOCK_VEHICLES.filter(v => v.organizationId === orgId);
    res.json({ statusCode: 200, data: vehicles });
  });

  // Drivers & Scoring
  app.get('/api/v1/drivers', (req, res) => {
    const orgId = (req.query.organizationId as string) || 'org_transafrik_cotonou';
    const drivers = MOCK_DRIVERS.filter(d => d.organizationId === orgId);
    res.json({ statusCode: 200, data: drivers });
  });

  app.get('/api/v1/scoring/drivers/:id', (req, res) => {
    const driverId = req.params.id;
    const driver = MOCK_DRIVERS.find(d => d.id === driverId);
    if (!driver) {
      return res.status(404).json({ statusCode: 404, message: 'Chauffeur introuvable' });
    }

    const events = MOCK_SAFETY_EVENTS.filter(e => e.driverId === driverId);
    const scoreResult = calculateDriverSafetyScore({
      distanceDrivenKm: 850,
      overspeedEventsCount: events.filter(e => e.eventType === 'OVER_SPEED').length,
      harshBrakingEventsCount: events.filter(e => e.eventType === 'HARSH_BRAKING').length,
      rapidAccelEventsCount: events.filter(e => e.eventType === 'RAPID_ACCELERATION').length,
      nightHoursDriven: events.filter(e => e.eventType === 'FATIGUE_NIGHT_DRIVING').length * 2,
      geofenceBreachesCount: events.filter(e => e.eventType === 'GEOFENCE_BREACH').length,
    }, MOCK_SCORE_CONFIG);

    res.json({
      statusCode: 200,
      data: {
        driver,
        scoreResult,
        events,
      },
    });
  });

  // GPS Telemetry Batch Ingestion
  app.post('/api/v1/tracking/telemetry/batch', (req, res) => {
    const { batchId, vehicleId, driverId, points } = req.body;
    if (!batchId || !points || !Array.isArray(points)) {
      return res.status(400).json({ statusCode: 400, message: 'Format de paquet GPS invalide' });
    }

    res.status(202).json({
      statusCode: 202,
      data: {
        accepted: true,
        batchId,
        processedPoints: points.length,
        idempotentDuplicate: false,
        receivedAt: new Date().toISOString(),
      },
    });
  });

  // IndexedDB Offline Queue Batch Sync Ingestion
  app.post('/api/v1/sync/offline-batch', (req, res) => {
    const { items } = req.body;
    if (!items || !Array.isArray(items)) {
      return res.status(400).json({ statusCode: 400, message: 'Attendu une liste de mises à jour "items"' });
    }

    console.log(`[Offline Sync Engine] Processing batch of ${items.length} queued IndexedDB updates...`);

    const syncedItemIds: string[] = [];
    const processedResults = items.map((item: any) => {
      syncedItemIds.push(item.id);
      return {
        id: item.id,
        type: item.type,
        status: 'SUCCESS',
        syncedAt: new Date().toISOString(),
        serverMessage: `Mise à jour "${item.type}" appliquée en base centrale de données.`,
      };
    });

    res.status(200).json({
      statusCode: 200,
      data: {
        syncedItemIds,
        totalProcessed: items.length,
        processedAt: new Date().toISOString(),
        results: processedResults,
      },
    });
  });

  // Maintenance & Fuel Logs
  app.get('/api/v1/maintenance', (req, res) => {
    const orgId = (req.query.organizationId as string) || 'org_transafrik_cotonou';
    const logs = MOCK_MAINTENANCE_LOGS.filter(m => m.organizationId === orgId);
    res.json({ statusCode: 200, data: logs });
  });

  app.get('/api/v1/fuel', (req, res) => {
    const orgId = (req.query.organizationId as string) || 'org_transafrik_cotonou';
    const logs = MOCK_FUEL_LOGS.filter(f => f.organizationId === orgId);
    res.json({ statusCode: 200, data: logs });
  });

  app.get('/api/v1/compliance', (req, res) => {
    const orgId = (req.query.organizationId as string) || 'org_transafrik_cotonou';
    const docs = MOCK_COMPLIANCE_DOCS.filter(c => c.organizationId === orgId);
    res.json({ statusCode: 200, data: docs });
  });

  // Fleet Intelligence Hub AI Route
  app.post('/api/v1/intelligence/analyze', async (req, res) => {
    const { prompt, organizationId } = req.body;
    const orgId = organizationId || 'org_transafrik_cotonou';
    const org = MOCK_ORGANIZATIONS.find(o => o.id === orgId) || MOCK_ORGANIZATIONS[0];
    const vehicles = MOCK_VEHICLES.filter(v => v.organizationId === orgId);
    const drivers = MOCK_DRIVERS.filter(d => d.organizationId === orgId);
    const fuelLogs = MOCK_FUEL_LOGS.filter(f => f.organizationId === orgId);
    const maintenance = MOCK_MAINTENANCE_LOGS.filter(m => m.organizationId === orgId);

    const contextPrompt = `
Tu es l'assistant d'IA spécialisé de FleetGuard Africa pour l'entreprise B2B "${org.name}" (${org.country}).
Données de la flotte actuelle :
- Devise: ${org.currency}
- Camions enregistrés: ${vehicles.map(v => `${v.immatriculation} (${v.make} ${v.model}, statut: ${v.status}, odomètre: ${v.currentOdometerKm} km)`).join('; ')}
- Chauffeurs: ${drivers.map(d => `${d.fullName} (Score: ${d.currentSafetyScore}/100, Statut: ${d.status})`).join('; ')}
- Ravitaillements récents & anomalies: ${fuelLogs.map(f => `${f.stationName}: ${f.litersAdded}L, Conso calculée: ${f.calculatedL100km || 'N/A'}L/100km, Suspect de vol: ${f.suspectedFuelTheft ? 'OUI (Anomalie)' : 'Non'}`).join('; ')}
- Maintenance: ${maintenance.map(m => `${m.description} (${m.type}, coût: ${m.cost} ${m.currency})`).join('; ')}

Question de l'utilisateur / instructeur de flotte :
"${prompt || 'Analyse la santé globale de ma flotte, la consommation de carburant et les risques chauffeurs.'}"

Fournis une réponse structurée en français professionnelle, claire, synthétique et directement orientée décision pour le gestionnaire de flotte africain.
`;

    if (!ai) {
      return res.json({
        statusCode: 200,
        data: {
          answer: `[Mode Simulation IA - Clé API non configurée]\n\nAnalyse synthétique FleetGuard pour ${org.name}:\n1. **Alerte Carburant (Ravitaillement Station Total Parakou)** : Le camion Mercedes Actros (RB-4592-A) a enregistré une consommation anormale de 48.5L/100km contre un standard attendu de 34L/100km. Probabilité élevée de siphonnage ou fuite injecteur.\n2. **Conduite & Sécurité** : Moussa Diop présente un score de 84.5/100 en raison de 4 accès de vitesse sur l'axe Cotonou-Parakou. Une session de sensibilisation est préconisée.\n3. **Maintenance Préventive** : La visite technique du véhicule RB-4592-A expire le 10 août 2026. Renouvellement à programmer immédiatement auprès du CNSR Bénin.`,
        },
      });
    }

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3.6-flash',
        contents: contextPrompt,
      });

      res.json({
        statusCode: 200,
        data: {
          answer: response.text || 'Analyse indisponible.',
        },
      });
    } catch (err: any) {
      console.error('Gemini API Error:', err);
      res.status(500).json({
        statusCode: 500,
        message: 'Erreur lors de la génération de l analyse d IA',
        error: err.message,
      });
    }
  });

  // Proactive AI Safety Tips Generator Route
  app.post('/api/v1/scoring/safety-tips', async (req, res) => {
    const { driverId, focusArea, organizationId } = req.body;
    const orgId = organizationId || 'org_transafrik_cotonou';
    const driver = MOCK_DRIVERS.find(d => d.id === driverId) || MOCK_DRIVERS[0];
    const events = MOCK_SAFETY_EVENTS.filter(e => e.driverId === driver.id);
    const assignedVehicle = MOCK_VEHICLES.find(v => v.id === driver.assignedVehicleId);
    const driverFuelLogs = MOCK_FUEL_LOGS.filter(f => f.driverId === driver.id);

    // Fallback response object generator
    const generateFallbackTips = () => {
      const isHighScorer = driver.currentSafetyScore >= 88;
      const isMidScorer = driver.currentSafetyScore >= 75 && driver.currentSafetyScore < 88;

      return {
        driverName: driver.fullName,
        profileSummary: isHighScorer
          ? `${driver.fullName} fait preuve d'une grande rigueur sur les corridors routiers. Son style de conduite est généralement fluide et respectueux des limites de vitesse.`
          : isMidScorer
          ? `${driver.fullName} maintient un niveau de conduite satisfaisant mais présente des pics de vitesse occasionnels et quelques freinages appuyés lors des traversées urbaines.`
          : `${driver.fullName} nécessite un accompagnement renforcé : sa télématique révèle des excès de vitesse répétés et une conduite nocturne exigeante affectant sa sécurité.`,
        overallRatingLabel: isHighScorer ? 'Excellent Conducteur' : isMidScorer ? 'Satisfaisant - Vigilance Recommandée' : 'Priorité Coaching',
        identifiedRiskTrends: [
          {
            title: 'Variations de Vitesse sur Axes Inter-états',
            severity: isHighScorer ? 'LOW' : 'HIGH',
            description: `Fréquents franchissements des 80 km/h sur les tronçons fluides de la RNIE 2 entre Bohicon et Parakou.`,
          },
          {
            title: 'Gestion de la Régularité en Milieu Urbain',
            severity: 'MEDIUM',
            description: `Délai de réaction court entraînant des freinages à plus de -0.4g à l'approche des carrefours et péages.`,
          },
          {
            title: 'Impact de la Fatigue & Horaires Tardifs',
            severity: isHighScorer ? 'LOW' : 'MEDIUM',
            description: `Sessions de conduite entamées entre 23h00 et 04h00, période où les réflexes chutent de 35%.`,
          },
        ],
        actionableTips: [
          {
            category: 'Sécurité Routière',
            title: 'Anticipation aux Carrefours & Entrées de Villes',
            recommendation: 'Réduisez progressivement la vitesse 300 mètres avant les agglomérations pour éviter les freinages brusques et préserver les garnitures.',
            expectedImpact: '+3.5 points au score de sécurité',
          },
          {
            category: 'Éco-Conduite & Carburant',
            title: 'Maintien du Régime Économique Moteur',
            recommendation: 'Maintenez le compte-tours dans la zone verte (1200 - 1500 tr/min) lors des côtes chargées pour réduire la consommation de gazole de 8%.',
            expectedImpact: '-2.5 L/100km de carburant',
          },
          {
            category: 'Conduite Nocturne',
            title: 'Pauses Systématiques sur le Corridor',
            recommendation: 'Observez une pause obligatoire de 20 minutes après 2 heures de conduite continue de nuit sur la route nationale.',
            expectedImpact: 'Élimination du risque d amendor fatigue',
          },
          {
            category: 'Respect des Corridors',
            title: 'Régulateur de Vitesse Adapté aux Geofences',
            recommendation: 'Verrouillez le limiteur de vitesse à 30 km/h dès l entrée dans la zone portuaire de Cotonou.',
            expectedImpact: 'Zéro pénalité de zone',
          },
        ],
        targetMilestone: {
          targetScore: Math.min(100, Math.round(driver.currentSafetyScore + 6)),
          targetGoal: 'Atteindre un score constant au-dessus de 90/100 sur les 30 prochains jours.',
          potentialBonusReward: `Éligibilité débloquée pour la Prime Trimestrielle Sécurité de 40 000 XOF`,
        },
      };
    };

    if (!ai) {
      return res.json({
        statusCode: 200,
        data: generateFallbackTips(),
      });
    }

    const contextPrompt = `
Tu es le coach de sécurité routière senior et expert en éco-conduite pour FleetGuard Africa.
Ta mission est d'analyser les performances du chauffeur suivant et d'établir une fiche de coaching personnalisée, encourageante et très pratique en français.

Données du Chauffeur :
- Nom: ${driver.fullName}
- Permis: ${driver.licenseNumber} (${driver.licenseCategory})
- Kilomètres parcourus: ${driver.totalKmDriven.toLocaleString()} km
- Score de sécurité actuel: ${driver.currentSafetyScore}/100
- Véhicule attribué: ${assignedVehicle ? `${assignedVehicle.immatriculation} (${assignedVehicle.make} ${assignedVehicle.model})` : 'Camion Flotte'}
- Axe / Focus Prioritaire demandé: ${focusArea || 'Sécurité Globale & Éco-Conduite'}

Événements de sécurité télématiques récents :
${events.length > 0 ? events.map(e => `- ${e.recordedAt}: ${e.eventType} (${e.description}, sévérité: ${e.severity}, pénalité: -${e.penaltyPointsDeducted} pts)`).join('\n') : '- Aucun événement critique enregistré.'}

Ravitaillements récents :
${driverFuelLogs.length > 0 ? driverFuelLogs.map(f => `- ${f.stationName}: ${f.litersAdded}L, conso: ${f.calculatedL100km || 'N/A'} L/100km`).join('\n') : '- Consommation nominale.'}

Génère la réponse au format JSON strictement valide suivant :
{
  "driverName": "${driver.fullName}",
  "profileSummary": "Résumé synthétique du comportement au volant et points forts (2-3 phrases).",
  "overallRatingLabel": "Label court d'évaluation (ex: Champion Sécurité, Vigilance Requise, etc.)",
  "identifiedRiskTrends": [
    {
      "title": "Titre court du risque",
      "severity": "LOW" ou "MEDIUM" ou "HIGH",
      "description": "Détail factuel de la tendance observée."
    }
  ],
  "actionableTips": [
    {
      "category": "Sécurité Routière" ou "Éco-Conduite & Carburant" ou "Conduite Nocturne" ou "Respect des Corridors",
      "title": "Titre du conseil",
      "recommendation": "Conseil pratique, bienveillant et concret adapté aux routes africaines.",
      "expectedImpact": "Impact mesurable estimé sur le score ou la consommation"
    }
  ],
  "targetMilestone": {
    "targetScore": 92,
    "targetGoal": "Objectif pour le mois à venir",
    "potentialBonusReward": "Prime estimée en XOF ou avantage chauffeur"
  }
}
Rends UNIQUEMENT du JSON valide. N'ajoute aucun texte hors du JSON.
`;

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3.6-flash',
        contents: contextPrompt,
        config: {
          responseMimeType: 'application/json',
        },
      });

      const rawText = response.text || '';
      let parsed = null;
      try {
        parsed = JSON.parse(rawText);
      } catch (e) {
        // Cleaning markdown wrappers if any
        const cleaned = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
        parsed = JSON.parse(cleaned);
      }

      res.json({
        statusCode: 200,
        data: parsed || generateFallbackTips(),
      });
    } catch (err: any) {
      console.error('Gemini Safety Tips Generation Error:', err);
      res.json({
        statusCode: 200,
        data: generateFallbackTips(),
      });
    }
  });

  // Vite Middleware in Development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[FleetGuard Africa] Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
