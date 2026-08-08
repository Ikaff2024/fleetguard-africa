import React, { useState, useMemo } from 'react';
import { Organization, Driver, Vehicle } from '../../types';
import { useFatigue, useFatigueFrameworks } from '../../hooks/useFleetData';
import {
  DriverFatigueMetrics,
  ShiftScheduleSlot,
  ShiftRotationSuggestion,
  LegalRegionFramework,
  LegalDrivingFrameworkConfig,
} from '../../types';
import {
  Zap,
  ShieldAlert,
  ShieldCheck,
  Clock,
  Moon,
  Battery,
  BatteryCharging,
  BatteryWarning,
  RefreshCw,
  AlertTriangle,
  UserX,
  CheckCircle2,
  Calendar,
  Send,
  Sparkles,
  ArrowRightLeft,
  BookOpen,
  Truck,
  Info,
  Check,
  Award,
} from 'lucide-react';

interface ShiftFatigueOptimizerProps {
  currentOrg: Organization;
  drivers: Driver[];
  vehicles: Vehicle[];
  onNavigateToMessaging?: (driverId: string) => void;
}

export const ShiftFatigueOptimizer: React.FC<ShiftFatigueOptimizerProps> = ({
  currentOrg,
  drivers,
  vehicles,
  onNavigateToMessaging,
}) => {
  // Region / Legal Framework
  const [selectedRegion, setSelectedRegion] = useState<LegalRegionFramework>('UEMOA_CEDEAO');

  /**
   * Charge de travail mesurée, et non planifiée.
   *
   * Les heures viennent des trajets reconstruits à partir des positions
   * remontées du terrain. L'écran affichait auparavant un jeu de démonstration
   * filtré sur l'identifiant d'organisation : en base réelle, cet identifiant
   * est un UUID qui ne correspondait à rien, et tous les compteurs restaient à
   * zéro.
   */
  const fatigueQuery = useFatigue(selectedRegion);
  const frameworksQuery = useFatigueFrameworks();

  const activeFramework: LegalDrivingFrameworkConfig = useMemo(
    () =>
      fatigueQuery.data?.framework ?? {
        region: selectedRegion,
        name: 'Cadre en cours de chargement',
        maxDailyDrivingHours: 9,
        maxWeeklyDrivingHours: 56,
        maxBiWeeklyDrivingHours: 90,
        mandatoryBreakAfterHours: 4.5,
        mandatoryBreakDurationMinutes: 45,
        minDailyRestHours: 11,
        minWeeklyRestHours: 45,
        maxNightHoursPerShift: 4,
        description: '',
      },
    [fatigueQuery.data, selectedRegion],
  );

  // Main Active Sub-Tab
  const [activeTab, setActiveTab] = useState<'SUGGESTIONS' | 'MATRIX' | 'PLANNER' | 'COMPLIANCE'>(
    'SUGGESTIONS',
  );

  const fatigueMetrics = useMemo<DriverFatigueMetrics[]>(
    () =>
      (fatigueQuery.data?.drivers ?? []).map(driver => ({
        ...driver,
        organizationId: currentOrg.id,
      })),
    [fatigueQuery.data, currentOrg.id],
  );

  /**
   * Missions réellement effectuées, déduites des trajets.
   *
   * Le planning prévisionnel n'existe pas encore côté serveur : plutôt que
   * d'afficher des créneaux inventés, l'écran montre ce que chaque chauffeur a
   * fait. C'est ce qui fonde une décision d'affectation.
   */
  const scheduleSlots = useMemo<ShiftScheduleSlot[]>(
    () =>
      (fatigueQuery.data?.shifts ?? []).map(shift => {
        const start = new Date(shift.startedAt);
        const end = new Date(shift.endedAt);
        const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const;
        return {
          id: shift.id,
          organizationId: currentOrg.id,
          driverId: shift.driverId,
          driverName: shift.driverName,
          assignedVehicleId: '',
          vehicleImmatriculation: shift.vehicleImmatriculation,
          routeTitle: `${Math.round(shift.distanceKm)} km parcourus`,
          corridorDistanceKm: Math.round(shift.distanceKm),
          dayOfWeek: days[start.getDay()]!,
          shiftDate: shift.startedAt.slice(0, 10),
          startTime: start.toTimeString().slice(0, 5),
          endTime: end.toTimeString().slice(0, 5),
          plannedHours: shift.drivingHours,
          nightHours: shift.nightHours,
          fatigueRiskOnCompletion:
            fatigueQuery.data?.drivers.find(d => d.driverId === shift.driverId)?.fatigueScore ?? 0,
          status: 'COMPLETED' as const,
        };
      }),
    [fatigueQuery.data, currentOrg.id],
  );

  // Selected Corridor Route for Algorithmic Rotation
  const [selectedCorridor, setSelectedCorridor] = useState<string>(
    'Corridor Cotonou - Parakou - Malanville (750 km)',
  );
  const [plannedTripHours, setPlannedTripHours] = useState<number>(8.0);
  const [includesNightDriving, setIncludesNightDriving] = useState<boolean>(false);
  const [isCalculatingRotation, setIsCalculatingRotation] = useState<boolean>(false);
  const [activeRotationResult, setActiveRotationResult] = useState<{
    primary: ShiftRotationSuggestion;
    relay: ShiftRotationSuggestion | null;
    excluded: ShiftRotationSuggestion[];
  } | null>(null);

  // Modal / Alert Notifications State
  const [notificationToast, setNotificationToast] = useState<string | null>(null);
  const [appliedRotationSuccessModal, setAppliedRotationSuccessModal] = useState<boolean>(false);

  // Matrix Filter
  const [matrixFilterRisk, setMatrixFilterRisk] = useState<string>('ALL');
  const [searchDriverQuery, setSearchDriverQuery] = useState<string>('');

  // Auto-Balance Animation

  // Filter metrics for organization drivers
  const orgDriversMap = useMemo(() => {
    const map = new Map<string, Driver>();
    drivers.forEach(d => map.set(d.id, d));
    return map;
  }, [drivers]);

  // Compute Summary KPI Stats
  const kpiStats = useMemo(() => {
    const total = fatigueMetrics.length;
    const criticalCount = fatigueMetrics.filter(
      m => m.fatigueLevel === 'CRITICAL' || m.isMandatoryRestEnforced,
    ).length;
    const highCount = fatigueMetrics.filter(m => m.fatigueLevel === 'HIGH').length;
    const lowCount = fatigueMetrics.filter(m => m.fatigueLevel === 'LOW').length;
    const avgFatigue =
      total > 0 ? Math.round(fatigueMetrics.reduce((acc, m) => acc + m.fatigueScore, 0) / total) : 0;

    return { total, criticalCount, highCount, lowCount, avgFatigue };
  }, [fatigueMetrics]);

  // Calculate Shift Rotation Suggestions via Anti-Burnout Engine
  const handleCalculateRotation = () => {
    setIsCalculatingRotation(true);
    setTimeout(() => {
      const suggestions: ShiftRotationSuggestion[] = fatigueMetrics.map(m => {
        const driver = orgDriversMap.get(m.driverId);
        const driverName = driver?.fullName || 'Conducteur Inconnu';
        const assignedVehicleId = driver?.assignedVehicleId;

        // Calculate Suitability Score (0 - 100)
        let score = 100;

        // Deduct for fatigue
        score -= m.fatigueScore * 0.5;

        // Deduct for remaining hours vs planned hours
        if (m.remainingDailyHours < plannedTripHours) {
          score -= (plannedTripHours - m.remainingDailyHours) * 15;
        }

        // Night driving penalty if trip includes night
        if (includesNightDriving) {
          score -= m.nightHoursDrivenLast7Days * 2.5;
        }

        // Consecutive days worked penalty
        score -= m.consecutiveDaysWorked * 4;

        // Enforced rest or critical fatigue => 0
        if (m.isMandatoryRestEnforced || m.fatigueLevel === 'CRITICAL') {
          score = 0;
        }

        score = Math.max(0, Math.min(100, Math.round(score)));

        let suggestedRole: ShiftRotationSuggestion['suggestedRole'] = 'LOCAL_DISTRIBUTION';
        if (m.isMandatoryRestEnforced || score < 30) {
          suggestedRole = 'MANDATORY_REST';
        } else if (score >= 75) {
          suggestedRole = 'PRIMARY_CORRIDOR_DRIVER';
        } else if (score >= 50) {
          suggestedRole = 'RELAY_DRIVER';
        }

        const reasons: string[] = [];
        const warnings: string[] = [];

        if (score >= 75) {
          reasons.push(
            `Niveau de fatigue bas (${m.fatigueScore}%) avec ${m.remainingDailyHours}h de marge quotidienne.`,
          );
          reasons.push(
            `Repos observé depuis le dernier trajet : (${m.lastRestDurationHours}h de récupération).`,
          );
        } else if (score >= 50) {
          reasons.push(`Adapté comme conducteur de relais ou sur trajet court.`);
          warnings.push(`Charge de conduite hebdomadaire de ${m.hoursDrivenThisWeek}h.`);
        } else {
          warnings.push(`Score de fatigue élevé (${m.fatigueScore}%).`);
          if (m.isMandatoryRestEnforced) {
            warnings.push(`Repos obligatoire de 36h-45h en cours d'application.`);
          }
          if (m.remainingDailyHours < plannedTripHours) {
            warnings.push(
              `Heures quotidiennes restantes (${m.remainingDailyHours}h) inférieures à la durée du trajet (${plannedTripHours}h).`,
            );
          }
        }

        return {
          driverId: m.driverId,
          driverName,
          assignedVehicleId,
          suitabilityScore: score,
          suggestedRole,
          fatigueScore: m.fatigueScore,
          remainingDailyHours: m.remainingDailyHours,
          remainingWeeklyHours: m.remainingWeeklyHours,
          reasons,
          warnings,
          recommendedShiftStart: '06:00',
          recommendedShiftEnd: `${Math.floor(6 + plannedTripHours)}:00`,
        };
      });

      // Sort by suitability score descending
      const sorted = [...suggestions].sort((a, b) => b.suitabilityScore - a.suitabilityScore);

      const primary = sorted.find(s => s.suggestedRole === 'PRIMARY_CORRIDOR_DRIVER') || sorted[0];
      const relay =
        sorted.find(s => s.driverId !== primary?.driverId && s.suggestedRole !== 'MANDATORY_REST') || null;
      const excluded = sorted.filter(s => s.suggestedRole === 'MANDATORY_REST' || s.suitabilityScore < 35);

      setActiveRotationResult({ primary, relay, excluded });
      setIsCalculatingRotation(false);
    }, 600);
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification Banner */}
      {notificationToast && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-4 py-3 rounded-xl shadow-2xl border border-slate-700 flex items-center gap-3 animate-bounce">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <span className="text-xs font-semibold">{notificationToast}</span>
        </div>
      )}

      {/* Header Banner & Regional Regulatory Switcher */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-xs transition-colors space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-orange-600 dark:text-orange-400 text-xs font-bold uppercase tracking-wider">
              <Zap className="w-4 h-4 text-orange-500 animate-pulse" />
              <span>Module Sécurité Conducteur & Prévention du Burnout</span>
            </div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2.5 mt-1">
              <span>Optimiseur de Roulement & Anti-Fatigue Conducteurs</span>
              <span className="bg-orange-100 dark:bg-orange-950/80 text-orange-800 dark:text-orange-300 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border border-orange-200 dark:border-orange-800">
                IA & Réglementation UEMOA
              </span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-3xl leading-relaxed">
              Algorithme prédictif de rotation des plannings basé sur l'indice de charge horaire, le suivi du
              temps de conduite quotidien (max 9h) et le repos hebdomadaire obligatoire pour prévenir le
              surmenage et l'assoupissement au volant.
            </p>
          </div>

          {/* Legal Framework Selector */}
          <div className="bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 p-3 rounded-xl space-y-1 text-xs shrink-0">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <BookOpen className="w-3.5 h-3.5 text-orange-500" />
              Réglementation Régionale
            </div>
            <select
              value={selectedRegion}
              onChange={e => setSelectedRegion(e.target.value as LegalRegionFramework)}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 font-bold text-slate-800 dark:text-slate-200 text-xs focus:ring-2 focus:ring-orange-500 cursor-pointer"
            >
              {(frameworksQuery.data ?? []).map(fw => (
                <option key={fw.region} value={fw.region}>
                  {fw.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Regulatory Thresholds Bar */}
        <div className="bg-slate-900 text-slate-200 p-3.5 rounded-xl border border-slate-800 flex flex-wrap items-center justify-between gap-4 text-xs font-mono">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              Conduite Max / Jour:{' '}
              <strong className="text-amber-400">{activeFramework.maxDailyDrivingHours}h</strong>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-sky-400 shrink-0" />
            <span>
              Plafond Semaine:{' '}
              <strong className="text-sky-400">{activeFramework.maxWeeklyDrivingHours}h</strong>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>
              Pause Obligatoire:{' '}
              <strong className="text-emerald-400">
                {activeFramework.mandatoryBreakDurationMinutes} min
              </strong>{' '}
              après <strong className="text-emerald-400">{activeFramework.mandatoryBreakAfterHours}h</strong>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Moon className="w-4 h-4 text-purple-400 shrink-0" />
            <span>
              Repos Quotidien Min:{' '}
              <strong className="text-purple-400">{activeFramework.minDailyRestHours}h consécutives</strong>
            </span>
          </div>
        </div>
      </div>

      {/* KPI Overview Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-xl shadow-xs transition-colors">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs mb-1">
            <span className="font-medium">Conducteurs Évalués</span>
            <BatteryCharging className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-2xl font-bold font-mono text-slate-900 dark:text-slate-100">
            {kpiStats.total}
          </div>
          <div className="text-[10px] text-blue-600 dark:text-blue-400 font-semibold mt-1">
            Indice de fatigue temps réel
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-xl shadow-xs transition-colors">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs mb-1">
            <span className="font-medium">Forme Optimale</span>
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
            {kpiStats.lowCount}
          </div>
          <div className="text-[10px] text-emerald-700 dark:text-emerald-300 font-semibold mt-1">
            Prêts pour long-courrier
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-xl shadow-xs transition-colors">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs mb-1">
            <span className="font-medium">Vigilance Accrue</span>
            <AlertTriangle className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-bold font-mono text-amber-600 dark:text-amber-400">
            {kpiStats.highCount}
          </div>
          <div className="text-[10px] text-amber-700 dark:text-amber-300 font-semibold mt-1">
            Marge de conduite à surveiller
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-xl shadow-xs transition-colors">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs mb-1">
            <span className="font-medium">Repos Obligatoire</span>
            <ShieldAlert className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-2xl font-bold font-mono text-rose-600 dark:text-rose-400">
            {kpiStats.criticalCount}
          </div>
          <div className="text-[10px] text-rose-700 dark:text-rose-300 font-bold mt-1">
            Repos obligatoire atteint
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-xl shadow-xs transition-colors">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs mb-1">
            <span className="font-medium">Niveau Fatigue Flotte</span>
            <BatteryWarning className="w-4 h-4 text-orange-500" />
          </div>
          <div className="text-2xl font-bold font-mono text-orange-600 dark:text-orange-400">
            {kpiStats.avgFatigue}%
          </div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400 font-medium mt-1">
            Moyenne générale active
          </div>
        </div>
      </div>

      {/* Navigation Sub-Tabs Bar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-2 rounded-xl shadow-xs flex flex-wrap items-center justify-between gap-2 transition-colors">
        <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto">
          <button
            onClick={() => setActiveTab('SUGGESTIONS')}
            className={`px-4 py-2 rounded-lg font-bold text-xs flex items-center gap-2 transition cursor-pointer whitespace-nowrap ${
              activeTab === 'SUGGESTIONS'
                ? 'bg-orange-500 text-white shadow-2xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span>Optimiseur d'Affectations & Roulements</span>
          </button>

          <button
            onClick={() => setActiveTab('MATRIX')}
            className={`px-4 py-2 rounded-lg font-bold text-xs flex items-center gap-2 transition cursor-pointer whitespace-nowrap ${
              activeTab === 'MATRIX'
                ? 'bg-orange-500 text-white shadow-2xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Battery className="w-4 h-4" />
            <span>Matrice Fatigue & Risque Burnout</span>
          </button>

          <button
            onClick={() => setActiveTab('PLANNER')}
            className={`px-4 py-2 rounded-lg font-bold text-xs flex items-center gap-2 transition cursor-pointer whitespace-nowrap ${
              activeTab === 'PLANNER'
                ? 'bg-orange-500 text-white shadow-2xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Calendar className="w-4 h-4" />
            <span>Planning 7J & Équilibrage Charge</span>
          </button>

          <button
            onClick={() => setActiveTab('COMPLIANCE')}
            className={`px-4 py-2 rounded-lg font-bold text-xs flex items-center gap-2 transition cursor-pointer whitespace-nowrap ${
              activeTab === 'COMPLIANCE'
                ? 'bg-orange-500 text-white shadow-2xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            <span>Guide & Audit Conformité UEMOA</span>
          </button>
        </div>
      </div>

      {/* TAB 1: ALGORITHMIC SHIFT ROTATION SUGGESTER */}
      {activeTab === 'SUGGESTIONS' && (
        <div className="space-y-6 animate-fade-in">
          {/* Corridor & Trip Configurator Card */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs transition-colors space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Truck className="w-4 h-4 text-orange-500" />
                  <span>Configuration du Trajet & Recherche du Binôme Optimisé</span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  L'IA analyse le statut de repos de la flotte pour suggérer le conducteur idéal et le relais
                  préventif.
                </p>
              </div>

              <button
                onClick={handleCalculateRotation}
                disabled={isCalculatingRotation}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white font-bold text-xs flex items-center gap-2 shadow-sm cursor-pointer disabled:opacity-50 transition"
              >
                {isCalculatingRotation ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                <span>Exécuter l'Algorithme Anti-Fatigue UEMOA</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  Corridor / Ligne Logistique
                </label>
                <select
                  value={selectedCorridor}
                  onChange={e => setSelectedCorridor(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 font-bold text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-orange-500"
                >
                  <option value="Corridor Cotonou - Parakou - Malanville (750 km)">
                    🇲🇬 Corridor Cotonou - Parakou - Malanville (750 km)
                  </option>
                  <option value="Axe Transfrontalier Malanville - Niamey (300 km)">
                    🇳🇪 Axe Transfrontalier Malanville - Niamey (300 km)
                  </option>
                  <option value="Ligne Dakar - Tambacounda - Kidira (650 km)">
                    🇸🇳 Ligne Dakar - Tambacounda - Kidira (650 km)
                  </option>
                  <option value="Axe Abidjan - Bouaké - Ferkessédougou (600 km)">
                    🇨🇮 Axe Abidjan - Bouaké - Ferkessédougou (600 km)
                  </option>
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  Durée de Conduite Estimée (Heures)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    max="14"
                    step="0.5"
                    value={plannedTripHours}
                    onChange={e => setPlannedTripHours(parseFloat(e.target.value) || 1)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 font-mono font-bold text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-orange-500"
                  />
                  <span className="font-mono text-slate-500 font-bold shrink-0">heures</span>
                </div>
              </div>

              <div className="flex items-center">
                <label className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 w-full cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition">
                  <Moon
                    className={`w-5 h-5 ${includesNightDriving ? 'text-purple-500' : 'text-slate-400'}`}
                  />
                  <div>
                    <span className="font-bold text-slate-900 dark:text-slate-100 block text-xs">
                      Trajet de Nuit (22h - 06h)
                    </span>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400">
                      Les heures de nuit pèsent 2,5 points par heure dans le calcul
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={includesNightDriving}
                    onChange={e => setIncludesNightDriving(e.target.checked)}
                    className="ml-auto accent-orange-500 w-4 h-4 cursor-pointer"
                  />
                </label>
              </div>
            </div>
          </div>

          {/* Active Rotation Optimization Results Display */}
          {activeRotationResult && (
            <div className="space-y-4 animate-fade-in">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider flex items-center gap-2">
                  <Award className="w-4 h-4 text-orange-500" />
                  <span>Résultats du Calcul de Rotation Optimale</span>
                </h4>

                <button
                  onClick={() => setAppliedRotationSuccessModal(true)}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-2xs transition cursor-pointer"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Appliquer la Rotation sur le Feuille de Route</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Primary Recommended Driver Card */}
                {activeRotationResult.primary && (
                  <div className="bg-gradient-to-br from-emerald-500/10 via-white dark:via-slate-900 to-emerald-500/5 border-2 border-emerald-500 rounded-xl p-5 shadow-sm space-y-3 relative overflow-hidden">
                    <div className="absolute top-0 right-0 bg-emerald-500 text-white text-[10px] font-extrabold px-3 py-1 rounded-bl-xl uppercase tracking-wider flex items-center gap-1">
                      <Check className="w-3 h-3" />
                      Recommandation N°1 (Titulaire)
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-emerald-600 text-white font-extrabold text-base flex items-center justify-center shadow-md">
                        {activeRotationResult.primary.driverName
                          .split(' ')
                          .map(n => n[0])
                          .join('')}
                      </div>

                      <div>
                        <h4 className="font-bold text-slate-900 dark:text-slate-100 text-base">
                          {activeRotationResult.primary.driverName}
                        </h4>
                        <div className="text-xs text-emerald-700 dark:text-emerald-400 font-bold flex items-center gap-1.5 mt-0.5">
                          <span>Score d'Compatibilité IA:</span>
                          <span className="font-mono text-sm font-extrabold bg-emerald-100 dark:bg-emerald-950 px-2 py-0.5 rounded border border-emerald-300 dark:border-emerald-800">
                            {activeRotationResult.primary.suitabilityScore} / 100
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs font-mono bg-white/80 dark:bg-slate-900/80 p-2.5 rounded-lg border border-emerald-200 dark:border-emerald-800/60">
                      <div>
                        <span className="text-slate-400 block text-[10px]">Indice Fatigue:</span>
                        <strong className="text-emerald-600 dark:text-emerald-400">
                          {activeRotationResult.primary.fatigueScore}%
                        </strong>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px]">Marge Restante:</span>
                        <strong className="text-slate-800 dark:text-slate-200">
                          {activeRotationResult.primary.remainingDailyHours}h disponibles
                        </strong>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        Facteurs Clés de Succès:
                      </span>
                      <ul className="text-xs text-slate-700 dark:text-slate-300 space-y-1">
                        {activeRotationResult.primary.reasons.map((r, idx) => (
                          <li key={idx} className="flex items-center gap-1.5">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                            <span>{r}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}

                {/* Secondary Relay Driver Card */}
                {activeRotationResult.relay && (
                  <div className="bg-gradient-to-br from-sky-500/10 via-white dark:via-slate-900 to-sky-500/5 border border-sky-300 dark:border-sky-800 rounded-xl p-5 shadow-sm space-y-3 relative overflow-hidden">
                    <div className="absolute top-0 right-0 bg-sky-600 text-white text-[10px] font-extrabold px-3 py-1 rounded-bl-xl uppercase tracking-wider flex items-center gap-1">
                      <ArrowRightLeft className="w-3 h-3" />
                      Conducteur de Relais / Binôme
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-sky-600 text-white font-extrabold text-base flex items-center justify-center shadow-md">
                        {activeRotationResult.relay.driverName
                          .split(' ')
                          .map(n => n[0])
                          .join('')}
                      </div>

                      <div>
                        <h4 className="font-bold text-slate-900 dark:text-slate-100 text-base">
                          {activeRotationResult.relay.driverName}
                        </h4>
                        <div className="text-xs text-sky-700 dark:text-sky-400 font-bold flex items-center gap-1.5 mt-0.5">
                          <span>Score d'Compatibilité IA:</span>
                          <span className="font-mono text-sm font-extrabold bg-sky-100 dark:bg-sky-950 px-2 py-0.5 rounded border border-sky-300 dark:border-sky-800">
                            {activeRotationResult.relay.suitabilityScore} / 100
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs font-mono bg-white/80 dark:bg-slate-900/80 p-2.5 rounded-lg border border-sky-200 dark:border-sky-800/60">
                      <div>
                        <span className="text-slate-400 block text-[10px]">Indice Fatigue:</span>
                        <strong className="text-sky-600 dark:text-sky-400">
                          {activeRotationResult.relay.fatigueScore}%
                        </strong>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px]">Prise de Relais:</span>
                        <strong className="text-slate-800 dark:text-slate-200">
                          Après {Math.round(plannedTripHours / 2)}h de trajet
                        </strong>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        Recommandations de Service:
                      </span>
                      <ul className="text-xs text-slate-700 dark:text-slate-300 space-y-1">
                        {activeRotationResult.relay.reasons.map((r, idx) => (
                          <li key={idx} className="flex items-center gap-1.5">
                            <Info className="w-3.5 h-3.5 text-sky-500 shrink-0" />
                            <span>{r}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
              </div>

              {/* Excluded Drivers List */}
              {activeRotationResult.excluded.length > 0 && (
                <div className="bg-rose-50/60 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/60 rounded-xl p-4 space-y-2">
                  <div className="flex items-center gap-2 text-rose-700 dark:text-rose-400 font-bold text-xs uppercase tracking-wider">
                    <UserX className="w-4 h-4 text-rose-500" />
                    <span>Conducteurs Exclus du Trajet (Repos Réglementaire Impératif)</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    {activeRotationResult.excluded.map(ex => (
                      <div
                        key={ex.driverId}
                        className="bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-rose-200 dark:border-rose-900/40 flex items-center justify-between"
                      >
                        <div>
                          <strong className="text-slate-900 dark:text-slate-100 font-bold">
                            {ex.driverName}
                          </strong>
                          <div className="text-[10px] text-rose-600 dark:text-rose-400 font-medium">
                            {ex.warnings?.[0] || 'Repos obligatoire imposé'}
                          </div>
                        </div>

                        <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                          Exclu
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: DETAILED FATIGUE & BURNOUT MATRIX */}
      {activeTab === 'MATRIX' && (
        <div className="space-y-6 animate-fade-in">
          {/* Search & Filter Toolbar */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-xl shadow-xs flex flex-wrap items-center justify-between gap-4 transition-colors">
            <div className="relative flex-1 min-w-[220px]">
              <input
                type="text"
                value={searchDriverQuery}
                onChange={e => setSearchDriverQuery(e.target.value)}
                placeholder="Rechercher un conducteur par nom..."
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg pl-3 pr-3 py-2 text-xs font-medium text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-orange-500"
              />
            </div>

            <div className="flex items-center gap-2 text-xs">
              <span className="font-bold text-slate-700 dark:text-slate-300">Niveau de Risque:</span>
              <select
                value={matrixFilterRisk}
                onChange={e => setMatrixFilterRisk(e.target.value)}
                className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 font-bold text-slate-800 dark:text-slate-200 text-xs focus:ring-2 focus:ring-orange-500 cursor-pointer"
              >
                <option value="ALL">Tous les niveaux (Tous)</option>
                <option value="LOW">🟢 Forme Optimale (LOW)</option>
                <option value="MODERATE">🟡 Vigilance Modérée (MODERATE)</option>
                <option value="HIGH">🟧 Risque Élevé (HIGH)</option>
                <option value="CRITICAL">🔴 Repos Obligatoire (CRITICAL)</option>
              </select>
            </div>
          </div>

          {/* Drivers Fatigue Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {fatigueMetrics
              .filter(m => {
                const driver = orgDriversMap.get(m.driverId);
                const matchesName =
                  !searchDriverQuery ||
                  driver?.fullName.toLowerCase().includes(searchDriverQuery.toLowerCase());
                const matchesRisk = matrixFilterRisk === 'ALL' || m.fatigueLevel === matrixFilterRisk;
                return matchesName && matchesRisk;
              })
              .map(metric => {
                const driver = orgDriversMap.get(metric.driverId);
                const driverName = driver?.fullName || 'Conducteur Inconnu';

                const isCritical = metric.fatigueLevel === 'CRITICAL' || metric.isMandatoryRestEnforced;
                const isHigh = metric.fatigueLevel === 'HIGH';

                const cardBg = isCritical
                  ? 'bg-rose-50/50 dark:bg-rose-950/20 border-rose-300 dark:border-rose-900'
                  : isHigh
                    ? 'bg-amber-50/50 dark:bg-amber-950/20 border-amber-300 dark:border-amber-900'
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800';

                return (
                  <div
                    key={metric.driverId}
                    className={`rounded-xl border p-5 shadow-xs hover:shadow-md transition duration-200 space-y-4 flex flex-col justify-between ${cardBg}`}
                  >
                    <div className="space-y-3">
                      {/* Driver Avatar Header */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-11 h-11 rounded-full text-white font-extrabold text-sm flex items-center justify-center shadow-xs ${
                              isCritical ? 'bg-rose-600' : isHigh ? 'bg-amber-600' : 'bg-emerald-600'
                            }`}
                          >
                            {driverName
                              .split(' ')
                              .map(n => n[0])
                              .join('')}
                          </div>

                          <div>
                            <h4 className="font-bold text-slate-900 dark:text-slate-100 text-sm">
                              {driverName}
                            </h4>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                              Permis: {driver?.licenseNumber || 'non renseigné'}
                            </div>
                          </div>
                        </div>

                        <span
                          className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full uppercase border ${
                            isCritical
                              ? 'bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300 border-rose-300'
                              : isHigh
                                ? 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border-amber-300'
                                : !metric.hasData
                                  ? 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-300'
                                  : 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border-emerald-300'
                          }`}
                        >
                          {/* « DISPONIBLE » s'affichait aussi pour un chauffeur
                              dont aucun trajet n'avait été reconstruit : le
                              serveur renvoie alors un score de 0 et un niveau
                              LOW, faute de mesure. L'absence de donnée devenait
                              une autorisation de rouler. */}
                          {!metric.hasData
                            ? '❔ NON MESURÉ'
                            : isCritical
                              ? '🚨 REPOS FORCÉ'
                              : isHigh
                                ? '⚠️ VIGILANCE'
                                : '🟢 DISPONIBLE'}
                        </span>
                      </div>

                      {/* Live Fatigue Score Gauge */}
                      <div className="bg-slate-50 dark:bg-slate-800/80 p-3 rounded-xl border border-slate-200 dark:border-slate-700/80 space-y-2">
                        <div className="flex items-center justify-between text-xs font-bold">
                          <span className="text-slate-600 dark:text-slate-300">
                            Indice de charge horaire :
                          </span>
                          <span
                            className={`font-mono text-sm ${
                              isCritical
                                ? 'text-rose-600 dark:text-rose-400'
                                : isHigh
                                  ? 'text-amber-600 dark:text-amber-400'
                                  : 'text-emerald-600 dark:text-emerald-400'
                            }`}
                          >
                            {metric.fatigueScore} / 100
                          </span>
                        </div>

                        <div className="w-full bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              isCritical ? 'bg-rose-500' : isHigh ? 'bg-amber-500' : 'bg-emerald-500'
                            }`}
                            style={{ width: `${metric.fatigueScore}%` }}
                          ></div>
                        </div>
                      </div>

                      {/* Daily & Weekly Progress Bars vs UEMOA limits */}
                      <div className="space-y-2 text-xs">
                        {/* Daily Limit Bar */}
                        <div>
                          <div className="flex justify-between text-[11px] font-medium text-slate-600 dark:text-slate-400">
                            <span>Conduite Aujourd'hui:</span>
                            <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                              {metric.hoursDrivenToday}h / {metric.maxDailyHoursLimit}h max
                            </span>
                          </div>
                          <div className="w-full bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden mt-1">
                            <div
                              className={`h-full rounded-full ${
                                metric.hoursDrivenToday >= metric.maxDailyHoursLimit
                                  ? 'bg-rose-500'
                                  : metric.hoursDrivenToday > 7
                                    ? 'bg-amber-500'
                                    : 'bg-sky-500'
                              }`}
                              style={{
                                width: `${Math.min(
                                  100,
                                  (metric.hoursDrivenToday / metric.maxDailyHoursLimit) * 100,
                                )}%`,
                              }}
                            ></div>
                          </div>
                        </div>

                        {/* Weekly Limit Bar */}
                        <div>
                          <div className="flex justify-between text-[11px] font-medium text-slate-600 dark:text-slate-400">
                            <span>Cumul Semaine (UEMOA):</span>
                            <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                              {metric.hoursDrivenThisWeek}h / {metric.maxWeeklyHoursLimit}h max
                            </span>
                          </div>
                          <div className="w-full bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden mt-1">
                            <div
                              className={`h-full rounded-full ${
                                metric.hoursDrivenThisWeek >= metric.maxWeeklyHoursLimit
                                  ? 'bg-rose-500'
                                  : metric.hoursDrivenThisWeek > 45
                                    ? 'bg-amber-500'
                                    : 'bg-emerald-500'
                              }`}
                              style={{
                                width: `${Math.min(
                                  100,
                                  (metric.hoursDrivenThisWeek / metric.maxWeeklyHoursLimit) * 100,
                                )}%`,
                              }}
                            ></div>
                          </div>
                        </div>
                      </div>

                      {/* Contributing Factors & Recommendation */}
                      <div className="p-2.5 rounded-lg bg-slate-100/70 dark:bg-slate-800/50 text-[11px] text-slate-700 dark:text-slate-300 leading-snug">
                        <strong className="text-slate-900 dark:text-slate-100 block mb-0.5">
                          Consigne IA Anti-Burnout:
                        </strong>
                        <p>{metric.primaryRecommendation}</p>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="pt-3 border-t border-slate-200/60 dark:border-slate-800 flex items-center justify-between gap-2">
                      {/* Le repos obligatoire découle des heures mesurées et du
                          cadre réglementaire : il se constate, il ne se décide
                          pas d'un clic. Un bouton « lever le repos » laisserait
                          croire qu'une obligation légale s'annule à la
                          demande. */}
                      <span
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 ${
                          metric.isMandatoryRestEnforced
                            ? 'bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                            : 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                        }`}
                      >
                        <ShieldAlert className="w-3.5 h-3.5" />
                        <span>
                          {metric.isMandatoryRestEnforced
                            ? 'Repos réglementaire requis'
                            : 'Peut prendre la route'}
                        </span>
                      </span>

                      {onNavigateToMessaging && (
                        <button
                          onClick={() => onNavigateToMessaging(metric.driverId)}
                          className="px-3 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs transition cursor-pointer flex items-center gap-1"
                        >
                          <Send className="w-3 h-3" />
                          <span>SMS Rest Notice</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* TAB 3: 7-DAY SHIFT SCHEDULE & WORKLOAD BALANCER */}
      {activeTab === 'PLANNER' && (
        <div className="space-y-6 animate-fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs transition-colors space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-orange-500" />
                  <span>Planning Hebdomadaire des Shifts & Simulatrice d'Équilibrage</span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Répartition intelligente de la charge de travail entre conducteurs pour éviter la
                  concentration d'heures de nuit.
                </p>
              </div>

              {/* Le tableau montre les missions réellement effectuées : on ne
                  rééquilibre pas le passé. La planification prévisionnelle
                  n'existe pas encore côté serveur, et un bouton qui réordonne
                  des créneaux dans le navigateur n'en tiendrait pas lieu. */}
              <button
                onClick={fatigueQuery.reload}
                disabled={fatigueQuery.isLoading}
                className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-100 dark:text-slate-900 font-bold text-xs flex items-center gap-2 shadow-xs transition cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${fatigueQuery.isLoading ? 'animate-spin' : ''}`} />
                <span>Actualiser les heures relevées</span>
              </button>
            </div>

            {/* Schedule Slots Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-200 dark:border-slate-700">
                    <th className="p-3 font-bold">Jour / Date</th>
                    <th className="p-3 font-bold">Conducteur Assigné</th>
                    <th className="p-3 font-bold">Camion / Immat</th>
                    <th className="p-3 font-bold">Ligne Logistique</th>
                    <th className="p-3 font-bold">Heures Prévues</th>
                    <th className="p-3 font-bold">Nuit (22h-06h)</th>
                    <th className="p-3 font-bold">Projection Fatigue</th>
                    <th className="p-3 font-bold text-right">Statut Shift</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-mono">
                  {scheduleSlots.map(slot => {
                    const isRestEnforced = slot.status === 'REST_ENFORCED';

                    return (
                      <tr
                        key={slot.id}
                        className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition ${
                          isRestEnforced ? 'bg-rose-50/40 dark:bg-rose-950/20' : ''
                        }`}
                      >
                        <td className="p-3 font-bold text-slate-900 dark:text-slate-100">
                          <span className="bg-slate-200 dark:bg-slate-800 px-2 py-0.5 rounded text-[11px]">
                            {slot.dayOfWeek} • {slot.shiftDate}
                          </span>
                        </td>

                        <td className="p-3 font-sans font-bold text-slate-900 dark:text-slate-100">
                          {slot.driverName}
                        </td>

                        <td className="p-3 text-orange-600 dark:text-orange-400 font-bold">
                          {slot.vehicleImmatriculation}
                        </td>

                        <td className="p-3 font-sans text-slate-700 dark:text-slate-300">
                          {slot.routeTitle}
                        </td>

                        <td className="p-3 font-bold text-slate-900 dark:text-slate-100">
                          {slot.plannedHours}h ({slot.startTime} - {slot.endTime})
                        </td>

                        <td className="p-3">
                          {slot.nightHours > 0 ? (
                            <span className="text-purple-600 dark:text-purple-400 font-bold flex items-center gap-1">
                              <Moon className="w-3 h-3" />
                              {slot.nightHours}h Nuit
                            </span>
                          ) : (
                            <span className="text-slate-400 font-sans text-[11px]">0h (Jour)</span>
                          )}
                        </td>

                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <span
                              className={`font-bold ${
                                slot.fatigueRiskOnCompletion > 75
                                  ? 'text-rose-600'
                                  : slot.fatigueRiskOnCompletion > 50
                                    ? 'text-amber-600'
                                    : 'text-emerald-600'
                              }`}
                            >
                              {slot.fatigueRiskOnCompletion}%
                            </span>
                            <div className="w-16 bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden">
                              <div
                                className={`h-full ${
                                  slot.fatigueRiskOnCompletion > 75
                                    ? 'bg-rose-500'
                                    : slot.fatigueRiskOnCompletion > 50
                                      ? 'bg-amber-500'
                                      : 'bg-emerald-500'
                                }`}
                                style={{ width: `${slot.fatigueRiskOnCompletion}%` }}
                              ></div>
                            </div>
                          </div>
                        </td>

                        <td className="p-3 text-right">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-sans font-extrabold uppercase border ${
                              slot.status === 'COMPLETED'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : slot.status === 'IN_PROGRESS'
                                  ? 'bg-blue-50 text-blue-700 border-blue-200'
                                  : slot.status === 'REST_ENFORCED'
                                    ? 'bg-rose-100 text-rose-800 border-rose-300'
                                    : 'bg-slate-100 text-slate-700 border-slate-200'
                            }`}
                          >
                            {slot.status === 'REST_ENFORCED' ? '🚨 REPOSOBLIGATOIRE' : slot.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: LEGAL COMPLIANCE & UEMOA AUDIT GUIDE */}
      {activeTab === 'COMPLIANCE' && (
        <div className="space-y-6 animate-fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-xs transition-colors space-y-4">
            <div className="flex items-center gap-2 text-orange-600 dark:text-orange-400 font-bold text-xs uppercase tracking-wider">
              <BookOpen className="w-4 h-4 text-orange-500" />
              <span>Guide Réglementaire & Sanctions Légales UEMOA / CEDEAO</span>
            </div>

            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
              Directive UEMOA N°08/2009/CM relatives aux temps de conduite et de repos
            </h3>

            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed max-w-4xl">
              Afin de garantir la sécurité sur les corridors inter-états et lutter contre l'accidentologie
              liée à la fatigue au volant, le régulateur communautaire impose des seuils stricts aux
              transporteurs poids lourds.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs pt-2">
              <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
                <h4 className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2 text-sm">
                  <Clock className="w-4 h-4 text-orange-500" />
                  <span>1. Temps de Conduite Journalier & Hebdomadaire</span>
                </h4>
                <ul className="space-y-1.5 text-slate-600 dark:text-slate-300 list-disc list-inside">
                  <li>
                    <strong>Durée journalière maximale:</strong> 9 heures (Extension exceptionnelle à 10
                    heures au maximum 2 fois par semaine).
                  </li>
                  <li>
                    <strong>Durée hebdomadaire maximale:</strong> 56 heures de conduite cumulée.
                  </li>
                  <li>
                    <strong>Plafond bi-hebdomadaire:</strong> 90 heures sur 2 semaines consécutives.
                  </li>
                </ul>
              </div>

              <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
                <h4 className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2 text-sm">
                  <ShieldCheck className="w-4 h-4 text-emerald-500" />
                  <span>2. Pauses de Sécurité & Repos Requis</span>
                </h4>
                <ul className="space-y-1.5 text-slate-600 dark:text-slate-300 list-disc list-inside">
                  <li>
                    <strong>Pause obligatoire:</strong> Interruption minimale de 45 minutes après une période
                    de conduite de 4h30.
                  </li>
                  <li>
                    <strong>Repos quotidien:</strong> Au moins 11 heures consécutives de repos par tranche de
                    24 heures.
                  </li>
                  <li>
                    <strong>Repos hebdomadaire:</strong> Au moins 45 heures de repos ininterrompu toutes les 6
                    journées de service.
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* APPLIED ROTATION SUCCESS MODAL */}
      {appliedRotationSuccessModal && activeRotationResult && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-5">
            <div className="flex items-center gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="p-2.5 rounded-xl bg-emerald-100 text-emerald-800 font-bold">
                <CheckCircle2 className="w-6 h-6 text-emerald-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Rotation notée pour votre organisation
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Cette proposition n’est pas enregistrée par l’application : reportez-la sur vos affectations
                  depuis « Planification des missions », où elle sera vérifiée contre les plafonds de
                  conduite.
                </p>
              </div>
            </div>

            <div className="bg-slate-50 dark:bg-slate-800/80 p-4 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2 text-xs font-mono">
              <div className="flex justify-between">
                <span className="text-slate-500">Corridor Sélectionné:</span>
                <strong className="text-slate-800 dark:text-slate-200">{selectedCorridor}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Conducteur Titulaire:</span>
                <strong className="text-emerald-600">{activeRotationResult.primary.driverName}</strong>
              </div>
              {activeRotationResult.relay && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Conducteur de Relais:</span>
                  <strong className="text-sky-600">{activeRotationResult.relay.driverName}</strong>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setAppliedRotationSuccessModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-900 text-white font-bold text-xs hover:bg-slate-800 transition cursor-pointer"
              >
                Fermer & Retourner au Tableau de Bord
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
