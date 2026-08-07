import React, { useMemo, useState } from 'react';
import { Organization } from '../../types';
import { useAlerts, useFuelLogs, useTrips, useVehicles } from '../../hooks/useFleetData';
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
  AlertTriangle,
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
  const alertsQuery = useAlerts();
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

  /**
   * Indicateurs de tete, mesures sur la periode effectivement affichee.
   *
   * Ce bandeau annoncait 24 350 litres, 33,2 L/100 km, 15,82 M XOF « conforme
   * au budget previsionnel » et 2 anomalies pour 480 litres « evites ». Aucun
   * de ces cinq chiffres ne venait des donnees : ils ne bougeaient ni avec
   * l'organisation consultee, ni avec la periode choisie, ni quand le parc
   * doublait. Un transporteur pouvait batir un budget dessus.
   *
   * Chacun se recalcule desormais depuis les pleins enregistres et les trajets
   * reconstruits, sur la meme fenetre que le graphique — sans quoi le total ne
   * correspondrait pas a la courbe placee juste en dessous.
   */
  const totals = useMemo(() => {
    const litersOf = (month: (typeof displayData)[number] | undefined) =>
      month ? month.poidsLourds + month.porteursBennes + month.utilitaires + month.frigorifiques : 0;

    const liters = displayData.reduce((sum, month) => sum + litersOf(month), 0);
    const cost = displayData.reduce((sum, month) => sum + month.costXOF, 0);
    const distanceKm = displayData.reduce((sum, month) => sum + month.distanceKm, 0);

    // Le dernier mois contre le precedent : la seule comparaison que les
    // donnees autorisent. Elle disparait tant qu'il n'y a pas deux mois.
    const last = displayData[displayData.length - 1];
    const previous = displayData[displayData.length - 2];
    const trend =
      last && previous && litersOf(previous) > 0
        ? Math.round(((litersOf(last) - litersOf(previous)) / litersOf(previous)) * 1000) / 10
        : null;

    return {
      liters: Math.round(liters),
      cost,
      distanceKm: Math.round(distanceKm),
      // Sans distance mesuree, la moyenne n'a pas de sens : elle reste vide.
      avgL100km: distanceKm > 0 ? Math.round((liters / distanceKm) * 1000) / 10 : null,
      trend,
      lastMonthLabel: last?.month ?? null,
    };
  }, [displayData]);

  /** Ecarts de consommation releves — les memes constats qu'au centre d'alertes. */
  const fuelAnomalies = useMemo(
    () => (alertsQuery.data ?? []).filter(alert => alert.category === 'FUEL_ANOMALY'),
    [alertsQuery.data],
  );

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

  /** Total du camembert : la somme des parts affichees, jamais un chiffre a part. */
  const categoryTotal = useMemo(
    () => categoryBreakdown.reduce((sum, entry) => sum + entry.value, 0),
    [categoryBreakdown],
  );

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

      {/* Indicateurs de tete : chaque valeur se recalcule depuis les pleins
          enregistres, sur la periode affichee par le graphique. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-slate-500 text-xs font-bold uppercase tracking-wider">
              Volume sur la periode
            </span>
            <div className="p-2 bg-orange-50 text-orange-600 rounded-lg">
              <Droplets className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-slate-900 font-mono">
            {totals.liters.toLocaleString('fr-FR')}{' '}
            <span className="text-xs text-slate-500 font-sans font-normal">Litres</span>
          </div>
          {totals.trend === null ? (
            <div className="text-xs text-slate-500 font-semibold">
              Comparaison possible des deux mois enregistres
            </div>
          ) : (
            <div
              className={`flex items-center gap-1.5 text-xs font-bold ${
                totals.trend > 0 ? 'text-rose-600' : 'text-emerald-600'
              }`}
            >
              <ArrowDownRight className={`w-4 h-4 ${totals.trend > 0 ? 'rotate-90' : ''}`} />
              <span>
                {totals.trend > 0 ? '+' : ''}
                {totals.trend}% en {totals.lastMonthLabel} vs mois precedent
              </span>
            </div>
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-slate-500 text-xs font-bold uppercase tracking-wider">Moyenne flotte</span>
            <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
              <Truck className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-slate-900 font-mono">
            {totals.avgL100km ?? '\u2014'}{' '}
            <span className="text-xs text-slate-500 font-sans font-normal">L / 100 km</span>
          </div>
          <div className="text-xs text-slate-500 font-semibold">
            {totals.avgL100km === null
              ? 'Aucune distance reconstruite sur la periode'
              : `${totals.distanceKm.toLocaleString('fr-FR')} km parcourus`}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-slate-500 text-xs font-bold uppercase tracking-wider">
              Depense carburant
            </span>
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-slate-900 font-mono">
            {Math.round(totals.cost).toLocaleString('fr-FR')}{' '}
            <span className="text-xs text-slate-500 font-sans font-normal">{currencySymbol}</span>
          </div>
          {/* « Conforme au budget previsionnel » supposait un budget que
              l'application ne connait pas. On dit ce qui est constate. */}
          <div className="text-xs text-slate-500 font-semibold">Somme des pleins enregistres</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-slate-500 text-xs font-bold uppercase tracking-wider">
              Ecarts de consommation
            </span>
            <div className="p-2 bg-red-50 text-red-600 rounded-lg">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-slate-900 font-mono">
            {fuelAnomalies.length}{' '}
            <span className="text-xs text-slate-500 font-sans font-normal">releves</span>
          </div>
          {/* « 480 litres identifies & evites » creditait l'outil d'economies
              qu'aucune mesure n'etablit. Un ecart constate n'est pas un vol
              dejoue : le controle humain tranche. */}
          <div className="text-xs text-slate-500 font-semibold flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-slate-400" />
            <span>{fuelAnomalies.filter(a => a.status === 'UNHANDLED').length} a verifier</span>
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
              Part relative de chaque categorie sur les litres enregistres.
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
              <span className="text-base font-extrabold text-slate-900 font-mono">
                {categoryTotal.toLocaleString('fr-FR')} L
              </span>
            </div>
          </div>

          {/* Detailed Category Legend Table */}
          <div className="space-y-2 pt-1">
            {categoryBreakdown.map((item, idx) => {
              const percent = categoryTotal > 0 ? ((item.value / categoryTotal) * 100).toFixed(1) : '0.0';
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

        {/* Les « recommandations prescriptives » de ce bloc etaient ecrites en
            dur : 42 heures de ralenti moteur sur un axe nomme, 1 260 litres et
            819 000 XOF d'economies mensuelles, 180 litres sur les groupes
            frigorifiques. Rien de tout cela n'est mesure — le ralenti moteur
            suppose une prise sur le calculateur du camion, qu'aucun de ces
            vehicules ne remonte.

            La derniere affirmait que « les ecarts de vol suspects sont
            concentres a 80 % sur la station Km 45 Bohicon ». Elle designait un
            commerce reel, nommement, comme foyer de vol, sur la foi de rien.
            Publier cela expose l'entreprise qui s'en sert autant que celle
            qu'elle accuse.

            Les ecarts reellement constates figurent au centre d'alertes, chacun
            rattache au plein qui l'a produit. */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3 shadow-xs">
          <div className="border-b border-slate-100 pb-3">
            <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-slate-500" />
              Ecarts a verifier
            </h4>
            <p className="text-[11px] text-slate-500">
              Constats issus des pleins enregistres, compares a la consommation de reference du vehicule.
            </p>
          </div>

          {fuelAnomalies.length === 0 ? (
            <p className="text-xs text-slate-500 py-6 text-center">
              Aucun ecart releve sur la periode. Deux pleins au moins sont necessaires pour mesurer la
              consommation reelle d'un vehicule.
            </p>
          ) : (
            <div className="space-y-2">
              {fuelAnomalies.slice(0, 5).map(anomaly => (
                <div
                  key={anomaly.id}
                  className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1"
                >
                  <div className="font-bold text-slate-900 text-[11px]">{anomaly.title}</div>
                  <p className="text-slate-600 text-[11px] leading-relaxed">{anomaly.description}</p>
                  {anomaly.metricValue && (
                    <div className="text-[10px] font-mono text-slate-500">
                      {anomaly.metricLabel ?? 'Releve'} : {anomaly.metricValue}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <p className="text-[10px] text-slate-400 leading-relaxed pt-1">
            Un ecart de consommation n'etablit pas un vol : une charge lourde, une piste degradee ou un
            injecteur use l'expliquent aussi. Le controle humain tranche.
          </p>
        </div>
      </div>
    </div>
  );
};
