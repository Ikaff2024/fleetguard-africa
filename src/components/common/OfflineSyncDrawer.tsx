import React, { useState } from 'react';
import { useOfflineSync } from '../../context/OfflineSyncContext';
import { 
  Database, 
  Wifi, 
  WifiOff, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle, 
  Trash2, 
  X, 
  Plus, 
  Clock, 
  Send, 
  Layers, 
  Zap,
  ChevronRight,
  ShieldCheck,
  Fuel,
  Truck,
  MapPin,
  Wrench
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
    lastSyncReport,
    enqueueUpdate,
    triggerManualSync,
    clearSyncedItems,
    clearAllQueue,
  } = useOfflineSync();

  const [activeTab, setActiveTab] = useState<'queue' | 'simulator'>('queue');
  const [selectedItemPayload, setSelectedItemPayload] = useState<any | null>(null);

  // Simulation form states
  const [simType, setSimType] = useState<'FUEL_LOG' | 'ODOMETER_UPDATE' | 'GPS_TELEMETRY' | 'MAINTENANCE_RECORD'>('FUEL_LOG');
  const [simVehicleReg, setSimVehicleReg] = useState<string>('RB-4592-A');
  const [simValue, setSimValue] = useState<string>('120');

  if (!isOpen) return null;

  const handleSimulateOfflineEnqueue = async () => {
    let payload: Record<string, any> = {};

    if (simType === 'FUEL_LOG') {
      payload = {
        vehicleRegistration: simVehicleReg,
        stationName: 'Station Total Parakou Nord',
        litersAdded: Number(simValue) || 150,
        pricePerLiter: 650,
        totalCost: (Number(simValue) || 150) * 650,
        receiptNumber: `REC_OFFLINE_${Date.now().toString().substr(-5)}`,
        loggedByOfflineDriver: 'Moussa Diop',
      };
    } else if (simType === 'ODOMETER_UPDATE') {
      payload = {
        vehicleRegistration: simVehicleReg,
        newOdometerKm: Number(simValue) || 284500,
        reason: 'Contrôle à l\'arrivée au dépôt Parakou',
        recordedAt: new Date().toISOString(),
      };
    } else if (simType === 'GPS_TELEMETRY') {
      payload = {
        vehicleRegistration: simVehicleReg,
        batchPointsCount: 42,
        gpsCoordinates: [
          { lat: 9.337, lng: 2.63, speedKmH: 78, timestamp: new Date().toISOString() },
          { lat: 9.345, lng: 2.64, speedKmH: 82, timestamp: new Date().toISOString() },
        ],
      };
    } else if (simType === 'MAINTENANCE_RECORD') {
      payload = {
        vehicleRegistration: simVehicleReg,
        type: 'Vidange & Filtres Huile Diesel',
        cost: 145000,
        currency: 'FCFA',
        garageName: 'Atelier Central Cotonou',
      };
    }

    await enqueueUpdate(simType, payload, currentOrgId);
  };

  const getBadgeColor = (type: string) => {
    switch (type) {
      case 'FUEL_LOG': return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'ODOMETER_UPDATE': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'GPS_TELEMETRY': return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'MAINTENANCE_RECORD': return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      default: return 'bg-slate-100 text-slate-800 border-slate-200';
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'FUEL_LOG': return <Fuel className="w-3.5 h-3.5 text-amber-600" />;
      case 'ODOMETER_UPDATE': return <Truck className="w-3.5 h-3.5 text-blue-600" />;
      case 'GPS_TELEMETRY': return <MapPin className="w-3.5 h-3.5 text-purple-600" />;
      case 'MAINTENANCE_RECORD': return <Wrench className="w-3.5 h-3.5 text-emerald-600" />;
      default: return <Database className="w-3.5 h-3.5 text-slate-600" />;
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
                <h3 className="font-bold text-sm">Gestionnaire Offline IndexedDB</h3>
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
            <span className={`w-2.5 h-2.5 rounded-full ${isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`}></span>
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
            {isOnline ? <WifiOff className="w-3.5 h-3.5 text-red-600" /> : <Wifi className="w-3.5 h-3.5 text-emerald-600" />}
            <span>{isOnline ? 'Simuler Mode Hors-Ligne' : 'Rétablir Connexion (Online)'}</span>
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
            <span>File IndexedDB ({queueItems.length})</span>
            {pendingCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-orange-500 text-white text-[10px] font-mono font-extrabold">
                {pendingCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('simulator')}
            className={`pb-3 border-b-2 transition flex items-center gap-2 cursor-pointer ${
              activeTab === 'simulator'
                ? 'border-orange-500 text-orange-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Plus className="w-4 h-4" />
            <span>Simuler Saisie Hors-Ligne</span>
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
                  <span>{isSyncing ? 'Synchronisation...' : `Synchroniser avec Backend (${pendingCount})`}</span>
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
                    title="Vider toute la file IndexedDB"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Queue Items List */}
              {queueItems.length === 0 ? (
                <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-2xl p-6 space-y-3">
                  <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
                  <div className="font-bold text-slate-800 text-sm">File IndexedDB Complètement Synchronisée</div>
                  <p className="text-xs text-slate-500 max-w-xs mx-auto">
                    Aucune mise à jour locale en attente. Toutes les saisies chauffeurs et télémétries ont été envoyées au serveur.
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {queueItems.map(item => (
                    <div
                      key={item.id}
                      onClick={() => setSelectedItemPayload(selectedItemPayload?.id === item.id ? null : item)}
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
                          <span className={`p-1.5 rounded-lg border flex items-center justify-center ${getBadgeColor(item.type)}`}>
                            {getIcon(item.type)}
                          </span>
                          <div>
                            <div className="font-bold text-slate-900">{item.type}</div>
                            <div className="text-[10px] text-slate-500 font-mono">
                              {new Date(item.timestamp).toLocaleTimeString('fr-FR')} • ID: {item.id.substr(0, 16)}...
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
                          <ChevronRight className={`w-4 h-4 text-slate-400 transition ${selectedItemPayload?.id === item.id ? 'rotate-90' : ''}`} />
                        </div>
                      </div>

                      {/* Payload Expanded View */}
                      {selectedItemPayload?.id === item.id && (
                        <div className="mt-3 pt-3 border-t border-slate-200 space-y-2 text-xs animate-fade-in">
                          <div className="font-bold text-slate-700 text-[11px] uppercase tracking-wider">Données Chargement (Payload JSON) :</div>
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
            /* Simulator View */
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-4 text-xs">
              <div>
                <h4 className="font-bold text-slate-900 text-sm mb-1">
                  Simulateur de Saisie Chauffeur / Télémétrie Hors-Ligne
                </h4>
                <p className="text-slate-500">
                  Insère directement un événement dans la base local IndexedDB pour vérifier la mise en attente et la reprise de réseau.
                </p>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Type d'Événement :</label>
                  <select
                    value={simType}
                    onChange={e => setSimType(e.target.value as any)}
                    className="w-full bg-white border border-slate-200 rounded-lg p-2 font-medium text-slate-800 focus:outline-none"
                  >
                    <option value="FUEL_LOG">Ravitaillement Carburant (Fuel Log)</option>
                    <option value="ODOMETER_UPDATE">Relevé Odomètre Camion</option>
                    <option value="GPS_TELEMETRY">Paquet Télémétrie GPS (Batch)</option>
                    <option value="MAINTENANCE_RECORD">Intervention Garage / Entretien</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">Immatriculation Véhicule :</label>
                  <input
                    type="text"
                    value={simVehicleReg}
                    onChange={e => setSimVehicleReg(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-lg p-2 font-mono text-slate-800 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">
                    {simType === 'FUEL_LOG' ? 'Litres Ajoutés (L)' : simType === 'ODOMETER_UPDATE' ? 'Nouveau Km Odomètre' : 'Valeur indicative'} :
                  </label>
                  <input
                    type="number"
                    value={simValue}
                    onChange={e => setSimValue(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-lg p-2 font-mono text-slate-800 focus:outline-none"
                  />
                </div>

                <button
                  onClick={handleSimulateOfflineEnqueue}
                  className="w-full py-2.5 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition cursor-pointer shadow-xs"
                >
                  <Plus className="w-4 h-4" />
                  <span>Ajouter dans IndexedDB Local</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer Info */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 text-[11px] text-slate-500 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Tolérance aux Pannes & Persistance Réseau Garanties</span>
          </div>
          <button onClick={onClose} className="font-bold text-slate-700 hover:underline cursor-pointer">
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
};
