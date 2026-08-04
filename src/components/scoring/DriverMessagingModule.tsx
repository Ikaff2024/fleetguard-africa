import React, { useState, useMemo, useEffect } from 'react';
import { Organization, Driver } from '../../types';
import { MOCK_DRIVERS, MOCK_VEHICLES } from '../../data/mock-data';
import {
  MessageSquare,
  Send,
  Smartphone,
  ShieldCheck,
  ShieldAlert,
  Bell,
  CheckCheck,
  Clock,
  User,
  Search,
  Filter,
  Sparkles,
  Zap,
  Truck,
  Award,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Volume2,
  FileText,
  RotateCcw,
  Check
} from 'lucide-react';

interface DriverMessagingModuleProps {
  currentOrg: Organization;
  defaultDriverId?: string;
}

export type MessageCategory =
  | 'SAFETY_REMINDER'
  | 'MISSION_UPDATE'
  | 'FUEL_INSTRUCTION'
  | 'MAINTENANCE_NOTICE'
  | 'GENERAL';

export type MessagePriority = 'NORMAL' | 'URGENT' | 'CRITICAL';

export interface DriverMessageItem {
  id: string;
  driverId: string;
  sender: 'MANAGER' | 'DRIVER';
  senderName: string;
  category: MessageCategory;
  priority: MessagePriority;
  text: string;
  sentAt: string;
  deliveredAt?: string;
  readAt?: string;
  ackRequired: boolean;
  ackReceived?: boolean;
}

export const DriverMessagingModule: React.FC<DriverMessagingModuleProps> = ({
  currentOrg,
  defaultDriverId,
}) => {
  const orgDrivers = useMemo(() => {
    return MOCK_DRIVERS.filter((d) => d.organizationId === currentOrg.id);
  }, [currentOrg.id]);

  const [selectedDriverId, setSelectedDriverId] = useState<string>(
    defaultDriverId || orgDrivers[0]?.id || 'drv_moussa_01'
  );

  const selectedDriver = useMemo(() => {
    return orgDrivers.find((d) => d.id === selectedDriverId) || orgDrivers[0];
  }, [orgDrivers, selectedDriverId]);

  const assignedVehicle = useMemo(() => {
    return MOCK_VEHICLES.find(
      (v) =>
        v.id === selectedDriver?.assignedVehicleId ||
        v.currentDriverId === selectedDriver?.id
    );
  }, [selectedDriver]);

  // Message history state per driver
  const [messagesMap, setMessagesMap] = useState<Record<string, DriverMessageItem[]>>({
    drv_moussa_01: [
      {
        id: 'msg_101',
        driverId: 'drv_moussa_01',
        sender: 'MANAGER',
        senderName: 'Directeur d\'Exploitation',
        category: 'SAFETY_REMINDER',
        priority: 'URGENT',
        text: 'Bonjour Moussa. Rappel de sécurité: Votre vitesse a dépassé 90 km/h sur le tronçon Savè-Parakou. Merci de maintenir le régulateur sous 80 km/h sur cet axe non éclairé.',
        sentAt: '2026-08-04 02:15:20',
        deliveredAt: '2026-08-04 02:15:22',
        readAt: '2026-08-04 02:16:05',
        ackRequired: true,
        ackReceived: true,
      },
      {
        id: 'msg_102',
        driverId: 'drv_moussa_01',
        sender: 'DRIVER',
        senderName: 'Moussa Diop (Terminal Mobile)',
        category: 'SAFETY_REMINDER',
        priority: 'NORMAL',
        text: 'Bien reçu Chef. Je viens de réduire à 75 km/h et d\'activer les feux de brouillard. Route dégagée vers Parakou.',
        sentAt: '2026-08-04 02:16:40',
        deliveredAt: '2026-08-04 02:16:41',
        readAt: '2026-08-04 02:17:00',
        ackRequired: false,
      },
      {
        id: 'msg_103',
        driverId: 'drv_moussa_01',
        sender: 'MANAGER',
        senderName: 'Directeur d\'Exploitation',
        category: 'FUEL_INSTRUCTION',
        priority: 'NORMAL',
        text: 'Consigne carburant: Effectuez votre plein intermédiaire à la station partenaire TotalEnergies Parakou (Pistolet N°3 avec badge Flotte).',
        sentAt: '2026-08-04 03:00:10',
        deliveredAt: '2026-08-04 03:00:12',
        readAt: '2026-08-04 03:02:15',
        ackRequired: false,
      },
    ],
    drv_ibrahim_02: [
      {
        id: 'msg_201',
        driverId: 'drv_ibrahim_02',
        sender: 'MANAGER',
        senderName: 'Responsable Flotte',
        category: 'MISSION_UPDATE',
        priority: 'NORMAL',
        text: 'Ibrahim, le créneau de déchargement du conteneur au Port de Cotonou (Quai 4) est déplacé à 14h30. Pas de précipitation.',
        sentAt: '2026-08-03 15:10:00',
        deliveredAt: '2026-08-03 15:10:05',
        readAt: '2026-08-03 15:12:00',
        ackRequired: true,
        ackReceived: true,
      },
    ],
  });

  // Compose State
  const [inputText, setInputText] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<MessageCategory>('SAFETY_REMINDER');
  const [selectedPriority, setSelectedPriority] = useState<MessagePriority>('NORMAL');
  const [requireAck, setRequireAck] = useState<boolean>(false);

  // Search & Filter within thread
  const [searchFilter, setSearchFilter] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');

  // Success Feedback Toast
  const [sendToast, setSendToast] = useState<string | null>(null);

  const activeDriverMessages = useMemo(() => {
    const list = messagesMap[selectedDriverId] || [];
    return list.filter((m) => {
      const matchCat = categoryFilter === 'ALL' || m.category === categoryFilter;
      const matchSearch =
        !searchFilter ||
        m.text.toLowerCase().includes(searchFilter.toLowerCase()) ||
        m.senderName.toLowerCase().includes(searchFilter.toLowerCase());
      return matchCat && matchSearch;
    });
  }, [messagesMap, selectedDriverId, categoryFilter, searchFilter]);

  // Handle Send Message
  const handleSendMessage = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim()) return;

    const now = new Date();
    const timeFormatted = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

    const newMessage: DriverMessageItem = {
      id: `msg_${Date.now()}`,
      driverId: selectedDriverId,
      sender: 'MANAGER',
      senderName: 'Directeur d\'Exploitation',
      category: selectedCategory,
      priority: selectedPriority,
      text: inputText.trim(),
      sentAt: timeFormatted,
      deliveredAt: timeFormatted,
      ackRequired: requireAck,
      ackReceived: false,
    };

    setMessagesMap((prev) => ({
      ...prev,
      [selectedDriverId]: [...(prev[selectedDriverId] || []), newMessage],
    }));

    setInputText('');
    setSendToast(`Message transmis au terminal mobile de ${selectedDriver?.fullName}`);
    setTimeout(() => setSendToast(null), 3500);

    // Simulate auto-receipt / driver acknowledgement after 3 seconds
    setTimeout(() => {
      setMessagesMap((prev) => {
        const currentList = prev[selectedDriverId] || [];
        const updatedList = currentList.map((msg) => {
          if (msg.id === newMessage.id) {
            return {
              ...msg,
              readAt: `${timeFormatted} (Lu)`,
              ackReceived: requireAck ? true : undefined,
            };
          }
          return msg;
        });
        return { ...prev, [selectedDriverId]: updatedList };
      });
    }, 2800);
  };

  // Quick Template Quick-Pills
  const applyTemplate = (
    category: MessageCategory,
    priority: MessagePriority,
    text: string,
    ack: boolean = false
  ) => {
    setSelectedCategory(category);
    setSelectedPriority(priority);
    setInputText(text);
    setRequireAck(ack);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden space-y-0">
      {/* Module Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 p-5 text-white flex flex-wrap items-center justify-between gap-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2 text-orange-400 text-xs font-bold uppercase tracking-wider mb-1">
            <Smartphone className="w-4 h-4 text-orange-400 animate-pulse" />
            <span>Centre de Communication Chauffeurs • Terminal Mobile & WhatsApp Gateway</span>
          </div>
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            <span>Messagerie Directe & Consignes de Sécurité</span>
            <span className="bg-emerald-500/20 text-emerald-300 text-[10px] font-extrabold px-2.5 py-0.5 rounded border border-emerald-500/30">
              Canal Chiffré Sécurisé
            </span>
          </h3>
          <p className="text-xs text-slate-300 mt-1 max-w-2xl leading-relaxed">
            Transmission instantanée de consignes de conduite, rappels de sécurité, alertes carburant et mises à jour de mission directement vers le terminal embarqué ou l'application mobile du chauffeur.
          </p>
        </div>

        <div className="flex items-center gap-2 bg-slate-800/80 p-2.5 rounded-lg border border-slate-700 text-xs">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping"></div>
          <div>
            <div className="font-bold text-slate-100">Passerelle Mobile Active</div>
            <div className="text-[10px] text-slate-400">Accusés de lecture automatiques via GPS IoT</div>
          </div>
        </div>
      </div>

      {/* Main Grid: Driver Selector Sidebar & Chat Window */}
      <div className="grid grid-cols-1 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-slate-200">
        {/* Left Column: Driver Selection List */}
        <div className="p-4 bg-slate-50 space-y-3 lg:col-span-1">
          <div className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center justify-between">
            <span>Chauffeurs Connectés ({orgDrivers.length})</span>
            <span className="text-[10px] text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded">
              En Ligne
            </span>
          </div>

          <div className="space-y-2">
            {orgDrivers.map((drv) => {
              const veh = MOCK_VEHICLES.find(
                (v) => v.id === drv.assignedVehicleId || v.currentDriverId === drv.id
              );
              const isSelected = drv.id === selectedDriverId;
              const msgCount = (messagesMap[drv.id] || []).length;

              return (
                <button
                  key={drv.id}
                  onClick={() => setSelectedDriverId(drv.id)}
                  className={`w-full text-left p-3 rounded-xl transition border cursor-pointer ${
                    isSelected
                      ? 'bg-orange-500 text-white border-orange-600 shadow-sm'
                      : 'bg-white text-slate-800 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs">{drv.fullName}</span>
                    <span
                      className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-bold ${
                        isSelected
                          ? 'bg-white/20 text-white'
                          : drv.currentSafetyScore >= 85
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {drv.currentSafetyScore} / 100
                    </span>
                  </div>

                  <div className={`text-[11px] mt-1 flex items-center gap-1 ${isSelected ? 'text-white/90' : 'text-slate-500'}`}>
                    <Truck className="w-3 h-3 shrink-0" />
                    <span className="truncate">{veh ? `${veh.immatriculation}` : 'Véhicule Flotte'}</span>
                  </div>

                  <div className="mt-2 flex items-center justify-between text-[10px]">
                    <span className={`flex items-center gap-1 ${isSelected ? 'text-white/80' : 'text-emerald-600'}`}>
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                      <span>App Mobile v2.4</span>
                    </span>

                    <span className={`font-mono ${isSelected ? 'text-white/80' : 'text-slate-400'}`}>
                      {msgCount} messages
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right 3 Columns: Active Driver Chat & Message Composition */}
        <div className="lg:col-span-3 p-5 flex flex-col justify-between space-y-4">
          {/* Active Driver Profile Header Bar */}
          <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-xl flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-orange-100 border border-orange-300 text-orange-800 flex items-center justify-center font-bold text-sm">
                {selectedDriver?.fullName.substring(0, 2).toUpperCase()}
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-bold text-slate-900">
                    {selectedDriver?.fullName}
                  </h4>
                  <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded border border-emerald-200">
                    Terminal Actif • ID: MOB-{selectedDriver?.id.substring(0, 8)}
                  </span>
                </div>

                <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-3 font-medium">
                  <span>Permis: <strong>{selectedDriver?.licenseNumber || 'Catégorie C/E'}</strong></span>
                  <span>Téléphone: <strong>{selectedDriver?.phoneNumber || '+229 97 00 11 22'}</strong></span>
                  <span>Véhicule: <strong>{assignedVehicle ? `${assignedVehicle.immatriculation} (${assignedVehicle.make})` : 'Camion Flotte'}</strong></span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="text-right">
                <div className="text-[10px] text-slate-400 uppercase font-bold">Safety Score</div>
                <div className="text-sm font-mono font-bold text-emerald-600">
                  {selectedDriver?.currentSafetyScore} / 100
                </div>
              </div>
            </div>
          </div>

          {/* Quick-Send Safety & Task Templates */}
          <div className="space-y-2">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-orange-500" />
              <span>Modèles de Consignes Rapides (Un Clic)</span>
            </div>

            <div className="flex flex-wrap gap-2 text-xs">
              <button
                onClick={() =>
                  applyTemplate(
                    'SAFETY_REMINDER',
                    'URGENT',
                    `Rappel de sécurité: Merci de respecter la limitation de 80 km/h sur le corridor RNIE 2.`,
                    true
                  )
                }
                className="bg-red-50 hover:bg-red-100 text-red-800 border border-red-200 px-2.5 py-1.5 rounded-lg font-semibold transition flex items-center gap-1.5 cursor-pointer"
              >
                <ShieldAlert className="w-3.5 h-3.5 text-red-600" />
                <span>🛡️ Limitation Vitesse (80 km/h)</span>
              </button>

              <button
                onClick={() =>
                  applyTemplate(
                    'SAFETY_REMINDER',
                    'NORMAL',
                    `Conseil fatigue: Vous avez conduit plus de 3h en continu. Pause obligatoire de 20 min préconisée sur la prochaine aire de repos.`,
                    false
                  )
                }
                className="bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 px-2.5 py-1.5 rounded-lg font-semibold transition flex items-center gap-1.5 cursor-pointer"
              >
                <Clock className="w-3.5 h-3.5 text-amber-600" />
                <span>☕ Pause Fatigue (20 min)</span>
              </button>

              <button
                onClick={() =>
                  applyTemplate(
                    'FUEL_INSTRUCTION',
                    'NORMAL',
                    `Consigne gazole: Effectuez votre complément de plein à la station partenaire TotalEnergies Parakou (Pistolet N°3).`,
                    false
                  )
                }
                className="bg-orange-50 hover:bg-orange-100 text-orange-800 border border-orange-200 px-2.5 py-1.5 rounded-lg font-semibold transition flex items-center gap-1.5 cursor-pointer"
              >
                <Zap className="w-3.5 h-3.5 text-orange-600" />
                <span>⛽ Plein Gazole TotalEnergies</span>
              </button>

              <button
                onClick={() =>
                  applyTemplate(
                    'MISSION_UPDATE',
                    'NORMAL',
                    `Mise à jour de mission: Créneau de livraison recalé à 14h30 au Port de Cotonou (Quai N°4).`,
                    true
                  )
                }
                className="bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 px-2.5 py-1.5 rounded-lg font-semibold transition flex items-center gap-1.5 cursor-pointer"
              >
                <Truck className="w-3.5 h-3.5 text-blue-600" />
                <span>📦 Créneau Livraison Port</span>
              </button>

              <button
                onClick={() =>
                  applyTemplate(
                    'SAFETY_REMINDER',
                    'CRITICAL',
                    `Alerte météo: Fortes pluies et visibilité réduite sur la traversée. Allumez les feux de détresses et réduisez à 60 km/h.`,
                    true
                  )
                }
                className="bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-200 px-2.5 py-1.5 rounded-lg font-semibold transition flex items-center gap-1.5 cursor-pointer"
              >
                <AlertCircle className="w-3.5 h-3.5 text-purple-600" />
                <span>⛈️ Alerte Météo & Visibilité</span>
              </button>
            </div>
          </div>

          {/* Toast Notification */}
          {sendToast && (
            <div className="bg-emerald-600 text-white p-3 rounded-xl font-bold text-xs shadow-md flex items-center justify-between animate-fade-in">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-200" />
                <span>{sendToast}</span>
              </div>
              <span className="text-[10px] font-mono text-emerald-200">Push OK</span>
            </div>
          )}

          {/* Conversation Messages Feed */}
          <div className="bg-slate-900 rounded-xl p-4 space-y-3 min-h-[260px] max-h-[360px] overflow-y-auto border border-slate-800">
            {activeDriverMessages.length === 0 ? (
              <div className="text-center py-12 text-slate-500 text-xs italic">
                Aucun message échangé pour le moment. Rédigez une consigne ci-dessous ou sélectionnez un modèle rapide.
              </div>
            ) : (
              activeDriverMessages.map((msg) => {
                const isManager = msg.sender === 'MANAGER';

                return (
                  <div
                    key={msg.id}
                    className={`flex flex-col max-w-[85%] ${
                      isManager ? 'ml-auto items-end' : 'mr-auto items-start'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1 text-[10px]">
                      <span className="font-bold text-slate-300">{msg.senderName}</span>
                      <span className="text-slate-500 font-mono">{msg.sentAt}</span>

                      {msg.priority === 'URGENT' && (
                        <span className="bg-red-500/20 text-red-400 border border-red-500/30 px-1.5 py-0.2 rounded font-extrabold">
                          URGENT
                        </span>
                      )}
                      {msg.priority === 'CRITICAL' && (
                        <span className="bg-purple-500/20 text-purple-300 border border-purple-500/30 px-1.5 py-0.2 rounded font-extrabold animate-pulse">
                          CRITIQUE
                        </span>
                      )}
                    </div>

                    <div
                      className={`p-3.5 rounded-2xl text-xs leading-relaxed shadow-xs ${
                        isManager
                          ? 'bg-orange-600 text-white rounded-tr-none'
                          : 'bg-slate-800 text-slate-100 rounded-tl-none border border-slate-700'
                      }`}
                    >
                      <p>{msg.text}</p>

                      <div className="mt-2 pt-1.5 border-t border-white/10 flex items-center justify-between text-[10px] font-mono text-slate-200">
                        <span>Catégorie: {msg.category}</span>

                        <div className="flex items-center gap-1">
                          {msg.ackRequired ? (
                            msg.ackReceived ? (
                              <span className="text-emerald-300 font-bold flex items-center gap-1">
                                <CheckCheck className="w-3.5 h-3.5" />
                                <span>Accusé de Lecture Signé</span>
                              </span>
                            ) : (
                              <span className="text-amber-300 font-bold flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                <span>En attente de confirmation</span>
                              </span>
                            )
                          ) : (
                            <span className="text-slate-300 flex items-center gap-1">
                              <Check className="w-3 h-3" />
                              <span>Reçu</span>
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Composition Box Form */}
          <form onSubmit={handleSendMessage} className="space-y-3 bg-slate-50 border border-slate-200 p-4 rounded-xl">
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase mb-0.5">
                    Catégorie
                  </label>
                  <select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value as any)}
                    className="bg-white border border-slate-300 text-slate-800 text-xs font-semibold rounded-lg p-1.5 focus:ring-2 focus:ring-orange-500/20"
                  >
                    <option value="SAFETY_REMINDER">🛡️ Rappel Sécurité</option>
                    <option value="MISSION_UPDATE">📦 Consigne Mission</option>
                    <option value="FUEL_INSTRUCTION">⛽ Instruction Carburant</option>
                    <option value="MAINTENANCE_NOTICE">🔧 Avis Maintenance</option>
                    <option value="GENERAL">💬 Message Général</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase mb-0.5">
                    Priorité
                  </label>
                  <select
                    value={selectedPriority}
                    onChange={(e) => setSelectedPriority(e.target.value as any)}
                    className="bg-white border border-slate-300 text-slate-800 text-xs font-semibold rounded-lg p-1.5 focus:ring-2 focus:ring-orange-500/20"
                  >
                    <option value="NORMAL">🟢 Normale</option>
                    <option value="URGENT">🟠 Urgente</option>
                    <option value="CRITICAL">🔴 Critique (Alarme Terminal)</option>
                  </select>
                </div>
              </div>

              <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-700">
                <input
                  type="checkbox"
                  checked={requireAck}
                  onChange={(e) => setRequireAck(e.target.checked)}
                  className="accent-orange-500 w-4 h-4 cursor-pointer"
                />
                <span>Exiger Accusé de Réception (Signature Chauffeur)</span>
              </label>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder={`Rédiger une consigne directe pour ${selectedDriver?.fullName}...`}
                className="flex-1 bg-white text-slate-900 border border-slate-300 rounded-xl p-3 text-xs focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
              />

              <button
                type="submit"
                disabled={!inputText.trim()}
                className={`px-5 py-3 rounded-xl font-bold text-xs transition flex items-center gap-2 shadow-xs cursor-pointer ${
                  inputText.trim()
                    ? 'bg-orange-500 hover:bg-orange-600 text-white'
                    : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                }`}
              >
                <Send className="w-4 h-4" />
                <span>Envoyer</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
