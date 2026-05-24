/**
 * Master-Admin → Email Outbox
 *
 * What changed visually:
 *   • The three previously nested cards (provider banner + filter card +
 *     table card) are collapsed into ONE unified panel. The provider chip
 *     and the event filter sit inline in the panel header next to Refresh,
 *     so there are no duplicate borders / no stacked palettes.
 *   • Table is responsive: row-cards on small screens, classic table on ≥sm.
 *   • All-Mazzard typography (no monospace dev font for the `event` column).
 */
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Mail, RefreshCw, CheckCircle2, XCircle, Eye, Filter, X } from 'lucide-react';

import { useLang } from '../../i18n';
import WhiteSelect from '../../components/ui/WhiteSelect';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

const authHeaders = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const STATUS_STYLE = {
  sent:    { label: 'sent',    color: 'bg-emerald-50  text-emerald-700  ring-emerald-200', icon: CheckCircle2 },
  dry_run: { label: 'dry-run', color: 'bg-amber-50    text-amber-700    ring-amber-200',   icon: Eye },
  failed:  { label: 'failed',  color: 'bg-rose-50     text-rose-700     ring-rose-200',    icon: XCircle },
  queued:  { label: 'queued',  color: 'bg-zinc-100    text-zinc-700     ring-zinc-200',    icon: Mail },
};

export default function EmailOutboxPage({ embedded = false }) {
  const { t } = useLang();
  const [items, setItems] = useState([]);
  const [provider, setProvider] = useState('dry_run');
  const [loading, setLoading] = useState(true);
  const [filterEvent, setFilterEvent] = useState('');
  const [selected, setSelected] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API_URL}/api/admin/email-outbox?limit=200`, { headers: authHeaders() });
      setItems(r.data?.items || []);
      setProvider(r.data?.provider || 'dry_run');
    } catch { toast.error(t('loadingError')); }
    finally { setLoading(false); }
  }, [t]);

  useEffect(() => {
    load();
    const timer = setInterval(load, 15000);
    return () => clearInterval(timer);
  }, [load]);

  const filtered = useMemo(
    () => items.filter((x) => !filterEvent || x.event === filterEvent),
    [items, filterEvent],
  );

  const events = Array.from(new Set(items.map((x) => x.event))).filter(Boolean);
  const isLive = provider === 'resend' || provider === 'smtp';

  return (
    <div className={embedded ? '' : 'p-6 max-w-[1280px] mx-auto'}>
      {/* ──────────── One unified card ──────────── */}
      <div className="bg-white border border-[#E4E4E7] rounded-2xl overflow-hidden">
        {/* Header — title + Refresh on top row; subtext on its own row */}
        <div className="px-4 sm:px-5 py-4 border-b border-[#F4F4F5]">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-lg bg-[#18181B] text-white flex items-center justify-center shrink-0">
                <Mail className="w-4 h-4" />
              </div>
              <h2 className="text-[15px] sm:text-[16px] font-semibold text-[#18181B] leading-tight truncate">
                {t('adm_email_outbox') || 'Email outbox'}
              </h2>
            </div>

            <button
              onClick={load}
              data-testid="email-refresh"
              disabled={loading}
              aria-label={t('adm_refresh_3') || 'Refresh'}
              className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-[#18181B] hover:bg-[#27272A] active:bg-black text-white disabled:opacity-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-black/15 shrink-0 transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} strokeWidth={2.5} />
            </button>
          </div>

          <p className="mt-2 text-[12px] sm:text-[12.5px] text-[#71717A] leading-relaxed flex flex-wrap items-center gap-1.5">
            <span>{t('adm_provider') || 'Provider:'}</span>
            <span
              className={
                'inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ring-1 ' +
                (isLive
                  ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                  : 'bg-amber-50 text-amber-700 ring-amber-200')
              }
            >
              {provider}
            </span>
            {!isLive && (
              <span className="text-[#71717A]">
                {t('adm3_638c49bee6') ||
                  '— real emails are not sent. Add RESEND_API_KEY to backend/.env for production.'}
              </span>
            )}
          </p>

          {/* Inline filter row */}
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <Filter className="w-3.5 h-3.5 text-[#71717A] shrink-0" />
            <div className="min-w-[160px] flex-1 sm:flex-none">
              <WhiteSelect
                value={filterEvent}
                onChange={(e) => setFilterEvent(e.target.value)}
                data-testid="email-filter-event"
              >
                <option value="">{t('allEvents') || 'All events'}</option>
                {events.map((e) => <option key={e} value={e}>{e}</option>)}
              </WhiteSelect>
            </div>
            {filterEvent && (
              <button
                type="button"
                onClick={() => setFilterEvent('')}
                className="inline-flex items-center gap-1 text-[11.5px] text-[#71717A] hover:text-[#18181B]"
              >
                <X className="w-3 h-3" /> clear
              </button>
            )}
            <span className="ml-auto text-[11.5px] text-[#71717A]">
              {filtered.length}{items.length !== filtered.length ? ` / ${items.length}` : ''} events
            </span>
          </div>
        </div>

        {/* Table (≥ sm) */}
        <div className="hidden sm:block">
          <table className="w-full text-sm">
            <thead className="bg-[#FAFAFA] text-[10.5px] uppercase tracking-[0.12em] text-[#71717A]">
              <tr>
                <th className="text-left px-5 py-2.5 font-semibold">{t('statusGeneric') || 'Status'}</th>
                <th className="text-left px-5 py-2.5 font-semibold">{t('event') || 'Event'}</th>
                <th className="text-left px-5 py-2.5 font-semibold">{t('adm_recipient') || 'Recipient'}</th>
                <th className="text-left px-5 py-2.5 font-semibold">{t('subjectLabel') || 'Subject'}</th>
                <th className="text-left px-5 py-2.5 font-semibold">{t('adm_time_2') || 'Time'}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && !loading ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-[#A1A1AA] text-[13px]">
                    {t('adm_outbox_is_empty_events_have_not_been_triggered_yet') ||
                      'Outbox is empty — events have not been triggered yet.'}
                  </td>
                </tr>
              ) : filtered.map((e) => {
                const s = STATUS_STYLE[e.status] || STATUS_STYLE.queued;
                const Icon = s.icon;
                return (
                  <tr
                    key={e.id}
                    onClick={() => setSelected(e)}
                    className="border-t border-[#F4F4F5] hover:bg-[#FAFAFA] cursor-pointer"
                  >
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ring-1 ${s.color}`}>
                        <Icon className="w-3 h-3" /> {s.label}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-[12.5px] text-[#3F3F46] font-medium">{e.event}</td>
                    <td className="px-5 py-3 text-[13px] text-[#3F3F46]">{e.to}</td>
                    <td className="px-5 py-3 text-[13px] text-[#18181B] truncate max-w-[420px]">{e.subject}</td>
                    <td className="px-5 py-3 text-[11.5px] text-[#71717A] tabular-nums">
                      {e.created_at ? new Date(e.created_at).toLocaleString() : '—'}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Eye className="w-4 h-4 text-[#A1A1AA] inline" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Stacked rows (mobile) */}
        <div className="sm:hidden divide-y divide-[#F4F4F5]">
          {filtered.length === 0 && !loading ? (
            <div className="px-4 py-10 text-center text-[#A1A1AA] text-[13px]">
              {t('adm_outbox_is_empty_events_have_not_been_triggered_yet') ||
                'Outbox is empty — events have not been triggered yet.'}
            </div>
          ) : filtered.map((e) => {
            const s = STATUS_STYLE[e.status] || STATUS_STYLE.queued;
            const Icon = s.icon;
            return (
              <button
                key={e.id}
                type="button"
                onClick={() => setSelected(e)}
                className="w-full text-left px-4 py-3 hover:bg-[#FAFAFA] focus:outline-none focus-visible:bg-[#FAFAFA]"
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-semibold ring-1 ${s.color}`}>
                    <Icon className="w-3 h-3" /> {s.label}
                  </span>
                  <span className="text-[10.5px] text-[#71717A] tabular-nums">
                    {e.created_at ? new Date(e.created_at).toLocaleString() : '—'}
                  </span>
                </div>
                <p className="text-[13.5px] text-[#18181B] font-semibold leading-tight truncate">
                  {e.subject || e.event}
                </p>
                <p className="text-[12px] text-[#71717A] mt-0.5 truncate">
                  → {e.to} <span className="text-[#D4D4D8] mx-1">·</span> {e.event}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* ──────────── Side drawer for event details ──────────── */}
      {selected && (
        <div className="fixed inset-0 z-40 flex" onClick={() => setSelected(null)}>
          <div className="flex-1 bg-zinc-900/40" />
          <aside
            className="w-full max-w-2xl bg-white shadow-2xl overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-white border-b border-[#E4E4E7] px-5 py-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] text-[#A1A1AA] truncate">{selected.id}</p>
                <h2 className="font-semibold text-[#18181B] mt-0.5 leading-tight">{selected.subject}</h2>
                <p className="text-[12px] text-[#71717A] mt-0.5">→ {selected.to}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="shrink-0 p-1.5 rounded-lg hover:bg-[#FAFAFA]"
                aria-label="Close"
              >
                <X className="w-4 h-4 text-[#71717A]" />
              </button>
            </div>
            <div className="p-5">
              <div
                className="border border-[#E4E4E7] rounded-xl p-4 bg-white prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: selected.html || '' }}
              />
              {selected.provider_error && (
                <pre className="mt-3 bg-rose-50 border border-rose-100 rounded-xl p-3 text-[11.5px] text-rose-700 overflow-x-auto whitespace-pre-wrap">
                  {selected.provider_error}
                </pre>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
