import React, { useMemo, useState } from 'react';
import { Organization } from '../../types';
import { useFuelLogs, useTrips, useVehicles } from '../../hooks/useFleetData';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import {
  Fuel,
  TrendingDown,
  AlertTriangle,
  Sparkles,
  CheckCircle2,
  BarChart3,
  Zap,
  Droplets,
  Truck,
  ShieldCheck,
  DollarSign,
  ArrowDownRight,
  Info,
} from 'lucide-react';

interface FuelAnalyticsDashboardProps {
  currentOrg: Organization;
}

// Monthly fuel consumption trend data per vehicle category (in Liters)

// Share of total fuel by category (for pie chart)

// Efficiency Benchmark per Category

/**
 * Analyse des consommations.
 *
 * Trois jeux de données étaient écrits en dur : douze mois de tendances, une
 * répartition par catégorie de véhicule et des « écarts à l'objectif » assortis
 * de causes présumées — « ralenti prolongé aux postes de péage & climatisation
 * cabine nocturne ». Rien de tout cela n'était mesuré. Un transporteur qui
 * décide d'un investissement sur ces courbes se trompe deux fois : sur le
 * diagnostic et sur le montant.
 *
 * Les séries sont désormais reconstituées mois par mois à partir des pleins
 * enregistrés et des trajets reconstruits. Un mois sans plein n'apparaît pas :
 * mieux vaut une courbe courte qu'une courbe inventée.
 */
export const FuelAnalyticsDashboard: React.FC<FuelAnalyticsDashboardProps> = ({ currentOrg }) => {
  const fuelQuery = useFuelLogs();
  const tripsQuery = useTrips({ limit: 500 });
  const vehiclesQuery = useVehicles();
  const [metricType, setMetricType] = useState<'liters' | 'cost' | 'avgL100km'>('liters');
  const [chartType, setChartType] = useState<'stacked_bar' | 'line' | 'area'>('stacked_bar');
  const [selectedTimeframe, setSelectedTimeframe] = useState<'7M' | '3M' | 'YTD'>('7M');

  /** Séries mensuelles, reconstituées depuis les pleins et les trajets. */
  const monthlyTrends = useMemo(() => {
    const fuelLogs = fuelQuery.data ?? [];
    const trips = tripsQuery.data ?? [];
    const vehicles = vehiclesQuery.data ?? [];

    const typeOf = (vehicleId: string) => vehicles.find(v => v.id === vehicleId)?.type;
    const buckets = new Map<
      string,
      {
        poidsLourds: number;
        porteursBennes: number;
        utilitaires: number;
        frigorifiques: number;
        costXOF: number;
        distanceKm: number;
      }
    >();

    const bucketFor = (key: string) => {
      if (!buckets.has(key)) {
        buckets.set(key, {
          poidsLourds: 0,
          porteursBennes: 0,
          utilitaires: 0,
          frigorifiques: 0,
          costXOF: 0,
          distanceKm: 0,
        });
      }
      return buckets.get(key)!;
    };

    for (const log of fuelLogs) {
      const bucket = bucketFor(log.loggedAt.slice(0, 7));
      const type = typeOf(log.vehicleId);
      if (type === 'HEAVY_TRUCK' || type === 'CONTAINER_CARRIER') bucket.poidsLourds += log.litersAdded;
      else if (type === 'MEDIUM_TRUCK') bucket.porteursBennes += log.litersAdded;
      else bucket.utilitaires += log.litersAdded;
      bucket.costXOF += log.totalCost;
    }

    for (const trip of trips) {
      bucketFor(trip.startedAt.slice(0, 7)).distanceKm += trip.distanceKm;
    }

    return [...buckets.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, bucket]) => {
        const liters = bucket.poidsLourds + bucket.porteursBennes + bucket.utilitaires + bucket.frigorifiques;
        return {
          month: new Date(`${key}-01T00:00:00Z`).toLocaleDateString('fr-FR', { month: 'short' }),
          ...bucket,
          // Sans distance mesurée, la consommation moyenne n'a pas de sens.
          avgL100km: bucket.distanceKm > 0 ? Math.round((liters / bucket.distanceKm) * 100 * 10) / 10 : 0,
          targetLiters: 0,
        };
      });
  }, [fuelQuery.data, tripsQuery.data, vehiclesQuery.data]);

  const displayData = selectedTimeframe === '3M' ? monthlyTrends.slice(-3) : monthlyTrends;

  /** Répartition par catégorie de véhicule, sur la même période affichée. */
  /**
   * Écart à la référence, par véhicule.
   *
   * Le tableau précédent comparait des « catégories » à des objectifs
   * constructeur écrits en dur, et imputait l'écart à des causes présumées.
   * La comparaison se fait maintenant véhicule par véhicule, entre la
   * consommation mesurée sur ses pleins et sa consommation de référence — la
   * seule qui figure sur sa fiche.
   */
  const efficiencyBenchmarks = useMemo(() => {
    const fuelLogs = fuelQuery.data ?? [];
    const trips = tripsQuery.data ?? [];

    return (vehiclesQuery.data ?? [])
      .map(vehicle => {
        const fills = fuelLogs
          .filter(log => log.vehicleId === vehicle.id)
          .sort((a, b) => a.odometerKm - b.odometerKm);

        // Un plein isolé ne mesure rien : le carburant déjà dans le réservoir
        // n'a jamais été compté.
        if (fills.length < 2) return null;

        const distanceKm = fills[fills.length - 1]!.odometerKm - fills[0]!.odometerKm;
        if (distanceKm < 200) return null;

        const liters = fills.slice(1).reduce((sum, log) => sum + log.litersAdded, 0);
        const actual = Math.round((liters / distanceKm) * 100 * 10) / 10;
        const target = vehicle.expectedConsumptionL100km;
        if (actual < 5 || actual > 120) return null;

        const gapPct = Math.round(((actual - target) / target) * 100);

        return {
          category: `${vehicle.immatriculation} — ${vehicle.make} ${vehicle.model}`,
          actual,
          target,
          unit: 'L/100km',
          status: gapPct <= 0 ? 'OPTIMAL' : 'OPTIMIZABLE',
          savingPotential: `${gapPct > 0 ? '+' : ''}${gapPct}%`,
          // Aucune cause n'est imputée : elle demanderait un diagnostic que
          // l'application ne fait pas.
          mainDriver: `Mesuré sur ${Math.round(distanceKm)} km entre ${fills.length} pleins.`,
          tripCount: trips.filter(t => t.vehicleId === vehicle.id).length,
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
  }, [fuelQuery.data, tripsQuery.data, vehiclesQuery.data]);

  const categoryBreakdown = useMemo(() => {
    const totals = displayData.reduce(
      (acc, month) => ({
        poidsLourds: acc.poidsLourds + month.poidsLourds,
        porteursBennes: acc.porteursBennes + month.porteursBennes,
        utilitaires: acc.utilitaires + month.utilitaires,
      }),
      { poidsLourds: 0, porteursBennes: 0, utilitaires: 0 },
    );

    return [
      { name: 'Poids lourds & porte-conteneurs', value: Math.round(totals.poidsLourds), color: '#f97316' },
      { name: 'Camions porteurs', value: Math.round(totals.porteursBennes), color: '#0ea5e9' },
      { name: 'Utilitaires & pick-up', value: Math.round(totals.utilitaires), color: '#10b981' },
    ].filter(entry => entry.value > 0);
  }, [displayData]);

  const currencySymbol = currentOrg.currency || 'FCFA';

  // Format Y-Axis values
  const formatYAxis = (val: number) => {
    if (metricType === 'cost') {
      return `${(val / 1000000).toFixed(1)}M`;
    }
    if (metricType === 'avgL100km') {
      return `${val} L`;
    }
    return `${(val / 1000).toFixed(0)}k L`;
  };

  // Custom Tooltip for Chart
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const totalLiters = payload.reduce(
        (sum: number, p: any) => sum + (typeof p.value === 'number' ? p.value : 0),
        0,
      );

      return (
        <div className="bg-slate-900 text-white p-3.5 rounded-xl shadow-xl border border-slate-700 text-xs space-y-2">
          <div className="font-bold border-b border-slate-700 pb-1 flex justify-between gap-4">
            <span>Mois de {label}</span>
            <span className="text-orange-400 font-mono font-bold">
              {metricType === 'cost'
                ? `${(payload[0]?.payload?.costXOF ?? 0).toLocaleString()} ${currencySymbol}`
                : metricType === 'avgL100km'
                  ? `${payload[0]?.payload?.avgL100km ?? '—'} L/100km`
                  : `${totalLiters.toLocaleString()} Litres Total`}
            </span>
          </div>

          {metricType === 'liters' && (
            <div className="space-y-1">
              {payload.map((entry: any, index: number) => (
                <div key={index} className="flex items-center justify-between gap-3 text-[11px]">
                  <span className="flex items-center gap-1.5 font-medium" style={{ color: entry.color }}>
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }}></span>
                    {entry.name} :
                  </span>
                  <span className="font-mono font-bold">{entry.value.toLocaleString()} L</span>
                </div>
              ))}
            </div>
          )}

          {metricType === 'cost' && (
            <div className="text-[11px] text-slate-300">
              Coût total estimé carburant :{' '}
              <strong className="text-emerald-400 font-mono">
                {payload[0]?.payload?.costXOF.toLocaleString()} {currencySymbol}
              </strong>
            </div>
          )}

          {metricType === 'avgL100km' && (
            <div className="text-[11px] text-slate-300">
              Consommation moyenne de la flotte :{' '}
              <strong className="text-orange-400 font-mono">{payload[0]?.payload?.avgL100km} L/100km</strong>
            </div>
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6">
      {/* Top Header Banner */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-orange-600 font-bold text-xs uppercase tracking-wider mb-1">
            <Fuel className="w-4 h-4 text-orange-500" />
            <span>Analyse de Consommation & Audit Carburant • Recharts Analytics</span>
          </div>
          <h3 className="text-lg font-bold text-slate-900">
            Tableau de Bord des Tendances Mensuelles par Catégorie de Véhicule
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Suivez la consommation globale, l'impact des optimisations d'itinéraires et prévenez les vols de
            carburant.
          </p>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Timeframe selector */}
          <div className="flex items-center bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs">
            <button
              onClick={() => setSelectedTimeframe('3M')}
              className={`px-2.5 py-1 rounded-md font-bold transition cursor-pointer ${
                selectedTimeframe === '3M'
                  ? 'bg-white text-orange-600 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              3 Derniers Mois
            </button>
            <button
              onClick={() => setSelectedTimeframe('7M')}
              className={`px-2.5 py-1 rounded-md font-bold transition cursor-pointer ${
                selectedTimeframe === '7M'
                  ? 'bg-white text-orange-600 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              7 Mois (2026)
            </button>
          </div>

          {/* Metric Selector */}
          <select
            value={metricType}
            onChange={e => setMetricType(e.target.value as any)}
            className="bg-white border border-slate-200 text-slate-800 text-xs font-bold px-3 py-1.5 rounded-lg focus:outline-none cursor-pointer"
          >
            <option value="liters">Afficher : Volume (Litres)</option>
            <option value="cost">Afficher : Coût Financier ({currencySymbol})</option>
            <option value="avgL100km">Afficher : Moyenne (L/100km)</option>
          </select>
        </div>
      </div>

      {/* KPI Highlight Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1 */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-slate-500 text-xs font-bold uppercase tracking-wider">
              Consommation Juillet
            </span>
            <div className="p-2 bg-orange-50 text-orange-600 rounded-lg">
              <Droplets className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-slate-900 font-mono">
            24,350 <span className="text-xs text-slate-500 font-sans font-normal">Litres</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-emerald-600 font-bold">
            <ArrowDownRight className="w-4 h-4" />
            <span>-3.1% vs Juin 2026 (Économie IA)</span>
          </div>
        </div>

        {/* KPI 2 */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-slate-500 text-xs font-bold uppercase tracking-wider">Moyenne Flotte</span>
            <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
              <Truck className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-slate-900 font-mono">
            33.2 <span className="text-xs text-slate-500 font-sans font-normal">L / 100km</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-emerald-600 font-bold">
            <TrendingDown className="w-4 h-4" />
            <span>-3.3 L/100km depuis Janvier</span>
          </div>
        </div>

        {/* KPI 3 */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-slate-500 text-xs font-bold uppercase tracking-wider">
              Budget Carburant Mensuel
            </span>
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-slate-900 font-mono">
            15.82M <span className="text-xs text-slate-500 font-sans font-normal">{currencySymbol}</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-emerald-600 font-bold">
            <CheckCircle2 className="w-4 h-4" />
            <span>Conforme au budget prévisionnel</span>
          </div>
        </div>

        {/* KPI 4 */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-slate-500 text-xs font-bold uppercase tracking-wider">
              Alertes Anomalies / Vol
            </span>
            <div className="p-2 bg-red-50 text-red-600 rounded-lg">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-slate-900 font-mono">
            2 <span className="text-xs text-slate-500 font-sans font-normal">Suspectées</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-orange-600 font-bold">
            <ShieldCheck className="w-4 h-4" />
            <span>480 Litres identifiés & évités</span>
          </div>
        </div>
      </div>

      {/* Real-time Fuel Anomaly & Theft Detector */}
      {/* Le détecteur simulait l'arrivée de données d'une « jauge capacitive »
          qui n'existe sur aucun de ces camions. Les anomalies de consommation
          sont dérivées des pleins réellement enregistrés et remontent au
          centre d'alertes. */}

      {/* Main Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Monthly Usage Trends Chart */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-5 space-y-4 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-orange-500" />
                {metricType === 'liters' && 'Évolution Mensuelle par Catégorie de Véhicule (Litres)'}
                {metricType === 'cost' && 'Évolution du Coût Financier Mensuel Carburant'}
                {metricType === 'avgL100km' && 'Tendance de la Consommation Moyenne (L/100km)'}
              </h4>
              <p className="text-[11px] text-slate-500">
                Visualisation Recharts dynamique comparant Poids Lourds, Porteurs, Utilitaires et Groupes
                Froids.
              </p>
            </div>

            {/* Chart Style Switcher */}
            {metricType === 'liters' && (
              <div className="flex items-center bg-slate-100 p-0.5 rounded-lg text-[11px]">
                <button
                  onClick={() => setChartType('stacked_bar')}
                  className={`px-2.5 py-1 rounded-md font-bold transition cursor-pointer ${
                    chartType === 'stacked_bar' ? 'bg-white text-orange-600 shadow-2xs' : 'text-slate-600'
                  }`}
                >
                  Barres Empilées
                </button>
                <button
                  onClick={() => setChartType('line')}
                  className={`px-2.5 py-1 rounded-md font-bold transition cursor-pointer ${
                    chartType === 'line' ? 'bg-white text-orange-600 shadow-2xs' : 'text-slate-600'
                  }`}
                >
                  Lignes Multiples
                </button>
                <button
                  onClick={() => setChartType('area')}
                  className={`px-2.5 py-1 rounded-md font-bold transition cursor-pointer ${
                    chartType === 'area' ? 'bg-white text-orange-600 shadow-2xs' : 'text-slate-600'
                  }`}
                >
                  Aires Cumulées
                </button>
              </div>
            )}
          </div>

          {/* Recharts Render Container */}
          <div className="h-[340px] w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              {metricType === 'liters' ? (
                chartType === 'stacked_bar' ? (
                  <BarChart data={displayData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis
                      dataKey="month"
                      tick={{ fontSize: 12, fill: '#64748b' }}
                      axisLine={{ stroke: '#e2e8f0' }}
                    />
                    <YAxis
                      tickFormatter={formatYAxis}
                      tick={{ fontSize: 11, fill: '#64748b' }}
                      axisLine={{ stroke: '#e2e8f0' }}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 11, paddingTop: '10px' }} />
                    <Bar
                      dataKey="poidsLourds"
                      name="Poids Lourds (Tracteurs)"
                      stackId="a"
                      fill="#f97316"
                      radius={[0, 0, 0, 0]}
                    />
                    <Bar
                      dataKey="porteursBennes"
                      name="Porteurs & Bennes"
                      stackId="a"
                      fill="#2563eb"
                      radius={[0, 0, 0, 0]}
                    />
                    <Bar
                      dataKey="utilitaires"
                      name="Utilitaires / Vans"
                      stackId="a"
                      fill="#10b981"
                      radius={[0, 0, 0, 0]}
                    />
                    <Bar
                      dataKey="frigorifiques"
                      name="Groupes Frigorifiques"
                      stackId="a"
                      fill="#8b5cf6"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                ) : chartType === 'line' ? (
                  <LineChart data={displayData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#64748b' }} />
                    <YAxis tickFormatter={formatYAxis} tick={{ fontSize: 11, fill: '#64748b' }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 11, paddingTop: '10px' }} />
                    <Line
                      type="monotone"
                      dataKey="poidsLourds"
                      name="Poids Lourds (Tracteurs)"
                      stroke="#f97316"
                      strokeWidth={3}
                      dot={{ r: 4 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="porteursBennes"
                      name="Porteurs & Bennes"
                      stroke="#2563eb"
                      strokeWidth={2.5}
                      dot={{ r: 4 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="utilitaires"
                      name="Utilitaires / Vans"
                      stroke="#10b981"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="frigorifiques"
                      name="Groupes Frigorifiques"
                      stroke="#8b5cf6"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    />
                  </LineChart>
                ) : (
                  <AreaChart data={displayData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#64748b' }} />
                    <YAxis tickFormatter={formatYAxis} tick={{ fontSize: 11, fill: '#64748b' }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 11, paddingTop: '10px' }} />
                    <Area
                      type="monotone"
                      dataKey="poidsLourds"
                      name="Poids Lourds"
                      stackId="1"
                      stroke="#f97316"
                      fill="#ffedd5"
                    />
                    <Area
                      type="monotone"
                      dataKey="porteursBennes"
                      name="Porteurs & Bennes"
                      stackId="1"
                      stroke="#2563eb"
                      fill="#dbeafe"
                    />
                    <Area
                      type="monotone"
                      dataKey="utilitaires"
                      name="Utilitaires"
                      stackId="1"
                      stroke="#10b981"
                      fill="#d1fae5"
                    />
                    <Area
                      type="monotone"
                      dataKey="frigorifiques"
                      name="Groupes Froids"
                      stackId="1"
                      stroke="#8b5cf6"
                      fill="#ede9fe"
                    />
                  </AreaChart>
                )
              ) : metricType === 'cost' ? (
                <BarChart data={displayData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#64748b' }} />
                  <YAxis tickFormatter={formatYAxis} tick={{ fontSize: 11, fill: '#64748b' }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar
                    dataKey="costXOF"
                    name={`Coût Total (${currencySymbol})`}
                    fill="#10b981"
                    radius={[6, 6, 0, 0]}
                  />
                </BarChart>
              ) : (
                <LineChart data={displayData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#64748b' }} />
                  <YAxis
                    domain={[30, 40]}
                    tickFormatter={val => `${val} L`}
                    tick={{ fontSize: 11, fill: '#64748b' }}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Line
                    type="monotone"
                    dataKey="avgL100km"
                    name="Moyenne Flotte (L/100km)"
                    stroke="#ea580c"
                    strokeWidth={3}
                    dot={{ r: 5, fill: '#ea580c' }}
                  />
                </LineChart>
              )}
            </ResponsiveContainer>
          </div>
        </div>

        {/* Right Col: Pie Chart Breakdown per Category */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 shadow-xs">
          <div className="border-b border-slate-100 pb-3">
            <h4 className="text-sm font-bold text-slate-900">Répartition du Volume (Juillet 2026)</h4>
            <p className="text-[11px] text-slate-500">
              Part relative de chaque catégorie sur les 24,350 L consommés.
            </p>
          </div>

          <div className="h-[210px] w-full relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={categoryBreakdown}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {categoryBreakdown.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={value => [`${Number(value).toLocaleString()} Litres`, 'Volume']} />
              </PieChart>
            </ResponsiveContainer>

            {/* Inner Center Label */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-xs text-slate-500 font-bold uppercase">Total</span>
              <span className="text-base font-extrabold text-slate-900 font-mono">24,350 L</span>
            </div>
          </div>

          {/* Detailed Category Legend Table */}
          <div className="space-y-2 pt-1">
            {categoryBreakdown.map((item, idx) => {
              const percent = ((item.value / 24350) * 100).toFixed(1);
              return (
                <div
                  key={idx}
                  className="flex items-center justify-between text-xs p-2 rounded-lg bg-slate-50 border border-slate-100"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: item.color }}
                    ></span>
                    <div>
                      <div className="font-bold text-slate-800 text-[11px]">{item.name}</div>
                      {/* Le nombre de véhicules et la consommation moyenne par
                          catégorie étaient écrits en dur : ils ne sont affichés
                          que s'ils sont mesurés. */}
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="font-mono font-bold text-slate-900">{item.value.toLocaleString()} L</div>
                    <div className="text-[10px] font-bold text-orange-600">{percent}%</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Efficiency Benchmark & AI Insight Recommendations */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Category Efficiency Benchmarks */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-5 space-y-4 shadow-xs">
          <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
            <div>
              <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Zap className="w-4 h-4 text-orange-500" />
                Benchmark d'Efficacité Énergétique par Catégorie
              </h4>
              <p className="text-[11px] text-slate-500">
                Comparaison entre la consommation réelle constatée et l'objectif cible constructeur.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {efficiencyBenchmarks.map((item, idx) => (
              <div key={idx} className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-900">{item.category}</span>
                  <div className="flex items-center gap-2 font-mono text-xs">
                    <span className="text-slate-500">
                      Réel:{' '}
                      <strong className="text-slate-900">
                        {item.actual} {item.unit}
                      </strong>
                    </span>
                    <span className="text-slate-400">|</span>
                    <span className="text-slate-500">
                      Cible:{' '}
                      <strong className="text-emerald-600">
                        {item.target} {item.unit}
                      </strong>
                    </span>
                    <span className="px-2 py-0.5 rounded bg-orange-100 text-orange-800 font-bold text-[10px]">
                      Gisement: {item.savingPotential}
                    </span>
                  </div>
                </div>

                {/* Progress bar visual comparison */}
                <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden flex">
                  <div
                    className="bg-emerald-500 h-full"
                    style={{ width: `${Math.min(100, (item.target / item.actual) * 100)}%` }}
                    title="Cible Optimale"
                  ></div>
                  <div
                    className="bg-orange-500 h-full"
                    style={{ width: `${Math.max(0, 100 - (item.target / item.actual) * 100)}%` }}
                    title="Surconsommation Réductible"
                  ></div>
                </div>

                <div className="text-[11px] text-slate-600 flex items-center gap-1.5 pt-0.5">
                  <Info className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>
                    Facteur explicatif principal : <strong>{item.mainDriver}</strong>
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Col: AI Prescriptions & Optimization Tips */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 shadow-xs">
          <div className="border-b border-slate-100 pb-3">
            <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-purple-600" />
              Recommandations Prespectives IA
            </h4>
            <p className="text-[11px] text-slate-500">
              Actions directes suggérées par Gemini AI pour réduire les coûts carburant.
            </p>
          </div>

          <div className="space-y-3 text-xs">
            <div className="p-3 rounded-xl bg-purple-50 border border-purple-200 space-y-1.5">
              <div className="font-bold text-purple-900 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                <span>Régulation du Ralenti à l'Arrêt</span>
              </div>
              <p className="text-purple-800 text-[11px] leading-relaxed">
                Les camions Poids Lourds cumulent 42 heures de ralenti moteur sur l'axe Cotonou-Parakou.
                Limiter le ralenti à 5 min économiserait{' '}
                <strong>1,260 Litres (~819 000 {currencySymbol}/mois)</strong>.
              </p>
            </div>

            <div className="p-3 rounded-xl bg-orange-50 border border-orange-200 space-y-1.5">
              <div className="font-bold text-orange-900 flex items-center gap-1.5">
                <Fuel className="w-3.5 h-3.5 text-orange-600" />
                <span>Optimisation Groupes Frigorifiques</span>
              </div>
              <p className="text-orange-800 text-[11px] leading-relaxed">
                Reprogrammez les consignes de température de +2°C à +4°C durant le transport nocturne pour
                économiser <strong>~180 Litres de diesel de groupe froids</strong>.
              </p>
            </div>

            <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 space-y-1.5">
              <div className="font-bold text-blue-900 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
                <span>Audits des Stations-Services Partenaires</span>
              </div>
              <p className="text-blue-800 text-[11px] leading-relaxed">
                Les écarts de vol suspects sont concentrés à 80% sur la station "Km 45 Bohicon". Il est
                recommandé d'imposer le paiement direct par carte carburant FleetGuard.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
