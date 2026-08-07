import React, { useState, useMemo } from 'react';
import {
  useDrivers,
  useFuelLogs,
  useMaintenanceLogs,
  useSafetyEvents,
  useTrips,
  useVehicles,
} from '../../hooks/useFleetData';
import { Organization } from '../../types';
import {
  Printer,
  Filter,
  Truck,
  Fuel,
  Wrench,
  CheckCircle2,
  Sparkles,
  Award,
  TrendingDown,
  FileSpreadsheet,
} from 'lucide-react';
import { PrintableReportModal } from '../common/PrintableReportModal';

interface MonthlyReportGeneratorProps {
  currentOrg: Organization;
}

export const MonthlyReportGenerator: React.FC<MonthlyReportGeneratorProps> = ({ currentOrg }) => {
  const driversQuery = useDrivers();
  const vehiclesQuery = useVehicles();
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [selectedScope, setSelectedScope] = useState<string>('ALL'); // ALL or vehicleId
  const [showPrintModal, setShowPrintModal] = useState<boolean>(false);
  const [downloadSuccess, setDownloadSuccess] = useState<string | null>(null);

  // Filter vehicles and drivers for current organization
  const tripsQuery = useTrips({ limit: 500 });
  const fuelQuery = useFuelLogs();
  const maintenanceQuery = useMaintenanceLogs();
  const eventsQuery = useSafetyEvents();

  const orgVehicles = useMemo(() => vehiclesQuery.data ?? [], [vehiclesQuery.data]);

  /** Véhicules qui ne peuvent pas rouler, comptés et non supposés. */
  const immobilisedCount = useMemo(
    () => orgVehicles.filter(vehicle => vehicle.status !== 'ACTIVE').length,
    [orgVehicles],
  );
  const orgDrivers = useMemo(() => driversQuery.data ?? [], [driversQuery.data]);

  // Month labels helper
  /**
   * Les douze derniers mois, calculés à partir d'aujourd'hui.
   *
   * La liste était figée sur quatre mois de 2026 : elle serait devenue fausse
   * au premier changement d'année, et proposait des périodes antérieures à
   * toute donnée.
   */
  const monthOptions = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 12 }, (_, offset) => {
      const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
      const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const label = date.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
      return { value, label: offset === 0 ? `${label} (en cours)` : label };
    });
  }, []);

  /**
   * Le bilan est établi sur ce qui a été enregistré.
   *
   * Cet écran générait ses chiffres — le commentaire du code disait lui-même
   * « Mock performance data generator ». Il annonçait 27 700 km quand les
   * trajets réels en totalisaient 2 093, et « +8,4 % vs mois précédent » était
   * écrit en dur. Un bilan mensuel sert à décider d'un investissement ou d'une
   * renégociation de contrat : il ne peut pas être inventé.
   *
   * Chaque ligne se recalcule : distance depuis les trajets reconstruits,
   * carburant et coûts depuis les pleins enregistrés, entretien depuis les
   * interventions, sécurité depuis les infractions relevées.
   */
  const reportData = useMemo(() => {
    const trips = tripsQuery.data ?? [];
    const fuelLogs = fuelQuery.data ?? [];
    const maintenance = maintenanceQuery.data ?? [];
    const events = eventsQuery.data ?? [];

    const inMonth = (iso: string) => iso.slice(0, 7) === selectedMonth;

    const vehicleRows = orgVehicles
      .filter(v => selectedScope === 'ALL' || v.id === selectedScope)
      .map(v => {
        const driver = orgDrivers.find(d => d.assignedVehicleId === v.id);

        const vehicleTrips = trips.filter(t => t.vehicleId === v.id && inMonth(t.startedAt));
        const distanceKm = Math.round(vehicleTrips.reduce((sum, t) => sum + t.distanceKm, 0));

        const vehicleFuel = fuelLogs.filter(f => f.vehicleId === v.id && inMonth(f.loggedAt));
        const fuelLiters = Math.round(vehicleFuel.reduce((sum, f) => sum + f.litersAdded, 0));
        const fuelCostXOF = Math.round(vehicleFuel.reduce((sum, f) => sum + f.totalCost, 0));

        // Sans les deux mesures, la consommation ne veut rien dire.
        const avgConsumptionL100km =
          distanceKm > 0 && fuelLiters > 0 ? parseFloat(((fuelLiters / distanceKm) * 100).toFixed(1)) : 0;
        const costPerKmXOF = distanceKm > 0 ? parseFloat((fuelCostXOF / distanceKm).toFixed(1)) : 0;

        const vehicleMaint = maintenance.filter(m => m.vehicleId === v.id && inMonth(m.performedAt));
        const maintenanceCostXOF = Math.round(vehicleMaint.reduce((sum, m) => sum + m.cost, 0));

        const alertCount = events.filter(e => e.vehicleId === v.id && inMonth(e.recordedAt)).length;

        return {
          vehicleId: v.id,
          immatriculation: v.immatriculation,
          makeModel: `${v.make} ${v.model}`,
          driverName: driver ? driver.fullName : 'Non assigné',
          distanceKm,
          fuelLiters,
          fuelCostXOF,
          expectedL100km: v.expectedConsumptionL100km,
          avgConsumptionL100km,
          costPerKmXOF,
          maintenanceCount: vehicleMaint.length,
          maintenanceCostXOF,
          safetyScore: driver ? driver.currentSafetyScore : 0,
          alertCount,
        };
      });

    // Aggregates
    const totalDistanceKm = vehicleRows.reduce((sum, r) => sum + r.distanceKm, 0);
    const totalFuelLiters = vehicleRows.reduce((sum, r) => sum + r.fuelLiters, 0);
    const totalFuelCostXOF = vehicleRows.reduce((sum, r) => sum + r.fuelCostXOF, 0);
    const totalMaintCostXOF = vehicleRows.reduce((sum, r) => sum + r.maintenanceCostXOF, 0);
    const totalMaintAlerts = vehicleRows.reduce((sum, r) => sum + r.alertCount, 0);
    const avgFleetConsumption =
      totalDistanceKm > 0 ? parseFloat(((totalFuelLiters / totalDistanceKm) * 100).toFixed(1)) : 0;
    const avgCostPerKm =
      totalDistanceKm > 0 ? parseFloat((totalFuelCostXOF / totalDistanceKm).toFixed(1)) : 0;
    /**
     * Moyenne des scores, sur les seuls véhicules ayant un chauffeur affecté.
     *
     * Le calcul divisait par le nombre total de véhicules : chacun sans
     * conducteur ajoutait 0 au numérateur mais comptait au dénominateur. Avec
     * cinq camions dont deux confiés à des chauffeurs notés 90, le rapport
     * annonçait 36/100 — chiffre qui partait ensuite dans le PDF « document
     * officiel » et dans le CSV.
     */
    const scoredRows = vehicleRows.filter(row => row.safetyScore > 0);
    const avgSafetyScore =
      scoredRows.length > 0
        ? parseFloat((scoredRows.reduce((sum, r) => sum + r.safetyScore, 0) / scoredRows.length).toFixed(1))
        : null;

    return {
      periodLabel: monthOptions.find(m => m.value === selectedMonth)?.label ?? selectedMonth,
      vehicleRows,
      scoredVehicleCount: scoredRows.length,
      totalDistanceKm,
      totalFuelLiters,
      totalFuelCostXOF,
      totalMaintCostXOF,
      totalMaintAlerts,
      avgFleetConsumption,
      avgCostPerKm,
      avgSafetyScore,
      totalCostXOF: totalFuelCostXOF + totalMaintCostXOF,
    };
  }, [
    selectedMonth,
    selectedScope,
    orgVehicles,
    orgDrivers,
    monthOptions,
    tripsQuery.data,
    fuelQuery.data,
    maintenanceQuery.data,
    eventsQuery.data,
  ]);

  // Export CSV Handler
  const handleExportCSV = () => {
    const headers = [
      'Période',
      'Immatriculation',
      'Modèle',
      'Chauffeur',
      'Distance (km)',
      'Gazole Consommé (L)',
      'Coût Carburant (XOF)',
      'Conso Moyenne (L/100km)',
      'Conso Cible (L/100km)',
      'Coût/km (XOF)',
      'Nombre Alertes',
      'Coût Maintenance (XOF)',
      'Score Sécurité (/100)',
    ];

    const rows = reportData.vehicleRows.map(r => [
      `"${reportData.periodLabel}"`,
      `"${r.immatriculation}"`,
      `"${r.makeModel}"`,
      `"${r.driverName}"`,
      r.distanceKm,
      r.fuelLiters,
      r.fuelCostXOF,
      r.avgConsumptionL100km,
      r.expectedL100km,
      r.costPerKmXOF,
      r.alertCount,
      r.maintenanceCostXOF,
      r.safetyScore,
    ]);

    // Summary Line
    rows.push([
      `"TOTAL / MOYENNE FLOTTE"`,
      `"TOUS VÉHICULES"`,
      `"-"`,
      `"-"`,
      reportData.totalDistanceKm,
      reportData.totalFuelLiters,
      reportData.totalFuelCostXOF,
      reportData.avgFleetConsumption,
      `"-"`,
      reportData.avgCostPerKm,
      reportData.totalMaintAlerts,
      reportData.totalMaintCostXOF,
      reportData.avgSafetyScore ?? '',
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Rapport_Flotte_${currentOrg.code}_${selectedMonth}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setDownloadSuccess('CSV');
    setTimeout(() => setDownloadSuccess(null), 3000);
  };

  // Trigger Print / PDF Export Modal
  const handlePrintPDF = () => {
    setShowPrintModal(true);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner Header */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 border border-slate-800 rounded-xl p-6 text-white shadow-md relative overflow-hidden">
        <div className="absolute top-0 right-0 transform translate-x-6 -translate-y-6 opacity-10 pointer-events-none">
          <FileSpreadsheet className="w-64 h-64 text-orange-400" />
        </div>

        <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-orange-400 font-bold text-xs uppercase tracking-wider mb-2">
              <Sparkles className="w-4 h-4 text-orange-400 animate-pulse" />
              <span>Module d'Exportation & Reporting de Flotte</span>
            </div>
            <h2 className="text-2xl font-bold text-white tracking-tight">
              Générateur de Rapports Mensuels de Performance
            </h2>
            <p className="text-xs text-slate-300 mt-1 max-w-2xl leading-relaxed">
              Exportation automatique des bilans consolidés (Kilométrage total, coût gazole, efficacité
              énergétique, alertes de maintenance et scores de conduite) aux formats CSV et PDF.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleExportCSV}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-3.5 py-2.5 rounded-lg transition flex items-center gap-2 shadow-xs cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Exporter CSV</span>
            </button>

            <button
              onClick={handlePrintPDF}
              className="bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs px-4 py-2.5 rounded-lg transition flex items-center gap-2 shadow-xs cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Imprimer / PDF Officiel</span>
            </button>
          </div>
        </div>
      </div>

      {/* Filter & Period Controls */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs space-y-4">
        <div className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2 border-b border-slate-100 pb-2">
          <Filter className="w-4 h-4 text-orange-500" />
          <span>Paramètres du Bilan Mensuel</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Période Mensuelle</label>
            <select
              value={selectedMonth}
              onChange={e => setSelectedMonth(e.target.value)}
              className="w-full bg-slate-50 text-xs font-semibold text-slate-800 border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 cursor-pointer"
            >
              {monthOptions.map(month => (
                <option key={month.value} value={month.value}>
                  {month.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Périmètre de Flotte</label>
            <select
              value={selectedScope}
              onChange={e => setSelectedScope(e.target.value)}
              className="w-full bg-slate-50 text-xs font-semibold text-slate-800 border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 cursor-pointer"
            >
              <option value="ALL">Flotte Globale ({orgVehicles.length} Véhicules)</option>
              {orgVehicles.map(v => (
                <option key={v.id} value={v.id}>
                  {v.immatriculation} - {v.make} {v.model}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-end justify-between gap-3">
            {downloadSuccess && (
              <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 font-bold text-xs px-3 py-2.5 rounded-lg flex items-center gap-2 w-full">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Rapport {downloadSuccess} téléchargé avec succès !</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Monthly Executive Summary KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Distance Total */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs space-y-2">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Distance Totale Parcourue</span>
            <Truck className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-extrabold text-slate-900 font-mono">
            {reportData.totalDistanceKm.toLocaleString()}{' '}
            <span className="text-xs text-slate-400 font-normal">km</span>
          </div>
          <div className="text-[10px] text-emerald-600 font-bold flex items-center gap-1">
            <TrendingDown className="w-3 h-3 rotate-180" />
            {/* La comparaison au mois précédent était écrite en dur. Elle
                demande un historique que le premier mois d'exploitation n'a
                pas : mieux vaut ne rien dire que d'inventer une tendance. */}
            <span>Sur les trajets reconstruits de la période</span>
          </div>
        </div>

        {/* Metric 2: Fuel Efficiency & Expenses */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs space-y-2">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Volume & Dépenses Gazole</span>
            <Fuel className="w-4 h-4 text-orange-500" />
          </div>
          <div className="text-2xl font-extrabold text-orange-600 font-mono">
            {reportData.totalFuelCostXOF.toLocaleString()}{' '}
            <span className="text-xs text-slate-400 font-normal">XOF</span>
          </div>
          <div className="flex items-center justify-between text-[10px] text-slate-500">
            <span>
              Volume: <strong>{reportData.totalFuelLiters.toLocaleString()} L</strong>
            </span>
            <span>
              Moy: <strong>{reportData.avgFleetConsumption} L/100km</strong>
            </span>
          </div>
        </div>

        {/* Metric 3: Maintenance Expenses & Alerts */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs space-y-2">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Dépenses & Alertes Maintenance</span>
            <Wrench className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-extrabold text-amber-600 font-mono">
            {reportData.totalMaintCostXOF.toLocaleString()}{' '}
            <span className="text-xs text-slate-400 font-normal">XOF</span>
          </div>
          <div className="flex items-center justify-between text-[10px] text-slate-500">
            <span>
              Alertes: <strong>{reportData.totalMaintAlerts} événements</strong>
            </span>
            {/* « 1 immobilisation » était un littéral : il restait à 1 que la
                flotte en compte zéro ou six. */}
            <span className="text-amber-700 font-bold">{immobilisedCount} véhicule(s) hors service</span>
          </div>
        </div>

        {/* Metric 4: Driver Safety Index */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs space-y-2">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Score Moyen Sécurité Flotte</span>
            <Award className="w-4 h-4 text-purple-500" />
          </div>
          <div className="text-2xl font-extrabold text-purple-600 font-mono">
            {reportData.avgSafetyScore === null ? '—' : reportData.avgSafetyScore}{' '}
            <span className="text-xs text-slate-400 font-normal">/ 100</span>
          </div>
          {/* « Excellente conduite générale sur corridors » s'affichait à
              l'identique avec une moyenne de 31/100 : un satisfecit posé sur
              n'importe quel résultat. */}
          <div className="text-[10px] text-slate-500 font-bold">
            {reportData.avgSafetyScore === null
              ? 'Aucun véhicule avec chauffeur affecté sur la période'
              : `Moyenne sur ${reportData.scoredVehicleCount} véhicule(s) avec chauffeur`}
          </div>
        </div>
      </div>

      {/* Vehicle-by-Vehicle Performance Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-2xs overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              Détail des Performances par Véhicule — {reportData.periodLabel}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Suivi individuel des kilométrages, consommation réelle gazole et coûts de maintenance.
            </p>
          </div>

          <div className="text-xs text-slate-500 font-medium bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
            Coût Total d'Exploitation :{' '}
            <strong className="text-slate-900 font-mono">
              {reportData.totalCostXOF.toLocaleString()} XOF
            </strong>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
              <tr>
                <th className="p-3.5">Immatriculation & Modèle</th>
                <th className="p-3.5">Chauffeur Titulaire</th>
                <th className="p-3.5 text-right">Distance (km)</th>
                <th className="p-3.5 text-right">Gazole (L)</th>
                <th className="p-3.5 text-right">Moy. (L/100km)</th>
                <th className="p-3.5 text-right">Coût/km (XOF)</th>
                <th className="p-3.5 text-right">Dépenses Carburant</th>
                <th className="p-3.5 text-right">Coût Maintenance</th>
                <th className="p-3.5 text-center">Score Sécurité</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {reportData.vehicleRows.map(row => (
                <tr key={row.vehicleId} className="hover:bg-slate-50/80 transition">
                  <td className="p-3.5">
                    <div className="font-bold text-slate-900">{row.immatriculation}</div>
                    <div className="text-[10px] text-slate-500">{row.makeModel}</div>
                  </td>

                  <td className="p-3.5">
                    <div className="font-semibold text-slate-800">{row.driverName}</div>
                  </td>

                  <td className="p-3.5 text-right font-mono font-bold text-slate-900">
                    {row.distanceKm.toLocaleString()}
                  </td>

                  <td className="p-3.5 text-right font-mono text-slate-800">
                    {row.fuelLiters.toLocaleString()} L
                  </td>

                  <td className="p-3.5 text-right">
                    <span
                      className={`font-mono font-bold px-2 py-0.5 rounded text-[11px] ${
                        row.avgConsumptionL100km > row.expectedL100km * 1.05
                          ? 'bg-red-50 text-red-700 border border-red-200'
                          : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      }`}
                    >
                      {row.avgConsumptionL100km} L
                    </span>
                  </td>

                  <td className="p-3.5 text-right font-mono text-slate-700">{row.costPerKmXOF} XOF</td>

                  <td className="p-3.5 text-right font-mono font-bold text-orange-600">
                    {row.fuelCostXOF.toLocaleString()} XOF
                  </td>

                  <td className="p-3.5 text-right font-mono font-bold text-amber-600">
                    {row.maintenanceCostXOF.toLocaleString()} XOF
                  </td>

                  <td className="p-3.5 text-center font-mono font-extrabold text-purple-700">
                    {row.safetyScore} / 100
                  </td>
                </tr>
              ))}
            </tbody>

            {/* Total Footer Row */}
            <tfoot className="bg-slate-900 text-white font-bold border-t-2 border-slate-800">
              <tr>
                <td className="p-3.5" colSpan={2}>
                  TOTAL FLOTTE CONSOLIDÉ
                </td>
                <td className="p-3.5 text-right font-mono text-orange-400 text-sm">
                  {reportData.totalDistanceKm.toLocaleString()} km
                </td>
                <td className="p-3.5 text-right font-mono">
                  {reportData.totalFuelLiters.toLocaleString()} L
                </td>
                <td className="p-3.5 text-right font-mono text-emerald-400">
                  {reportData.avgFleetConsumption} L/100km
                </td>
                <td className="p-3.5 text-right font-mono">{reportData.avgCostPerKm} XOF</td>
                <td className="p-3.5 text-right font-mono text-orange-400">
                  {reportData.totalFuelCostXOF.toLocaleString()} XOF
                </td>
                <td className="p-3.5 text-right font-mono text-amber-400">
                  {reportData.totalMaintCostXOF.toLocaleString()} XOF
                </td>
                <td className="p-3.5 text-center font-mono text-purple-300">
                  {reportData.avgSafetyScore} / 100
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Printable Report Modal */}
      <PrintableReportModal
        isOpen={showPrintModal}
        onClose={() => setShowPrintModal(false)}
        title={`RAPPORT MENSUEL DE PERFORMANCE FLOTTE — ${reportData.periodLabel}`}
        subtitle={`Organisme: ${currentOrg.name} (${currentOrg.code}) • Synthèse Consolidée Exploitation & Coûts`}
        currentOrg={currentOrg}
        reportCategory="PERFORMANCE"
        onExportCSV={handleExportCSV}
      >
        {/* KPI Summary Block for Print */}
        <div className="grid grid-cols-4 gap-3 text-center border-y border-slate-300 py-3 bg-slate-50 font-mono">
          <div>
            <div className="text-[10px] text-slate-500 uppercase">Distance Totale</div>
            <div className="font-extrabold text-slate-900 text-sm">
              {reportData.totalDistanceKm.toLocaleString()} km
            </div>
          </div>
          <div>
            <div className="text-[10px] text-slate-500 uppercase">Volume Gazole</div>
            <div className="font-extrabold text-orange-600 text-sm">
              {reportData.totalFuelLiters.toLocaleString()} L
            </div>
          </div>
          <div>
            <div className="text-[10px] text-slate-500 uppercase">Coût Carburant</div>
            <div className="font-extrabold text-slate-900 text-sm">
              {reportData.totalFuelCostXOF.toLocaleString()} XOF
            </div>
          </div>
          <div>
            <div className="text-[10px] text-slate-500 uppercase">Score Sécurité Moy</div>
            <div className="font-extrabold text-purple-700 text-sm">{reportData.avgSafetyScore} / 100</div>
          </div>
        </div>

        {/* Detail Table for Print */}
        <div>
          <h3 className="font-bold text-xs uppercase text-slate-800 mb-2">
            Détail des Performances par Véhicule
          </h3>
          <table className="w-full text-left text-[11px] border border-slate-300">
            <thead className="bg-slate-100 font-bold border-b border-slate-300">
              <tr>
                <th className="p-2 border-r border-slate-300">Véhicule</th>
                <th className="p-2 border-r border-slate-300">Chauffeur</th>
                <th className="p-2 border-r border-slate-300 text-right">Distance (km)</th>
                <th className="p-2 border-r border-slate-300 text-right">Gazole (L)</th>
                <th className="p-2 border-r border-slate-300 text-right">Conso Moy.</th>
                <th className="p-2 border-r border-slate-300 text-right">Coût Gazole</th>
                <th className="p-2 text-center">Score Sécurité</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {reportData.vehicleRows.map(r => (
                <tr key={r.vehicleId}>
                  <td className="p-2 border-r border-slate-300 font-bold">
                    {r.immatriculation} ({r.makeModel})
                  </td>
                  <td className="p-2 border-r border-slate-300">{r.driverName}</td>
                  <td className="p-2 border-r border-slate-300 text-right font-mono">
                    {r.distanceKm.toLocaleString()}
                  </td>
                  <td className="p-2 border-r border-slate-300 text-right font-mono">
                    {r.fuelLiters.toLocaleString()} L
                  </td>
                  <td className="p-2 border-r border-slate-300 text-right font-mono">
                    {r.avgConsumptionL100km} L/100km
                  </td>
                  <td className="p-2 border-r border-slate-300 text-right font-mono font-bold text-orange-700">
                    {r.fuelCostXOF.toLocaleString()} XOF
                  </td>
                  <td className="p-2 text-center font-mono font-bold">{r.safetyScore}/100</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-slate-200 font-bold border-t-2 border-slate-400">
              <tr>
                <td className="p-2 border-r border-slate-300" colSpan={2}>
                  TOTAL FLOTTE
                </td>
                <td className="p-2 border-r border-slate-300 text-right font-mono">
                  {reportData.totalDistanceKm.toLocaleString()} km
                </td>
                <td className="p-2 border-r border-slate-300 text-right font-mono">
                  {reportData.totalFuelLiters.toLocaleString()} L
                </td>
                <td className="p-2 border-r border-slate-300 text-right font-mono">
                  {reportData.avgFleetConsumption} L/100km
                </td>
                <td className="p-2 border-r border-slate-300 text-right font-mono">
                  {reportData.totalFuelCostXOF.toLocaleString()} XOF
                </td>
                <td className="p-2 text-center font-mono">{reportData.avgSafetyScore}/100</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </PrintableReportModal>
    </div>
  );
};
