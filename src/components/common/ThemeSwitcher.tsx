import React, { useState, useRef, useEffect } from 'react';

import { useTheme, ThemeMode } from '../../context/ThemeContext';

import { Sun, Moon, Headphones, ChevronDown, Check, ShieldAlert, Eye, Sparkles } from 'lucide-react';

export const ThemeSwitcher: React.FC = () => {

  const { theme, setTheme, isNightDispatcher } = useTheme();

  const [isOpen, setIsOpen] = useState(false);

  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {

    const handleClickOutside = (event: MouseEvent) => {

      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {

        setIsOpen(false);

      }

    };

    document.addEventListener('mousedown', handleClickOutside);

    return () => document.removeEventListener('mousedown', handleClickOutside);

  }, []);

  const options: {

    id: ThemeMode;

    label: string;

    shortLabel: string;

    desc: string;

    icon: React.ReactNode;

    activeBgClass: string;

  }[] = [

    {

      id: 'light',

      label: 'Mode Jour (Clair)',

      shortLabel: 'Jour',

      desc: 'Luminosité standard pour bureau de jour',

      icon: <Sun className="w-4 h-4 text-amber-500" />,

      activeBgClass: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30',

    },

    {

      id: 'dark',

      label: 'Mode Sombre (Général)',

      shortLabel: 'Sombre',

      desc: 'Confort visuel général et économie d\'énergie',

      icon: <Moon className="w-4 h-4 text-indigo-400" />,

      activeBgClass: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30',

    },

    {

      id: 'night-dispatcher',

      label: 'Mode Régulateur Nuit (PC Sécurité)',

      shortLabel: 'PC Nuit 🎧',

      desc: 'Contraste renforcé anti-fatigue visuelle pour shifts nocturnes de 12h',

      icon: <Headphones className="w-4 h-4 text-orange-400" />,

      activeBgClass: 'bg-orange-500/10 text-orange-400 border-orange-500/30',

    },

  ];

  const currentOption = options.find((o) => o.id === theme) || options[0];

  return (

    <div className="relative inline-block text-left" ref={dropdownRef}>

      {/* Main Trigger Button */}

      <button

        onClick={() => setIsOpen(!isOpen)}

        className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer transition shadow-2xs ${

          theme === 'night-dispatcher'

            ? 'bg-slate-900 border-orange-500/40 text-orange-300 hover:bg-slate-800 ring-1 ring-orange-500/20'

            : theme === 'dark'

            ? 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'

            : 'bg-slate-100 hover:bg-slate-200/80 border-slate-200 text-slate-800'

        }`}

        title="Changer le thème visuel (Clair / Sombre / Régulateur Nuit)"

      >

        <span className="flex items-center gap-1.5">

          {currentOption.icon}

          <span className="font-bold hidden sm:inline">{currentOption.shortLabel}</span>

        </span>

        {isNightDispatcher && (

          <span className="bg-orange-500/20 text-orange-400 text-[10px] font-mono px-1.5 py-0.2 rounded border border-orange-500/30 animate-pulse hidden lg:inline">

            Anti-Flicker

          </span>

        )}

        <ChevronDown className="w-3.5 h-3.5 opacity-60" />

      </button>

      {/* Dropdown Menu */}

      {isOpen && (

        <div className="absolute right-0 top-full mt-1.5 w-72 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl py-2 z-50 animate-fade-in text-xs">

          <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">

            <span className="flex items-center gap-1">

              <Eye className="w-3 h-3 text-orange-500" />

              Confort Visuel Régulateur

            </span>

            <span className="text-[9px] font-mono text-slate-400">Shift 24/7</span>

          </div>

          <div className="p-1 space-y-1">

            {options.map((opt) => {

              const isSelected = opt.id === theme;

              return (

                <button

                  key={opt.id}

                  onClick={() => {

                    setTheme(opt.id);

                    setIsOpen(false);

                  }}

                  className={`w-full text-left p-2.5 rounded-lg border transition flex items-start gap-3 cursor-pointer ${

                    isSelected

                      ? `${opt.activeBgClass} font-bold`

                      : 'border-transparent hover:bg-slate-50 dark:hover:bg-slate-800/60 text-slate-700 dark:text-slate-300'

                  }`}

                >

                  <div className="mt-0.5 shrink-0">{opt.icon}</div>

                  <div className="flex-1 min-w-0">

                    <div className="flex items-center justify-between gap-1">

                      <span className="font-bold text-slate-900 dark:text-slate-100">{opt.label}</span>

                      {isSelected && <Check className="w-3.5 h-3.5 text-orange-500 shrink-0" />}

                    </div>

                    <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">

                      {opt.desc}

                    </p>

                  </div>

                </button>

              );

            })}

          </div>

          {/* Special Night Dispatcher Banner Note */}

          <div className="mx-2 mt-1 p-2 rounded-lg bg-orange-950/20 border border-orange-500/20 text-[10px] text-orange-300/90 leading-tight flex items-start gap-2">

            <Sparkles className="w-3.5 h-3.5 text-orange-400 shrink-0 mt-0.5" />

            <div>

              <strong>Mode PC Sécurité & Nuit:</strong> Élimine l'éblouissement sur écran géant en salle de contrôle et optimise les alertes critiques.

            </div>

          </div>

        </div>

      )}

    </div>

  );

};

