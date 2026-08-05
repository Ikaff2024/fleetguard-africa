import React from 'react';
import { Building2, Globe, Clock, User, ChevronDown, Database } from 'lucide-react';
import { MOCK_ORGANIZATIONS } from '../../data/mock-data';
import { Organization, UserRole } from '../../types';
import { useOfflineSync } from '../../context/OfflineSyncContext';
import { ThemeSwitcher } from '../common/ThemeSwitcher';

interface NavbarProps {
  currentOrg: Organization;
  onSelectOrg: (org: Organization) => void;
  currentRole: UserRole;
  onSelectRole: (role: UserRole) => void;
  onOpenOfflineDrawer: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentOrg,
  onSelectOrg,
  currentRole,
  onSelectRole,
  onOpenOfflineDrawer,
}) => {
  const { isOnline, pendingCount } = useOfflineSync();

  return (
    <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-100 px-6 py-3 flex flex-wrap items-center justify-between gap-4 sticky top-0 z-50 shadow-xs transition-colors">
      {/* Brand & Logo */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-orange-500 flex items-center justify-center text-white font-bold text-sm shadow-sm shrink-0">
          FG
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-bold text-lg tracking-tight text-slate-900 dark:text-slate-50">
              FleetGuard <span className="text-orange-500 font-extrabold italic">Africa</span>
            </h1>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-orange-50 dark:bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-200 dark:border-orange-500/30">
              Sprint 0 MVP
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 hidden sm:block">
            SaaS B2B Multi-Tenant de Gestion Intelligente de Flotte
          </p>
        </div>
      </div>

      {/* Multi-Tenant Switcher, Theme Switcher & Context Bar */}
      <div className="flex items-center flex-wrap gap-3 text-xs">
        {/* Network & IndexedDB Queue Button Trigger */}
        <button
          onClick={onOpenOfflineDrawer}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer transition shadow-2xs ${
            isOnline
              ? 'bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
              : 'bg-red-50 dark:bg-red-950/40 hover:bg-red-100 dark:hover:bg-red-900/50 text-red-800 dark:text-red-300 border-red-200 dark:border-red-800'
          }`}
          title="Ouvrir le gestionnaire de synchronisation IndexedDB"
        >
          <span
            className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`}
          ></span>
          <span>{isOnline ? 'En Ligne (4G)' : 'Hors-Ligne (Room DB)'}</span>

          {pendingCount > 0 && (
            <span className="ml-1 px-1.5 py-0.2 bg-orange-500 text-white text-[10px] font-mono font-extrabold rounded-full flex items-center gap-0.5">
              <Database className="w-2.5 h-2.5" />
              <span>{pendingCount}</span>
            </span>
          )}
        </button>

        {/* Theme Switcher Component */}
        <ThemeSwitcher />

        {/* Tenant Switcher */}
        <div className="relative group">
          <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200/80 dark:hover:bg-slate-700/80 border border-slate-200 dark:border-slate-700 px-3 py-1.5 rounded-lg text-slate-800 dark:text-slate-200 cursor-pointer transition font-medium">
            <Building2 className="w-4 h-4 text-orange-500" />
            <span className="font-bold">{currentOrg.name}</span>
            <span className="text-slate-500 dark:text-slate-400 text-[11px]">({currentOrg.country})</span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </div>

          <div className="absolute right-0 top-full mt-1 w-64 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg py-1.5 hidden group-hover:block z-50">
            <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider border-b border-slate-100 dark:border-slate-800">
              Changer d'Organisation (Isolation Tenant)
            </div>
            {MOCK_ORGANIZATIONS.map(org => (
              <button
                key={org.id}
                onClick={() => onSelectOrg(org)}
                className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800 transition ${
                  org.id === currentOrg.id
                    ? 'text-orange-600 dark:text-orange-400 font-bold bg-orange-50/60 dark:bg-orange-500/10'
                    : 'text-slate-700 dark:text-slate-300'
                }`}
              >
                <div>
                  <div className="font-semibold">{org.name}</div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400">
                    {org.country} • {org.currency}
                  </div>
                </div>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-mono">
                  {org.code}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Currency & Timezone Badge */}
        <div className="hidden md:flex items-center gap-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 px-2.5 py-1.5 rounded-lg text-slate-600 dark:text-slate-300">
          <Globe className="w-3.5 h-3.5 text-orange-500" />
          <span>
            Devise: <strong className="text-slate-800 dark:text-slate-100">{currentOrg.currency}</strong>
          </span>
          <span className="text-slate-300 dark:text-slate-700">|</span>
          <Clock className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
          <span>{currentOrg.timezone.split('/')[1] || currentOrg.timezone}</span>
        </div>

        {/* Role Switcher */}
        <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 rounded-lg text-slate-800 dark:text-slate-200">
          <User className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
          <select
            value={currentRole}
            onChange={e => onSelectRole(e.target.value as UserRole)}
            className="bg-transparent text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none cursor-pointer"
          >
            <option
              value="SUPER_ADMIN"
              className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100"
            >
              SuperAdmin System
            </option>
            <option
              value="ORGANIZATION_ADMIN"
              className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100"
            >
              Admin Organisation
            </option>
            <option
              value="FLEET_MANAGER"
              className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100"
            >
              Fleet Manager
            </option>
            <option
              value="SAFETY_OFFICER"
              className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100"
            >
              Safety Officer
            </option>
            <option
              value="MAINTENANCE_TECH"
              className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100"
            >
              Technicien Garage
            </option>
            <option value="DRIVER" className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100">
              Chauffeur Mobile
            </option>
          </select>
        </div>
      </div>
    </header>
  );
};
