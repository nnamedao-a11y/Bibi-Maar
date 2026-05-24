/**
 * Shared horizontal sub-navigation for the Admin → Control section.
 *
 * Renders 5 pill-style tabs that link to every Control page:
 *   • Business Metrics      /admin/business-metrics
 *   • Provider Pressure     /admin/provider-health
 *   • Routing Rules         /admin/routing-rules
 *   • Cadences              /admin/cadences
 *   • Score Rules           /admin/score-rules
 *
 * Behaviour:
 *   - Horizontal-scroll on mobile (no wrap, no broken layout)
 *   - Larger touch-friendly pills with generous vertical padding
 *   - Active state is derived from `useLocation()` so works without a prop
 *   - Sticky just below the main app header so it acts as a section header
 *
 * Usage:  <ControlSubNav /> at the very top of every Control page.
 */
import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  ChartLine,
  Gauge,
  Path,
  Timer,
  ChartLineUp,
  Lightning,
} from '@phosphor-icons/react';
import { useLang } from '../../i18n';

const ControlSubNav = () => {
  const { t } = useLang();
  const { pathname } = useLocation();

  const tabs = [
    {
      to: '/admin/business-metrics',
      icon: ChartLine,
      label: t('adm_business_metrics') || 'Business Metrics',
    },
    {
      to: '/admin/provider-health',
      icon: Gauge,
      label: 'Provider Pressure',
    },
    {
      to: '/admin/routing-rules',
      icon: Path,
      label: t('routingRules') || 'Routing Rules',
    },
    {
      to: '/admin/cadences',
      icon: Timer,
      label: t('cadences') || 'Cadences',
    },
    {
      to: '/admin/score-rules',
      icon: ChartLineUp,
      label: t('scoreRules') || 'Score Rules',
    },
  ];

  return (
    <div data-testid="control-subnav-wrapper">
      {/* Section heading — mirrors the Settings / Workflow / Workspace pattern.
          Dark-square icon block + title with subtitle gives the Control hub the
          same breathing room every other admin section has. */}
      <div className="px-1 mb-3 sm:mb-4 flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-[#18181B] text-white flex items-center justify-center shrink-0">
          <Lightning size={18} weight="duotone" />
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-[10.5px] sm:text-[11px] font-semibold uppercase tracking-[0.14em] text-[#71717A] block">
            {t('control') || 'Control'}
          </span>
          <h1 className="text-[18px] sm:text-[20px] font-semibold text-[#18181B] leading-tight tracking-tight" style={{ fontFamily: 'Mazzard, Mazzard H, Mazzard M, system-ui, sans-serif' }}>
            {t('adm_control_hub_title') || 'Control Hub'}
          </h1>
          <p className="mt-1 text-[12.5px] sm:text-[13px] text-[#71717A] leading-relaxed">
            {t('adm_control_hub_subtitle') || 'Business metrics, provider pressure, routing, cadences and scoring — all in one place.'}
          </p>
        </div>
      </div>

      {/* Tabs strip */}
      <div
        className="mb-5 sm:mb-6"
        data-testid="control-subnav"
      >
        <div className="overflow-x-auto scrollbar-none">
          {/* Canonical SectionTabs visual: #FAFAFA track + white active pill
              with 1.5px black ring. Same language used everywhere else
              (Documents, Marketing, Owner Dashboard sub-sections). */}
          <div
            role="tablist"
            aria-label="Control sections"
            className="inline-flex p-1 bg-[#FAFAFA] border border-[#E4E4E7] rounded-xl gap-1 max-w-full"
          >
            {tabs.map(({ to, icon: Icon, label }) => {
              const active = pathname === to;
              return (
                <NavLink
                  key={to}
                  to={to}
                  role="tab"
                  aria-selected={active}
                  className={`inline-flex items-center justify-center gap-1.5 sm:gap-2 px-3.5 py-1.5 rounded-lg text-[12.5px] sm:text-[13px] whitespace-nowrap shrink-0 transition-colors focus:outline-none focus-visible:ring-4 focus-visible:ring-black/10 ${
                    active
                      ? 'bg-white text-[#18181B] font-semibold ring-1.5 ring-[#18181B] shadow-[0_0_0_1.5px_#18181B] hover:bg-white'
                      : 'bg-transparent text-[#52525B] hover:text-[#18181B] font-medium'
                  }`}
                  style={{ fontFamily: 'inherit' }}
                  data-testid={`control-tab-${to.split('/').pop()}`}
                >
                  <Icon size={14} weight={active ? 'fill' : 'regular'} />
                  <span className="truncate">{label}</span>
                </NavLink>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ControlSubNav;
