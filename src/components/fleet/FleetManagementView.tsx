import React, { useState } from 'react';
import {
  useComplianceDocs,
  useDrivers,
  useFuelLogs,
  useMaintenanceLogs,
  useVehicles,
} from '../../hooks/useFleetData';
import { Organization } from '../../types';
import {
  Truck,
  Users,
  Wrench,
  Fuel,
  FileCheck,
  ShieldAlert,
  Plus,
  MapPin,
  BellRing,
  Database,
  CheckCircle2,
  Printer,
  LayoutDashboard,
} from 'lucide-react';
import { GeofenceConfigPanel } from './GeofenceConfigPanel';
import { FleetOverviewDashboard } from './FleetOverviewDashboard';
import { FleetComplianceTracker } from './FleetComplianceTracker';
import { DriverManagement } from '../drivers/DriverManagement';
import { useOfflineSync } from '../../context/OfflineSyncContext';
import { PrintableReportModal } from '../common/PrintableReportModal';
import { VehicleFormModal } from './VehicleFormModal';
import { DriverFormModal } from '../drivers/DriverFormModal';

interface FleetManagementViewProps {
  currentOrg: Organization;
}

export const FleetManagementView: React.FC<FleetManagementViewProps> = ({ currentOrg }) => {
  const complianceQuery = useComplianceDocs();
  const driversQuery = useDrivers();
  const fuelQuery = useFuelLogs();
  const maintenanceQuery = useMaintenanceLogs();
  const vehiclesQuery = useVehicles();
  const [activeSubTab, setActiveSubTab] = useState<
    'overview' | 'vehicles' | 'drivers' | 'geofencing' | 'maintenance' | 'fuel' | 'compliance'
  >('overview');
  /**
   * Saisie de la flotte.
   *
   * C'est ce qui permet à un nouveau client de démarrer seul. Le bouton
   * existait mais n'ouvrait rien : intégrer un transporteur supposait
   * d'exécuter du SQL à sa place.
   */
  const [vehicleForm, setVehicleForm] = useState<{ open: boolean }>({ open: false });
  const [driverForm, setDriverForm] = useState<{ open: boolean }>({ open: false });

  const [showAddFuelModal, setShowAddFuelModal] = useState<boolean>(false);
  const [showPrintMaintenanceModal, setShowPrintMaintenanceModal] = useState<boolean>(false);

  // New Fuel Form State
  const [stationName, setStationName] = useState<string>('Station Total Cotonou Haie Vive');
  const [vehicleReg, setVehicleReg] = useState<string>('RB-4592-A');
  const [liters, setLiters] = useState<number>(180);
  const [pricePerL, setPricePerL] = useState<number>(650);

  const { enqueueUpdate, isOnline } = useOfflineSync();

  const vehicles = vehiclesQuery.data ?? [];
  const drivers = driversQuery.data ?? [];
  const maintenance = maintenanceQuery.data ?? [];
  const fuelLogs = fuelQuery.data ?? [];
  const compliance = complianceQuery.data ?? [];

  const handleAddFuelLogSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    await enqueueUpdate(
      'FUEL_LOG',
      {
        vehicleRegistration: vehicleReg,
        stationName,
        litersAdded: liters,
        pricePerLiter: pricePerL,
        totalCost: liters * pricePerL,
        receiptNumber: `REC_OFF_${Date.now().toString().substr(-6)}`,
        loggedAt: new Date().toISOString(),
        currency: currentOrg.currency,
      },
      currentOrg.id,
    );

    setShowAddFuelModal(false);
  };

  return (
    <div className="space-y-6">
      {vehicleForm.open && (
        <VehicleFormModal onClose={() => setVehicleForm({ open: false })} onSaved={vehiclesQuery.reload} />
      )}

      {driverForm.open && (
        <DriverFormModal
          vehicles={vehicles}
          onClose={() => setDriverForm({ open: false })}
          onSaved={driversQuery.reload}
        />
      )}

      {/* Top Banner */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-wrap items-center justify-between gap-4 shadow-xs">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Gestion de Flotte & Opérations</h2>
          <p className="text-xs text-slate-500 mt-1">
            Suivi des camions, chauffeurs, zones géofencées, carnets d'entretien, ravitaillements et
            conformités (CEDEAO / EAC).
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowPrintMaintenanceModal(true)}
            className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 transition shadow-xs cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>Imprimer Planning Maintenance</span>
          </button>

          {activeSubTab === 'geofencing' ? (
            <button
              onClick={() => setActiveSubTab('geofencing')}
              className="px-3.5 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs flex items-center gap-1.5 transition shadow-xs cursor-pointer"
            >
              <BellRing className="w-4 h-4" />
              <span>Périmètres & Notifications Actives</span>
            </button>
          ) : (
            <button
              onClick={() =>
                activeSubTab === 'drivers' ? setDriverForm({ open: true }) : setVehicleForm({ open: true })
              }
              className="px-3.5 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs flex items-center gap-1.5 transition shadow-xs cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>{activeSubTab === 'drivers' ? 'Ajouter un chauffeur' : 'Ajouter un véhicule'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Sub Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2 overflow-x-auto">
        <button
          onClick={() => setActiveSubTab('overview')}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 border cursor-pointer ${
            activeSubTab === 'overview'
              ? 'bg-orange-50 text-orange-600 border-orange-300 shadow-2xs'
              : 'bg-white text-slate-600 border-slate-200 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <LayoutDashboard className="w-4 h-4 text-orange-500" />
          <span>Vue d'ensemble</span>
        </button>

        <button
          onClick={() => setActiveSubTab('vehicles')}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 border cursor-pointer ${
            activeSubTab === 'vehicles'
              ? 'bg-orange-50 text-orange-600 border-orange-300 shadow-2xs'
              : 'bg-white text-slate-600 border-slate-200 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <Truck className="w-4 h-4 text-orange-500" />
          <span>Véhicules ({vehicles.length})</span>
        </button>

        <button
          onClick={() => setActiveSubTab('drivers')}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 border cursor-pointer ${
            activeSubTab === 'drivers'
              ? 'bg-orange-50 text-orange-600 border-orange-300 shadow-2xs'
              : 'bg-white text-slate-600 border-slate-200 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <Users className="w-4 h-4 text-orange-500" />
          <span>Chauffeurs ({drivers.length})</span>
        </button>

        <button
          onClick={() => setActiveSubTab('geofencing')}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 border cursor-pointer ${
            activeSubTab === 'geofencing'
              ? 'bg-orange-50 text-orange-600 border-orange-300 shadow-2xs'
              : 'bg-white text-slate-600 border-slate-200 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <MapPin className="w-4 h-4 text-orange-500" />
          <span>Géofencing & Alerte Zones</span>
        </button>

        <button
          onClick={() => setActiveSubTab('maintenance')}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 border cursor-pointer ${
            activeSubTab === 'maintenance'
              ? 'bg-orange-50 text-orange-600 border-orange-300 shadow-2xs'
              : 'bg-white text-slate-600 border-slate-200 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <Wrench className="w-4 h-4 text-orange-500" />
          <span>Maintenance ({maintenance.length})</span>
        </button>

        <button
          onClick={() => setActiveSubTab('fuel')}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 border cursor-pointer ${
            activeSubTab === 'fuel'
              ? 'bg-orange-50 text-orange-600 border-orange-300 shadow-2xs'
              : 'bg-white text-slate-600 border-slate-200 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <Fuel className="w-4 h-4 text-orange-500" />
          <span>Ravitaillement Carburant ({fuelLogs.length})</span>
        </button>

        <button
          onClick={() => setActiveSubTab('compliance')}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 border cursor-pointer ${
            activeSubTab === 'compliance'
              ? 'bg-orange-50 text-orange-600 border-orange-300 shadow-2xs'
              : 'bg-white text-slate-600 border-slate-200 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <FileCheck className="w-4 h-4 text-orange-500" />
          <span>Conformité & Assurances ({compliance.length})</span>
        </button>
      </div>

      {/* Content per subtab */}
      {activeSubTab === 'overview' ? (
        <FleetOverviewDashboard currentOrg={currentOrg} />
      ) : activeSubTab === 'geofencing' ? (
        <GeofenceConfigPanel currentOrg={currentOrg} />
      ) : activeSubTab === 'drivers' ? (
        <DriverManagement currentOrg={currentOrg} />
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs">
          {activeSubTab === 'vehicles' && (
            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase text-[10px]">
                    <th className="p-3 font-bold">Immatriculation</th>
                    <th className="p-3 font-bold">Marque & Modèle</th>
                    <th className="p-3 font-bold">Type</th>
                    <th className="p-3 font-bold">Odomètre (km)</th>
                    <th className="p-3 font-bold">Réservoir (L)</th>
                    <th className="p-3 font-bold">Chauffeur Assigné</th>
                    <th className="p-3 font-bold">Statut</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-800 bg-white">
                  {vehicles.map(v => {
                    const driver = drivers.find(d => d.id === v.currentDriverId);
                    return (
                      <tr key={v.id} className="hover:bg-slate-50/80 transition">
                        <td className="p-3 font-mono font-bold text-orange-600">{v.immatriculation}</td>
                        <td className="p-3 font-semibold">
                          {v.make} {v.model} ({v.year})
                        </td>
                        <td className="p-3 text-slate-500">{v.type}</td>
                        <td className="p-3 font-mono">{v.currentOdometerKm.toLocaleString()} km</td>
                        <td className="p-3 font-mono">
                          {v.tankCapacityLiters} L ({v.expectedConsumptionL100km} L/100km)
                        </td>
                        <td className="p-3 font-medium text-slate-700">
                          {driver?.fullName || 'Non assigné'}
                        </td>
                        <td className="p-3">
                          <span
                            className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                              v.status === 'ACTIVE'
                                ? 'bg-green-50 text-green-700 border border-green-200'
                                : 'bg-orange-50 text-orange-700 border border-orange-200'
                            }`}
                          >
                            {v.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {activeSubTab === 'maintenance' && (
            <div className="space-y-3">
              {maintenance.map(m => (
                <div
                  key={m.id}
                  className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex items-start justify-between gap-4"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs text-slate-900">{m.type}</span>
                      <span className="text-[10px] bg-white border border-slate-200 px-2 py-0.5 rounded text-slate-600 font-mono font-bold">
                        {m.performedAt}
                      </span>
                    </div>
                    <p className="text-xs text-slate-700 mt-1">{m.description}</p>
                    <p className="text-[11px] text-slate-500 mt-1">Fournisseur: {m.serviceProvider}</p>
                  </div>
                  <div className="text-right">
                    <div className="font-mono font-bold text-orange-600 text-sm">
                      {m.cost.toLocaleString()} {m.currency}
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200 font-bold">
                      {m.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeSubTab === 'fuel' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between bg-slate-50 border border-slate-200 p-3.5 rounded-xl">
                <div>
                  <h4 className="font-bold text-xs text-slate-900">Saisie Ravitaillements Carburant</h4>
                  <p className="text-[11px] text-slate-500">
                    Les saisies effectuées hors-ligne sont immédiatement temporisées dans IndexedDB
                    localement.
                  </p>
                </div>
                <button
                  onClick={() => setShowAddFuelModal(true)}
                  className="px-3.5 py-2 bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs rounded-lg flex items-center gap-1.5 transition shadow-xs cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Saisir Ravitaillement</span>
                </button>
              </div>

              {/* Modal overlay */}
              {showAddFuelModal && (
                <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
                  <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                      <div className="flex items-center gap-2">
                        <Fuel className="w-5 h-5 text-orange-500" />
                        <h3 className="font-bold text-sm text-slate-900">
                          Nouveau Ravitaillement (Plein Carburant)
                        </h3>
                      </div>
                      <button
                        onClick={() => setShowAddFuelModal(false)}
                        className="text-slate-400 hover:text-slate-600"
                      >
                        ✕
                      </button>
                    </div>

                    {!isOnline && (
                      <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex items-center gap-2">
                        <Database className="w-4 h-4 text-amber-600 shrink-0" />
                        <span>
                          Mode Hors-Ligne : La saisie sera enregistrée dans <strong>IndexedDB</strong> et
                          synchronisée ultérieurement.
                        </span>
                      </div>
                    )}

                    <form onSubmit={handleAddFuelLogSubmit} className="space-y-3 text-xs">
                      <div>
                        <label className="block font-bold text-slate-700 mb-1">
                          Station Service / Lieu :
                        </label>
                        <input
                          type="text"
                          value={stationName}
                          onChange={e => setStationName(e.target.value)}
                          required
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-medium"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block font-bold text-slate-700 mb-1">Véhicule :</label>
                          <select
                            value={vehicleReg}
                            onChange={e => setVehicleReg(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-bold"
                          >
                            {vehicles.map(v => (
                              <option key={v.id} value={v.immatriculation}>
                                {v.immatriculation} ({v.make})
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block font-bold text-slate-700 mb-1">Quantité (Litres) :</label>
                          <input
                            type="number"
                            value={liters}
                            onChange={e => setLiters(Number(e.target.value))}
                            required
                            min={10}
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-mono font-bold"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block font-bold text-slate-700 mb-1">
                          Prix Unitaire par Litre ({currentOrg.currency}) :
                        </label>
                        <input
                          type="number"
                          value={pricePerL}
                          onChange={e => setPricePerL(Number(e.target.value))}
                          required
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-mono font-bold"
                        />
                      </div>

                      <div className="pt-2 flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setShowAddFuelModal(false)}
                          className="px-4 py-2 bg-slate-100 text-slate-700 font-bold rounded-lg hover:bg-slate-200"
                        >
                          Annuler
                        </button>
                        <button
                          type="submit"
                          className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-lg flex items-center gap-1.5"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Enregistrer ({isOnline ? 'Direct' : 'IndexedDB Local'})</span>
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}

              {fuelLogs.map(f => (
                <div
                  key={f.id}
                  className={`p-4 rounded-xl border ${f.suspectedFuelTheft ? 'border-red-300 bg-red-50/60' : 'border-slate-200 bg-slate-50'} flex items-center justify-between gap-4`}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs text-slate-900">{f.stationName}</span>
                      <span className="text-[10px] text-slate-500 font-mono">Reçu #{f.receiptNumber}</span>
                    </div>
                    <div className="text-xs text-slate-700 mt-1">
                      Quantité : <strong className="text-orange-600 font-mono">{f.litersAdded} L</strong> à{' '}
                      {f.pricePerLiter} {f.currency}/L
                    </div>
                    {f.calculatedL100km && (
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        Consommation mesurée :{' '}
                        <strong
                          className={f.suspectedFuelTheft ? 'text-red-600 font-bold' : 'text-green-600'}
                        >
                          {f.calculatedL100km} L/100km
                        </strong>
                      </div>
                    )}
                  </div>

                  <div className="text-right">
                    <div className="font-mono font-bold text-slate-900 text-sm">
                      {f.totalCost.toLocaleString()} {f.currency}
                    </div>
                    {f.suspectedFuelTheft && (
                      <span className="text-[10px] px-2 py-0.5 rounded bg-red-100 text-red-700 border border-red-200 font-bold flex items-center gap-1 mt-1">
                        <ShieldAlert className="w-3 h-3 text-red-600" />
                        Alerte Vol Carburant
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeSubTab === 'compliance' && <FleetComplianceTracker currentOrg={currentOrg} />}
        </div>
      )}

      {/* Printable Maintenance Schedule Modal */}
      <PrintableReportModal
        isOpen={showPrintMaintenanceModal}
        onClose={() => setShowPrintMaintenanceModal(false)}
        title="PLANNING DE MAINTENANCE PRÉVENTIVE & REVISIONS TECHNIQUES"
        subtitle={`Organisme: ${currentOrg.name} (${currentOrg.code}) • Carnet d'Entretien Officiel Flotte`}
        currentOrg={currentOrg}
        reportCategory="MAINTENANCE"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3 text-center border-y border-slate-300 py-3 bg-slate-50 font-mono">
            <div>
              <div className="text-[10px] text-slate-500 uppercase">Total Camions Suivis</div>
              <div className="font-extrabold text-slate-900 text-sm">{vehicles.length}</div>
            </div>
            <div>
              <div className="text-[10px] text-slate-500 uppercase">Opérations Maintenance</div>
              <div className="font-extrabold text-amber-600 text-sm">{maintenance.length}</div>
            </div>
            <div>
              <div className="text-[10px] text-slate-500 uppercase">Documents Conformité</div>
              <div className="font-extrabold text-emerald-600 text-sm">{compliance.length}</div>
            </div>
          </div>

          <div>
            <h3 className="font-bold text-xs uppercase text-slate-800 mb-2">
              Historique des Interventions Ateliers
            </h3>
            <table className="w-full text-left text-[11px] border border-slate-300">
              <thead className="bg-slate-100 font-bold border-b border-slate-300">
                <tr>
                  <th className="p-2 border-r border-slate-300">Date Intervention</th>
                  <th className="p-2 border-r border-slate-300">Type de Service</th>
                  <th className="p-2 border-r border-slate-300">Description & Pièces Remplacées</th>
                  <th className="p-2 border-r border-slate-300">Prestataire / Garage</th>
                  <th className="p-2 border-r border-slate-300 text-right">Coût Total</th>
                  <th className="p-2 text-center">Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {maintenance.map(m => (
                  <tr key={m.id}>
                    <td className="p-2 border-r border-slate-300 font-mono text-[10px]">{m.performedAt}</td>
                    <td className="p-2 border-r border-slate-300 font-bold">{m.type}</td>
                    <td className="p-2 border-r border-slate-300 text-slate-700">{m.description}</td>
                    <td className="p-2 border-r border-slate-300 font-semibold">{m.serviceProvider}</td>
                    <td className="p-2 border-r border-slate-300 text-right font-mono font-bold text-amber-700">
                      {m.cost.toLocaleString()} {m.currency}
                    </td>
                    <td className="p-2 text-center font-bold text-[10px]">{m.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div>
            <h3 className="font-bold text-xs uppercase text-slate-800 mb-2">
              Statut du Parcs de Véhicules & Odomètres
            </h3>
            <table className="w-full text-left text-[11px] border border-slate-300">
              <thead className="bg-slate-100 font-bold border-b border-slate-300">
                <tr>
                  <th className="p-2 border-r border-slate-300">Immatriculation</th>
                  <th className="p-2 border-r border-slate-300">Marque & Modèle</th>
                  <th className="p-2 border-r border-slate-300 text-right">Kilométrage Actuel (km)</th>
                  <th className="p-2 text-center">Statut Exploitation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {vehicles.map(v => (
                  <tr key={v.id}>
                    <td className="p-2 border-r border-slate-300 font-mono font-bold text-orange-700">
                      {v.immatriculation}
                    </td>
                    <td className="p-2 border-r border-slate-300 font-semibold">
                      {v.make} {v.model} ({v.year})
                    </td>
                    <td className="p-2 border-r border-slate-300 text-right font-mono font-bold">
                      {v.currentOdometerKm.toLocaleString()} km
                    </td>
                    <td className="p-2 text-center font-bold text-[10px]">{v.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </PrintableReportModal>
    </div>
  );
};
