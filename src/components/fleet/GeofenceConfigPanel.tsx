import React, { useState, useEffect, useRef } from 'react';
import { Geofence, Organization } from '../../types';
import { MOCK_GEOFENCES, MOCK_VEHICLES } from '../../data/mock-data';
import { 
  MapPin, 
  ShieldAlert, 
  Bell, 
  Plus, 
  Check, 
  Trash2, 
  Edit3, 
  Maximize2, 
  Radio, 
  Zap, 
  Clock, 
  AlertTriangle, 
  BellRing, 
  Sliders, 
  Send,
  Eye,
  MousePointer
} from 'lucide-react';

interface GeofenceConfigPanelProps {
  currentOrg: Organization;
}

export const GeofenceConfigPanel: React.FC<GeofenceConfigPanelProps> = ({ currentOrg }) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);

  // State
  const [geofences, setGeofences] = useState<Geofence[]>(() =>
    MOCK_GEOFENCES.filter(g => g.organizationId === currentOrg.id)
  );
  const orgVehicles = MOCK_VEHICLES.filter(v => v.organizationId === currentOrg.id);

  const [selectedGeofenceId, setSelectedGeofenceId] = useState<string | null>(geofences[0]?.id || null);
  const [drawingMode, setDrawingMode] = useState<'VIEW' | 'DRAW_CIRCLE' | 'DRAW_POLYGON'>('VIEW');
  const [drawnPolygonPoints, setDrawnPolygonPoints] = useState<[number, number][]>([]);

  // Form State for creating/editing geofence
  const [isFormOpen, setIsFormOpen] = useState<boolean>(false);
  const [editingGeofenceId, setEditingGeofenceId] = useState<string | null>(null);
  const [formName, setFormName] = useState<string>('');
  const [formType, setFormType] = useState<Geofence['type']>('WAREHOUSE');
  const [formGeometryType, setFormGeometryType] = useState<'CIRCLE' | 'POLYGON'>('CIRCLE');
  const [formCenterLat, setFormCenterLat] = useState<number>(
    currentOrg.country === 'Sénégal' ? 14.6928 : currentOrg.country.includes('Kenya') ? -1.2921 : 6.3533
  );
  const [formCenterLng, setFormCenterLng] = useState<number>(
    currentOrg.country === 'Sénégal' ? -17.4467 : currentOrg.country.includes('Kenya') ? 36.8219 : 2.4311
  );
  const [formRadius, setFormRadius] = useState<number>(1000);
  const [formSpeedLimit, setFormSpeedLimit] = useState<number>(30);
  const [formNotifyOnEntry, setFormNotifyOnEntry] = useState<boolean>(true);
  const [formNotifyOnExit, setFormNotifyOnExit] = useState<boolean>(true);
  const [formNotifyOnSpeeding, setFormNotifyOnSpeeding] = useState<boolean>(true);
  const [formNotifyOnProlongedStay, setFormNotifyOnProlongedStay] = useState<boolean>(false);
  const [formMaxDwellMinutes, setFormMaxDwellMinutes] = useState<number>(60);
  const [formSeverity, setFormSeverity] = useState<'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'>('HIGH');
  const [formChannels, setFormChannels] = useState<('IN_APP' | 'SMS' | 'EMAIL')[]>(['IN_APP', 'SMS']);
  const [formAssignedVehicles, setFormAssignedVehicles] = useState<string[]>([]); // empty = all

  // Simulation & Live Alerts State
  const [simulatedAlert, setSimulatedAlert] = useState<{
    id: string;
    geofenceName: string;
    vehiclePlate: string;
    action: 'ENTRÉE' | 'SORTIE' | 'EXCÈS DE VITESSE';
    time: string;
    severity: string;
  } | null>(null);

  const [alertLogs, setAlertLogs] = useState<Array<{
    id: string;
    geofenceName: string;
    vehiclePlate: string;
    action: string;
    time: string;
    severity: string;
  }>>([
    {
      id: 'log-1',
      geofenceName: 'Port Autonome de Cotonou',
      vehiclePlate: 'RB-4592-A',
      action: 'ENTRÉE DÉTECTÉE',
      time: 'Aujourd\'hui 08:14',
      severity: 'HIGH',
    },
    {
      id: 'log-2',
      geofenceName: 'Entrepôt Logistique Parakou',
      vehiclePlate: 'RB-8812-B',
      action: 'SORTIE DÉTECTÉE',
      time: 'Hier 17:40',
      severity: 'MEDIUM',
    },
  ]);

  // Map Initialization & Updates
  useEffect(() => {
    if (typeof window === 'undefined' || !mapContainerRef.current) return;

    let L = (window as any).L;

    const initMap = () => {
      if (!mapContainerRef.current) return;
      L = (window as any).L;
      if (!L) return;

      const defaultLat = currentOrg.country === 'Sénégal' ? 14.6928 : currentOrg.country.includes('Kenya') ? -1.2921 : 7.9124;
      const defaultLng = currentOrg.country === 'Sénégal' ? -17.4467 : currentOrg.country.includes('Kenya') ? 36.8219 : 2.1092;

      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
      }

      const map = L.map(mapContainerRef.current).setView([defaultLat, defaultLng], 7);
      mapInstanceRef.current = map;

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors | FleetGuard Africa',
        maxZoom: 18,
      }).addTo(map);

      // Render Existing Geofences
      geofences.forEach(geo => {
        const isSelected = geo.id === selectedGeofenceId;
        const color = geo.type === 'PORT' ? '#2563eb' : geo.type === 'BORDER_POST' ? '#d97706' : geo.type === 'RESTRICTED_ZONE' ? '#dc2626' : '#16a34a';

        if (geo.geometryType === 'CIRCLE' && geo.centerLat && geo.centerLng) {
          const circle = L.circle([geo.centerLat, geo.centerLng], {
            color: isSelected ? '#ea580c' : color,
            fillColor: isSelected ? '#f97316' : color,
            fillOpacity: isSelected ? 0.35 : 0.18,
            weight: isSelected ? 3 : 2,
            radius: geo.radiusMeters || 1000,
          }).addTo(map);

          circle.bindPopup(`
            <div style="font-family: sans-serif; font-size: 12px; padding: 2px;">
              <b style="color:#0f172a;">${geo.name}</b><br/>
              <span style="color:#64748b;">Type : ${geo.type}</span><br/>
              <span style="color:#0284c7;">Rayon : ${geo.radiusMeters}m</span> | Vitesse Max : <b>${geo.speedLimitKmH || 30} km/h</b><br/>
              <span style="color:${geo.isActive ? '#16a34a' : '#94a3b8'}; font-weight: bold;">
                ${geo.isActive ? '● Surveillance Active' : '○ Inactive'}
              </span>
            </div>
          `);
        } else if (geo.geometryType === 'POLYGON' && geo.coordinates && geo.coordinates.length > 0) {
          const polygon = L.polygon(geo.coordinates, {
            color: isSelected ? '#ea580c' : color,
            fillColor: isSelected ? '#f97316' : color,
            fillOpacity: isSelected ? 0.35 : 0.18,
            weight: isSelected ? 3 : 2,
          }).addTo(map);

          polygon.bindPopup(`
            <div style="font-family: sans-serif; font-size: 12px;">
              <b>${geo.name}</b><br/>
              <span>Polygone (${geo.coordinates.length} sommets)</span><br/>
              <span>Vitesse Max : <b>${geo.speedLimitKmH || 80} km/h</b></span>
            </div>
          `);
        }
      });

      // Render Draft Circle or Polygon
      if (drawingMode === 'DRAW_CIRCLE') {
        const circleDraft = L.circle([formCenterLat, formCenterLng], {
          color: '#f97316',
          fillColor: '#fdba74',
          fillOpacity: 0.35,
          weight: 2,
          dashArray: '6, 6',
          radius: formRadius,
        }).addTo(map);

        circleDraft.bindPopup(`<b>Périmètre en cours de définition</b><br/>Rayon: ${formRadius}m`);
      } else if (drawingMode === 'DRAW_POLYGON' && drawnPolygonPoints.length > 0) {
        if (drawnPolygonPoints.length === 1) {
          L.marker(drawnPolygonPoints[0]).addTo(map).bindPopup('Sommet 1 du polygone');
        } else {
          L.polygon(drawnPolygonPoints, {
            color: '#f97316',
            fillColor: '#fdba74',
            fillOpacity: 0.4,
            weight: 3,
            dashArray: '4, 4',
          }).addTo(map);

          drawnPolygonPoints.forEach((pt, idx) => {
            L.circleMarker(pt, { radius: 5, color: '#ea580c', fillColor: '#fff', fillOpacity: 1 }).addTo(map);
          });
        }
      }

      // Map Click Handler for Drawing Mode
      map.on('click', (e: any) => {
        const { lat, lng } = e.latlng;
        const roundedLat = Number(lat.toFixed(5));
        const roundedLng = Number(lng.toFixed(5));

        if (drawingMode === 'DRAW_CIRCLE') {
          setFormCenterLat(roundedLat);
          setFormCenterLng(roundedLng);
          if (!isFormOpen) {
            setIsFormOpen(true);
            setEditingGeofenceId(null);
            setFormGeometryType('CIRCLE');
            setFormName(`Zone Circulaire (${roundedLat}, ${roundedLng})`);
          }
        } else if (drawingMode === 'DRAW_POLYGON') {
          setDrawnPolygonPoints(prev => [...prev, [roundedLat, roundedLng]]);
          if (!isFormOpen) {
            setIsFormOpen(true);
            setEditingGeofenceId(null);
            setFormGeometryType('POLYGON');
            setFormName(`Corridor Polygonal Custom`);
          }
        }
      });
    };

    if (!(window as any).L) {
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.async = true;
      script.onload = initMap;
      document.head.appendChild(script);

      const style = document.createElement('link');
      style.rel = 'stylesheet';
      style.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(style);
    } else {
      initMap();
    }
  }, [currentOrg, geofences, selectedGeofenceId, drawingMode, formCenterLat, formCenterLng, formRadius, drawnPolygonPoints, isFormOpen]);

  // Handle Save Geofence
  const handleSaveGeofence = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formName.trim()) return;

    if (editingGeofenceId) {
      // Update existing
      setGeofences(prev =>
        prev.map(g => {
          if (g.id === editingGeofenceId) {
            return {
              ...g,
              name: formName,
              type: formType,
              geometryType: formGeometryType,
              centerLat: formGeometryType === 'CIRCLE' ? formCenterLat : undefined,
              centerLng: formGeometryType === 'CIRCLE' ? formCenterLng : undefined,
              radiusMeters: formGeometryType === 'CIRCLE' ? formRadius : undefined,
              coordinates: formGeometryType === 'POLYGON' ? (drawnPolygonPoints.length >= 3 ? drawnPolygonPoints : g.coordinates) : undefined,
              speedLimitKmH: formSpeedLimit,
              notifyOnEntry: formNotifyOnEntry,
              notifyOnExit: formNotifyOnExit,
              notifyOnSpeeding: formNotifyOnSpeeding,
              notifyOnProlongedStay: formNotifyOnProlongedStay,
              maxDwellTimeMinutes: formMaxDwellMinutes,
              severity: formSeverity,
              notificationChannels: formChannels,
              assignedVehicleIds: formAssignedVehicles,
            };
          }
          return g;
        })
      );
    } else {
      // Create new
      const newGeo: Geofence = {
        id: `geo_custom_${Date.now()}`,
        organizationId: currentOrg.id,
        name: formName,
        type: formType,
        geometryType: formGeometryType,
        centerLat: formGeometryType === 'CIRCLE' ? formCenterLat : undefined,
        centerLng: formGeometryType === 'CIRCLE' ? formCenterLng : undefined,
        radiusMeters: formGeometryType === 'CIRCLE' ? formRadius : undefined,
        coordinates: formGeometryType === 'POLYGON' ? (drawnPolygonPoints.length >= 3 ? drawnPolygonPoints : [[formCenterLat, formCenterLng], [formCenterLat + 0.02, formCenterLng + 0.02], [formCenterLat, formCenterLng + 0.04]]) : undefined,
        speedLimitKmH: formSpeedLimit,
        isActive: true,
        notifyOnEntry: formNotifyOnEntry,
        notifyOnExit: formNotifyOnExit,
        notifyOnSpeeding: formNotifyOnSpeeding,
        notifyOnProlongedStay: formNotifyOnProlongedStay,
        maxDwellTimeMinutes: formMaxDwellMinutes,
        severity: formSeverity,
        notificationChannels: formChannels,
        assignedVehicleIds: formAssignedVehicles,
        createdAt: new Date().toISOString(),
      };
      setGeofences(prev => [newGeo, ...prev]);
      setSelectedGeofenceId(newGeo.id);
    }

    // Reset Form & Drawing
    setIsFormOpen(false);
    setEditingGeofenceId(null);
    setDrawingMode('VIEW');
    setDrawnPolygonPoints([]);
  };

  // Populate Edit Form
  const handleEditClick = (geo: Geofence) => {
    setEditingGeofenceId(geo.id);
    setFormName(geo.name);
    setFormType(geo.type);
    setFormGeometryType(geo.geometryType);
    if (geo.centerLat) setFormCenterLat(geo.centerLat);
    if (geo.centerLng) setFormCenterLng(geo.centerLng);
    if (geo.radiusMeters) setFormRadius(geo.radiusMeters);
    if (geo.coordinates) setDrawnPolygonPoints(geo.coordinates);
    setFormSpeedLimit(geo.speedLimitKmH || 30);
    setFormNotifyOnEntry(geo.notifyOnEntry ?? true);
    setFormNotifyOnExit(geo.notifyOnExit ?? true);
    setFormNotifyOnSpeeding(geo.notifyOnSpeeding ?? true);
    setFormNotifyOnProlongedStay(geo.notifyOnProlongedStay ?? false);
    setFormMaxDwellMinutes(geo.maxDwellTimeMinutes || 60);
    setFormSeverity(geo.severity || 'HIGH');
    setFormChannels(geo.notificationChannels || ['IN_APP', 'SMS']);
    setFormAssignedVehicles(geo.assignedVehicleIds || []);
    setIsFormOpen(true);
  };

  // Toggle Active State
  const handleToggleActive = (id: string) => {
    setGeofences(prev =>
      prev.map(g => (g.id === id ? { ...g, isActive: !(g.isActive ?? true) } : g))
    );
  };

  // Delete Geofence
  const handleDeleteGeofence = (id: string) => {
    if (confirm('Êtes-vous sûr de vouloir supprimer cette zone géofencée ?')) {
      setGeofences(prev => prev.filter(g => g.id !== id));
      if (selectedGeofenceId === id) setSelectedGeofenceId(null);
    }
  };

  // Trigger Instant Live Alert Simulation
  const handleSimulateAlert = (actionType: 'ENTRÉE' | 'SORTIE' | 'EXCÈS DE VITESSE') => {
    const targetGeo = geofences.find(g => g.id === selectedGeofenceId) || geofences[0];
    const targetVehicle = orgVehicles[0] || MOCK_VEHICLES[0];

    const newAlert = {
      id: `alert-${Date.now()}`,
      geofenceName: targetGeo?.name || 'Zone Surveillée',
      vehiclePlate: targetVehicle.immatriculation,
      action: actionType,
      time: new Date().toLocaleTimeString(),
      severity: targetGeo?.severity || 'HIGH',
    };

    setSimulatedAlert(newAlert);
    setAlertLogs(prev => [
      {
        id: newAlert.id,
        geofenceName: newAlert.geofenceName,
        vehiclePlate: newAlert.vehiclePlate,
        action: `${actionType} DÉTECTÉE`,
        time: `À l'instant (${newAlert.time})`,
        severity: newAlert.severity,
      },
      ...prev,
    ]);

    // Auto dismiss toast banner after 6s
    setTimeout(() => {
      setSimulatedAlert(null);
    }, 6000);
  };

  return (
    <div className="space-y-6">
      {/* Simulation Live Instant Toast Banner */}
      {simulatedAlert && (
        <div className="bg-orange-500 text-white p-4 rounded-xl shadow-lg flex items-center justify-between animate-bounce">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-lg shrink-0">
              <BellRing className="w-5 h-5 text-white animate-pulse" />
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider font-extrabold opacity-90">
                🚨 ALERTE EN TEMPS RÉEL (DECLENCHEUR INSTANTANÉ)
              </div>
              <div className="text-sm font-bold mt-0.5">
                Véhicule <span className="underline">{simulatedAlert.vehiclePlate}</span> : Event{' '}
                <span className="bg-white/20 px-1.5 py-0.5 rounded">{simulatedAlert.action}</span> dans la zone{' '}
                <strong>"{simulatedAlert.geofenceName}"</strong>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs bg-white text-orange-600 px-2.5 py-1 rounded-lg font-bold">
              SMS + Push Envoyé
            </span>
            <button
              onClick={() => setSimulatedAlert(null)}
              className="text-white hover:text-slate-200 text-xs underline font-bold px-2 cursor-pointer"
            >
              Fermer
            </button>
          </div>
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-wrap items-center justify-between gap-4 shadow-xs">
        <div>
          <div className="flex items-center gap-2 text-orange-600 font-bold text-xs uppercase tracking-wider mb-1">
            <ShieldAlert className="w-4 h-4 text-orange-500" />
            <span>Périmètres de Sécurité & Corridors Logistiques</span>
          </div>
          <h2 className="text-xl font-bold text-slate-900">
            Configuration des Zones Géofencées & Notification d'Alerte
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Dessinez des zones circulaires ou corridors polygonaux interactifs et définissez les déclencheurs d'alerte en temps réel (Entrée, Sortie, Vitesse).
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setIsFormOpen(true);
              setEditingGeofenceId(null);
              setFormName('Nouvelle Zone Définie');
            }}
            className="px-3.5 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs flex items-center gap-2 shadow-xs transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Définir Nouvelle Zone</span>
          </button>
        </div>
      </div>

      {/* Map Drawing Controls & Interactive Map Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Drawing Mode Switcher & Map Container */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3 shadow-xs">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <MousePointer className="w-4 h-4 text-orange-500" />
                Mode d'Interaction Carte :
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setDrawingMode('VIEW')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 border transition cursor-pointer ${
                  drawingMode === 'VIEW'
                    ? 'bg-orange-50 text-orange-600 border-orange-300 shadow-2xs'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Vue & Sélection</span>
              </button>

              <button
                onClick={() => {
                  setDrawingMode('DRAW_CIRCLE');
                  setFormGeometryType('CIRCLE');
                  setIsFormOpen(true);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 border transition cursor-pointer ${
                  drawingMode === 'DRAW_CIRCLE'
                    ? 'bg-orange-50 text-orange-600 border-orange-300 shadow-2xs'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                <MapPin className="w-3.5 h-3.5 text-blue-600" />
                <span>Dessiner Cercle (Rayon)</span>
              </button>

              <button
                onClick={() => {
                  setDrawingMode('DRAW_POLYGON');
                  setFormGeometryType('POLYGON');
                  setIsFormOpen(true);
                  setDrawnPolygonPoints([]);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 border transition cursor-pointer ${
                  drawingMode === 'DRAW_POLYGON'
                    ? 'bg-orange-50 text-orange-600 border-orange-300 shadow-2xs'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                <Maximize2 className="w-3.5 h-3.5 text-purple-600" />
                <span>Dessiner Polygone / Corridor</span>
              </button>
            </div>
          </div>

          {/* Map Viewer Container */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden h-[480px] relative shadow-xs">
            <div ref={mapContainerRef} className="w-full h-full z-10"></div>

            {/* Instruction Overlay depending on mode */}
            {drawingMode === 'DRAW_CIRCLE' && (
              <div className="absolute top-4 left-4 z-20 bg-blue-900/90 text-white backdrop-blur border border-blue-700 px-3 py-2 rounded-lg text-xs shadow-md flex items-center gap-2">
                <MapPin className="w-4 h-4 text-blue-300 animate-bounce" />
                <span>Cliquez n'importe où sur la carte pour placer le centre de la zone circulaire.</span>
              </div>
            )}

            {drawingMode === 'DRAW_POLYGON' && (
              <div className="absolute top-4 left-4 z-20 bg-purple-900/90 text-white backdrop-blur border border-purple-700 px-3 py-2 rounded-lg text-xs shadow-md flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <Maximize2 className="w-4 h-4 text-purple-300 animate-pulse" />
                  <span>
                    Cliquez sur la carte pour ajouter des sommets. ({drawnPolygonPoints.length} points placés)
                  </span>
                </div>
                {drawnPolygonPoints.length > 0 && (
                  <button
                    onClick={() => setDrawnPolygonPoints([])}
                    className="text-[10px] bg-red-600 hover:bg-red-700 text-white font-bold px-2 py-0.5 rounded cursor-pointer"
                  >
                    Effacer Sommets
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Geofence Form or Live Alert Tester */}
        <div className="space-y-4">
          {isFormOpen ? (
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 shadow-xs">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <span className="text-xs font-bold text-slate-900 flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-orange-500" />
                  {editingGeofenceId ? 'Modifier la Zone' : 'Configurer Nouvelle Zone'}
                </span>
                <button
                  onClick={() => setIsFormOpen(false)}
                  className="text-xs text-slate-400 hover:text-slate-600 font-bold"
                >
                  Annuler
                </button>
              </div>

              <form onSubmit={handleSaveGeofence} className="space-y-3.5 text-xs">
                {/* Zone Name */}
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Nom de la Zone / Corridor :</label>
                  <input
                    type="text"
                    required
                    value={formName}
                    onChange={e => setFormName(e.target.value)}
                    placeholder="ex: Port Autonome de Cotonou"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:border-orange-500 focus:outline-none"
                  />
                </div>

                {/* Category & Geometry Type */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Catégorie :</label>
                    <select
                      value={formType}
                      onChange={e => setFormType(e.target.value as any)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2 text-slate-800 font-medium focus:outline-none"
                    >
                      <option value="PORT">Port Autonome</option>
                      <option value="WAREHOUSE">Entrepôt / Dépôt</option>
                      <option value="BORDER_POST">Poste Frontière</option>
                      <option value="RESTRICTED_ZONE">Zone Interdite</option>
                      <option value="FUEL_STATION">Station Service</option>
                      <option value="CUSTOM_CORRIDOR">Corridor Routier</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Forme Géométrique :</label>
                    <select
                      value={formGeometryType}
                      onChange={e => setFormGeometryType(e.target.value as any)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2 text-slate-800 font-medium focus:outline-none"
                    >
                      <option value="CIRCLE">Cercle (Rayon)</option>
                      <option value="POLYGON">Polygone (Corridor)</option>
                    </select>
                  </div>
                </div>

                {/* Circle Specific Inputs */}
                {formGeometryType === 'CIRCLE' && (
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-2">
                    <div className="flex justify-between items-center text-slate-700 font-medium">
                      <span>Rayon de Surveillance :</span>
                      <span className="font-mono font-bold text-orange-600">{formRadius} mètres</span>
                    </div>
                    <input
                      type="range"
                      min="200"
                      max="10000"
                      step="200"
                      value={formRadius}
                      onChange={e => setFormRadius(Number(e.target.value))}
                      className="w-full accent-orange-500 cursor-pointer"
                    />

                    <div className="grid grid-cols-2 gap-2 text-[11px] pt-1 font-mono text-slate-600">
                      <div>Lat: {formCenterLat}</div>
                      <div>Lng: {formCenterLng}</div>
                    </div>
                  </div>
                )}

                {/* Polygon Specific info */}
                {formGeometryType === 'POLYGON' && (
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-slate-700">
                    <div className="flex justify-between items-center mb-1">
                      <span className="font-semibold">Sommets Polygone :</span>
                      <span className="font-mono font-bold text-purple-600">
                        {drawnPolygonPoints.length} points définis
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      {drawnPolygonPoints.length >= 3
                        ? 'Polygone fermé et valide.'
                        : 'Veuillez cliquer sur au moins 3 points sur la carte pour former un corridor.'}
                    </p>
                  </div>
                )}

                {/* Speed Limit inside zone */}
                <div>
                  <div className="flex justify-between text-slate-700 font-semibold mb-1">
                    <span>Vitesse Maximale Autorisée :</span>
                    <span className="font-mono font-bold text-orange-600">{formSpeedLimit} km/h</span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="110"
                    step="5"
                    value={formSpeedLimit}
                    onChange={e => setFormSpeedLimit(Number(e.target.value))}
                    className="w-full accent-orange-500 cursor-pointer"
                  />
                </div>

                {/* Instant Notification Triggers Configuration */}
                <div className="pt-2 border-t border-slate-100 space-y-2">
                  <div className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                    <Bell className="w-3.5 h-3.5 text-orange-500" />
                    <span>Déclencheurs d'Alerte Instantanée :</span>
                  </div>

                  <div className="space-y-1.5 text-[11px]">
                    <label className="flex items-center gap-2 cursor-pointer text-slate-700">
                      <input
                        type="checkbox"
                        checked={formNotifyOnEntry}
                        onChange={e => setFormNotifyOnEntry(e.target.checked)}
                        className="rounded accent-orange-500"
                      />
                      <span>Alerte Entrée dans la Zone (Geofence Enter)</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer text-slate-700">
                      <input
                        type="checkbox"
                        checked={formNotifyOnExit}
                        onChange={e => setFormNotifyOnExit(e.target.checked)}
                        className="rounded accent-orange-500"
                      />
                      <span>Alerte Sortie de la Zone (Geofence Exit)</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer text-slate-700">
                      <input
                        type="checkbox"
                        checked={formNotifyOnSpeeding}
                        onChange={e => setFormNotifyOnSpeeding(e.target.checked)}
                        className="rounded accent-orange-500"
                      />
                      <span>Alerte Excès de Vitesse (&gt; {formSpeedLimit} km/h)</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer text-slate-700">
                      <input
                        type="checkbox"
                        checked={formNotifyOnProlongedStay}
                        onChange={e => setFormNotifyOnProlongedStay(e.target.checked)}
                        className="rounded accent-orange-500"
                      />
                      <span>Alerte Séjour / Inactivité Prolongée</span>
                    </label>
                  </div>
                </div>

                {/* Severity & Channels */}
                <div className="grid grid-cols-2 gap-2 pt-2">
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Niveau Sévérité :</label>
                    <select
                      value={formSeverity}
                      onChange={e => setFormSeverity(e.target.value as any)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-800 font-medium focus:outline-none"
                    >
                      <option value="LOW">Faible (LOW)</option>
                      <option value="MEDIUM">Moyenne (MEDIUM)</option>
                      <option value="HIGH">Élevée (HIGH)</option>
                      <option value="CRITICAL">Critique (CRITICAL)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Canal de Diffusion :</label>
                    <div className="text-[10px] text-slate-600 font-semibold space-y-1 mt-1">
                      <span className="inline-block bg-orange-100 text-orange-800 px-2 py-0.5 rounded mr-1">App Push</span>
                      <span className="inline-block bg-blue-100 text-blue-800 px-2 py-0.5 rounded">SMS GSM</span>
                    </div>
                  </div>
                </div>

                {/* Submit button */}
                <button
                  type="submit"
                  className="w-full py-2.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-xs transition cursor-pointer mt-3"
                >
                  <Check className="w-4 h-4" />
                  <span>Enregistrer & Activer les Notifications</span>
                </button>
              </form>
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 shadow-xs">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <span className="text-xs font-bold text-slate-900 flex items-center gap-2">
                  <Zap className="w-4 h-4 text-orange-500" />
                  Testeur de Notifications Instantanées
                </span>
                <span className="text-[10px] bg-green-50 text-green-700 border border-green-200 font-bold px-2 py-0.5 rounded">
                  Système Live
                </span>
              </div>

              <p className="text-xs text-slate-600">
                Simulez le franchissement d'un camion sur une zone configurée pour vérifier l'envoi immédiat de notification push et SMS.
              </p>

              <div className="space-y-2">
                <button
                  onClick={() => handleSimulateAlert('ENTRÉE')}
                  className="w-full py-2 px-3 rounded-lg bg-slate-50 border border-slate-200 hover:border-orange-300 hover:bg-orange-50 text-slate-800 font-bold text-xs flex items-center justify-between transition cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <Radio className="w-3.5 h-3.5 text-green-600" />
                    Simuler Entrée Véhicule (Geofence Enter)
                  </span>
                  <Send className="w-3.5 h-3.5 text-slate-400" />
                </button>

                <button
                  onClick={() => handleSimulateAlert('SORTIE')}
                  className="w-full py-2 px-3 rounded-lg bg-slate-50 border border-slate-200 hover:border-orange-300 hover:bg-orange-50 text-slate-800 font-bold text-xs flex items-center justify-between transition cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <Radio className="w-3.5 h-3.5 text-blue-600" />
                    Simuler Sortie Véhicule (Geofence Exit)
                  </span>
                  <Send className="w-3.5 h-3.5 text-slate-400" />
                </button>

                <button
                  onClick={() => handleSimulateAlert('EXCÈS DE VITESSE')}
                  className="w-full py-2 px-3 rounded-lg bg-slate-50 border border-slate-200 hover:border-red-300 hover:bg-red-50 text-slate-800 font-bold text-xs flex items-center justify-between transition cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                    Simuler Excès de Vitesse dans Zone
                  </span>
                  <Send className="w-3.5 h-3.5 text-slate-400" />
                </button>
              </div>

              {/* Log History */}
              <div className="pt-3 border-t border-slate-100 space-y-2">
                <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between">
                  <span>Historique Récent des Déclenchements ({alertLogs.length})</span>
                  <Clock className="w-3 h-3 text-slate-400" />
                </div>

                <div className="space-y-1.5 max-h-[160px] overflow-y-auto pr-1">
                  {alertLogs.map(log => (
                    <div
                      key={log.id}
                      className="p-2 rounded-lg bg-slate-50 border border-slate-100 text-[11px] flex items-center justify-between"
                    >
                      <div>
                        <div className="font-bold text-slate-800">
                          {log.vehiclePlate} • {log.action}
                        </div>
                        <div className="text-[10px] text-slate-500">{log.geofenceName}</div>
                      </div>
                      <span className="text-[10px] font-mono text-slate-400">{log.time}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Table: Configured Geofences List */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4 shadow-xs">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              Liste des Zones & Corridors Configurés ({geofences.length})
            </h3>
            <p className="text-xs text-slate-500">
              Gérez les règles de surveillance, activez/désactivez les périmètres et modifiez les paramètres d'alerte.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {geofences.map(geo => {
            const isSelected = geo.id === selectedGeofenceId;
            const isActive = geo.isActive ?? true;

            return (
              <div
                key={geo.id}
                onClick={() => setSelectedGeofenceId(geo.id)}
                className={`p-4 rounded-xl border transition cursor-pointer flex flex-col justify-between space-y-3 ${
                  isSelected
                    ? 'bg-orange-50/70 border-orange-300 shadow-2xs'
                    : 'bg-slate-50/50 border-slate-200 hover:bg-slate-100/60'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-orange-500 shrink-0" />
                      {geo.name}
                    </span>

                    <button
                      onClick={e => {
                        e.stopPropagation();
                        handleToggleActive(geo.id);
                      }}
                      className={`text-[10px] px-2 py-0.5 rounded-full font-bold cursor-pointer transition ${
                        isActive
                          ? 'bg-green-50 text-green-700 border border-green-200'
                          : 'bg-slate-200 text-slate-600 border border-slate-300'
                      }`}
                    >
                      {isActive ? '● Actif' : '○ Inactif'}
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 mt-2">
                    <span className="text-[10px] font-semibold bg-white border border-slate-200 text-slate-700 px-2 py-0.5 rounded">
                      {geo.type}
                    </span>
                    <span className="text-[10px] font-semibold bg-white border border-slate-200 text-slate-700 px-2 py-0.5 rounded">
                      {geo.geometryType === 'CIRCLE' ? `Cercle (${geo.radiusMeters}m)` : `Polygone (${geo.coordinates?.length || 0} pts)`}
                    </span>
                    <span className="text-[10px] font-bold bg-orange-100 text-orange-800 px-2 py-0.5 rounded">
                      Max {geo.speedLimitKmH || 30} km/h
                    </span>
                  </div>

                  {/* Active Notification Rules */}
                  <div className="mt-3 text-[11px] space-y-1 text-slate-600 border-t border-slate-200/60 pt-2">
                    <div className="font-semibold text-slate-800 text-[10px] uppercase tracking-wider">
                      Règles de Notification :
                    </div>
                    <div className="flex flex-wrap gap-1 text-[10px]">
                      {geo.notifyOnEntry && (
                        <span className="bg-green-50 text-green-700 border border-green-200 px-1.5 py-0.5 rounded">
                          ✓ Entrée
                        </span>
                      )}
                      {geo.notifyOnExit && (
                        <span className="bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded">
                          ✓ Sortie
                        </span>
                      )}
                      {geo.notifyOnSpeeding && (
                        <span className="bg-red-50 text-red-700 border border-red-200 px-1.5 py-0.5 rounded">
                          ✓ Vitesse
                        </span>
                      )}
                      {geo.notifyOnProlongedStay && (
                        <span className="bg-purple-50 text-purple-700 border border-purple-200 px-1.5 py-0.5 rounded">
                          ✓ Inactivité ({geo.maxDwellTimeMinutes || 60}m)
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Card Actions */}
                <div className="flex items-center justify-between border-t border-slate-200/60 pt-2">
                  <span className="text-[10px] text-slate-400 font-mono">
                    Sévérité: {geo.severity || 'HIGH'}
                  </span>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        handleEditClick(geo);
                      }}
                      className="p-1.5 rounded text-slate-500 hover:text-orange-600 hover:bg-orange-50 cursor-pointer"
                      title="Modifier"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        handleDeleteGeofence(geo.id);
                      }}
                      className="p-1.5 rounded text-slate-500 hover:text-red-600 hover:bg-red-50 cursor-pointer"
                      title="Supprimer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
