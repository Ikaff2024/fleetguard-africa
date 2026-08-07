import React, { useState, useMemo } from 'react';
import { useAlerts, useDrivers, useVehicles } from '../../hooks/useFleetData';
import { Organization } from '../../types';
import { ApiClientError, apiClient } from '../../lib/api-client';
import type { SafetyCoachingResponse } from '../scoring/ProactiveSafetyTips';
import {
  ShieldAlert,
  AlertTriangle,
  Wrench,
  MapPin,
  MessageSquare,
  CheckCircle2,
  Clock,
  Sparkles,
  RefreshCw,
  Search,
  Truck,
  UserCheck,
  Compass,
  Fuel,
  FileText,
  X,
  Send,
  Check,
  ShieldCheck,
  AlertOctagon,
  Printer,
} from 'lucide-react';
import { PrintableReportModal } from '../common/PrintableReportModal';

export type AlertCategory = 'GEOFENCE' | 'MAINTENANCE' | 'HARSH_DRIVING' | 'FUEL_ANOMALY' | 'COMPLIANCE';
export type AlertSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
export type AlertStatus = 'UNHANDLED' | 'IN_REVIEW' | 'RESOLVED' | 'DISMISSED';

export interface UnifiedAlert {
  id: string;
  organizationId: string;
  category: AlertCategory;
  severity: AlertSeverity;
  status: AlertStatus;
  recordedAt: string; // ISO string
  title: string;
  description: string;
  vehicleId?: string;
  driverId?: string;
  locationName?: string;
  latitude?: number;
  longitude?: number;
  metricValue?: string;
  metricLabel?: string;
  actionsTaken?: string[];
  resolutionNote?: string;
  resolvedAt?: string;
}

interface AlertsCenterProps {
  currentOrg: Organization;
  onNavigateToMap?: (vehicleId?: string) => void;
}

export const AlertsCenter: React.FC<AlertsCenterProps> = ({ currentOrg, onNavigateToMap }) => {
  const driversQuery = useDrivers();
  const vehiclesQuery = useVehicles();
  // Parc et conducteurs de l'organisation, servis par l'API.
  const orgVehicles = useMemo(() => vehiclesQuery.data ?? [], [vehiclesQuery.data]);
  const orgDrivers = useMemo(() => driversQuery.data ?? [], [driversQuery.data]);

  /**
   * Les alertes viennent du serveur, qui les dérive des faits enregistrés :
   * infractions relevées sur la trace, documents qui expirent, révisions dues,
   * pleins incohérents. Elles étaient auparavant écrites en dur dans cet
   * écran — chaque client voyait donc les mêmes, à propos de camions qui ne
   * lui appartenaient pas.
   */
  const alertsQuery = useAlerts();

  const alerts = useMemo<UnifiedAlert[]>(
    () =>
      (alertsQuery.data ?? []).map(alert => ({
        ...alert,
        // Le serveur ne conserve pas d'historique d'actions : seul le
        // traitement (statut, note) fait foi.
        actionsTaken: [],
      })),
    [alertsQuery.data],
  );

  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedSeverity, setSelectedSeverity] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const [pendingAlertId, setPendingAlertId] = useState<string | null>(null);
  const [writeError, setWriteError] = useState<string | null>(null);

  /**
   * Enregistre la décision du régulateur.
   *
   * L'écriture passe par le serveur avant tout affichage : un acquittement qui
   * ne vivrait qu'à l'écran disparaîtrait au rechargement, et l'incident
   * serait cru traité alors qu'il ne l'est pas.
   */
  const applyStatus = async (
    alertId: string,
    status: UnifiedAlert['status'],
    resolutionNote?: string,
  ): Promise<boolean> => {
    setPendingAlertId(alertId);
    setWriteError(null);
    try {
      await apiClient.patch(`/alerts/${alertId}`, { status, resolutionNote });
      alertsQuery.reload();
      return true;
    } catch {
      setWriteError("Le traitement n'a pas pu être enregistré. Réessayez.");
      return false;
    } finally {
      setPendingAlertId(null);
    }
  };

  // Modals & Active Action States
  const [smsModalAlert, setSmsModalAlert] = useState<UnifiedAlert | null>(null);
  const [smsMessage, setSmsMessage] = useState<string>('');
  const [smsSending, setSmsSending] = useState<boolean>(false);
  const [smsSuccess, setSmsSuccess] = useState<boolean>(false);

  const [aiModalAlert, setAiModalAlert] = useState<UnifiedAlert | null>(null);
  const [aiAnalysisResult, setAiAnalysisResult] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState<boolean>(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiSimulated, setAiSimulated] = useState<boolean>(false);

  const [resolveModalAlert, setResolveModalAlert] = useState<UnifiedAlert | null>(null);
  const [resolutionNote, setResolutionNote] = useState<string>('');

  const [maintModalAlert, setMaintModalAlert] = useState<UnifiedAlert | null>(null);
  const [maintProvider, setMaintProvider] = useState<string>('Garage Central CFAO Motors');
  const [maintSuccess, setMaintSuccess] = useState<boolean>(false);

  // Print State
  const [showPrintIncidentLogsModal, setShowPrintIncidentLogsModal] = useState<boolean>(false);
  const [singlePrintAlert, setSinglePrintAlert] = useState<UnifiedAlert | null>(null);

  // Filtered & Sorted Feed
  const filteredAlerts = useMemo(() => {
    return alerts
      .filter(alert => {
        // Category filter
        if (selectedCategory !== 'ALL' && alert.category !== selectedCategory) {
          return false;
        }
        // Severity filter
        if (selectedSeverity !== 'ALL' && alert.severity !== selectedSeverity) {
          return false;
        }
        // Status filter
        if (selectedStatus !== 'ALL' && alert.status !== selectedStatus) {
          return false;
        }
        // Search query filter
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const veh = orgVehicles.find(v => v.id === alert.vehicleId);
          const drv = orgDrivers.find(d => d.id === alert.driverId);

          const matchTitle = alert.title.toLowerCase().includes(q);
          const matchDesc = alert.description.toLowerCase().includes(q);
          const matchLocation = (alert.locationName || '').toLowerCase().includes(q);
          const matchVeh = veh
            ? `${veh.immatriculation} ${veh.make} ${veh.model}`.toLowerCase().includes(q)
            : false;
          const matchDrv = drv ? drv.fullName.toLowerCase().includes(q) : false;

          return matchTitle || matchDesc || matchLocation || matchVeh || matchDrv;
        }
        return true;
      })
      .sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime());
  }, [alerts, selectedCategory, selectedSeverity, selectedStatus, searchQuery, orgVehicles, orgDrivers]);

  // Statistics
  const stats = useMemo(() => {
    const total = alerts.length;
    const unhandled = alerts.filter(a => a.status === 'UNHANDLED').length;
    const geofenceCount = alerts.filter(a => a.category === 'GEOFENCE').length;
    const harshCount = alerts.filter(a => a.category === 'HARSH_DRIVING').length;
    const maintFuelCount = alerts.filter(
      a => a.category === 'MAINTENANCE' || a.category === 'FUEL_ANOMALY' || a.category === 'COMPLIANCE',
    ).length;
    const criticalCount = alerts.filter(a => a.severity === 'CRITICAL').length;

    return { total, unhandled, geofenceCount, harshCount, maintFuelCount, criticalCount };
  }, [alerts]);

  // Handlers
  const handleOpenSMSModal = (alert: UnifiedAlert) => {
    const driver = orgDrivers.find(d => d.id === alert.driverId);
    const vehicle = orgVehicles.find(v => v.id === alert.vehicleId);
    const driverName = driver ? driver.fullName : 'Chauffeur';
    const plate = vehicle ? vehicle.immatriculation : 'Véhicule';

    let defaultMsg = `FLEETGUARD URGENT - Cher ${driverName} (${plate}), une alerte "${alert.title}" a été enregistrée à ${new Date(alert.recordedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}. Veuillez ralentir et vous conformer à la sécurité.`;

    if (alert.category === 'GEOFENCE') {
      defaultMsg = `FLEETGUARD GEOFENCE - Cher ${driverName}, vous avez franchi la zone "${alert.locationName || 'Port/Frontière'}". Vitesse enregistrée: ${alert.metricValue || 'Inhabituelle'}. Merci de réguler immédiatement à 30km/h.`;
    } else if (alert.category === 'FUEL_ANOMALY') {
      defaultMsg = `FLEETGUARD ALERTE - Cher ${driverName}, une anomalie de consommation gazole (${alert.metricValue}) a été relevée à ${alert.locationName}. Merci d'appeler le PC Sécurité.`;
    }

    setSmsMessage(defaultMsg);
    setSmsModalAlert(alert);
    setSmsSuccess(false);
  };

  const handleSendSMS = async () => {
    if (!smsModalAlert) return;
    setSmsSending(true);
    // Le passage en revue est bien enregistré. L'acheminement du message vers
    // un opérateur mobile n'est pas encore branché : l'annoncer comme transmis
    // ferait croire qu'un chauffeur a été prévenu alors qu'il ne l'a pas été.
    const ok = await applyStatus(smsModalAlert.id, 'IN_REVIEW');
    setSmsSending(false);
    if (ok) setSmsSuccess(true);
  };

  const handleOpenAiModal = async (alert: UnifiedAlert) => {
    setAiModalAlert(alert);
    setAiAnalysisResult(null);
    setAiLoading(true);

    setAiError(null);

    if (!alert.driverId) {
      setAiError("Cette alerte n'est rattachée à aucun chauffeur : aucune analyse ne peut être produite.");
      setAiLoading(false);
      return;
    }

    try {
      const data = await apiClient.post<SafetyCoachingResponse>('/scoring/safety-tips', {
        driverId: alert.driverId,
        focusArea: alert.title,
      });

      setAiSimulated(data.isSimulated);
      setAiAnalysisResult(
        [
          data.profileSummary,
          '',
          'CONSEILS POUR LE GESTIONNAIRE :',
          ...data.actionableTips.map(
            (t, i) =>
              `${i + 1}. [${t.category}] ${t.title} : ${t.recommendation} (Impact estimé : ${t.expectedImpact})`,
          ),
        ].join('\n'),
      );
    } catch (err) {
      // Auparavant, un échec produisait une « ANALYSE IA » écrite en dur, que
      // rien ne distinguait d'une vraie. Un échec doit rester un échec.
      setAiAnalysisResult(null);
      setAiError(err instanceof ApiClientError ? err.message : "L'analyse n'a pas pu être produite.");
    } finally {
      setAiLoading(false);
    }
  };

  const handleResolveAlert = (alert: UnifiedAlert) => {
    setResolveModalAlert(alert);
    setResolutionNote('');
  };

  const handleConfirmResolution = async () => {
    if (!resolveModalAlert) return;
    const ok = await applyStatus(
      resolveModalAlert.id,
      'RESOLVED',
      resolutionNote.trim() || 'Classé résolu par le gestionnaire de flotte.',
    );
    if (ok) setResolveModalAlert(null);
  };

  const handleOpenMaintenanceModal = (alert: UnifiedAlert) => {
    setMaintModalAlert(alert);
    setMaintSuccess(false);
  };

  const handleConfirmMaintenance = async () => {
    if (!maintModalAlert) return;
    // La prise en charge est enregistrée ; la transmission de l'ordre au
    // garage n'est pas encore connectée et la note le dit, plutôt que de
    // laisser croire à un envoi.
    const ok = await applyStatus(
      maintModalAlert.id,
      'IN_REVIEW',
      `Passage à l'atelier à programmer chez ${maintProvider}.`,
    );
    if (!ok) return;
    setMaintSuccess(true);
    setTimeout(() => {
      setMaintModalAlert(null);
      setMaintSuccess(false);
    }, 1200);
  };

  const getCategoryBadge = (category: AlertCategory) => {
    switch (category) {
      case 'GEOFENCE':
        return (
          <span className="bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-bold px-2.5 py-1 rounded-md flex items-center gap-1">
            <Compass className="w-3 h-3 text-indigo-600" />
            <span>Franchissement Geofence</span>
          </span>
        );
      case 'HARSH_DRIVING':
        return (
          <span className="bg-orange-50 text-orange-800 border border-orange-200 text-[10px] font-bold px-2.5 py-1 rounded-md flex items-center gap-1">
            <AlertTriangle className="w-3 h-3 text-orange-600" />
            <span>Conduite Dangereuse</span>
          </span>
        );
      case 'MAINTENANCE':
        return (
          <span className="bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-bold px-2.5 py-1 rounded-md flex items-center gap-1">
            <Wrench className="w-3 h-3 text-amber-600" />
            <span>Avertissement Maintenance</span>
          </span>
        );
      case 'FUEL_ANOMALY':
        return (
          <span className="bg-red-50 text-red-800 border border-red-200 text-[10px] font-bold px-2.5 py-1 rounded-md flex items-center gap-1">
            <Fuel className="w-3 h-3 text-red-600" />
            <span>Anomalie Carburant</span>
          </span>
        );
      case 'COMPLIANCE':
      default:
        return (
          <span className="bg-sky-50 text-sky-800 border border-sky-200 text-[10px] font-bold px-2.5 py-1 rounded-md flex items-center gap-1">
            <FileText className="w-3 h-3 text-sky-600" />
            <span>Conformité & Papiers</span>
          </span>
        );
    }
  };

  const getSeverityBadge = (severity: AlertSeverity) => {
    switch (severity) {
      case 'CRITICAL':
        return (
          <span className="bg-red-600 text-white text-[10px] font-extrabold px-2.5 py-0.5 rounded shadow-2xs uppercase tracking-wider flex items-center gap-1 animate-pulse">
            <AlertOctagon className="w-3 h-3" />
            Critique
          </span>
        );
      case 'HIGH':
        return (
          <span className="bg-red-100 text-red-800 border border-red-200 text-[10px] font-bold px-2.5 py-0.5 rounded uppercase">
            Élevée
          </span>
        );
      case 'MEDIUM':
        return (
          <span className="bg-orange-100 text-orange-800 border border-orange-200 text-[10px] font-bold px-2.5 py-0.5 rounded uppercase">
            Modérée
          </span>
        );
      case 'LOW':
      default:
        return (
          <span className="bg-slate-100 text-slate-700 border border-slate-200 text-[10px] font-bold px-2.5 py-0.5 rounded uppercase">
            Faible
          </span>
        );
    }
  };

  const getStatusBadge = (status: AlertStatus) => {
    switch (status) {
      case 'UNHANDLED':
        return (
          <span className="bg-red-50 text-red-700 border border-red-200 text-[10px] font-extrabold px-2 py-0.5 rounded flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-red-600 animate-ping"></span>
            Non Traitée
          </span>
        );
      case 'IN_REVIEW':
        return (
          <span className="bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-bold px-2 py-0.5 rounded flex items-center gap-1">
            <Clock className="w-3 h-3 text-amber-600" />
            En Cours
          </span>
        );
      case 'RESOLVED':
        return (
          <span className="bg-emerald-50 text-emerald-800 border border-emerald-200 text-[10px] font-bold px-2 py-0.5 rounded flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            Résolue
          </span>
        );
      case 'DISMISSED':
      default:
        return (
          <span className="bg-slate-100 text-slate-600 border border-slate-200 text-[10px] font-bold px-2 py-0.5 rounded">
            Classée
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner Header */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 border border-slate-800 rounded-xl p-6 text-white shadow-md relative overflow-hidden">
        <div className="absolute top-0 right-0 transform translate-x-6 -translate-y-6 opacity-10 pointer-events-none">
          <ShieldAlert className="w-64 h-64 text-red-500" />
        </div>

        <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-red-400 font-bold text-xs uppercase tracking-wider mb-2">
              <ShieldAlert className="w-4 h-4 text-red-400 animate-pulse" />
              <span>Surveillance Télématique Unifiée & Geofencing</span>
            </div>
            <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-3">
              <span>Centre d'Alertes Flotte</span>
              {stats.unhandled > 0 && (
                <span className="bg-red-500 text-white text-xs font-mono font-extrabold px-2.5 py-0.5 rounded-full border border-red-400 animate-pulse">
                  {stats.unhandled} non traitées
                </span>
              )}
            </h2>
            <p className="text-xs text-slate-300 mt-1 max-w-2xl leading-relaxed">
              Agrégation en temps réel des franchissements de geofence, anomalies de maintenance/carburant, et
              comportements de conduite à risque avec boutons d'actions directes.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => setShowPrintIncidentLogsModal(true)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-3.5 py-2.5 rounded-lg transition flex items-center gap-2 shadow-xs cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Imprimer Journal d'Incidents</span>
            </button>
          </div>
        </div>
      </div>

      {/* Un échec d'enregistrement doit se voir : sans ce bandeau, le
          régulateur croirait l'alerte traitée alors que rien n'a été écrit. */}
      {writeError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-center justify-between gap-3">
          <span className="text-xs font-bold text-red-700">{writeError}</span>
          <button
            onClick={() => {
              setWriteError(null);
              alertsQuery.reload();
            }}
            className="text-xs font-bold text-red-700 underline cursor-pointer"
          >
            Recharger les alertes
          </button>
        </div>
      )}

      {alertsQuery.isLoading && alerts.length === 0 && (
        <p className="text-xs text-slate-500">Chargement des alertes…</p>
      )}

      {/* KPI Cards Overview */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Total Alertes</span>
            <AlertTriangle className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-extrabold text-slate-900 mt-2 font-mono">{stats.total}</div>
          <div className="text-[10px] text-slate-500 mt-1">Événements enregistrés</div>
        </div>

        <div className="bg-red-50/60 border border-red-200 rounded-xl p-4 shadow-2xs">
          <div className="flex items-center justify-between text-red-800 text-xs font-bold">
            <span>Non Traitées</span>
            <ShieldAlert className="w-4 h-4 text-red-600 animate-pulse" />
          </div>
          <div className="text-2xl font-extrabold text-red-700 mt-2 font-mono">{stats.unhandled}</div>
          <div className="text-[10px] text-red-600 font-medium mt-1">Intervention requise</div>
        </div>

        <div className="bg-indigo-50/60 border border-indigo-200 rounded-xl p-4 shadow-2xs">
          <div className="flex items-center justify-between text-indigo-900 text-xs font-bold">
            <span>Geofencing</span>
            <Compass className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="text-2xl font-extrabold text-indigo-800 mt-2 font-mono">{stats.geofenceCount}</div>
          <div className="text-[10px] text-indigo-600 font-medium mt-1">Ports, frontières, corridors</div>
        </div>

        <div className="bg-orange-50/60 border border-orange-200 rounded-xl p-4 shadow-2xs">
          <div className="flex items-center justify-between text-orange-900 text-xs font-bold">
            <span>Conduite Dangereuse</span>
            <AlertTriangle className="w-4 h-4 text-orange-600" />
          </div>
          <div className="text-2xl font-extrabold text-orange-800 mt-2 font-mono">{stats.harshCount}</div>
          <div className="text-[10px] text-orange-600 font-medium mt-1">Vitesse, freinages, nuit</div>
        </div>

        <div className="bg-amber-50/60 border border-amber-200 rounded-xl p-4 shadow-2xs col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between text-amber-900 text-xs font-bold">
            <span>Maintenance & Gazole</span>
            <Wrench className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-extrabold text-amber-800 mt-2 font-mono">{stats.maintFuelCount}</div>
          <div className="text-[10px] text-amber-600 font-medium mt-1">Anomalies & papiers</div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* Category Tabs */}
          <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 p-1 rounded-lg">
            {[
              { id: 'ALL', label: 'Toutes les Alertes' },
              { id: 'GEOFENCE', label: 'Geofencing Breaches' },
              { id: 'HARSH_DRIVING', label: 'Conduite Dangereuse' },
              { id: 'MAINTENANCE', label: 'Maintenance' },
              { id: 'FUEL_ANOMALY', label: 'Anomalies Gazole' },
              { id: 'COMPLIANCE', label: 'Papiers & Visite' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setSelectedCategory(tab.id)}
                className={`px-3 py-1.5 rounded-md text-xs font-bold transition cursor-pointer ${
                  selectedCategory === tab.id
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search Box */}
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Rechercher immat, chauffeur..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-800 focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-100 pt-3 text-xs">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-slate-600">Sévérité:</span>
              <select
                value={selectedSeverity}
                onChange={e => setSelectedSeverity(e.target.value)}
                className="bg-slate-50 border border-slate-300 rounded-md px-2 py-1 text-xs font-semibold text-slate-700 cursor-pointer"
              >
                <option value="ALL">Toutes les sévérités</option>
                <option value="CRITICAL">Critique uniquement</option>
                <option value="HIGH">Élevée</option>
                <option value="MEDIUM">Modérée</option>
                <option value="LOW">Faible</option>
              </select>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-slate-600">Statut:</span>
              <select
                value={selectedStatus}
                onChange={e => setSelectedStatus(e.target.value)}
                className="bg-slate-50 border border-slate-300 rounded-md px-2 py-1 text-xs font-semibold text-slate-700 cursor-pointer"
              >
                <option value="ALL">Tous les statuts</option>
                <option value="UNHANDLED">Non Traitées</option>
                <option value="IN_REVIEW">En Cours</option>
                <option value="RESOLVED">Résolues</option>
              </select>
            </div>
          </div>

          <div className="text-slate-500 font-medium">
            Affichage de <strong>{filteredAlerts.length}</strong> sur <strong>{alerts.length}</strong> alertes
          </div>
        </div>
      </div>

      {/* Chronological Feed Stream */}
      <div className="space-y-4">
        {filteredAlerts.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-12 text-center space-y-3">
            <ShieldCheck className="w-12 h-12 text-slate-300 mx-auto" />
            <h3 className="text-sm font-bold text-slate-700">Aucune alerte ne correspond à vos filtres</h3>
            <p className="text-xs text-slate-500">
              Essayez de réinitialiser vos critères de recherche ou de modifier les filtres ci-dessus.
            </p>
            <button
              onClick={() => {
                setSelectedCategory('ALL');
                setSelectedSeverity('ALL');
                setSelectedStatus('ALL');
                setSearchQuery('');
              }}
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs px-3 py-1.5 rounded-lg transition cursor-pointer"
            >
              Réinitialiser les filtres
            </button>
          </div>
        ) : (
          filteredAlerts.map(alert => {
            const vehicle = orgVehicles.find(v => v.id === alert.vehicleId);
            const driver = orgDrivers.find(d => d.id === alert.driverId);

            return (
              <div
                key={alert.id}
                className={`bg-white border rounded-xl p-5 shadow-2xs transition hover:shadow-xs space-y-4 ${
                  alert.status === 'UNHANDLED'
                    ? 'border-red-300 bg-gradient-to-r from-red-50/30 via-white to-white'
                    : alert.status === 'RESOLVED'
                      ? 'border-emerald-200 bg-slate-50/40 opacity-80'
                      : 'border-slate-200'
                }`}
              >
                {/* Alert Top Row */}
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    {getCategoryBadge(alert.category)}
                    {getSeverityBadge(alert.severity)}
                    {getStatusBadge(alert.status)}

                    <span className="text-[11px] font-mono text-slate-400 ml-1">
                      {new Date(alert.recordedAt).toLocaleString('fr-FR', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>

                  {alert.metricValue && (
                    <div className="bg-slate-100 border border-slate-200 rounded-lg px-2.5 py-1 text-right">
                      <div className="text-[9px] font-semibold text-slate-500 uppercase">
                        {alert.metricLabel || 'Valeur'}
                      </div>
                      <div className="text-xs font-mono font-bold text-slate-900">{alert.metricValue}</div>
                    </div>
                  )}
                </div>

                {/* Title & Description */}
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-slate-900 leading-snug">{alert.title}</h3>
                  <p className="text-xs text-slate-600 leading-relaxed">{alert.description}</p>
                </div>

                {/* Context Details (Vehicle, Driver, Location) */}
                <div className="flex flex-wrap items-center gap-4 text-xs bg-slate-50 border border-slate-100 p-2.5 rounded-lg">
                  {vehicle && (
                    <div className="flex items-center gap-1.5 font-semibold text-slate-800">
                      <Truck className="w-3.5 h-3.5 text-orange-500" />
                      <span>{vehicle.immatriculation}</span>
                      <span className="text-slate-400 font-normal">
                        ({vehicle.make} {vehicle.model})
                      </span>
                    </div>
                  )}

                  {driver && (
                    <div className="flex items-center gap-1.5 font-semibold text-slate-800">
                      <UserCheck className="w-3.5 h-3.5 text-slate-500" />
                      <span>{driver.fullName}</span>
                      <span className="text-slate-400 text-[10px] font-mono">({driver.phone})</span>
                    </div>
                  )}

                  {alert.locationName && (
                    <div className="flex items-center gap-1.5 text-slate-600">
                      <MapPin className="w-3.5 h-3.5 text-red-500" />
                      <span>{alert.locationName}</span>
                    </div>
                  )}
                </div>

                {/* Existing Actions History (if any) */}
                {alert.actionsTaken && alert.actionsTaken.length > 0 && (
                  <div className="text-[11px] text-slate-500 bg-amber-50/50 border border-amber-200/60 rounded-md p-2 flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    <span>
                      <strong>Historique d'action :</strong> {alert.actionsTaken.join(' • ')}
                    </span>
                  </div>
                )}

                {/* Resolution Note if Resolved */}
                {alert.status === 'RESOLVED' && alert.resolutionNote && (
                  <div className="text-[11px] text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-md p-2 flex items-center gap-2">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>
                      <strong>Note de résolution :</strong> {alert.resolutionNote}
                    </span>
                  </div>
                )}

                {/* Interactive Quick-Action Buttons */}
                <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Action 1: Alert Driver via SMS / WhatsApp */}
                    {driver && (
                      <button
                        onClick={() => handleOpenSMSModal(alert)}
                        className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 cursor-pointer"
                      >
                        <MessageSquare className="w-3.5 h-3.5 text-blue-600" />
                        <span>Contacter Chauffeur</span>
                      </button>
                    )}

                    {/* Action 2: Locate on Live Map */}
                    {onNavigateToMap && alert.vehicleId && (
                      <button
                        onClick={() => onNavigateToMap(alert.vehicleId)}
                        className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 cursor-pointer"
                      >
                        <MapPin className="w-3.5 h-3.5 text-red-600" />
                        <span>Localiser sur Carte</span>
                      </button>
                    )}

                    {/* Action 3: Create Service / Maintenance Order */}
                    {(alert.category === 'MAINTENANCE' ||
                      alert.category === 'FUEL_ANOMALY' ||
                      alert.category === 'HARSH_DRIVING') && (
                      <button
                        onClick={() => handleOpenMaintenanceModal(alert)}
                        className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 cursor-pointer"
                      >
                        <Wrench className="w-3.5 h-3.5 text-amber-600" />
                        <span>Créer Ordre Service</span>
                      </button>
                    )}

                    {/* Action 4: Print Single Incident Sheet */}
                    <button
                      onClick={() => setSinglePrintAlert(alert)}
                      className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 cursor-pointer"
                    >
                      <Printer className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Imprimer Fiche Incident</span>
                    </button>

                    {/* Action 4: Gemini AI Instant Analysis */}
                    <button
                      onClick={() => handleOpenAiModal(alert)}
                      className="bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-200 font-bold text-xs px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                      <span>Analyse IA Gemini</span>
                    </button>
                  </div>

                  {/* Action 5: Resolve / Close Alert */}
                  {alert.status !== 'RESOLVED' && (
                    <button
                      onClick={() => handleResolveAlert(alert)}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-3.5 py-1.5 rounded-lg transition flex items-center gap-1.5 shadow-2xs cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Marquer Résolu</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* SMS / WhatsApp Notification Modal */}
      {smsModalAlert && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white border border-slate-200 rounded-xl p-6 max-w-lg w-full shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-blue-600" />
                <h3 className="text-base font-bold text-slate-900">Envoi Notification SMS / WhatsApp</h3>
              </div>
              <button
                onClick={() => setSmsModalAlert(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="text-xs text-slate-600 space-y-2">
              <p>
                Alerte concernée : <strong>{smsModalAlert.title}</strong>
              </p>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Message SMS à envoyer :</label>
                <textarea
                  rows={4}
                  value={smsMessage}
                  onChange={e => setSmsMessage(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-xs text-slate-800 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>
            </div>

            {smsSuccess ? (
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-emerald-800 text-xs font-bold flex items-center justify-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>
                  Alerte marquée « en cours de traitement ». L’envoi du SMS au chauffeur n’est pas encore
                  raccordé à un opérateur mobile.
                </span>
              </div>
            ) : (
              <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-3">
                <button
                  onClick={() => setSmsModalAlert(null)}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs px-4 py-2 rounded-lg cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  onClick={handleSendSMS}
                  disabled={smsSending}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-4 py-2 rounded-lg transition flex items-center gap-2 cursor-pointer shadow-xs"
                >
                  {smsSending ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Transmissions...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5" />
                      <span>Envoyer SMS Immédiatement</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Gemini AI Analysis Modal */}
      {aiModalAlert && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white border border-slate-200 rounded-xl p-6 max-w-xl w-full shadow-xl space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 text-purple-700 font-bold">
                <Sparkles className="w-5 h-5 text-purple-600 animate-pulse" />
                <h3 className="text-base font-bold text-slate-900">Analyse Diagnostique Gemini 3.6</h3>
              </div>
              <button
                onClick={() => setAiModalAlert(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs space-y-1">
              <div className="font-bold text-slate-800">{aiModalAlert.title}</div>
              <div className="text-slate-500">{aiModalAlert.description}</div>
            </div>

            {aiLoading ? (
              <div className="py-8 text-center space-y-3">
                <RefreshCw className="w-8 h-8 text-purple-600 animate-spin mx-auto" />
                <p className="text-xs font-bold text-slate-700">
                  Calcul du risque & recommandation IA en cours...
                </p>
              </div>
            ) : aiError ? (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-xs text-red-900 space-y-2">
                <div className="flex items-center gap-2 font-bold">
                  <AlertTriangle className="w-4 h-4" />
                  <span>Analyse non produite</span>
                </div>
                <p className="leading-relaxed">{aiError}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {aiSimulated && (
                  <div className="bg-amber-50 border border-amber-300 rounded-lg p-3 text-[11px] text-amber-900 font-semibold flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>
                      Exemple de démonstration — ce texte ne résulte pas de l'analyse de cette alerte. Ne
                      fondez aucune décision disciplinaire dessus.
                    </span>
                  </div>
                )}
                <div className="bg-purple-50/70 border border-purple-200 rounded-xl p-4 text-xs text-slate-800 space-y-2 whitespace-pre-line leading-relaxed font-mono">
                  {aiAnalysisResult}
                </div>
              </div>
            )}

            <div className="flex justify-end border-t border-slate-100 pt-3">
              <button
                onClick={() => setAiModalAlert(null)}
                className="bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs px-4 py-2 rounded-lg cursor-pointer"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Resolution Confirmation Modal */}
      {resolveModalAlert && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white border border-slate-200 rounded-xl p-6 max-w-md w-full shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <h3 className="text-base font-bold text-slate-900">Clôture d'Alerte</h3>
              </div>
              <button
                onClick={() => setResolveModalAlert(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="text-xs text-slate-600 space-y-2">
              <p>
                Vous allez marquer l'alerte <strong>"{resolveModalAlert.title}"</strong> comme résolue.
              </p>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Note de résolution (optionnel) :
                </label>
                <input
                  type="text"
                  placeholder="Ex: Chauffeur rappelé à l'ordre, vitesse régulée..."
                  value={resolutionNote}
                  onChange={e => setResolutionNote(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs text-slate-800 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-3">
              <button
                onClick={() => setResolveModalAlert(null)}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs px-4 py-2 rounded-lg cursor-pointer"
              >
                Annuler
              </button>
              <button
                onClick={handleConfirmResolution}
                disabled={pendingAlertId === resolveModalAlert.id}
                className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-bold text-xs px-4 py-2 rounded-lg transition flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <Check className="w-4 h-4" />
                <span>
                  {pendingAlertId === resolveModalAlert.id ? 'Enregistrement…' : 'Confirmer Résolution'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Maintenance Service Order Modal */}
      {maintModalAlert && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white border border-slate-200 rounded-xl p-6 max-w-md w-full shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Wrench className="w-5 h-5 text-amber-600" />
                <h3 className="text-base font-bold text-slate-900">Créer Ordre d'Intervention / Service</h3>
              </div>
              <button
                onClick={() => setMaintModalAlert(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="text-xs text-slate-600 space-y-3">
              <p>
                Alerte : <strong>{maintModalAlert.title}</strong>
              </p>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Prestataire / Atelier sélectionné :
                </label>
                <select
                  value={maintProvider}
                  onChange={e => setMaintProvider(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs text-slate-800 font-semibold cursor-pointer"
                >
                  <option value="Garage Central CFAO Motors Cotonou">
                    Garage Central CFAO Motors Cotonou
                  </option>
                  <option value="Atelier Interne TransAfrik">Atelier Interne TransAfrik</option>
                  <option value="Station Service Oryx Parakou">Station Service Oryx Parakou</option>
                </select>
              </div>
            </div>

            {maintSuccess ? (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-amber-800 text-xs font-bold flex items-center justify-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-amber-600" />
                <span>Ordre d'intervention planifié avec succès !</span>
              </div>
            ) : (
              <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-3">
                <button
                  onClick={() => setMaintModalAlert(null)}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs px-4 py-2 rounded-lg cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  onClick={handleConfirmMaintenance}
                  className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs px-4 py-2 rounded-lg transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <Wrench className="w-4 h-4" />
                  <span>Émettre Ordre de Service</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Printable Incident Logs Report Modal (Full Journal) */}
      <PrintableReportModal
        isOpen={showPrintIncidentLogsModal}
        onClose={() => setShowPrintIncidentLogsModal(false)}
        title="JOURNAL RÉGULATEUR DES INCIDENTS & ALERTES DE SÉCURITÉ"
        subtitle={`Organisme: ${currentOrg.name} (${currentOrg.code}) • Filtre Sélectionné: ${selectedCategory} | ${filteredAlerts.length} Événements Registrés`}
        currentOrg={currentOrg}
        reportCategory="INCIDENTS"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3 text-center border-y border-slate-300 py-3 bg-slate-50 font-mono">
            <div>
              <div className="text-[10px] text-slate-500 uppercase">Alertes Répertoriées</div>
              <div className="font-extrabold text-slate-900 text-sm">{filteredAlerts.length}</div>
            </div>
            <div>
              <div className="text-[10px] text-slate-500 uppercase">Alertes Critiques</div>
              <div className="font-extrabold text-red-600 text-sm">
                {filteredAlerts.filter(a => a.severity === 'CRITICAL').length}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-slate-500 uppercase">Anomalies Carburant</div>
              <div className="font-extrabold text-amber-600 text-sm">
                {filteredAlerts.filter(a => a.category === 'FUEL_ANOMALY').length}
              </div>
            </div>
          </div>

          <table className="w-full text-left text-[11px] border border-slate-300">
            <thead className="bg-slate-100 font-bold border-b border-slate-300">
              <tr>
                <th className="p-2 border-r border-slate-300">Horodatage</th>
                <th className="p-2 border-r border-slate-300">Type & Sévérité</th>
                <th className="p-2 border-r border-slate-300">Intitulé de l'Incident</th>
                <th className="p-2 border-r border-slate-300">Camion & Chauffeur</th>
                <th className="p-2 border-r border-slate-300">Lieu / Coordonnées</th>
                <th className="p-2 text-center">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredAlerts.map(alt => {
                const veh = orgVehicles.find(v => v.id === alt.vehicleId);
                const drv = orgDrivers.find(d => d.id === alt.driverId);
                return (
                  <tr key={alt.id}>
                    <td className="p-2 border-r border-slate-300 font-mono text-[10px]">
                      {new Date(alt.recordedAt).toLocaleString('fr-FR')}
                    </td>
                    <td className="p-2 border-r border-slate-300 font-bold text-[10px]">
                      <span
                        className={
                          alt.severity === 'CRITICAL' ? 'text-red-700 font-extrabold' : 'text-slate-800'
                        }
                      >
                        [{alt.category}] {alt.severity}
                      </span>
                    </td>
                    <td className="p-2 border-r border-slate-300">
                      <div className="font-bold text-slate-900">{alt.title}</div>
                      <div className="text-[10px] text-slate-600">{alt.description}</div>
                    </td>
                    <td className="p-2 border-r border-slate-300 text-[10px]">
                      <div className="font-bold text-slate-900">{veh?.immatriculation || 'Non assigné'}</div>
                      <div className="text-slate-600">{drv?.fullName || '-'}</div>
                    </td>
                    <td className="p-2 border-r border-slate-300 text-[10px] font-mono">
                      {alt.locationName || 'GPS indéterminé'}
                    </td>
                    <td className="p-2 text-center font-bold text-[10px]">{alt.status}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </PrintableReportModal>

      {/* Printable Single Incident Sheet Modal */}
      {singlePrintAlert && (
        <PrintableReportModal
          isOpen={!!singlePrintAlert}
          onClose={() => setSinglePrintAlert(null)}
          title={`FICHE D'INCIDENT OFFICIELLE — ${singlePrintAlert.id}`}
          subtitle={`Alerte Télématique de Sécurité | Référence: ${singlePrintAlert.title}`}
          currentOrg={currentOrg}
          reportCategory="INCIDENTS"
        >
          <div className="space-y-4">
            <div className="border border-slate-300 p-4 rounded-lg bg-slate-50 space-y-3">
              <div className="flex justify-between items-center border-b border-slate-200 pb-2">
                <span className="font-bold uppercase text-xs text-slate-900">
                  {singlePrintAlert.category} • SÉVÉRITÉ: {singlePrintAlert.severity}
                </span>
                <span className="font-mono text-[10px] bg-slate-200 px-2 py-0.5 rounded font-bold">
                  STATUT: {singlePrintAlert.status}
                </span>
              </div>

              <div>
                <h3 className="text-sm font-bold text-slate-900">{singlePrintAlert.title}</h3>
                <p className="text-xs text-slate-700 mt-1">{singlePrintAlert.description}</p>
              </div>

              <div className="grid grid-cols-2 gap-4 text-xs font-mono pt-2 border-t border-slate-200">
                <div>
                  <span className="text-slate-500 block text-[10px]">HORODATAGE ENREGISTRÉ:</span>
                  <strong className="text-slate-900">
                    {new Date(singlePrintAlert.recordedAt).toLocaleString('fr-FR')}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">MÉTRIQUE CONSTATÉE:</span>
                  <strong className="text-orange-700">{singlePrintAlert.metricValue || 'N/A'}</strong>
                </div>
              </div>
            </div>

            {/* Vehicle & Driver Box */}
            <div className="grid grid-cols-2 gap-4 border border-slate-300 p-4 rounded-lg">
              <div>
                <h4 className="font-bold text-xs uppercase text-slate-800 mb-2">Informations Véhicule</h4>
                {(() => {
                  const v = orgVehicles.find(veh => veh.id === singlePrintAlert.vehicleId);
                  return (
                    <div className="space-y-1 text-xs">
                      <div>
                        Immatriculation :{' '}
                        <strong className="font-mono text-orange-700">{v?.immatriculation || 'N/A'}</strong>
                      </div>
                      <div>
                        Marque & Modèle :{' '}
                        <strong>
                          {v?.make} {v?.model}
                        </strong>
                      </div>
                      <div>Capacité Réservoir : {v?.tankCapacityLiters} L</div>
                    </div>
                  );
                })()}
              </div>

              <div>
                <h4 className="font-bold text-xs uppercase text-slate-800 mb-2">Informations Chauffeur</h4>
                {(() => {
                  const d = orgDrivers.find(drv => drv.id === singlePrintAlert.driverId);
                  return (
                    <div className="space-y-1 text-xs">
                      <div>
                        Nom Complet : <strong>{d?.fullName || 'Non spécifié'}</strong>
                      </div>
                      <div>
                        Téléphone : <strong className="font-mono">{d?.phone || 'N/A'}</strong>
                      </div>
                      <div>
                        Score Sécurité : <strong>{d?.currentSafetyScore || 90} / 100</strong>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Location & GPS Box */}
            <div className="border border-slate-300 p-3 rounded-lg text-xs space-y-1">
              <span className="font-bold text-slate-800 block uppercase text-[10px]">
                Localisation Spatiale / GPS:
              </span>
              <div className="font-mono font-bold text-slate-900">
                {singlePrintAlert.locationName || 'Zone indéterminée'}
              </div>
              {singlePrintAlert.latitude && (
                <div className="text-[10px] text-slate-500 font-mono">
                  Coordonnées GPS: Lat {singlePrintAlert.latitude}, Long {singlePrintAlert.longitude}
                </div>
              )}
            </div>

            {/* Actions Taken Box */}
            {singlePrintAlert.actionsTaken && singlePrintAlert.actionsTaken.length > 0 && (
              <div className="border border-slate-300 p-3 rounded-lg text-xs space-y-1 bg-amber-50">
                <span className="font-bold text-amber-900 block uppercase text-[10px]">
                  Historique d'Interventions Régulation:
                </span>
                <ul className="list-disc list-inside text-amber-800 font-mono text-[11px]">
                  {singlePrintAlert.actionsTaken.map((act, i) => (
                    <li key={i}>{act}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </PrintableReportModal>
      )}
    </div>
  );
};
