import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CalendarClock, CheckCircle2, Route, ShieldAlert, X } from 'lucide-react';
import { ApiClientError, apiClient } from '../../lib/api-client';
import { useApiResource } from '../../hooks/useApiResource';
import { useDrivers, useVehicles } from '../../hooks/useFleetData';
import { Organization } from '../../types';

/**
 * Planification des missions.
 *
 * C'est le seul écran qui porte sur l'avenir — tout le reste constate. Sa
 * valeur ne tient pas au calendrier, qu'un tableur remplace, mais au refus :
 * une affectation qui ferait dépasser les plafonds de conduite est bloquée, sur
 * des heures mesurées à partir des trajets reconstruits.
 *
 * L'évaluation se fait pendant la composition, pas après validation : un
 * gestionnaire doit savoir qu'une affectation est impossible tant qu'il peut
 * encore changer de chauffeur.
 */

interface Feasibility {
  feasible: boolean;
  plannedDrivingHours: number;
  scheduledEnd: string;
  assumedSpeedKmH: number;
  speedBasis: 'OBSERVED' | 'DEFAULT';
  blockers: { code: string; message: string }[];
  warnings: string[];
}

interface Mission {
  id: string;
  vehicleImmatriculation: string;
  driverName: string;
  originLabel: string;
  destinationLabel: string;
  plannedDistanceKm: number;
  scheduledStart: string;
  scheduledEnd: string;
  plannedDrivingHours: number;
  status: string;
  overrideReason?: string;
}

interface MissionPlannerProps {
  /** Conservé pour l'uniformité des écrans, même si le rendu n'en dépend pas. */
  currentOrg: Organization;
}

const STATUS_LABELS: Record<string, string> = {
  PLANNED: 'Planifiée',
  IN_PROGRESS: 'En cours',
  COMPLETED: 'Terminée',
  CANCELLED: 'Annulée',
};

export const MissionPlanner: React.FC<MissionPlannerProps> = () => {
  const missionsQuery = useApiResource<Mission[]>('/missions');
  const vehiclesQuery = useVehicles();
  const driversQuery = useDrivers();

  const [showForm, setShowForm] = useState(false);
  const missions = missionsQuery.data ?? [];

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <CalendarClock className="w-5 h-5 text-orange-500" />
            Missions planifiées
            <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-orange-100 text-orange-800 border border-orange-200">
              {missions.length}
            </span>
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-2xl">
            Une affectation qui ferait dépasser les plafonds de conduite est refusée. Le contrôle s’appuie sur
            les heures réellement mesurées à partir des trajets, pas sur un carnet rempli de mémoire.
          </p>
        </div>

        <button
          onClick={() => setShowForm(true)}
          className="px-3.5 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer"
        >
          <Route className="w-4 h-4" />
          <span>Planifier une mission</span>
        </button>
      </div>

      {showForm && (
        <MissionFormModal
          vehicles={vehiclesQuery.data ?? []}
          drivers={driversQuery.data ?? []}
          onClose={() => setShowForm(false)}
          onSaved={missionsQuery.reload}
        />
      )}

      {missions.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-8 text-center">
          <CalendarClock className="w-8 h-8 text-slate-300 mx-auto" />
          <p className="mt-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
            Aucune mission planifiée
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Planifiez une mission : la charge de chaque chauffeur sera vérifiée avant validation.
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500 uppercase text-[10px] tracking-wide">
                <tr>
                  <th className="text-left font-bold px-4 py-3">Itinéraire</th>
                  <th className="text-left font-bold px-4 py-3">Chauffeur</th>
                  <th className="text-left font-bold px-4 py-3">Véhicule</th>
                  <th className="text-left font-bold px-4 py-3">Départ</th>
                  <th className="text-right font-bold px-4 py-3">Distance</th>
                  <th className="text-right font-bold px-4 py-3">Conduite</th>
                  <th className="text-left font-bold px-4 py-3">Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {missions.map(mission => (
                  <tr key={mission.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                    <td className="px-4 py-3">
                      <div className="font-bold text-slate-900 dark:text-slate-100">
                        {mission.originLabel} → {mission.destinationLabel}
                      </div>
                      {mission.overrideReason && (
                        /* Une mission validée malgré un dépassement doit se
                           reconnaître au premier coup d'œil : c'est ce que l'on
                           demandera à l'entreprise après un incident. */
                        <div className="mt-1 text-[10px] text-amber-700 flex items-start gap-1">
                          <ShieldAlert className="w-3 h-3 mt-0.5 shrink-0" />
                          <span>Dérogation : {mission.overrideReason}</span>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{mission.driverName}</td>
                    <td className="px-4 py-3 font-mono text-slate-600 dark:text-slate-300">
                      {mission.vehicleImmatriculation}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                      {new Date(mission.scheduledStart).toLocaleString('fr-FR', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">{mission.plannedDistanceKm} km</td>
                    <td className="px-4 py-3 text-right font-mono">{mission.plannedDrivingHours} h</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-[10px]">
                        {STATUS_LABELS[mission.status] ?? mission.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

const MissionFormModal: React.FC<{
  vehicles: { id: string; immatriculation: string; make: string; model: string }[];
  drivers: { id: string; fullName: string }[];
  onClose: () => void;
  onSaved: () => void;
}> = ({ vehicles, drivers, onClose, onSaved }) => {
  const [form, setForm] = useState({
    vehicleId: vehicles[0]?.id ?? '',
    driverId: drivers[0]?.id ?? '',
    originLabel: '',
    destinationLabel: '',
    plannedDistanceKm: '400',
    scheduledStart: '',
    notes: '',
  });

  const [feasibility, setFeasibility] = useState<Feasibility | null>(null);
  const [overrideReason, setOverrideReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (key: keyof typeof form, value: string) => setForm(prev => ({ ...prev, [key]: value }));

  const payload = useCallback(
    () => ({
      vehicleId: form.vehicleId,
      driverId: form.driverId,
      originLabel: form.originLabel || 'Départ',
      destinationLabel: form.destinationLabel || 'Arrivée',
      plannedDistanceKm: Number(form.plannedDistanceKm),
      scheduledStart: form.scheduledStart ? new Date(form.scheduledStart).toISOString() : '',
      notes: form.notes.trim() || undefined,
    }),
    [form],
  );

  /**
   * Évaluation en direct.
   *
   * Elle interroge le serveur pendant la composition : savoir après validation
   * qu'un chauffeur est indisponible oblige à tout recommencer, et pousse à
   * chercher le contournement plutôt qu'un autre chauffeur.
   */
  useEffect(() => {
    const body = payload();
    const complete = Boolean(
      body.vehicleId && body.driverId && body.scheduledStart && body.plannedDistanceKm,
    );

    // La remise à zéro passe elle aussi par le minuteur : appeler `setState`
    // pendant le corps de l'effet déclencherait un rendu en cascade.
    const timer = window.setTimeout(() => {
      if (!complete) {
        setFeasibility(null);
        return;
      }
      apiClient
        .post<Feasibility>('/missions/assess', body)
        .then(setFeasibility)
        .catch(() => setFeasibility(null));
    }, 400);

    return () => window.clearTimeout(timer);
  }, [payload]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);

    try {
      await apiClient.post('/missions', {
        ...payload(),
        overrideReason: overrideReason.trim() || undefined,
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'La mission n’a pas pu être enregistrée.');
    } finally {
      setSaving(false);
    }
  };

  const blocked = feasibility ? !feasibility.feasible : false;

  return (
    <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <form
        onSubmit={submit}
        className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-2xl shadow-2xl max-h-full overflow-y-auto"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <h3 className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Route className="w-5 h-5 text-orange-500" />
            Planifier une mission
          </h3>
          <button type="button" onClick={onClose} className="text-slate-400 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Pick
            label="Chauffeur"
            value={form.driverId}
            onChange={v => set('driverId', v)}
            options={drivers.map(d => ({ value: d.id, label: d.fullName }))}
          />
          <Pick
            label="Véhicule"
            value={form.vehicleId}
            onChange={v => set('vehicleId', v)}
            options={vehicles.map(v => ({
              value: v.id,
              label: `${v.immatriculation} — ${v.make} ${v.model}`,
            }))}
          />

          <Text label="Départ" value={form.originLabel} onChange={v => set('originLabel', v)} required />
          <Text
            label="Arrivée"
            value={form.destinationLabel}
            onChange={v => set('destinationLabel', v)}
            required
          />

          <Text
            label="Distance prévue (km)"
            type="number"
            value={form.plannedDistanceKm}
            onChange={v => set('plannedDistanceKm', v)}
            required
          />
          <Text
            label="Départ prévu"
            type="datetime-local"
            value={form.scheduledStart}
            onChange={v => set('scheduledStart', v)}
            required
          />
        </div>

        {feasibility && (
          <div className="mx-6 mb-4 space-y-2">
            <div
              className={`rounded-xl p-3 text-xs ${
                blocked
                  ? 'bg-red-50 border border-red-200 text-red-800'
                  : 'bg-emerald-50 border border-emerald-200 text-emerald-800'
              }`}
            >
              <div className="flex items-center gap-2 font-bold">
                {blocked ? <AlertTriangle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                <span>
                  {feasibility.plannedDrivingHours} h de conduite, arrivée estimée le{' '}
                  {new Date(feasibility.scheduledEnd).toLocaleString('fr-FR', {
                    day: '2-digit',
                    month: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
              <p className="mt-1 text-[11px] opacity-90">
                {/* D'où vient l'estimation : sans cette phrase, elle passerait
                    pour une mesure. */}
                {feasibility.speedBasis === 'OBSERVED'
                  ? `Estimée sur l’allure observée de votre flotte : ${feasibility.assumedSpeedKmH} km/h porte à porte.`
                  : `Estimée sur une moyenne de corridor de ${feasibility.assumedSpeedKmH} km/h, faute d’historique suffisant.`}
              </p>
            </div>

            {feasibility.blockers.map(blocker => (
              <div
                key={blocker.code}
                className="bg-red-50 border border-red-200 rounded-lg p-2.5 text-[11px] font-semibold text-red-700"
              >
                {blocker.message}
              </div>
            ))}

            {feasibility.warnings.map(warning => (
              <div
                key={warning}
                className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-[11px] text-amber-800"
              >
                {warning}
              </div>
            ))}

            {blocked && (
              <label className="block">
                <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wide">
                  Motif de dérogation
                </span>
                <textarea
                  value={overrideReason}
                  onChange={event => setOverrideReason(event.target.value)}
                  rows={2}
                  placeholder="Relais prévu à mi-parcours avec un second chauffeur, confirmé par le client."
                  className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                />
                <span className="mt-1 block text-[10px] text-slate-500">
                  Sans motif écrit, la mission est refusée. La justification est conservée : c’est elle qui
                  distingue une décision assumée d’une négligence.
                </span>
              </label>
            )}
          </div>
        )}

        {error && (
          <div className="mx-6 mb-4 bg-red-50 border border-red-200 rounded-lg p-3 text-xs font-semibold text-red-700">
            {error}
          </div>
        )}

        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold text-xs cursor-pointer"
          >
            Annuler
          </button>
          <button
            type="submit"
            disabled={saving || (blocked && overrideReason.trim().length < 10)}
            className="px-4 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-bold text-xs cursor-pointer"
          >
            {saving ? 'Enregistrement…' : blocked ? 'Valider avec dérogation' : 'Planifier'}
          </button>
        </div>
      </form>
    </div>
  );
};

const Text: React.FC<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
}> = ({ label, value, onChange, type = 'text', required }) => (
  <label className="block">
    <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wide">
      {label}
      {required && <span className="text-orange-500"> *</span>}
    </span>
    <input
      type={type}
      value={value}
      required={required}
      onChange={event => onChange(event.target.value)}
      className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100"
    />
  </label>
);

const Pick: React.FC<{
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}> = ({ label, value, options, onChange }) => (
  <label className="block">
    <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wide">
      {label}
    </span>
    <select
      value={value}
      onChange={event => onChange(event.target.value)}
      className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm cursor-pointer"
    >
      {options.map(option => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  </label>
);
