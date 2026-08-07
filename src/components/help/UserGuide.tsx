import React, { useState } from 'react';
import { AlertTriangle, BookOpen, CheckCircle2, ChevronRight, Lightbulb, Printer, Users } from 'lucide-react';
import { GUIDE_LIMITS, GUIDE_SECTIONS, type GuideSection } from './guide-content';
import { Organization } from '../../types';

/**
 * Guide d'utilisation.
 *
 * Écrit pour quelqu'un qui n'a jamais utilisé de logiciel de flotte : un
 * exploitant qui tenait ses tournées sur un cahier, un chef d'atelier, un
 * chauffeur. Chaque fiche suit le même ordre — à quoi ça sert, qui s'en sert,
 * pas à pas, astuces, limites, en cas de problème — pour qu'on sache où
 * regarder sans relire.
 *
 * Les limites y ont autant de place que les fonctions. Un manuel qui promet
 * une capacité absente coûte plus cher qu'un manuel incomplet : l'utilisateur
 * cherche, ne trouve pas, se croit maladroit, et cesse de faire confiance au
 * reste.
 */

interface UserGuideProps {
  currentOrg: Organization;
}

export const UserGuide: React.FC<UserGuideProps> = ({ currentOrg }) => {
  const [activeId, setActiveId] = useState<string>(GUIDE_SECTIONS[0]!.id);

  const active = GUIDE_SECTIONS.find(section => section.id === activeId) ?? GUIDE_SECTIONS[0]!;
  const showLimits = activeId === 'limites';

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-xs flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-orange-600 font-bold text-xs uppercase tracking-wider mb-1">
            <BookOpen className="w-4 h-4 text-orange-500" />
            <span>Aide &amp; prise en main</span>
          </div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            Guide d’utilisation, écran par écran
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-2xl leading-relaxed">
            Aucune compétence technique n’est nécessaire. Si vous savez ouvrir un site et cliquer, vous savez
            utiliser FleetGuard. Les boutons de l’application sont écrits <strong>en gras</strong>.
          </p>
        </div>

        <button
          onClick={() => window.print()}
          className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-bold transition flex items-center gap-2 border border-slate-200 dark:border-slate-700 cursor-pointer"
        >
          <Printer className="w-4 h-4" />
          <span>Imprimer cette fiche</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Sommaire */}
        <nav className="lg:col-span-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 h-fit lg:sticky lg:top-24">
          <div className="px-2 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            Sommaire
          </div>

          <div className="space-y-0.5">
            {GUIDE_SECTIONS.map(section => (
              <button
                key={section.id}
                onClick={() => setActiveId(section.id)}
                className={`w-full text-left px-2.5 py-2 rounded-lg text-xs transition flex items-center gap-2 cursor-pointer ${
                  activeId === section.id
                    ? 'bg-orange-50 dark:bg-orange-500/10 text-orange-700 dark:text-orange-300 font-bold'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                <span className="font-mono text-[10px] opacity-60 shrink-0">{section.number}.</span>
                <span className="leading-snug">{section.title}</span>
              </button>
            ))}

            <button
              onClick={() => setActiveId('limites')}
              className={`w-full text-left px-2.5 py-2 rounded-lg text-xs transition flex items-center gap-2 cursor-pointer mt-1 border-t border-slate-100 dark:border-slate-800 pt-2.5 ${
                showLimits
                  ? 'bg-amber-50 dark:bg-amber-500/10 text-amber-800 dark:text-amber-300 font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <span className="leading-snug">Ce que l’application ne fait pas</span>
            </button>
          </div>
        </nav>

        {/* Fiche */}
        <article className="lg:col-span-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-6">
          {showLimits ? <LimitsCard orgName={currentOrg.name} /> : <SectionCard section={active} />}
        </article>
      </div>
    </div>
  );
};

const SectionCard: React.FC<{ section: GuideSection }> = ({ section }) => (
  <>
    <header className="border-b border-slate-100 dark:border-slate-800 pb-4">
      <div className="text-[10px] font-bold text-orange-600 uppercase tracking-wider">
        Fiche {section.number}
      </div>
      <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mt-0.5">{section.title}</h3>
      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{section.summary}</p>
    </header>

    <Block title="À quoi ça sert">
      <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{section.purpose}</p>
    </Block>

    <Block title="Qui s’en sert" icon={<Users className="w-3.5 h-3.5 text-slate-400" />}>
      <p className="text-sm text-slate-700 dark:text-slate-300">{section.audience}</p>
    </Block>

    <Block title="Pas à pas">
      <ol className="space-y-3">
        {section.steps.map((step, index) => (
          <li key={index} className="flex gap-3">
            <span className="shrink-0 w-6 h-6 rounded-full bg-slate-900 dark:bg-slate-700 text-white text-[11px] font-bold flex items-center justify-center">
              {index + 1}
            </span>
            <div className="space-y-1 pt-0.5">
              <p className="text-sm text-slate-800 dark:text-slate-200 leading-relaxed">{step.action}</p>
              {step.result && (
                <p className="text-xs text-emerald-700 dark:text-emerald-400 flex items-start gap-1.5 leading-relaxed">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>{step.result}</span>
                </p>
              )}
            </div>
          </li>
        ))}
      </ol>
    </Block>

    {section.tips && section.tips.length > 0 && (
      <Block title="Astuces" icon={<Lightbulb className="w-3.5 h-3.5 text-amber-500" />}>
        <ul className="space-y-1.5">
          {section.tips.map((tip, index) => (
            <li key={index} className="text-sm text-slate-700 dark:text-slate-300 flex gap-2 leading-relaxed">
              <ChevronRight className="w-3.5 h-3.5 shrink-0 mt-1 text-slate-400" />
              <span>{tip}</span>
            </li>
          ))}
        </ul>
      </Block>
    )}

    {section.limits && section.limits.length > 0 && (
      <Block
        title="Ce que cet écran ne fait pas"
        icon={<AlertTriangle className="w-3.5 h-3.5 text-amber-600" />}
      >
        <ul className="space-y-1.5">
          {section.limits.map((limit, index) => (
            <li key={index} className="text-sm text-slate-700 dark:text-slate-300 flex gap-2 leading-relaxed">
              <ChevronRight className="w-3.5 h-3.5 shrink-0 mt-1 text-amber-500" />
              <span>{limit}</span>
            </li>
          ))}
        </ul>
      </Block>
    )}

    {section.troubleshooting && section.troubleshooting.length > 0 && (
      <Block title="En cas de problème">
        <dl className="space-y-3">
          {section.troubleshooting.map((entry, index) => (
            <div
              key={index}
              className="bg-slate-50 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800 rounded-lg p-3"
            >
              <dt className="text-xs font-bold text-slate-900 dark:text-slate-100">{entry.problem}</dt>
              <dd className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                {entry.answer}
              </dd>
            </div>
          ))}
        </dl>
      </Block>
    )}
  </>
);

const LimitsCard: React.FC<{ orgName: string }> = ({ orgName }) => (
  <>
    <header className="border-b border-slate-100 dark:border-slate-800 pb-4">
      <div className="text-[10px] font-bold text-amber-600 uppercase tracking-wider">À savoir</div>
      <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mt-0.5">
        Ce que l’application ne fait pas
      </h3>
      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
        Rassemblé ici pour que vous puissiez le constater en trente secondes, plutôt que de chercher un écran
        qui n’existe pas. Ces limites sont assumées : elles seront levées quand la fonction correspondante
        marchera vraiment, pas avant.
      </p>
    </header>

    <ul className="space-y-3">
      {GUIDE_LIMITS.map(limit => (
        <li
          key={limit.title}
          className="bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded-lg p-3"
        >
          <div className="text-xs font-bold text-amber-900 dark:text-amber-300">{limit.title}</div>
          <p className="text-xs text-amber-800 dark:text-amber-200/80 mt-1 leading-relaxed">{limit.detail}</p>
        </li>
      ))}
    </ul>

    <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed border-t border-slate-100 dark:border-slate-800 pt-4">
      Une question sur un écran de {orgName} qui ne figure pas dans ce guide ? C’est probablement qu’il ne
      fait pas encore ce que vous cherchez. Signalez-le : c’est ainsi qu’on choisit quoi construire ensuite.
    </p>
  </>
);

const Block: React.FC<{ title: string; icon?: React.ReactNode; children: React.ReactNode }> = ({
  title,
  icon,
  children,
}) => (
  <section className="space-y-2">
    <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
      {icon}
      <span>{title}</span>
    </h4>
    {children}
  </section>
);
