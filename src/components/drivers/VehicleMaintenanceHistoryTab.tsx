import React, { useState, useMemo } from 'react';
import { Organization, MaintenanceLog } from '../../types';
import { MOCK_MAINTENANCE_LOGS, MOCK_VEHICLES, MOCK_DRIVERS } from '../../data/mock-data';
import {
  Wrench,
  Search,
  Calendar,
  Clock,
  CheckCircle2,
  AlertTriangle,
  FileText,
  UserCheck,
  Package,
  Plus,
  Truck,
  Printer,
  DollarSign,
  X
} from 'lucide-react';
import { PrintableReportModal } from '../common/PrintableReportModal';

interface VehicleMaintenanceHistoryTabProps {
  currentOrg: Organization;
}

export const VehicleMaintenanceHistoryTab: React.FC<VehicleMaintenanceHistoryTabProps> = ({
  currentOrg,
}) => {
  // Local state for logs
  const [logs, setLogs] = useState<MaintenanceLog[]>(() => {
    return MOCK_MAINTENANCE_LOGS.filter((m) => m.organizationId === currentOrg.id);
  });

  const vehicles = useMemo(() => {
    return MOCK_VEHICLES.filter((v) => v.organizationId === currentOrg.id);
  }, [currentOrg.id]);

  const drivers = useMemo(() => {
    return MOCK_DRIVERS.filter((d) => d.organizationId === currentOrg.id);
  }, [currentOrg.id]);

  // Filters state
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>('ALL');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('ALL');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>('ALL');

  // Modal State for adding new log
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [showPrintModal, setShowPrintModal] = useState<boolean>(false);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  // New log form state
  const [newVehicleId, setNewVehicleId] = useState<string>(vehicles[0]?.id || '');
  const [newType, setNewType] = useState<MaintenanceLog['type']>('PREVENTATIVE');
  const [newDescription, setNewDescription] = useState<string>('');
  const [newOdometer, setNewOdometer] = useState<number>(145000);
  const [newCost, setNewCost] = useState<number>(250000);
  const [newServiceProvider, setNewServiceProvider] = useState<string>('Atelier Interne TransAfrik');
  const [newDate, setNewDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [newStatus, setNewStatus] = useState<MaintenanceLog['status']>('COMPLETED');
  const [newTechName, setNewTechName] = useState<string>('Chef d\'Atelier Principal');
  const [newTechNotes, setNewTechNotes] = useState<string>('');

  // Part replacement temp state for new form
  const [partName, setPartName] = useState<string>('');
  const [partNumber, setPartNumber] = useState<string>('');
  const [partQty, setPartQty] = useState<number>(1);
  const [partUnitCost, setPartUnitCost] = useState<number>(15000);
  const [tempParts, setTempParts] = useState<{ partNumber: string; partName: string; quantity: number; unitCost: number }[]>([]);

  // Filtered logs calculation
  const filteredLogs = useMemo(() => {
    return logs.filter((m) => {
      const veh = vehicles.find((v) => v.id === m.vehicleId);
      const drv = drivers.find((d) => d.assignedVehicleId === m.vehicleId || d.id === veh?.currentDriverId);

      const matchesVehicle = selectedVehicleId === 'ALL' || m.vehicleId === selectedVehicleId;

      const matchesStatus =
        selectedStatusFilter === 'ALL' ||
        (selectedStatusFilter === 'UPCOMING' && (m.status === 'SCHEDULED' || m.status === 'IN_PROGRESS' || m.status === 'OVERDUE')) ||
        (selectedStatusFilter === 'COMPLETED' && m.status === 'COMPLETED') ||
        m.status === selectedStatusFilter;

      const matchesType = selectedTypeFilter === 'ALL' || m.type === selectedTypeFilter;

      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        m.description.toLowerCase().includes(q) ||
        m.serviceProvider.toLowerCase().includes(q) ||
        (m.technicianNotes && m.technicianNotes.toLowerCase().includes(q)) ||
        (m.technicianName && m.technicianName.toLowerCase().includes(q)) ||
        (veh && (veh.immatriculation.toLowerCase().includes(q) || veh.make.toLowerCase().includes(q) || veh.model.toLowerCase().includes(q))) ||
        (drv && drv.fullName.toLowerCase().includes(q)) ||
        (m.partsReplaced && m.partsReplaced.some((p) => p.partName.toLowerCase().includes(q) || p.partNumber.toLowerCase().includes(q)));

      return matchesVehicle && matchesStatus && matchesType && matchesSearch;
    });
  }, [logs, vehicles, drivers, selectedVehicleId, selectedStatusFilter, selectedTypeFilter, searchQuery]);

  // Statistics
  const totalCostFiltered = useMemo(() => {
    return filteredLogs.reduce((acc, l) => acc + l.cost, 0);
  }, [filteredLogs]);

  const totalPartsReplacedCount = useMemo(() => {
    return filteredLogs.reduce((acc, l) => {
      if (!l.partsReplaced) return acc;
      return acc + l.partsReplaced.reduce((sum, p) => sum + p.quantity, 0);
    }, 0);
  }, [filteredLogs]);

  const upcomingCount = useMemo(() => {
    return logs.filter((l) => l.status === 'SCHEDULED' || l.status === 'IN_PROGRESS' || l.status === 'OVERDUE').length;
  }, [logs]);

  const handleAddPart = () => {
    if (!partName.trim()) return;
    setTempParts((prev) => [
      ...prev,
      {
        partName: partName.trim(),
        partNumber: partNumber.trim() || `PART-${Date.now().toString().slice(-4)}`,
        quantity: Math.max(1, partQty),
        unitCost: Math.max(0, partUnitCost),
      },
    ]);
    setPartName('');
    setPartNumber('');
    setPartQty(1);
    setPartUnitCost(15000);
  };

  const handleRemovePart = (index: number) => {
    setTempParts((prev) => prev.filter((_, i) => i !== index));
  };

  const handleCreateLog = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newVehicleId || !newDescription.trim()) return;

    const created: MaintenanceLog = {
      id: `maint_${Date.now()}`,
      organizationId: currentOrg.id,
      vehicleId: newVehicleId,
      type: newType,
      description: newDescription.trim(),
      odometerKmAtService: newOdometer,
      cost: newCost,
      currency: currentOrg.currency || 'XOF',
      serviceProvider: newServiceProvider.trim() || 'Atelier Interne',
      performedAt: newDate,
      nextServiceKmDue: newOdometer + 15000,
      status: newStatus,
      technicianName: newTechName.trim() || 'Chef d\'Atelier',
      technicianNotes: newTechNotes.trim() || 'Entretien réalisé selon les normes constructeur.',
      partsReplaced: tempParts.length > 0 ? tempParts : undefined,
    };

    setLogs((prev) => [created, ...prev]);
    setShowAddModal(false);

    // Reset form
    setNewDescription('');
    setNewTechNotes('');
    setTempParts([]);
  };

  const getTypeBadge = (type: MaintenanceLog['type']) => {
    switch (type) {
      case 'PREVENTATIVE':
        return <span className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 text-[10px] font-bold px-2.5 py-0.5 rounded-full border border-emerald-300 dark:border-emerald-800">Préventive</span>;
      case 'CORRECTIVE':
        return <span className="bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300 text-[10px] font-bold px-2.5 py-0.5 rounded-full border border-rose-300 dark:border-rose-800">Corrective</span>;
      case 'TIRE_REPLACEMENT':
        return <span className="bg-indigo-100 text-indigo-800 dark:bg-indigo-950/80 dark:text-indigo-300 text-[10px] font-bold px-2.5 py-0.5 rounded-full border border-indigo-300 dark:border-indigo-800">Pneumatiques</span>;
      case 'OIL_CHANGE':
        return <span className="bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 text-[10px] font-bold px-2.5 py-0.5 rounded-full border border-amber-300 dark:border-amber-800">Vidange / Lubrifiant</span>;
      case 'BRAKE_SERVICE':
        return <span className="bg-purple-100 text-purple-800 dark:bg-purple-950/80 dark:text-purple-300 text-[10px] font-bold px-2.5 py-0.5 rounded-full border border-purple-300 dark:border-purple-800">Système de Freinage</span>;
      default:
        return <span className="bg-slate-100 text-slate-800 text-[10px] font-bold px-2.5 py-0.5 rounded-full">Entretien Général</span>;
    }
  };

  const getStatusBadge = (status: MaintenanceLog['status']) => {
    switch (status) {
      case 'COMPLETED':
        return (
          <span className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-bold text-xs px-2.5 py-1 rounded-lg border border-emerald-500/20 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>Réalisé (Passé)</span>
          </span>
        );
      case 'IN_PROGRESS':
        return (
          <span className="bg-sky-500/10 text-sky-700 dark:text-sky-400 font-bold text-xs px-2.5 py-1 rounded-lg border border-sky-500/20 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-sky-600 animate-spin" />
            <span>En Cours (Atelier)</span>
          </span>
        );
      case 'SCHEDULED':
        return (
          <span className="bg-amber-500/10 text-amber-700 dark:text-amber-400 font-bold text-xs px-2.5 py-1 rounded-lg border border-amber-500/20 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-amber-600" />
            <span>Programmé (A Venir)</span>
          </span>
        );
      case 'OVERDUE':
        return (
          <span className="bg-red-500/10 text-red-700 dark:text-red-400 font-bold text-xs px-2.5 py-1 rounded-lg border border-red-500/20 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-red-600 animate-bounce" />
            <span>En Retard (Urgente)</span>
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Summary & Actions Bar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-orange-600 text-xs font-bold uppercase tracking-wider mb-1">
            <Wrench className="w-4 h-4 text-orange-500" />
            <span>Gestion de Flotte • Carnet d'Entretien & Historique Renseigné</span>
          </div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <span>Historique Complète de Maintenance par Véhicule</span>
            <span className="bg-orange-100 text-orange-800 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border border-orange-200">
              {logs.length} Interventions Enregistrées
            </span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-2xl leading-relaxed">
            Journal détaillé des opérations passées et à venir: notes techniques des mécaniciens, rapports d'inspection, et pièces de rechange remplacées.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowPrintModal(true)}
            className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold text-xs flex items-center gap-2 transition cursor-pointer border border-slate-200 dark:border-slate-700"
          >
            <Printer className="w-4 h-4 text-slate-600 dark:text-slate-300" />
            <span>Imprimer Fiche Carnet</span>
          </button>

          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs flex items-center gap-2 transition shadow-md cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Enregistrer un Entretien / Note Technique</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Overview */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-xl shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs mb-1">
            <span className="font-medium">Total Interventions</span>
            <Wrench className="w-4 h-4 text-orange-500" />
          </div>
          <div className="text-2xl font-bold font-mono text-slate-900 dark:text-white">
            {filteredLogs.length}
          </div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
            {logs.filter((l) => l.status === 'COMPLETED').length} Passées • {upcomingCount} A Venir / Atelier
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-xl shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs mb-1">
            <span className="font-medium">Coût Cumulative Maint.</span>
            <DollarSign className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
            {totalCostFiltered.toLocaleString()} <span className="text-xs">{currentOrg.currency || 'XOF'}</span>
          </div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
            Budget pièces et main d'œuvre atelier
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-xl shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs mb-1">
            <span className="font-medium">Pièces Remplacées</span>
            <Package className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="text-2xl font-bold font-mono text-indigo-600 dark:text-indigo-400">
            {totalPartsReplacedCount} <span className="text-xs font-normal">unités</span>
          </div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
            Traçabilité pièces détachées & références
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-xl shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs mb-1">
            <span className="font-medium">Prochains Entretien Dus</span>
            <Clock className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-bold font-mono text-amber-600 dark:text-amber-400">
            {upcomingCount}
          </div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
            Planning révisions & visites préventives
          </div>
        </div>
      </div>

      {/* Filter & Search Toolbar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-xl shadow-xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Search Box */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Rechercher camion, pièce, note, mécanicien..."
              className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs focus:ring-2 focus:ring-orange-500 text-slate-900 dark:text-white placeholder-slate-400"
            />
          </div>

          {/* Vehicle Selector */}
          <div>
            <select
              value={selectedVehicleId}
              onChange={(e) => setSelectedVehicleId(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-semibold text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-orange-500"
            >
              <option value="ALL">Tous les Véhicules ({vehicles.length})</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.immatriculation} — {v.make} {v.model}
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <select
              value={selectedStatusFilter}
              onChange={(e) => setSelectedStatusFilter(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-semibold text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-orange-500"
            >
              <option value="ALL">Tous les Statuts (Passés & A Venir)</option>
              <option value="COMPLETED">Historique Passé (Complété)</option>
              <option value="UPCOMING">Maint. A Venir / En Atelier</option>
              <option value="IN_PROGRESS">En Cours (En Atelier)</option>
              <option value="SCHEDULED">Programmé (A Venir)</option>
              <option value="OVERDUE">En Retard (Attention)</option>
            </select>
          </div>

          {/* Service Type Filter */}
          <div>
            <select
              value={selectedTypeFilter}
              onChange={(e) => setSelectedTypeFilter(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-semibold text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-orange-500"
            >
              <option value="ALL">Tous les Types d'Entretien</option>
              <option value="PREVENTATIVE">Préventive</option>
              <option value="CORRECTIVE">Corrective</option>
              <option value="TIRE_REPLACEMENT">Pneumatiques</option>
              <option value="OIL_CHANGE">Vidange & Lubrifiants</option>
              <option value="BRAKE_SERVICE">Système de Freinage</option>
            </select>
          </div>
        </div>
      </div>

      {/* Maintenance Logs List */}
      <div className="space-y-4">
        {filteredLogs.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-12 text-center text-slate-500 dark:text-slate-400 space-y-3">
            <Wrench className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto" />
            <p className="font-bold text-sm">Aucun événement d'entretien ne correspond aux critères de recherche.</p>
            <p className="text-xs text-slate-400">Essayez de modifier vos filtres ou d'enregistrer une nouvelle fiche d'entretien.</p>
          </div>
        ) : (
          filteredLogs.map((log) => {
            const vehicle = vehicles.find((v) => v.id === log.vehicleId);
            const assignedDriver = drivers.find(
              (d) => d.assignedVehicleId === log.vehicleId || d.id === vehicle?.currentDriverId
            );
            const isExpanded = expandedLogId === log.id;

            return (
              <div
                key={log.id}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xs overflow-hidden transition hover:border-slate-300 dark:hover:border-slate-700"
              >
                {/* Main Card Header Bar */}
                <div className="p-5 flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/50">
                  <div className="flex items-start gap-3.5">
                    <div className="p-2.5 rounded-xl bg-orange-500/10 text-orange-600 dark:bg-orange-500/20 dark:text-orange-400 font-bold border border-orange-500/20 shrink-0 mt-0.5">
                      <Truck className="w-5 h-5" />
                    </div>

                    <div>
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="font-extrabold text-sm text-slate-900 dark:text-white font-mono">
                          {vehicle ? vehicle.immatriculation : 'Camion Non Spécifié'}
                        </span>
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          ({vehicle ? `${vehicle.make} ${vehicle.model}` : '-'})
                        </span>

                        {getTypeBadge(log.type)}
                        {getStatusBadge(log.status)}
                      </div>

                      <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                        {log.description}
                      </h3>

                      {assignedDriver && (
                        <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mt-1">
                          <UserCheck className="w-3.5 h-3.5 text-slate-400" />
                          <span>Conducteur Affecté: <strong>{assignedDriver.fullName}</strong> ({assignedDriver.licenseNumber})</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="text-lg font-extrabold font-mono text-slate-900 dark:text-white">
                      {log.cost.toLocaleString()} <span className="text-xs font-medium text-slate-500">{log.currency}</span>
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-end gap-1 mt-0.5 font-mono">
                      <Calendar className="w-3 h-3" />
                      <span>Date: {log.performedAt}</span>
                    </div>
                  </div>
                </div>

                {/* Sub Metadata Bar */}
                <div className="px-5 py-3 bg-white dark:bg-slate-900 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs font-mono border-b border-slate-100 dark:border-slate-800">
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-sans">Odomètre à l'Entretien</span>
                    <strong className="text-slate-800 dark:text-slate-200">{log.odometerKmAtService.toLocaleString()} km</strong>
                  </div>

                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-sans">Prochain Service Dû</span>
                    <strong className="text-orange-600 dark:text-orange-400">
                      {log.nextServiceKmDue ? `${log.nextServiceKmDue.toLocaleString()} km` : 'Non renseigné'}
                    </strong>
                  </div>

                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-sans">Prestataire / Garage</span>
                    <strong className="text-slate-800 dark:text-slate-200">{log.serviceProvider}</strong>
                  </div>

                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-sans">Technicien / Expert</span>
                    <strong className="text-slate-800 dark:text-slate-200">{log.technicianName || 'Non précisé'}</strong>
                  </div>
                </div>

                {/* Detailed Section: Technician Notes & Parts Replaced */}
                <div className="p-5 space-y-4">
                  {/* Technician Notes Box */}
                  {log.technicianNotes && (
                    <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 p-4 rounded-xl space-y-1">
                      <div className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-200">
                        <FileText className="w-4 h-4 text-orange-500" />
                        <span>Rapport & Notes Diagnostic du Mécanicien :</span>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed font-sans italic pl-6">
                        "{log.technicianNotes}"
                      </p>
                    </div>
                  )}

                  {/* Part Replacement Records Table */}
                  {log.partsReplaced && log.partsReplaced.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs font-bold text-slate-800 dark:text-slate-200">
                        <div className="flex items-center gap-1.5">
                          <Package className="w-4 h-4 text-indigo-500" />
                          <span>Pièces de Rechange Remplacées ({log.partsReplaced.length})</span>
                        </div>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                          Total Pièces: {log.partsReplaced.reduce((acc, p) => acc + p.quantity * p.unitCost, 0).toLocaleString()} {log.currency}
                        </span>
                      </div>

                      <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
                        <table className="w-full text-left text-xs font-mono">
                          <thead className="bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-800">
                            <tr>
                              <th className="p-2.5">Réf. Pièce</th>
                              <th className="p-2.5">Désignation / Modèle</th>
                              <th className="p-2.5 text-center">Qté</th>
                              <th className="p-2.5 text-right">Prix Unitaire</th>
                              <th className="p-2.5 text-right">Sous-Total</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-900">
                            {log.partsReplaced.map((part, idx) => (
                              <tr key={idx}>
                                <td className="p-2.5 text-orange-600 dark:text-orange-400 font-bold">{part.partNumber}</td>
                                <td className="p-2.5 font-sans font-medium">{part.partName}</td>
                                <td className="p-2.5 text-center font-bold">{part.quantity}</td>
                                <td className="p-2.5 text-right">{part.unitCost.toLocaleString()} {log.currency}</td>
                                <td className="p-2.5 text-right font-bold text-slate-900 dark:text-white">
                                  {(part.quantity * part.unitCost).toLocaleString()} {log.currency}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Modal: Enregistrer un Nouvel Entretien / Note Technique */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-5 my-8">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
              <div className="flex items-center gap-2">
                <Wrench className="w-5 h-5 text-orange-500" />
                <h3 className="font-bold text-base text-slate-900 dark:text-white">
                  Enregistrer une Intervention / Note de Maintenance
                </h3>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-lg transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateLog} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                    Véhicule Concerné *
                  </label>
                  <select
                    value={newVehicleId}
                    onChange={(e) => setNewVehicleId(e.target.value)}
                    required
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:ring-2 focus:ring-orange-500"
                  >
                    {vehicles.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.immatriculation} — {v.make} {v.model}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                    Type d'Intervention *
                  </label>
                  <select
                    value={newType}
                    onChange={(e) => setNewType(e.target.value as any)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:ring-2 focus:ring-orange-500"
                  >
                    <option value="PREVENTATIVE">Préventive (Visite périodique)</option>
                    <option value="CORRECTIVE">Corrective (Panne / Remplacement)</option>
                    <option value="TIRE_REPLACEMENT">Pneumatiques</option>
                    <option value="OIL_CHANGE">Vidange & Lubrifiants</option>
                    <option value="BRAKE_SERVICE">Système de Freinage</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                  Description de l'Intervention / Motif *
                </label>
                <input
                  type="text"
                  required
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="ex: Vidange 150 000 km, changement filtres et nettoyage étriers de frein"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                    Odomètre (km)
                  </label>
                  <input
                    type="number"
                    value={newOdometer}
                    onChange={(e) => setNewOdometer(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:ring-2 focus:ring-orange-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                    Coût Total ({currentOrg.currency || 'XOF'})
                  </label>
                  <input
                    type="number"
                    value={newCost}
                    onChange={(e) => setNewCost(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:ring-2 focus:ring-orange-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                    Statut de l'Opération
                  </label>
                  <select
                    value={newStatus}
                    onChange={(e) => setNewStatus(e.target.value as any)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:ring-2 focus:ring-orange-500 font-bold"
                  >
                    <option value="COMPLETED">Réalisé (Passé)</option>
                    <option value="IN_PROGRESS">En Cours (Atelier)</option>
                    <option value="SCHEDULED">Programmé (A Venir)</option>
                    <option value="OVERDUE">En Retard</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                    Prestataire / Garage
                  </label>
                  <input
                    type="text"
                    value={newServiceProvider}
                    onChange={(e) => setNewServiceProvider(e.target.value)}
                    placeholder="ex: Atelier Interne TransAfrik ou Garage CFAO"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:ring-2 focus:ring-orange-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                    Nom du Technicien / Chef d'Atelier
                  </label>
                  <input
                    type="text"
                    value={newTechName}
                    onChange={(e) => setNewTechName(e.target.value)}
                    placeholder="ex: Ousmane Traoré"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:ring-2 focus:ring-orange-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                  Notes Diagnostic & Remarques du Mécanicien
                </label>
                <textarea
                  rows={2}
                  value={newTechNotes}
                  onChange={(e) => setNewTechNotes(e.target.value)}
                  placeholder="Détail des vérifications, état des compresseurs, alertes ou préconisations..."
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:ring-2 focus:ring-orange-500"
                />
              </div>

              {/* Add Part Replacements Sub-Form */}
              <div className="border border-slate-200 dark:border-slate-800 p-3 rounded-xl space-y-3 bg-slate-50/50 dark:bg-slate-800/30">
                <span className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <Package className="w-4 h-4 text-indigo-500" />
                  <span>Ajouter des Pièces de Rechange Remplacées</span>
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                  <input
                    type="text"
                    placeholder="Nom pièce (ex: Filtre à Huile)"
                    value={partName}
                    onChange={(e) => setPartName(e.target.value)}
                    className="px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded text-slate-900 dark:text-white"
                  />
                  <input
                    type="text"
                    placeholder="Réf. pièce (ex: MB-A000180)"
                    value={partNumber}
                    onChange={(e) => setPartNumber(e.target.value)}
                    className="px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded text-slate-900 dark:text-white font-mono"
                  />
                  <input
                    type="number"
                    placeholder="Qté"
                    value={partQty}
                    onChange={(e) => setPartQty(Number(e.target.value))}
                    className="px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded text-slate-900 dark:text-white font-mono"
                  />
                  <button
                    type="button"
                    onClick={handleAddPart}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded flex items-center justify-center gap-1 cursor-pointer transition"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Ajouter Pièce</span>
                  </button>
                </div>

                {tempParts.length > 0 && (
                  <div className="space-y-1 pt-1">
                    {tempParts.map((p, idx) => (
                      <div key={idx} className="flex items-center justify-between bg-white dark:bg-slate-900 px-3 py-1.5 rounded border border-slate-200 dark:border-slate-700 font-mono">
                        <span><strong>{p.partName}</strong> ({p.partNumber}) x{p.quantity}</span>
                        <button
                          type="button"
                          onClick={() => handleRemovePart(idx)}
                          className="text-red-500 hover:text-red-700 font-bold"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold hover:bg-slate-200"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold shadow-md cursor-pointer"
                >
                  Valider & Enregistrer l'Entretien
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Printable Report Modal */}
      <PrintableReportModal
        isOpen={showPrintModal}
        onClose={() => setShowPrintModal(false)}
        title="CARNET HIERARCHIQUE D'ENTRETIEN & HISTORIQUE TECHNIQUE"
        subtitle={`Organisme: ${currentOrg.name} (${currentOrg.code}) • Synthèse Complète des Réparations et Pièces`}
        currentOrg={currentOrg}
        reportCategory="MAINTENANCE"
      >
        <div className="space-y-4">
          <table className="w-full text-left text-[11px] border border-slate-300">
            <thead className="bg-slate-100 font-bold border-b border-slate-300">
              <tr>
                <th className="p-2 border-r border-slate-300">Date / Statut</th>
                <th className="p-2 border-r border-slate-300">Camion</th>
                <th className="p-2 border-r border-slate-300">Intervention / Note Diagnostic</th>
                <th className="p-2 border-r border-slate-300">Garage / Mécanicien</th>
                <th className="p-2 text-right">Coût</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredLogs.map((m) => {
                const veh = vehicles.find((v) => v.id === m.vehicleId);
                return (
                  <tr key={m.id}>
                    <td className="p-2 border-r border-slate-300 font-mono text-[10px]">
                      <div>{m.performedAt}</div>
                      <div className="font-bold text-slate-800">[{m.status}]</div>
                    </td>
                    <td className="p-2 border-r border-slate-300 font-bold text-orange-700">
                      {veh ? veh.immatriculation : '-'}
                    </td>
                    <td className="p-2 border-r border-slate-300">
                      <div className="font-bold">{m.description}</div>
                      {m.technicianNotes && (
                        <div className="text-[10px] text-slate-600 italic">"{m.technicianNotes}"</div>
                      )}
                      {m.partsReplaced && (
                        <div className="text-[9px] text-indigo-800 font-mono mt-0.5">
                          Pièces: {m.partsReplaced.map((p) => `${p.partName} (x${p.quantity})`).join(', ')}
                        </div>
                      )}
                    </td>
                    <td className="p-2 border-r border-slate-300 text-[10px]">
                      <div>{m.serviceProvider}</div>
                      <div className="text-slate-500">{m.technicianName}</div>
                    </td>
                    <td className="p-2 text-right font-mono font-bold text-slate-900">
                      {m.cost.toLocaleString()} {m.currency}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </PrintableReportModal>
    </div>
  );
};
