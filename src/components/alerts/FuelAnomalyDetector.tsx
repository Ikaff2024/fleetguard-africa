import React, { useState, useEffect } from 'react';
import { Organization } from '../../types';
import { UnifiedAlert } from './AlertsCenter';
import { MOCK_VEHICLES, MOCK_DRIVERS } from '../../data/mock-data';
import {
  ShieldAlert,
  Play,
  Pause,
  RotateCcw,
  AlertTriangle,
  Flame,
  Radio,
  Sparkles,
  Volume2,
  VolumeX,
  ArrowRight,
} from 'lucide-react';

interface FuelAnomalyDetectorProps {
  currentOrg: Organization;
  onAlertTriggered?: (alert: UnifiedAlert) => void;
  onNavigateToAlerts?: () => void;
}

export interface TelemetryTick {
  timestamp: string;
  ignition: 'OFF' | 'ON';
  fuelLevelLiters: number;
  fuelPercent: number;
  deltaLiters: number;
  location: string;
  isAnomaly: boolean;
}

export const FuelAnomalyDetector: React.FC<FuelAnomalyDetectorProps> = ({
  currentOrg,
  onAlertTriggered,
  onNavigateToAlerts,
}) => {
  const orgVehicles = MOCK_VEHICLES.filter(v => v.organizationId === currentOrg.id);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>(orgVehicles[0]?.id || 'veh_actros_01');

  const activeVehicle = orgVehicles.find(v => v.id === selectedVehicleId) || orgVehicles[0];
  const assignedDriver = MOCK_DRIVERS.find(
    d => d.assignedVehicleId === activeVehicle?.id || d.id === activeVehicle?.currentDriverId,
  );

  // Simulation Parameters
  const [selectedScenario, setSelectedScenario] = useState<'THEFT_OFF' | 'THEFT_IDLE' | 'REFUEL' | 'NORMAL'>(
    'THEFT_OFF',
  );
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [telemetryLogs, setTelemetryLogs] = useState<TelemetryTick[]>([]);
  const [detectedAnomaly, setDetectedAnomaly] = useState<UnifiedAlert | null>(null);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);

  // Pre-defined Telemetry Stream Scenarios
  const scenariosData = {
    THEFT_OFF: {
      name: 'Siphonnage Nocturne (Moteur ÉTEINT)',
      description:
        'Chute brutale de gazole (-70L en 3 min) alors que le contact est coupé (Ignition: OFF) sur un parking non sécurisé.',
      initialLiters: 380,
      capacityLiters: 400,
      ignition: 'OFF' as const,
      location: 'Parking Relais RNIE 2 - Parakou',
      ticks: [
        { time: '02:14:00', liters: 380, ignition: 'OFF' as const },
        { time: '02:15:00', liters: 362, ignition: 'OFF' as const }, // -18L
        { time: '02:16:00', liters: 335, ignition: 'OFF' as const }, // -27L
        { time: '02:17:00', liters: 310, ignition: 'OFF' as const }, // -25L (Total -70L)
      ],
    },
    THEFT_IDLE: {
      name: 'Siphonnage au Ralenti Suspect (Moteur ALLUMÉ)',
      description:
        'Consommation anormale (-45L en 3 min) au ralenti à vitesse nulle (0 km/h) en stationnement prolonged.',
      initialLiters: 290,
      capacityLiters: 350,
      ignition: 'ON' as const,
      location: 'Halte Routière Hillacondji (Frontière Togo)',
      ticks: [
        { time: '14:20:00', liters: 290, ignition: 'ON' as const },
        { time: '14:21:00', liters: 275, ignition: 'ON' as const }, // -15L
        { time: '14:22:00', liters: 258, ignition: 'ON' as const }, // -17L
        { time: '14:23:00', liters: 245, ignition: 'ON' as const }, // -13L (Total -45L)
      ],
    },
    REFUEL: {
      name: 'Ravitaillement Légal en Station',
      description: "Hausse normale du niveau de carburant (+180L) lors d'un plein régulier.",
      initialLiters: 80,
      capacityLiters: 400,
      ignition: 'OFF' as const,
      location: 'Station TotalParakou - Pistolet N°3',
      ticks: [
        { time: '09:10:00', liters: 80, ignition: 'OFF' as const },
        { time: '09:11:00', liters: 140, ignition: 'OFF' as const },
        { time: '09:12:00', liters: 210, ignition: 'OFF' as const },
        { time: '09:13:00', liters: 260, ignition: 'OFF' as const },
      ],
    },
    NORMAL: {
      name: 'Trajet Routine Corridor (Moteur ALLUMÉ)',
      description: 'Consommation régulière à 80 km/h sans baisse anormale.',
      initialLiters: 320,
      capacityLiters: 400,
      ignition: 'ON' as const,
      location: 'Axe Cotonou - Bohicon (RNIE 2)',
      ticks: [
        { time: '10:00:00', liters: 320, ignition: 'ON' as const },
        { time: '10:01:00', liters: 319.4, ignition: 'ON' as const },
        { time: '10:02:00', liters: 318.8, ignition: 'ON' as const },
        { time: '10:03:00', liters: 318.2, ignition: 'ON' as const },
      ],
    },
  };

  const activeScenario = scenariosData[selectedScenario];

  // Reset Simulation
  const handleReset = () => {
    setIsRunning(false);
    setCurrentStep(0);
    setTelemetryLogs([]);
    setDetectedAnomaly(null);
  };

  // Start Simulation Ticker
  useEffect(() => {
    let timer: any = null;
    if (isRunning) {
      if (currentStep < activeScenario.ticks.length) {
        timer = setTimeout(() => {
          const tickData = activeScenario.ticks[currentStep];
          const initialLiters = activeScenario.initialLiters;
          const deltaLiters = parseFloat((tickData.liters - initialLiters).toFixed(1));
          const fuelPercent = parseFloat(
            ((tickData.liters / activeScenario.capacityLiters) * 100).toFixed(1),
          );

          // Anomaly Detection Rule:
          // Rule 1: Ignition is OFF and Delta <= -15 Liters
          // Rule 2: Ignition is ON, speed is 0, Delta <= -25 Liters in 3 min
          const isTheftOFF = tickData.ignition === 'OFF' && deltaLiters <= -15;
          const isTheftIDLE = tickData.ignition === 'ON' && deltaLiters <= -25;
          const isAnomalyTriggered = isTheftOFF || isTheftIDLE;

          const newLog: TelemetryTick = {
            timestamp: tickData.time,
            ignition: tickData.ignition,
            fuelLevelLiters: tickData.liters,
            fuelPercent,
            deltaLiters,
            location: activeScenario.location,
            isAnomaly: isAnomalyTriggered,
          };

          setTelemetryLogs(prev => [...prev, newLog]);

          // Trigger Alert if anomaly detected for the first time
          if (isAnomalyTriggered && !detectedAnomaly) {
            const newAlert: UnifiedAlert = {
              id: `alt_fuel_theft_${Date.now()}`,
              organizationId: currentOrg.id,
              category: 'FUEL_ANOMALY',
              severity: 'CRITICAL',
              status: 'UNHANDLED',
              recordedAt: new Date().toISOString(),
              title:
                tickData.ignition === 'OFF'
                  ? '🚨 Vol de Carburant Suspecté (Contact ÉTEINT)'
                  : '⚠️ Siphonnage en Stationnement (Moteur au Ralenti)',
              description: `Détecteur Télémétrique FleetGuard: Perte abrupte de ${Math.abs(deltaLiters)}L (${((Math.abs(deltaLiters) / activeScenario.capacityLiters) * 100).toFixed(1)}%) en ${currentStep + 1} minutes sur ${activeVehicle.make} ${activeVehicle.model} (${activeVehicle.immatriculation}) à ${activeScenario.location}. État Moteur: ${tickData.ignition === 'OFF' ? 'COUPE' : 'ALLUME (0 km/h)'}.`,
              vehicleId: activeVehicle.id,
              driverId: assignedDriver?.id,
              locationName: activeScenario.location,
              latitude: 9.337,
              longitude: 2.63,
              metricValue: `-${Math.abs(deltaLiters)} Litres (Contact ${tickData.ignition})`,
              metricLabel: 'Alerte Siphonnage',
              actionsTaken: ['Analyse Télémétrique Automatique'],
            };

            setDetectedAnomaly(newAlert);
            if (onAlertTriggered) {
              onAlertTriggered(newAlert);
            }

            // Web Audio Beep Notification (if sound enabled)
            if (soundEnabled) {
              try {
                const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(880, ctx.currentTime); // A5 note
                gain.gain.setValueAtTime(0.15, ctx.currentTime);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start();
                osc.stop(ctx.currentTime + 0.4);
              } catch (e) {
                // Audio Context fallback
              }
            }
          }

          setCurrentStep(prev => prev + 1);
        }, 1200);
      } else {
        setIsRunning(false);
      }
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [
    isRunning,
    currentStep,
    activeScenario,
    activeVehicle,
    assignedDriver,
    detectedAnomaly,
    currentOrg.id,
    onAlertTriggered,
    soundEnabled,
  ]);

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden space-y-0">
      {/* Top Banner Header */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 p-5 text-white flex flex-wrap items-center justify-between gap-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2 text-orange-400 text-xs font-bold uppercase tracking-wider mb-1">
            <Radio className="w-4 h-4 text-orange-400 animate-pulse" />
            <span>Capteurs Télémétriques IoT — Détecteur Temps Réel</span>
          </div>
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <span>Détecteur d'Anomalies & Vol de Carburant</span>
            <span className="bg-red-500/20 text-red-400 text-[10px] font-extrabold px-2 py-0.5 rounded border border-red-500/30">
              Contact Éteint / Active
            </span>
          </h3>
          <p className="text-xs text-slate-300 mt-1 max-w-2xl leading-relaxed">
            Surveillance continue du niveau des réservoirs gazole via jauge capacitive. Déclenchement
            instantané d'une alerte critique dès détection d'une baisse anormale à moteur coupé.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`p-2 rounded-lg text-xs font-semibold border transition flex items-center gap-1.5 cursor-pointer ${
              soundEnabled
                ? 'bg-slate-800 text-orange-400 border-slate-700 hover:bg-slate-700'
                : 'bg-slate-800/50 text-slate-400 border-slate-800'
            }`}
            title="Sonne lors de la détection d'anomalie"
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            <span>Alarme Sonore</span>
          </button>
        </div>
      </div>

      {/* Simulator Controls & Scenario Selection */}
      <div className="p-5 bg-slate-50 border-b border-slate-200 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Vehicle Selector */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Véhicule Sous Surveillance Télémétrique
            </label>
            <select
              value={selectedVehicleId}
              onChange={e => {
                setSelectedVehicleId(e.target.value);
                handleReset();
              }}
              className="w-full bg-white text-xs font-bold text-slate-800 border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 cursor-pointer"
            >
              {orgVehicles.map(v => (
                <option key={v.id} value={v.id}>
                  {v.immatriculation} - {v.make} {v.model} ({v.type})
                </option>
              ))}
            </select>
          </div>

          {/* Scenario Selector */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Scénario de Test & Ingestion
            </label>
            <select
              value={selectedScenario}
              onChange={e => {
                setSelectedScenario(e.target.value as any);
                handleReset();
              }}
              className="w-full bg-white text-xs font-bold text-slate-800 border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 cursor-pointer"
            >
              <option value="THEFT_OFF">🚨 Siphonnage Nocturne (Moteur ÉTEINT / Contact Coupé)</option>
              <option value="THEFT_IDLE">⚠️ Siphonnage au Ralenti (Moteur ALLUMÉ & 0 km/h)</option>
              <option value="REFUEL">⛽ Ravitaillement Légal (+180L en Station)</option>
              <option value="NORMAL">🚚 Trajet Routine Fluide (Consommation Régulière)</option>
            </select>
          </div>

          {/* Action Buttons */}
          <div className="flex items-end gap-2">
            <button
              onClick={() => {
                if (currentStep >= activeScenario.ticks.length) {
                  handleReset();
                }
                setIsRunning(!isRunning);
              }}
              className={`flex-1 font-bold text-xs py-2.5 px-4 rounded-lg transition flex items-center justify-center gap-2 cursor-pointer shadow-xs ${
                isRunning
                  ? 'bg-amber-500 hover:bg-amber-600 text-white'
                  : 'bg-orange-500 hover:bg-orange-600 text-white'
              }`}
            >
              {isRunning ? (
                <>
                  <Pause className="w-4 h-4" />
                  <span>Mettre en Pause</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-current" />
                  <span>Lancer Détection Télémétrique</span>
                </>
              )}
            </button>

            <button
              onClick={handleReset}
              className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold text-xs p-2.5 rounded-lg transition cursor-pointer"
              title="Réinitialiser"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="text-xs text-slate-600 bg-white p-3 rounded-lg border border-slate-200 flex items-start gap-2">
          <Sparkles className="w-4 h-4 text-orange-500 shrink-0 mt-0.5" />
          <div>
            <strong className="text-slate-900">Description du Test : </strong>
            <span>{activeScenario.description}</span>
          </div>
        </div>
      </div>

      {/* Real-time Telemetry Live Monitor & Log Stream */}
      <div className="p-5 space-y-4">
        {/* Detected Anomaly Alert Banner (if triggered) */}
        {detectedAnomaly && (
          <div className="bg-red-500 text-white rounded-xl p-4 shadow-lg border-2 border-red-600 animate-pulse space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-red-400/50 pb-2">
              <div className="flex items-center gap-2 font-bold text-sm">
                <ShieldAlert className="w-5 h-5 text-yellow-300 animate-bounce" />
                <span>{detectedAnomaly.title}</span>
              </div>
              <span className="bg-white text-red-700 text-[10px] font-extrabold px-2.5 py-1 rounded-full uppercase tracking-wider">
                Alerte Transmise au Centre d'Alertes
              </span>
            </div>

            <p className="text-xs text-red-50 leading-relaxed font-medium">{detectedAnomaly.description}</p>

            <div className="flex flex-wrap items-center justify-between gap-3 text-xs pt-1">
              <div className="flex items-center gap-4 text-red-100 font-mono text-[11px]">
                <span>
                  Véhicule: <strong>{activeVehicle?.immatriculation}</strong>
                </span>
                <span>
                  Chauffeur: <strong>{assignedDriver?.fullName || 'Inconnu'}</strong>
                </span>
                <span>
                  Anomalie: <strong className="text-yellow-300">{detectedAnomaly.metricValue}</strong>
                </span>
              </div>

              {onNavigateToAlerts && (
                <button
                  onClick={onNavigateToAlerts}
                  className="bg-white text-red-700 hover:bg-red-50 font-bold text-xs px-3.5 py-1.5 rounded-lg transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <span>Ouvrir dans le Centre d'Alertes</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Live Telemetry Ticker Stream */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <Flame className="w-4 h-4 text-orange-500" />
              <span>Flux Télémétrique Ingesté en Direct</span>
            </span>
            <span className="text-[11px] font-mono text-slate-500">
              Echantillonnage : 1 tick / min (Accéléré à 1.2s)
            </span>
          </div>

          <div className="bg-slate-950 text-slate-100 font-mono text-xs rounded-xl p-4 space-y-2 max-h-56 overflow-y-auto border border-slate-800">
            {telemetryLogs.length === 0 ? (
              <div className="text-slate-500 text-center py-6 italic">
                Cliquez sur "Lancer Détection Télémétrique" pour simuler l'arrivée des données de la jauge
                gazole...
              </div>
            ) : (
              telemetryLogs.map((log, idx) => (
                <div
                  key={idx}
                  className={`p-2 rounded flex flex-wrap items-center justify-between gap-2 transition ${
                    log.isAnomaly
                      ? 'bg-red-900/60 text-red-200 border border-red-700 font-bold animate-pulse'
                      : 'bg-slate-900/80 hover:bg-slate-900 text-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-orange-400 font-bold text-[11px]">[{log.timestamp}]</span>

                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                        log.ignition === 'OFF'
                          ? 'bg-slate-800 text-slate-300 border border-slate-700'
                          : 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                      }`}
                    >
                      MOTEUR: {log.ignition}
                    </span>

                    <span className="text-slate-200">
                      Niveau: <strong>{log.fuelLevelLiters} L</strong> ({log.fuelPercent}%)
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <span
                      className={`font-bold ${
                        log.deltaLiters < 0
                          ? 'text-red-400'
                          : log.deltaLiters > 0
                            ? 'text-emerald-400'
                            : 'text-slate-400'
                      }`}
                    >
                      {log.deltaLiters > 0 ? `+${log.deltaLiters}` : log.deltaLiters} L
                    </span>

                    {log.isAnomaly ? (
                      <span className="bg-red-600 text-white text-[10px] px-2 py-0.5 rounded font-extrabold flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        <span>SIPHONNAGE DÉTECTÉ</span>
                      </span>
                    ) : (
                      <span className="text-slate-500 text-[10px]">Normal</span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
