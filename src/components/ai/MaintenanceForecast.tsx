import React, { useState } from 'react';
import { Organization } from '../../types';
import {
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  AreaChart,
  Area,
} from 'recharts';
import {
  Wrench,
  AlertTriangle,
  CheckCircle2,
  Clock,
  TrendingUp,
  Activity,
  Calendar,
  Sparkles,
  ShieldAlert,
  Gauge,
  Cpu,
  DollarSign,
} from 'lucide-react';

interface MaintenanceForecastProps {
  currentOrg: Organization;
}

// Telemetry degradation history for selected vehicle
const VEHICLE_TELEMETRY_SERIES = [
  {
    distanceKm: '142,000 km',
    engineTempC: 88,
    oilPressureBar: 4.2,
    vibrationIndex: 1.2,
    brakeWearPct: 45,
    predictedFailureRisk: 12,
  },
  {
    distanceKm: '144,000 km',
    engineTempC: 90,
    oilPressureBar: 4.0,
    vibrationIndex: 1.4,
    brakeWearPct: 52,
    predictedFailureRisk: 18,
  },
  {
    distanceKm: '146,000 km',
    engineTempC: 93,
    oilPressureBar: 3.7,
    vibrationIndex: 1.8,
    brakeWearPct: 61,
    predictedFailureRisk: 35,
  },
  {
    distanceKm: '148,000 km',
    engineTempC: 98,
    oilPressureBar: 3.2,
    vibrationIndex: 2.6,
    brakeWearPct: 74,
    predictedFailureRisk: 68,
  },
  {
    distanceKm: '150,000 km (Actuel)',
    engineTempC: 104,
    oilPressureBar: 2.8,
    vibrationIndex: 3.4,
    brakeWearPct: 83,
    predictedFailureRisk: 88,
  },
  {
    distanceKm: '152,000 km (Projeté)',
    engineTempC: 112,
    oilPressureBar: 2.1,
    vibrationIndex: 4.8,
    brakeWearPct: 92,
    predictedFailureRisk: 96,
  },
];

// Predictive maintenance alerts per vehicle
interface ComponentRiskAlert {
  id: string;
  vehicleId: string;
  immatriculation: string;
  model: string;
  category: string;
  driverName: string;
  currentOdometer: number;
  criticalComponent: string;
  componentSystem: 'ENGINE' | 'TURBO' | 'BRAKES' | 'TRANSMISSION' | 'COOLING' | 'TIRES';
  failureProbabilityPct: number;
  predictedDaysToFailure: number;
  suggestedServiceDate: string;
  estimatedOdometerAtFailure: number;
  severity: 'CRITICAL' | 'WARNING' | 'MONITORING';
  telemetryTrigger: string;
  recommendedAction: string;
  estimatedRepairCostXOF: number;
  estimatedPreventativeCostXOF: number;
  requiredParts: string[];
}

const PREDICTIVE_ALERTS: ComponentRiskAlert[] = [
  {
    id: 'maint_alert_01',
    vehicleId: 'veh_actros_01',
    immatriculation: 'RB-4592-A',
    model: 'Mercedes Actros 3344 (6x4)',
    category: 'Poids Lourds',
    driverName: 'Moussa Diop',
    currentOdometer: 148500,
    criticalComponent: 'Turbocompresseur & Joint de Collector',
    componentSystem: 'TURBO',
    failureProbabilityPct: 88,
    predictedDaysToFailure: 6,
    suggestedServiceDate: '2026-08-10',
    estimatedOdometerAtFailure: 151200,
    severity: 'CRITICAL',
    telemetryTrigger: "Pression d'huile sous 2.8 bar + vibration anormale à 1800 RPM",
    recommendedAction: 'Remplacement préventif du kit de joint turbo et vidange huile synthétique 15W40.',
    estimatedRepairCostXOF: 1850000,
    estimatedPreventativeCostXOF: 320000,
    requiredParts: ['Kit Joint Turbo Mercedes', 'Filtre Huile High-Duty', '40L Huile 15W40'],
  },
  {
    id: 'maint_alert_02',
    vehicleId: 'veh_volvo_02',
    immatriculation: 'RB-8812-B',
    model: 'Volvo FH16 500 Container',
    category: 'Porte-Conteneurs',
    driverName: 'Koffi Mensah',
    currentOdometer: 98200,
    criticalComponent: 'Plaquettes & Disques de Frein Essieu Arrière',
    componentSystem: 'BRAKES',
    failureProbabilityPct: 74,
    predictedDaysToFailure: 12,
    suggestedServiceDate: '2026-08-16',
    estimatedOdometerAtFailure: 101500,
    severity: 'WARNING',
    telemetryTrigger: 'Capteur usure à 83% + hausse de temp. lors des freinages prolongés',
    recommendedAction: 'Rectification des disques arrière et pose de plaquettes céramiques renforcées.',
    estimatedRepairCostXOF: 920000,
    estimatedPreventativeCostXOF: 210000,
    requiredParts: ['Jeu Plaquettes Volvo Rear', 'Capteurs Usure ABS'],
  },
  {
    id: 'maint_alert_03',
    vehicleId: 'veh_isuzu_04',
    immatriculation: 'DK-9012-AZ',
    model: 'Isuzu NQR 90 Frigo',
    category: 'Frigorifique',
    driverName: 'Ousmane Sow',
    currentOdometer: 215400,
    criticalComponent: 'Pompe à Eau & Courroie de Distribution Frigo',
    componentSystem: 'COOLING',
    failureProbabilityPct: 65,
    predictedDaysToFailure: 18,
    suggestedServiceDate: '2026-08-22',
    estimatedOdometerAtFailure: 218000,
    severity: 'WARNING',
    telemetryTrigger: 'Piques de température moteur à 104°C en montée à pleine charge',
    recommendedAction: 'Remplacement pompe à eau & détartrage du radiateur principal.',
    estimatedRepairCostXOF: 650000,
    estimatedPreventativeCostXOF: 145000,
    requiredParts: ['Pompe à eau Isuzu 4HK1', 'Courroie Accessoire', 'Liquide Refroidissement 10L'],
  },
  {
    id: 'maint_alert_04',
    vehicleId: 'veh_hilux_03',
    immatriculation: 'RB-1029-C',
    model: 'Toyota Hilux 4x4',
    category: 'Pickup / Liaisons',
    driverName: 'Ibrahim Bako',
    currentOdometer: 42100,
    criticalComponent: 'Injecteurs Common-Rail Cylindres 2 & 4',
    componentSystem: 'ENGINE',
    failureProbabilityPct: 42,
    predictedDaysToFailure: 28,
    suggestedServiceDate: '2026-09-01',
    estimatedOdometerAtFailure: 45000,
    severity: 'MONITORING',
    telemetryTrigger: 'Légère surconsommation (+8%) & variabilité débit ralenti',
    recommendedAction: 'Nettoyage bac à ultrasons des injecteurs & changement filtre gasoil.',
    estimatedRepairCostXOF: 480000,
    estimatedPreventativeCostXOF: 85000,
    requiredParts: ['Filtre à Carburant Origine Toyota', 'Additif Décalaminage'],
  },
];

// Health overview matrix by system
const COMPONENT_HEALTH_MATRIX = [
  { system: 'Système Moteur & Turbo', healthPct: 82, status: 'ATTENTION', criticalCount: 1, warningCount: 1 },
  { system: 'Freinage & Sécurité ABS', healthPct: 88, status: 'OPTIMAL', criticalCount: 0, warningCount: 1 },
  {
    system: 'Refroidissement & Radiateur',
    healthPct: 79,
    status: 'ATTENTION',
    criticalCount: 0,
    warningCount: 1,
  },
  {
    system: 'Transmission & Embrayage',
    healthPct: 94,
    status: 'EXCELLENT',
    criticalCount: 0,
    warningCount: 0,
  },
  {
    system: 'Train Roulant & Pneumatiques',
    healthPct: 91,
    status: 'EXCELLENT',
    criticalCount: 0,
    warningCount: 0,
  },
  {
    system: 'Circuit Électrique & Batterie',
    healthPct: 96,
    status: 'EXCELLENT',
    criticalCount: 0,
    warningCount: 0,
  },
];

export const MaintenanceForecast: React.FC<MaintenanceForecastProps> = ({ currentOrg }) => {
  const [selectedSeverity, setSelectedSeverity] = useState<'ALL' | 'CRITICAL' | 'WARNING' | 'MONITORING'>(
    'ALL',
  );
  const [selectedAlertId, setSelectedAlertId] = useState<string>('maint_alert_01');
  const [scheduledWorkOrders, setScheduledWorkOrders] = useState<string[]>([]);
  const [showWorkOrderModal, setShowWorkOrderModal] = useState<boolean>(false);
  const [selectedCenter, setSelectedCenter] = useState<string>(
    'Cotonou Central Workshop (Tracteur & Poids Lourds)',
  );

  const currencySymbol = currentOrg.currency || 'FCFA';

  const selectedAlert = PREDICTIVE_ALERTS.find(a => a.id === selectedAlertId) || PREDICTIVE_ALERTS[0];

  const filteredAlerts = PREDICTIVE_ALERTS.filter(alert => {
    if (selectedSeverity === 'ALL') return true;
    return alert.severity === selectedSeverity;
  });

  const totalSavingsOpportunityXOF = PREDICTIVE_ALERTS.reduce(
    (sum, a) => sum + (a.estimatedRepairCostXOF - a.estimatedPreventativeCostXOF),
    0,
  );

  const handleScheduleIntervention = (alertId: string) => {
    if (!scheduledWorkOrders.includes(alertId)) {
      setScheduledWorkOrders(prev => [...prev, alertId]);
    }
    setShowWorkOrderModal(false);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner Header */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-purple-700 font-bold text-xs uppercase tracking-wider mb-1">
            <Cpu className="w-4 h-4 text-purple-600" />
            <span>Module Prédictif & Analyse Télémétrique • FleetGuard AI</span>
          </div>
          <h3 className="text-lg font-bold text-slate-900">
            Prévisions de Maintenance & Diagnostic Défaillance Composants
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Analyse les courbes de température, la pression d'huile, les vibrations et l'usure pour planifier
            les révisions avant la panne casse-moteur.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 font-medium">Filtrer par urgence :</span>
          <div className="flex items-center bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs">
            {(['ALL', 'CRITICAL', 'WARNING', 'MONITORING'] as const).map(sev => (
              <button
                key={sev}
                onClick={() => setSelectedSeverity(sev)}
                className={`px-2.5 py-1 rounded-md font-bold transition cursor-pointer ${
                  selectedSeverity === sev
                    ? sev === 'CRITICAL'
                      ? 'bg-red-500 text-white shadow-2xs'
                      : sev === 'WARNING'
                        ? 'bg-amber-500 text-white shadow-2xs'
                        : 'bg-white text-slate-800 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {sev === 'ALL'
                  ? 'Toutes'
                  : sev === 'CRITICAL'
                    ? 'Critiques'
                    : sev === 'WARNING'
                      ? 'Avertissements'
                      : 'Surveillance'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* KPI Highlight Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1 */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-slate-500 text-xs font-bold uppercase tracking-wider">
              Alertes Défaillances
            </span>
            <div className="p-2 bg-red-50 text-red-600 rounded-lg">
              <ShieldAlert className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-slate-900 font-mono">
            4 <span className="text-xs text-slate-500 font-sans font-normal">Véhicules Imminents</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-red-600 font-bold">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>1 Panne Critique (Turbo Actros)</span>
          </div>
        </div>

        {/* KPI 2 */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-slate-500 text-xs font-bold uppercase tracking-wider">
              Économie Préventive Est.
            </span>
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-emerald-700 font-mono">
            {(totalSavingsOpportunityXOF / 1000000).toFixed(2)}M{' '}
            <span className="text-xs text-slate-500 font-sans font-normal">{currencySymbol}</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-emerald-600 font-bold">
            <TrendingUp className="w-3.5 h-3.5" />
            <span>vs Coût des pannes en rase campagne</span>
          </div>
        </div>

        {/* KPI 3 */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-slate-500 text-xs font-bold uppercase tracking-wider">
              Indice Santé Flotte
            </span>
            <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
              <Activity className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-slate-900 font-mono">
            88.3% <span className="text-xs text-slate-500 font-sans font-normal">Fiabilité</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-blue-600 font-bold">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>+4.2% ce trimestre via IA</span>
          </div>
        </div>

        {/* KPI 4 */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-slate-500 text-xs font-bold uppercase tracking-wider">
              Ordres de Service IA
            </span>
            <div className="p-2 bg-purple-50 text-purple-600 rounded-lg">
              <Wrench className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-slate-900 font-mono">
            {scheduledWorkOrders.length} / 4{' '}
            <span className="text-xs text-slate-500 font-sans font-normal">Planifiés</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-purple-700 font-bold">
            <Sparkles className="w-3.5 h-3.5 text-purple-500" />
            <span>Pièces réservées en magasin</span>
          </div>
        </div>
      </div>

      {/* Main Grid: Left Predictive List + Right Telemetry Trend Visualizer */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Predictive Component Alerts List */}
        <div className="lg:col-span-1 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
            <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-orange-500" />
              Prédictions Risques Composants
            </h4>
            <span className="text-[11px] font-bold text-slate-500">{filteredAlerts.length} véhicules</span>
          </div>

          <div className="space-y-3 max-h-[620px] overflow-y-auto pr-1">
            {filteredAlerts.map(alert => {
              const isSelected = alert.id === selectedAlertId;
              const isScheduled = scheduledWorkOrders.includes(alert.id);

              return (
                <div
                  key={alert.id}
                  onClick={() => setSelectedAlertId(alert.id)}
                  className={`p-4 rounded-xl border transition cursor-pointer relative ${
                    isSelected
                      ? 'bg-purple-50/60 border-purple-400 shadow-xs'
                      : 'bg-white border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {/* Status Tag */}
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-xs font-extrabold text-slate-900 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                      {alert.immatriculation}
                    </span>

                    <div className="flex items-center gap-2">
                      {isScheduled && (
                        <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Planifié
                        </span>
                      )}

                      <span
                        className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full uppercase ${
                          alert.severity === 'CRITICAL'
                            ? 'bg-red-100 text-red-700 border border-red-200 animate-pulse'
                            : alert.severity === 'WARNING'
                              ? 'bg-amber-100 text-amber-800 border border-amber-200'
                              : 'bg-blue-100 text-blue-800 border border-blue-200'
                        }`}
                      >
                        {alert.severity === 'CRITICAL'
                          ? 'Risque Critique'
                          : alert.severity === 'WARNING'
                            ? 'Avertissement'
                            : 'Surveillance'}
                      </span>
                    </div>
                  </div>

                  {/* Component Title */}
                  <div className="text-xs font-bold text-slate-900 mb-1">{alert.criticalComponent}</div>
                  <div className="text-[11px] text-slate-500 mb-2">
                    {alert.model} • Chauffeur: {alert.driverName}
                  </div>

                  {/* Risk Probability Bar */}
                  <div className="space-y-1 mb-3">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-slate-500">Probabilité de Panne :</span>
                      <span
                        className={`font-mono font-bold ${
                          alert.failureProbabilityPct > 80
                            ? 'text-red-600'
                            : alert.failureProbabilityPct > 60
                              ? 'text-amber-600'
                              : 'text-blue-600'
                        }`}
                      >
                        {alert.failureProbabilityPct}%
                      </span>
                    </div>
                    <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all ${
                          alert.failureProbabilityPct > 80
                            ? 'bg-red-500'
                            : alert.failureProbabilityPct > 60
                              ? 'bg-amber-500'
                              : 'bg-blue-500'
                        }`}
                        style={{ width: `${alert.failureProbabilityPct}%` }}
                      ></div>
                    </div>
                  </div>

                  {/* Date & Savings Summary */}
                  <div className="flex items-center justify-between text-[11px] pt-2 border-t border-slate-100 text-slate-600">
                    <span className="flex items-center gap-1 font-medium">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      Date Cible: <strong className="text-slate-900">{alert.suggestedServiceDate}</strong>
                    </span>
                    <span className="text-emerald-600 font-bold font-mono">
                      -{(alert.estimatedRepairCostXOF - alert.estimatedPreventativeCostXOF).toLocaleString()}{' '}
                      {currencySymbol}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right 2 Columns: Detailed Telemetry Analysis & Recharts Degradation Curves */}
        <div className="lg:col-span-2 space-y-5">
          {/* Detailed Selected Alert Diagnostic Card */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-extrabold bg-slate-900 text-white px-2.5 py-1 rounded">
                    {selectedAlert.immatriculation}
                  </span>
                  <span className="text-xs font-bold text-slate-700">{selectedAlert.model}</span>
                </div>
                <h4 className="text-base font-extrabold text-slate-900 mt-1">
                  Analyse Défaillance:{' '}
                  <span className="text-purple-700">{selectedAlert.criticalComponent}</span>
                </h4>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowWorkOrderModal(true)}
                  className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold flex items-center gap-2 transition cursor-pointer shadow-xs"
                >
                  <Wrench className="w-3.5 h-3.5" />
                  <span>Générer Ordre de Service IA</span>
                </button>
              </div>
            </div>

            {/* Diagnostic Parameters Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                <span className="text-slate-500 text-[10px] uppercase font-bold">
                  Déclencheur Capteur GPS/OBD
                </span>
                <div className="font-medium text-slate-800 flex items-center gap-1.5">
                  <Gauge className="w-3.5 h-3.5 text-orange-500 shrink-0" />
                  <span>{selectedAlert.telemetryTrigger}</span>
                </div>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                <span className="text-slate-500 text-[10px] uppercase font-bold">Échéance Suggérée</span>
                <div className="font-bold text-slate-900 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                  <span>
                    {selectedAlert.suggestedServiceDate} (~{selectedAlert.predictedDaysToFailure} jours)
                  </span>
                </div>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                <span className="text-slate-500 text-[10px] uppercase font-bold">
                  Économie si Révision Préventive
                </span>
                <div className="font-bold text-emerald-600 font-mono flex items-center gap-1.5">
                  <DollarSign className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  <span>
                    {(
                      selectedAlert.estimatedRepairCostXOF - selectedAlert.estimatedPreventativeCostXOF
                    ).toLocaleString()}{' '}
                    {currencySymbol}
                  </span>
                </div>
              </div>
            </div>

            {/* AI Prescriptive Recommendation Box */}
            <div className="p-3.5 rounded-xl bg-purple-50 border border-purple-200 text-xs space-y-1.5">
              <div className="font-bold text-purple-900 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-purple-600" />
                <span>Action Prescrite par FleetGuard AI :</span>
              </div>
              <p className="text-purple-800 text-[11px] leading-relaxed">{selectedAlert.recommendedAction}</p>
              <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px] text-purple-900 font-medium">
                <span>Pièces requises :</span>
                {selectedAlert.requiredParts.map((part, idx) => (
                  <span
                    key={idx}
                    className="bg-white px-2 py-0.5 rounded border border-purple-200 text-[10px] font-bold"
                  >
                    {part}
                  </span>
                ))}
              </div>
            </div>

            {/* Recharts Telemetry Degradation Curves */}
            <div className="space-y-2 pt-2">
              <div className="flex items-center justify-between">
                <h5 className="text-xs font-bold text-slate-900 flex items-center gap-2">
                  <Activity className="w-4 h-4 text-purple-600" />
                  Courbe Historique & Projection Télémétrique (Changement Température & Pression d'Huile)
                </h5>
                <span className="text-[10px] text-slate-500 font-mono">142 000 km ➔ 152 000 km</span>
              </div>

              <div className="h-[260px] w-full pt-1">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={VEHICLE_TELEMETRY_SERIES}
                    margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="distanceKm" tick={{ fontSize: 11, fill: '#64748b' }} />
                    <YAxis
                      yAxisId="left"
                      domain={[60, 120]}
                      tickFormatter={v => `${v}°C`}
                      tick={{ fontSize: 11, fill: '#64748b' }}
                    />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      domain={[0, 100]}
                      tickFormatter={v => `${v}%`}
                      tick={{ fontSize: 11, fill: '#64748b' }}
                    />
                    <Tooltip content={<CustomTelemetryTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 11, paddingTop: '8px' }} />
                    <Area
                      yAxisId="left"
                      type="monotone"
                      dataKey="engineTempC"
                      name="Température Moteur (°C)"
                      stroke="#ef4444"
                      fill="#fee2e2"
                      strokeWidth={2}
                    />
                    <Area
                      yAxisId="right"
                      type="monotone"
                      dataKey="predictedFailureRisk"
                      name="Risque Défaillance (%)"
                      stroke="#8b5cf6"
                      fill="#ede9fe"
                      strokeWidth={2.5}
                    />
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="brakeWearPct"
                      name="Usure Plaquettes (%)"
                      stroke="#f59e0b"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Component Health Matrix across Fleet */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3 shadow-xs">
            <div className="border-b border-slate-100 pb-2 flex items-center justify-between">
              <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Cpu className="w-4 h-4 text-blue-600" />
                Matrice de Santé des Sous-Systèmes Mécaniques
              </h4>
              <span className="text-[11px] text-slate-500 font-medium">
                Audit temps réel sur 28 véhicules
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {COMPONENT_HEALTH_MATRIX.map((item, idx) => (
                <div key={idx} className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-800">{item.system}</span>
                    <span
                      className={`font-mono font-bold text-xs ${
                        item.healthPct < 85 ? 'text-amber-600' : 'text-emerald-600'
                      }`}
                    >
                      {item.healthPct}%
                    </span>
                  </div>

                  <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${item.healthPct < 85 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                      style={{ width: `${item.healthPct}%` }}
                    ></div>
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-slate-500">
                    <span>
                      Statut: <strong className="text-slate-800">{item.status}</strong>
                    </span>
                    {item.criticalCount > 0 ? (
                      <span className="text-red-600 font-bold">{item.criticalCount} critique</span>
                    ) : item.warningCount > 0 ? (
                      <span className="text-amber-600 font-bold">{item.warningCount} attention</span>
                    ) : (
                      <span className="text-emerald-600 font-bold">100% Ok</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Work Order Modal */}
      {showWorkOrderModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-2xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 text-purple-700 font-bold text-sm">
                <Wrench className="w-5 h-5 text-purple-600" />
                <span>Création Ordre de Service IA • FleetGuard Work Order</span>
              </div>
              <button
                onClick={() => setShowWorkOrderModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold text-lg cursor-pointer"
              >
                ×
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 bg-purple-50 rounded-xl border border-purple-200 space-y-1">
                <div className="font-bold text-purple-900">
                  Véhicule : {selectedAlert.immatriculation} ({selectedAlert.model})
                </div>
                <div className="text-purple-800 text-[11px]">
                  Intervention sur : <strong>{selectedAlert.criticalComponent}</strong>
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  Centre de Maintenance / Garage Partenaire :
                </label>
                <select
                  value={selectedCenter}
                  onChange={e => setSelectedCenter(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 font-medium text-slate-800 focus:outline-none"
                >
                  <option value="Cotonou Central Workshop (Tracteur & Poids Lourds)">
                    Cotonou Central Workshop (Atelier Principal FleetGuard)
                  </option>
                  <option value="Atelier Garagiste Agréé Volvo Lomé Port">
                    Atelier Garagiste Agréé Volvo Lomé Port
                  </option>
                  <option value="Garage Spécialisé Isuzu / Frigo Dakar-Rufisque">
                    Garage Spécialisé Isuzu / Frigo Dakar-Rufisque
                  </option>
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Date d'Immobilisation Prévue :</label>
                <input
                  type="date"
                  defaultValue={selectedAlert.suggestedServiceDate}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 font-medium text-slate-800 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  Estimation du Coût Préventive (FCFA) :
                </label>
                <input
                  type="text"
                  readOnly
                  value={`${selectedAlert.estimatedPreventativeCostXOF.toLocaleString()} ${currencySymbol}`}
                  className="w-full bg-slate-100 border border-slate-200 rounded-lg p-2.5 font-mono font-bold text-emerald-700 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                onClick={() => setShowWorkOrderModal(false)}
                className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition cursor-pointer"
              >
                Annuler
              </button>

              <button
                onClick={() => handleScheduleIntervention(selectedAlert.id)}
                className="px-5 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold transition cursor-pointer flex items-center gap-2 shadow-xs"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Valider & Envoyer à l'Atelier</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Custom Telemetry Tooltip
const CustomTelemetryTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-slate-900 text-white p-3 rounded-xl shadow-xl border border-slate-700 text-xs space-y-1.5">
        <div className="font-bold border-b border-slate-700 pb-1 text-slate-300">Kilométrage: {label}</div>
        {payload.map((entry: any, index: number) => (
          <div key={index} className="flex items-center justify-between gap-3 text-[11px]">
            <span style={{ color: entry.color }} className="font-medium">
              {entry.name}:
            </span>
            <span className="font-mono font-bold">
              {entry.value} {entry.name.includes('Température') ? '°C' : '%'}
            </span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};
