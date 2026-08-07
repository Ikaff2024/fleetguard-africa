import React, { useState } from 'react';
import { UserPlus, X } from 'lucide-react';
import { ApiClientError, apiClient } from '../../lib/api-client';
import { Driver, Vehicle } from '../../types';

/**
 * Saisie d'un chauffeur.
 *
 * L'affectation à un véhicule se fait ici, et elle compte : c'est elle qui
 * rattache les positions remontées du terrain, donc le score, la charge de
 * travail et la prime. Un chauffeur sans véhicule n'apparaît nulle part.
 *
 * L'échéance du permis alimente les alertes de conformité — un chauffeur
 * arrêté au poste frontière avec un permis expiré immobilise le camion et la
 * marchandise.
 */

interface DriverFormModalProps {
  driver?: Driver;
  vehicles: Vehicle[];
  onClose: () => void;
  onSaved: () => void;
}

export const DriverFormModal: React.FC<DriverFormModalProps> = ({ driver, vehicles, onClose, onSaved }) => {
  const isEdit = Boolean(driver);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    fullName: driver?.fullName ?? '',
    phone: driver?.phone ?? '',
    licenseNumber: driver?.licenseNumber ?? '',
    licenseCategory: driver?.licenseCategory ?? 'CE',
    licenseExpiryDate: driver?.licenseExpiryDate?.slice(0, 10) ?? '',
    assignedVehicleId: driver?.assignedVehicleId ?? '',
  });

  const set = (key: keyof typeof form, value: string) => setForm(prev => ({ ...prev, [key]: value }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);

    const payload = {
      ...form,
      // `null` détache explicitement, là où l'omission laisserait l'affectation
      // en place lors d'une modification.
      assignedVehicleId: form.assignedVehicleId || null,
    };

    try {
      if (isEdit && driver) await apiClient.patch(`/drivers/${driver.id}`, payload);
      else await apiClient.post('/drivers', payload);
      onSaved();
      onClose();
    } catch (err) {
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
        className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-xl shadow-2xl max-h-full overflow-y-auto"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <h3 className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-orange-500" />
            {isEdit ? `Modifier ${driver?.fullName}` : 'Ajouter un chauffeur'}
          </h3>
          <button type="button" onClick={onClose} className="text-slate-400 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Nom complet" value={form.fullName} onChange={v => set('fullName', v)} required />
          <Field label="Téléphone" value={form.phone} onChange={v => set('phone', v)} required />
          <Field
            label="Numéro de permis"
            value={form.licenseNumber}
            onChange={v => set('licenseNumber', v)}
            required
          />
          <Field
            label="Catégorie"
            hint="C, CE, D… selon le véhicule conduit."
            value={form.licenseCategory}
            onChange={v => set('licenseCategory', v)}
            required
          />
          <Field
            label="Expiration du permis"
            hint="Alimente les alertes de conformité."
            type="date"
            value={form.licenseExpiryDate}
            onChange={v => set('licenseExpiryDate', v)}
            required
          />

          <label className="block">
            <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wide">
              Véhicule affecté
            </span>
            <select
              value={form.assignedVehicleId}
              onChange={event => set('assignedVehicleId', event.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 cursor-pointer"
            >
              <option value="">Aucun</option>
              {vehicles.map(vehicle => (
                <option key={vehicle.id} value={vehicle.id}>
                  {vehicle.immatriculation} — {vehicle.make} {vehicle.model}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-[10px] text-slate-500">
              Sans véhicule, ses positions ne peuvent être rattachées : ni score, ni charge, ni prime.
            </span>
          </label>
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
            {saving ? 'Enregistrement…' : isEdit ? 'Enregistrer' : 'Ajouter le chauffeur'}
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
  required?: boolean;
}> = ({ label, value, onChange, hint, type = 'text', required }) => (
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
    {hint && <span className="mt-1 block text-[10px] text-slate-500">{hint}</span>}
  </label>
);
