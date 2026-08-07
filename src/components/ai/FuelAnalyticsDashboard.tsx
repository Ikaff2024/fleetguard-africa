import React, { useState } from 'react';
import { Organization } from '../../types';
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
const MONTHLY_FUEL_TRENDS = [
  {
    month: 'Janv',
    poidsLourds: 14500,
    porteursBennes: 8200,
    utilitaires: 3400,
    frigorifiques: 2100,
    avgL100km: 36.5,
    costXOF: 18330000,
    targetLiters: 29000,
  },
  {
    month: 'Fév',
    poidsLourds: 15200,
    porteursBennes: 8500,
    utilitaires: 3600,
    frigorifiques: 2300,
    avgL100km: 37.1,
    costXOF: 19240000,
    targetLiters: 29000,
  },
  {
    month: 'Mars',
    poidsLourds: 13800,
    porteursBennes: 7900,
    utilitaires: 3300,
    frigorifiques: 2000,
    avgL100km: 35.8,
    costXOF: 17550000,
    targetLiters: 28500,
  },
  {
    month: 'Avr',
    poidsLourds: 14100,
    porteursBennes: 8100,
    utilitaires: 3500,
    frigorifiques: 2200,
    avgL100km: 35.2,
    costXOF: 18135000,
    targetLiters: 28500,
  },
  {
    month: 'Mai',
    poidsLourds: 13200,
    porteursBennes: 7600,
    utilitaires: 3200,
    frigorifiques: 1900,
    avgL100km: 34.6,
    costXOF: 16835000,
    targetLiters: 27000,
  },
  {
    month: 'Juin',
    poidsLourds: 12900,
    porteursBennes: 7400,
    utilitaires: 3100,
    frigorifiques: 1850,
    avgL100km: 33.9,
    costXOF: 16412500,
    targetLiters: 26500,
  },
  {
    month: 'Juil',
    poidsLourds: 12500,
    porteursBennes: 7100,
    utilitaires: 2950,
    frigorifiques: 1800,
    avgL100km: 33.2,
    costXOF: 15827500,
    targetLiters: 25500,
  },
];

// Share of total fuel by category (for pie chart)
const CATEGORY_PIE_DATA = [
  {
    name: 'Poids Lourds (Tracteurs 6x4/4x2)',
    value: 12500,
    color: '#f97316',
    count: '14 véhicules',
    avgCons: '38.2 L/100km',
  },
  {
    name: 'Porteurs & Camions Bennes',
    value: 7100,
    color: '#2563eb',
    count: '9 véhicules',
    avgCons: '28.5 L/100km',
  },
  {
    name: 'Utilitaires & Light Trucks',
    value: 2950,
    color: '#10b981',
    count: '8 véhicules',
    avgCons: '12.4 L/100km',
  },
  { name: 'Groupes Frigorifiques', value: 1800, color: '#8b5cf6', count: '5 unités', avgCons: '2.8 L/heure' },
];

// Efficiency Benchmark per Category
const EFFICIENCY_BENCHMARKS = [
  {
    category: 'Poids Lourds (Tracteurs 6x4)',
    actual: 38.2,
    target: 35.0,
    unit: 'L/100km',
    status: 'OPTIMIZABLE',
    savingPotential: '-8.3%',
    mainDriver: 'Ralenti prolongé aux postes de péage & climatisation cabine nocturne',
  },
  {
    category: 'Camions Porteurs (Rigides)',
    actual: 28.5,
    target: 28.0,
    unit: 'L/100km',
    status: 'GOOD',
    savingPotential: '-1.8%',
    mainDriver: 'Excellente conduite anticipative des chauffeurs',
  },
  {
    category: 'Utilitaires & Fourgons',
    actual: 12.4,
    target: 12.0,
    unit: 'L/100km',
    status: 'EXCELLENT',
    savingPotential: '-0.5%',
    mainDriver: "Itinéraires urbains optimisés par l'IA FleetGuard",
  },
  {
    category: 'Groupes Froids Frigorifiques',
    actual: 2.8,
    target: 2.5,
    unit: 'L/heure',
    status: 'ATTENTION',
    savingPotential: '-10.7%',
    mainDriver: 'Ouverture fréquente des portes lors des livraisons en plein soleil',
  },
];

export const FuelAnalyticsDashboard: React.FC<FuelAnalyticsDashboardProps> = ({ currentOrg }) => {
  const [metricType, setMetricType] = useState<'liters' | 'cost' | 'avgL100km'>('liters');
  const [chartType, setChartType] = useState<'stacked_bar' | 'line' | 'area'>('stacked_bar');
  const [selectedTimeframe, setSelectedTimeframe] = useState<'7M' | '3M' | 'YTD'>('7M');

  // Filtered data based on timeframe
  const displayData = selectedTimeframe === '3M' ? MONTHLY_FUEL_TRENDS.slice(-3) : MONTHLY_FUEL_TRENDS;

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
                  data={CATEGORY_PIE_DATA}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {CATEGORY_PIE_DATA.map((entry, index) => (
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
            {CATEGORY_PIE_DATA.map((item, idx) => {
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
                      <div className="text-[10px] text-slate-500">
                        {item.count} • Moy. {item.avgCons}
                      </div>
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
            {EFFICIENCY_BENCHMARKS.map((item, idx) => (
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
