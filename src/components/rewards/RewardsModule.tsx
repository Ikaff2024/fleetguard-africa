import React, { useState, useMemo } from 'react';
import { Organization } from '../../types';
import {
  MOCK_DIGITAL_BADGES,
  MOCK_DRIVER_REWARD_PROFILES,
  MOCK_FUEL_BONUS_CONFIG
} from '../../data/mock-data';
import {
  DigitalBadge,
  DriverRewardProfile,
  FuelBonusRuleConfig,
  BadgeRarity,
  PayoutStatus
} from '../../types';
import {
  Award,
  Trophy,
  Zap,
  ShieldCheck,
  Flame,
  Moon,
  Coins,
  TrendingUp,
  CheckCircle2,
  AlertTriangle,
  Gift,
  Send,
  Sliders,
  Wallet,
  Users,
  Star,
  ChevronRight,
  Info,
  PlusCircle
} from 'lucide-react';

interface RewardsModuleProps {
  currentOrg: Organization;
  onNavigateToMessaging?: (driverId: string) => void;
}

export const RewardsModule: React.FC<RewardsModuleProps> = ({
  currentOrg,
  onNavigateToMessaging,
}) => {
  // Main Sub-Tab
  const [activeTab, setActiveTab] = useState<'DRIVER_TRENDS' | 'BADGES_GALLERY' | 'FUEL_BONUSES' | 'BONUS_SIMULATOR'>(
    'DRIVER_TRENDS'
  );

  // Rewards State (mutable)
  const [driverProfiles, setDriverProfiles] = useState<DriverRewardProfile[]>(
    MOCK_DRIVER_REWARD_PROFILES.filter((p) => p.organizationId === currentOrg.id)
  );
  const [digitalBadges, setDigitalBadges] = useState<DigitalBadge[]>(MOCK_DIGITAL_BADGES);
  const [bonusConfig, setBonusConfig] = useState<FuelBonusRuleConfig>(MOCK_FUEL_BONUS_CONFIG);

  // Toast Notification
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Selected Driver Detail for Modal/Showcase
  const [selectedDriverId, setSelectedDriverId] = useState<string>(
    driverProfiles[0]?.driverId || ''
  );
  const selectedProfile = useMemo(() => {
    return driverProfiles.find((p) => p.driverId === selectedDriverId) || driverProfiles[0];
  }, [driverProfiles, selectedDriverId]);

  // Filters
  const [badgeCategoryFilter, setBadgeCategoryFilter] = useState<string>('ALL');
  const [badgeRarityFilter, setBadgeRarityFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Manual Grant Badge Modal
  const [isGrantBadgeModalOpen, setIsGrantBadgeModalOpen] = useState<boolean>(false);
  const [badgeToGrantId, setBadgeToGrantId] = useState<string>(digitalBadges[0]?.id || '');
  const [grantNote, setGrantNote] = useState<string>('Excellente réactivité sur le corridor ce mois-ci.');

  // Simulator Inputs
  const [simFuelPrice, setSimFuelPrice] = useState<number>(bonusConfig.fuelPricePerLiterXOF);
  const [simSharedPct, setSimSharedPct] = useState<number>(bonusConfig.sharedSavingsPercentage);
  const [simMinScore, setSimMinScore] = useState<number>(bonusConfig.minSafetyScoreForBonus);

  // Helper for displaying Lucide icons dynamically
  const renderBadgeIcon = (iconName: string, className = 'w-6 h-6') => {
    switch (iconName) {
      case 'ShieldCheck':
        return <ShieldCheck className={className} />;
      case 'Zap':
        return <Zap className={className} />;
      case 'Moon':
        return <Moon className={className} />;
      case 'Trophy':
        return <Trophy className={className} />;
      case 'Flame':
        return <Flame className={className} />;
      case 'Award':
      default:
        return <Award className={className} />;
    }
  };

  const getRarityBadgeStyle = (rarity: BadgeRarity) => {
    switch (rarity) {
      case 'DIAMOND':
        return {
          bg: 'bg-cyan-500/10 dark:bg-cyan-950/30 text-cyan-600 dark:text-cyan-300 border-cyan-300 dark:border-cyan-800',
          gradient: 'from-cyan-500 to-blue-600',
          label: 'Diamant Élite',
        };
      case 'PLATINUM':
        return {
          bg: 'bg-purple-500/10 dark:bg-purple-950/30 text-purple-600 dark:text-purple-300 border-purple-300 dark:border-purple-800',
          gradient: 'from-purple-500 to-indigo-600',
          label: 'Platine',
        };
      case 'GOLD':
        return {
          bg: 'bg-amber-500/10 dark:bg-amber-950/30 text-amber-600 dark:text-amber-300 border-amber-300 dark:border-amber-800',
          gradient: 'from-amber-400 to-orange-500',
          label: 'Or Excellence',
        };
      case 'SILVER':
        return {
          bg: 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700',
          gradient: 'from-slate-400 to-slate-600',
          label: 'Argent',
        };
      case 'BRONZE':
      default:
        return {
          bg: 'bg-orange-500/10 dark:bg-orange-950/30 text-orange-700 dark:text-orange-300 border-orange-300 dark:border-orange-800',
          gradient: 'from-amber-600 to-orange-700',
          label: 'Bronze',
        };
    }
  };

  // KPI Calculations
  const stats = useMemo(() => {
    const totalBonusesXOF = driverProfiles.reduce((acc, p) => acc + p.fuelBonusEarnedXOF, 0);
    const totalFuelSavedL = driverProfiles.reduce((acc, p) => acc + p.estimatedFuelSavedLiters, 0);
    const totalBadgesUnlocked = driverProfiles.reduce(
      (acc, p) => acc + p.unlockedBadges.length,
      0
    );
    const eligibleCount = driverProfiles.filter((p) => p.currentSafetyScore >= 85).length;
    const avgSafetyScore =
      driverProfiles.length > 0
        ? (
            driverProfiles.reduce((acc, p) => acc + p.currentSafetyScore, 0) / driverProfiles.length
          ).toFixed(1)
        : '0';

    return {
      totalBonusesXOF,
      totalFuelSavedL,
      totalBadgesUnlocked,
      eligibleCount,
      avgSafetyScore,
    };
  }, [driverProfiles]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Change Payout Status
  const handleApproveBonus = (driverId: string, nextStatus: PayoutStatus) => {
    setDriverProfiles((prev) =>
      prev.map((p) => {
        if (p.driverId === driverId) {
          return {
            ...p,
            payoutStatus: nextStatus,
            lastPayoutDate: nextStatus === 'PAID' ? '2026-08-04' : p.lastPayoutDate,
          };
        }
        return p;
      })
    );
    const profile = driverProfiles.find((p) => p.driverId === driverId);
    showToast(
      `Statut prime mis à jour [${nextStatus}] pour ${profile?.driverName} (${profile?.fuelBonusEarnedXOF.toLocaleString()} XOF).`
    );
  };

  // Manually Grant Badge to Driver
  const handleGrantBadgeSubmit = () => {
    if (!selectedDriverId || !badgeToGrantId) return;

    const badge = digitalBadges.find((b) => b.id === badgeToGrantId);
    if (!badge) return;

    setDriverProfiles((prev) =>
      prev.map((p) => {
        if (p.driverId === selectedDriverId) {
          const alreadyUnlocked = p.unlockedBadges.some((b) => b.badgeId === badgeToGrantId);
          if (alreadyUnlocked) return p;

          return {
            ...p,
            totalPoints: p.totalPoints + badge.expBonusPoints,
            unlockedBadges: [
              ...p.unlockedBadges,
              {
                badgeId: badge.id,
                unlockedAt: '2026-08-04',
                periodLabel: 'Août 2026',
                grantedBy: 'Régulateur / B2B Manager',
              },
            ],
          };
        }
        return p;
      })
    );

    setIsGrantBadgeModalOpen(false);
    showToast(`Badge "${badge.title}" décerné à ${selectedProfile?.driverName} (+${badge.expBonusPoints} pts)!`);
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-4 py-3 rounded-xl shadow-2xl border border-slate-700 flex items-center gap-3 animate-bounce">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <span className="text-xs font-semibold">{toastMessage}</span>
        </div>
      )}

      {/* Main Header Banner */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-xs transition-colors space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 text-xs font-bold uppercase tracking-wider">
              <Gift className="w-4 h-4 text-amber-500 animate-pulse" />
              <span>Module Gamification & Primes de Performance</span>
            </div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2.5 mt-1">
              <span>Programme 'Rewards' & Primes Carburant Éco-Sécurité</span>
              <span className="bg-amber-100 dark:bg-amber-950 text-amber-900 dark:text-amber-300 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border border-amber-200 dark:border-amber-800">
                Partage de Gain Carburant
              </span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-3xl leading-relaxed">
              Valorisez la conduite responsable des chauffeurs en transformant les tendances de sécurité et les litres d'essence économisés en badges numériques d'honneur et en primes financières directes (Orange Money, Wave, MTN MoMo).
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsGrantBadgeModalOpen(true)}
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white font-bold text-xs flex items-center gap-2 shadow-sm cursor-pointer transition"
            >
              <Award className="w-4 h-4" />
              <span>Décerné un Badge d'Honneur</span>
            </button>
          </div>
        </div>
      </div>

      {/* Overview KPI Cards Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-xl shadow-xs transition-colors">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs mb-1">
            <span className="font-medium">Total Primes Générées</span>
            <Coins className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-xl font-bold font-mono text-amber-600 dark:text-amber-400">
            {stats.totalBonusesXOF.toLocaleString()} XOF
          </div>
          <div className="text-[10px] text-amber-700 dark:text-amber-300 font-semibold mt-1">
            Reversé aux conducteurs
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-xl shadow-xs transition-colors">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs mb-1">
            <span className="font-medium">Carburant Économisé</span>
            <Zap className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
            {stats.totalFuelSavedL} Litres
          </div>
          <div className="text-[10px] text-emerald-700 dark:text-emerald-300 font-semibold mt-1">
            Gain environnemental & CO2
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-xl shadow-xs transition-colors">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs mb-1">
            <span className="font-medium">Badges Débloqués</span>
            <Award className="w-4 h-4 text-purple-500" />
          </div>
          <div className="text-xl font-bold font-mono text-purple-600 dark:text-purple-400">
            {stats.totalBadgesUnlocked} Badges
          </div>
          <div className="text-[10px] text-purple-700 dark:text-purple-300 font-semibold mt-1">
            Accréditations obtenues
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-xl shadow-xs transition-colors">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs mb-1">
            <span className="font-medium">Conducteurs Éligibles</span>
            <Users className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-xl font-bold font-mono text-blue-600 dark:text-blue-400">
            {stats.eligibleCount} / {driverProfiles.length}
          </div>
          <div className="text-[10px] text-blue-700 dark:text-blue-300 font-semibold mt-1">
            Score Sécurité ≥ 85/100
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-xl shadow-xs transition-colors">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs mb-1">
            <span className="font-medium">Score Moyen Flotte</span>
            <Star className="w-4 h-4 text-orange-500" />
          </div>
          <div className="text-xl font-bold font-mono text-orange-600 dark:text-orange-400">
            {stats.avgSafetyScore} / 100
          </div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400 font-medium mt-1">
            Tendance +4.8% ce mois
          </div>
        </div>
      </div>

      {/* Sub-Tabs Bar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-2 rounded-xl shadow-xs flex flex-wrap items-center justify-between gap-2 transition-colors">
        <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto">
          <button
            onClick={() => setActiveTab('DRIVER_TRENDS')}
            className={`px-4 py-2 rounded-lg font-bold text-xs flex items-center gap-2 transition cursor-pointer whitespace-nowrap ${
              activeTab === 'DRIVER_TRENDS'
                ? 'bg-amber-500 text-white shadow-2xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Trophy className="w-4 h-4" />
            <span>Classement, Tendances & Badges Chauffeurs</span>
          </button>

          <button
            onClick={() => setActiveTab('BADGES_GALLERY')}
            className={`px-4 py-2 rounded-lg font-bold text-xs flex items-center gap-2 transition cursor-pointer whitespace-nowrap ${
              activeTab === 'BADGES_GALLERY'
                ? 'bg-amber-500 text-white shadow-2xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Award className="w-4 h-4" />
            <span>Catalogue des Badges Numériques</span>
          </button>

          <button
            onClick={() => setActiveTab('FUEL_BONUSES')}
            className={`px-4 py-2 rounded-lg font-bold text-xs flex items-center gap-2 transition cursor-pointer whitespace-nowrap ${
              activeTab === 'FUEL_BONUSES'
                ? 'bg-amber-500 text-white shadow-2xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Coins className="w-4 h-4" />
            <span>Moteur des Primes Carburant & Payouts</span>
          </button>

          <button
            onClick={() => setActiveTab('BONUS_SIMULATOR')}
            className={`px-4 py-2 rounded-lg font-bold text-xs flex items-center gap-2 transition cursor-pointer whitespace-nowrap ${
              activeTab === 'BONUS_SIMULATOR'
                ? 'bg-amber-500 text-white shadow-2xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Sliders className="w-4 h-4" />
            <span>Simulateur & Règles de Partage de Gains</span>
          </button>
        </div>
      </div>

      {/* TAB 1: DRIVER TRENDS & SHOWCASE */}
      {activeTab === 'DRIVER_TRENDS' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in">
          {/* Driver Selection List */}
          <div className="lg:col-span-1 space-y-3">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-xl shadow-xs transition-colors space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Trophy className="w-4 h-4 text-amber-500" />
                  <span>Leaderboard Général</span>
                </h3>
                <span className="text-[10px] text-slate-400 font-mono">
                  {driverProfiles.length} conducteurs
                </span>
              </div>

              <div className="space-y-2 max-h-[580px] overflow-y-auto pr-1">
                {driverProfiles
                  .sort((a, b) => b.totalPoints - a.totalPoints)
                  .map((profile, index) => {
                    const isSelected = profile.driverId === selectedDriverId;
                    return (
                      <div
                        key={profile.driverId}
                        onClick={() => setSelectedDriverId(profile.driverId)}
                        className={`p-3 rounded-xl border cursor-pointer transition duration-150 flex items-center justify-between ${
                          isSelected
                            ? 'bg-amber-50/80 dark:bg-amber-950/30 border-amber-400 dark:border-amber-800 shadow-xs'
                            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center shrink-0 ${
                              index === 0
                                ? 'bg-amber-500 text-white shadow-xs'
                                : index === 1
                                ? 'bg-slate-300 dark:bg-slate-700 text-slate-800 dark:text-slate-100'
                                : index === 2
                                ? 'bg-amber-700 text-white'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                            }`}
                          >
                            #{index + 1}
                          </div>

                          <div>
                            <h4 className="font-bold text-slate-900 dark:text-slate-100 text-xs">
                              {profile.driverName}
                            </h4>
                            <div className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
                              <span>Score:</span>
                              <strong className="text-emerald-600 dark:text-emerald-400 font-mono">
                                {profile.currentSafetyScore}/100
                              </strong>
                              <span className="text-slate-400">•</span>
                              <span className="text-amber-600 dark:text-amber-400 font-mono">
                                {profile.totalPoints} pts
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <div className="flex -space-x-1 overflow-hidden">
                            {profile.unlockedBadges.slice(0, 2).map((ub) => {
                              const badge = digitalBadges.find((b) => b.id === ub.badgeId);
                              if (!badge) return null;
                              return (
                                <div
                                  key={ub.badgeId}
                                  className="w-5 h-5 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-700 flex items-center justify-center text-[9px]"
                                  title={badge.title}
                                >
                                  {renderBadgeIcon(badge.iconName, 'w-3 h-3')}
                                </div>
                              );
                            })}
                          </div>
                          <ChevronRight className="w-4 h-4 text-slate-400" />
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>

          {/* Detailed Selected Driver Showcase */}
          {selectedProfile && (
            <div className="lg:col-span-2 space-y-6">
              {/* Profile Card Header */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs transition-colors space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-amber-500 text-white font-extrabold text-base flex items-center justify-center shadow-md">
                      {selectedProfile.driverName
                        .split(' ')
                        .map((n) => n[0])
                        .join('')}
                    </div>

                    <div>
                      <h3 className="font-bold text-slate-900 dark:text-slate-100 text-base flex items-center gap-2">
                        <span>{selectedProfile.driverName}</span>
                        <span className="bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 text-[10px] font-extrabold px-2 py-0.5 rounded-full border border-amber-300 dark:border-amber-800">
                          Rang #{selectedProfile.rankInCompany} Flotte
                        </span>
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                        Camion Attribué: {selectedProfile.assignedVehicle}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {onNavigateToMessaging && (
                      <button
                        onClick={() => onNavigateToMessaging(selectedProfile.driverId)}
                        className="px-3 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>Félicitations SMS</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Performance Metrics Bar */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
                  <div className="p-3 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700/80">
                    <span className="text-slate-400 block text-[10px]">Score Sécurité (30j):</span>
                    <strong className="text-emerald-600 dark:text-emerald-400 text-sm">
                      {selectedProfile.currentSafetyScore} / 100 ({selectedProfile.scoreTrend30d >= 0 ? '+' : ''}
                      {selectedProfile.scoreTrend30d}%)
                    </strong>
                  </div>

                  <div className="p-3 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700/80">
                    <span className="text-slate-400 block text-[10px]">Éco-Conduite:</span>
                    <strong className="text-sky-600 dark:text-sky-400 text-sm">
                      {selectedProfile.ecoScore} / 100
                    </strong>
                  </div>

                  <div className="p-3 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700/80">
                    <span className="text-slate-400 block text-[10px]">Gains Carburant:</span>
                    <strong className="text-amber-600 dark:text-amber-400 text-sm">
                      {selectedProfile.estimatedFuelSavedLiters} Litres
                    </strong>
                  </div>

                  <div className="p-3 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700/80">
                    <span className="text-slate-400 block text-[10px]">Prime Calculée:</span>
                    <strong className="text-amber-600 dark:text-amber-400 text-sm">
                      {selectedProfile.fuelBonusEarnedXOF.toLocaleString()} XOF
                    </strong>
                  </div>
                </div>

                {/* Trend Highlights Identified by Scoring Engine */}
                <div className="space-y-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    Tendances Identifiées par le Moteur de Scoring (30j)
                  </span>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    {selectedProfile.trendHighlights.map((th, idx) => (
                      <div
                        key={idx}
                        className={`p-2.5 rounded-lg border flex items-start gap-2 ${
                          th.trendType === 'POSITIVE'
                            ? 'bg-emerald-50/60 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/60 text-emerald-800 dark:text-emerald-300'
                            : th.trendType === 'WARNING'
                            ? 'bg-rose-50/60 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/60 text-rose-800 dark:text-rose-300'
                            : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        {th.trendType === 'POSITIVE' ? (
                          <TrendingUp className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                        ) : th.trendType === 'WARNING' ? (
                          <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                        ) : (
                          <Info className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                        )}

                        <div>
                          <strong className="block text-xs font-bold">{th.metric}</strong>
                          <span className="text-[11px] font-medium leading-tight block">
                            {th.description}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Unlocked Badges Showcase */}
                <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider flex items-center gap-1.5">
                      <Award className="w-4 h-4 text-amber-500" />
                      <span>Badges Débloqués ({selectedProfile.unlockedBadges.length})</span>
                    </span>

                    <button
                      onClick={() => setIsGrantBadgeModalOpen(true)}
                      className="text-xs text-amber-600 dark:text-amber-400 hover:underline font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <PlusCircle className="w-3.5 h-3.5" />
                      <span>Attribuer un badge</span>
                    </button>
                  </div>

                  {selectedProfile.unlockedBadges.length === 0 ? (
                    <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl text-center text-xs text-slate-500">
                      Aucun badge débloqué pour l'instant. Soumettez un rapport d'éco-conduite pour octroyer son premier badge.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {selectedProfile.unlockedBadges.map((ub) => {
                        const badge = digitalBadges.find((b) => b.id === ub.badgeId);
                        if (!badge) return null;
                        const style = getRarityBadgeStyle(badge.rarity);

                        return (
                          <div
                            key={ub.badgeId}
                            className={`p-3 rounded-xl border flex items-start gap-3 relative overflow-hidden ${style.bg}`}
                          >
                            <div
                              className={`w-10 h-10 rounded-xl bg-gradient-to-br ${style.gradient} text-white flex items-center justify-center shrink-0 shadow-md`}
                            >
                              {renderBadgeIcon(badge.iconName, 'w-5 h-5')}
                            </div>

                            <div className="space-y-0.5">
                              <div className="flex items-center gap-2">
                                <h4 className="font-bold text-xs">{badge.title}</h4>
                                <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.2 rounded bg-white/60 dark:bg-slate-900/60 border">
                                  {style.label}
                                </span>
                              </div>

                              <p className="text-[11px] opacity-90 leading-tight">
                                {badge.description}
                              </p>

                              <div className="text-[10px] opacity-75 font-mono pt-1">
                                Débloqué le {ub.unlockedAt} • +{badge.expBonusPoints} pts
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Progress towards Next Badges */}
                {selectedProfile.badgeProgress.length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                    <span className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider block">
                      Progression vers les Prochains Badges
                    </span>

                    <div className="space-y-3">
                      {selectedProfile.badgeProgress.map((bp) => {
                        const badge = digitalBadges.find((b) => b.id === bp.badgeId);
                        if (!badge) return null;

                        return (
                          <div
                            key={bp.badgeId}
                            className="bg-slate-50 dark:bg-slate-800/70 p-3 rounded-xl border border-slate-200 dark:border-slate-700/80 space-y-1.5 text-xs"
                          >
                            <div className="flex justify-between items-center font-bold">
                              <span className="flex items-center gap-1.5 text-slate-800 dark:text-slate-200">
                                {renderBadgeIcon(badge.iconName, 'w-4 h-4 text-amber-500')}
                                <span>{badge.title}</span>
                              </span>
                              <span className="font-mono text-amber-600 dark:text-amber-400">
                                {bp.currentValue} / {bp.targetValue} {bp.unit} ({bp.percentage}%)
                              </span>
                            </div>

                            <div className="w-full bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
                              <div
                                className="bg-amber-500 h-full rounded-full transition-all duration-500"
                                style={{ width: `${bp.percentage}%` }}
                              ></div>
                            </div>

                            <p className="text-[10px] text-slate-500 dark:text-slate-400">
                              Objectif: {badge.criterion}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: DIGITAL BADGES CATALOGUE & GALLERY */}
      {activeTab === 'BADGES_GALLERY' && (
        <div className="space-y-6 animate-fade-in">
          {/* Filters Toolbar */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-xl shadow-xs flex flex-wrap items-center justify-between gap-4 transition-colors">
            <div className="relative flex-1 min-w-[220px]">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Rechercher un badge par nom ou critère..."
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg pl-3 pr-3 py-2 text-xs font-medium text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div className="flex items-center gap-3 text-xs">
              <select
                value={badgeCategoryFilter}
                onChange={(e) => setBadgeCategoryFilter(e.target.value)}
                className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 font-bold text-slate-800 dark:text-slate-200 text-xs focus:ring-2 focus:ring-amber-500 cursor-pointer"
              >
                <option value="ALL">Toutes les catégories</option>
                <option value="SAFETY">🛡️ Sécurité & Anticipation</option>
                <option value="ECO_DRIVING">🌱 Éco-Conduite & Carburant</option>
                <option value="NIGHT_SAFETY">🌙 Conduite Nocturne</option>
                <option value="LONG_HAUL">🚚 Long-Courrier & Corridors</option>
                <option value="MILESTONE">🏆 Jalons & Rangs Élite</option>
              </select>

              <select
                value={badgeRarityFilter}
                onChange={(e) => setBadgeRarityFilter(e.target.value)}
                className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 font-bold text-slate-800 dark:text-slate-200 text-xs focus:ring-2 focus:ring-amber-500 cursor-pointer"
              >
                <option value="ALL">Toutes les raretés</option>
                <option value="DIAMOND">💎 Diamant Élite</option>
                <option value="PLATINUM">💜 Platine</option>
                <option value="GOLD">🥇 Or Excellence</option>
                <option value="SILVER">🥈 Argent</option>
                <option value="BRONZE">🥉 Bronze</option>
              </select>
            </div>
          </div>

          {/* Badges Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {digitalBadges
              .filter((b) => {
                const matchesCategory =
                  badgeCategoryFilter === 'ALL' || b.category === badgeCategoryFilter;
                const matchesRarity =
                  badgeRarityFilter === 'ALL' || b.rarity === badgeRarityFilter;
                const matchesSearch =
                  !searchQuery ||
                  b.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                  b.description.toLowerCase().includes(searchQuery.toLowerCase());
                return matchesCategory && matchesRarity && matchesSearch;
              })
              .map((badge) => {
                const style = getRarityBadgeStyle(badge.rarity);
                const driversWithBadge = driverProfiles.filter((p) =>
                  p.unlockedBadges.some((ub) => ub.badgeId === badge.id)
                );

                return (
                  <div
                    key={badge.id}
                    className={`rounded-xl border p-5 shadow-xs transition duration-200 space-y-4 flex flex-col justify-between ${style.bg}`}
                  >
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-12 h-12 rounded-xl bg-gradient-to-br ${style.gradient} text-white flex items-center justify-center shrink-0 shadow-md`}
                          >
                            {renderBadgeIcon(badge.iconName, 'w-6 h-6')}
                          </div>

                          <div>
                            <h4 className="font-bold text-slate-900 dark:text-slate-100 text-sm">
                              {badge.title}
                            </h4>
                            <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-white/60 dark:bg-slate-900/60 border">
                              {style.label}
                            </span>
                          </div>
                        </div>

                        <span className="text-[11px] font-mono font-bold text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-950 px-2 py-0.5 rounded border border-amber-300 dark:border-amber-800">
                          +{badge.expBonusPoints} PTS
                        </span>
                      </div>

                      <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed font-medium">
                        {badge.description}
                      </p>

                      <div className="p-2.5 rounded-lg bg-white/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-400">
                        <strong className="text-slate-900 dark:text-slate-100 block mb-0.5">
                          Critère de Déblocage:
                        </strong>
                        <p>{badge.criterion}</p>
                      </div>

                      <div className="flex items-center justify-between text-xs font-mono pt-1">
                        <span className="text-slate-500">Multiplicateur Prime:</span>
                        <strong className="text-emerald-600 dark:text-emerald-400">
                          x{badge.fuelBonusMultiplier} (+
                          {Math.round((badge.fuelBonusMultiplier - 1) * 100)}% de bonus)
                        </strong>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-slate-200/60 dark:border-slate-800/60 flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <Users className="w-3.5 h-3.5 text-slate-400" />
                        <span>Détenteurs ({driversWithBadge.length}):</span>
                      </div>

                      <div className="flex -space-x-2">
                        {driversWithBadge.map((d) => (
                          <div
                            key={d.driverId}
                            className="w-6 h-6 rounded-full bg-amber-500 text-white font-bold text-[10px] flex items-center justify-center border-2 border-white dark:border-slate-900 shadow-xs"
                            title={d.driverName}
                          >
                            {d.driverName
                              .split(' ')
                              .map((n) => n[0])
                              .join('')}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* TAB 3: FUEL BONUS INCENTIVE ENGINE & PAYOUTS */}
      {activeTab === 'FUEL_BONUSES' && (
        <div className="space-y-6 animate-fade-in">
          {/* Fuel Bonus Engine Formula Banner */}
          <div className="bg-slate-900 text-slate-200 p-5 rounded-xl border border-slate-800 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Coins className="w-4 h-4" />
                  <span>Formule de Calcul de la Prime Carburant Éco-Sécurité</span>
                </div>
                <h3 className="text-base font-bold text-white mt-0.5">
                  Partage à 50/50 des Économies de Gazole à partir d'un Score Sécurité ≥ 85/100
                </h3>
              </div>

              <div className="text-xs font-mono text-emerald-400 bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-700">
                PRIX BENCHMARK: <strong>750 XOF / Litre</strong>
              </div>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed max-w-3xl">
              Si le conducteur consomme moins que la norme constructeur du véhicule (ex: 29.2 L/100km au lieu de 34 L/100km), la valeur financière des litres économisés est partagée à parts égales entre la société et le chauffeur, versée sur Mobile Money.
            </p>
          </div>

          {/* Drivers Bonus Payout Table */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Wallet className="w-4 h-4 text-amber-500" />
                <span>État des Primes Carburant pour le Mois en Cours</span>
              </h3>

              <div className="text-xs font-mono text-slate-500">
                Volume Total Économisé: <strong>{stats.totalFuelSavedL} Litres</strong>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="p-3.5">Conducteur & Véhicule</th>
                    <th className="p-3.5 text-center">Score Sécurité</th>
                    <th className="p-3.5 text-center">Économie L/100km</th>
                    <th className="p-3.5 text-center">Litres Économisés</th>
                    <th className="p-3.5 text-right">Prime Reversée (XOF)</th>
                    <th className="p-3.5 text-center">Moyen de Paiement</th>
                    <th className="p-3.5 text-center">Statut du Verset</th>
                    <th className="p-3.5 text-right">Action Régulateur</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                  {driverProfiles.map((profile) => {
                    const isEligible = profile.currentSafetyScore >= 85;

                    return (
                      <tr
                        key={profile.driverId}
                        className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition"
                      >
                        <td className="p-3.5">
                          <strong className="text-slate-900 dark:text-slate-100 block font-bold">
                            {profile.driverName}
                          </strong>
                          <span className="text-[10px] text-slate-500 font-mono">
                            {profile.assignedVehicle}
                          </span>
                        </td>

                        <td className="p-3.5 text-center font-mono font-bold">
                          <span
                            className={`px-2 py-0.5 rounded ${
                              isEligible
                                ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                                : 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300'
                            }`}
                          >
                            {profile.currentSafetyScore} / 100
                          </span>
                        </td>

                        <td className="p-3.5 text-center font-mono font-bold">
                          {profile.fuelEfficiencySavingsL100km < 0 ? (
                            <span className="text-emerald-600 dark:text-emerald-400">
                              {profile.fuelEfficiencySavingsL100km} L/100km
                            </span>
                          ) : (
                            <span className="text-rose-600 dark:text-rose-400">
                              +{profile.fuelEfficiencySavingsL100km} L/100km
                            </span>
                          )}
                        </td>

                        <td className="p-3.5 text-center font-mono font-bold text-slate-800 dark:text-slate-200">
                          {profile.estimatedFuelSavedLiters} L
                        </td>

                        <td className="p-3.5 text-right font-mono font-bold text-amber-600 dark:text-amber-400 text-sm">
                          {profile.fuelBonusEarnedXOF.toLocaleString()} XOF
                        </td>

                        <td className="p-3.5 text-center font-mono text-[11px]">
                          <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                            {profile.payoutMethod.replace('_', ' ')}
                          </span>
                        </td>

                        <td className="p-3.5 text-center font-bold text-[10px]">
                          {profile.payoutStatus === 'PAID' ? (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-300">
                              ✓ VERSÉ ({profile.lastPayoutDate})
                            </span>
                          ) : profile.payoutStatus === 'APPROVED' ? (
                            <span className="px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border border-amber-300">
                              APPROUVÉ (Prêt Payout)
                            </span>
                          ) : profile.payoutStatus === 'CALCULATED' ||
                            profile.payoutStatus === 'ELIGIBLE' ? (
                            <span className="px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300 border border-blue-300">
                              EN ATTENTE VALIDATION
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300 border border-rose-300">
                              NON ÉLIGIBLE
                            </span>
                          )}
                        </td>

                        <td className="p-3.5 text-right">
                          {profile.payoutStatus === 'PAID' ? (
                            <span className="text-[10px] text-emerald-600 font-bold">
                              Paiement effectué
                            </span>
                          ) : isEligible ? (
                            <button
                              onClick={() =>
                                handleApproveBonus(
                                  profile.driverId,
                                  profile.payoutStatus === 'APPROVED' ? 'PAID' : 'APPROVED'
                                )
                              }
                              className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                                profile.payoutStatus === 'APPROVED'
                                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                                  : 'bg-amber-500 hover:bg-amber-600 text-white'
                              }`}
                            >
                              {profile.payoutStatus === 'APPROVED'
                                ? 'Verser via Mobile Money'
                                : 'Approuver Prime'}
                            </button>
                          ) : (
                            <span className="text-[10px] text-slate-400 font-medium">
                              Score insuffisant (&lt;85)
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: INTERACTIVE RULE SIMULATOR */}
      {activeTab === 'BONUS_SIMULATOR' && (
        <div className="space-y-6 animate-fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs transition-colors space-y-4">
            <div className="border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Sliders className="w-4 h-4 text-amber-500" />
                <span>Simulateur B2B de Paramètres de Partage de Gains</span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Ajustez les pourcentages de partage d'économie de carburant et les seuils de score de sécurité pour projeter les gains des conducteurs.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  Prix du Carburant (XOF / Litre)
                </label>
                <input
                  type="number"
                  step="25"
                  value={simFuelPrice}
                  onChange={(e) => setSimFuelPrice(parseInt(e.target.value) || 750)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 font-mono font-bold text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  Pourcentage Économie Reversé (% Chauffeur)
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min="10"
                    max="70"
                    step="5"
                    value={simSharedPct}
                    onChange={(e) => setSimSharedPct(parseInt(e.target.value) || 50)}
                    className="w-full accent-amber-500 cursor-pointer"
                  />
                  <span className="font-mono font-bold text-amber-600 text-sm">{simSharedPct}%</span>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  Score Sécurité Minimum Requis
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min="70"
                    max="95"
                    step="1"
                    value={simMinScore}
                    onChange={(e) => setSimMinScore(parseInt(e.target.value) || 85)}
                    className="w-full accent-amber-500 cursor-pointer"
                  />
                  <span className="font-mono font-bold text-emerald-600 text-sm">{simMinScore} / 100</span>
                </div>
              </div>
            </div>

            {/* Simulated Simulation Results Projection */}
            <div className="bg-slate-50 dark:bg-slate-800/80 p-4 rounded-xl border border-slate-200 dark:border-slate-700/80 space-y-3">
              <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider">
                Projection des Primes Sous Ces Paramètres
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 font-mono text-xs">
                <div className="p-3 bg-white dark:bg-slate-900 rounded-lg border">
                  <span className="text-slate-400 text-[10px] block">Masse de Primes Totale:</span>
                  <strong className="text-amber-600 text-sm">
                    {driverProfiles
                      .filter((p) => p.currentSafetyScore >= simMinScore)
                      .reduce(
                        (acc, p) =>
                          acc +
                          Math.max(
                            0,
                            p.estimatedFuelSavedLiters * simFuelPrice * (simSharedPct / 100)
                          ),
                        0
                      )
                      .toLocaleString()}{' '}
                    XOF
                  </strong>
                </div>

                <div className="p-3 bg-white dark:bg-slate-900 rounded-lg border">
                  <span className="text-slate-400 text-[10px] block">Prime Moyenne par Chauffeur:</span>
                  <strong className="text-emerald-600 text-sm">
                    {Math.round(
                      driverProfiles
                        .filter((p) => p.currentSafetyScore >= simMinScore)
                        .reduce(
                          (acc, p) =>
                            acc +
                            Math.max(
                              0,
                              p.estimatedFuelSavedLiters * simFuelPrice * (simSharedPct / 100)
                            ),
                          0
                        ) /
                        (driverProfiles.filter((p) => p.currentSafetyScore >= simMinScore).length || 1)
                    ).toLocaleString()}{' '}
                    XOF
                  </strong>
                </div>

                <div className="p-3 bg-white dark:bg-slate-900 rounded-lg border">
                  <span className="text-slate-400 text-[10px] block">Économie Nette Société:</span>
                  <strong className="text-sky-600 text-sm">
                    {driverProfiles
                      .reduce(
                        (acc, p) =>
                          acc +
                          Math.max(
                            0,
                            p.estimatedFuelSavedLiters * simFuelPrice * ((100 - simSharedPct) / 100)
                          ),
                        0
                      )
                      .toLocaleString()}{' '}
                    XOF
                  </strong>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Grant Badge Modal */}
      {isGrantBadgeModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl max-w-lg w-full p-6 shadow-2xl space-y-4 animate-scale-in">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm flex items-center gap-2">
                <Award className="w-5 h-5 text-amber-500" />
                <span>Décerner un Badge d'Honneur Numérique</span>
              </h3>
              <button
                onClick={() => setIsGrantBadgeModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Conducteur Destinataire
                </label>
                <select
                  value={selectedDriverId}
                  onChange={(e) => setSelectedDriverId(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 font-bold text-slate-800 dark:text-slate-200"
                >
                  {driverProfiles.map((p) => (
                    <option key={p.driverId} value={p.driverId}>
                      {p.driverName} ({p.currentSafetyScore}/100)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Badge Numérique à Attribuer
                </label>
                <select
                  value={badgeToGrantId}
                  onChange={(e) => setBadgeToGrantId(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 font-bold text-slate-800 dark:text-slate-200"
                >
                  {digitalBadges.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.title} (+{b.expBonusPoints} PTS) — {b.rarity}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Note d'Appréciation du Régulateur
                </label>
                <textarea
                  rows={2}
                  value={grantNote}
                  onChange={(e) => setGrantNote(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 text-xs text-slate-800 dark:text-slate-200"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
              <button
                onClick={() => setIsGrantBadgeModalOpen(false)}
                className="px-4 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs hover:bg-slate-200 cursor-pointer"
              >
                Annuler
              </button>
              <button
                onClick={handleGrantBadgeSubmit}
                className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs cursor-pointer shadow-2xs"
              >
                Confirmer & Envoyer Notification SMS
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
