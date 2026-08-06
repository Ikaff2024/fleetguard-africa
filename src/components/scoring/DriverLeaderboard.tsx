import React, { useState, useMemo } from 'react';
import { useDrivers, useVehicles } from '../../hooks/useFleetData';
import { Organization, Driver } from '../../types';
import {
  Trophy,
  Award,
  ShieldCheck,
  Fuel,
  Clock,
  TrendingUp,
  TrendingDown,
  Minus,
  Sliders,
  Search,
  ChevronRight,
  Sparkles,
  X,
  BarChart3,
} from 'lucide-react';

interface DriverLeaderboardProps {
  currentOrg: Organization;
}

export interface DriverPerformanceRecord {
  driver: Driver;
  assignedVehicleName: string;
  safetyScore: number;
  fuelScore: number;
  punctualityScore: number;
  compositeScore: number;
  rank: number;
  previousRank: number;
  rankTrend: 'UP' | 'DOWN' | 'STABLE';
  rankChange: number;
  tripsCompleted: number;
  onTimePct: number;
  avgConsumptionL100km: number;
  expectedConsumptionL100km: number;
  safetyPenaltiesCount: number;
  bonusAmountXof: number;
  isBonusEligible: boolean;
  badges: {
    id: string;
    label: string;
    color: string;
    icon: string;
  }[];
}

export const DriverLeaderboard: React.FC<DriverLeaderboardProps> = ({ currentOrg }) => {
  const driversQuery = useDrivers();
  const vehiclesQuery = useVehicles();
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [sortBy, setSortBy] = useState<'COMPOSITE' | 'SAFETY' | 'FUEL' | 'PUNCTUALITY'>('COMPOSITE');
  const [timePeriod, setTimePeriod] = useState<'THIS_MONTH' | 'QUARTER' | 'YEAR'>('THIS_MONTH');

  // Custom Weights state
  const [showWeightSliders, setShowWeightSliders] = useState<boolean>(false);
  const [weightSafety, setWeightSafety] = useState<number>(50); // 50%
  const [weightFuel, setWeightFuel] = useState<number>(30); // 30%
  const [weightPunctuality, setWeightPunctuality] = useState<number>(20); // 20%

  // Selected driver for detailed comparison modal
  const [selectedPerformance, setSelectedPerformance] = useState<DriverPerformanceRecord | null>(null);

  const orgDrivers = useMemo(() => driversQuery.data ?? [], [driversQuery.data]);

  // Compute detailed performance records for drivers
  const performanceRecords = useMemo(() => {
    const rawList = orgDrivers.map((driver, index) => {
      const vehicle = (vehiclesQuery.data ?? []).find(v => v.id === driver.assignedVehicleId);
      const vehicleName = vehicle
        ? `${vehicle.immatriculation} (${vehicle.make} ${vehicle.model})`
        : 'Véhicule Flotte';

      // Base scores
      const safetyScore = driver.currentSafetyScore || 85;

      // Deterministic calculation for demo consistency based on driver id
      const seed = driver.id.charCodeAt(driver.id.length - 1) + driver.fullName.length;

      const fuelScore = Math.min(100, Math.max(55, Math.round(safetyScore * 0.92 + (seed % 11) - 4)));
      const punctualityScore = Math.min(
        100,
        Math.max(60, Math.round(safetyScore * 0.95 + ((seed * 3) % 9) - 3)),
      );

      // Calculate composite score based on active weights
      const totalWeight = weightSafety + weightFuel + weightPunctuality || 100;
      const compositeScore =
        Math.round(
          ((safetyScore * weightSafety + fuelScore * weightFuel + punctualityScore * weightPunctuality) /
            totalWeight) *
            10,
        ) / 10;

      // Mock previous rank & trend
      const previousRank = ((index + 2) % (orgDrivers.length || 1)) + 1;
      const rankChange = previousRank - (index + 1);
      const rankTrend: 'UP' | 'DOWN' | 'STABLE' = rankChange > 0 ? 'UP' : rankChange < 0 ? 'DOWN' : 'STABLE';

      // Derived metrics
      const tripsCompleted = 12 + (seed % 35);
      const onTimePct = Math.min(100, Math.max(70, Math.round(punctualityScore * 0.98)));

      const baseLiters = vehicle?.expectedConsumptionL100km || 34.0;
      const fuelEfficiencyFactor = 1 + ((100 - fuelScore) / 100) * 0.25 - 0.08;
      const avgConsumptionL100km = Math.round(baseLiters * fuelEfficiencyFactor * 10) / 10;

      const safetyPenaltiesCount = Math.max(0, Math.round((100 - safetyScore) / 4));

      // Safety bonus eligibility
      const isBonusEligible = compositeScore >= 85 && safetyScore >= 85;
      const bonusAmountXof = isBonusEligible ? Math.round(35000 + (compositeScore - 85) * 3000) : 0;

      // Badges
      const badges = [];
      if (safetyScore >= 92) {
        badges.push({
          id: 'safety',
          label: 'As de la Sécurité',
          color: 'bg-emerald-100 text-emerald-800 border-emerald-300',
          icon: '🛡️',
        });
      }
      if (fuelScore >= 90) {
        badges.push({
          id: 'eco',
          label: "Éco-Conducteur d'Or",
          color: 'bg-amber-100 text-amber-800 border-amber-300',
          icon: '🌿',
        });
      }
      if (punctualityScore >= 94) {
        badges.push({
          id: 'time',
          label: 'Horloger Suisse',
          color: 'bg-blue-100 text-blue-800 border-blue-300',
          icon: '⏱️',
        });
      }
      if (safetyPenaltiesCount === 0) {
        badges.push({
          id: 'zero',
          label: 'Zéro Infraction',
          color: 'bg-purple-100 text-purple-800 border-purple-300',
          icon: '✨',
        });
      }

      return {
        driver,
        assignedVehicleName: vehicleName,
        safetyScore,
        fuelScore,
        punctualityScore,
        compositeScore,
        rank: 0, // Assigned after sorting
        previousRank,
        rankTrend,
        rankChange: Math.abs(rankChange),
        tripsCompleted,
        onTimePct,
        avgConsumptionL100km,
        expectedConsumptionL100km: baseLiters,
        safetyPenaltiesCount,
        bonusAmountXof,
        isBonusEligible,
        badges,
      };
    });

    // Sort according to active sort option
    const sorted = [...rawList].sort((a, b) => {
      if (sortBy === 'SAFETY') return b.safetyScore - a.safetyScore;
      if (sortBy === 'FUEL') return b.fuelScore - a.fuelScore;
      if (sortBy === 'PUNCTUALITY') return b.punctualityScore - a.punctualityScore;
      return b.compositeScore - a.compositeScore; // Default COMPOSITE
    });

    // Assign rank positions
    return sorted.map((record, idx) => ({
      ...record,
      rank: idx + 1,
    }));
  }, [orgDrivers, weightSafety, weightFuel, weightPunctuality, sortBy]);

  // Filter records by search term
  const filteredRecords = useMemo(() => {
    if (!searchTerm.trim()) return performanceRecords;
    const query = searchTerm.toLowerCase();
    return performanceRecords.filter(
      r =>
        r.driver.fullName.toLowerCase().includes(query) ||
        r.driver.licenseNumber.toLowerCase().includes(query) ||
        r.assignedVehicleName.toLowerCase().includes(query),
    );
  }, [performanceRecords, searchTerm]);

  // Fleet Average Statistics
  const fleetAverages = useMemo(() => {
    if (performanceRecords.length === 0) {
      return { safety: 0, fuel: 0, punctuality: 0, composite: 0, bonusRate: 0 };
    }
    const sumSafety = performanceRecords.reduce((acc, r) => acc + r.safetyScore, 0);
    const sumFuel = performanceRecords.reduce((acc, r) => acc + r.fuelScore, 0);
    const sumPunctuality = performanceRecords.reduce((acc, r) => acc + r.punctualityScore, 0);
    const sumComposite = performanceRecords.reduce((acc, r) => acc + r.compositeScore, 0);
    const eligibleCount = performanceRecords.filter(r => r.isBonusEligible).length;

    return {
      safety: Math.round((sumSafety / performanceRecords.length) * 10) / 10,
      fuel: Math.round((sumFuel / performanceRecords.length) * 10) / 10,
      punctuality: Math.round((sumPunctuality / performanceRecords.length) * 10) / 10,
      composite: Math.round((sumComposite / performanceRecords.length) * 10) / 10,
      bonusRate: Math.round((eligibleCount / performanceRecords.length) * 100),
    };
  }, [performanceRecords]);

  // Top 3 Podium Drivers
  const top1 = performanceRecords[0];
  const top2 = performanceRecords[1];
  const top3 = performanceRecords[2];

  const getScoreBadgeColor = (score: number) => {
    if (score >= 85) return 'text-emerald-700 bg-emerald-50 border-emerald-200';
    if (score >= 70) return 'text-amber-700 bg-amber-50 border-amber-200';
    return 'text-red-700 bg-red-50 border-red-200';
  };

  return (
    <div className="space-y-6">
      {/* Top Banner Header */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-orange-600 font-bold text-xs uppercase tracking-wider mb-1">
            <Trophy className="w-4 h-4 text-orange-500" />
            <span>Leaderboard Multi-Critères Flotte • {currentOrg.name}</span>
          </div>
          <h2 className="text-xl font-bold text-slate-900">Classement & Évaluation Performance Chauffeurs</h2>
          <p className="text-xs text-slate-500 mt-1">
            Classement dynamique basé sur la sécurité routière, l'économie de carburant et la ponctualité des
            livraisons.
          </p>
        </div>

        {/* Time Period Selector & Custom Weight Button */}
        <div className="flex items-center flex-wrap gap-2 text-xs">
          <div className="bg-slate-100 p-1 rounded-xl flex items-center border border-slate-200 font-semibold text-slate-700">
            <button
              onClick={() => setTimePeriod('THIS_MONTH')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                timePeriod === 'THIS_MONTH'
                  ? 'bg-white text-slate-900 shadow-2xs font-bold'
                  : 'hover:text-slate-900'
              }`}
            >
              Ce Mois-ci
            </button>
            <button
              onClick={() => setTimePeriod('QUARTER')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                timePeriod === 'QUARTER'
                  ? 'bg-white text-slate-900 shadow-2xs font-bold'
                  : 'hover:text-slate-900'
              }`}
            >
              Trimestre
            </button>
            <button
              onClick={() => setTimePeriod('YEAR')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                timePeriod === 'YEAR'
                  ? 'bg-white text-slate-900 shadow-2xs font-bold'
                  : 'hover:text-slate-900'
              }`}
            >
              Année 2026
            </button>
          </div>

          <button
            onClick={() => setShowWeightSliders(!showWeightSliders)}
            className={`px-3.5 py-2 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-xs ${
              showWeightSliders
                ? 'bg-orange-50 text-orange-700 border-orange-300'
                : 'bg-white text-slate-700 hover:bg-slate-50 border-slate-200'
            }`}
          >
            <Sliders className="w-4 h-4 text-orange-500" />
            <span>
              Pondération ({weightSafety}% / {weightFuel}% / {weightPunctuality}%)
            </span>
          </button>
        </div>
      </div>

      {/* Weight Adjuster Expandable Panel */}
      {showWeightSliders && (
        <div className="bg-gradient-to-r from-orange-50/80 via-amber-50/50 to-slate-50 border border-orange-200 rounded-2xl p-5 text-xs space-y-4 animate-fade-in shadow-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-orange-600" />
              <h4 className="font-bold text-slate-900 text-sm">
                Ajustement des Pondérations du Score Global
              </h4>
            </div>
            <span className="text-[11px] font-mono font-bold text-orange-700 bg-orange-100 px-2 py-0.5 rounded border border-orange-300">
              Total = {weightSafety + weightFuel + weightPunctuality}%
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-1">
            {/* Safety Weight Slider */}
            <div className="space-y-1.5 bg-white p-3.5 rounded-xl border border-slate-200">
              <div className="flex justify-between font-bold text-slate-800">
                <span className="flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  Sécurité Routière
                </span>
                <span className="font-mono text-emerald-600">{weightSafety}%</span>
              </div>
              <input
                type="range"
                min="10"
                max="80"
                step="5"
                value={weightSafety}
                onChange={e => setWeightSafety(Number(e.target.value))}
                className="w-full accent-emerald-600 cursor-pointer"
              />
              <p className="text-[10px] text-slate-500">Excès de vitesse, freinages et zones à risque.</p>
            </div>

            {/* Fuel Weight Slider */}
            <div className="space-y-1.5 bg-white p-3.5 rounded-xl border border-slate-200">
              <div className="flex justify-between font-bold text-slate-800">
                <span className="flex items-center gap-1.5">
                  <Fuel className="w-4 h-4 text-amber-600" />
                  Économie Carburant
                </span>
                <span className="font-mono text-amber-600">{weightFuel}%</span>
              </div>
              <input
                type="range"
                min="10"
                max="80"
                step="5"
                value={weightFuel}
                onChange={e => setWeightFuel(Number(e.target.value))}
                className="w-full accent-amber-600 cursor-pointer"
              />
              <p className="text-[10px] text-slate-500">Rendement L/100km & détection d'anomalies.</p>
            </div>

            {/* Punctuality Weight Slider */}
            <div className="space-y-1.5 bg-white p-3.5 rounded-xl border border-slate-200">
              <div className="flex justify-between font-bold text-slate-800">
                <span className="flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-blue-600" />
                  Ponctualité Livraisons
                </span>
                <span className="font-mono text-blue-600">{weightPunctuality}%</span>
              </div>
              <input
                type="range"
                min="10"
                max="80"
                step="5"
                value={weightPunctuality}
                onChange={e => setWeightPunctuality(Number(e.target.value))}
                className="w-full accent-blue-600 cursor-pointer"
              />
              <p className="text-[10px] text-slate-500">Respect des délais clients & créneaux horaires.</p>
            </div>
          </div>
        </div>
      )}

      {/* Overview Fleet Benchmarks Bar */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-2xs">
          <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1">
            Moyenne Flotte Global
          </div>
          <div className="text-2xl font-bold font-mono text-slate-900">
            {fleetAverages.composite} <span className="text-xs font-normal text-slate-400">/100</span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-2xs">
          <div className="text-[10px] text-emerald-600 font-bold uppercase tracking-wider mb-1 flex items-center gap-1">
            <ShieldCheck className="w-3 h-3" />
            <span>Sécurité Flotte</span>
          </div>
          <div className="text-2xl font-bold font-mono text-emerald-600">
            {fleetAverages.safety} <span className="text-xs font-normal text-slate-400">/100</span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-2xs">
          <div className="text-[10px] text-amber-600 font-bold uppercase tracking-wider mb-1 flex items-center gap-1">
            <Fuel className="w-3 h-3" />
            <span>Éco-Conduite</span>
          </div>
          <div className="text-2xl font-bold font-mono text-amber-600">
            {fleetAverages.fuel} <span className="text-xs font-normal text-slate-400">/100</span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-2xs">
          <div className="text-[10px] text-blue-600 font-bold uppercase tracking-wider mb-1 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            <span>Ponctualité</span>
          </div>
          <div className="text-2xl font-bold font-mono text-blue-600">
            {fleetAverages.punctuality} <span className="text-xs font-normal text-slate-400">/100</span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-2xs col-span-2 md:col-span-1">
          <div className="text-[10px] text-purple-600 font-bold uppercase tracking-wider mb-1 flex items-center gap-1">
            <Award className="w-3 h-3" />
            <span>Éligibilité Primes</span>
          </div>
          <div className="text-2xl font-bold font-mono text-purple-600">
            {fleetAverages.bonusRate}% <span className="text-xs font-normal text-slate-400">éligibles</span>
          </div>
        </div>
      </div>

      {/* TOP 3 PODIUM SECTION */}
      {performanceRecords.length >= 3 && (
        <div className="space-y-3">
          <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
            <Trophy className="w-4 h-4 text-amber-500" />
            <span>Podium des Meilleurs Chauffeurs du Mois</span>
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            {/* Rank #2 Silver */}
            {top2 && (
              <div className="bg-gradient-to-b from-slate-50 to-slate-100/80 border-2 border-slate-300 rounded-2xl p-5 shadow-xs relative overflow-hidden order-2 md:order-1">
                <div className="absolute top-0 right-0 bg-slate-300 text-slate-800 font-mono font-extrabold text-xs px-3 py-1 rounded-bl-xl shadow-2xs flex items-center gap-1">
                  <span>🥈 #2</span>
                </div>

                <div className="flex items-center gap-3 mb-3">
                  <div className="w-12 h-12 rounded-full bg-slate-200 border-2 border-slate-400 flex items-center justify-center font-bold text-slate-700 text-base shadow-2xs">
                    {top2.driver.fullName
                      .split(' ')
                      .map(n => n[0])
                      .join('')}
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900 text-sm leading-tight">{top2.driver.fullName}</h4>
                    <p className="text-[11px] text-slate-500 font-mono">{top2.driver.licenseNumber}</p>
                  </div>
                </div>

                <div className="bg-white/80 backdrop-blur-xs p-3 rounded-xl border border-slate-200 my-3 text-center">
                  <div className="text-[10px] uppercase font-bold text-slate-500">Score Global</div>
                  <div className="text-3xl font-extrabold font-mono text-slate-800">
                    {top2.compositeScore}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-1.5 text-center text-[10px] font-bold">
                  <div className="bg-emerald-50 text-emerald-800 p-1.5 rounded-lg border border-emerald-200">
                    <div className="text-slate-500 font-normal">Sécurité</div>
                    <div>{top2.safetyScore}</div>
                  </div>
                  <div className="bg-amber-50 text-amber-800 p-1.5 rounded-lg border border-amber-200">
                    <div className="text-slate-500 font-normal">Carburant</div>
                    <div>{top2.fuelScore}</div>
                  </div>
                  <div className="bg-blue-50 text-blue-800 p-1.5 rounded-lg border border-blue-200">
                    <div className="text-slate-500 font-normal">Ponctuel</div>
                    <div>{top2.punctualityScore}</div>
                  </div>
                </div>

                <button
                  onClick={() => setSelectedPerformance(top2)}
                  className="mt-3 w-full py-1.5 bg-white hover:bg-slate-100 text-slate-800 font-bold text-xs rounded-lg border border-slate-300 transition cursor-pointer"
                >
                  Voir Analyse Comparative
                </button>
              </div>
            )}

            {/* Rank #1 Gold (Elevated Center) */}
            {top1 && (
              <div className="bg-gradient-to-b from-amber-50 via-yellow-50/50 to-orange-50/40 border-2 border-amber-400 rounded-2xl p-5 shadow-md relative overflow-hidden order-1 md:order-2 md:-translate-y-2">
                <div className="absolute top-0 right-0 bg-amber-400 text-amber-950 font-mono font-extrabold text-xs px-3.5 py-1 rounded-bl-xl shadow-2xs flex items-center gap-1">
                  <CrownIcon className="w-3.5 h-3.5" />
                  <span>🏆 #1 CHAMPION</span>
                </div>

                <div className="flex items-center gap-3 mb-3">
                  <div className="w-14 h-14 rounded-full bg-amber-300 border-2 border-amber-500 flex items-center justify-center font-extrabold text-amber-950 text-lg shadow-xs">
                    {top1.driver.fullName
                      .split(' ')
                      .map(n => n[0])
                      .join('')}
                  </div>
                  <div>
                    <h4 className="font-extrabold text-amber-950 text-base leading-tight">
                      {top1.driver.fullName}
                    </h4>
                    <p className="text-[11px] text-amber-800/80 font-mono font-bold">
                      {top1.driver.licenseNumber}
                    </p>
                    <div className="mt-1 inline-flex items-center gap-1 text-[10px] bg-amber-200/80 text-amber-900 font-bold px-2 py-0.5 rounded-full border border-amber-300">
                      <Sparkles className="w-3 h-3 text-amber-700" />
                      <span>Leader Indétrônable</span>
                    </div>
                  </div>
                </div>

                <div className="bg-white p-3.5 rounded-xl border border-amber-200 my-3 text-center shadow-2xs">
                  <div className="text-[10px] uppercase font-bold text-amber-700">Score Global Combiné</div>
                  <div className="text-4xl font-extrabold font-mono text-amber-900">
                    {top1.compositeScore}
                  </div>
                  {top1.isBonusEligible && (
                    <div className="text-[11px] text-emerald-700 font-bold mt-1">
                      🎁 Prime de Conduite : +{top1.bonusAmountXof.toLocaleString('fr-FR')}{' '}
                      {currentOrg.currency}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-1.5 text-center text-[10px] font-bold">
                  <div className="bg-emerald-100 text-emerald-900 p-1.5 rounded-lg border border-emerald-300">
                    <div className="text-slate-600 font-normal">Sécurité</div>
                    <div className="text-xs font-mono">{top1.safetyScore}</div>
                  </div>
                  <div className="bg-amber-100 text-amber-900 p-1.5 rounded-lg border border-amber-300">
                    <div className="text-slate-600 font-normal">Carburant</div>
                    <div className="text-xs font-mono">{top1.fuelScore}</div>
                  </div>
                  <div className="bg-blue-100 text-blue-900 p-1.5 rounded-lg border border-blue-300">
                    <div className="text-slate-600 font-normal">Ponctuel</div>
                    <div className="text-xs font-mono">{top1.punctualityScore}</div>
                  </div>
                </div>

                <button
                  onClick={() => setSelectedPerformance(top1)}
                  className="mt-3 w-full py-2 bg-amber-500 hover:bg-amber-600 text-white font-extrabold text-xs rounded-xl transition cursor-pointer shadow-xs"
                >
                  Voir Fiche du Champion
                </button>
              </div>
            )}

            {/* Rank #3 Bronze */}
            {top3 && (
              <div className="bg-gradient-to-b from-amber-900/5 to-amber-900/10 border-2 border-amber-700/40 rounded-2xl p-5 shadow-xs relative overflow-hidden order-3">
                <div className="absolute top-0 right-0 bg-amber-700 text-white font-mono font-extrabold text-xs px-3 py-1 rounded-bl-xl shadow-2xs flex items-center gap-1">
                  <span>🥉 #3</span>
                </div>

                <div className="flex items-center gap-3 mb-3">
                  <div className="w-12 h-12 rounded-full bg-amber-200 border-2 border-amber-600 flex items-center justify-center font-bold text-amber-900 text-base shadow-2xs">
                    {top3.driver.fullName
                      .split(' ')
                      .map(n => n[0])
                      .join('')}
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900 text-sm leading-tight">{top3.driver.fullName}</h4>
                    <p className="text-[11px] text-slate-500 font-mono">{top3.driver.licenseNumber}</p>
                  </div>
                </div>

                <div className="bg-white/80 backdrop-blur-xs p-3 rounded-xl border border-slate-200 my-3 text-center">
                  <div className="text-[10px] uppercase font-bold text-slate-500">Score Global</div>
                  <div className="text-3xl font-extrabold font-mono text-slate-800">
                    {top3.compositeScore}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-1.5 text-center text-[10px] font-bold">
                  <div className="bg-emerald-50 text-emerald-800 p-1.5 rounded-lg border border-emerald-200">
                    <div className="text-slate-500 font-normal">Sécurité</div>
                    <div>{top3.safetyScore}</div>
                  </div>
                  <div className="bg-amber-50 text-amber-800 p-1.5 rounded-lg border border-amber-200">
                    <div className="text-slate-500 font-normal">Carburant</div>
                    <div>{top3.fuelScore}</div>
                  </div>
                  <div className="bg-blue-50 text-blue-800 p-1.5 rounded-lg border border-blue-200">
                    <div className="text-slate-500 font-normal">Ponctuel</div>
                    <div>{top3.punctualityScore}</div>
                  </div>
                </div>

                <button
                  onClick={() => setSelectedPerformance(top3)}
                  className="mt-3 w-full py-1.5 bg-white hover:bg-slate-100 text-slate-800 font-bold text-xs rounded-lg border border-slate-300 transition cursor-pointer"
                >
                  Voir Analyse Comparative
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* FILTER & FULL RANKING LIST */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4 shadow-xs">
        {/* Controls Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <h3 className="font-bold text-slate-900 text-sm">Tableau de Classement Général</h3>
            <span className="text-xs text-slate-500 font-mono font-semibold bg-slate-100 px-2 py-0.5 rounded">
              {filteredRecords.length} Chauffeur(s)
            </span>
          </div>

          <div className="flex items-center flex-wrap gap-3">
            {/* Search Input */}
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Rechercher par nom, permis..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:bg-white w-52"
              />
            </div>

            {/* Sort Dropdown */}
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
              <span>Trier par :</span>
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value as any)}
                className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-800 focus:outline-none cursor-pointer"
              >
                <option value="COMPOSITE">Score Global Combiné</option>
                <option value="SAFETY">Sécurité Routière</option>
                <option value="FUEL">Économie Carburant</option>
                <option value="PUNCTUALITY">Ponctualité Livraisons</option>
              </select>
            </div>
          </div>
        </div>

        {/* Driver Ranking Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-[11px] text-slate-500 uppercase tracking-wider font-bold bg-slate-50">
                <th className="py-3 px-3 w-16 text-center">Rang</th>
                <th className="py-3 px-3">Chauffeur & Permis</th>
                <th className="py-3 px-3">Véhicule Assigné</th>
                <th className="py-3 px-3">Sécurité (50%)</th>
                <th className="py-3 px-3">Éco-Carburant (30%)</th>
                <th className="py-3 px-3">Ponctualité (20%)</th>
                <th className="py-3 px-3 text-center">Score Global</th>
                <th className="py-3 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-500">
                    Aucun chauffeur ne correspond à votre recherche.
                  </td>
                </tr>
              ) : (
                filteredRecords.map(record => (
                  <tr key={record.driver.id} className="hover:bg-slate-50/80 transition group">
                    {/* Rank Number & Trend */}
                    <td className="py-3.5 px-3 text-center">
                      <div className="flex flex-col items-center justify-center">
                        <span
                          className={`w-7 h-7 rounded-full flex items-center justify-center font-mono font-extrabold text-xs shadow-2xs ${
                            record.rank === 1
                              ? 'bg-amber-400 text-amber-950'
                              : record.rank === 2
                                ? 'bg-slate-300 text-slate-800'
                                : record.rank === 3
                                  ? 'bg-amber-700 text-white'
                                  : 'bg-slate-100 text-slate-700 border border-slate-200'
                          }`}
                        >
                          #{record.rank}
                        </span>

                        <div className="mt-1 flex items-center gap-0.5 text-[10px]">
                          {record.rankTrend === 'UP' && (
                            <span className="text-emerald-600 font-bold flex items-center">
                              <TrendingUp className="w-3 h-3" />+{record.rankChange}
                            </span>
                          )}
                          {record.rankTrend === 'DOWN' && (
                            <span className="text-red-500 font-bold flex items-center">
                              <TrendingDown className="w-3 h-3" />-{record.rankChange}
                            </span>
                          )}
                          {record.rankTrend === 'STABLE' && (
                            <span className="text-slate-400 font-bold flex items-center">
                              <Minus className="w-3 h-3" />
                            </span>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Driver Name & License */}
                    <td className="py-3.5 px-3">
                      <div>
                        <div className="font-bold text-slate-900 group-hover:text-orange-600 transition flex items-center gap-2">
                          <span>{record.driver.fullName}</span>
                          {record.isBonusEligible && (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                              Prime Éligible
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono">
                          {record.driver.licenseNumber} ({record.driver.licenseCategory})
                        </div>
                        {record.badges.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {record.badges.map(b => (
                              <span
                                key={b.id}
                                className={`px-1.5 py-0.2 rounded text-[9px] font-bold border ${b.color}`}
                              >
                                {b.icon} {b.label}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Vehicle */}
                    <td className="py-3.5 px-3 text-slate-700 font-mono text-[11px]">
                      {record.assignedVehicleName}
                    </td>

                    {/* Safety Score Bar */}
                    <td className="py-3.5 px-3">
                      <div className="space-y-1 w-28">
                        <div className="flex justify-between text-[10px] font-bold">
                          <span className="text-emerald-700">Sécurité</span>
                          <span className="font-mono">{record.safetyScore}/100</span>
                        </div>
                        <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              record.safetyScore >= 85
                                ? 'bg-emerald-500'
                                : record.safetyScore >= 70
                                  ? 'bg-amber-500'
                                  : 'bg-red-500'
                            }`}
                            style={{ width: `${record.safetyScore}%` }}
                          ></div>
                        </div>
                      </div>
                    </td>

                    {/* Fuel Score Bar */}
                    <td className="py-3.5 px-3">
                      <div className="space-y-1 w-28">
                        <div className="flex justify-between text-[10px] font-bold">
                          <span className="text-amber-700">Conduite Éco</span>
                          <span className="font-mono">{record.fuelScore}/100</span>
                        </div>
                        <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              record.fuelScore >= 85
                                ? 'bg-amber-500'
                                : record.fuelScore >= 70
                                  ? 'bg-yellow-500'
                                  : 'bg-red-500'
                            }`}
                            style={{ width: `${record.fuelScore}%` }}
                          ></div>
                        </div>
                        <div className="text-[9px] text-slate-400 font-mono">
                          Moy. {record.avgConsumptionL100km} L/100km
                        </div>
                      </div>
                    </td>

                    {/* Punctuality Score Bar */}
                    <td className="py-3.5 px-3">
                      <div className="space-y-1 w-28">
                        <div className="flex justify-between text-[10px] font-bold">
                          <span className="text-blue-700">Ponctualité</span>
                          <span className="font-mono">{record.punctualityScore}/100</span>
                        </div>
                        <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              record.punctualityScore >= 85
                                ? 'bg-blue-500'
                                : record.punctualityScore >= 70
                                  ? 'bg-indigo-400'
                                  : 'bg-red-500'
                            }`}
                            style={{ width: `${record.punctualityScore}%` }}
                          ></div>
                        </div>
                        <div className="text-[9px] text-slate-400 font-mono">
                          {record.onTimePct}% à l'heure
                        </div>
                      </div>
                    </td>

                    {/* Composite Score */}
                    <td className="py-3.5 px-3 text-center">
                      <span
                        className={`px-2.5 py-1 rounded-xl text-xs font-mono font-extrabold border ${getScoreBadgeColor(record.compositeScore)}`}
                      >
                        {record.compositeScore}
                      </span>
                    </td>

                    {/* Action Button */}
                    <td className="py-3.5 px-3 text-right">
                      <button
                        onClick={() => setSelectedPerformance(record)}
                        className="px-2.5 py-1 bg-slate-100 hover:bg-orange-50 hover:text-orange-700 hover:border-orange-200 text-slate-700 font-bold rounded-lg border border-slate-200 transition cursor-pointer flex items-center gap-1 ml-auto"
                      >
                        <span>Analyse</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* DRIVER COMPARISON MODAL */}
      {selectedPerformance && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-2xl w-full p-6 space-y-6 shadow-2xl overflow-y-auto max-h-[90vh]">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-orange-100 text-orange-700 border-2 border-orange-300 flex items-center justify-center font-extrabold text-base">
                  {selectedPerformance.driver.fullName
                    .split(' ')
                    .map(n => n[0])
                    .join('')}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-extrabold text-slate-900 text-lg">
                      {selectedPerformance.driver.fullName}
                    </h3>
                    <span className="px-2 py-0.5 rounded text-xs font-mono font-bold bg-slate-100 text-slate-700 border border-slate-200">
                      Rang #{selectedPerformance.rank}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 font-mono">
                    Permis: {selectedPerformance.driver.licenseNumber} (
                    {selectedPerformance.driver.licenseCategory}) • Véhicule:{' '}
                    {selectedPerformance.assignedVehicleName}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setSelectedPerformance(null)}
                className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Score Comparison vs Fleet Average */}
            <div className="space-y-4">
              <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-orange-500" />
                <span>Analyse Comparative vs Moyenne de la Flotte</span>
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* Safety Comparison */}
                <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl space-y-2">
                  <div className="text-xs font-bold text-slate-800 flex items-center justify-between">
                    <span className="flex items-center gap-1 text-emerald-700">
                      <ShieldCheck className="w-3.5 h-3.5" /> Sécurité
                    </span>
                    <span className="font-mono text-emerald-700 font-extrabold">
                      {selectedPerformance.safetyScore}/100
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 flex justify-between">
                    <span>Moyenne Flotte:</span>
                    <span className="font-mono font-bold">{fleetAverages.safety}/100</span>
                  </div>
                  <div className="text-[11px] font-bold">
                    {selectedPerformance.safetyScore >= fleetAverages.safety ? (
                      <span className="text-emerald-600">
                        +{(selectedPerformance.safetyScore - fleetAverages.safety).toFixed(1)} pts au-dessus
                      </span>
                    ) : (
                      <span className="text-red-500">
                        {(selectedPerformance.safetyScore - fleetAverages.safety).toFixed(1)} pts en-dessous
                      </span>
                    )}
                  </div>
                </div>

                {/* Fuel Comparison */}
                <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl space-y-2">
                  <div className="text-xs font-bold text-slate-800 flex items-center justify-between">
                    <span className="flex items-center gap-1 text-amber-700">
                      <Fuel className="w-3.5 h-3.5" /> Éco-Carburant
                    </span>
                    <span className="font-mono text-amber-700 font-extrabold">
                      {selectedPerformance.fuelScore}/100
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 flex justify-between">
                    <span>Consommation:</span>
                    <span className="font-mono font-bold">
                      {selectedPerformance.avgConsumptionL100km} L/100km
                    </span>
                  </div>
                  <div className="text-[11px] font-bold">
                    {selectedPerformance.fuelScore >= fleetAverages.fuel ? (
                      <span className="text-emerald-600">Rendement supérieur à la flotte</span>
                    ) : (
                      <span className="text-amber-600">Surconsommation mesurée</span>
                    )}
                  </div>
                </div>

                {/* Punctuality Comparison */}
                <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl space-y-2">
                  <div className="text-xs font-bold text-slate-800 flex items-center justify-between">
                    <span className="flex items-center gap-1 text-blue-700">
                      <Clock className="w-3.5 h-3.5" /> Ponctualité
                    </span>
                    <span className="font-mono text-blue-700 font-extrabold">
                      {selectedPerformance.punctualityScore}/100
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 flex justify-between">
                    <span>Taux Livraisons à l'Heure:</span>
                    <span className="font-mono font-bold">{selectedPerformance.onTimePct}%</span>
                  </div>
                  <div className="text-[11px] font-bold">
                    {selectedPerformance.punctualityScore >= fleetAverages.punctuality ? (
                      <span className="text-emerald-600">Respect parfait des délais</span>
                    ) : (
                      <span className="text-red-500">Retards occasionnels enregistrés</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Safety Bonus Card */}
            <div
              className={`p-4 rounded-xl border flex items-center justify-between gap-4 ${
                selectedPerformance.isBonusEligible
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-slate-50 border-slate-200 text-slate-700'
              }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`p-2.5 rounded-xl ${selectedPerformance.isBonusEligible ? 'bg-emerald-200 text-emerald-800' : 'bg-slate-200 text-slate-600'}`}
                >
                  <Award className="w-6 h-6" />
                </div>
                <div>
                  <h5 className="font-bold text-xs uppercase tracking-wider">
                    Statut Prime de Conduite Sécuritaire
                  </h5>
                  {selectedPerformance.isBonusEligible ? (
                    <p className="text-xs text-emerald-800 font-medium mt-0.5">
                      Chauffeur éligible à la prime ce mois-ci pour son score global de{' '}
                      {selectedPerformance.compositeScore}/100.
                    </p>
                  ) : (
                    <p className="text-xs text-slate-500 font-medium mt-0.5">
                      Le chauffeur doit atteindre un score minimum de 85/100 pour débloquer la prime.
                    </p>
                  )}
                </div>
              </div>

              {selectedPerformance.isBonusEligible && (
                <div className="text-right shrink-0">
                  <div className="text-[10px] text-emerald-700 uppercase font-bold">Montant Prime</div>
                  <div className="text-lg font-extrabold font-mono text-emerald-700">
                    +{selectedPerformance.bonusAmountXof.toLocaleString('fr-FR')} {currentOrg.currency}
                  </div>
                </div>
              )}
            </div>

            {/* Badges Earned */}
            {selectedPerformance.badges.length > 0 && (
              <div className="space-y-2">
                <h5 className="font-bold text-xs text-slate-800">Distinctions & Badges Obtenus :</h5>
                <div className="flex flex-wrap gap-2">
                  {selectedPerformance.badges.map(b => (
                    <span
                      key={b.id}
                      className={`px-3 py-1 rounded-xl text-xs font-bold border flex items-center gap-1.5 ${b.color}`}
                    >
                      <span>{b.icon}</span>
                      <span>{b.label}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Modal Footer */}
            <div className="pt-2 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setSelectedPerformance(null)}
                className="px-5 py-2 bg-slate-900 text-white text-xs font-bold rounded-xl hover:bg-slate-800 transition cursor-pointer"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Helper Crown Icon
function CrownIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm14 3c0 .6-.4 1-1 1H6c-.6 0-1-.4-1-1v-1h14v1z" />
    </svg>
  );
}
