import React, { useMemo, useState } from 'react';
import { Clock, MapPin, PauseCircle, Route, Truck } from 'lucide-react';
import { useDrivers, useTrips, useVehicles } from '../../hooks/useFleetData';
import { Organization } from '../../types';

interface TripHistoryViewProps {
  currentOrg: Organization;
}

/** « 2 h 45 » plutôt que « 9900 s » : un exploitant raisonne en heures. */
function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  if (hours === 0) return `${minutes} min`;
  return minutes === 0 ? `${hours} h` : `${hours} h ${String(minutes).padStart(2, '0')}`;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const TripHistoryView: React.FC<TripHistoryViewProps> = ({ currentOrg }) => {
  const [vehicleId, setVehicleId] = useState<string>('');
  const vehiclesQuery = useVehicles();
  const driversQuery = useDrivers();
  const tripsQuery = useTrips({ vehicleId: vehicleId || undefined, limit: 200 });

  // Mémorisés : un tableau vide recréé à chaque rendu invaliderait les calculs
  // ci-dessous sans qu'aucune donnée n'ait changé.
  const vehicles = useMemo(() => vehiclesQuery.data ?? [], [vehiclesQuery.data]);
  const drivers = useMemo(() => driversQuery.data ?? [], [driversQuery.data]);
  const trips = useMemo(() => tripsQuery.data ?? [], [tripsQuery.data]);

  const vehicleLabel = useMemo(() => {
    const byId = new Map(vehicles.map(v => [v.id, v.immatriculation]));
    return (id: string) => byId.get(id) ?? 'Véhicule retiré du parc';
  }, [vehicles]);

  const driverLabel = useMemo(() => {
    const byId = new Map(drivers.map(d => [d.id, d.fullName]));
    return (id?: string) => (id ? (byId.get(id) ?? 'Chauffeur non identifié') : '—');
  }, [drivers]);

  const totals = useMemo(
    () => ({
      distanceKm: trips.reduce((sum, t) => sum + t.distanceKm, 0),
      durationSeconds: trips.reduce((sum, t) => sum + t.durationSeconds, 0),
      stopSeconds: trips.reduce((sum, t) => sum + t.stopSeconds, 0),
    }),
    [trips],
  );

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-wrap items-center justify-between gap-4 shadow-xs">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Historique des trajets</h2>
          <p className="text-xs text-slate-500 mt-1">
            Chaque trajet est reconstitué à partir des positions remontées du terrain : distance réellement
            parcourue, durée, temps d'arrêt et vitesses.
          </p>
        </div>

        <label className="flex items-center gap-2 text-xs">
          <span className="font-semibold text-slate-600">Véhicule</span>
          <select
            value={vehicleId}
            onChange={event => setVehicleId(event.target.value)}
            className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-800 font-medium text-xs cursor-pointer"
          >
            <option value="">Tout le parc</option>
            {vehicles.map(vehicle => (
              <option key={vehicle.id} value={vehicle.id}>
                {vehicle.immatriculation} — {vehicle.make} {vehicle.model}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <SummaryCard
          icon={Route}
          label="Distance parcourue"
          value={`${totals.distanceKm.toFixed(1)} km`}
          tone="text-orange-500"
        />
        <SummaryCard
          icon={Clock}
          label="Temps en mission"
          value={formatDuration(totals.durationSeconds)}
          tone="text-sky-500"
        />
        <SummaryCard
          icon={PauseCircle}
          label="Dont à l'arrêt"
          value={formatDuration(totals.stopSeconds)}
          tone="text-slate-400"
        />
      </div>

      <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
        {tripsQuery.isLoading ? (
          <p className="p-6 text-xs text-slate-500">Chargement des trajets…</p>
        ) : tripsQuery.error ? (
          <div className="p-6">
            <p className="text-xs text-red-600 font-semibold">Les trajets n'ont pas pu être chargés.</p>
            <button
              onClick={tripsQuery.reload}
              className="mt-3 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-bold cursor-pointer"
            >
              Réessayer
            </button>
          </div>
        ) : trips.length === 0 ? (
          <div className="p-8 text-center">
            <Truck className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="mt-3 text-sm font-semibold text-slate-700">Aucun trajet enregistré</p>
            <p className="mt-1 text-xs text-slate-500">
              Les trajets apparaissent dès que les véhicules de {currentOrg.name} remontent leurs positions.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wide text-[10px]">
                <tr>
                  <th className="text-left font-bold px-4 py-3">Véhicule</th>
                  <th className="text-left font-bold px-4 py-3">Chauffeur</th>
                  <th className="text-left font-bold px-4 py-3">Départ</th>
                  <th className="text-left font-bold px-4 py-3">Arrivée</th>
                  <th className="text-right font-bold px-4 py-3">Distance</th>
                  <th className="text-right font-bold px-4 py-3">Durée</th>
                  <th className="text-right font-bold px-4 py-3">Arrêts</th>
                  <th className="text-right font-bold px-4 py-3">Vitesse moy.</th>
                  <th className="text-right font-bold px-4 py-3">Pointe</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {trips.map(trip => (
                  <tr key={trip.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-4 py-3 font-bold text-slate-900 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-orange-500" />
                        {vehicleLabel(trip.vehicleId)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                      {driverLabel(trip.driverId)}
                    </td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                      {formatDateTime(trip.startedAt)}
                    </td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                      {formatDateTime(trip.endedAt)}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-slate-900 whitespace-nowrap">
                      {trip.distanceKm.toFixed(1)} km
                    </td>
                    <td className="px-4 py-3 text-right text-slate-600 whitespace-nowrap">
                      {formatDuration(trip.durationSeconds)}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-600 whitespace-nowrap">
                      {trip.stopCount === 0 ? (
                        <span className="text-slate-400">aucun</span>
                      ) : (
                        `${trip.stopCount} · ${formatDuration(trip.stopSeconds)}`
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-600 whitespace-nowrap">
                      {trip.avgSpeedKmH.toFixed(0)} km/h
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {/* La pointe signale un excès sans le qualifier : la limite
                          applicable dépend de la zone traversée. */}
                      <span
                        className={
                          trip.maxSpeedKmH > 90 ? 'font-bold text-red-600' : 'font-semibold text-slate-600'
                        }
                      >
                        {trip.maxSpeedKmH.toFixed(0)} km/h
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

const SummaryCard: React.FC<{
  icon: React.FC<{ className?: string }>;
  label: string;
  value: string;
  tone: string;
}> = ({ icon: Icon, label, value, tone }) => (
  <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
    <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">
      <Icon className={`w-3.5 h-3.5 ${tone}`} />
      {label}
    </div>
    <p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>
  </div>
);
