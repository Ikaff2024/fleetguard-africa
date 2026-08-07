import React, { useMemo } from 'react';
import { AlertTriangle, CheckCircle2, Gauge, Wrench } from 'lucide-react';
import { useMaintenanceLogs, useVehicles } from '../../hooks/useFleetData';
import { Organization } from '../../types';

/**
 * Échéances d'entretien.
 *
 * Cet écran affichait une « maintenance prédictive » adossée à des capteurs
 * qui n'existent sur aucun de ces camions : pression d'huile, température
 * moteur, indice de vibration, usure des plaquettes, et un « risque de panne »
 * montant de 12 % à 96 %. Un tableau annonçait même « Transmission &
 * Embrayage — 94 % — EXCELLENT ».
 *
 * C'est la fabrication la plus coûteuse qu'on puisse laisser dans un outil de
 * flotte : elle pousse soit à immobiliser un camion sain, soit — bien pire — à
 * rouler sur un organe usé parce qu'un écran affichait 94 %.
 *
 * Ce qui est réellement connu tient en deux choses : le compteur du véhicule,
 * remonté du terrain, et l'échéance kilométrique portée par sa fiche. C'est
 * suffisant pour dire ce qui compte — quel camion doit passer à l'atelier, et
 * dans combien de kilomètres.
 */

interface MaintenanceForecastProps {
  currentOrg: Organization;
}

/** En deçà, l'échéance doit être planifiée sans attendre. */
const WARNING_THRESHOLD_KM = 1000;

export const MaintenanceForecast: React.FC<MaintenanceForecastProps> = () => {
  const vehiclesQuery = useVehicles();
  const maintenanceQuery = useMaintenanceLogs();

  const rows = useMemo(() => {
    const logs = maintenanceQuery.data ?? [];

    return (
      (vehiclesQuery.data ?? [])
        .map(vehicle => {
          const history = logs
            .filter(log => log.vehicleId === vehicle.id)
            .sort((a, b) => new Date(b.performedAt).getTime() - new Date(a.performedAt).getTime());

          const lastService = history[0];
          const remainingKm =
            vehicle.nextServiceKm !== undefined
              ? vehicle.nextServiceKm - vehicle.currentOdometerKm
              : undefined;

          return {
            vehicle,
            lastService,
            remainingKm,
            interventionCount: history.length,
          };
        })
        // Le plus urgent en tête : c'est ce qu'un responsable d'atelier cherche.
        .sort((a, b) => (a.remainingKm ?? Infinity) - (b.remainingKm ?? Infinity))
    );
  }, [vehiclesQuery.data, maintenanceQuery.data]);

  const overdue = rows.filter(r => r.remainingKm !== undefined && r.remainingKm < 0).length;
  const dueSoon = rows.filter(
    r => r.remainingKm !== undefined && r.remainingKm >= 0 && r.remainingKm <= WARNING_THRESHOLD_KM,
  ).length;
  const unknown = rows.filter(r => r.remainingKm === undefined).length;

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-orange-600 font-bold text-xs uppercase tracking-wider mb-1">
              <Wrench className="w-4 h-4 text-orange-500" />
              <span>Échéances d’entretien</span>
            </div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
              Passages à l’atelier à programmer
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-2xl leading-relaxed">
              L’échéance est comparée au compteur réellement remonté du terrain. Aucun capteur moteur n’équipe
              ces véhicules : l’usure d’un organe ne peut pas être prédite ici, seule la distance depuis la
              dernière intervention est connue.
            </p>
          </div>

          <div className="flex gap-3">
            <Tile value={overdue} label="Dépassées" tone="rose" />
            <Tile value={dueSoon} label="Sous 1 000 km" tone="amber" />
            <Tile value={unknown} label="Sans échéance" tone="slate" />
          </div>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-8 text-center">
          <Wrench className="w-8 h-8 text-slate-300 mx-auto" />
          <p className="mt-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
            Aucun véhicule enregistré
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500 uppercase text-[10px] tracking-wide">
                <tr>
                  <th className="text-left font-bold px-4 py-3">Véhicule</th>
                  <th className="text-right font-bold px-4 py-3">Compteur</th>
                  <th className="text-right font-bold px-4 py-3">Échéance</th>
                  <th className="text-right font-bold px-4 py-3">Restant</th>
                  <th className="text-left font-bold px-4 py-3">Dernière intervention</th>
                  <th className="text-left font-bold px-4 py-3">Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {rows.map(({ vehicle, lastService, remainingKm, interventionCount }) => (
                  <tr key={vehicle.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                    <td className="px-4 py-3">
                      <div className="font-bold font-mono text-slate-900 dark:text-slate-100">
                        {vehicle.immatriculation}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        {vehicle.make} {vehicle.model}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {vehicle.currentOdometerKm.toLocaleString()} km
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {vehicle.nextServiceKm !== undefined ? (
                        `${vehicle.nextServiceKm.toLocaleString()} km`
                      ) : (
                        <span className="font-sans text-slate-400">non définie</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold">
                      {remainingKm === undefined ? (
                        <span className="font-sans font-normal text-slate-400">—</span>
                      ) : remainingKm < 0 ? (
                        <span className="text-rose-600">{Math.abs(remainingKm)} km dépassés</span>
                      ) : (
                        <span className={remainingKm <= WARNING_THRESHOLD_KM ? 'text-amber-600' : ''}>
                          {remainingKm.toLocaleString()} km
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                      {lastService ? (
                        <>
                          <div>{new Date(lastService.performedAt).toLocaleDateString('fr-FR')}</div>
                          <div className="text-[10px] text-slate-400">
                            {interventionCount} intervention(s) enregistrée(s)
                          </div>
                        </>
                      ) : (
                        <span className="text-slate-400">Aucune enregistrée</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {remainingKm === undefined ? (
                        <span className="text-[10px] font-bold text-slate-500">
                          Renseigner l’échéance sur la fiche
                        </span>
                      ) : remainingKm < 0 ? (
                        <span className="text-[10px] font-bold text-rose-700 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" /> À immobiliser
                        </span>
                      ) : remainingKm <= WARNING_THRESHOLD_KM ? (
                        <span className="text-[10px] font-bold text-amber-700 flex items-center gap-1">
                          <Gauge className="w-3 h-3" /> À programmer
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold text-emerald-700 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Dans les délais
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
        Une prédiction d’usure suppose des capteurs embarqués — pression d’huile, température moteur,
        vibration — qu’aucun de ces véhicules ne remonte. Annoncer un état d’organe sans le mesurer conduirait
        soit à immobiliser un camion sain, soit à en laisser rouler un qui ne devrait pas.
      </p>
    </div>
  );
};

const Tile: React.FC<{ value: number; label: string; tone: 'rose' | 'amber' | 'slate' }> = ({
  value,
  label,
  tone,
}) => {
  const styles = {
    rose: 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300',
    amber:
      'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300',
    slate:
      'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300',
  }[tone];

  return (
    <div className={`border p-3 rounded-lg text-center ${styles}`}>
      <div className="text-2xl font-extrabold">{value}</div>
      <div className="text-[10px] font-bold uppercase tracking-wider">{label}</div>
    </div>
  );
};
