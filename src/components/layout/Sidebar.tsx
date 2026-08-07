import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { initials, roleLabel } from '../../lib/roles';
import { NAV_PERMISSIONS, NavigationTab } from './navigation';
import {
  BookOpen,
  MapPin,
  Truck,
  Award,
  Wrench,
  Sparkles,
  ShieldAlert,
  ChevronRight,
  Cpu,
  Gift,
  Route,
  Navigation,
  CalendarClock,
} from 'lucide-react';

interface SidebarProps {
  activeTab: NavigationTab;
  onTabChange: (tab: NavigationTab) => void;
  pendingGpsCount?: number;
  alertsCount?: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onTabChange,
  pendingGpsCount = 0,
  alertsCount = 2,
}) => {
  const { user, hasPermission } = useAuth();

  const menuItems: {
    id: NavigationTab;
    label: string;
    icon: React.FC<{ className?: string }>;
    badge?: string;
    badgeColor?: string;
  }[] = [
    {
      id: 'driver-console',
      label: 'Ma tournée',
      icon: Navigation,
      badge: 'Terrain',
      badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    },
    {
      id: 'live-map',
      label: 'Carte & suivi temps réel',
      icon: MapPin,
      badge: pendingGpsCount > 0 ? `${pendingGpsCount} GPS Sync` : 'Temps Réel',
      badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    },
    {
      id: 'alerts',
      label: "Centre d'alertes",
      icon: ShieldAlert,
      badge: 'Directes',
      badgeColor: 'bg-red-500/20 text-red-300 border-red-500/30 animate-pulse',
    },
    {
      id: 'trips',
      label: 'Historique des trajets',
      icon: Route,
    },
    {
      id: 'planning',
      label: 'Planification des missions',
      icon: CalendarClock,
    },
    {
      id: 'fleet',
      label: 'Flotte & chauffeurs',
      icon: Truck,
    },
    {
      id: 'scoring',
      label: 'Score de conduite',
      icon: Award,
      badge: '/ 100',
      badgeColor: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
    },
    {
      id: 'rewards',
      label: 'Primes & récompenses',
      icon: Gift,
      badge: 'Primes',
      badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    },
    {
      id: 'maintenance-fuel',
      label: 'Maintenance & carburant',
      icon: Wrench,
      badge: alertsCount > 0 ? `${alertsCount} Anomalies` : undefined,
      badgeColor: 'bg-red-500/20 text-red-300 border-red-500/30',
    },
    {
      id: 'help',
      label: 'Aide & guide',
      icon: BookOpen,
    },
    {
      id: 'ai-hub',
      label: 'Analyses & recommandations',
      icon: Sparkles,
      badge: 'IA',
      badgeColor: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
    },
  ];

  return (
    <aside className="w-full md:w-64 bg-slate-900 border-r border-slate-800 text-slate-300 p-4 flex flex-col justify-between shrink-0">
      <div>
        <div className="px-3 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
          <span>Navigation</span>
          <Cpu className="w-3.5 h-3.5 text-slate-500" />
        </div>

        <nav className="space-y-1 mt-2">
          {menuItems
            .filter(item => hasPermission(NAV_PERMISSIONS[item.id]))
            .map(item => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;

              return (
                <button
                  key={item.id}
                  onClick={() => onTabChange(item.id)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg font-medium text-xs flex items-center justify-between transition-all duration-150 group ${
                    isActive
                      ? 'bg-slate-800 text-white border border-slate-700/80 shadow-xs'
                      : 'hover:bg-slate-800/60 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon
                      className={`w-4 h-4 transition-colors ${
                        isActive ? 'text-orange-500' : 'text-slate-500 group-hover:text-orange-400'
                      }`}
                    />
                    <span>{item.label}</span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {item.badge && (
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded font-bold border ${item.badgeColor || 'bg-slate-800 text-slate-300 border-slate-700'}`}
                      >
                        {item.badge}
                      </span>
                    )}
                    <ChevronRight
                      className={`w-3.5 h-3.5 text-slate-600 transition-transform ${isActive ? 'translate-x-0.5 text-orange-400' : ''}`}
                    />
                  </div>
                </button>
              );
            })}
        </nav>
      </div>

      {/* Identité de l'utilisateur connecté */}
      <div className="mt-6 pt-4 border-t border-slate-800">
        {user ? (
          <div className="flex items-center gap-3 px-2 py-2 bg-slate-950/60 rounded-lg border border-slate-800/80">
            <div className="w-8 h-8 rounded-full bg-orange-600 flex items-center justify-center text-xs font-bold text-white shrink-0">
              {initials(user.fullName)}
            </div>
            <div className="overflow-hidden text-xs">
              <p className="font-semibold text-white truncate">{user.fullName}</p>
              <p className="text-[10px] text-slate-400 truncate">
                {roleLabel(user.role)} · {user.organizationName}
              </p>
            </div>
          </div>
        ) : (
          <div className="px-2 py-2 text-[10px] text-slate-500">Session de démonstration</div>
        )}
      </div>
    </aside>
  );
};
