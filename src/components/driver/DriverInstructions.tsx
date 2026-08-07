import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCheck, Inbox, ShieldAlert } from 'lucide-react';
import { useMyMessages } from '../../hooks/useFleetData';
import { apiClient } from '../../lib/api-client';
import { DriverMessage } from '../../types';

/**
 * Consignes reçues par le chauffeur.
 *
 * C'est ici, et seulement ici, que se signe l'accusé de réception affiché au
 * bureau. Le gestionnaire ne dispose d'aucune route pour le faire à la place du
 * conducteur : c'est précisément ce qui donne sa valeur au document lorsqu'il
 * finit dans un dossier d'assurance.
 *
 * La lecture est constatée à l'affichage, la confirmation par un geste
 * délibéré. Les deux sont distinctes parce qu'elles ne disent pas la même
 * chose : « la consigne s'est affichée » n'est pas « j'en ai pris
 * connaissance et je m'y engage ».
 */

const PRIORITY_STYLES: Record<DriverMessage['priority'], string> = {
  CRITICAL: 'border-purple-300 bg-purple-50 dark:bg-purple-950/30 dark:border-purple-800',
  URGENT: 'border-red-300 bg-red-50 dark:bg-red-950/30 dark:border-red-800',
  NORMAL: 'border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-800',
};

const timeOf = (iso: string) =>
  new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

export const DriverInstructions: React.FC = () => {
  const messagesQuery = useMyMessages();
  const messages = useMemo(() => messagesQuery.data ?? [], [messagesQuery.data]);
  const [busyId, setBusyId] = useState<string | null>(null);

  /**
   * Constat de lecture, une seule fois par consigne.
   *
   * La liste est rechargée après chaque confirmation ; sans cette garde, le
   * même constat repartirait à chaque rendu. Le serveur ignore les doublons,
   * mais inonder une liaison de corridor pour rien serait déjà de trop.
   */
  const signaled = useRef<Set<string>>(new Set());

  useEffect(() => {
    const unread = messages.filter(m => !m.readAt && !signaled.current.has(m.id));
    if (unread.length === 0) return;

    unread.forEach(m => signaled.current.add(m.id));

    void (async () => {
      // Une consigne dont la lecture n'a pas pu remonter reste marquée non lue
      // au bureau : c'est le sens correct de l'échec. Elle sera reconstatée à
      // la prochaine ouverture.
      const results = await Promise.allSettled(
        unread.map(m => apiClient.post(`/me/messages/${m.id}/receipt`, { receipt: 'read' })),
      );
      unread.forEach((m, index) => {
        if (results[index]?.status === 'rejected') signaled.current.delete(m.id);
      });
      if (results.some(r => r.status === 'fulfilled')) messagesQuery.reload();
    })();
  }, [messages, messagesQuery]);

  const acknowledge = async (message: DriverMessage) => {
    setBusyId(message.id);
    try {
      await apiClient.post(`/me/messages/${message.id}/receipt`, { receipt: 'acknowledged' });
      messagesQuery.reload();
    } finally {
      setBusyId(null);
    }
  };

  const pending = messages.filter(m => m.ackRequired && !m.acknowledgedAt);

  if (messagesQuery.isLoading) {
    return <p className="text-xs text-slate-500 px-1">Chargement des consignes…</p>;
  }

  if (messages.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <Inbox className="w-4 h-4 text-orange-500" />
          Consignes de l’exploitation
        </h3>
        {pending.length > 0 && (
          <span className="text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200 px-2 py-0.5 rounded">
            {pending.length} à confirmer
          </span>
        )}
      </div>

      {[...messages].reverse().map(message => (
        <div key={message.id} className={`border rounded-xl p-4 ${PRIORITY_STYLES[message.priority]}`}>
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider">
            {message.priority === 'CRITICAL' && (
              <span className="flex items-center gap-1 text-purple-700 dark:text-purple-300">
                <AlertTriangle className="w-3.5 h-3.5" /> Critique
              </span>
            )}
            {message.priority === 'URGENT' && (
              <span className="flex items-center gap-1 text-red-700 dark:text-red-300">
                <ShieldAlert className="w-3.5 h-3.5" /> Urgent
              </span>
            )}
            <span className="text-slate-400 font-mono normal-case">{timeOf(message.sentAt)}</span>
          </div>

          <p className="mt-2 text-sm text-slate-900 dark:text-slate-100 leading-relaxed">{message.body}</p>
          <p className="mt-1 text-[11px] text-slate-500">De : {message.senderName}</p>

          {message.ackRequired &&
            (message.acknowledgedAt ? (
              <p className="mt-3 text-xs font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                <CheckCheck className="w-4 h-4" />
                Confirmée le {timeOf(message.acknowledgedAt)}
              </p>
            ) : (
              <button
                onClick={() => void acknowledge(message)}
                disabled={busyId === message.id}
                className="mt-3 w-full py-3 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white font-bold text-sm cursor-pointer"
              >
                {busyId === message.id ? 'Enregistrement…' : 'J’ai pris connaissance'}
              </button>
            ))}
        </div>
      ))}
    </div>
  );
};
