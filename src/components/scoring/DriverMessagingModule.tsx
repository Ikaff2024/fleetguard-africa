import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  Check,
  CheckCheck,
  Clock,
  Send,
  ShieldAlert,
  Smartphone,
  Sparkles,
  Truck,
  Zap,
} from 'lucide-react';
import { useDriverMessages, useDrivers, useVehicles } from '../../hooks/useFleetData';
import { apiClient } from '../../lib/api-client';
import { DriverMessage, DriverMessageCategory, DriverMessagePriority, Organization } from '../../types';

/**
 * Consignes aux chauffeurs.
 *
 * Cet écran affichait des conversations entières écrites en dur, où des
 * chauffeurs nommés répondaient « Bien reçu Chef, je viens de réduire à
 * 75 km/h ». Il annonçait une « Passerelle Mobile Active », un « Canal Chiffré
 * Sécurisé » et des « accusés de lecture automatiques via GPS IoT » — dont rien
 * n'existait. Surtout, il signait l'accusé de réception 2,8 secondes après
 * l'envoi, par un minuteur.
 *
 * C'était la fabrication la plus dangereuse de l'application. Un exploitant qui
 * transmet « fortes pluies, réduisez à 60 km/h » lisait que son conducteur
 * avait signé. Après un accident, l'entreprise aurait produit devant l'assureur
 * la preuve d'un avertissement qui n'avait jamais quitté le serveur — une pièce
 * fausse, versée de bonne foi.
 *
 * Les consignes sont désormais enregistrées, et leur réception est constatée en
 * trois temps distincts, chacun posé par un fait réel : la remise quand le
 * téléphone du chauffeur vient chercher la consigne, la lecture quand elle
 * s'affiche devant lui, la confirmation quand il appuie lui-même sur le bouton.
 * Aucun de ces trois moments ne peut être écrit depuis cet écran.
 */

interface DriverMessagingModuleProps {
  currentOrg: Organization;
  defaultDriverId?: string;
}

const CATEGORY_LABELS: Record<DriverMessageCategory, string> = {
  SAFETY_REMINDER: '🛡️ Rappel sécurité',
  MISSION_UPDATE: '📦 Consigne mission',
  FUEL_INSTRUCTION: '⛽ Instruction carburant',
  MAINTENANCE_NOTICE: '🔧 Avis maintenance',
  GENERAL: '💬 Message général',
};

const TEMPLATES: {
  label: string;
  category: DriverMessageCategory;
  priority: DriverMessagePriority;
  body: string;
  ack: boolean;
  tone: string;
  icon: React.ReactNode;
}[] = [
  {
    label: '🛡️ Limitation vitesse (80 km/h)',
    category: 'SAFETY_REMINDER',
    priority: 'URGENT',
    body: 'Rappel de sécurité : merci de respecter la limitation de 80 km/h sur le corridor.',
    ack: true,
    tone: 'bg-red-50 hover:bg-red-100 text-red-800 border-red-200',
    icon: <ShieldAlert className="w-3.5 h-3.5 text-red-600" />,
  },
  {
    label: '☕ Pause fatigue (20 min)',
    category: 'SAFETY_REMINDER',
    priority: 'NORMAL',
    body: 'Conseil fatigue : pause de 20 minutes préconisée sur la prochaine aire de repos.',
    ack: false,
    tone: 'bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-200',
    icon: <Clock className="w-3.5 h-3.5 text-amber-600" />,
  },
  {
    label: '⛽ Plein à la station conventionnée',
    category: 'FUEL_INSTRUCTION',
    priority: 'NORMAL',
    body: 'Consigne gazole : effectuez votre complément de plein à une station conventionnée du réseau.',
    ack: false,
    tone: 'bg-orange-50 hover:bg-orange-100 text-orange-800 border-orange-200',
    icon: <Zap className="w-3.5 h-3.5 text-orange-600" />,
  },
  {
    label: '⛈️ Alerte météo & visibilité',
    category: 'SAFETY_REMINDER',
    priority: 'CRITICAL',
    body: 'Alerte météo : fortes pluies et visibilité réduite. Allumez les feux et réduisez à 60 km/h.',
    ack: true,
    tone: 'bg-purple-50 hover:bg-purple-100 text-purple-800 border-purple-200',
    icon: <AlertCircle className="w-3.5 h-3.5 text-purple-600" />,
  },
];

const timeOf = (iso: string) =>
  new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

export const DriverMessagingModule: React.FC<DriverMessagingModuleProps> = ({ defaultDriverId }) => {
  const driversQuery = useDrivers();
  const vehiclesQuery = useVehicles();
  const drivers = useMemo(() => driversQuery.data ?? [], [driversQuery.data]);

  const [pickedDriverId, setPickedDriverId] = useState<string>(defaultDriverId ?? '');

  /**
   * Chauffeur affiché : celui choisi, sinon le premier de la liste.
   *
   * Dérivé plutôt que recopié dans un effet — un effet qui pose l'état écrase
   * le choix de l'utilisateur au moindre rechargement de la liste.
   */
  const selectedDriverId = pickedDriverId || drivers[0]?.id || '';

  const messagesQuery = useDriverMessages(selectedDriverId || undefined);
  const messages = useMemo(() => messagesQuery.data ?? [], [messagesQuery.data]);

  const selectedDriver = useMemo(
    () => drivers.find(d => d.id === selectedDriverId),
    [drivers, selectedDriverId],
  );

  const assignedVehicle = useMemo(
    () =>
      (vehiclesQuery.data ?? []).find(
        v => v.id === selectedDriver?.assignedVehicleId || v.currentDriverId === selectedDriver?.id,
      ),
    [selectedDriver, vehiclesQuery.data],
  );

  const [body, setBody] = useState('');
  const [category, setCategory] = useState<DriverMessageCategory>('SAFETY_REMINDER');
  const [priority, setPriority] = useState<DriverMessagePriority>('NORMAL');
  const [ackRequired, setAckRequired] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: 'ok' | 'ko'; text: string } | null>(null);

  const handleSend = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!body.trim() || !selectedDriverId || isSending) return;

    setIsSending(true);
    setFeedback(null);
    try {
      await apiClient.post('/messages', {
        driverId: selectedDriverId,
        category,
        priority,
        body: body.trim(),
        ackRequired,
      });
      setBody('');
      setFeedback({ tone: 'ok', text: 'Consigne enregistrée. Elle attend la relève du chauffeur.' });
      messagesQuery.reload();
    } catch (error) {
      setFeedback({
        tone: 'ko',
        text: error instanceof Error ? error.message : 'Envoi impossible.',
      });
    } finally {
      setIsSending(false);
    }
  };

  const pendingAck = messages.filter(m => m.ackRequired && !m.acknowledgedAt).length;

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xs overflow-hidden">
      <div className="bg-slate-900 p-5 text-white border-b border-slate-800">
        <div className="flex items-center gap-2 text-orange-400 text-xs font-bold uppercase tracking-wider mb-1">
          <Smartphone className="w-4 h-4" />
          <span>Consignes aux chauffeurs</span>
        </div>
        <h3 className="text-xl font-bold">Transmission et accusé de réception</h3>
        <p className="text-xs text-slate-300 mt-1 max-w-3xl leading-relaxed">
          La consigne est enregistrée puis remise au chauffeur à l’ouverture de sa console de bord. Les trois
          moments ci-dessous — remise, lecture, confirmation — ne sont horodatés que lorsqu’ils se produisent
          réellement, et aucun ne peut être renseigné depuis cet écran. C’est ce qui rend l’accusé opposable.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-slate-200 dark:divide-slate-800">
        <div className="p-4 bg-slate-50 dark:bg-slate-950/40 space-y-3 lg:col-span-1">
          <div className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider">
            Chauffeurs ({drivers.length})
          </div>

          {drivers.length === 0 ? (
            <p className="text-xs text-slate-500">Aucun chauffeur enregistré.</p>
          ) : (
            <div className="space-y-2">
              {drivers.map(driver => {
                const isSelected = driver.id === selectedDriverId;
                const vehicle = (vehiclesQuery.data ?? []).find(
                  v => v.id === driver.assignedVehicleId || v.currentDriverId === driver.id,
                );

                return (
                  <button
                    key={driver.id}
                    onClick={() => setPickedDriverId(driver.id)}
                    className={`w-full text-left p-3 rounded-xl transition border cursor-pointer ${
                      isSelected
                        ? 'bg-orange-500 text-white border-orange-600'
                        : 'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs">{driver.fullName}</span>
                      <span
                        className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-bold ${
                          isSelected
                            ? 'bg-white/20 text-white'
                            : driver.currentSafetyScore >= 85
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {driver.currentSafetyScore} / 100
                      </span>
                    </div>
                    <div
                      className={`text-[11px] mt-1 flex items-center gap-1 ${isSelected ? 'text-white/90' : 'text-slate-500'}`}
                    >
                      <Truck className="w-3 h-3 shrink-0" />
                      <span className="truncate">
                        {vehicle ? vehicle.immatriculation : 'Sans véhicule affecté'}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="lg:col-span-3 p-5 space-y-4">
          <div className="bg-slate-50 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800 p-3.5 rounded-xl flex flex-wrap items-center justify-between gap-3">
            <div>
              <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                {selectedDriver?.fullName ?? 'Aucun chauffeur sélectionné'}
              </h4>
              <div className="text-xs text-slate-500 mt-0.5 flex flex-wrap items-center gap-3">
                <span>
                  Téléphone : <strong>{selectedDriver?.phone || 'non renseigné'}</strong>
                </span>
                <span>
                  Véhicule : <strong>{assignedVehicle?.immatriculation ?? 'non affecté'}</strong>
                </span>
              </div>
            </div>

            {pendingAck > 0 && (
              <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 px-3 py-2 rounded-lg text-center">
                <div className="text-lg font-extrabold text-amber-700 dark:text-amber-300">{pendingAck}</div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                  En attente de confirmation
                </div>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-orange-500" />
              <span>Modèles de consignes</span>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              {TEMPLATES.map(template => (
                <button
                  key={template.label}
                  onClick={() => {
                    setCategory(template.category);
                    setPriority(template.priority);
                    setBody(template.body);
                    setAckRequired(template.ack);
                  }}
                  className={`border px-2.5 py-1.5 rounded-lg font-semibold transition flex items-center gap-1.5 cursor-pointer ${template.tone}`}
                >
                  {template.icon}
                  <span>{template.label}</span>
                </button>
              ))}
            </div>
          </div>

          {feedback && (
            <div
              className={`p-3 rounded-xl font-bold text-xs flex items-center gap-2 ${
                feedback.tone === 'ok'
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  : 'bg-rose-50 text-rose-800 border border-rose-200'
              }`}
            >
              <Check className="w-4 h-4" />
              <span>{feedback.text}</span>
            </div>
          )}

          <div className="bg-slate-900 rounded-xl p-4 space-y-3 min-h-[240px] max-h-[380px] overflow-y-auto border border-slate-800">
            {messagesQuery.isLoading ? (
              <p className="text-center py-12 text-slate-500 text-xs">Chargement des consignes…</p>
            ) : messages.length === 0 ? (
              <p className="text-center py-12 text-slate-500 text-xs italic">
                Aucune consigne transmise à ce chauffeur.
              </p>
            ) : (
              messages.map(message => <MessageBubble key={message.id} message={message} />)
            )}
          </div>

          <form
            onSubmit={handleSend}
            className="space-y-3 bg-slate-50 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800 p-4 rounded-xl"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex flex-wrap items-center gap-3">
                <label className="block">
                  <span className="block text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase mb-0.5">
                    Catégorie
                  </span>
                  <select
                    value={category}
                    onChange={e => setCategory(e.target.value as DriverMessageCategory)}
                    className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs font-semibold rounded-lg p-1.5"
                  >
                    {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="block text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase mb-0.5">
                    Priorité
                  </span>
                  <select
                    value={priority}
                    onChange={e => setPriority(e.target.value as DriverMessagePriority)}
                    className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs font-semibold rounded-lg p-1.5"
                  >
                    <option value="NORMAL">🟢 Normale</option>
                    <option value="URGENT">🟠 Urgente</option>
                    <option value="CRITICAL">🔴 Critique</option>
                  </select>
                </label>
              </div>

              <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={ackRequired}
                  onChange={e => setAckRequired(e.target.checked)}
                  className="accent-orange-500 w-4 h-4 cursor-pointer"
                />
                <span>Exiger une confirmation du chauffeur</span>
              </label>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                value={body}
                onChange={e => setBody(e.target.value)}
                placeholder={
                  selectedDriver ? `Consigne pour ${selectedDriver.fullName}…` : 'Sélectionnez un chauffeur…'
                }
                className="flex-1 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-xl p-3 text-xs"
              />

              <button
                type="submit"
                disabled={!body.trim() || !selectedDriverId || isSending}
                className={`px-5 py-3 rounded-xl font-bold text-xs transition flex items-center gap-2 ${
                  body.trim() && selectedDriverId && !isSending
                    ? 'bg-orange-500 hover:bg-orange-600 text-white cursor-pointer'
                    : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                }`}
              >
                <Send className="w-4 h-4" />
                <span>{isSending ? 'Envoi…' : 'Envoyer'}</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

/**
 * État réel d'une consigne.
 *
 * Les quatre états sont nommés pour ce qu'ils sont, sans arrondi favorable :
 * « en attente de relève » dit qu'il ne s'est encore rien passé, et c'est
 * précisément l'information dont un exploitant a besoin avant un départ.
 */
const MessageBubble: React.FC<{ message: DriverMessage }> = ({ message }) => (
  <div className="flex flex-col max-w-[85%] ml-auto items-end">
    <div className="flex items-center gap-2 mb-1 text-[10px]">
      <span className="font-bold text-slate-300">{message.senderName}</span>
      <span className="text-slate-500 font-mono">{timeOf(message.sentAt)}</span>
      {message.priority === 'URGENT' && (
        <span className="bg-red-500/20 text-red-400 border border-red-500/30 px-1.5 rounded font-extrabold">
          URGENT
        </span>
      )}
      {message.priority === 'CRITICAL' && (
        <span className="bg-purple-500/20 text-purple-300 border border-purple-500/30 px-1.5 rounded font-extrabold">
          CRITIQUE
        </span>
      )}
    </div>

    <div className="p-3.5 rounded-2xl rounded-tr-none text-xs leading-relaxed bg-orange-600 text-white">
      <p>{message.body}</p>

      <div className="mt-2 pt-1.5 border-t border-white/10 space-y-1 text-[10px] font-mono">
        {message.acknowledgedAt ? (
          <div className="flex items-center gap-1 text-emerald-200 font-bold">
            <CheckCheck className="w-3.5 h-3.5" />
            <span>Confirmée par le chauffeur le {timeOf(message.acknowledgedAt)}</span>
          </div>
        ) : message.readAt ? (
          <div className="flex items-center gap-1 text-sky-200">
            <Check className="w-3 h-3" />
            <span>
              Lue le {timeOf(message.readAt)}
              {message.ackRequired && ' — confirmation en attente'}
            </span>
          </div>
        ) : message.deliveredAt ? (
          <div className="flex items-center gap-1 text-slate-200">
            <Check className="w-3 h-3" />
            <span>Remise au téléphone le {timeOf(message.deliveredAt)} — pas encore ouverte</span>
          </div>
        ) : (
          <div className="flex items-center gap-1 text-amber-200">
            <Clock className="w-3 h-3" />
            <span>En attente de la relève du chauffeur</span>
          </div>
        )}
      </div>
    </div>
  </div>
);
