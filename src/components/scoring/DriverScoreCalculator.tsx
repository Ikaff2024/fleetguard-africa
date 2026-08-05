import React, { useState } from 'react';
import { MOCK_DRIVERS, MOCK_SCORE_CONFIG } from '../../data/mock-data';
import { calculateDriverSafetyScore, calculateVehicleHealthScore, calculateFuelEfficiencyScore } from '../../data/scoring-engine';
import { Organization, DriverScoreConfig } from '../../types';
import { Award, Sliders, Info, CheckCircle2, AlertTriangle, Gauge, Zap, Trophy, Calculator, Sparkles, MessageSquare, Gift } from 'lucide-react';
import { DriverLeaderboard } from './DriverLeaderboard';
import { ProactiveSafetyTips } from './ProactiveSafetyTips';
import { DriverMessagingModule } from './DriverMessagingModule';
import { RewardsModule } from '../rewards/RewardsModule';

interface DriverScoreCalculatorProps {
  currentOrg: Organization;
}

export const DriverScoreCalculator: React.FC<DriverScoreCalculatorProps> = ({ currentOrg }) => {
  const [activeSubTab, setActiveSubTab] = useState<'leaderboard' | 'rewards' | 'messaging' | 'safetyTips' | 'calculator'>('leaderboard');

  const drivers = MOCK_DRIVERS.filter(d => d.organizationId === currentOrg.id);
  const [selectedDriverId, setSelectedDriverId] = useState<string>(drivers[0]?.id || MOCK_DRIVERS[0]?.id || '');
  const selectedDriver = drivers.find(d => d.id === selectedDriverId) || drivers[0];

  // Config weights
  const [scoreConfig, setScoreConfig] = useState<DriverScoreConfig>(MOCK_SCORE_CONFIG);

  // Simulation Inputs
  const [distanceKm, setDistanceKm] = useState<number>(450);
  const [overspeedCount, setOverspeedCount] = useState<number>(3);
  const [harshBrakingCount, setHarshBrakingCount] = useState<number>(2);
  const [rapidAccelCount, setRapidAccelCount] = useState<number>(1);
  const [nightHours, setNightHours] = useState<number>(1.5);
  const [geofenceBreaches, setGeofenceBreaches] = useState<number>(0);

  // Calculate Driver Safety Score
  const scoreResult = calculateDriverSafetyScore(
    {
      distanceDrivenKm: distanceKm,
      overspeedEventsCount: overspeedCount,
      harshBrakingEventsCount: harshBrakingCount,
      rapidAccelEventsCount: rapidAccelCount,
      nightHoursDriven: nightHours,
      geofenceBreachesCount: geofenceBreaches,
    },
    scoreConfig
  );

  // Other scores
  const vehicleHealthScore = calculateVehicleHealthScore(148500, 140000, 155000, 0);
  const fuelEffResult = calculateFuelEfficiencyScore(34.0, 48.5);

  const getScoreColor = (score: number) => {
    if (score >= 85) return 'text-green-700 bg-green-50 border-green-200';
    if (score >= 70) return 'text-orange-700 bg-orange-50 border-orange-200';
    return 'text-red-700 bg-red-50 border-red-200';
  };

  return (
    <div className="space-y-6">
      {/* Module Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 pb-3 font-bold text-xs">
        <button
          onClick={() => setActiveSubTab('leaderboard')}
          className={`px-4 py-2.5 rounded-xl transition flex items-center gap-2 cursor-pointer shadow-2xs ${
            activeSubTab === 'leaderboard'
              ? 'bg-orange-500 text-white shadow-xs'
              : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Trophy className="w-4 h-4" />
          <span>Classement & Leaderboard Chauffeurs</span>
        </button>

        <button
          onClick={() => setActiveSubTab('rewards')}
          className={`px-4 py-2.5 rounded-xl transition flex items-center gap-2 cursor-pointer shadow-2xs ${
            activeSubTab === 'rewards'
              ? 'bg-orange-500 text-white shadow-xs'
              : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Gift className="w-4 h-4 text-amber-300" />
          <span>Programme Rewards & Primes Carburant</span>
        </button>

        <button
          onClick={() => setActiveSubTab('messaging')}
          className={`px-4 py-2.5 rounded-xl transition flex items-center gap-2 cursor-pointer shadow-2xs ${
            activeSubTab === 'messaging'
              ? 'bg-orange-500 text-white shadow-xs'
              : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <MessageSquare className="w-4 h-4 text-emerald-400" />
          <span>Messagerie Directe & Consignes Chauffeurs</span>
        </button>

        <button
          onClick={() => setActiveSubTab('safetyTips')}
          className={`px-4 py-2.5 rounded-xl transition flex items-center gap-2 cursor-pointer shadow-2xs ${
            activeSubTab === 'safetyTips'
              ? 'bg-orange-500 text-white shadow-xs'
              : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Sparkles className="w-4 h-4 text-amber-300 animate-pulse" />
          <span>Conseils de Sécurité Proactifs IA</span>
        </button>

        <button
          onClick={() => setActiveSubTab('calculator')}
          className={`px-4 py-2.5 rounded-xl transition flex items-center gap-2 cursor-pointer shadow-2xs ${
            activeSubTab === 'calculator'
              ? 'bg-orange-500 text-white shadow-xs'
              : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Calculator className="w-4 h-4" />
          <span>Simulateur & Analyse Explicable de Score</span>
        </button>
      </div>

      {/* Render Leaderboard Subtab */}
      {activeSubTab === 'leaderboard' && (
        <DriverLeaderboard currentOrg={currentOrg} />
      )}

      {/* Render Rewards Subtab */}
      {activeSubTab === 'rewards' && (
        <RewardsModule
          currentOrg={currentOrg}
          onNavigateToMessaging={() => setActiveSubTab('messaging')}
        />
      )}

      {/* Render Messaging Subtab */}
      {activeSubTab === 'messaging' && (
        <DriverMessagingModule currentOrg={currentOrg} />
      )}

      {/* Render Proactive Safety Tips Subtab */}
      {activeSubTab === 'safetyTips' && (
        <ProactiveSafetyTips currentOrg={currentOrg} />
      )}

      {/* Render Calculator Subtab */}
      {activeSubTab === 'calculator' && (
        <div className="space-y-6">
          {/* Header Banner */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-wrap items-center justify-between gap-4 shadow-xs">
            <div>
              <div className="flex items-center gap-2 text-orange-600 font-bold text-xs uppercase tracking-wider mb-1">
                <Award className="w-4 h-4 text-orange-500" />
                <span>Driver Safety Score Engine • Version 1.0 Explicable</span>
              </div>
              <h2 className="text-xl font-bold text-slate-900">
                Score de Sécurité Chauffeur & Analyse des Pénalités
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Score normalisé sur 100 avec pondérations configurables et explications exhaustives de chaque déduction.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="text-xs text-slate-500 font-medium">Score Moyen Flotte</div>
                <div className="text-2xl font-bold text-green-600 font-mono">87.2 / 100</div>
              </div>
            </div>
          </div>

          {/* Top 3 Metric Cards: Driver Safety, Vehicle Health, Fuel Efficiency */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className={`p-5 rounded-xl border ${getScoreColor(scoreResult.score)} shadow-xs`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider">Driver Safety Score</span>
                <Award className="w-5 h-5" />
              </div>
              <div className="text-4xl font-extrabold font-mono my-2">{scoreResult.score} <span className="text-sm font-normal opacity-70">/ 100</span></div>
              <p className="text-xs opacity-90 font-medium">
                Chauffeur: <strong>{selectedDriver?.fullName}</strong> ({distanceKm} km parcourus)
              </p>
            </div>

            <div className="p-5 rounded-xl border bg-white border-slate-200 text-slate-800 shadow-xs">
              <div className="flex items-center justify-between text-blue-600">
                <span className="text-xs font-bold uppercase tracking-wider">Vehicle Health Score</span>
                <Gauge className="w-5 h-5" />
              </div>
              <div className="text-4xl font-extrabold font-mono my-2 text-slate-900">{vehicleHealthScore} <span className="text-sm text-slate-400 font-normal">/ 100</span></div>
              <p className="text-xs text-slate-500 font-medium">
                Prochaine vidange dans <strong className="text-green-600 font-bold">6,500 km</strong>
              </p>
            </div>

            <div className="p-5 rounded-xl border bg-white border-slate-200 text-slate-800 shadow-xs">
              <div className="flex items-center justify-between text-orange-600">
                <span className="text-xs font-bold uppercase tracking-wider">Fuel Efficiency Score</span>
                <Zap className="w-5 h-5" />
              </div>
              <div className="text-4xl font-extrabold font-mono my-2 text-orange-600">{fuelEffResult.score} <span className="text-sm text-slate-400 font-normal">/ 100</span></div>
              <p className="text-xs text-red-600 font-semibold">
                Statut: <strong>{fuelEffResult.status === 'SUSPECTED_THEFT' ? 'Anomalie / Vol Suspecté (48.5L/100km)' : 'Normal'}</strong>
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Column: Interactive Simulation Controls & Config Weights */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-5 shadow-xs">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <span className="text-xs font-bold text-slate-900 flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-orange-500" />
                  Simulateur d'Événements de Conduite
                </span>
                <select
                  value={selectedDriverId}
                  onChange={e => setSelectedDriverId(e.target.value)}
                  className="bg-slate-50 text-xs text-slate-800 border border-slate-200 rounded-lg px-2 py-1 font-bold cursor-pointer"
                >
                  {drivers.map(d => (
                    <option key={d.id} value={d.id}>{d.fullName}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-4 text-xs">
                {/* Distance Slider */}
                <div>
                  <div className="flex justify-between text-slate-700 font-semibold mb-1">
                    <span>Distance Parcourue (km) :</span>
                    <span className="font-mono font-bold text-orange-600">{distanceKm} km</span>
                  </div>
                  <input
                    type="range"
                    min="50"
                    max="1500"
                    step="50"
                    value={distanceKm}
                    onChange={e => setDistanceKm(Number(e.target.value))}
                    className="w-full accent-orange-500 cursor-pointer"
                  />
                </div>

                {/* Overspeed Slider */}
                <div>
                  <div className="flex justify-between text-slate-700 font-semibold mb-1">
                    <span>Excès de Vitesse (&gt; 90 km/h) :</span>
                    <span className="font-mono font-bold text-red-600">{overspeedCount} détection(s)</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="15"
                    value={overspeedCount}
                    onChange={e => setOverspeedCount(Number(e.target.value))}
                    className="w-full accent-red-500 cursor-pointer"
                  />
                </div>

                {/* Harsh Braking Slider */}
                <div>
                  <div className="flex justify-between text-slate-700 font-semibold mb-1">
                    <span>Freinages Brusques (&gt; 0.4g) :</span>
                    <span className="font-mono font-bold text-orange-600">{harshBrakingCount} fois</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="10"
                    value={harshBrakingCount}
                    onChange={e => setHarshBrakingCount(Number(e.target.value))}
                    className="w-full accent-orange-500 cursor-pointer"
                  />
                </div>

                {/* Rapid Accel Slider */}
                <div>
                  <div className="flex justify-between text-slate-700 font-semibold mb-1">
                    <span>Accélérations Brutales :</span>
                    <span className="font-mono font-bold text-blue-600">{rapidAccelCount} fois</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="10"
                    value={rapidAccelCount}
                    onChange={e => setRapidAccelCount(Number(e.target.value))}
                    className="w-full accent-blue-500 cursor-pointer"
                  />
                </div>

                {/* Night Hours Slider */}
                <div>
                  <div className="flex justify-between text-slate-700 font-semibold mb-1">
                    <span>Conduite Nocturne (Heures 00h-05h) :</span>
                    <span className="font-mono font-bold text-purple-600">{nightHours} heure(s)</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="8"
                    step="0.5"
                    value={nightHours}
                    onChange={e => setNightHours(Number(e.target.value))}
                    className="w-full accent-purple-500 cursor-pointer"
                  />
                </div>

                {/* Geofence Breaches Slider */}
                <div>
                  <div className="flex justify-between text-slate-700 font-semibold mb-1">
                    <span>Franchissements de Zone Interdite :</span>
                    <span className="font-mono font-bold text-indigo-600">{geofenceBreaches} zone(s)</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="5"
                    value={geofenceBreaches}
                    onChange={e => setGeofenceBreaches(Number(e.target.value))}
                    className="w-full accent-indigo-500 cursor-pointer"
                  />
                </div>
              </div>
            </div>

            {/* Right 2 Columns: Score Breakdown & Human Explanations */}
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 shadow-xs">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <span className="text-xs font-bold text-slate-900 flex items-center gap-2">
                    <Info className="w-4 h-4 text-green-600" />
                    Explication Détaillée des Pénalités Imputées
                  </span>
                  <span className="text-[10px] bg-slate-50 border border-slate-200 px-2 py-0.5 rounded text-slate-600 font-mono font-bold">
                    Facteur Normalisation: {scoreResult.normalizedDistanceFactor}x
                  </span>
                </div>

                <div className="space-y-3">
                  {scoreResult.explanations.map((exp, idx) => (
                    <div key={idx} className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex items-start gap-3">
                      {exp.pointsLost > 0 ? (
                        <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                      ) : (
                        <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
                      )}
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-xs text-slate-900">{exp.category}</span>
                          {exp.pointsLost > 0 && (
                            <span className="font-mono font-bold text-xs text-red-600 bg-red-50 px-2 py-0.5 rounded border border-red-200">
                              -{exp.pointsLost} pts
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                          {exp.reason}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Config Version Weight Breakdown */}
              <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3 shadow-xs">
                <div className="text-xs font-bold text-slate-800 flex items-center justify-between">
                  <span>Configuration Versionnée des Pondérations (v1.0)</span>
                  <span className="text-[10px] text-orange-600 font-mono font-bold">Total = 100%</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center text-xs font-mono">
                  <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                    <div className="text-[10px] text-slate-500 font-sans font-medium">Vitesse</div>
                    <div className="font-bold text-red-600">{scoreConfig.weights.overspeedWeight}%</div>
                  </div>
                  <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                    <div className="text-[10px] text-slate-500 font-sans font-medium">Freinage</div>
                    <div className="font-bold text-orange-600">{scoreConfig.weights.harshBrakingWeight}%</div>
                  </div>
                  <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                    <div className="text-[10px] text-slate-500 font-sans font-medium">Accélération</div>
                    <div className="font-bold text-blue-600">{scoreConfig.weights.rapidAccelWeight}%</div>
                  </div>
                  <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                    <div className="text-[10px] text-slate-500 font-sans font-medium">Nuit</div>
                    <div className="font-bold text-purple-600">{scoreConfig.weights.fatigueNightWeight}%</div>
                  </div>
                  <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                    <div className="text-[10px] text-slate-500 font-sans font-medium">Géofence</div>
                    <div className="font-bold text-indigo-600">{scoreConfig.weights.geofenceBreachWeight}%</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
