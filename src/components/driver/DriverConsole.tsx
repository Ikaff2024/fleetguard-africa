import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Gauge, MapPin, Play, Square, Truck, WifiOff } from 'lucide-react';
import { useApiResource } from '../../hooks/useApiResource';
import { DriverTracker, type TrackingStatus } from '../../services/driverTracking';
import { DriverInstructions } from './DriverInstructions';
import { Organization } from '../../types';

/**
 * Console de bord du chauffeur.
 *
 * Elle tient sur un téléphone, dans une cabine, souvent sans réseau. Tout ce
 * qui n'aide pas à conduire en est absent : un bouton pour démarrer la tournée,
 * l'état de la transmission, le score du jour.
 *
 * C'est cette console qui alimente tout le reste — trajets, alertes, score,
 * primes. Sans elle, l'API sait ingérer des positions mais personne ne lui en
 * envoie.
 */

interface Assignment {
  driverId: string;
  driverName: string;
  safetyScore: number;
  vehicle: { id: string; immatriculation: string; label: string } | null;
}

interface DriverConsoleProps {
  currentOrg: Organization;
}

export const DriverConsole: React.FC<DriverConsoleProps> = ({ currentOrg }) => {
  const assignmentQuery = useApiResource<Assignment>('/me/assignment');
  const assignment = assignmentQuery.data;

  const [tracker, setTracker] = useState<DriverTracker | null>(null);
  const [status, setStatus] = useState<TrackingStatus>({
    isTracking: false,
    pointsBuffered: 0,
    pointsSent: 0,
    screenLockHeld: false,
    interruptedMinutes: 0,
  });
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);

  useEffect(() => {
    const update = () => setIsOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  /**
   * L'émetteur est créé une fois l'affectation connue, et détruit avec l'écran.
   *
   * Il vit dans un effet plutôt que dans une ref lue au rendu : il ouvre une
   * montre GPS et un verrou d'écran, deux ressources qu'il faut relâcher
   * explicitement. Laisser une montre tourner après la fermeture viderait la
   * batterie du chauffeur sans plus rien transmettre.
   */
  useEffect(() => {
    if (!assignment?.vehicle) return;

    const instance = new DriverTracker(assignment.vehicle.id, assignment.driverId);
    setTracker(instance);
    const unsubscribe = instance.subscribe(setStatus);

    return () => {
      unsubscribe();
      void instance.stop();
      setTracker(null);
    };
  }, [assignment]);

  if (assignmentQuery.isLoading) {
    return <p className="p-6 text-sm text-slate-500">Chargement de votre affectation…</p>;
  }

  if (assignmentQuery.error || !assignment) {
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
        <AlertTriangle className="w-6 h-6 text-amber-500" />
        <p className="mt-3 text-sm font-bold text-slate-900 dark:text-slate-100">
          Aucune affectation trouvée
        </p>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          {assignmentQuery.error?.message ??
            'Votre compte n’est rattaché à aucune fiche chauffeur. Demandez à votre gestionnaire de flotte de faire le rattachement.'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-xl mx-auto">
      <div className="bg-slate-900 text-white rounded-2xl p-5">
        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{currentOrg.name}</div>
        <div className="mt-1 text-xl font-bold">{assignment.driverName}</div>

        <div className="mt-3 flex items-center gap-2 text-sm">
          <Truck className="w-4 h-4 text-orange-400 shrink-0" />
          {assignment.vehicle ? (
            <span>
              <span className="font-mono font-bold">{assignment.vehicle.immatriculation}</span>
              <span className="text-slate-400"> — {assignment.vehicle.label}</span>
            </span>
          ) : (
            <span className="text-amber-300">Aucun véhicule affecté</span>
          )}
        </div>

        <div className="mt-4 flex items-center gap-2 text-sm">
          <Gauge className="w-4 h-4 text-sky-400 shrink-0" />
          <span className="text-slate-300">Score de conduite :</span>
          <span className="font-mono font-bold">{assignment.safetyScore.toFixed(0)} / 100</span>
        </div>
      </div>

      <DriverInstructions />

      {!assignment.vehicle ? (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-800">
          Aucun véhicule ne vous est affecté : la tournée ne peut pas démarrer. Les positions seraient
          enregistrées sans camion, donc inexploitables.
        </div>
      ) : (
        <>
          <button
            onClick={() => (status.isTracking ? void tracker?.stop() : void tracker?.start())}
            className={`w-full py-5 rounded-2xl font-bold text-base flex items-center justify-center gap-3 transition cursor-pointer ${
              status.isTracking
                ? 'bg-rose-600 hover:bg-rose-700 text-white'
                : 'bg-emerald-600 hover:bg-emerald-700 text-white'
            }`}
          >
            {status.isTracking ? <Square className="w-5 h-5" /> : <Play className="w-5 h-5" />}
            <span>{status.isTracking ? 'Terminer la tournée' : 'Démarrer la tournée'}</span>
          </button>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3">
            <Row
              icon={MapPin}
              label="Positions transmises"
              value={String(status.pointsSent)}
              tone="text-emerald-600"
            />
            <Row
              icon={WifiOff}
              label="En attente d’envoi"
              value={String(status.pointsBuffered)}
              tone={status.pointsBuffered > 0 ? 'text-amber-600' : 'text-slate-400'}
            />
            {status.lastSentAt && (
              <Row
                icon={CheckCircle2}
                label="Dernier envoi"
                value={new Date(status.lastSentAt).toLocaleTimeString('fr-FR')}
                tone="text-slate-400"
              />
            )}
          </div>

          {!isOnline && (
            <div className="bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs text-slate-700 dark:text-slate-300">
              Hors réseau : les positions sont conservées sur le téléphone et partiront dès le retour du
              signal. Rien n’est perdu.
            </div>
          )}

          {status.isTracking && !status.screenLockHeld && (
            /* Limite réelle d'une application web : le navigateur suspend le
               code quand l'écran s'éteint. Le dire vaut mieux que laisser un
               chauffeur croire que sa tournée est suivie alors qu'elle ne
               l'est plus. */
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
              Gardez l’écran allumé pendant la tournée, téléphone branché. Écran éteint, le suivi s’interrompt
              jusqu’au prochain déverrouillage.
            </div>
          )}

          {status.interruptedMinutes > 0 && (
            /* Un trou dans la trace se dit. Le gestionnaire verra un trajet
               amputé ; le chauffeur doit savoir pourquoi, et l'entretien ne
               doit pas porter sur un soupçon de désactivation volontaire. */
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
              Environ {status.interruptedMinutes} min n’ont pas été enregistrées pendant que l’application
              était en arrière-plan. Laissez-la au premier plan, écran allumé.
            </div>
          )}

          {status.lastError && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs font-semibold text-red-700">
              {status.lastError}
            </div>
          )}
        </>
      )}
    </div>
  );
};

const Row: React.FC<{
  icon: React.FC<{ className?: string }>;
  label: string;
  value: string;
  tone: string;
}> = ({ icon: Icon, label, value, tone }) => (
  <div className="flex items-center justify-between text-sm">
    <span className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
      <Icon className={`w-4 h-4 ${tone}`} />
      {label}
    </span>
    <span className="font-mono font-bold text-slate-900 dark:text-slate-100">{value}</span>
  </div>
);
