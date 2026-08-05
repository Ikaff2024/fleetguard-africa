import React, { useState } from 'react';
import { Organization } from '../../types';
import { ApiClientError, apiClient, type FleetAnalysisResponse } from '../../lib/api-client';
import {
  Sparkles,
  Send,
  Bot,
  User,
  RefreshCw,
  AlertCircle,
  Zap,
  Fuel,
  MessageSquare,
  Wrench,
  Compass,
  FileSpreadsheet,
} from 'lucide-react';
import { FuelAnalyticsDashboard } from './FuelAnalyticsDashboard';
import { MaintenanceForecast } from './MaintenanceForecast';
import { RouteOptimizationTool } from './RouteOptimizationTool';
import { MonthlyReportGenerator } from './MonthlyReportGenerator';
import { FuelAnomalyDetection } from './FuelAnomalyDetection';

interface FleetIntelligenceHubProps {
  currentOrg: Organization;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  /** Réponse issue d'un exemple de démonstration, pas d'une analyse réelle. */
  isSimulated?: boolean;
  isError?: boolean;
}

export const FleetIntelligenceHub: React.FC<FleetIntelligenceHubProps> = ({ currentOrg }) => {
  const [activeTab, setActiveTab] = useState<
    'analytics' | 'route-opt' | 'maintenance' | 'copilot' | 'reports' | 'anomaly'
  >('reports');
  const [promptInput, setPromptInput] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content: `Bonjour ! Je suis l'assistant d'Intelligence de Flotte de FleetGuard Africa pour **${currentOrg.name}** (${currentOrg.country}).\n\nJ'analyse en continu vos données de télémétrie GPS, vos scores de conduite chauffeurs, vos consommations de carburant et vos échéances de maintenance.\n\nComment puis-je vous aider aujourd'hui ?`,
      timestamp: new Date().toLocaleTimeString(),
    },
  ]);

  const presetQuestions = [
    'Analyse les risques de vol de carburant ce mois-ci',
    'Fais un bilan des chauffeurs à risque et préconise des actions',
    'Quelles sont les pannes et maintenances imminentes à programmer ?',
    "Optimise les coûts d'exploitation sur l'axe Cotonou-Parakou",
  ];

  const handleSendQuery = async (customPrompt?: string) => {
    setActiveTab('copilot');
    const promptToSend = customPrompt || promptInput;
    if (!promptToSend.trim()) return;

    const userMsg = {
      role: 'user' as const,
      content: promptToSend,
      timestamp: new Date().toLocaleTimeString(),
    };

    setMessages(prev => [...prev, userMsg]);
    setPromptInput('');
    setIsLoading(true);

    try {
      // L'organisation n'est plus transmise : le serveur la lit dans le jeton
      // de session, où elle est prouvée.
      const result = await apiClient.post<FleetAnalysisResponse>('/intelligence/analyze', {
        prompt: promptToSend,
      });

      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: result.answer,
          timestamp: new Date().toLocaleTimeString(),
          isSimulated: result.isSimulated,
        },
      ]);
    } catch (err) {
      // Le message réel du serveur est affiché : « clé API non configurée » et
      // « quota dépassé » n'appellent pas la même action de la part de l'utilisateur.
      const message =
        err instanceof ApiClientError
          ? err.message
          : "Une erreur inattendue s'est produite lors de la connexion au serveur.";

      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: message,
          timestamp: new Date().toLocaleTimeString(),
          isError: true,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 relative overflow-hidden shadow-xs">
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-purple-600 font-bold text-xs uppercase tracking-wider mb-1">
              <Sparkles className="w-4 h-4 text-purple-500" />
              <span>Fleet Intelligence Hub • Powered by Gemini AI</span>
            </div>
            <h2 className="text-xl font-bold text-slate-900">
              Intelligence de Flotte & Dashboard Analytics Carburant
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Analyse contextuelle des consommations de carburant, graphiques de tendances mensuelles
              Recharts, préventions de vol et assistant copilote IA.
            </p>
          </div>

          <div className="px-3 py-1.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200 text-xs font-bold flex items-center gap-2">
            <Zap className="w-3.5 h-3.5 text-purple-600" />
            <span>Connecté à la Télémétrie {currentOrg.code}</span>
          </div>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3">
        <button
          onClick={() => setActiveTab('reports')}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 border cursor-pointer ${
            activeTab === 'reports'
              ? 'bg-orange-500 text-white border-orange-600 shadow-2xs'
              : 'bg-white text-slate-600 border-slate-200 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <FileSpreadsheet className="w-4 h-4" />
          <span>Rapports & Exports (CSV/PDF)</span>
        </button>

        <button
          onClick={() => setActiveTab('route-opt')}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 border cursor-pointer ${
            activeTab === 'route-opt'
              ? 'bg-emerald-50 text-emerald-700 border-emerald-300 shadow-2xs'
              : 'bg-white text-slate-600 border-slate-200 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <Compass className="w-4 h-4 text-emerald-600" />
          <span>Optimisation d'Itinéraires & Trafic</span>
        </button>

        <button
          onClick={() => setActiveTab('analytics')}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 border cursor-pointer ${
            activeTab === 'analytics'
              ? 'bg-orange-50 text-orange-600 border-orange-300 shadow-2xs'
              : 'bg-white text-slate-600 border-slate-200 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <Fuel className="w-4 h-4 text-orange-500" />
          <span>Dashboard Analytics Carburant (Recharts)</span>
        </button>

        <button
          onClick={() => setActiveTab('anomaly')}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 border cursor-pointer ${
            activeTab === 'anomaly'
              ? 'bg-rose-50 text-rose-700 border-rose-300 shadow-2xs'
              : 'bg-white text-slate-600 border-slate-200 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <AlertCircle className="w-4 h-4 text-rose-600" />
          <span>Détection d'Anomalies Carburant</span>
        </button>

        <button
          onClick={() => setActiveTab('maintenance')}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 border cursor-pointer ${
            activeTab === 'maintenance'
              ? 'bg-purple-50 text-purple-700 border-purple-300 shadow-2xs'
              : 'bg-white text-slate-600 border-slate-200 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <Wrench className="w-4 h-4 text-purple-600" />
          <span>Prévisions Maintenance & Télémétrie</span>
        </button>

        <button
          onClick={() => setActiveTab('copilot')}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 border cursor-pointer ${
            activeTab === 'copilot'
              ? 'bg-purple-50 text-purple-700 border-purple-300 shadow-2xs'
              : 'bg-white text-slate-600 border-slate-200 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <MessageSquare className="w-4 h-4 text-purple-600" />
          <span>Copilote IA & Décision Prédictive</span>
        </button>
      </div>

      {/* Render Active View */}
      {activeTab === 'reports' ? (
        <MonthlyReportGenerator currentOrg={currentOrg} />
      ) : activeTab === 'route-opt' ? (
        <RouteOptimizationTool currentOrg={currentOrg} />
      ) : activeTab === 'analytics' ? (
        <FuelAnalyticsDashboard currentOrg={currentOrg} />
      ) : activeTab === 'anomaly' ? (
        <FuelAnomalyDetection currentOrg={currentOrg} />
      ) : activeTab === 'maintenance' ? (
        <MaintenanceForecast currentOrg={currentOrg} />
      ) : (
        <div className="space-y-6">
          {/* Preset Action Buttons */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {presetQuestions.map((q, idx) => (
              <button
                key={idx}
                onClick={() => handleSendQuery(q)}
                disabled={isLoading}
                className="p-3.5 rounded-xl bg-white border border-slate-200 hover:border-orange-300 hover:bg-orange-50/50 text-left text-xs text-slate-700 transition group flex flex-col justify-between min-h-[75px] shadow-xs cursor-pointer"
              >
                <span className="font-semibold text-slate-800 group-hover:text-orange-900">{q}</span>
                <span className="text-[10px] text-orange-600 font-bold mt-2 flex items-center gap-1">
                  Exécuter l'analyse <Sparkles className="w-3 h-3 text-orange-500" />
                </span>
              </button>
            ))}
          </div>

          {/* Chat Conversation Box */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4 flex flex-col h-[500px] shadow-xs">
            <div className="flex-1 overflow-y-auto space-y-4 pr-2">
              {messages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex items-start gap-3 text-xs ${
                    msg.role === 'user' ? 'flex-row-reverse' : ''
                  }`}
                >
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                      msg.role === 'user'
                        ? 'bg-orange-500 text-white font-bold'
                        : 'bg-purple-600 text-white shadow-xs'
                    }`}
                  >
                    {msg.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                  </div>

                  <div
                    className={`p-4 rounded-xl max-w-[80%] whitespace-pre-wrap leading-relaxed shadow-xs ${
                      msg.role === 'user'
                        ? 'bg-orange-50 text-slate-900 border border-orange-200 font-medium'
                        : msg.isError
                          ? 'bg-red-50 text-red-900 border border-red-200'
                          : msg.isSimulated
                            ? 'bg-amber-50 text-slate-800 border border-amber-300'
                            : 'bg-slate-50 text-slate-800 border border-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-4 border-b border-slate-200/80 pb-1.5 mb-2 text-[10px] text-slate-500">
                      <span className="font-bold uppercase tracking-wider">
                        {msg.role === 'user' ? 'Vous (Gestionnaire)' : 'FleetGuard Intelligence Agent'}
                      </span>
                      <span className="font-mono text-slate-400">{msg.timestamp}</span>
                    </div>

                    {/* Une donnée d'exemple ne doit jamais être indiscernable d'une analyse réelle. */}
                    {msg.isSimulated && (
                      <div className="flex items-start gap-2 mb-3 p-2 rounded-lg bg-amber-100 border border-amber-300 text-amber-900 text-[11px] font-semibold">
                        <AlertCircle className="w-4 h-4 shrink-0 mt-px" />
                        <span>
                          Exemple de démonstration — ce texte n'est pas une analyse de vos données réelles.
                          Configurez la clé du moteur d'analyse pour obtenir un diagnostic fondé sur votre
                          flotte.
                        </span>
                      </div>
                    )}

                    {msg.isError && (
                      <div className="flex items-start gap-2 mb-3 p-2 rounded-lg bg-red-100 border border-red-300 text-red-900 text-[11px] font-semibold">
                        <AlertCircle className="w-4 h-4 shrink-0 mt-px" />
                        <span>Analyse non produite</span>
                      </div>
                    )}

                    {msg.content}
                  </div>
                </div>
              ))}

              {isLoading && (
                <div className="flex items-center gap-3 text-xs text-purple-700 bg-purple-50 p-4 rounded-xl border border-purple-200 w-fit">
                  <RefreshCw className="w-4 h-4 animate-spin text-purple-600" />
                  <span className="font-medium">
                    Analyse des capteurs GPS, consommations de carburant et scores en cours...
                  </span>
                </div>
              )}
            </div>

            {/* Prompt Input Form */}
            <div className="pt-3 border-t border-slate-100 flex items-center gap-2">
              <input
                type="text"
                value={promptInput}
                onChange={e => setPromptInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSendQuery()}
                placeholder="Posez une question sur votre flotte (ex: 'Puis-je réaffecter le camion RB-4592-A sur le trajet Cotonou-Malanville ?')..."
                className="flex-1 bg-slate-50 border border-slate-200 focus:border-orange-500 rounded-lg px-4 py-2.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none"
              />
              <button
                onClick={() => handleSendQuery()}
                disabled={isLoading || !promptInput.trim()}
                className="px-4 py-2.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs flex items-center gap-2 transition disabled:opacity-50 cursor-pointer shadow-xs"
              >
                <span>Analyser</span>
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
