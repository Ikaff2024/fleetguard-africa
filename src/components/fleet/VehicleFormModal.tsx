import React, { useState } from 'react';
import { Truck, X } from 'lucide-react';
import { ApiClientError, apiClient } from '../../lib/api-client';
import { Vehicle } from '../../types';

/**
 * Saisie d'un véhicule.
 *
 * C'est par cet écran qu'un nouveau client entre sa flotte. Sans lui, l'API
 * savait créer des véhicules mais personne ne pouvait s'en servir : intégrer un
 * transporteur supposait d'exécuter du SQL à sa place, ce qui ne s'industrialise
 * pas et interdit tout essai libre.
 *
 * Les champs demandés sont ceux dont le reste de l'application a besoin pour
 * fonctionner — la consommation de référence commande la détection de
 * siphonnage et le calcul des primes, la contenance du réservoir borne les
 * pleins, l'échéance d'entretien alimente les alertes. Aucun n'est décoratif.
 */

interface VehicleFormModalProps {
  vehicle?: Vehicle;
  onClose: () => void;
  onSaved: () => void;
}

const TYPES = [
  { value: 'HEAVY_TRUCK', label: 'Poids lourd' },
  { value: 'MEDIUM_TRUCK', label: 'Camion moyen' },
  { value: 'CONTAINER_CARRIER', label: 'Porte-conteneurs' },
  { value: 'VAN', label: 'Fourgon' },
  { value: 'PICKUP', label: 'Pick-up' },
  { value: 'BUS', label: 'Autocar' },
] as const;

const FUELS = [
  { value: 'DIESEL', label: 'Gazole' },
  { value: 'GASOLINE', label: 'Essence' },
  { value: 'HYBRID', label: 'Hybride' },
  { value: 'ELECTRIC', label: 'Électrique' },
] as const;

export const VehicleFormModal: React.FC<VehicleFormModalProps> = ({ vehicle, onClose, onSaved }) => {
  const isEdit = Boolean(vehicle);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    immatriculation: vehicle?.immatriculation ?? '',
    vin: vehicle?.vin ?? '',
    make: vehicle?.make ?? '',
    model: vehicle?.model ?? '',
    year: vehicle?.year ?? new Date().getFullYear(),
    type: vehicle?.type ?? 'HEAVY_TRUCK',
    fuelType: vehicle?.fuelType ?? 'DIESEL',
    tankCapacityLiters: vehicle?.tankCapacityLiters ?? 350,
    expectedConsumptionL100km: vehicle?.expectedConsumptionL100km ?? 34,
    currentOdometerKm: vehicle?.currentOdometerKm ?? 0,
    nextServiceKm: vehicle?.nextServiceKm ?? undefined,
    gpsTrackerImei: vehicle?.gpsTrackerImei ?? '',
  });

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm(prev => ({ ...prev, [key]: value }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);

    // Les champs facultatifs vides sont omis plutôt qu'envoyés vides : une
    // chaîne vide n'est pas « non renseigné » pour la validation du serveur.
    const payload = {
      ...form,
      year: Number(form.year),
      tankCapacityLiters: Number(form.tankCapacityLiters),
      expectedConsumptionL100km: Number(form.expectedConsumptionL100km),
      currentOdometerKm: Number(form.currentOdometerKm),
      nextServiceKm: form.nextServiceKm ? Number(form.nextServiceKm) : undefined,
      gpsTrackerImei: form.gpsTrackerImei.trim() || undefined,
    };

    try {
      if (isEdit && vehicle) await apiClient.patch(`/vehicles/${vehicle.id}`, payload);
      else await apiClient.post('/vehicles', payload);
      onSaved();
      onClose();
    } catch (err) {
      // Le motif du serveur est repris tel quel : « immatriculation déjà
      // utilisée » se corrige, « échec » ne se corrige pas.
      setError(
        err instanceof ApiClientError
          ? err.message
          : "L'enregistrement a échoué. Vérifiez votre connexion et réessayez.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <form
        onSubmit={submit}
        className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-2xl shadow-2xl max-h-full overflow-y-auto"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <h3 className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Truck className="w-5 h-5 text-orange-500" />
            {isEdit ? `Modifier ${vehicle?.immatriculation}` : 'Ajouter un véhicule'}
          </h3>
          <button type="button" onClick={onClose} className="text-slate-400 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field
            label="Immatriculation"
            hint="Format libre : les plaques varient d’un pays à l’autre."
            value={form.immatriculation}
            onChange={v => set('immatriculation', v)}
            required
          />
          <Field label="Numéro de châssis (VIN)" value={form.vin} onChange={v => set('vin', v)} required />
          <Field label="Marque" value={form.make} onChange={v => set('make', v)} required />
          <Field label="Modèle" value={form.model} onChange={v => set('model', v)} required />

          <Select
            label="Type"
            value={form.type}
            options={TYPES}
            onChange={v => set('type', v as typeof form.type)}
          />
          <Select
            label="Carburant"
            value={form.fuelType}
            options={FUELS}
            onChange={v => set('fuelType', v as typeof form.fuelType)}
          />

          <Field
            label="Année"
            type="number"
            value={String(form.year)}
            onChange={v => set('year', Number(v))}
            required
          />
          <Field
            label="Compteur actuel (km)"
            type="number"
            value={String(form.currentOdometerKm)}
            onChange={v => set('currentOdometerKm', Number(v))}
            required
          />

          <Field
            label="Contenance du réservoir (L)"
            hint="Elle borne les pleins : un volume supérieur sera refusé."
            type="number"
            value={String(form.tankCapacityLiters)}
            onChange={v => set('tankCapacityLiters', Number(v))}
            required
          />
          <Field
            label="Consommation de référence (L/100 km)"
            hint="Base du calcul des primes et de la détection de siphonnage."
            type="number"
            step="0.1"
            value={String(form.expectedConsumptionL100km)}
            onChange={v => set('expectedConsumptionL100km', Number(v))}
            required
          />

          <Field
            label="Prochaine révision (km)"
            hint="Déclenche l’alerte d’entretien. Facultatif."
            type="number"
            value={form.nextServiceKm ? String(form.nextServiceKm) : ''}
            onChange={v => set('nextServiceKm', v ? Number(v) : undefined)}
          />
          <Field
            label="IMEI du boîtier"
            hint="Facultatif : le suivi peut se faire depuis le téléphone du chauffeur."
            value={form.gpsTrackerImei}
            onChange={v => set('gpsTrackerImei', v)}
          />
        </div>

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
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white font-bold text-xs cursor-pointer"
          >
            {saving ? 'Enregistrement…' : isEdit ? 'Enregistrer' : 'Ajouter le véhicule'}
          </button>
        </div>
      </form>
    </div>
  );
};

const Field: React.FC<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  type?: string;
  step?: string;
  required?: boolean;
}> = ({ label, value, onChange, hint, type = 'text', step, required }) => (
  <label className="block">
    <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wide">
      {label}
      {required && <span className="text-orange-500"> *</span>}
    </span>
    <input
      type={type}
      step={step}
      value={value}
      required={required}
      onChange={event => onChange(event.target.value)}
      className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100"
    />
    {hint && <span className="mt-1 block text-[10px] text-slate-500">{hint}</span>}
  </label>
);

const Select: React.FC<{
  label: string;
  value: string;
  options: readonly { value: string; label: string }[];
  onChange: (value: string) => void;
}> = ({ label, value, options, onChange }) => (
  <label className="block">
    <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wide">
      {label}
    </span>
    <select
      value={value}
      onChange={event => onChange(event.target.value)}
      className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 cursor-pointer"
    >
      {options.map(option => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  </label>
);
