import React, { useState } from 'react';
import { Organization } from '../../types';
import { Printer, Download, X, FileText, ShieldAlert, Wrench, Building } from 'lucide-react';

interface PrintableReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  currentOrg: Organization;
  reportCategory: 'PERFORMANCE' | 'INCIDENTS' | 'MAINTENANCE';
  documentReference?: string;
  children: React.ReactNode;
  onExportCSV?: () => void;
}

export const PrintableReportModal: React.FC<PrintableReportModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  currentOrg,
  reportCategory,
  documentReference,
  children,
  onExportCSV,
}) => {
  const [includeSignatureLine, setIncludeSignatureLine] = useState<boolean>(true);
  const [includeNotes, setIncludeNotes] = useState<boolean>(true);
  const [customNotes, setCustomNotes] = useState<string>(
    "Document certifié conforme pour l'exploitation de la flotte et les contrôles réglementaires (Ministère des Transports / Douanes).",
  );

  if (!isOpen) return null;

  const handleNativePrint = () => {
    window.print();
  };

  const currentDateStr = new Date().toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const refCode =
    documentReference || `REF-${currentOrg.code}-${reportCategory}-${Date.now().toString().slice(-6)}`;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto no-print">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Toolbar Header */}
        <div className="p-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2.5">
            {reportCategory === 'PERFORMANCE' ? (
              <FileText className="w-5 h-5 text-orange-400" />
            ) : reportCategory === 'INCIDENTS' ? (
              <ShieldAlert className="w-5 h-5 text-rose-400" />
            ) : (
              <Wrench className="w-5 h-5 text-amber-400" />
            )}
            <div>
              <h3 className="font-bold text-sm text-white flex items-center gap-2">
                <span>Aperçu Avant Impression — {title}</span>
                <span className="text-[10px] bg-orange-500/20 text-orange-300 px-2 py-0.5 rounded font-mono border border-orange-500/30">
                  Format A4 Impression
                </span>
              </h3>
              <p className="text-[11px] text-slate-400">
                Génération physique de documents officiels pour régulateurs, chauffeurs et ateliers.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onExportCSV && (
              <button
                onClick={onExportCSV}
                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 transition cursor-pointer"
                title="Exporter aussi au format CSV"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Format CSV</span>
              </button>
            )}

            <button
              onClick={handleNativePrint}
              className="px-4 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-md animate-pulse"
            >
              <Printer className="w-4 h-4" />
              <span>Imprimer (Lancer Impression)</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer ml-2"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Print Configuration Quick Controls Bar */}
        <div className="bg-slate-100 dark:bg-slate-800/80 px-6 py-2.5 border-b border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between text-xs gap-4 shrink-0 no-print">
          <div className="flex items-center gap-4 text-slate-700 dark:text-slate-300 font-medium">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={includeSignatureLine}
                onChange={e => setIncludeSignatureLine(e.target.checked)}
                className="rounded text-orange-500 focus:ring-orange-500"
              />
              <span>Zone d'émargement & signature</span>
            </label>

            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={includeNotes}
                onChange={e => setIncludeNotes(e.target.checked)}
                className="rounded text-orange-500 focus:ring-orange-500"
              />
              <span>Mention légale de certification</span>
            </label>
          </div>

          <span className="text-[10px] text-slate-400 font-mono">Réf: {refCode}</span>
        </div>

        {/* Printable Paper Canvas View */}
        <div className="flex-1 overflow-y-auto p-8 bg-slate-200 dark:bg-slate-950 flex justify-center">
          <div className="printable-document bg-white text-slate-900 p-8 rounded-lg shadow-xl border border-slate-300 w-full max-w-[800px] min-h-[900px] space-y-6 text-xs">
            {/* Header Letterhead */}
            <div className="border-b-2 border-slate-900 pb-4 flex justify-between items-start">
              <div>
                <div className="flex items-center gap-2">
                  <Building className="w-6 h-6 text-orange-600" />
                  <span className="text-base font-extrabold uppercase tracking-tight text-slate-900">
                    {currentOrg.name}
                  </span>
                </div>
                <div className="text-[10px] text-slate-600 mt-1 font-mono">
                  Code Flotte: <strong>{currentOrg.code}</strong> • Pays: {currentOrg.country} • Devise:{' '}
                  {currentOrg.currency}
                </div>
                <div className="text-[10px] text-slate-500 font-mono">
                  Système Télémetrique & Gestion Transfrontalière IA
                </div>
              </div>

              <div className="text-right font-mono">
                <div className="text-xs font-bold text-orange-600 uppercase tracking-wider">
                  RAPPORT D'EXPLOITATION
                </div>
                <div className="text-[10px] text-slate-600 mt-1">
                  Émis le : <strong>{currentDateStr}</strong>
                </div>
                <div className="text-[10px] text-slate-500">Réf: {refCode}</div>
              </div>
            </div>

            {/* Document Title & Subtitle Banner */}
            <div className="bg-slate-50 border border-slate-300 p-4 rounded-lg flex items-center justify-between">
              <div>
                <h1 className="text-base font-bold text-slate-900 uppercase tracking-tight">{title}</h1>
                {subtitle && <p className="text-[11px] text-slate-600 mt-0.5">{subtitle}</p>}
              </div>

              <div className="text-right">
                <span className="inline-block bg-slate-900 text-white font-mono text-[10px] font-bold px-2.5 py-1 rounded">
                  DOCUMENT OFFICIEL
                </span>
              </div>
            </div>

            {/* Report Main Content Area */}
            <div className="space-y-6">{children}</div>

            {/* Optional Legal Certification Note */}
            {includeNotes && (
              <div className="bg-slate-50 border border-slate-300 p-3 rounded text-[10px] text-slate-600 font-serif leading-relaxed italic">
                <strong>Certification Régulateur: </strong>
                {customNotes}
              </div>
            )}

            {/* Optional Signature Block */}
            {includeSignatureLine && (
              <div className="pt-6 border-t border-slate-300 grid grid-cols-2 gap-8 text-[11px] page-break-inside-avoid">
                <div className="space-y-8">
                  <div>
                    <span className="font-bold text-slate-800 block">
                      Le Régulateur de Flotte / Chef de Parc :
                    </span>
                    <span className="text-[10px] text-slate-500 block">Nom, Signature & Cachet Officiel</span>
                  </div>
                  <div className="h-16 border-b border-dashed border-slate-400"></div>
                </div>

                <div className="space-y-8">
                  <div>
                    <span className="font-bold text-slate-800 block">
                      Responsable Exploitation / Logistique :
                    </span>
                    <span className="text-[10px] text-slate-500 block">
                      Validation & Enregistrement Archivage
                    </span>
                  </div>
                  <div className="h-16 border-b border-dashed border-slate-400"></div>
                </div>
              </div>
            )}

            {/* Document Footer */}
            <div className="pt-4 border-t border-slate-200 text-[9px] text-slate-400 flex justify-between items-center font-mono">
              <span>Généré par TransAfrik Fleet AI Ops System</span>
              <span>Page 1 / 1 — Copie certifiée conforme</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
