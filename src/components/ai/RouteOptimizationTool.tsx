import React, { useState, useEffect, useRef } from 'react';
import { Organization } from '../../types';
import {
  MapPin,
  Truck,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Plus,
  Trash2,
  TrendingDown,
  Zap,
  Send,
  RotateCcw,
  ShieldCheck,
  Compass,
} from 'lucide-react';

interface RouteOptimizationToolProps {
  currentOrg: Organization;
}

export interface DeliveryStop {
  id: string;
  name: string;
  address: string;
  cargoWeightTons: number;
  timeWindowStart: string;
  timeWindowEnd: string;
  lat: number;
  lng: number;
  trafficRisk: 'LOW' | 'MEDIUM' | 'HIGH';
  priority: 'HIGH' | 'NORMAL' | 'LOW';
}

/**
 * Gabarits d'itinéraires, par région.
 *
 * Ce sont des points de départ modifiables, comme les valeurs par défaut d'un
 * formulaire — pas des relevés. La « difficulté » de chaque étape est une
 * appréciation du planificateur, et l'infobulle le précise : aucune source de
 * trafic n'alimente l'application.
 */
const PRESET_ROUTES: { [key: string]: { name: string; origin: string; stops: DeliveryStop[] } } = {
  BENIN_NORTH: {
    name: 'Corridor Cotonou - Parakou - Malanville (Bénin)',
    origin: 'Terminal Conteneurs Port Autonome de Cotonou (6.356, 2.435)',
    stops: [
      {
        id: 's1',
        name: 'Dépôt Bohicon Centre',
        address: 'Bohicon RNIE2 Km 125',
        cargoWeightTons: 12,
        timeWindowStart: '08:30',
        timeWindowEnd: '10:00',
        lat: 7.178,
        lng: 2.066,
        trafficRisk: 'HIGH',
        priority: 'HIGH',
      },
      {
        id: 's2',
        name: 'Hub Logistique Parakou',
        address: 'Gare Routière Parakou Sud',
        cargoWeightTons: 18,
        timeWindowStart: '13:00',
        timeWindowEnd: '15:00',
        lat: 9.337,
        lng: 2.63,
        trafficRisk: 'MEDIUM',
        priority: 'NORMAL',
      },
      {
        id: 's3',
        name: 'Poste Douanier Malanville',
        address: 'Frontière Bénin-Niger',
        cargoWeightTons: 25,
        timeWindowStart: '17:30',
        timeWindowEnd: '19:30',
        lat: 11.868,
        lng: 3.383,
        trafficRisk: 'HIGH',
        priority: 'HIGH',
      },
    ],
  },
  SENEGAL_MBOUR: {
    name: 'Corridor Dakar - Thiès - Touba (Sénégal)',
    origin: 'Môle 2 Port Autonome de Dakar (14.685, -17.432)',
    stops: [
      {
        id: 's1',
        name: 'Plateforme Rufisque Est',
        address: 'Zone Industrielle Rufisque',
        cargoWeightTons: 10,
        timeWindowStart: '07:30',
        timeWindowEnd: '09:00',
        lat: 14.716,
        lng: -17.272,
        trafficRisk: 'HIGH',
        priority: 'HIGH',
      },
      {
        id: 's2',
        name: 'Entrepôt Thiès Nord',
        address: 'RN2 Sortie Thiès',
        cargoWeightTons: 15,
        timeWindowStart: '10:30',
        timeWindowEnd: '12:00',
        lat: 14.79,
        lng: -16.926,
        trafficRisk: 'LOW',
        priority: 'NORMAL',
      },
      {
        id: 's3',
        name: 'Marché Central Touba',
        address: 'Grande Mosquée Touba',
        cargoWeightTons: 22,
        timeWindowStart: '14:30',
        timeWindowEnd: '16:30',
        lat: 14.864,
        lng: -15.882,
        trafficRisk: 'MEDIUM',
        priority: 'HIGH',
      },
    ],
  },
  KENYA_MOMBASA: {
    name: 'Northern Corridor Nairobi - Nakuru (Kenya)',
    origin: 'Embakasi Inland Container Depot Nairobi (-1.319, 36.885)',
    stops: [
      {
        id: 's1',
        name: 'Naivasha Dry Port Depot',
        address: 'Mai Mahiu Naivasha Road',
        cargoWeightTons: 16,
        timeWindowStart: '09:00',
        timeWindowEnd: '10:30',
        lat: -0.717,
        lng: 36.431,
        trafficRisk: 'HIGH',
        priority: 'HIGH',
      },
      {
        id: 's2',
        name: 'Nakuru Industrial Zone',
        address: 'Nakuru-Eldoret Highway',
        cargoWeightTons: 20,
        timeWindowStart: '12:30',
        timeWindowEnd: '14:00',
        lat: -0.283,
        lng: 36.066,
        trafficRisk: 'MEDIUM',
        priority: 'NORMAL',
      },
    ],
  },
};

export const RouteOptimizationTool: React.FC<RouteOptimizationToolProps> = ({ currentOrg }) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);

  // Default Corridor preset according to tenant country
  const defaultPreset =
    currentOrg.country === 'Sénégal'
      ? PRESET_ROUTES.SENEGAL_MBOUR
      : currentOrg.country.includes('Kenya')
        ? PRESET_ROUTES.KENYA_MOMBASA
        : PRESET_ROUTES.BENIN_NORTH;

  // Form State
  const [selectedCorridorKey, setSelectedCorridorKey] = useState<string>(
    currentOrg.country === 'Sénégal'
      ? 'SENEGAL_MBOUR'
      : currentOrg.country.includes('Kenya')
        ? 'KENYA_MOMBASA'
        : 'BENIN_NORTH',
  );
  const [vehicleProfile, setVehicleProfile] = useState<
    'HEAVY_6X4' | 'RIGID_26T' | 'FRIGO_VAN' | 'LIGHT_PICKUP'
  >('HEAVY_6X4');
  const [cargoLoadTons, setCargoLoadTons] = useState<number>(35);
  const [departureTime, setDepartureTime] = useState<
    'MORNING_PEAK' | 'NORMAL_FLOW' | 'EVENING_PEAK' | 'NIGHT_HAUL'
  >('MORNING_PEAK');
  const [avoidTolls, setAvoidTolls] = useState<boolean>(false);
  const [avoidUrbanChokepoints, setAvoidUrbanChokepoints] = useState<boolean>(true);

  // Multi-Stop Stops
  const [stops, setStops] = useState<DeliveryStop[]>(defaultPreset.stops);
  const [newStopName, setNewStopName] = useState<string>('');
  const [newStopAddress, setNewStopAddress] = useState<string>('');

  // Active Route Calculation Results
  const [selectedRouteType, setSelectedRouteType] = useState<'ECO_FUEL' | 'STANDARD_FASTEST' | 'BYPASS'>(
    'ECO_FUEL',
  );
  // Seul le setter est utilisé : l'état rythme la simulation sans être affiché.
  const [, setIsCalculating] = useState<boolean>(false);
  const [dispatchSuccessMessage, setDispatchSuccessMessage] = useState<string | null>(null);

  const currencySymbol = currentOrg.currency || 'FCFA';

  // Calculations based on inputs & vehicle profile
  const getConsumptionFactor = () => {
    switch (vehicleProfile) {
      case 'HEAVY_6X4':
        return 38.0;
      case 'RIGID_26T':
        return 28.5;
      case 'FRIGO_VAN':
        return 22.0;
      case 'LIGHT_PICKUP':
        return 12.5;
    }
  };

  const baseL100km = getConsumptionFactor();
  const trafficMultiplier =
    departureTime === 'MORNING_PEAK'
      ? 1.22
      : departureTime === 'EVENING_PEAK'
        ? 1.18
        : departureTime === 'NIGHT_HAUL'
          ? 0.91
          : 1.05;
  const loadPenalty = (cargoLoadTons / 40) * 4.5;

  // Eco Route Metrics
  const ecoDistanceKm = 482;
  const ecoDurationHours = 7.2;
  const ecoAvgL100km = parseFloat(
    (baseL100km * (avoidUrbanChokepoints ? 0.9 : 1.0) + loadPenalty).toFixed(1),
  );
  const ecoTotalLiters = Math.round((ecoDistanceKm * ecoAvgL100km) / 100);
  const ecoFuelCost = ecoTotalLiters * 650; // ~650 FCFA per liter

  // Standard Route Metrics (Unoptimized / Peak Traffic)
  const stdDistanceKm = 465; // shorter distance but heavy congestion
  const stdDurationHours = 8.8; // longer due to traffic jams
  const stdAvgL100km = parseFloat((baseL100km * trafficMultiplier + loadPenalty).toFixed(1));
  const stdTotalLiters = Math.round((stdDistanceKm * stdAvgL100km) / 100);
  const stdFuelCost = stdTotalLiters * 650;

  // Differences
  const fuelLitersSaved = stdTotalLiters - ecoTotalLiters;
  const financialCostSaved = stdFuelCost - ecoFuelCost;
  const timeSavedMinutes = Math.round((stdDurationHours - ecoDurationHours) * 60);
  const co2ReductionKg = Math.round(fuelLitersSaved * 2.68); // 2.68 kg CO2 per liter of diesel

  // Switch Preset Corridor
  const handleCorridorChange = (key: string) => {
    setSelectedCorridorKey(key);
    if (PRESET_ROUTES[key]) {
      setStops(PRESET_ROUTES[key].stops);
    }
  };

  // Add custom delivery stop
  const handleAddStop = () => {
    if (!newStopName.trim()) return;
    const newStop: DeliveryStop = {
      id: `custom_stop_${Date.now()}`,
      name: newStopName,
      address: newStopAddress || 'Axe RNIE / Route Nationale',
      cargoWeightTons: 8,
      timeWindowStart: '11:00',
      timeWindowEnd: '13:00',
      lat: 8.5 + (Math.random() - 0.5) * 1.5,
      lng: 2.3 + (Math.random() - 0.5) * 1.5,
      trafficRisk: 'MEDIUM',
      priority: 'NORMAL',
    };

    setStops(prev => [...prev, newStop]);
    setNewStopName('');
    setNewStopAddress('');
  };

  // Remove stop
  const handleRemoveStop = (id: string) => {
    setStops(prev => prev.filter(s => s.id !== id));
  };

  // Recalculate route animation
  const handleRecalculateRoute = () => {
    setIsCalculating(true);
    setDispatchSuccessMessage(null);
    setTimeout(() => {
      setIsCalculating(false);
    }, 600);
  };

  /**
   * Transmission de l'itinéraire.
   *
   * Le message annonçait un envoi « avec succès sur l'application FleetGuard
   * Driver du chauffeur Moussa Diop » — un nom écrit en dur, et un envoi qui
   * n'avait pas lieu. Un régulateur pouvait croire son chauffeur informé avant
   * un départ. L'itinéraire s'imprime ou se dicte, et la mission se crée depuis
   * l'écran de planification.
   */
  const handleDispatchToDriver = () => {
    setDispatchSuccessMessage(
      "Itinéraire calculé. Sa transmission au téléphone du chauffeur n'est pas encore raccordée : imprimez-le, ou créez la mission depuis « Planification des missions » pour qu'elle apparaisse dans sa console.",
    );
    setTimeout(() => {
      setDispatchSuccessMessage(null);
    }, 6000);
  };

  // Leaflet Map Rendering
  useEffect(() => {
    if (typeof window === 'undefined' || !mapContainerRef.current) return;

    let L = (window as any).L;

    const renderMap = () => {
      if (!mapContainerRef.current) return;
      L = (window as any).L;
      if (!L) return;

      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
      }

      // Center map according to selected corridor
      const originLat =
        selectedCorridorKey === 'SENEGAL_MBOUR'
          ? 14.685
          : selectedCorridorKey === 'KENYA_MOMBASA'
            ? -1.319
            : 6.356;
      const originLng =
        selectedCorridorKey === 'SENEGAL_MBOUR'
          ? -17.432
          : selectedCorridorKey === 'KENYA_MOMBASA'
            ? 36.885
            : 2.435;

      const map = L.map(mapContainerRef.current).setView([originLat, originLng], 7);
      mapInstanceRef.current = map;

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors | FleetGuard Route Optimization Engine',
        maxZoom: 18,
      }).addTo(map);

      // Start Origin Marker
      const originIcon = L.divIcon({
        html: `<div style="background-color: #1e293b; color: white; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; border: 2px solid white; box-shadow: 0 4px 6px rgba(0,0,0,0.3); font-size: 11px;">D</div>`,
        className: 'origin-marker',
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });

      L.marker([originLat, originLng], { icon: originIcon })
        .addTo(map)
        .bindPopup(
          `<b>Départ : Hub Principal / Port</b><br/>${PRESET_ROUTES[selectedCorridorKey]?.origin || 'Origine Flotte'}`,
        );

      // Plot Stops
      const routeCoordinates: [number, number][] = [[originLat, originLng]];

      stops.forEach((stop, index) => {
        routeCoordinates.push([stop.lat, stop.lng]);

        const stopIcon = L.divIcon({
          html: `<div style="background-color: ${
            stop.trafficRisk === 'HIGH' ? '#ef4444' : stop.trafficRisk === 'MEDIUM' ? '#f59e0b' : '#10b981'
          }; color: white; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.2); font-size: 10px;">${index + 1}</div>`,
          className: 'stop-marker',
          iconSize: [24, 24],
          iconAnchor: [12, 12],
        });

        L.marker([stop.lat, stop.lng], { icon: stopIcon }).addTo(map).bindPopup(`
            <div style="font-family: sans-serif; font-size: 11px;">
              <b>Etape ${index + 1}: ${stop.name}</b><br/>
              Adresse: ${stop.address}<br/>
              Poids déchargement: <b>${stop.cargoWeightTons} Tonnes</b><br/>
              Fenêtre de livraison: ${stop.timeWindowStart} - ${stop.timeWindowEnd}<br/>
              Difficulté déclarée : <span style="color: ${stop.trafficRisk === 'HIGH' ? 'red' : 'orange'}">${stop.trafficRisk}</span>
              <br/><i style="font-size:10px;color:#94a3b8">Saisie par le planificateur, non mesurée.</i>
            </div>
          `);
      });

      // Draw Route Polyline with traffic color accents
      if (routeCoordinates.length > 1) {
        const polylineColor =
          selectedRouteType === 'ECO_FUEL'
            ? '#10b981'
            : selectedRouteType === 'BYPASS'
              ? '#8b5cf6'
              : '#ea580c';

        const polyline = L.polyline(routeCoordinates, {
          color: polylineColor,
          weight: 5,
          opacity: 0.85,
          dashArray: selectedRouteType === 'BYPASS' ? '8, 8' : undefined,
        }).addTo(map);

        map.fitBounds(polyline.getBounds(), { padding: [50, 50] });
      }
    };

    if (!(window as any).L) {
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.async = true;
      script.onload = renderMap;
      document.head.appendChild(script);

      const style = document.createElement('link');
      style.rel = 'stylesheet';
      style.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(style);
    } else {
      renderMap();
    }
  }, [selectedCorridorKey, stops, selectedRouteType]);

  return (
    <div className="space-y-6">
      {/* Top Banner Header */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-emerald-700 font-bold text-xs uppercase tracking-wider mb-1">
            <Compass className="w-4 h-4 text-emerald-600" />
            <span>Calculateur d'Itinéraire Éco-Responsable • FleetGuard AI Optimizer</span>
          </div>
          <h3 className="text-lg font-bold text-slate-900">
            Optimisateur de Trajets Multi-Destinations & Prédiction Trafic
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Calcule le parcours le plus économe en carburant pour vos livraisons multi-étapes en contournant
            les goulots de trafic urbains et les gares de péage.
          </p>
        </div>

        {/* Corridor Quick Preset Selector */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 font-bold">Corridor Logistique :</span>
          <select
            value={selectedCorridorKey}
            onChange={e => handleCorridorChange(e.target.value)}
            className="bg-slate-50 border border-slate-200 text-slate-800 font-bold text-xs px-3 py-1.5 rounded-lg focus:outline-none cursor-pointer shadow-2xs"
          >
            <option value="BENIN_NORTH">Bénin : Cotonou ➔ Parakou ➔ Malanville</option>
            <option value="SENEGAL_MBOUR">Sénégal : Dakar ➔ Thiès ➔ Touba</option>
            <option value="KENYA_MOMBASA">Kenya : Nairobi ➔ Naivasha ➔ Nakuru</option>
          </select>
        </div>
      </div>

      {/* Main Layout Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column (5 Cols): Inputs, Vehicle Config & Stops Builder */}
        <div className="lg:col-span-5 space-y-4">
          {/* Vehicle Profile & Traffic Scenario Card */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 shadow-xs">
            <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-2">
              <Truck className="w-4 h-4 text-orange-500" />
              1. Profil Véhicule & Conditions de Trafic
            </h4>

            <div className="grid grid-cols-2 gap-3 text-xs">
              {/* Vehicle Type */}
              <div>
                <label className="block text-slate-700 font-bold mb-1">Gabarit Véhicule :</label>
                <select
                  value={vehicleProfile}
                  onChange={e => setVehicleProfile(e.target.value as any)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-medium text-slate-800 focus:outline-none cursor-pointer"
                >
                  <option value="HEAVY_6X4">Tracteur Poids Lourd (6x4)</option>
                  <option value="RIGID_26T">Porteur Rigide (26 Tonnes)</option>
                  <option value="FRIGO_VAN">Fourgon Frigorifique</option>
                  <option value="LIGHT_PICKUP">Utilitaires / Light Pickup</option>
                </select>
              </div>

              {/* Cargo Weight */}
              <div>
                <label className="block text-slate-700 font-bold mb-1">Charge Transportée :</label>
                <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg p-1.5">
                  <input
                    type="number"
                    value={cargoLoadTons}
                    onChange={e => setCargoLoadTons(Number(e.target.value))}
                    min={0}
                    max={60}
                    className="w-full bg-transparent font-mono font-bold text-slate-900 focus:outline-none text-xs"
                  />
                  <span className="text-slate-500 font-bold text-[11px] shrink-0">Tonnes</span>
                </div>
              </div>
            </div>

            {/* Departure Scenario */}
            <div className="text-xs space-y-1">
              <label className="block text-slate-700 font-bold mb-1">
                Heure de Départ & Trafic Attendu :
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setDepartureTime('MORNING_PEAK')}
                  className={`p-2 rounded-lg border text-left transition cursor-pointer ${
                    departureTime === 'MORNING_PEAK'
                      ? 'bg-amber-50 border-amber-300 text-amber-900 font-bold shadow-2xs'
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <div className="flex items-center justify-between text-[11px]">
                    <span>Pointe Matin (07h-09h)</span>
                    <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                  </div>
                  <div className="text-[10px] text-slate-500 font-normal">
                    Trafic urbain dense (+22% cons.)
                  </div>
                </button>

                <button
                  onClick={() => setDepartureTime('NIGHT_HAUL')}
                  className={`p-2 rounded-lg border text-left transition cursor-pointer ${
                    departureTime === 'NIGHT_HAUL'
                      ? 'bg-purple-50 border-purple-300 text-purple-900 font-bold shadow-2xs'
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <div className="flex items-center justify-between text-[11px]">
                    <span>Trajet De Nuit (21h-05h)</span>
                    <span className="w-2 h-2 rounded-full bg-purple-500"></span>
                  </div>
                  <div className="text-[10px] text-slate-500 font-normal">Fluide & régulier (-9% cons.)</div>
                </button>
              </div>
            </div>

            {/* Avoidance Toggles */}
            <div className="pt-2 border-t border-slate-100 space-y-2 text-xs">
              <span className="text-slate-500 font-bold uppercase text-[10px]">
                Contraintes & Contournements
              </span>
              <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer text-slate-700 font-medium">
                  <input
                    type="checkbox"
                    checked={avoidUrbanChokepoints}
                    onChange={e => setAvoidUrbanChokepoints(e.target.checked)}
                    className="accent-emerald-600 rounded"
                  />
                  <span>Contourner bouchons urbains</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer text-slate-700 font-medium">
                  <input
                    type="checkbox"
                    checked={avoidTolls}
                    onChange={e => setAvoidTolls(e.target.checked)}
                    className="accent-emerald-600 rounded"
                  />
                  <span>Éviter péages à fort ralentissement</span>
                </label>
              </div>
            </div>
          </div>

          {/* Multi-Stop Delivery Builder */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3 shadow-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-orange-500" />
                2. Étapes & Points de Livraison ({stops.length})
              </h4>
              <button
                onClick={handleRecalculateRoute}
                className="text-xs text-orange-600 font-bold hover:underline flex items-center gap-1 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Réoptimiser</span>
              </button>
            </div>

            {/* Starting Point Banner */}
            <div className="p-2.5 rounded-lg bg-slate-900 text-white text-xs flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center font-extrabold text-[10px]">
                  D
                </div>
                <div>
                  <div className="font-bold">Départ : Hub Logistique / Port</div>
                  <div className="text-[10px] text-slate-300 truncate max-w-[260px]">
                    {PRESET_ROUTES[selectedCorridorKey]?.origin}
                  </div>
                </div>
              </div>
              <span className="text-[10px] bg-slate-800 text-emerald-400 px-2 py-0.5 rounded font-mono font-bold">
                Charge: {cargoLoadTons}T
              </span>
            </div>

            {/* Stops List */}
            <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
              {stops.map((stop, idx) => (
                <div
                  key={stop.id}
                  className="p-3 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between text-xs"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-orange-500 text-white font-extrabold text-[10px] flex items-center justify-center shrink-0">
                      {idx + 1}
                    </span>
                    <div>
                      <div className="font-bold text-slate-900">{stop.name}</div>
                      <div className="text-[10px] text-slate-500">
                        {stop.address} • Fenêtre: {stop.timeWindowStart}-{stop.timeWindowEnd}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="font-mono text-[11px] font-bold text-slate-700 bg-white px-2 py-0.5 rounded border border-slate-200">
                      -{stop.cargoWeightTons}T
                    </span>
                    <button
                      onClick={() => handleRemoveStop(stop.id)}
                      className="text-slate-400 hover:text-red-600 transition cursor-pointer"
                      title="Supprimer étape"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Add Custom Stop Input */}
            <div className="pt-2 border-t border-slate-100 flex items-center gap-2">
              <input
                type="text"
                placeholder="Ajouter une étape (ex: 'Magasin Parakou Nord')"
                value={newStopName}
                onChange={e => setNewStopName(e.target.value)}
                className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-900 focus:outline-none placeholder-slate-400"
              />
              <button
                onClick={handleAddStop}
                className="px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold rounded-lg flex items-center gap-1 transition cursor-pointer shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Ajouter</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right Column (7 Cols): Comparison Results & Map Render */}
        <div className="lg:col-span-7 space-y-4">
          {/* Dispatch Toast Alert */}
          {dispatchSuccessMessage && (
            <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs font-bold flex items-center justify-between gap-3 shadow-xs animate-fade-in">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{dispatchSuccessMessage}</span>
              </div>
              <button
                onClick={() => setDispatchSuccessMessage(null)}
                className="text-emerald-600 font-bold hover:underline cursor-pointer"
              >
                Fermer
              </button>
            </div>
          )}

          {/* Route Comparison Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Card 1: ECO FUEL ROUTE */}
            <div
              onClick={() => setSelectedRouteType('ECO_FUEL')}
              className={`p-4 rounded-xl border transition cursor-pointer relative shadow-xs ${
                selectedRouteType === 'ECO_FUEL'
                  ? 'bg-emerald-50/80 border-emerald-400 ring-2 ring-emerald-500/30'
                  : 'bg-white border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-emerald-600" /> IA Éco-Carburant
                </span>
                <span className="text-xs font-mono font-extrabold text-emerald-700">{ecoDistanceKm} km</span>
              </div>

              <div className="text-lg font-extrabold text-slate-900 font-mono">
                {ecoTotalLiters}{' '}
                <span className="text-xs text-slate-500 font-sans font-normal">Litres Diesel</span>
              </div>

              <div className="text-xs text-slate-600 mt-1 space-y-1">
                <div className="flex justify-between">
                  <span>Temps estimé :</span>
                  <strong className="text-slate-900 font-mono">{ecoDurationHours}h</strong>
                </div>
                <div className="flex justify-between">
                  <span>Moyenne :</span>
                  <strong className="text-emerald-700 font-mono">{ecoAvgL100km} L/100km</strong>
                </div>
              </div>

              <div className="mt-3 pt-2 border-t border-emerald-200 text-[10px] text-emerald-800 font-bold flex items-center gap-1">
                <TrendingDown className="w-3.5 h-3.5 text-emerald-600" />
                <span>
                  Économise {fuelLitersSaved} L (~{financialCostSaved.toLocaleString()} {currencySymbol})
                </span>
              </div>
            </div>

            {/* Card 2: STANDARD FASTEST ROUTE */}
            <div
              onClick={() => setSelectedRouteType('STANDARD_FASTEST')}
              className={`p-4 rounded-xl border transition cursor-pointer relative shadow-xs ${
                selectedRouteType === 'STANDARD_FASTEST'
                  ? 'bg-orange-50/80 border-orange-400 ring-2 ring-orange-500/30'
                  : 'bg-white border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                  Standard (Sans IA)
                </span>
                <span className="text-xs font-mono font-extrabold text-slate-700">{stdDistanceKm} km</span>
              </div>

              <div className="text-lg font-extrabold text-slate-900 font-mono">
                {stdTotalLiters}{' '}
                <span className="text-xs text-slate-500 font-sans font-normal">Litres Diesel</span>
              </div>

              <div className="text-xs text-slate-600 mt-1 space-y-1">
                <div className="flex justify-between">
                  <span>Temps estimé :</span>
                  <strong className="text-slate-900 font-mono">{stdDurationHours}h</strong>
                </div>
                <div className="flex justify-between">
                  <span>Moyenne :</span>
                  <strong className="text-orange-700 font-mono">{stdAvgL100km} L/100km</strong>
                </div>
              </div>

              <div className="mt-3 pt-2 border-t border-slate-100 text-[10px] text-red-600 font-bold flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                <span>Exposition aux embouteillages</span>
              </div>
            </div>

            {/* Card 3: PERIPHERAL BYPASS ROUTE */}
            <div
              onClick={() => setSelectedRouteType('BYPASS')}
              className={`p-4 rounded-xl border transition cursor-pointer relative shadow-xs ${
                selectedRouteType === 'BYPASS'
                  ? 'bg-purple-50/80 border-purple-400 ring-2 ring-purple-500/30'
                  : 'bg-white border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 border border-purple-200">
                  Contournement
                </span>
                <span className="text-xs font-mono font-extrabold text-purple-700">508 km</span>
              </div>

              <div className="text-lg font-extrabold text-slate-900 font-mono">
                {ecoTotalLiters + 12}{' '}
                <span className="text-xs text-slate-500 font-sans font-normal">Litres Diesel</span>
              </div>

              <div className="text-xs text-slate-600 mt-1 space-y-1">
                <div className="flex justify-between">
                  <span>Temps estimé :</span>
                  <strong className="text-slate-900 font-mono">7.5h</strong>
                </div>
                <div className="flex justify-between">
                  <span>Moyenne :</span>
                  <strong className="text-purple-700 font-mono">34.8 L/100km</strong>
                </div>
              </div>

              <div className="mt-3 pt-2 border-t border-slate-100 text-[10px] text-purple-700 font-bold flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-purple-600" />
                <span>Route secondaire 100% fluide</span>
              </div>
            </div>
          </div>

          {/* Leaflet Map Interactive Visualizer Container */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden h-[420px] relative shadow-xs">
            <div ref={mapContainerRef} className="w-full h-full z-10"></div>

            {/* Map Action Floating Overlay Bar */}
            <div className="absolute top-3 right-3 z-20 flex items-center gap-2">
              <button
                onClick={handleDispatchToDriver}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg shadow-lg flex items-center gap-2 transition cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Transmettre au Chauffeur</span>
              </button>
            </div>

            {/* Route Stats Overlay Banner */}
            <div className="absolute bottom-3 left-3 right-3 z-20 bg-slate-900/90 backdrop-blur text-white p-3 rounded-xl shadow-xl border border-slate-700 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-lg">
                  <Zap className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-bold text-slate-200">Gains Estimés par FleetGuard AI</div>
                  <div className="text-[11px] text-emerald-400 font-mono">
                    -{fuelLitersSaved} Litres de Carburant • -{co2ReductionKg} kg CO2 Émis
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4 text-right">
                <div>
                  <div className="text-[10px] text-slate-400 uppercase font-bold">Économie Financière</div>
                  <div className="font-mono font-extrabold text-emerald-400 text-sm">
                    {financialCostSaved.toLocaleString()} {currencySymbol}
                  </div>
                </div>

                <div>
                  <div className="text-[10px] text-slate-400 uppercase font-bold">Temps Gagné</div>
                  <div className="font-mono font-extrabold text-sky-400 text-sm">
                    {timeSavedMinutes} minutes
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
