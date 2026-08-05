import React, { useState, useMemo } from 'react';
import { Organization } from '../../types';
import { MapPin, TrendingDown, Clock, AlertTriangle, ShieldAlert } from 'lucide-react';
import { MOCK_VEHICLES } from '../../data/mock-data';

interface FuelAnomalyDetectionProps {
  currentOrg: Organization;
}

export const FuelAnomalyDetection: React.FC<FuelAnomalyDetectionProps> = ({ currentOrg }) => {
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');

  const anomalies = [
    {
      id: 'anom_001',
      vehicleId: 'veh_actros_01',
      timestamp: '2026-08-04T02:15:00',
      type: 'FUEL_THEFT_SUSPICION',
      severity: 'CRITICAL',
      location: 'RNIE2, Parakou',
      description:
        'Rapid fuel level drop (-45L in 10 mins) while vehicle is stationary at an unauthorized stop.',
      gpsCoordinates: '9.3456° N, 2.6189° E',
      status: 'INVESTIGATING',
      estimatedLoss: 45, // Liters
    },
    {
      id: 'anom_002',
      vehicleId: 'veh_hilux_03',
      timestamp: '2026-08-03T14:30:00',
      type: 'INEFFICIENT_ROUTE',
      severity: 'MODERATE',
      location: 'Abomey-Calavi to Ouidah',
      description:
        'Vehicle deviated from optimized route by 15km, resulting in an additional 8L of fuel consumption.',
      gpsCoordinates: '6.4468° N, 2.3480° E',
      status: 'RESOLVED',
      estimatedLoss: 8,
    },
    {
      id: 'anom_003',
      vehicleId: 'veh_shacman_02',
      timestamp: '2026-08-04T08:45:00',
      type: 'IDLING_EXCESSIVE',
      severity: 'WARNING',
      location: 'Cotonou Port Depot',
      description: 'Engine idling for over 45 minutes consuming ~4.5L without movement.',
      gpsCoordinates: '6.3530° N, 2.4320° E',
      status: 'NEW',
      estimatedLoss: 4.5,
    },
    {
      id: 'anom_004',
      vehicleId: 'veh_fh16_05',
      timestamp: '2026-08-02T22:10:00',
      type: 'FUEL_THEFT_SUSPICION',
      severity: 'CRITICAL',
      location: 'Malanville Border',
      description: 'Discrepancy detected between GPS mileage and fuel tank drop (-60L overnight).',
      gpsCoordinates: '11.8670° N, 3.3830° E',
      status: 'RESOLVED',
      estimatedLoss: 60,
    },
  ];

  const vehicles = useMemo(() => {
    return MOCK_VEHICLES.filter(v => v.organizationId === currentOrg.id);
  }, [currentOrg.id]);

  const filteredAnomalies = useMemo(() => {
    return anomalies.filter(a => selectedStatus === 'ALL' || a.status === selectedStatus);
  }, [selectedStatus, anomalies]);

  const totalFuelLoss = anomalies.reduce((acc, curr) => acc + curr.estimatedLoss, 0);
  const criticalCount = anomalies.filter(a => a.severity === 'CRITICAL').length;

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-6 relative overflow-hidden shadow-xs">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 text-rose-600 font-bold text-xs uppercase tracking-wider mb-1">
              <ShieldAlert className="w-4 h-4 text-rose-500" />
              <span>Fuel Integrity & Theft Prevention</span>
            </div>
            <h2 className="text-xl font-bold text-slate-900">Fuel Anomaly Detection Service</h2>
            <p className="text-xs text-slate-500 mt-1 max-w-2xl">
              Cross-referencing GPS telemetry data with fuel level sensors to identify suspicious drops,
              inefficient routes, and excessive idling.
            </p>
          </div>

          <div className="flex gap-4">
            <div className="bg-rose-50 border border-rose-200 p-3 rounded-lg text-center">
              <div className="text-2xl font-extrabold text-rose-700">{criticalCount}</div>
              <div className="text-[10px] text-rose-600 font-bold uppercase tracking-wider">
                Critical Alerts
              </div>
            </div>
            <div className="bg-amber-50 border border-amber-200 p-3 rounded-lg text-center">
              <div className="text-2xl font-extrabold text-amber-700">{totalFuelLoss.toFixed(1)} L</div>
              <div className="text-[10px] text-amber-600 font-bold uppercase tracking-wider">
                Est. Fuel Loss
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-between items-center bg-white border border-slate-200 p-4 rounded-xl shadow-xs">
        <div className="font-bold text-slate-800 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-amber-500" />
          <span>Detected Anomalies</span>
        </div>
        <div>
          <select
            value={selectedStatus}
            onChange={e => setSelectedStatus(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold focus:ring-2 focus:ring-orange-500"
          >
            <option value="ALL">All Statuses</option>
            <option value="NEW">New</option>
            <option value="INVESTIGATING">Investigating</option>
            <option value="RESOLVED">Resolved</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {filteredAnomalies.map(anomaly => {
          const vehicle = vehicles.find(v => v.id === anomaly.vehicleId);

          return (
            <div
              key={anomaly.id}
              className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs hover:border-rose-300 transition relative overflow-hidden"
            >
              {anomaly.severity === 'CRITICAL' && (
                <div className="absolute top-0 left-0 w-1.5 h-full bg-rose-500"></div>
              )}
              {anomaly.severity === 'WARNING' && (
                <div className="absolute top-0 left-0 w-1.5 h-full bg-amber-500"></div>
              )}
              {anomaly.severity === 'MODERATE' && (
                <div className="absolute top-0 left-0 w-1.5 h-full bg-indigo-500"></div>
              )}

              <div className="flex flex-col sm:flex-row gap-5 items-start justify-between ml-3">
                <div className="flex-1 space-y-3">
                  <div className="flex items-center gap-3">
                    <span
                      className={`px-2.5 py-1 text-[10px] font-bold rounded-full uppercase tracking-wider ${
                        anomaly.severity === 'CRITICAL'
                          ? 'bg-rose-100 text-rose-700'
                          : anomaly.severity === 'WARNING'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-indigo-100 text-indigo-700'
                      }`}
                    >
                      {anomaly.type.replace(/_/g, ' ')}
                    </span>

                    <span
                      className={`px-2 py-0.5 text-[10px] font-bold rounded-md ${
                        anomaly.status === 'NEW'
                          ? 'bg-blue-50 text-blue-600 border border-blue-200'
                          : anomaly.status === 'INVESTIGATING'
                            ? 'bg-amber-50 text-amber-600 border border-amber-200'
                            : 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                      }`}
                    >
                      Status: {anomaly.status}
                    </span>

                    <span className="text-xs text-slate-500 flex items-center gap-1 font-mono">
                      <Clock className="w-3.5 h-3.5" />
                      {new Date(anomaly.timestamp).toLocaleString()}
                    </span>
                  </div>

                  <h3 className="text-sm font-bold text-slate-900">
                    {vehicle
                      ? `${vehicle.immatriculation} - ${vehicle.make} ${vehicle.model}`
                      : 'Unknown Vehicle'}
                  </h3>

                  <p className="text-xs text-slate-600 leading-relaxed max-w-3xl">{anomaly.description}</p>

                  <div className="flex items-center gap-4 pt-2">
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-mono">
                      <MapPin className="w-3.5 h-3.5 text-slate-400" />
                      <span>
                        {anomaly.location} ({anomaly.gpsCoordinates})
                      </span>
                    </div>
                  </div>
                </div>

                <div className="shrink-0 bg-slate-50 p-4 rounded-xl border border-slate-200 text-center min-w-[140px]">
                  <div className="flex items-center justify-center gap-1 text-slate-500 mb-1">
                    <TrendingDown className="w-4 h-4 text-rose-500" />
                    <span className="text-[10px] font-bold uppercase tracking-wider">Est. Impact</span>
                  </div>
                  <div className="text-xl font-extrabold text-slate-900 font-mono">
                    {anomaly.estimatedLoss} L
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
