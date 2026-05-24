/**
 * SystemPage — Unified hub for all system configuration.
 *
 * Tabs: General · Auth & URLs · Email outbox
 *
 * Active tab is reflected in the URL via ?tab= so deep-links and the
 * legacy redirects from /admin/settings/auth and /admin/settings/email-outbox
 * still land on the right sub-section.
 *
 * UX note: header uses a clean Mazzard title with a subtle icon pill, and a
 * single segmented control for tabs (no per-tab borders / no yellow halo) so
 * the page reads as one calm surface instead of three competing UI rectangles.
 */
import React, { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Wrench,
  ShieldCheck,
  EnvelopeSimple,
} from '@phosphor-icons/react';

import AdminSettingsPage from './AdminSettingsPage';
import AuthSettingsPage from './AuthSettingsPage';
import EmailOutboxPage from './EmailOutboxPage';

import { useLang } from '../../i18n';
import SectionTabs from '../../components/ui/SectionTabs';

const TABS = [
  { id: 'general', label: 'General',      icon: Wrench },
  { id: 'auth',    label: 'Auth & URLs',  icon: ShieldCheck },
  { id: 'email',   label: 'Email outbox', icon: EnvelopeSimple },
];

export default function SystemPage() {
  const { t } = useLang();
  const location = useLocation();
  const navigate = useNavigate();

  const activeTab = useMemo(() => {
    const search = new URLSearchParams(location.search);
    const tab = search.get('tab') || 'general';
    return TABS.find((x) => x.id === tab) ? tab : 'general';
  }, [location.search]);

  const setTab = (id) => {
    const search = new URLSearchParams(location.search);
    search.set('tab', id);
    navigate({ pathname: '/admin/settings', search: search.toString() }, { replace: false });
  };

  const active = TABS.find((x) => x.id === activeTab) || TABS[0];

  return (
    <div className="min-h-full bg-[#FAFAFA]" style={{ fontFamily: 'Mazzard, Mazzard H, Mazzard M, system-ui, sans-serif' }}>
      {/* ────────────── Header ────────────── */}
      <div className="px-4 sm:px-6 pt-5 sm:pt-6 pb-4 bg-white border-b border-[#E4E4E7]">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[#18181B] text-white flex items-center justify-center shrink-0">
              <Wrench size={17} weight="regular" />
            </div>
            <div className="min-w-0">
              <h1 className="text-[19px] sm:text-[22px] font-semibold tracking-tight text-[#18181B] leading-tight">
                {t('notifSystem') || 'System'}
              </h1>
              <p className="text-[12.5px] sm:text-[13px] text-[#71717A] mt-0.5">
                {t('adm3_7cc60ff3e9') || 'Pipelines, authentication, URLs and email transport.'}
              </p>
            </div>
          </div>

          {/* ────────────── Tabs (unified) ────────────── */}
          <div className="mt-5">
            <SectionTabs
              tabs={TABS}
              activeId={activeTab}
              onChange={setTab}
              testIdPrefix="system-tab"
              ariaLabel="System sections"
            />
          </div>
        </div>
      </div>

      {/* ────────────── Content ────────────── */}
      <div className="px-4 sm:px-6 py-5 sm:py-6">
        <div className="max-w-6xl mx-auto" data-active-tab={active.id}>
          {activeTab === 'general' && <AdminSettingsPage embedded />}
          {activeTab === 'auth'    && <AuthSettingsPage    embedded />}
          {activeTab === 'email'   && <EmailOutboxPage     embedded />}
        </div>
      </div>
    </div>
  );
}
