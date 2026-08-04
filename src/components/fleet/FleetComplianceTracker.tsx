import React, { useState, useMemo } from 'react';
import { Organization, Vehicle, ComplianceDoc } from '../../types';
import { MOCK_VEHICLES, MOCK_COMPLIANCE_DOCS } from '../../data/mock-data';
import { ShieldCheck, AlertTriangle, FileText, Calendar, Plus, Filter, Search, Bell, Clock, FileWarning, CheckCircle2 } from 'lucide-react';

interface FleetComplianceTrackerProps {
  currentOrg: Organization;
}

export const FleetComplianceTracker: React.FC<FleetComplianceTrackerProps> = ({ currentOrg }) => {
  const vehicles = useMemo(() => MOCK_VEHICLES.filter(v => v.organizationId === currentOrg.id), [currentOrg.id]);
  const initialDocs = useMemo(() => MOCK_COMPLIANCE_DOCS.filter(d => d.organizationId === currentOrg.id), [currentOrg.id]);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedVehicle, setSelectedVehicle] = useState('ALL');
  const [selectedStatus, setSelectedStatus] = useState('ALL');
  const [selectedType, setSelectedType] = useState('ALL');

  // Filter compliance documents
  const filteredDocs = useMemo(() => {
    return initialDocs.filter(doc => {
      const vehicle = vehicles.find(v => v.id === doc.vehicleId);
      const matchesSearch = !searchQuery || 
        doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        doc.docNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (vehicle && vehicle.immatriculation.toLowerCase().includes(searchQuery.toLowerCase()));
      
      const matchesVehicle = selectedVehicle === 'ALL' || doc.vehicleId === selectedVehicle;
      const matchesStatus = selectedStatus === 'ALL' || doc.status === selectedStatus;
      const matchesType = selectedType === 'ALL' || doc.type === selectedType;

      return matchesSearch && matchesVehicle && matchesStatus && matchesType;
    });
  }, [initialDocs, vehicles, searchQuery, selectedVehicle, selectedStatus, selectedType]);

  const getStatusBadge = (status: ComplianceDoc['status'], expiryDate: string) => {
    const today = new Date();
    const expiry = new Date(expiryDate);
    const diffDays = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 3600 * 24));

    if (status === 'EXPIRED' || diffDays < 0) {
      return (
        <span className="px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider bg-red-100 text-red-700 border border-red-200 flex items-center gap-1">
          <FileWarning className="w-3.5 h-3.5" /> Expiré
        </span>
      );
    }
    if (status === 'EXPIRING_SOON' || diffDays <= 30) {
      return (
        <span className="px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider bg-orange-100 text-orange-700 border border-orange-200 flex items-center gap-1">
          <Clock className="w-3.5 h-3.5" /> Expire dans {diffDays} jours
        </span>
      );
    }
    return (
      <span className="px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider bg-green-100 text-green-700 border border-green-200 flex items-center gap-1">
        <CheckCircle2 className="w-3.5 h-3.5" /> Valide
      </span>
    );
  };

  const getTypeBadge = (type: string) => {
    switch (type) {
      case 'INSURANCE':
        return <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">Assurance</span>;
      case 'ROADWORTHINESS':
        return <span className="text-[10px] font-bold uppercase tracking-wider text-purple-600 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">Visite Technique</span>;
      case 'PERMIT':
        return <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">Autorisation</span>;
      default:
        return <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600 bg-slate-50 px-2 py-0.5 rounded border border-slate-200">Document</span>;
    }
  };

  const expiredCount = initialDocs.filter(d => {
    const today = new Date();
    const expiry = new Date(d.expiryDate);
    return d.status === 'EXPIRED' || expiry < today;
  }).length;
  
  const expiringSoonCount = initialDocs.filter(d => {
    const today = new Date();
    const expiry = new Date(d.expiryDate);
    const diffDays = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 3600 * 24));
    return d.status === 'EXPIRING_SOON' || (diffDays >= 0 && diffDays <= 30);
  }).length;

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs relative overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-indigo-600 font-bold text-xs uppercase tracking-wider mb-1">
              <ShieldCheck className="w-4 h-4 text-indigo-500" />
              <span>Conformité Réglementaire & Sécurité</span>
            </div>
            <h2 className="text-xl font-bold text-slate-900">
              Suivi des Documents de la Flotte
            </h2>
            <p className="text-xs text-slate-500 mt-1 max-w-2xl">
              Gérez les assurances, visites techniques, et autorisations de transport. Recevez des alertes automatiques avant expiration.
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition flex items-center gap-2 border border-slate-200">
              <Bell className="w-4 h-4" />
              <span>Configurer Alertes</span>
            </button>
            <button className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold shadow-md transition flex items-center gap-2">
              <Plus className="w-4 h-4" />
              <span>Nouveau Document</span>
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex items-center gap-4">
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-lg border border-indigo-100">
            <FileText className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-extrabold text-slate-900 font-mono">{initialDocs.length}</div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Documents Gérés</div>
          </div>
        </div>
        
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex items-center gap-4">
          <div className="p-3 bg-orange-50 text-orange-600 rounded-lg border border-orange-100">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-extrabold text-orange-600 font-mono">{expiringSoonCount}</div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">À Renouveler (≤ 30j)</div>
          </div>
        </div>
        
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex items-center gap-4">
          <div className="p-3 bg-red-50 text-red-600 rounded-lg border border-red-100">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-extrabold text-red-600 font-mono">{expiredCount}</div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Documents Expirés</div>
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
        <div className="flex flex-col sm:flex-row items-center gap-4">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input 
              type="text" 
              placeholder="Rechercher par n° document, immatriculation, titre..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          
          <select 
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold focus:ring-2 focus:ring-indigo-500"
          >
            <option value="ALL">Tous les Types</option>
            <option value="INSURANCE">Assurance</option>
            <option value="ROADWORTHINESS">Visite Technique</option>
            <option value="PERMIT">Autorisation</option>
          </select>
          
          <select 
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold focus:ring-2 focus:ring-indigo-500"
          >
            <option value="ALL">Tous les Statuts</option>
            <option value="VALID">Valide</option>
            <option value="EXPIRING_SOON">Expire Bientôt</option>
            <option value="EXPIRED">Expiré</option>
          </select>
          
          <select 
            value={selectedVehicle}
            onChange={(e) => setSelectedVehicle(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold focus:ring-2 focus:ring-indigo-500 max-w-[200px]"
          >
            <option value="ALL">Tous les Véhicules</option>
            {vehicles.map(v => (
              <option key={v.id} value={v.id}>{v.immatriculation}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-4">
        {filteredDocs.length === 0 ? (
           <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-slate-500 shadow-xs">
            <ShieldCheck className="w-8 h-8 mx-auto text-slate-300 mb-2" />
            <p className="font-bold text-sm">Aucun document ne correspond à votre recherche.</p>
          </div>
        ) : (
          filteredDocs.map(doc => {
            const vehicle = vehicles.find(v => v.id === doc.vehicleId);
            return (
              <div key={doc.id} className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs hover:border-indigo-300 transition flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-start gap-4 flex-1">
                  <div className="p-3 bg-slate-50 text-slate-500 rounded-xl border border-slate-200">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-slate-900 text-sm">{doc.title}</h3>
                      {getTypeBadge(doc.type || 'DOCUMENT')}
                    </div>
                    <div className="text-xs text-slate-500 font-mono">
                      N° Pièce: <strong className="text-slate-700">{doc.docNumber}</strong>
                    </div>
                    {vehicle && (
                      <div className="text-[11px] text-slate-500 pt-1 flex items-center gap-1.5">
                        <span className="font-bold text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded">{vehicle.immatriculation}</span>
                        <span>{vehicle.make} {vehicle.model}</span>
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="flex flex-col items-end gap-2 shrink-0">
                  {getStatusBadge(doc.status, doc.expiryDate)}
                  <div className="flex items-center gap-1.5 text-xs text-slate-500 font-mono">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>Expire le: <strong className="text-slate-800">{new Date(doc.expiryDate).toLocaleDateString('fr-FR')}</strong></span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
