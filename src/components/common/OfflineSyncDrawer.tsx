import React, { useState } from 'react';
import { useOfflineSync } from '../../context/OfflineSyncContext';
import {
  Database,
  Wifi,
  WifiOff,
  RefreshCw,
  CheckCircle2,
  Trash2,
  X,
  Plus,
  Layers,
  ChevronRight,
  ShieldCheck,
  Fuel,
  Truck,
  MapPin,
  Wrench,
} from 'lucide-react';

interface OfflineSyncDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  currentOrgId: string;
}

export const OfflineSyncDrawer: React.FC<OfflineSyncDrawerProps> = ({ isOpen, onClose, currentOrgId }) => {
  const {
    isOnline,
    setIsOnline,
    queueItems,
    pendingCount,
    isSyncing,
    enqueueUpdate,
    triggerManualSync,
    clearSyncedItems,
    clearAllQueue,
  } = useOfflineSync();

  const [activeTab, setActiveTab] = useState<'queue' | 'entry'>('queue');
  const [selectedItemPayload, setSelectedItemPayload] = useState<any | null>(null);

  /**
   * Saisie de terrain.
   *
   * Cet onglet était un « simulateur » : il fabriquait la saisie de toutes
   * pièces — station « Total Parakou Nord », chauffeur « Moussa Diop », prix du
   * litre à 650 — et l'ajoutait à la file. Or la file écrit réellement en base
   * depuis qu'elle est raccordée au serveur. Chaque clic créait donc un vrai
   * plein portant des informations inventées.
   *
   * Le plus grave n'était pas les noms : c'est que le relevé du compteur
   * n'était jamais transmis. Le serveur retombait alors sur le kilométrage
   * courant du véhicule, si bien que tous les pleins simulés atterrissaient au
   * même point du compteur. La consommation se mesurant d'un plein à l'autre,
   * quelques clics suffisaient à la rendre incalculable — et avec elle, la
   * prime du chauffeur.
   *
   * Les champs ci-dessous partent donc vides. Ce qui n'est pas saisi n'est pas
   * envoyé, et le compteur est exigé parce que sans lui le plein ne mesure
   * rien.
   */
  const [entryType, setEntryType] = useState<'FUEL_LOG' | 'ODOMETER_UPDATE' | 'MAINTENANCE_RECORD'>(
    'FUEL_LOG',
  );
  const [plate, setPlate] = useState<string>('');
  const [liters, setLiters] = useState<string>('');
  const [odometerKm, setOdometerKm] = useState<string>('');
  const [pricePerLiter, setPricePerLiter] = useState<string>('');
  const [stationName, setStationName] = useState<string>('');
  const [receiptNumber, setReceiptNumber] = useState<string>('');
  const [maintenanceLabel, setMaintenanceLabel] = useState<string>('');
  const [maintenanceCost, setMaintenanceCost] = useState<string>('');
  const [entryError, setEntryError] = useState<string | null>(null);
  const [entryDone, setEntryDone] = useState<string | null>(null);

  if (!isOpen) return null;

  /** Champs obligatoires par type — ce qui manque empêche la mesure, pas seulement l'affichage. */
  const missingFields = (): string | null => {
    if (!plate.trim()) return 'L’immatriculation du véhicule est nécessaire.';

    if (entryType === 'FUEL_LOG') {
      if (!Number(liters)) return 'Le volume en litres est nécessaire.';
      // Sans compteur, le plein ne mesure aucune consommation : il vaut mieux
      // refuser la saisie que d'enregistrer un plein inexploitable.
      if (!Number(odometerKm)) return 'Le relevé du compteur est nécessaire pour mesurer la consommation.';
    }

    if (entryType === 'ODOMETER_UPDATE' && !Number(odometerKm)) {
      return 'Le relevé du compteur est nécessaire.';
    }

    if (entryType === 'MAINTENANCE_RECORD' && !maintenanceLabel.trim()) {
      return 'La nature de l’intervention est nécessaire.';
    }

    return null;
  };

  const handleAddEntry = async () => {
    setEntryDone(null);
    const missing = missingFields();
    if (missing) {
      setEntryError(missing);
      return;
    }
    setEntryError(null);

    let payload: Record<string, any>;

    if (entryType === 'FUEL_LOG') {
      const litersValue = Number(liters);
      const price = Number(pricePerLiter) || 0;
      payload = {
        vehicleRegistration: plate.trim().toUpperCase(),
        litersAdded: litersValue,
        odometerKm: Number(odometerKm),
        // Le prix et le total ne sont transmis que s'ils ont été saisis : un
        // prix par défaut fausserait le coût au litre de toute l'organisation.
        ...(price > 0 ? { pricePerLiter: price, totalCost: litersValue * price } : {}),
        ...(stationName.trim() ? { stationName: stationName.trim() } : {}),
        ...(receiptNumber.trim() ? { receiptNumber: receiptNumber.trim() } : {}),
        loggedAt: new Date().toISOString(),
      };
    } else if (entryType === 'ODOMETER_UPDATE') {
      payload = {
        vehicleRegistration: plate.trim().toUpperCase(),
        newOdometerKm: Number(odometerKm),
        recordedAt: new Date().toISOString(),
      };
    } else {
      payload = {
        vehicleRegistration: plate.trim().toUpperCase(),
        type: maintenanceLabel.trim(),
        ...(Number(maintenanceCost) ? { cost: Number(maintenanceCost) } : {}),
      };
    }

    await enqueueUpdate(entryType, payload, currentOrgId);

    setEntryDone(
      isOnline
        ? 'Saisie transmise. Le serveur la refusera si le véhicule ou le volume ne correspond pas.'
        : 'Saisie conservée sur l’appareil. Elle partira au retour du réseau.',
    );
    setLiters('');
    setOdometerKm('');
    setPricePerLiter('');
    setReceiptNumber('');
    setMaintenanceLabel('');
    setMaintenanceCost('');
  };

  const getBadgeColor = (type: string) => {
    switch (type) {
      case 'FUEL_LOG':
        return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'ODOMETER_UPDATE':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'GPS_TELEMETRY':
        return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'MAINTENANCE_RECORD':
        return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      default:
        return 'bg-slate-100 text-slate-800 border-slate-200';
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'FUEL_LOG':
        return <Fuel className="w-3.5 h-3.5 text-amber-600" />;
      case 'ODOMETER_UPDATE':
        return <Truck className="w-3.5 h-3.5 text-blue-600" />;
      case 'GPS_TELEMETRY':
        return <MapPin className="w-3.5 h-3.5 text-purple-600" />;
      case 'MAINTENANCE_RECORD':
        return <Wrench className="w-3.5 h-3.5 text-emerald-600" />;
      default:
        return <Database className="w-3.5 h-3.5 text-slate-600" />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-xs animate-fade-in">
      <div className="w-full max-w-lg bg-white h-full shadow-2xl flex flex-col border-l border-slate-200">
        {/* Header */}
        <div className="p-5 border-b border-slate-200 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-orange-500/20 text-orange-400 border border-orange-500/30">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm">Envois en attente</h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Local Room Store
                </span>
              </div>
              <p className="text-xs text-slate-400">
                File d'attente locale des mises à jour & synchronisation réseau.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Network Status Toggle Switch Bar */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span
              className={`w-2.5 h-2.5 rounded-full ${isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`}
            ></span>
            <span className="font-bold text-slate-800">
              État Réseau : {isOnline ? 'Connecté (4G / Online)' : 'Hors-Ligne (Offline Mode)'}
            </span>
          </div>

          <button
            onClick={() => setIsOnline(!isOnline)}
            className={`px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 text-xs shadow-2xs cursor-pointer ${
              isOnline
                ? 'bg-red-50 hover:bg-red-100 text-red-700 border border-red-200'
                : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200'
            }`}
          >
            {isOnline ? (
              <WifiOff className="w-3.5 h-3.5 text-red-600" />
            ) : (
              <Wifi className="w-3.5 h-3.5 text-emerald-600" />
            )}
            {/* Bascule d'essai : elle coupe l'usage du réseau par
                l'application, sans toucher à la connexion du poste. */}
            <span>{isOnline ? 'Passer en mode hors-ligne' : 'Rétablir la connexion'}</span>
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center border-b border-slate-200 bg-white px-5 pt-3 gap-4 text-xs font-bold">
          <button
            onClick={() => setActiveTab('queue')}
            className={`pb-3 border-b-2 transition flex items-center gap-2 cursor-pointer ${
              activeTab === 'queue'
                ? 'border-orange-500 text-orange-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>File d’attente ({queueItems.length})</span>
            {pendingCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-orange-500 text-white text-[10px] font-mono font-extrabold">
                {pendingCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('entry')}
            className={`pb-3 border-b-2 transition flex items-center gap-2 cursor-pointer ${
              activeTab === 'entry'
                ? 'border-orange-500 text-orange-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Plus className="w-4 h-4" />
            {/* La saisie est réelle : elle rejoint la file et sera écrite en
                base à la reconnexion. */}
            <span>Ajouter une saisie à la file</span>
          </button>
        </div>

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {activeTab === 'queue' ? (
            <div className="space-y-4">
              {/* Top Sync Actions Header */}
              <div className="flex items-center justify-between gap-2">
                <button
                  onClick={triggerManualSync}
                  disabled={isSyncing || pendingCount === 0}
                  className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition shadow-xs cursor-pointer ${
                    isSyncing || pendingCount === 0
                      ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                      : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  }`}
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                  <span>
                    {isSyncing ? 'Synchronisation...' : `Synchroniser avec Backend (${pendingCount})`}
                  </span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    onClick={clearSyncedItems}
                    className="text-xs text-slate-500 hover:text-slate-800 font-medium border border-slate-200 rounded-lg px-2.5 py-1.5 hover:bg-slate-50 cursor-pointer"
                    title="Effacer éléments déjà synchronisés"
                  >
                    Purger Synchro
                  </button>
                  <button
                    onClick={clearAllQueue}
                    className="text-xs text-red-500 hover:text-red-700 font-medium border border-slate-200 rounded-lg px-2.5 py-1.5 hover:bg-slate-50 cursor-pointer"
                    title="Vider toute la file d’attente"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Queue Items List */}
              {queueItems.length === 0 ? (
                <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-2xl p-6 space-y-3">
                  <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
                  <div className="font-bold text-slate-800 text-sm">
                    File IndexedDB Complètement Synchronisée
                  </div>
                  <p className="text-xs text-slate-500 max-w-xs mx-auto">
                    Aucune mise à jour locale en attente. Toutes les saisies chauffeurs et télémétries ont été
                    envoyées au serveur.
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {queueItems.map(item => (
                    <div
                      key={item.id}
                      onClick={() =>
                        setSelectedItemPayload(selectedItemPayload?.id === item.id ? null : item)
                      }
                      className={`p-3.5 rounded-xl border transition cursor-pointer ${
                        item.status === 'PENDING'
                          ? 'bg-amber-50/50 border-amber-200 hover:border-amber-300'
                          : item.status === 'SYNCED'
                            ? 'bg-emerald-50/40 border-emerald-200 hover:border-emerald-300'
                            : item.status === 'SYNCING'
                              ? 'bg-blue-50/50 border-blue-200 animate-pulse'
                              : 'bg-red-50/50 border-red-200'
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span
                            className={`p-1.5 rounded-lg border flex items-center justify-center ${getBadgeColor(item.type)}`}
                          >
                            {getIcon(item.type)}
                          </span>
                          <div>
                            <div className="font-bold text-slate-900">{item.type}</div>
                            <div className="text-[10px] text-slate-500 font-mono">
                              {new Date(item.timestamp).toLocaleTimeString('fr-FR')} • ID:{' '}
                              {item.id.substr(0, 16)}...
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase border ${
                              item.status === 'PENDING'
                                ? 'bg-amber-100 text-amber-800 border-amber-300'
                                : item.status === 'SYNCED'
                                  ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                  : item.status === 'SYNCING'
                                    ? 'bg-blue-100 text-blue-800 border-blue-300'
                                    : 'bg-red-100 text-red-800 border-red-300'
                            }`}
                          >
                            {item.status}
                          </span>
                          <ChevronRight
                            className={`w-4 h-4 text-slate-400 transition ${selectedItemPayload?.id === item.id ? 'rotate-90' : ''}`}
                          />
                        </div>
                      </div>

                      {/* Payload Expanded View */}
                      {selectedItemPayload?.id === item.id && (
                        <div className="mt-3 pt-3 border-t border-slate-200 space-y-2 text-xs animate-fade-in">
                          <div className="font-bold text-slate-700 text-[11px] uppercase tracking-wider">
                            Données Chargement (Payload JSON) :
                          </div>
                          <pre className="bg-slate-900 text-emerald-400 p-3 rounded-lg font-mono text-[11px] overflow-x-auto max-h-40">
                            {JSON.stringify(item.payload, null, 2)}
                          </pre>
                          {item.errorMessage && (
                            <div className="text-[11px] text-red-600 font-medium bg-red-100 p-2 rounded">
                              Erreur: {item.errorMessage}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* Saisie de terrain — les champs partent vides, rien n'est pré-rempli. */
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-4 text-xs">
              <div>
                <h4 className="font-bold text-slate-900 text-sm mb-1">Enregistrer une saisie du terrain</h4>
                <p className="text-slate-500 leading-relaxed">
                  La saisie est conservée sur l’appareil puis écrite sur le serveur au retour du réseau. Rien
                  n’est pré-rempli : une valeur suggérée finirait enregistrée telle quelle.
                </p>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Type de saisie :</label>
                  <select
                    value={entryType}
                    onChange={e => {
                      setEntryType(e.target.value as typeof entryType);
                      setEntryError(null);
                      setEntryDone(null);
                    }}
                    className="w-full bg-white border border-slate-200 rounded-lg p-2 font-medium text-slate-800 focus:outline-none"
                  >
                    <option value="FUEL_LOG">Plein de carburant</option>
                    <option value="ODOMETER_UPDATE">Relevé de compteur</option>
                    <option value="MAINTENANCE_RECORD">Passage à l’atelier</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">Immatriculation :</label>
                  <input
                    type="text"
                    value={plate}
                    onChange={e => setPlate(e.target.value)}
                    placeholder="Ex : RB-1234-A"
                    className="w-full bg-white border border-slate-200 rounded-lg p-2 font-mono text-slate-800 focus:outline-none"
                  />
                </div>

                {entryType === 'FUEL_LOG' && (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-slate-700 font-bold mb-1">Litres :</label>
                        <input
                          type="number"
                          value={liters}
                          onChange={e => setLiters(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-lg p-2 font-mono text-slate-800 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-700 font-bold mb-1">Prix au litre :</label>
                        <input
                          type="number"
                          value={pricePerLiter}
                          onChange={e => setPricePerLiter(e.target.value)}
                          placeholder="facultatif"
                          className="w-full bg-white border border-slate-200 rounded-lg p-2 font-mono text-slate-800 focus:outline-none"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-slate-700 font-bold mb-1">
                        Compteur au moment du plein :
                      </label>
                      <input
                        type="number"
                        value={odometerKm}
                        onChange={e => setOdometerKm(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-lg p-2 font-mono text-slate-800 focus:outline-none"
                      />
                      <p className="mt-1 text-[10px] text-slate-500">
                        Obligatoire : la consommation se mesure d’un plein à l’autre, donc entre deux relevés
                        de compteur.
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-slate-700 font-bold mb-1">Station :</label>
                        <input
                          type="text"
                          value={stationName}
                          onChange={e => setStationName(e.target.value)}
                          placeholder="facultatif"
                          className="w-full bg-white border border-slate-200 rounded-lg p-2 text-slate-800 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-700 font-bold mb-1">N° de reçu :</label>
                        <input
                          type="text"
                          value={receiptNumber}
                          onChange={e => setReceiptNumber(e.target.value)}
                          placeholder="facultatif"
                          className="w-full bg-white border border-slate-200 rounded-lg p-2 font-mono text-slate-800 focus:outline-none"
                        />
                      </div>
                    </div>
                  </>
                )}

                {entryType === 'ODOMETER_UPDATE' && (
                  <div>
                    <label className="block text-slate-700 font-bold mb-1">
                      Nouveau relevé de compteur :
                    </label>
                    <input
                      type="number"
                      value={odometerKm}
                      onChange={e => setOdometerKm(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-lg p-2 font-mono text-slate-800 focus:outline-none"
                    />
                  </div>
                )}

                {entryType === 'MAINTENANCE_RECORD' && (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-slate-700 font-bold mb-1">Intervention :</label>
                      <input
                        type="text"
                        value={maintenanceLabel}
                        onChange={e => setMaintenanceLabel(e.target.value)}
                        placeholder="Ex : vidange"
                        className="w-full bg-white border border-slate-200 rounded-lg p-2 text-slate-800 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-700 font-bold mb-1">Coût :</label>
                      <input
                        type="number"
                        value={maintenanceCost}
                        onChange={e => setMaintenanceCost(e.target.value)}
                        placeholder="facultatif"
                        className="w-full bg-white border border-slate-200 rounded-lg p-2 font-mono text-slate-800 focus:outline-none"
                      />
                    </div>
                  </div>
                )}

                {entryError && (
                  <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-lg p-2.5 font-semibold">
                    {entryError}
                  </div>
                )}

                {entryDone && (
                  <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg p-2.5 font-semibold">
                    {entryDone}
                  </div>
                )}

                <button
                  onClick={handleAddEntry}
                  className="w-full py-2.5 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition cursor-pointer shadow-xs"
                >
                  <Plus className="w-4 h-4" />
                  <span>Enregistrer la saisie</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer Info */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 text-[11px] text-slate-500 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Les saisies sont conservées sur l’appareil tant que le réseau manque.</span>
          </div>
          <button onClick={onClose} className="font-bold text-slate-700 hover:underline cursor-pointer">
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
};
