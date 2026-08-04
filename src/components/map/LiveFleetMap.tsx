import React, { useEffect, useRef, useState } from 'react';
import { MOCK_VEHICLES, MOCK_DRIVERS, MOCK_GEOFENCES, MOCK_ROUTE_POINTS, MOCK_FUEL_STATIONS } from '../../data/mock-data';
import { Organization, GpsPoint, FuelStation } from '../../types';
import { useTheme } from '../../context/ThemeContext';
import {
  MapPin,
  Navigation,
  Gauge,
  ShieldAlert,
  Radio,
  RefreshCw,
  Send,
  CheckCircle2,
  Layers,
  CloudRain,
  Activity,
  Mountain,
  Eye,
  Sun,
  Wind,
  AlertTriangle,
  Zap,
  Fuel,
  Compass,
  Truck,
  Phone,
  ExternalLink,
  ShieldCheck,
  Check,
  Map as MapIcon
} from 'lucide-react';

interface LiveFleetMapProps {
  currentOrg: Organization;
}

export type BaseMapStyle = 'streets' | 'terrain' | 'satellite';

// Haversine distance calculator in KM
function calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

export const LiveFleetMap: React.FC<LiveFleetMapProps> = ({ currentOrg }) => {
  const { isDark } = useTheme();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const layerGroupRef = useRef<{
    tile?: any;
    traffic?: any[];
    weather?: any[];
    geofences?: any[];
    fuelStations?: any[];
    refuelLine?: any;
    route?: any;
    markers?: any[];
  }>({});

  const [selectedVehicleId, setSelectedVehicleId] = useState<string>(MOCK_VEHICLES[0].id);
  const [routePoints, setRoutePoints] = useState<GpsPoint[]>(MOCK_ROUTE_POINTS);
  const [isSimulatingBatch, setIsSimulatingBatch] = useState<boolean>(false);
  const [simulatedBatchCount, setSimulatedBatchCount] = useState<number>(0);

  // Map Layer States
  const [baseMapStyle, setBaseMapStyle] = useState<BaseMapStyle>('streets');
  const [showTraffic, setShowTraffic] = useState<boolean>(true);
  const [showWeather, setShowWeather] = useState<boolean>(true);
  const [showGeofences, setShowGeofences] = useState<boolean>(true);
  const [showFuelStations, setShowFuelStations] = useState<boolean>(true);
  const [showLayerPanel, setShowLayerPanel] = useState<boolean>(true);

  // Refueling Route Planning State
  const [selectedFuelStationId, setSelectedFuelStationId] = useState<string | null>(null);

  // Filter vehicles for active tenant
  const tenantVehicles = MOCK_VEHICLES.filter(v => v.organizationId === currentOrg.id);
  const activeVehicle = tenantVehicles.find(v => v.id === selectedVehicleId) || tenantVehicles[0];
  const activeDriver = MOCK_DRIVERS.find(d => d.id === activeVehicle?.currentDriverId);

  // Active Vehicle GPS Position
  const lastGpsPoint = routePoints[routePoints.length - 1] || { latitude: 7.9124, longitude: 2.1092 };

  // Calculate nearby fuel stations sorted by distance from active vehicle
  const sortedFuelStations = [...MOCK_FUEL_STATIONS]
    .map(stn => {
      const distanceKm = calculateDistanceKm(
        lastGpsPoint.latitude,
        lastGpsPoint.longitude,
        stn.latitude,
        stn.longitude
      );
      return { ...stn, distanceKm };
    })
    .sort((a, b) => a.distanceKm - b.distanceKm);

  const selectedStation = sortedFuelStations.find(s => s.id === selectedFuelStationId) || null;

  useEffect(() => {
    // Dynamically load Leaflet styles & script if not available
    if (typeof window === 'undefined' || !mapContainerRef.current) return;

    let L = (window as any).L;

    const initMap = () => {
      if (!mapContainerRef.current) return;
      L = (window as any).L;
      if (!L) return;

      // Center map around West Africa / East Africa based on organization country
      const centerLat = currentOrg.country === 'Sénégal' ? 14.6928 : currentOrg.country.includes('Kenya') ? -1.2921 : 7.9124;
      const centerLng = currentOrg.country === 'Sénégal' ? -17.4467 : currentOrg.country.includes('Kenya') ? 36.8219 : 2.1092;

      if (!mapInstanceRef.current) {
        const map = L.map(mapContainerRef.current).setView([centerLat, centerLng], 7);
        mapInstanceRef.current = map;
      }

      const map = mapInstanceRef.current;

      // Clear existing layer groups if present
      if (layerGroupRef.current.tile) {
        map.removeLayer(layerGroupRef.current.tile);
      }
      if (layerGroupRef.current.traffic) {
        layerGroupRef.current.traffic.forEach((l: any) => map.removeLayer(l));
      }
      if (layerGroupRef.current.weather) {
        layerGroupRef.current.weather.forEach((l: any) => map.removeLayer(l));
      }
      if (layerGroupRef.current.geofences) {
        layerGroupRef.current.geofences.forEach((l: any) => map.removeLayer(l));
      }
      if (layerGroupRef.current.fuelStations) {
        layerGroupRef.current.fuelStations.forEach((l: any) => map.removeLayer(l));
      }
      if (layerGroupRef.current.refuelLine) {
        map.removeLayer(layerGroupRef.current.refuelLine);
      }
      if (layerGroupRef.current.route) {
        map.removeLayer(layerGroupRef.current.route);
      }
      if (layerGroupRef.current.markers) {
        layerGroupRef.current.markers.forEach((l: any) => map.removeLayer(l));
      }

      layerGroupRef.current = { traffic: [], weather: [], geofences: [], fuelStations: [], markers: [] };

      // Base Tile Layer selection
      let tileUrl = isDark && baseMapStyle === 'streets'
        ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
        : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
      let tileAttr = isDark && baseMapStyle === 'streets'
        ? '&copy; OpenStreetMap contributors &copy; CARTO | FleetGuard Africa'
        : '&copy; OpenStreetMap contributors | FleetGuard Africa';

      if (baseMapStyle === 'terrain') {
        tileUrl = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}';
        tileAttr = 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ, TomTom, Intermap, iPC, USGS, FAO, NPS, NRCAN, GeoBase, IGN, Kadaster NL, Ordnance Survey, Esri Japan, METI, Esri China (Hong Kong), swisstopo, MapmyIndia, OpenStreetMap contributors, and the GIS User Community';
      } else if (baseMapStyle === 'satellite') {
        tileUrl = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
        tileAttr = 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community';
      }

      const newTileLayer = L.tileLayer(tileUrl, {
        attribution: tileAttr,
        maxZoom: 18,
      }).addTo(map);

      layerGroupRef.current.tile = newTileLayer;

      // 1. Geofences Layer
      if (showGeofences) {
        const tenantGeofences = MOCK_GEOFENCES.filter(g => g.organizationId === currentOrg.id);
        tenantGeofences.forEach(geo => {
          if (geo.centerLat && geo.centerLng) {
            const circle = L.circle([geo.centerLat, geo.centerLng], {
              color: geo.type === 'PORT' ? '#0ea5e9' : geo.type === 'BORDER_POST' ? '#f59e0b' : '#10b981',
              fillColor: geo.type === 'PORT' ? '#38bdf8' : geo.type === 'BORDER_POST' ? '#fbbf24' : '#34d399',
              fillOpacity: 0.18,
              radius: geo.radiusMeters || 1500,
            }).addTo(map).bindPopup(`
              <div style="font-family: sans-serif; font-size: 11px;">
                <b>Géofence Sécurisée : ${geo.name}</b><br/>
                Type: <b>${geo.type}</b> | Vitesse max: <b>${geo.speedLimitKmH || 30} km/h</b><br/>
                Rayon: ${(geo.radiusMeters || 1000) / 1000} km
              </div>
            `);
            layerGroupRef.current.geofences?.push(circle);
          }
        });
      }

      // 2. Traffic Overlay Layer
      if (showTraffic && routePoints.length > 1) {
        for (let i = 0; i < routePoints.length - 1; i++) {
          const p1 = routePoints[i];
          const p2 = routePoints[i + 1];
          const isCongested = p1.speedKmH < 25;
          const isModerate = p1.speedKmH >= 25 && p1.speedKmH < 50;
          const color = isCongested ? '#ef4444' : isModerate ? '#f59e0b' : '#10b981';
          const trafficLabel = isCongested ? 'Trafic Très Dense (Ralentissement)' : isModerate ? 'Trafic Modéré' : 'Fluide';

          const trafficPolyline = L.polyline(
            [
              [p1.latitude, p1.longitude],
              [p2.latitude, p2.longitude],
            ],
            {
              color: color,
              weight: 8,
              opacity: 0.65,
              lineCap: 'round',
            }
          ).addTo(map).bindPopup(`
            <div style="font-family: sans-serif; font-size: 11px;">
              <b>Densité du Trafic Routier</b><br/>
              État: <span style="color: ${color}; font-weight: bold;">${trafficLabel}</span><br/>
              Vitesse estimée: <b>${p1.speedKmH} km/h</b>
            </div>
          `);

          layerGroupRef.current.traffic?.push(trafficPolyline);
        }
      }

      // 3. Weather Overlay Layer
      if (showWeather) {
        const weatherZones = [
          {
            lat: centerLat + 0.3,
            lng: centerLng + 0.1,
            radius: 12000,
            type: 'Orage Violente & Visibilité Réduite',
            color: '#3b82f6',
            icon: '⛈️',
          },
          {
            lat: centerLat + 0.8,
            lng: centerLng + 0.25,
            radius: 18000,
            type: 'Pluie Forte & Risque d\'Aqualissage',
            color: '#0284c7',
            icon: '🌧️',
          },
        ];

        weatherZones.forEach(w => {
          const wCircle = L.circle([w.lat, w.lng], {
            color: w.color,
            fillColor: w.color,
            fillOpacity: 0.25,
            radius: w.radius,
            dashArray: '5, 10',
          }).addTo(map).bindPopup(`
            <div style="font-family: sans-serif; font-size: 11px;">
              <b>Zone Météo Perturbée ${w.icon}</b><br/>
              Conditions: <b>${w.type}</b><br/>
              Alerte Sécurité Flotte: <i>Réduire la vitesse de 20 km/h</i>
            </div>
          `);

          layerGroupRef.current.weather?.push(wCircle);
        });
      }

      // 4. Fuel Stations Layer (Stations-Service Zone Isolée)
      if (showFuelStations) {
        sortedFuelStations.forEach(stn => {
          const isSelected = stn.id === selectedFuelStationId;

          const brandBgColor = stn.brand === 'TOTAL_ENERGIES'
            ? '#ea580c'
            : stn.brand === 'ORYX'
            ? '#0284c7'
            : stn.brand === 'SHELL'
            ? '#eab308'
            : stn.brand === 'CORLAY'
            ? '#16a34a'
            : '#6366f1';

          const stockColor = stn.fuelStockStatus === 'OPTIMAL' ? '#10b981' : stn.fuelStockStatus === 'MEDIUM' ? '#f59e0b' : '#ef4444';

          const markerHtml = `
            <div style="
              background-color: ${brandBgColor};
              color: white;
              padding: 4px 8px;
              border-radius: 8px;
              border: ${isSelected ? '3px solid #f97316' : '2px solid white'};
              box-shadow: 0 4px 12px rgba(0,0,0,0.35);
              font-family: sans-serif;
              font-size: 10px;
              font-weight: bold;
              display: flex;
              align-items: center;
              gap: 4px;
              cursor: pointer;
              transform: ${isSelected ? 'scale(1.15)' : 'scale(1)'};
              transition: all 0.2s ease;
            ">
              <span style="font-size: 12px;">⛽</span>
              <span>${stn.brand}</span>
              <span style="background: ${stockColor}; width: 6px; height: 6px; border-radius: 50%; display: inline-block;"></span>
            </div>
          `;

          const fuelIcon = L.divIcon({
            html: markerHtml,
            className: 'custom-fuel-marker',
            iconSize: [85, 28],
            iconAnchor: [42, 14],
          });

          const fuelMarker = L.marker([stn.latitude, stn.longitude], { icon: fuelIcon })
            .addTo(map)
            .bindPopup(`
              <div style="font-family: sans-serif; font-size: 11px; min-width: 210px; padding: 2px;">
                <div style="display: flex; items-center; justify-content: space-between; gap: 8px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; margin-bottom: 6px;">
                  <b style="color: #0f172a; font-size: 12px;">⛽ ${stn.name}</b>
                </div>

                <div style="margin-bottom: 6px; color: #475569;">
                  📍 <b>${stn.city} (${stn.country})</b><br/>
                  🛣️ <i>${stn.address}</i>
                </div>

                <div style="background: #f8fafc; border: 1px solid #cbd5e1; padding: 6px; border-radius: 6px; margin-bottom: 6px; font-size: 10px;">
                  <div style="display: flex; justify-content: space-between;">
                    <span>📍 Distance du camion (${activeVehicle?.immatriculation || 'Flotte'}):</span>
                    <b style="color: #ea580c;">${stn.distanceKm} km</b>
                  </div>
                  <div style="display: flex; justify-content: space-between; margin-top: 2px;">
                    <span>⛽ Prix Gazole / L :</span>
                    <b>${stn.fuelPrices.dieselPriceXOF} ${currentOrg.currency}</b>
                  </div>
                  ${
                    stn.hasAdBlue
                      ? `<div style="display: flex; justify-content: space-between; color: #0284c7; margin-top: 2px;">
                          <span>💧 AdBlue Poids Lourds :</span>
                          <b>${stn.fuelPrices.adbluePriceXOF || 1200} ${currentOrg.currency}/L</b>
                        </div>`
                      : ''
                  }
                </div>

                <div style="display: flex; flex-wrap: wrap; gap: 3px; margin-bottom: 6px;">
                  ${stn.is24h ? '<span style="background: #dcfce7; color: #15803d; padding: 2px 4px; border-radius: 4px; font-weight: bold; font-size: 9px;">24h/24</span>' : ''}
                  ${stn.hasAdBlue ? '<span style="background: #e0f2fe; color: #0369a1; padding: 2px 4px; border-radius: 4px; font-weight: bold; font-size: 9px;">AdBlue dispo</span>' : ''}
                  ${stn.hasHeavyTruckParking ? '<span style="background: #fef3c7; color: #b45309; padding: 2px 4px; border-radius: 4px; font-weight: bold; font-size: 9px;">Parking Poids Lourds</span>' : ''}
                  ${stn.hasRestArea ? '<span style="background: #f3e8ff; color: #6b21a8; padding: 2px 4px; border-radius: 4px; font-weight: bold; font-size: 9px;">Aire Repos</span>' : ''}
                </div>

                <div style="font-size: 10px; margin-bottom: 8px;">
                  Stock Carburant : <b style="color: ${stockColor};">${stn.fuelStockStatus === 'OPTIMAL' ? 'Stock Optimal (Sans File)' : stn.fuelStockStatus === 'MEDIUM' ? 'Stock Limité' : 'Risque Pénurie'}</b>
                </div>
              </div>
            `);

          layerGroupRef.current.fuelStations?.push(fuelMarker);
        });
      }

      // 5. Draw Primary Route Polyline
      const latLngs = routePoints.map(p => [p.latitude, p.longitude]);
      if (latLngs.length > 0) {
        const polyline = L.polyline(latLngs, { color: '#f59e0b', weight: 4, opacity: 0.95 }).addTo(map);
        layerGroupRef.current.route = polyline;

        // Draw Refueling Vector if a station is selected
        if (selectedStation && lastGpsPoint) {
          const refuelPolyline = L.polyline(
            [
              [lastGpsPoint.latitude, lastGpsPoint.longitude],
              [selectedStation.latitude, selectedStation.longitude],
            ],
            {
              color: '#ea580c',
              weight: 3,
              dashArray: '8, 8',
              opacity: 0.9,
            }
          ).addTo(map).bindPopup(`
            <div style="font-family: sans-serif; font-size: 11px;">
              <b>Axe de Ravitaillement Express</b><br/>
              Camion: <b>${activeVehicle?.immatriculation}</b> &rarr; Station: <b>${selectedStation.name}</b><br/>
              Distance à parcourir: <b style="color: #ea580c;">${selectedStation.distanceKm} km</b>
            </div>
          `);

          layerGroupRef.current.refuelLine = refuelPolyline;
          map.flyTo([selectedStation.latitude, selectedStation.longitude], 10);
        } else {
          map.fitBounds(polyline.getBounds(), { padding: [40, 40] });
        }

        // Add Markers for Route Points
        routePoints.forEach((point, idx) => {
          const isLatest = idx === routePoints.length - 1;
          const markerColor = point.eventFlags?.includes('OVER_SPEED')
            ? 'rose'
            : point.eventFlags?.includes('HARSH_BRAKE')
            ? 'amber'
            : isLatest
            ? 'emerald'
            : 'sky';

          const markerHtml = `<div style="background-color: ${
            markerColor === 'rose' ? '#ef4444' : markerColor === 'amber' ? '#f59e0b' : markerColor === 'emerald' ? '#10b981' : '#0284c7'
          }; width: 14px; height: 14px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 10px rgba(0,0,0,0.5);"></div>`;

          const customIcon = L.divIcon({
            html: markerHtml,
            className: 'custom-gps-marker',
            iconSize: [14, 14],
            iconAnchor: [7, 7],
          });

          const marker = L.marker([point.latitude, point.longitude], { icon: customIcon })
            .addTo(map)
            .bindPopup(`
              <div style="font-family: sans-serif; font-size: 11px;">
                <b>Camion: ${activeVehicle?.immatriculation || 'Flotte'}</b><br/>
                Vitesse: <b>${point.speedKmH} km/h</b><br/>
                Horodatage: ${new Date(point.timestamp).toLocaleTimeString()}<br/>
                Réseau: ${point.networkType} | Batterie: ${point.batteryLevelPct}%
                ${point.eventFlags?.length ? `<br/><span style="color:red; font-weight:bold;">Alerte: ${point.eventFlags.join(', ')}</span>` : ''}
              </div>
            `);

          layerGroupRef.current.markers?.push(marker);
        });
      }
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
  }, [currentOrg, routePoints, selectedVehicleId, baseMapStyle, showTraffic, showWeather, showGeofences, showFuelStations, selectedFuelStationId, isDark]);

  // Simulate Mobile GPS Batch Ingestion
  const handleSimulateGPSBatch = () => {
    setIsSimulatingBatch(true);
    setTimeout(() => {
      const lastPoint = routePoints[routePoints.length - 1];
      const newPoint: GpsPoint = {
        latitude: lastPoint.latitude + 0.05,
        longitude: lastPoint.longitude + 0.03,
        speedKmH: Math.floor(60 + Math.random() * 35),
        headingDegree: Math.floor(Math.random() * 360),
        timestamp: new Date().toISOString(),
        accuracyMeters: 3.5,
        ignitionOn: true,
        batteryLevelPct: Math.max(20, lastPoint.batteryLevelPct - 1),
        networkType: Math.random() > 0.3 ? '4G' : '3G',
        eventFlags: Math.random() > 0.7 ? ['OVER_SPEED'] : undefined,
      };

      setRoutePoints(prev => [...prev, newPoint]);
      setSimulatedBatchCount(c => c + 1);
      setIsSimulatingBatch(false);
    }, 800);
  };

  return (
    <div className="space-y-6">
      {/* Control Header Bar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4 shadow-xs transition-colors">
        <div>
          <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <MapPin className="w-5 h-5 text-orange-500" />
            <span>Suivi Télématique & Carte des Corridors en Temps Réel</span>
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Supervision multi-tenant de la flotte, alertes météo, trafic routier et stations de ravitaillement zone isolée.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleSimulateGPSBatch}
            disabled={isSimulatingBatch}
            className="px-3.5 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs flex items-center gap-2 shadow-xs transition disabled:opacity-50 cursor-pointer"
          >
            {isSimulatingBatch ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            <span>Simuler Ingestion Batch Mobile (X-Batch-Id)</span>
          </button>
          {simulatedBatchCount > 0 && (
            <span className="px-2.5 py-1 rounded-lg bg-green-50 dark:bg-green-950/50 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800 text-xs font-semibold flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
              {simulatedBatchCount} Batch(s) Synchronisé(s)
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left Side: Vehicle Selector */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3 shadow-xs transition-colors">
          <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
            Véhicules en Circulation ({tenantVehicles.length})
          </div>

          <div className="space-y-2">
            {tenantVehicles.map(veh => {
              const isSelected = veh.id === selectedVehicleId;
              const driver = MOCK_DRIVERS.find(d => d.id === veh.currentDriverId);

              return (
                <div
                  key={veh.id}
                  onClick={() => {
                    setSelectedVehicleId(veh.id);
                    setSelectedFuelStationId(null);
                  }}
                  className={`p-3 rounded-lg border cursor-pointer transition ${
                    isSelected
                      ? 'bg-orange-50 dark:bg-orange-500/10 border-orange-300 dark:border-orange-500/40 text-slate-900 dark:text-slate-100 shadow-2xs'
                      : 'bg-slate-50/70 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700/80 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-xs text-orange-600 dark:text-orange-400">{veh.immatriculation}</span>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                        veh.status === 'ACTIVE'
                          ? 'bg-green-50 dark:bg-green-950/60 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800'
                          : 'bg-orange-50 dark:bg-orange-950/60 text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-800'
                      }`}
                    >
                      {veh.status}
                    </span>
                  </div>

                  <div className="text-xs font-bold text-slate-900 dark:text-slate-100 mt-1">
                    {veh.make} {veh.model}
                  </div>

                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 flex items-center justify-between">
                    <span>Chauffeur: {driver?.fullName.split(' ')[0] || 'Non assigné'}</span>
                    <span className="font-mono text-slate-700 dark:text-slate-300">{veh.currentOdometerKm.toLocaleString()} km</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Active Telemetry Widget */}
          {activeVehicle && (
            <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 space-y-2 text-xs">
              <div className="text-slate-500 dark:text-slate-400 font-bold uppercase text-[10px] flex items-center gap-1">
                <Radio className="w-3.5 h-3.5 text-green-600 dark:text-green-400 animate-pulse" />
                Dernier Point GPS Capteur
              </div>

              <div className="bg-slate-900 p-3 rounded-xl border border-slate-800 space-y-1.5 font-mono text-[11px] text-slate-200">
                <div className="flex justify-between">
                  <span className="text-slate-400">Vitesse :</span>
                  <span className="text-emerald-400 font-bold">{lastGpsPoint.speedKmH || 0} km/h</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Réseau :</span>
                  <span className="text-sky-400">{lastGpsPoint.networkType || '4G'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Batterie Tracker :</span>
                  <span className="text-amber-400">{lastGpsPoint.batteryLevelPct || 90}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Horodatage :</span>
                  <span className="text-slate-300">{new Date(lastGpsPoint.timestamp || '').toLocaleTimeString()}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Side: Map Container with Layer Control Panel */}
        <div className="lg:col-span-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden h-[580px] relative shadow-xs transition-colors">
          <div ref={mapContainerRef} className="w-full h-full z-10"></div>

          {/* Top Right Live Streaming Status Badge */}
          <div className="absolute top-4 right-4 z-20 bg-white/95 dark:bg-slate-900/95 backdrop-blur border border-slate-200 dark:border-slate-800 px-3 py-1.5 rounded-lg text-[11px] font-semibold text-slate-800 dark:text-slate-200 shadow-md flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-ping"></span>
            <span>Télémétrie en Direct</span>
          </div>

          {/* Floating Map Layer Control Panel (Top Left) */}
          <div className="absolute top-4 left-4 z-20 bg-slate-900/95 text-white backdrop-blur border border-slate-800 rounded-xl shadow-xl p-3.5 max-w-xs transition-all">
            <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
              <div className="flex items-center gap-2 font-bold text-xs text-slate-100">
                <Layers className="w-4 h-4 text-orange-400" />
                <span>Panneau de Calques & Overlays</span>
              </div>
              <button
                onClick={() => setShowLayerPanel(!showLayerPanel)}
                className="text-slate-400 hover:text-white text-[10px] font-bold underline cursor-pointer"
              >
                {showLayerPanel ? 'Masquer' : 'Afficher'}
              </button>
            </div>

            {showLayerPanel && (
              <div className="mt-3 space-y-3 text-xs">
                {/* 1. Base Map Selector */}
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                    Fond de Carte
                  </label>
                  <div className="grid grid-cols-3 gap-1.5 bg-slate-800/80 p-1 rounded-lg">
                    <button
                      onClick={() => setBaseMapStyle('streets')}
                      className={`py-1 px-2 rounded font-semibold text-[10px] transition flex items-center justify-center gap-1 cursor-pointer ${
                        baseMapStyle === 'streets'
                          ? 'bg-orange-500 text-white shadow-2xs'
                          : 'text-slate-300 hover:text-white hover:bg-slate-700/60'
                      }`}
                    >
                      <MapIcon className="w-3 h-3" />
                      <span>Standard</span>
                    </button>

                    <button
                      onClick={() => setBaseMapStyle('terrain')}
                      className={`py-1 px-2 rounded font-semibold text-[10px] transition flex items-center justify-center gap-1 cursor-pointer ${
                        baseMapStyle === 'terrain'
                          ? 'bg-orange-500 text-white shadow-2xs'
                          : 'text-slate-300 hover:text-white hover:bg-slate-700/60'
                      }`}
                    >
                      <Mountain className="w-3 h-3" />
                      <span>Relief</span>
                    </button>

                    <button
                      onClick={() => setBaseMapStyle('satellite')}
                      className={`py-1 px-2 rounded font-semibold text-[10px] transition flex items-center justify-center gap-1 cursor-pointer ${
                        baseMapStyle === 'satellite'
                          ? 'bg-orange-500 text-white shadow-2xs'
                          : 'text-slate-300 hover:text-white hover:bg-slate-700/60'
                      }`}
                    >
                      <Eye className="w-3 h-3" />
                      <span>Satellite</span>
                    </button>
                  </div>
                </div>

                {/* 2. Overlays Toggle Controls */}
                <div className="space-y-2 pt-1 border-t border-slate-800">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    Surcharges Actives
                  </span>

                  {/* Fuel Stations Layer Toggle */}
                  <label className="flex items-center justify-between p-2 rounded-lg bg-orange-950/30 border border-orange-500/30 hover:bg-orange-900/40 transition cursor-pointer">
                    <div className="flex items-center gap-2">
                      <Fuel className={`w-4 h-4 ${showFuelStations ? 'text-orange-400' : 'text-slate-500'}`} />
                      <span className="font-bold text-orange-200">Stations Carburant</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="bg-orange-500/20 text-orange-300 text-[10px] font-mono px-1.5 py-0.2 rounded border border-orange-500/30">
                        {sortedFuelStations.length}
                      </span>
                      <input
                        type="checkbox"
                        checked={showFuelStations}
                        onChange={(e) => setShowFuelStations(e.target.checked)}
                        className="accent-orange-500 w-4 h-4 cursor-pointer"
                      />
                    </div>
                  </label>

                  {/* Traffic Density Toggle */}
                  <label className="flex items-center justify-between p-2 rounded-lg bg-slate-800/50 hover:bg-slate-800 transition cursor-pointer">
                    <div className="flex items-center gap-2">
                      <Activity className={`w-4 h-4 ${showTraffic ? 'text-emerald-400' : 'text-slate-500'}`} />
                      <span className="font-medium text-slate-200">Densité du Trafic</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={showTraffic}
                      onChange={(e) => setShowTraffic(e.target.checked)}
                      className="accent-orange-500 w-4 h-4 cursor-pointer"
                    />
                  </label>

                  {/* Weather Overlay Toggle */}
                  <label className="flex items-center justify-between p-2 rounded-lg bg-slate-800/50 hover:bg-slate-800 transition cursor-pointer">
                    <div className="flex items-center gap-2">
                      <CloudRain className={`w-4 h-4 ${showWeather ? 'text-sky-400' : 'text-slate-500'}`} />
                      <span className="font-medium text-slate-200">Alertes Météo & Pluie</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={showWeather}
                      onChange={(e) => setShowWeather(e.target.checked)}
                      className="accent-orange-500 w-4 h-4 cursor-pointer"
                    />
                  </label>

                  {/* Geofences Overlay Toggle */}
                  <label className="flex items-center justify-between p-2 rounded-lg bg-slate-800/50 hover:bg-slate-800 transition cursor-pointer">
                    <div className="flex items-center gap-2">
                      <ShieldAlert className={`w-4 h-4 ${showGeofences ? 'text-amber-400' : 'text-slate-500'}`} />
                      <span className="font-medium text-slate-200">Géofences & Ports</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={showGeofences}
                      onChange={(e) => setShowGeofences(e.target.checked)}
                      className="accent-orange-500 w-4 h-4 cursor-pointer"
                    />
                  </label>
                </div>

                {/* Interactive Legend Footnote */}
                <div className="pt-2 border-t border-slate-800 text-[10px] text-slate-400 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-orange-500"></span>
                    <span>Station-Service (Gazole / AdBlue)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    <span>Trafic Fluide (&gt; 50 km/h)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                    <span>Ralentissement (25-50 km/h)</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Extended Section: Remote Corridor Fuel Refueling Planner */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs space-y-5 transition-colors">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <Fuel className="w-5 h-5 text-orange-500" />
              <h4 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Planificateur de Ravitaillement Carburant & Zones Isolées
              </h4>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-orange-50 dark:bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-200 dark:border-orange-500/30">
                Aide à la Décision
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Localisation en temps réel des stations à proximité du véhicule <strong className="text-slate-800 dark:text-slate-200">{activeVehicle?.immatriculation}</strong> pour éviter les pannes sèches en zones sans réseau ou isolées.
            </p>
          </div>

          {selectedFuelStationId && (
            <button
              onClick={() => setSelectedFuelStationId(null)}
              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-xs font-semibold text-slate-700 dark:text-slate-300 transition cursor-pointer"
            >
              Réinitialiser le Tracé
            </button>
          )}
        </div>

        {/* Active Vehicle Fuel Status Overview Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700/80">
            <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
              Véhicule Sélectionné
            </div>
            <div className="text-sm font-bold text-slate-900 dark:text-slate-100 mt-0.5 font-mono">
              {activeVehicle?.immatriculation}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {activeVehicle?.make} {activeVehicle?.model} ({activeVehicle?.type})
            </div>
          </div>

          <div className="bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700/80">
            <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
              Niveau Réservoir Estimé
            </div>
            <div className="text-sm font-bold text-amber-600 dark:text-amber-400 mt-0.5 flex items-center gap-1.5 font-mono">
              <span>32 %</span>
              <span className="text-xs font-normal text-slate-500 dark:text-slate-400">(~112 Litres / {activeVehicle?.tankCapacityLiters || 350}L)</span>
            </div>
            <div className="w-full bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full mt-2 overflow-hidden">
              <div className="bg-amber-500 h-full rounded-full" style={{ width: '32%' }}></div>
            </div>
          </div>

          <div className="bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700/80">
            <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
              Autonomie Autorisée
            </div>
            <div className="text-sm font-bold text-emerald-600 dark:text-emerald-400 mt-0.5 font-mono">
              ~ 280 KM
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
              Conso attendue: {activeVehicle?.expectedConsumptionL100km || 34}L / 100km
            </div>
          </div>

          <div className="bg-orange-50 dark:bg-orange-950/30 p-3.5 rounded-xl border border-orange-200 dark:border-orange-500/30">
            <div className="text-[10px] font-bold text-orange-700 dark:text-orange-400 uppercase tracking-wider flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5 text-orange-500" />
              Recommandation Régulateur
            </div>
            <div className="text-xs font-bold text-slate-900 dark:text-slate-100 mt-1 leading-snug">
              Prochain arrêt recommandé dans moins de 180 km avant la zone blanche du Sahel.
            </div>
          </div>
        </div>

        {/* Nearby Fuel Stations List & Action Cards */}
        <div>
          <div className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-3 flex items-center justify-between">
            <span>Stations-Service Proches du Camion ({sortedFuelStations.length})</span>
            <span className="text-[10px] text-slate-400 font-normal">Classées par proximité routière</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {sortedFuelStations.map(stn => {
              const isSelected = stn.id === selectedFuelStationId;

              return (
                <div
                  key={stn.id}
                  className={`p-4 rounded-xl border transition-all ${
                    isSelected
                      ? 'bg-orange-50/90 dark:bg-orange-950/40 border-orange-400 dark:border-orange-500 ring-1 ring-orange-500/20 shadow-md'
                      : 'bg-slate-50/50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 hover:bg-slate-100/80 dark:hover:bg-slate-800'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900">
                        {stn.brand}
                      </span>
                      <h5 className="font-bold text-xs text-slate-900 dark:text-slate-100 mt-1.5 leading-tight">
                        {stn.name}
                      </h5>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        {stn.address}, {stn.city}
                      </p>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="text-sm font-extrabold text-orange-600 dark:text-orange-400 font-mono">
                        {stn.distanceKm} km
                      </div>
                      <span className="text-[9px] text-slate-400">du camion</span>
                    </div>
                  </div>

                  {/* Fuel Prices & Stock Badge */}
                  <div className="mt-3 bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700/80 text-xs space-y-1 font-mono">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500 dark:text-slate-400 text-[11px]">Gazole / Diesel :</span>
                      <span className="font-bold text-slate-900 dark:text-slate-100">
                        {stn.fuelPrices.dieselPriceXOF} {currentOrg.currency} / L
                      </span>
                    </div>
                    {stn.hasAdBlue && (
                      <div className="flex justify-between items-center text-sky-600 dark:text-sky-400">
                        <span className="text-[11px]">AdBlue Poids Lourds :</span>
                        <span className="font-bold">
                          {stn.fuelPrices.adbluePriceXOF || 1200} {currentOrg.currency} / L
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between items-center pt-1 border-t border-slate-100 dark:border-slate-800 text-[10px]">
                      <span className="text-slate-400 font-sans">Stock Carburant :</span>
                      <span className={`font-bold font-sans ${stn.fuelStockStatus === 'OPTIMAL' ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                        {stn.fuelStockStatus === 'OPTIMAL' ? 'Optimal (Sans Attente)' : 'Réapprovisionnement'}
                      </span>
                    </div>
                  </div>

                  {/* Amenity Badges */}
                  <div className="mt-2.5 flex flex-wrap gap-1 text-[10px]">
                    {stn.is24h && (
                      <span className="px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 font-semibold">
                        24h/24
                      </span>
                    )}
                    {stn.hasAdBlue && (
                      <span className="px-1.5 py-0.5 rounded bg-sky-50 dark:bg-sky-950/50 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800 font-semibold">
                        AdBlue
                      </span>
                    )}
                    {stn.hasHeavyTruckParking && (
                      <span className="px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 font-semibold">
                        Parking Camions
                      </span>
                    )}
                    {stn.hasRestArea && (
                      <span className="px-1.5 py-0.5 rounded bg-purple-50 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 font-semibold">
                        Aire Repos
                      </span>
                    )}
                  </div>

                  {/* Action Button */}
                  <div className="mt-3 pt-2.5 border-t border-slate-200/60 dark:border-slate-800 flex items-center justify-between gap-2">
                    {stn.contactPhone && (
                      <a
                        href={`tel:${stn.contactPhone}`}
                        className="text-[10px] text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 flex items-center gap-1 font-mono"
                      >
                        <Phone className="w-3 h-3 text-orange-500" />
                        <span>{stn.contactPhone}</span>
                      </a>
                    )}

                    <button
                      onClick={() => setSelectedFuelStationId(stn.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ml-auto ${
                        isSelected
                          ? 'bg-orange-500 text-white shadow-2xs'
                          : 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 hover:bg-orange-600 dark:hover:bg-orange-500 dark:hover:text-white'
                      }`}
                    >
                      <Navigation className="w-3.5 h-3.5" />
                      <span>{isSelected ? 'Tracé Actif' : 'Tracer l\'Itinéraire'}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
