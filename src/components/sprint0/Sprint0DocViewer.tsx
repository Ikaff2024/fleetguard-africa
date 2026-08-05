import React, { useState } from 'react';
import { SPRINT_0_DOCS } from '../../data/sprint0-docs';
import {
  FileText,
  Layers,
  Workflow,
  Database,
  Users,
  Code,
  Radio,
  Layout,
  CheckCircle2,
  Calendar,
  Copy,
  Check,
  Smartphone,
  ShieldCheck,
  Zap,
  Server,
} from 'lucide-react';

export const Sprint0DocViewer: React.FC = () => {
  const [activeSection, setActiveSection] = useState<number>(1);
  const [copiedPrisma, setCopiedPrisma] = useState<boolean>(false);

  const sections = [
    { id: 1, title: "1. Décisions d'Architecture", icon: Layers },
    { id: 2, title: '2. Monorepo & Fichiers', icon: FileText },
    { id: 3, title: '3. Diagramme Logique', icon: Workflow },
    { id: 4, title: '4. Schéma Prisma DB', icon: Database },
    { id: 5, title: '5. Matrice RBAC Rôles', icon: Users },
    { id: 6, title: '6. Contrats API v1', icon: Code },
    { id: 7, title: '7. Protocole GPS & Sync', icon: Radio },
    { id: 8, title: '8. Maquettes Écrans', icon: Layout },
    { id: 9, title: '9. Plan de Tests', icon: CheckCircle2 },
    { id: 10, title: '10. Roadmap Sprints 0-5', icon: Calendar },
  ];

  const handleCopyPrisma = () => {
    navigator.clipboard.writeText(SPRINT_0_DOCS.prismaSchemaText);
    setCopiedPrisma(true);
    setTimeout(() => setCopiedPrisma(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Sprint 0 Banner Header */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs relative overflow-hidden">
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-orange-600 font-bold text-xs uppercase tracking-wider mb-1">
              <ShieldCheck className="w-4 h-4" />
              <span>Sprint 0 • Livrables Complets de Conception</span>
            </div>
            <h2 className="text-2xl font-bold text-slate-900 tracking-tight">{SPRINT_0_DOCS.title}</h2>
            <p className="text-slate-500 text-xs mt-1">
              Version {SPRINT_0_DOCS.version} • Conçu par {SPRINT_0_DOCS.author} • {SPRINT_0_DOCS.date}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="px-3 py-1 rounded-lg bg-green-50 text-green-700 border border-green-200 text-xs font-bold flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
              Sprint 0 Validé
            </span>
          </div>
        </div>
      </div>

      {/* Navigation Sub-Tabs for Deliverables 1 to 10 */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none border-b border-slate-200">
        {sections.map(sec => {
          const Icon = sec.icon;
          const isActive = activeSection === sec.id;
          return (
            <button
              key={sec.id}
              onClick={() => setActiveSection(sec.id)}
              className={`px-3.5 py-2 rounded-lg text-xs font-bold whitespace-nowrap transition-all flex items-center gap-2 border cursor-pointer ${
                isActive
                  ? 'bg-orange-50 text-orange-600 border-orange-300 shadow-xs'
                  : 'bg-white text-slate-600 border-slate-200 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-orange-500' : 'text-slate-400'}`} />
              <span>{sec.title}</span>
            </button>
          );
        })}
      </div>

      {/* Section Content */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 text-slate-800 shadow-xs min-h-[500px]">
        {/* Deliverable 1: Architecture Decisions & Android Kotlin Rationale */}
        {activeSection === 1 && (
          <div className="space-y-6">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
              <div className="p-3 bg-orange-50 text-orange-600 rounded-xl border border-orange-100">
                <Smartphone className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  Hypothèses & Décisions d'Architecture (Android Native Kotlin vs React Native)
                </h3>
                <p className="text-xs text-slate-500">
                  Justification technique adaptée à la connectivité intermittente et à la gestion agressive de
                  batterie en Afrique.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div className="text-orange-600 font-bold text-xs uppercase mb-1 flex items-center gap-1.5">
                  <Zap className="w-4 h-4" />
                  Réseau Intermittent (Zone Blanche)
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Utilisation d'une base de données locale <strong>Room (SQLite)</strong> sur Android. Les
                  points GPS sont enregistrés localement avec un timestamp atomique avant toute tentative
                  d'envoi réseau.
                </p>
              </div>

              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div className="text-green-600 font-bold text-xs uppercase mb-1 flex items-center gap-1.5">
                  <Smartphone className="w-4 h-4" />
                  Arrière-Plan Persistant
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  <strong>Foreground Service Kotlin</strong> avec notification obligatoire. Empêche la
                  fermeture du processus GPS par l'OS Android (Transsion, Xiaomi, Samsung) lors de longs
                  trajets sans interaction.
                </p>
              </div>

              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div className="text-blue-600 font-bold text-xs uppercase mb-1 flex items-center gap-1.5">
                  <Server className="w-4 h-4" />
                  Idempotence & Multi-Tenant
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Envoi par batchs de 50 points avec token{' '}
                  <code className="text-orange-600 font-semibold">X-Batch-Id</code>. Dédoublonnage instantané
                  côté serveur via Redis et cloisonnement strict des données par{' '}
                  <code className="text-orange-600 font-semibold">organizationId</code>.
                </p>
              </div>
            </div>

            <div className="max-w-none text-xs leading-relaxed bg-slate-900 text-slate-200 p-5 rounded-xl border border-slate-800 whitespace-pre-wrap font-mono">
              {SPRINT_0_DOCS.architectureDecisions.content}
            </div>
          </div>
        )}

        {/* Deliverable 2: Monorepo Structure */}
        {activeSection === 2 && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
              <div className="p-3 bg-green-50 text-green-600 rounded-xl border border-green-100">
                <FileText className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">Structure Complète du Monorepo</h3>
                <p className="text-xs text-slate-500">
                  Organisation modulaire : apps Next.js, mobile Android Kotlin, backend NestJS, packages
                  partagés et Prisma DB.
                </p>
              </div>
            </div>

            <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 font-mono text-xs text-emerald-400 overflow-x-auto whitespace-pre">
              {SPRINT_0_DOCS.monorepoStructure.content}
            </div>
          </div>
        )}

        {/* Deliverable 3: Mermaid Logic Diagram */}
        {activeSection === 3 && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
              <div className="p-3 bg-purple-50 text-purple-600 rounded-xl border border-purple-100">
                <Workflow className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  Diagramme Logique de Flux de Données (Mermaid Architecture)
                </h3>
                <p className="text-xs text-slate-500">
                  Parcours complet depuis la captation GPS mobile jusqu'au tableau de bord temps réel et au
                  calcul du Driver Safety Score.
                </p>
              </div>
            </div>

            <div className="bg-slate-50 p-6 rounded-xl border border-slate-200 space-y-4">
              <div className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                Code Source Diagramme Mermaid :
              </div>
              <pre className="bg-slate-900 p-4 rounded-xl font-mono text-xs text-purple-300 overflow-x-auto border border-slate-800">
                {SPRINT_0_DOCS.mermaidDiagram}
              </pre>

              <div className="p-4 bg-white rounded-xl border border-slate-200 text-xs text-slate-700 space-y-2">
                <div className="font-bold text-slate-900">Explication des Flux :</div>
                <ol className="list-decimal list-inside space-y-1 text-slate-600">
                  <li>
                    L'application mobile Android Kotlin enregistre les coordonnées GPS et l'accéléromètre dans
                    la base Room local SQLite.
                  </li>
                  <li>
                    Le worker mobile déclenche l'envoi HTTP POST par lot dès la présence d'un réseau 2G/3G/4G.
                  </li>
                  <li>
                    L'API Gateway valide le token JWT et le filtre d'idempotence Redis via{' '}
                    <code className="text-orange-600 font-semibold">X-Batch-Id</code>.
                  </li>
                  <li>
                    Les points sont poussés dans la file BullMQ{' '}
                    <code className="text-orange-600 font-semibold">gps-ingestion-queue</code> pour traitement
                    asynchrone non-bloquant.
                  </li>
                  <li>
                    Les workers PostGIS enregistrent la télémétrie, vérifient les géofences et calculent le
                    Driver Safety Score sur 100.
                  </li>
                </ol>
              </div>
            </div>
          </div>
        )}

        {/* Deliverable 4: Initial Prisma Schema */}
        {activeSection === 4 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-blue-50 text-blue-600 rounded-xl border border-blue-100">
                  <Database className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">
                    Modèle de Données & Schéma Prisma Initial
                  </h3>
                  <p className="text-xs text-slate-500">
                    Schéma PostgreSQL complet gérant les organisations, utilisateurs, véhicules, GPS, scores
                    et maintenance.
                  </p>
                </div>
              </div>

              <button
                onClick={handleCopyPrisma}
                className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs text-slate-800 font-semibold flex items-center gap-1.5 border border-slate-200 transition cursor-pointer"
              >
                {copiedPrisma ? (
                  <Check className="w-4 h-4 text-green-600" />
                ) : (
                  <Copy className="w-4 h-4 text-slate-500" />
                )}
                <span>{copiedPrisma ? 'Copié !' : 'Copier schema.prisma'}</span>
              </button>
            </div>

            <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 max-h-[500px] overflow-y-auto">
              <pre className="font-mono text-xs text-sky-300 whitespace-pre leading-relaxed">
                {SPRINT_0_DOCS.prismaSchemaText}
              </pre>
            </div>
          </div>
        )}

        {/* Deliverable 5: RBAC Role & Permission Matrix */}
        {activeSection === 5 && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
              <div className="p-3 bg-red-50 text-red-600 rounded-xl border border-red-100">
                <Users className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  Matrice Rôles / Permissions (RBAC Multi-Tenant)
                </h3>
                <p className="text-xs text-slate-500">
                  Contrôle d'accès strict par rôle et isolation automatique des requêtes filtrées par{' '}
                  <code className="text-orange-600 font-semibold">organizationId</code>.
                </p>
              </div>
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <th className="p-3 font-bold uppercase tracking-wider text-[10px]">
                      Permission / Action Métier
                    </th>
                    <th className="p-3 font-bold text-center text-orange-600">SuperAdmin</th>
                    <th className="p-3 font-bold text-center text-green-600">Org Admin</th>
                    <th className="p-3 font-bold text-center text-blue-600">Fleet Mgr</th>
                    <th className="p-3 font-bold text-center text-purple-600">Safety Off</th>
                    <th className="p-3 font-bold text-center text-indigo-600">Tech Garage</th>
                    <th className="p-3 font-bold text-center text-slate-500">Chauffeur</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {SPRINT_0_DOCS.rbacMatrix.map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/80 transition">
                      <td className="p-3 font-medium text-slate-800">{row.permission}</td>
                      <td className="p-3 text-center">{row.superAdmin ? '✅' : '❌'}</td>
                      <td className="p-3 text-center">{row.orgAdmin ? '✅' : '❌'}</td>
                      <td className="p-3 text-center">{row.fleetMgr ? '✅' : '❌'}</td>
                      <td className="p-3 text-center">{row.safetyOfficer ? '✅' : '❌'}</td>
                      <td className="p-3 text-center">{row.tech ? '✅' : '❌'}</td>
                      <td className="p-3 text-center">{row.driver ? '✅' : '❌'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Deliverable 6: Main API Contracts */}
        {activeSection === 6 && (
          <div className="space-y-6">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
              <div className="p-3 bg-orange-50 text-orange-600 rounded-xl border border-orange-100">
                <Code className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">Contrats API Principaux (/api/v1/*)</h3>
                <p className="text-xs text-slate-500">
                  Exemples de requêtes et de réponses JSON pour l'authentification, l'ingestion GPS et le
                  Driver Score.
                </p>
              </div>
            </div>

            <div className="space-y-6">
              {SPRINT_0_DOCS.apiContracts.map((contract, idx) => (
                <div key={idx} className="bg-slate-50 p-5 rounded-xl border border-slate-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-orange-700 bg-orange-100/80 px-2.5 py-1 rounded border border-orange-200">
                      {contract.endpoint}
                    </span>
                    <span className="text-xs text-slate-500">{contract.description}</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
                    {contract.request && (
                      <div className="bg-slate-900 p-3 rounded-lg border border-slate-800">
                        <div className="text-[10px] font-bold text-slate-400 uppercase mb-1">
                          Payload Request (JSON) :
                        </div>
                        <pre className="text-sky-300 overflow-x-auto">
                          {JSON.stringify(contract.request, null, 2)}
                        </pre>
                      </div>
                    )}
                    <div className="bg-slate-900 p-3 rounded-lg border border-slate-800">
                      <div className="text-[10px] font-bold text-slate-400 uppercase mb-1">
                        Payload Response (JSON) :
                      </div>
                      <pre className="text-emerald-300 overflow-x-auto">
                        {JSON.stringify(contract.response, null, 2)}
                      </pre>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Deliverable 7: GPS Ingestion & Offline Sync Protocol */}
        {activeSection === 7 && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
              <div className="p-3 bg-green-50 text-green-600 rounded-xl border border-green-100">
                <Radio className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  Protocole d'Ingestion GPS & Synchronisation Hors Ligne
                </h3>
                <p className="text-xs text-slate-500">
                  Garantie d'idempotence via token{' '}
                  <code className="text-orange-600 font-semibold">X-Batch-Id</code>, gestion des zones
                  blanches et backoff exponentiel.
                </p>
              </div>
            </div>

            <div className="max-w-none text-xs leading-relaxed bg-slate-900 text-slate-200 p-5 rounded-xl border border-slate-800 whitespace-pre-wrap font-mono">
              {SPRINT_0_DOCS.gpsProtocolSpec}
            </div>
          </div>
        )}

        {/* Deliverable 8: Detailed Screen Textual Mockups */}
        {activeSection === 8 && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
              <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl border border-indigo-100">
                <Layout className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  Maquettes Textuelles Détaillées des Écrans
                </h3>
                <p className="text-xs text-slate-500">
                  Spécification de l'agencement UX/UI pour le Dashboard, la Cartographie Live et l'Assistant
                  IA Fleet Intelligence.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {SPRINT_0_DOCS.screenMockups.map((mockup, idx) => (
                <div key={idx} className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
                  <div className="text-xs font-bold text-orange-600">{mockup.screen}</div>
                  <pre className="font-mono text-[11px] text-slate-200 whitespace-pre-wrap leading-relaxed bg-slate-900 p-3 rounded-lg border border-slate-800">
                    {mockup.layoutText}
                  </pre>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Deliverable 9: Test Plan & Acceptance Criteria */}
        {activeSection === 9 && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
              <div className="p-3 bg-green-50 text-green-600 rounded-xl border border-green-100">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">Plan de Tests & Critères d'Acceptation</h3>
                <p className="text-xs text-slate-500">
                  Tests unitaires, tests d'isolation multi-tenant pour prévenir les fuites de données et tests
                  de montée en charge.
                </p>
              </div>
            </div>

            <div className="max-w-none text-xs leading-relaxed bg-slate-900 text-slate-200 p-5 rounded-xl border border-slate-800 whitespace-pre-wrap font-mono">
              {SPRINT_0_DOCS.testPlan.content}
            </div>
          </div>
        )}

        {/* Deliverable 10: Sprints 0 to 5 Roadmap */}
        {activeSection === 10 && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
              <div className="p-3 bg-purple-50 text-purple-600 rounded-xl border border-purple-100">
                <Calendar className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  Plan d'Implémentation par Sprint (Feuille de Route)
                </h3>
                <p className="text-xs text-slate-500">
                  Découpage chronologique des Sprints 0 à 5 pour l'industrialisation progressive de FleetGuard
                  Africa.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {SPRINT_0_DOCS.sprintsRoadmap.map((item, idx) => (
                <div
                  key={idx}
                  className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex items-center justify-between gap-4"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-extrabold text-xs text-orange-700 bg-orange-100 px-2.5 py-1 rounded border border-orange-200">
                      {item.sprint}
                    </span>
                    <span className="text-xs font-semibold text-slate-800">{item.focus}</span>
                  </div>
                  <span
                    className={`text-[10px] px-2.5 py-1 rounded-full font-bold border ${
                      item.status.includes('Terminé')
                        ? 'bg-green-50 text-green-700 border-green-200'
                        : 'bg-white text-slate-600 border-slate-200'
                    }`}
                  >
                    {item.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
