import React, { useState, useMemo } from 'react';
import { useDrivers, useVehicles } from '../../hooks/useFleetData';
import { Organization, Driver } from '../../types';
import { ShiftFatigueOptimizer } from './ShiftFatigueOptimizer';
import { VehicleMaintenanceHistoryTab } from './VehicleMaintenanceHistoryTab';
import { DriverFormModal } from './DriverFormModal';
import {
  UserPlus,
  Users,
  Award,
  Truck,
  ShieldCheck,
  ShieldAlert,
  Search,
  Filter,
  Phone,
  Gauge,
  Star,
  ChevronRight,
  MessageSquare,
  Zap,
  Wrench,
} from 'lucide-react';

interface DriverManagementProps {
  currentOrg: Organization;
  onNavigateToMessaging?: (driverId: string) => void;
}

export type PerformanceGrade = 'GOLD_ELITE' | 'SILVER_SAFE' | 'BRONZE_STANDARD' | 'RISK_WARNING';

export interface PerformanceBadgeInfo {
  grade: PerformanceGrade;
  title: string;
  badgeLabel: string;
  bgClass: string;
  textClass: string;
  borderClass: string;
  icon: React.ReactNode;
  description: string;
}

/**
 * Tranche du barème correspondant à un score.
 *
 * Les quatre descriptions affirmaient des faits sur la personne — « Zéro
 * événement critique de survitesse », « freinages brusques sur les 30 derniers
 * jours » — alors qu'elles n'étaient attachées qu'à une tranche de score.
 * Un chauffeur à 91/100 était crédité de zéro survitesse même s'il en avait
 * commis trois ; un autre à 69 se voyait reprocher des « incidents répétés »
 * jamais constatés. Le serveur compte pourtant les infractions réelles.
 *
 * Le texte décrit désormais la tranche, pas la conduite : c'est ce que cette
 * fonction sait, et rien de plus.
 */
export const get30DayPerformanceBadge = (score: number): PerformanceBadgeInfo => {
  if (score >= 90) {
    return {
      grade: 'GOLD_ELITE',
      title: 'Performance 30J — Élite Or',
      badgeLabel: '🏆 Élite Or (90-100)',
      bgClass: 'bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950',
      textClass: 'text-amber-700',
      borderClass: 'border-amber-300',
      icon: <Star className="w-4 h-4 fill-amber-950 text-amber-950" />,
      description:
        'Tranche haute du barème. Le détail des infractions relevées figure sur la fiche du chauffeur.',
    };
  } else if (score >= 80) {
    return {
      grade: 'SILVER_SAFE',
      title: 'Performance 30J — Conduite Sûre',
      badgeLabel: '🥇 Conducteur Sûr (80-89)',
      bgClass: 'bg-gradient-to-r from-slate-200 to-slate-300 text-slate-900',
      textClass: 'text-slate-700',
      borderClass: 'border-slate-300',
      icon: <ShieldCheck className="w-4 h-4 text-slate-800" />,
      description: 'Tranche « conduite maîtrisée » du barème, sur les 30 derniers jours.',
    };
  } else if (score >= 70) {
    return {
      grade: 'BRONZE_STANDARD',
      title: 'Performance 30J — Statut Conforme',
      badgeLabel: '🥈 Standard Conforme (70-79)',
      bgClass: 'bg-gradient-to-r from-orange-200 to-amber-200 text-amber-950',
      textClass: 'text-amber-800',
      borderClass: 'border-amber-300',
      icon: <Award className="w-4 h-4 text-amber-900" />,
      description: 'Tranche « conforme » du barème : le score reste au-dessus du seuil de vigilance.',
    };
  } else {
    return {
      grade: 'RISK_WARNING',
      title: 'Performance 30J — Suivi Requis',
      badgeLabel: '⚠️ Vigilance & Suivi (< 70)',
      bgClass: 'bg-gradient-to-r from-red-500 to-rose-600 text-white',
      textClass: 'text-red-700',
      borderClass: 'border-red-300',
      icon: <ShieldAlert className="w-4 h-4 text-white" />,
      description:
        'Tranche de vigilance : le score est passé sous le seuil. Le motif se lit dans le détail du score.',
    };
  }
};

export const DriverManagement: React.FC<DriverManagementProps> = ({ currentOrg, onNavigateToMessaging }) => {
  /**
   * Saisie d'un chauffeur.
   *
   * Sans elle, l'API savait en créer mais aucun écran ne s'en servait :
   * intégrer un transporteur supposait d'exécuter du SQL à sa place.
   */
  const [showDriverForm, setShowDriverForm] = useState(false);

  const driversQuery = useDrivers();
  const vehiclesQuery = useVehicles();
  const drivers = useMemo(() => driversQuery.data ?? [], [driversQuery.data]);

  const vehicles = useMemo(() => vehiclesQuery.data ?? [], [vehiclesQuery.data]);

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedGradeFilter, setSelectedGradeFilter] = useState<string>('ALL');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('ALL');
  const [selectedDriverDetail, setSelectedDriverDetail] = useState<Driver | null>(null);

  // Sub-Module View Mode ('PROFILES' or 'FATIGUE_OPTIMIZER' or 'MAINTENANCE_HISTORY')
  const [activeModuleView, setActiveModuleView] = useState<
    'PROFILES' | 'FATIGUE_OPTIMIZER' | 'MAINTENANCE_HISTORY'
  >('PROFILES');

  // Compute Drivers with Vehicle Map & Badges
  const driversWithDetails = useMemo(() => {
    return drivers.map(driver => {
      const assignedVehicle = vehicles.find(
        v => v.id === driver.assignedVehicleId || v.currentDriverId === driver.id,
      );
      const badge = get30DayPerformanceBadge(driver.currentSafetyScore);
      return {
        ...driver,
        assignedVehicle,
        badge,
      };
    });
  }, [drivers, vehicles]);

  // Filtered List
  const filteredDrivers = useMemo(() => {
    return driversWithDetails.filter(d => {
      const matchesSearch =
        !searchQuery ||
        d.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        d.licenseNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (d.assignedVehicle &&
          d.assignedVehicle.immatriculation.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesGrade = selectedGradeFilter === 'ALL' || d.badge.grade === selectedGradeFilter;

      const matchesStatus = selectedStatusFilter === 'ALL' || d.status === selectedStatusFilter;

      return matchesSearch && matchesGrade && matchesStatus;
    });
  }, [driversWithDetails, searchQuery, selectedGradeFilter, selectedStatusFilter]);

  // KPI Metrics
  const totalKm = useMemo(() => {
    return drivers.reduce((acc, d) => acc + d.totalKmDriven, 0);
  }, [drivers]);

  /**
   * Permis dont l'échéance n'est pas dépassée.
   *
   * L'écran affirmait « 100 % Permis Vérifiés CEDEAO » sans jamais comparer
   * `licenseExpiryDate` à quoi que ce soit. Un permis expiré immobilise camion
   * et marchandise au poste frontière : l'affirmation coûtait plus cher que
   * l'absence d'information.
   */
  const licensesValidCount = useMemo(() => {
    const today = new Date();
    return drivers.filter(driver => new Date(driver.licenseExpiryDate) >= today).length;
  }, [drivers]);

  const eliteCount = useMemo(() => {
    return drivers.filter(d => d.currentSafetyScore >= 90).length;
  }, [drivers]);

  return (
    <div className="space-y-6">
      {showDriverForm && (
        <DriverFormModal
          vehicles={vehiclesQuery.data ?? []}
          onClose={() => setShowDriverForm(false)}
          onSaved={driversQuery.reload}
        />
      )}

      {/* Top Banner Header */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-orange-600 text-xs font-bold uppercase tracking-wider mb-1">
            <Users className="w-4 h-4 text-orange-500" />
            <span>Gestion de Flotte • Conducteurs, Badges & Sécurité</span>
          </div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <span>Gestion des Conducteurs & Optimiseur de Roulements</span>
            <span className="bg-orange-100 text-orange-800 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border border-orange-200">
              {drivers.length} Conducteurs Actifs
            </span>
          </h2>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl leading-relaxed">
            Suivi des compétences, badges de conduite 30J, affectations de camions et prévention prédictive de
            la fatigue au volant.
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => setShowDriverForm(true)}
            className="px-3.5 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs flex items-center gap-1.5 transition shadow-xs cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>Ajouter un chauffeur</span>
          </button>

          {/* View Selector Tabs */}
          <div className="flex items-center bg-slate-100 p-1.5 rounded-xl border border-slate-200 gap-1 flex-wrap">
            <button
              onClick={() => setActiveModuleView('PROFILES')}
              className={`px-3.5 py-2 rounded-lg font-bold text-xs flex items-center gap-2 transition cursor-pointer ${
                activeModuleView === 'PROFILES'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Users className="w-4 h-4 text-orange-500" />
              <span>Conducteurs & Badges 30J</span>
            </button>

            <button
              onClick={() => setActiveModuleView('FATIGUE_OPTIMIZER')}
              className={`px-3.5 py-2 rounded-lg font-bold text-xs flex items-center gap-2 transition cursor-pointer ${
                activeModuleView === 'FATIGUE_OPTIMIZER'
                  ? 'bg-orange-500 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Zap className="w-4 h-4 text-amber-300" />
              <span>Optimiseur de Roulements & Fatigue</span>
              <span className="bg-amber-100 text-amber-900 text-[9px] font-extrabold px-1.5 py-0.2 rounded-full">
                Nouveau
              </span>
            </button>

            <button
              onClick={() => setActiveModuleView('MAINTENANCE_HISTORY')}
              className={`px-3.5 py-2 rounded-lg font-bold text-xs flex items-center gap-2 transition cursor-pointer ${
                activeModuleView === 'MAINTENANCE_HISTORY'
                  ? 'bg-orange-500 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Wrench className="w-4 h-4 text-amber-300" />
              <span>Historique de Maintenance</span>
            </button>
          </div>
        </div>
      </div>

      {/* Render Active Sub-Module View */}
      {activeModuleView === 'MAINTENANCE_HISTORY' ? (
        <VehicleMaintenanceHistoryTab currentOrg={currentOrg} />
      ) : activeModuleView === 'FATIGUE_OPTIMIZER' ? (
        <ShiftFatigueOptimizer
          currentOrg={currentOrg}
          drivers={drivers}
          vehicles={vehicles}
          onNavigateToMessaging={onNavigateToMessaging}
        />
      ) : (
        <>
          {/* KPI Cards Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-xs">
              <div className="flex items-center justify-between text-slate-500 text-xs mb-1">
                <span className="font-medium">Total Chauffeurs</span>
                <Users className="w-4 h-4 text-slate-400" />
              </div>
              <div className="text-2xl font-bold font-mono text-slate-900">{drivers.length}</div>
              <div className="text-[10px] text-emerald-600 font-semibold mt-1">
                {licensesValidCount} / {drivers.length} permis en cours de validité
              </div>
            </div>

            <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-xs">
              <div className="flex items-center justify-between text-slate-500 text-xs mb-1">
                <span className="font-medium">Distance Totale Parcourue</span>
                <Gauge className="w-4 h-4 text-orange-500" />
              </div>
              <div className="text-2xl font-bold font-mono text-orange-600">
                {totalKm.toLocaleString()} <span className="text-xs font-semibold">km</span>
              </div>
              <div className="text-[10px] text-slate-500 font-medium mt-1">Cumul historique de la flotte</div>
            </div>

            <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-xs">
              <div className="flex items-center justify-between text-slate-500 text-xs mb-1">
                <span className="font-medium">Badges Élite Or (30J)</span>
                <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
              </div>
              <div className="text-2xl font-bold font-mono text-amber-600">{eliteCount}</div>
              <div className="text-[10px] text-amber-700 font-semibold mt-1">Top performers (Score ≥ 90)</div>
            </div>

            <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-xs">
              <div className="flex items-center justify-between text-slate-500 text-xs mb-1">
                <span className="font-medium">Chauffeurs avec véhicule affecté</span>
                <Truck className="w-4 h-4 text-blue-500" />
              </div>
              <div className="text-2xl font-bold font-mono text-slate-900">
                {drivers.filter(d => d.assignedVehicleId).length} / {drivers.length}
              </div>
              <div className="text-[10px] text-blue-600 font-semibold mt-1">
                Affectation administrative, pas un état de connexion
              </div>
            </div>
          </div>

          {/* Filter & Search Toolbar */}
          <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-xs flex flex-wrap items-center justify-between gap-4">
            {/* Search Bar */}
            <div className="relative flex-1 min-w-[240px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Rechercher par nom, immatriculation ou permis..."
                className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
              />
            </div>

            {/* Grade Filter */}
            <div className="flex items-center gap-2 text-xs">
              <Filter className="w-4 h-4 text-slate-400" />
              <span className="font-bold text-slate-700">Badge 30J:</span>
              <select
                value={selectedGradeFilter}
                onChange={e => setSelectedGradeFilter(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 font-bold text-slate-800 text-xs focus:ring-2 focus:ring-orange-500/20 cursor-pointer"
              >
                <option value="ALL">Tous les badges (Tous)</option>
                <option value="GOLD_ELITE">🏆 Élite Or (≥ 90)</option>
                <option value="SILVER_SAFE">🥇 Conducteur Sûr (80-89)</option>
                <option value="BRONZE_STANDARD">🥈 Standard Conforme (70-79)</option>
                <option value="RISK_WARNING">⚠️ Suivi Requis (&lt; 70)</option>
              </select>
            </div>

            {/* Status Filter */}
            <div className="flex items-center gap-2 text-xs">
              <span className="font-bold text-slate-700">Statut:</span>
              <select
                value={selectedStatusFilter}
                onChange={e => setSelectedStatusFilter(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 font-bold text-slate-800 text-xs focus:ring-2 focus:ring-orange-500/20 cursor-pointer"
              >
                <option value="ALL">Tous les statuts</option>
                <option value="ON_TRIP">🚚 En Trajet (ON_TRIP)</option>
                <option value="AVAILABLE">🟢 Disponible (AVAILABLE)</option>
                <option value="OFF_DUTY">☕ En Repos (OFF_DUTY)</option>
              </select>
            </div>
          </div>

          {/* Driver Profiles Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredDrivers.length === 0 ? (
              <div className="col-span-full bg-white border border-slate-200 rounded-xl p-12 text-center text-slate-500 text-xs italic">
                Aucun chauffeur ne correspond aux critères de recherche sélectionnés.
              </div>
            ) : (
              filteredDrivers.map(driver => {
                const { badge, assignedVehicle } = driver;

                return (
                  <div
                    key={driver.id}
                    className="bg-white border border-slate-200 hover:border-orange-300 rounded-xl shadow-xs hover:shadow-md transition duration-200 overflow-hidden flex flex-col justify-between"
                  >
                    {/* Driver Card Body */}
                    <div className="p-5 space-y-4">
                      {/* Top Header: Avatar & Status */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-orange-500 to-amber-600 text-white flex items-center justify-center font-extrabold text-base shadow-sm shrink-0">
                            {driver.fullName
                              .split(' ')
                              .map(n => n[0])
                              .join('')}
                          </div>

                          <div>
                            <h3 className="font-bold text-slate-900 text-sm hover:text-orange-600 transition">
                              {driver.fullName}
                            </h3>
                            <div className="text-xs text-slate-500 flex items-center gap-1.5 mt-0.5 font-medium">
                              <Phone className="w-3 h-3 text-slate-400" />
                              <span>{driver.phone || 'non renseigné'}</span>
                            </div>
                          </div>
                        </div>

                        <span
                          className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full uppercase border tracking-wider ${
                            driver.status === 'ON_TRIP'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : driver.status === 'AVAILABLE'
                                ? 'bg-blue-50 text-blue-700 border-blue-200'
                                : 'bg-slate-100 text-slate-600 border-slate-200'
                          }`}
                        >
                          {driver.status === 'ON_TRIP'
                            ? '🚚 EN TRAJET'
                            : driver.status === 'AVAILABLE'
                              ? '🟢 DISPONIBLE'
                              : '☕ REPOS'}
                        </span>
                      </div>

                      {/* 30-Day Performance Badge Container */}
                      <div
                        className={`p-3 rounded-xl border ${badge.borderClass} ${badge.bgClass} shadow-2xs space-y-1.5`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 font-extrabold text-xs">
                            {badge.icon}
                            <span>{badge.badgeLabel}</span>
                          </div>

                          <div className="font-mono font-extrabold text-xs">
                            Score: {driver.currentSafetyScore} / 100
                          </div>
                        </div>

                        <p className="text-[11px] leading-tight opacity-90 font-medium">
                          {badge.description}
                        </p>
                      </div>

                      {/* Distance Driven Metric */}
                      <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl flex items-center justify-between">
                        <div>
                          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                            Distance Totale Parcourue
                          </div>
                          <div className="text-lg font-bold font-mono text-orange-600 mt-0.5">
                            {driver.totalKmDriven.toLocaleString()}{' '}
                            <span className="text-xs font-semibold text-slate-600">km</span>
                          </div>
                        </div>

                        {/* « Moy. mensuelle » divisait le kilométrage de toute
                            la carrière par 12, en supposant douze mois
                            d'ancienneté pour chacun — aucune date d'embauche
                            n'existe en base. Le score, lui, est réellement
                            calculé sur 30 jours. */}
                        <div className="text-right">
                          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                            Score sur 30 jours
                          </div>
                          <div className="text-xs font-mono font-bold text-slate-700 mt-0.5">
                            {driver.currentSafetyScore.toFixed(0)} / 100
                          </div>
                        </div>
                      </div>

                      {/* Assigned Vehicle Section */}
                      <div className="border-t border-slate-100 pt-3 space-y-2">
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                          <span>Camion Assigné Actuel</span>
                          <span className="text-slate-500 font-mono">Véhicule affecté</span>
                        </div>

                        {assignedVehicle ? (
                          <div className="bg-slate-50 border border-slate-200 p-2.5 rounded-lg flex items-center justify-between gap-2 text-xs">
                            <div className="flex items-center gap-2">
                              <Truck className="w-4 h-4 text-orange-500 shrink-0" />
                              <div>
                                <div className="font-mono font-bold text-slate-900 text-xs">
                                  {assignedVehicle.immatriculation}
                                </div>
                                <div className="text-[11px] text-slate-500 font-medium">
                                  {assignedVehicle.make} {assignedVehicle.model}
                                </div>
                              </div>
                            </div>

                            <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold px-2 py-0.5 rounded">
                              {assignedVehicle.type}
                            </span>
                          </div>
                        ) : (
                          <div className="bg-amber-50 border border-amber-200 p-2.5 rounded-lg text-xs text-amber-800 font-medium flex items-center justify-between">
                            <span>Aucun véhicule fixe assigné</span>
                            <span className="text-[10px] font-bold underline cursor-pointer">Affecter</span>
                          </div>
                        )}
                      </div>

                      {/* License & Credentials Info */}
                      <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600 bg-slate-50/50 p-2.5 rounded-lg border border-slate-100">
                        <div>
                          <span className="text-slate-400 block text-[10px]">Permis CEDEAO</span>
                          <strong className="text-slate-800 font-mono">{driver.licenseNumber}</strong>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[10px]">Catégorie</span>
                          <strong className="text-slate-800 font-bold">
                            {driver.licenseCategory || 'non renseignée'}
                          </strong>
                        </div>
                      </div>
                    </div>

                    {/* Card Action Footer */}
                    <div className="bg-slate-50 border-t border-slate-200 p-3 flex items-center justify-between gap-2">
                      <button
                        onClick={() => setSelectedDriverDetail(driver)}
                        className="text-xs font-bold text-slate-700 hover:text-orange-600 transition flex items-center gap-1 cursor-pointer"
                      >
                        <span>Fiche Détaillée 30J</span>
                        <ChevronRight className="w-4 h-4" />
                      </button>

                      {onNavigateToMessaging && (
                        <button
                          onClick={() => onNavigateToMessaging(driver.id)}
                          className="bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 shadow-2xs cursor-pointer"
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                          <span>Envoyer Consigne</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Driver Detail Drawer / Modal */}
          {selectedDriverDetail && (
            <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
              <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-200 p-6 space-y-6">
                {/* Modal Header */}
                <div className="flex items-start justify-between border-b border-slate-200 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-orange-500 text-white font-extrabold text-lg flex items-center justify-center">
                      {selectedDriverDetail.fullName
                        .split(' ')
                        .map(n => n[0])
                        .join('')}
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-slate-900">{selectedDriverDetail.fullName}</h3>
                      <div className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                        <span>
                          N° Permis:{' '}
                          <strong className="font-mono text-slate-800">
                            {selectedDriverDetail.licenseNumber}
                          </strong>
                        </span>
                        <span>•</span>
                        <span>
                          Catégorie: <strong>{selectedDriverDetail.licenseCategory}</strong>
                        </span>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => setSelectedDriverDetail(null)}
                    className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 transition cursor-pointer"
                  >
                    ✕
                  </button>
                </div>

                {/* Performance Badge & 30-Day Breakdown */}
                <div className="space-y-4">
                  <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                    <Award className="w-4 h-4 text-orange-500" />
                    <span>Bilan de Conduite & Performance sur 30 Jours Glissants</span>
                  </h4>

                  {(() => {
                    const b = get30DayPerformanceBadge(selectedDriverDetail.currentSafetyScore);
                    return (
                      <div className={`p-4 rounded-xl border ${b.borderClass} ${b.bgClass} space-y-2`}>
                        <div className="flex items-center justify-between font-extrabold text-sm">
                          <div className="flex items-center gap-2">
                            {b.icon}
                            <span>{b.badgeLabel}</span>
                          </div>
                          <span className="font-mono text-base">
                            {selectedDriverDetail.currentSafetyScore} / 100
                          </span>
                        </div>
                        <p className="text-xs opacity-90 leading-relaxed font-medium">{b.description}</p>
                      </div>
                    );
                  })()}

                  {/* 30-Day Criteria Metrics Grid */}
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    {/* Quatre valeurs ont été retirées ici.

                        « Distance parcourue (30J) » divisait le kilométrage de
                        toute la carrière par 10. « Respect limitateur 98,2 % »,
                        « Éco-conduite −4,2 L/100km » et « 0 Incident » étaient
                        trois littéraux, identiques pour chaque chauffeur : la
                        fiche d'une personne affichait « 0 incident » alors que
                        ses freinages brutaux étaient enregistrés.

                        Ce qui est réellement mesuré sur 30 jours — score,
                        infractions par type, distance — est calculé par le
                        serveur et se consulte dans « Score de conduite ». */}
                    <div className="col-span-2 bg-slate-50 p-3 rounded-xl border border-slate-200 text-[11px] leading-relaxed text-slate-600">
                      Le détail des 30 derniers jours — infractions par type, distance retenue et poids de
                      chaque pénalité — se consulte dans « Score de conduite », où chaque déduction est
                      expliquée. Il n'est pas repris ici pour éviter d'afficher deux versions du même chiffre.
                    </div>
                  </div>
                </div>

                {/* Modal Actions */}
                <div className="border-t border-slate-200 pt-4 flex items-center justify-end gap-3">
                  <button
                    onClick={() => setSelectedDriverDetail(null)}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition cursor-pointer"
                  >
                    Fermer
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
