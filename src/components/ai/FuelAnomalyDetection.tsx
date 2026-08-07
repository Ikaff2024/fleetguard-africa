import React, { useMemo, useState } from 'react';
import { AlertTriangle, Fuel, MapPin, ShieldAlert } from 'lucide-react';
import { useAlerts, useVehicles } from '../../hooks/useFleetData';
import { Organization } from '../../types';

/**
 * Anomalies de consommation.
 *
 * Cet écran affichait trois anomalies écrites en dur, dont une accusait
 * nommément un véhicule d'un vol de quarante-cinq litres « à l'arrêt sur un
 * parking non autorisé », coordonnées GPS à l'appui. Aucune n'était réelle. Un
 * gestionnaire qui convoque un chauffeur là-dessus détruit une relation de
 * travail sur une fiction, et l'entreprise s'expose.
 *
 * Les anomalies viennent désormais du centre d'alertes, où elles sont dérivées
 * des pleins réellement enregistrés et comparées à la consommation de référence
 * du véhicule. Chacune porte l'identifiant du fait qui l'a produite.
 *
 * Le libellé reste factuel : un écart de consommation n'établit pas un vol. Il
 * peut venir d'une charge lourde, d'une piste dégradée ou d'un injecteur usé.
 * Le mot « siphonnage » n'apparaît qu'après un contrôle humain, jamais du fait
 * d'un seuil.
 */

interface FuelAnomalyDetectionProps {
  currentOrg: Organization;
}

const STATUS_LABELS: Record<string, string> = {
  UNHANDLED: 'Non traitée',
  IN_REVIEW: 'En cours',
  RESOLVED: 'Résolue',
  DISMISSED: 'Écartée',
};

export const FuelAnomalyDetection: React.FC<FuelAnomalyDetectionProps> = () => {
  const alertsQuery = useAlerts();
  const vehiclesQuery = useVehicles();
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');

  const vehicles = useMemo(() => vehiclesQuery.data ?? [], [vehiclesQuery.data]);

  const anomalies = useMemo(
    () => (alertsQuery.data ?? []).filter(alert => alert.category === 'FUEL_ANOMALY'),
    [alertsQuery.data],
  );

  const filtered = useMemo(
    () => anomalies.filter(a => selectedStatus === 'ALL' || a.status === selectedStatus),
    [anomalies, selectedStatus],
  );

  const plateOf = (vehicleId?: string) =>
    vehicles.find(v => v.id === vehicleId)?.immatriculation ?? 'Véhicule inconnu';

  const openCount = anomalies.filter(a => a.status === 'UNHANDLED').length;

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-rose-600 font-bold text-xs uppercase tracking-wider mb-1">
              <ShieldAlert className="w-4 h-4 text-rose-500" />
              <span>Écarts de consommation</span>
            </div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
              Anomalies relevées sur les pleins
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-2xl leading-relaxed">
              Chaque écart est constaté entre deux pleins enregistrés et la consommation de référence du
              véhicule. Un écart n’établit pas un vol : la charge transportée, l’état de la piste ou un
              injecteur usé l’expliquent aussi. Le contrôle humain tranche.
            </p>
          </div>

          <div className="flex gap-4">
            <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 p-3 rounded-lg text-center">
              <div className="text-2xl font-extrabold text-rose-700 dark:text-rose-300">{openCount}</div>
              <div className="text-[10px] text-rose-600 dark:text-rose-400 font-bold uppercase tracking-wider">
                À traiter
              </div>
            </div>
            <div className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-3 rounded-lg text-center">
              <div className="text-2xl font-extrabold text-slate-800 dark:text-slate-100">
                {anomalies.length}
              </div>
              <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                Sur 30 jours
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap justify-between items-center gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-xl shadow-xs">
        <div className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2 text-sm">
          <Fuel className="w-4 h-4 text-orange-500" />
          Écarts constatés ({filtered.length})
        </div>

        <select
          value={selectedStatus}
          onChange={event => setSelectedStatus(event.target.value)}
          className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-semibold cursor-pointer"
        >
          <option value="ALL">Tous les statuts</option>
          {Object.entries(STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-8 text-center">
          <Fuel className="w-8 h-8 text-slate-300 mx-auto" />
          <p className="mt-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
            Aucun écart de consommation relevé
          </p>
          <p className="mt-1 text-xs text-slate-500 max-w-md mx-auto">
            Les écarts apparaissent dès qu’un plein enregistré s’écarte nettement de la consommation de
            référence du véhicule. Deux pleins au moins sont nécessaires pour mesurer.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(anomaly => (
            <div
              key={anomaly.id}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-xs"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex-1 min-w-[260px]">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-2 py-0.5 rounded bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800 text-[10px] font-bold">
                      {anomaly.severity}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[10px] font-bold">
                      {STATUS_LABELS[anomaly.status] ?? anomaly.status}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {new Date(anomaly.recordedAt).toLocaleDateString('fr-FR')}
                    </span>
                  </div>

                  <h4 className="mt-2 font-bold text-sm text-slate-900 dark:text-slate-100">
                    {anomaly.title}
                  </h4>
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    {anomaly.description}
                  </p>

                  <div className="mt-2 flex items-center gap-3 text-[11px] text-slate-500">
                    <span className="font-mono font-bold">{plateOf(anomaly.vehicleId)}</span>
                    {anomaly.locationName && (
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {anomaly.locationName}
                      </span>
                    )}
                  </div>
                </div>

                {anomaly.metricValue && (
                  <div className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-right">
                    <div className="text-[10px] text-slate-500 uppercase tracking-wide">
                      {anomaly.metricLabel ?? 'Relevé'}
                    </div>
                    <div className="font-mono font-bold text-slate-900 dark:text-slate-100">
                      {anomaly.metricValue}
                    </div>
                  </div>
                )}
              </div>

              {/* La traçabilité est ce qui distingue un constat d'une accusation. */}
              <div className="mt-3 pt-2 border-t border-slate-100 dark:border-slate-800 text-[10px] text-slate-400 flex items-center gap-1.5">
                <AlertTriangle className="w-3 h-3" />
                Constat issu du plein enregistré ({anomaly.sourceType}) — vérifiable dans l’historique de
                ravitaillement.
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
