import React, { useState } from 'react';
import { Fuel, MapPin, Plus, Trash2, X } from 'lucide-react';
import { ApiClientError, apiClient } from '../../lib/api-client';
import { useFuelStations } from '../../hooks/useFleetData';
import { FuelStation } from '../../types';

/**
 * Réseau de ravitaillement conventionné.
 *
 * Un transporteur négocie ses accords avec une ou plusieurs enseignes, et ses
 * cartes carburant ne fonctionnent que dans ce réseau. Sans cet écran, seul le
 * peuplement initial créait des stations : un client qui signait avec Oryx ne
 * pouvait pas enregistrer les siennes.
 *
 * Le relevé de prix est séparé de la fiche complète, parce que c'est
 * l'opération courante. Un exploitant apprend qu'un tarif a bougé et doit le
 * noter en quelques secondes — pas rouvrir un formulaire de douze champs.
 */

const BRANDS = ['TOTAL_ENERGIES', 'ORYX', 'CORLAY', 'SHELL', 'PUMA', 'PETROCI', 'STAR_OIL', 'OTHER'] as const;

export const StationNetworkPanel: React.FC = () => {
  const stationsQuery = useFuelStations();
  const stations = stationsQuery.data ?? [];

  const [showForm, setShowForm] = useState(false);
  const [pricingStation, setPricingStation] = useState<FuelStation | null>(null);
  const [error, setError] = useState<string | null>(null);

  const remove = async (station: FuelStation) => {
    setError(null);
    try {
      await apiClient.delete(`/fuel-stations/${station.id}`);
      stationsQuery.reload();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Le retrait a échoué.');
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Fuel className="w-5 h-5 text-orange-500" />
            Réseau conventionné
            <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-orange-100 text-orange-800 border border-orange-200">
              {stations.length}
            </span>
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-2xl">
            Les stations où vos cartes carburant fonctionnent. Ce sont elles que la carte propose aux
            chauffeurs — une station hors convention obligerait le conducteur à avancer l’argent du plein.
          </p>
        </div>

        <button
          onClick={() => setShowForm(true)}
          className="px-3.5 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Ajouter une station</span>
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs font-semibold text-red-700">
          {error}
        </div>
      )}

      {showForm && <StationFormModal onClose={() => setShowForm(false)} onSaved={stationsQuery.reload} />}

      {pricingStation && (
        <PriceModal
          station={pricingStation}
          onClose={() => setPricingStation(null)}
          onSaved={stationsQuery.reload}
        />
      )}

      {stations.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-8 text-center">
          <Fuel className="w-8 h-8 text-slate-300 mx-auto" />
          <p className="mt-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
            Aucune station enregistrée
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Ajoutez les stations de votre réseau : la carte ne peut proposer que celles-là.
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500 uppercase text-[10px] tracking-wide">
                <tr>
                  <th className="text-left font-bold px-4 py-3">Station</th>
                  <th className="text-left font-bold px-4 py-3">Ville</th>
                  <th className="text-right font-bold px-4 py-3">Gazole</th>
                  <th className="text-left font-bold px-4 py-3">Relevé</th>
                  <th className="text-left font-bold px-4 py-3">Services</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {stations.map(station => (
                  <tr key={station.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                    <td className="px-4 py-3">
                      <div className="font-bold text-slate-900 dark:text-slate-100">{station.name}</div>
                      <div className="text-[10px] text-slate-500">{station.brand}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                      {station.city}, {station.country}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-slate-900 dark:text-slate-100">
                      {station.dieselPrice !== undefined ? (
                        `${station.dieselPrice} ${station.currency ?? ''}`
                      ) : (
                        <span className="font-sans font-normal text-slate-400">non relevé</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {/* Un tarif sans date ne permet aucune prévision de coût. */}
                      {station.priceObservedAt
                        ? new Date(station.priceObservedAt).toLocaleDateString('fr-FR')
                        : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {station.is24h && <Tag label="24h/24" />}
                        {station.hasAdBlue && <Tag label="AdBlue" />}
                        {station.hasHeavyTruckParking && <Tag label="Parking PL" />}
                        {station.hasMechanic && <Tag label="Mécanicien" />}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button
                        onClick={() => setPricingStation(station)}
                        className="px-2.5 py-1 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-bold text-[10px] cursor-pointer"
                      >
                        Relever le prix
                      </button>
                      <button
                        onClick={() => void remove(station)}
                        title="Retirer du réseau"
                        className="ml-2 p-1.5 rounded-lg text-slate-400 hover:text-red-600 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
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

const Tag: React.FC<{ label: string }> = ({ label }) => (
  <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px] font-semibold">
    {label}
  </span>
);

/**
 * Relevé de prix.
 *
 * Trois champs, un bouton. La date est posée par le serveur : un tarif dont on
 * ignore l'âge ne permet aucune prévision de coût de mission.
 */
const PriceModal: React.FC<{
  station: FuelStation;
  onClose: () => void;
  onSaved: () => void;
}> = ({ station, onClose, onSaved }) => {
  const [diesel, setDiesel] = useState(station.dieselPrice ? String(station.dieselPrice) : '');
  const [adblue, setAdblue] = useState(station.adbluePrice ? String(station.adbluePrice) : '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await apiClient.patch(`/fuel-stations/${station.id}/prices`, {
        dieselPrice: diesel ? Number(diesel) : undefined,
        adbluePrice: adblue ? Number(adblue) : undefined,
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Le relevé n’a pas pu être enregistré.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4">
      <form onSubmit={submit} className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">Relever les tarifs</h3>
          <button type="button" onClick={onClose} className="text-slate-400 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-3">
          <p className="text-xs text-slate-500">{station.name}</p>
          <NumberField label="Gazole / L" value={diesel} onChange={setDiesel} />
          {station.hasAdBlue && <NumberField label="AdBlue / L" value={adblue} onChange={setAdblue} />}
          <p className="text-[10px] text-slate-500">La date du relevé est enregistrée automatiquement.</p>
          {error && <p className="text-xs font-semibold text-red-700">{error}</p>}
        </div>

        <div className="px-5 py-4 border-t border-slate-200 dark:border-slate-800 flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white font-bold text-xs cursor-pointer"
          >
            {saving ? 'Enregistrement…' : 'Enregistrer le relevé'}
          </button>
        </div>
      </form>
    </div>
  );
};

const StationFormModal: React.FC<{ onClose: () => void; onSaved: () => void }> = ({ onClose, onSaved }) => {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    brand: 'TOTAL_ENERGIES' as (typeof BRANDS)[number],
    address: '',
    city: '',
    country: '',
    latitude: '',
    longitude: '',
    is24h: false,
    hasAdBlue: false,
    hasHeavyTruckParking: false,
    hasRestArea: false,
    hasMechanic: false,
    contactPhone: '',
  });

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await apiClient.post('/fuel-stations', {
        ...form,
        latitude: Number(form.latitude),
        longitude: Number(form.longitude),
        contactPhone: form.contactPhone.trim() || undefined,
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'La station n’a pas pu être ajoutée.');
    } finally {
      setSaving(false);
    }
  };

  const set = (key: keyof typeof form, value: string | boolean) =>
    setForm(prev => ({ ...prev, [key]: value }));

  return (
    <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <form
        onSubmit={submit}
        className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-2xl shadow-2xl max-h-full overflow-y-auto"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <h3 className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <MapPin className="w-5 h-5 text-orange-500" />
            Ajouter une station au réseau
          </h3>
          <button type="button" onClick={onClose} className="text-slate-400 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <TextField label="Nom" value={form.name} onChange={v => set('name', v)} required />
          <label className="block">
            <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wide">
              Enseigne
            </span>
            <select
              value={form.brand}
              onChange={event => set('brand', event.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm cursor-pointer"
            >
              {BRANDS.map(brand => (
                <option key={brand} value={brand}>
                  {brand.replace('_', ' ')}
                </option>
              ))}
            </select>
          </label>

          <TextField label="Adresse" value={form.address} onChange={v => set('address', v)} required />
          <TextField label="Ville" value={form.city} onChange={v => set('city', v)} required />
          <TextField label="Pays" value={form.country} onChange={v => set('country', v)} required />
          <TextField label="Téléphone" value={form.contactPhone} onChange={v => set('contactPhone', v)} />

          <TextField
            label="Latitude"
            hint="Relevé depuis une carte, en degrés décimaux."
            type="number"
            step="0.000001"
            value={form.latitude}
            onChange={v => set('latitude', v)}
            required
          />
          <TextField
            label="Longitude"
            type="number"
            step="0.000001"
            value={form.longitude}
            onChange={v => set('longitude', v)}
            required
          />

          <div className="sm:col-span-2 grid grid-cols-2 sm:grid-cols-3 gap-2">
            <Check label="Ouverte 24h/24" checked={form.is24h} onChange={v => set('is24h', v)} />
            <Check label="AdBlue" checked={form.hasAdBlue} onChange={v => set('hasAdBlue', v)} />
            <Check
              label="Parking poids lourds"
              checked={form.hasHeavyTruckParking}
              onChange={v => set('hasHeavyTruckParking', v)}
            />
            <Check label="Aire de repos" checked={form.hasRestArea} onChange={v => set('hasRestArea', v)} />
            <Check label="Mécanicien" checked={form.hasMechanic} onChange={v => set('hasMechanic', v)} />
          </div>
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
            {saving ? 'Enregistrement…' : 'Ajouter la station'}
          </button>
        </div>
      </form>
    </div>
  );
};

const TextField: React.FC<{
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

const NumberField: React.FC<{
  label: string;
  value: string;
  onChange: (value: string) => void;
}> = ({ label, value, onChange }) => (
  <label className="block">
    <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wide">
      {label}
    </span>
    <input
      type="number"
      step="1"
      value={value}
      onChange={event => onChange(event.target.value)}
      className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-mono"
    />
  </label>
);

const Check: React.FC<{
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}> = ({ label, checked, onChange }) => (
  <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
    <input
      type="checkbox"
      checked={checked}
      onChange={event => onChange(event.target.checked)}
      className="w-4 h-4 accent-orange-500 cursor-pointer"
    />
    {label}
  </label>
);
