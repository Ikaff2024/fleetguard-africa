import React from 'react';
import { Organization } from '../../types';
import { useFuelLogs, useVehicles } from '../../hooks/useFleetData';
import { DataState } from '../common/DataState';
import { Activity, Droplet, Truck, TrendingDown, TrendingUp } from 'lucide-react';
import { LineChart, Line, ResponsiveContainer, YAxis } from 'recharts';

interface FleetOverviewDashboardProps {
  currentOrg: Organization;
}

/** Fenêtre du graphique et de la comparaison : une semaine, puis la précédente. */
const TREND_DAYS = 7;

/**
 * Litres relevés jour par jour sur la semaine écoulée.
 *
 * Les trois courbes de cet écran étaient écrites en dur — sept valeurs figées
 * qui dessinaient une progression flatteuse quoi qu'il arrive dans le parc.
 * Celle-ci est reconstruite depuis les pleins enregistrés. Les journées sans
 * ravitaillement valent zéro et restent dans la série : les retirer lisserait
 * la courbe et masquerait justement les jours d'immobilisation.
 */
function dailyLiters(logs: { loggedAt: string; litersAdded: number }[], days: number, offset = 0) {
  const series: { day: string; value: number }[] = [];

  for (let i = days - 1; i >= 0; i -= 1) {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - i - offset);
    const key = date.toISOString().slice(0, 10);

    series.push({
      day: key,
      value: logs.filter(log => log.loggedAt.startsWith(key)).reduce((sum, log) => sum + log.litersAdded, 0),
    });
  }

  return series;
}

export const FleetOverviewDashboard: React.FC<FleetOverviewDashboardProps> = () => {
  // Les données viennent de l'API, déjà bornées à l'organisation de la session
  // par le serveur : aucun filtre côté client n'est nécessaire.
  const vehiclesQuery = useVehicles();
  const fuelQuery = useFuelLogs();
  const vehicles = vehiclesQuery.data ?? [];
  const fuelLogs = fuelQuery.data ?? [];

  const isLoading = vehiclesQuery.isLoading || fuelQuery.isLoading;
  const loadError = vehiclesQuery.error ?? fuelQuery.error;

  const activeVehicles = vehicles.filter(v => v.status === 'ACTIVE').length;

  // Aucun plein aujourd'hui donne zéro, pas une valeur de repli : afficher
  // 450 L un jour sans ravitaillement fausserait le suivi des coûts.
  const today = new Date().toISOString().split('T')[0];
  const totalFuelToday = fuelLogs
    .filter(log => log.loggedAt.startsWith(today))
    .reduce((sum, log) => sum + log.litersAdded, 0);

  /**
   * Part du parc en état de rouler.
   *
   * Le chiffre affiché était `94` en dur. Un « score de santé » constant ne dit
   * rien et masque précisément ce qu'il prétend surveiller : un camion
   * immobilisé n'y changeait rien.
   */
  const healthScore = vehicles.length > 0 ? Math.round((activeVehicles / vehicles.length) * 100) : 0;
  const immobilised = vehicles.filter(v => v.status !== 'ACTIVE').length;

  /**
   * Consommation de la semaine, et variation contre la précédente.
   *
   * `null` quand la semaine précédente n'a enregistré aucun plein : une
   * variation contre zéro n'a pas de sens, et « +100 % » ferait croire à une
   * dérive alors qu'il ne s'agit que d'un début d'enregistrement.
   */
  const fuelSeries = dailyLiters(fuelLogs, TREND_DAYS);
  const thisWeekLiters = fuelSeries.reduce((sum, point) => sum + point.value, 0);
  const lastWeekLiters = dailyLiters(fuelLogs, TREND_DAYS, TREND_DAYS).reduce(
    (sum, point) => sum + point.value,
    0,
  );
  const fuelTrend =
    lastWeekLiters > 0 ? Math.round(((thisWeekLiters - lastWeekLiters) / lastWeekLiters) * 100) : null;

  if (isLoading || loadError) {
    return (
      <DataState
        isLoading={isLoading}
        error={loadError}
        onRetry={() => {
          vehiclesQuery.reload();
          fuelQuery.reload();
        }}
      >
        {null}
      </DataState>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* KPI Card 1: Active Fleet */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
          <div className="flex justify-between items-start">
            <div>
              <div className="flex items-center gap-1.5 text-slate-500 mb-1">
                <Truck className="w-4 h-4" />
                <span className="text-xs font-bold uppercase tracking-wider">Flotte Active</span>
              </div>
              <div className="text-3xl font-extrabold text-slate-900 font-mono">
                {activeVehicles}{' '}
                <span className="text-sm font-medium text-slate-500">/ {vehicles.length}</span>
              </div>
            </div>
            <div className="flex flex-col items-end">
              {/* « +15 % » était écrit en dur. Le statut des véhicules n'est pas
                  historisé : aucune variation n'est mesurable, et en inventer
                  une reviendrait à remettre le même chiffre sous une autre
                  forme. Le nombre de camions en service se lit déjà à gauche. */}
              <span className="text-slate-600 bg-slate-50 text-[10px] font-bold px-2 py-0.5 rounded-full">
                {activeVehicles === vehicles.length ? 'Tous en service' : `${immobilised} à l’arrêt`}
              </span>
            </div>
          </div>
        </div>

        {/* KPI Card 2: System Health Score */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
          <div className="flex justify-between items-start">
            <div>
              <div className="flex items-center gap-1.5 text-slate-500 mb-1">
                <Activity className="w-4 h-4" />
                <span className="text-xs font-bold uppercase tracking-wider">Parc disponible</span>
              </div>
              <div className="text-3xl font-extrabold text-slate-900 font-mono">{healthScore}%</div>
            </div>
            <div className="flex flex-col items-end">
              {/* La tendance « +2,1 % » était écrite en dur. Ce qui compte est
                  le nombre de camions hors service, pas une variation. */}
              <span className="text-slate-600 bg-slate-50 text-[10px] font-bold px-2 py-0.5 rounded-full">
                {immobilised === 0 ? 'Parc complet' : `${immobilised} hors service`}
              </span>
            </div>
          </div>
        </div>

        {/* KPI Card 3: Total Fuel Burned Today */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
          <div className="flex justify-between items-start">
            <div>
              <div className="flex items-center gap-1.5 text-slate-500 mb-1">
                <Droplet className="w-4 h-4 text-orange-500" />
                <span className="text-xs font-bold uppercase tracking-wider">Carburant (Aujourd'hui)</span>
              </div>
              <div className="text-3xl font-extrabold text-slate-900 font-mono">{totalFuelToday} L</div>
            </div>
            <div className="flex flex-col items-end">
              {fuelTrend === null ? (
                <span className="text-slate-500 bg-slate-50 text-[10px] font-bold px-2 py-0.5 rounded-full">
                  Semaine précédente sans plein
                </span>
              ) : (
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${
                    fuelTrend > 0 ? 'text-rose-600 bg-rose-50' : 'text-emerald-600 bg-emerald-50'
                  }`}
                  title="Litres de la semaine écoulée comparés à la semaine précédente"
                >
                  {fuelTrend > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                  {fuelTrend > 0 ? '+' : ''}
                  {fuelTrend}% / 7 j
                </span>
              )}
            </div>
          </div>
          <div className="h-12 mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={fuelSeries}>
                <YAxis domain={['dataMin - 20', 'dataMax + 20']} hide />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="#f97316"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};
