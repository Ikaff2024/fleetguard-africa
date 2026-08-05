import React, { Suspense, lazy, useState } from 'react';
import { Navbar } from './components/layout/Navbar';
import { Sidebar, NavigationTab } from './components/layout/Sidebar';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { ModuleLoader } from './components/common/ModuleLoader';
import { OfflineSyncDrawer } from './components/common/OfflineSyncDrawer';

/**
 * Chaque écran est chargé à la demande.
 *
 * L'application groupée en un seul fichier pesait 1,39 Mo (363 Ko compressés) :
 * une dizaine de secondes d'écran blanc sur une 3G de corridor. Découpée, la
 * carte live s'affiche sans attendre le code des tableaux de bord annexes.
 */
const LiveFleetMap = lazy(() =>
  import('./components/map/LiveFleetMap').then(m => ({ default: m.LiveFleetMap })),
);
const AlertsCenter = lazy(() =>
  import('./components/alerts/AlertsCenter').then(m => ({ default: m.AlertsCenter })),
);
const DriverScoreCalculator = lazy(() =>
  import('./components/scoring/DriverScoreCalculator').then(m => ({ default: m.DriverScoreCalculator })),
);
const RewardsModule = lazy(() =>
  import('./components/rewards/RewardsModule').then(m => ({ default: m.RewardsModule })),
);
const FleetManagementView = lazy(() =>
  import('./components/fleet/FleetManagementView').then(m => ({ default: m.FleetManagementView })),
);
const FleetIntelligenceHub = lazy(() =>
  import('./components/ai/FleetIntelligenceHub').then(m => ({ default: m.FleetIntelligenceHub })),
);
const Sprint0DocViewer = lazy(() =>
  import('./components/sprint0/Sprint0DocViewer').then(m => ({ default: m.Sprint0DocViewer })),
);
import { OfflineSyncProvider, useOfflineSync } from './context/OfflineSyncContext';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { MOCK_ORGANIZATIONS } from './data/mock-data';
import { Organization, UserRole } from './types';
import { Database, X, RefreshCw, Headphones } from 'lucide-react';

function AppContent() {
  const [currentOrg, setCurrentOrg] = useState<Organization>(MOCK_ORGANIZATIONS[0]);
  const [currentRole, setCurrentRole] = useState<UserRole>('FLEET_MANAGER');
  // La carte live est l'écran de travail quotidien du régulateur. Le dossier
  // d'architecture reste accessible dans le menu, mais n'est plus la page
  // d'accueil : une démonstration client doit ouvrir sur le produit.
  const [activeTab, setActiveTab] = useState<NavigationTab>('live-map');
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);

  const {
    isOnline,
    setIsOnline,
    pendingCount,
    syncNotification,
    dismissNotification,
    triggerManualSync,
    isSyncing,
  } = useOfflineSync();
  const { isNightDispatcher } = useTheme();

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0b0f19] text-slate-900 dark:text-slate-100 font-sans flex flex-col selection:bg-orange-500 selection:text-white transition-colors duration-200">
      {/* Night Shift Dispatcher Mode Notice Banner (Visible when Night Dispatcher theme is active) */}
      {isNightDispatcher && (
        <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 text-orange-300 text-[11px] font-medium px-4 py-1.5 border-b border-orange-500/20 flex items-center justify-between gap-2 shadow-xs shrink-0">
          <div className="flex items-center gap-2">
            <span className="p-1 rounded bg-orange-500/20 text-orange-400">
              <Headphones className="w-3.5 h-3.5 animate-pulse" />
            </span>
            <span className="font-bold text-orange-400">Mode Régulateur Nuit Actif :</span>
            <span className="text-slate-300 hidden sm:inline">
              Rétroéclairage adouci et élimination de la lumière bleue pour garde nocturne 12h.
            </span>
          </div>
          <span className="text-[10px] bg-orange-500/10 text-orange-400 border border-orange-500/30 px-2 py-0.5 rounded font-mono">
            Optimisé Anti-Fatigue Visuelle
          </span>
        </div>
      )}

      {/* Top Notification Toast Bar */}
      {syncNotification && (
        <div className="bg-slate-900 dark:bg-slate-950 text-white px-6 py-2 text-xs flex items-center justify-between gap-4 border-b border-slate-800 animate-fade-in sticky top-0 z-50">
          <div className="flex items-center gap-2 font-medium">
            <span className="p-1 rounded bg-orange-500/20 text-orange-400">
              <Database className="w-3.5 h-3.5" />
            </span>
            <span>{syncNotification}</span>
          </div>

          <div className="flex items-center gap-3">
            {pendingCount > 0 && !isSyncing && isOnline && (
              <button
                onClick={triggerManualSync}
                className="text-[11px] font-bold text-emerald-400 hover:underline flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Synchroniser ({pendingCount})</span>
              </button>
            )}
            <button
              onClick={dismissNotification}
              className="text-slate-400 hover:text-white transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Top Navigation Bar */}
      <Navbar
        currentOrg={currentOrg}
        onSelectOrg={setCurrentOrg}
        currentRole={currentRole}
        onSelectRole={setCurrentRole}
        onOpenOfflineDrawer={() => setIsDrawerOpen(true)}
      />

      {/* Main Workspace Layout */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Sidebar Navigation */}
        <Sidebar
          activeTab={activeTab}
          onTabChange={setActiveTab}
          pendingGpsCount={pendingCount}
          alertsCount={2}
        />

        {/* Main Content Area */}
        <main className="flex-1 p-4 md:p-6 overflow-y-auto max-w-7xl mx-auto w-full space-y-6">
          {/* La clé sur l'onglet réinitialise la frontière d'erreur à chaque
              changement d'écran : un module en échec ne bloque pas la navigation. */}
          <ErrorBoundary key={activeTab} moduleName={activeTab}>
            <Suspense fallback={<ModuleLoader />}>
              {activeTab === 'sprint0' && <Sprint0DocViewer />}
              {activeTab === 'live-map' && <LiveFleetMap currentOrg={currentOrg} />}
              {activeTab === 'alerts' && (
                <AlertsCenter currentOrg={currentOrg} onNavigateToMap={() => setActiveTab('live-map')} />
              )}
              {activeTab === 'scoring' && <DriverScoreCalculator currentOrg={currentOrg} />}
              {activeTab === 'rewards' && <RewardsModule currentOrg={currentOrg} />}
              {activeTab === 'fleet' && <FleetManagementView currentOrg={currentOrg} />}
              {activeTab === 'maintenance-fuel' && <FleetManagementView currentOrg={currentOrg} />}
              {activeTab === 'ai-hub' && <FleetIntelligenceHub currentOrg={currentOrg} />}
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>

      {/* Footer Status Bar */}
      <footer className="bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 px-6 py-2.5 text-[11px] text-slate-500 dark:text-slate-400 flex flex-wrap items-center justify-between gap-2 shrink-0 transition-colors">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-slate-700 dark:text-slate-300">
            FleetGuard Africa MVP © 2026
          </span>
          <span>•</span>
          <span className="text-emerald-600 dark:text-emerald-400 font-bold bg-emerald-50 dark:bg-emerald-950/50 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800">
            IndexedDB Offline Queue Active
          </span>
          <span>•</span>
          <span>
            Tenant Actif: <strong className="text-slate-800 dark:text-slate-200">{currentOrg.name}</strong> (
            {currentOrg.code})
          </span>
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={() => setIsOnline(!isOnline)}
            className="hover:text-orange-600 text-slate-600 dark:text-slate-300 font-medium transition cursor-pointer flex items-center gap-1.5"
          >
            <span>Réseau :</span>
            <span
              className={
                isOnline
                  ? 'text-emerald-600 dark:text-emerald-400 font-bold bg-emerald-50 dark:bg-emerald-950/50 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800'
                  : 'text-red-600 dark:text-red-400 font-bold bg-red-50 dark:bg-red-950/50 px-2 py-0.5 rounded border border-red-200 dark:border-red-800'
              }
            >
              {isOnline ? 'En Ligne (Online)' : 'Hors-Ligne (Offline)'}
            </span>
          </button>

          <button
            onClick={() => setIsDrawerOpen(true)}
            className="text-orange-600 dark:text-orange-400 hover:underline font-bold flex items-center gap-1 cursor-pointer"
          >
            <Database className="w-3.5 h-3.5" />
            <span>IndexedDB Queue ({pendingCount})</span>
          </button>
        </div>
      </footer>

      {/* Offline Sync Drawer Modal */}
      <OfflineSyncDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        currentOrgId={currentOrg.id}
      />
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <OfflineSyncProvider>
        <AppContent />
      </OfflineSyncProvider>
    </ThemeProvider>
  );
}
