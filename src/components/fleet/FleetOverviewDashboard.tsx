import React from 'react';
import { Organization } from '../../types';
import { useFuelLogs, useVehicles } from '../../hooks/useFleetData';
import { DataState } from '../common/DataState';
import { Activity, Droplet, Truck, TrendingUp } from 'lucide-react';
import { LineChart, Line, ResponsiveContainer, YAxis } from 'recharts';

interface FleetOverviewDashboardProps {
  currentOrg: Organization;
}

const sparklineDataFuel = [
  { value: 120 },
  { value: 135 },
  { value: 110 },
  { value: 140 },
  { value: 155 },
  { value: 145 },
  { value: 180 },
];

const sparklineDataHealth = [
  { value: 85 },
  { value: 86 },
  { value: 84 },
  { value: 88 },
  { value: 89 },
  { value: 92 },
  { value: 94 },
];

const sparklineDataActive = [
  { value: 10 },
  { value: 11 },
  { value: 11 },
  { value: 12 },
  { value: 12 },
  { value: 14 },
  { value: 15 },
];

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
              <span className="text-emerald-600 bg-emerald-50 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                <TrendingUp className="w-3 h-3" /> +15%
              </span>
            </div>
          </div>
          <div className="h-12 mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={sparklineDataActive}>
                <YAxis domain={['dataMin - 2', 'dataMax + 2']} hide />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="#10b981"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
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
          <div className="h-12 mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={sparklineDataHealth}>
                <YAxis domain={['dataMin - 5', 'dataMax + 5']} hide />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
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
              <span className="text-rose-600 bg-rose-50 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                <TrendingUp className="w-3 h-3" /> +8.4%
              </span>
            </div>
          </div>
          <div className="h-12 mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={sparklineDataFuel}>
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
