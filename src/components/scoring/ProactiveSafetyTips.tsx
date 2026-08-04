import React, { useState, useEffect } from 'react';
import { Organization } from '../../types';
import { MOCK_DRIVERS, MOCK_VEHICLES } from '../../data/mock-data';
import {
  Sparkles,
  BrainCircuit,
  CheckCircle2,
  AlertTriangle,
  ShieldAlert,
  TrendingUp,
  UserCheck,
  Compass,
  Printer,
  Copy,
  FileText,
  Award,
  Zap,
  Moon,
  RefreshCw,
  Target,
  ChevronRight,
  Truck,
  Check,
  Share2
} from 'lucide-react';

interface ProactiveSafetyTipsProps {
  currentOrg: Organization;
}

export interface RiskTrend {
  title: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  description: string;
}

export interface ActionableTip {
  category: 'Sécurité Routière' | 'Éco-Conduite & Carburant' | 'Conduite Nocturne' | 'Respect des Corridors' | string;
  title: string;
  recommendation: string;
  expectedImpact: string;
}

export interface TargetMilestone {
  targetScore: number;
  targetGoal: string;
  potentialBonusReward: string;
}

export interface SafetyTipsResponse {
  driverName: string;
  profileSummary: string;
  overallRatingLabel: string;
  identifiedRiskTrends: RiskTrend[];
  actionableTips: ActionableTip[];
  targetMilestone: TargetMilestone;
}

export const ProactiveSafetyTips: React.FC<ProactiveSafetyTipsProps> = ({ currentOrg }) => {
  const drivers = MOCK_DRIVERS.filter(d => d.organizationId === currentOrg.id);
  const [selectedDriverId, setSelectedDriverId] = useState<string>(drivers[0]?.id || MOCK_DRIVERS[0]?.id || '');
  const [focusArea, setFocusArea] = useState<string>('Toutes catégories');
  
  const [loading, setLoading] = useState<boolean>(false);
  const [tipsData, setTipsData] = useState<SafetyTipsResponse | null>(null);
  const [completedTips, setCompletedTips] = useState<Record<number, boolean>>({});
  const [copiedText, setCopiedText] = useState<boolean>(false);

  const selectedDriver = drivers.find(d => d.id === selectedDriverId) || drivers[0];
  const assignedVehicle = MOCK_VEHICLES.find(v => v.id === selectedDriver?.assignedVehicleId);

  const fetchSafetyTips = async (driverId: string, focus: string) => {
    setLoading(true);
    setCopiedText(false);
    try {
      const response = await fetch('/api/v1/scoring/safety-tips', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          driverId,
          focusArea: focus,
          organizationId: currentOrg.id,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const resJson = await response.json();
      if (resJson.data) {
        setTipsData(resJson.data);
      }
    } catch (err) {
      console.error('Failed to fetch safety tips:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedDriverId) {
      fetchSafetyTips(selectedDriverId, focusArea);
    }
  }, [selectedDriverId]);

  const handleGenerate = () => {
    fetchSafetyTips(selectedDriverId, focusArea);
  };

  const toggleTipCompleted = (index: number) => {
    setCompletedTips(prev => ({ ...prev, [index]: !prev[index] }));
  };

  const handleCopySMS = () => {
    if (!tipsData || !selectedDriver) return;
    const text = `FICHE COACHING FLEETGUARD - ${selectedDriver.fullName}
----------------------------------------
Score Actuel: ${selectedDriver.currentSafetyScore}/100 (${tipsData.overallRatingLabel})
Objectif Cible: ${tipsData.targetMilestone.targetScore}/100

PROCHAINS CONSEILS DE SÉCURITÉ :
${tipsData.actionableTips.map((tip, i) => `${i + 1}. [${tip.category}] ${tip.title}: ${tip.recommendation}`).join('\n')}

BONUS : ${tipsData.targetMilestone.potentialBonusReward}`;

    navigator.clipboard.writeText(text);
    setCopiedText(true);
    setTimeout(() => setCopiedText(false), 3000);
  };

  const getSeverityBadge = (severity: 'LOW' | 'MEDIUM' | 'HIGH') => {
    switch (severity) {
      case 'HIGH':
        return <span className="bg-red-100 text-red-800 text-[10px] font-bold px-2 py-0.5 rounded border border-red-200 uppercase">Risque Élevé</span>;
      case 'MEDIUM':
        return <span className="bg-orange-100 text-orange-800 text-[10px] font-bold px-2 py-0.5 rounded border border-orange-200 uppercase">Vigilance Modérée</span>;
      case 'LOW':
      default:
        return <span className="bg-green-100 text-green-800 text-[10px] font-bold px-2 py-0.5 rounded border border-green-200 uppercase">Risque Faible</span>;
    }
  };

  const getCategoryIcon = (category: string) => {
    if (category.toLowerCase().includes('éco') || category.toLowerCase().includes('carburant')) {
      return <Zap className="w-4 h-4 text-orange-500" />;
    }
    if (category.toLowerCase().includes('nuit') || category.toLowerCase().includes('fatigue')) {
      return <Moon className="w-4 h-4 text-purple-500" />;
    }
    if (category.toLowerCase().includes('corridor') || category.toLowerCase().includes('zone')) {
      return <Compass className="w-4 h-4 text-indigo-500" />;
    }
    return <ShieldAlert className="w-4 h-4 text-blue-500" />;
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 border border-slate-800 rounded-xl p-6 text-white shadow-md relative overflow-hidden">
        <div className="absolute top-0 right-0 transform translate-x-6 -translate-y-6 opacity-10 pointer-events-none">
          <BrainCircuit className="w-64 h-64 text-orange-400" />
        </div>

        <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-orange-400 font-bold text-xs uppercase tracking-wider mb-2">
              <Sparkles className="w-4 h-4 text-orange-400 animate-pulse" />
              <span>Générateur de Fiches Coaching IA Gemini 3.6</span>
            </div>
            <h2 className="text-2xl font-bold text-white tracking-tight">
              Conseils de Sécurité & Éco-Conduite Proactifs
            </h2>
            <p className="text-xs text-slate-300 mt-1 max-w-2xl leading-relaxed">
              Analyse prédictive des tendances comportementales des chauffeurs par IA. Génère des recommandations concrètes et adaptées aux réalités des corridors routiers africains.
            </p>
          </div>

          <div className="flex items-center gap-2 bg-slate-800/80 border border-slate-700/80 rounded-xl p-3 backdrop-blur-xs">
            <UserCheck className="w-8 h-8 text-orange-400 shrink-0" />
            <div>
              <div className="text-[10px] text-slate-400 font-semibold uppercase">Flotte Active</div>
              <div className="text-sm font-bold text-white">{drivers.length} Chauffeurs Suivis</div>
            </div>
          </div>
        </div>
      </div>

      {/* Driver Selection & Generator Controls */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
        <div className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2 border-b border-slate-100 pb-2">
          <Target className="w-4 h-4 text-orange-500" />
          <span>Sélection du Chauffeur & Axes de Coaching</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Chauffeur à Analyser
            </label>
            <select
              value={selectedDriverId}
              onChange={e => setSelectedDriverId(e.target.value)}
              className="w-full bg-slate-50 text-xs font-semibold text-slate-800 border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 cursor-pointer"
            >
              {drivers.map(d => (
                <option key={d.id} value={d.id}>
                  {d.fullName} (Score: {d.currentSafetyScore}/100 - {d.status})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Focus de Coaching Prioritaire
            </label>
            <select
              value={focusArea}
              onChange={e => setFocusArea(e.target.value)}
              className="w-full bg-slate-50 text-xs font-semibold text-slate-800 border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 cursor-pointer"
            >
              <option value="Toutes catégories">Toutes catégories (Complet)</option>
              <option value="Sécurité Routière & Vitesse">Sécurité Routière & Excès de vitesse</option>
              <option value="Éco-Conduite & Carburant">Éco-Conduite & Carburant</option>
              <option value="Conduite Nocturne & Fatigue">Conduite Nocturne & Fatigue</option>
              <option value="Respect des Corridors Routiers">Respect des Corridors Routiers & Port</option>
            </select>
          </div>

          <div className="flex items-end">
            <button
              onClick={handleGenerate}
              disabled={loading}
              className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-bold text-xs px-4 py-2.5 rounded-lg transition flex items-center justify-center gap-2 shadow-xs cursor-pointer"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Analyse Gemini en cours...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Régénérer la Fiche IA</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Loading Skeleton */}
      {loading && (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center space-y-4 animate-pulse shadow-xs">
          <div className="flex justify-center">
            <BrainCircuit className="w-12 h-12 text-orange-500 animate-spin" />
          </div>
          <h3 className="text-base font-bold text-slate-800">
            Génération de l'Analyse Comportementale IA...
          </h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Gemini analyse les logs télématiques GPS, les événements de freinage, la consommation gazole et l'historique nocturne de <strong>{selectedDriver?.fullName}</strong>.
          </p>
        </div>
      )}

      {/* Generated Coaching Sheet */}
      {!loading && tipsData && (
        <div className="space-y-6">
          {/* Driver Card Summary Header */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs flex flex-wrap items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-orange-100 border-2 border-orange-500 text-orange-700 flex items-center justify-center text-xl font-bold shrink-0">
                {selectedDriver?.fullName.split(' ').map(n => n[0]).join('')}
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold text-slate-900">{tipsData.driverName}</h3>
                  <span className="text-xs bg-slate-100 border border-slate-200 text-slate-700 font-mono font-bold px-2 py-0.5 rounded">
                    Permis {selectedDriver?.licenseCategory}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 mt-1">
                  <span className="flex items-center gap-1">
                    <Truck className="w-3.5 h-3.5 text-slate-400" />
                    Véhicule: <strong>{assignedVehicle ? `${assignedVehicle.immatriculation} (${assignedVehicle.make})` : 'Flotte'}</strong>
                  </span>
                  <span>•</span>
                  <span>Kilométrage: <strong>{selectedDriver?.totalKmDriven.toLocaleString()} km</strong></span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-6 border-l border-slate-100 pl-6">
              <div>
                <div className="text-[11px] text-slate-500 font-semibold uppercase">Score de Sécurité Actuel</div>
                <div className="text-3xl font-extrabold text-orange-600 font-mono">
                  {selectedDriver?.currentSafetyScore} <span className="text-xs text-slate-400 font-normal">/ 100</span>
                </div>
              </div>

              <div>
                <div className="text-[11px] text-slate-500 font-semibold uppercase">Évaluation IA</div>
                <div className="mt-1">
                  <span className="bg-orange-50 border border-orange-200 text-orange-800 font-bold text-xs px-3 py-1 rounded-full inline-block">
                    {tipsData.overallRatingLabel}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* AI Profile Narrative Summary */}
          <div className="bg-gradient-to-r from-orange-50 via-white to-orange-50/30 border border-orange-200 rounded-xl p-5 shadow-xs space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold text-orange-800 uppercase tracking-wider">
              <BrainCircuit className="w-4 h-4 text-orange-600" />
              <span>Synthèse Comportementale par l'IA</span>
            </div>
            <p className="text-xs text-slate-700 leading-relaxed font-medium">
              "{tipsData.profileSummary}"
            </p>
          </div>

          {/* Identified Risk Trends & Actionable Coaching Tips Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Column 1: Identified Risk Trends */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <span className="text-xs font-bold text-slate-900 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-500" />
                  Tendances & Facteurs de Risque
                </span>
                <span className="text-[10px] bg-slate-100 px-2 py-0.5 rounded text-slate-600 font-bold">
                  {tipsData.identifiedRiskTrends.length} observés
                </span>
              </div>

              <div className="space-y-3">
                {tipsData.identifiedRiskTrends.map((trend, idx) => (
                  <div key={idx} className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="text-xs font-bold text-slate-900 leading-tight">
                        {trend.title}
                      </h4>
                      {getSeverityBadge(trend.severity)}
                    </div>
                    <p className="text-[11px] text-slate-600 leading-relaxed">
                      {trend.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Column 2 & 3: Actionable Coaching Tips */}
            <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <span className="text-xs font-bold text-slate-900 flex items-center gap-2">
                  <Award className="w-4 h-4 text-green-600" />
                  Recommandations Concrètes & Actions à Mener
                </span>
                <span className="text-[10px] text-slate-500 font-medium">
                  Cochez les conseils transmis au chauffeur
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {tipsData.actionableTips.map((tip, idx) => {
                  const isChecked = !!completedTips[idx];
                  return (
                    <div
                      key={idx}
                      onClick={() => toggleTipCompleted(idx)}
                      className={`p-4 rounded-xl border transition cursor-pointer flex flex-col justify-between space-y-3 ${
                        isChecked
                          ? 'bg-green-50/60 border-green-300'
                          : 'bg-white border-slate-200 hover:border-orange-300 shadow-2xs'
                      }`}
                    >
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="flex items-center gap-1.5 text-[11px] font-bold text-slate-700">
                            {getCategoryIcon(tip.category)}
                            <span>{tip.category}</span>
                          </span>

                          <button
                            type="button"
                            className={`w-5 h-5 rounded-md flex items-center justify-center transition border ${
                              isChecked
                                ? 'bg-green-600 border-green-600 text-white'
                                : 'bg-white border-slate-300 text-transparent hover:border-slate-400'
                            }`}
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <h4 className="text-xs font-bold text-slate-900 leading-snug">
                          {tip.title}
                        </h4>

                        <p className="text-[11px] text-slate-600 leading-relaxed">
                          {tip.recommendation}
                        </p>
                      </div>

                      <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[10px]">
                        <span className="text-slate-500 font-medium">Gain estimé:</span>
                        <span className="font-mono font-bold text-green-700 bg-green-100 px-2 py-0.5 rounded border border-green-200">
                          {tip.expectedImpact}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Target Milestone & Incentive Banner */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 text-white shadow-xs flex flex-wrap items-center justify-between gap-6">
            <div className="space-y-2 max-w-xl">
              <div className="flex items-center gap-2 text-xs font-bold text-orange-400 uppercase tracking-wider">
                <Target className="w-4 h-4 text-orange-400" />
                <span>Objectif de Performance & Incentive Chauffeur</span>
              </div>
              <h3 className="text-lg font-bold text-white">
                {tipsData.targetMilestone.targetGoal}
              </h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                Recompense motivante préconisée : <strong className="text-green-400">{tipsData.targetMilestone.potentialBonusReward}</strong>.
              </p>
            </div>

            <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 text-center min-w-[200px]">
              <div className="text-[11px] text-slate-400 font-semibold uppercase mb-1">Cible Score à 30 Jours</div>
              <div className="text-3xl font-extrabold text-green-400 font-mono">
                {tipsData.targetMilestone.targetScore} <span className="text-xs text-slate-400 font-normal">/ 100</span>
              </div>
              <div className="w-full bg-slate-700 h-2 rounded-full mt-3 overflow-hidden">
                <div
                  className="bg-green-400 h-full rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, (selectedDriver?.currentSafetyScore / tipsData.targetMilestone.targetScore) * 100)}%` }}
                />
              </div>
            </div>
          </div>

          {/* Export & Actions Footer */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
            <div className="text-xs text-slate-500 font-medium">
              Fiche de coaching prête pour briefing individuel ou impression.
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handleCopySMS}
                className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs px-3.5 py-2 rounded-lg transition flex items-center gap-2 cursor-pointer"
              >
                {copiedText ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                    <span className="text-green-700">Copié dans le presse-papier !</span>
                  </>
                ) : (
                  <>
                    <Share2 className="w-4 h-4 text-slate-600" />
                    <span>Copier Format WhatsApp / SMS</span>
                  </>
                )}
              </button>

              <button
                onClick={() => window.print()}
                className="bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs px-4 py-2 rounded-lg transition flex items-center gap-2 shadow-2xs cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>Imprimer Fiche Chauffeur</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
