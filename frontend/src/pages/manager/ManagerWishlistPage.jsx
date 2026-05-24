/**
 * Manager Wishlist Builder  —  /manager/wishlist
 * ───────────────────────────────────────────────
 * Manager-facing form to curate the homepage "Top vehicles deals of
 * the week" block. The manager:
 *   1. Picks a category (motorbike|sedan|suv|pickup|van) — 5 icons
 *      matching the public filter bar.
 *   2. Picks a budget bucket (10-15K | 15-25K | 30-50K).
 *   3. Types/pastes a VIN (or any prefix / model search term) —
 *      autocomplete pulls live matches from `vin_data` so the manager
 *      can pick the right lot in one click.
 *   4. Submits → card lands in the `pending` queue for team-lead
 *      approval. Approved cards appear immediately on the public
 *      homepage block for the current week.
 *
 * Backend: /api/manager/wishlist-deals  (require_manager_or_admin)
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus,
  MagnifyingGlass,
  Trash,
  CheckCircle,
  XCircle,
  Clock,
  Car,
  CaretRight,
  Sparkle,
} from '@phosphor-icons/react';
import { useLang } from '../../i18n';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

/* ------------------------------------------------------------------ */
/*  Static config                                                      */
/* ------------------------------------------------------------------ */
const CATEGORIES = [
  { id: 'motorbike', label: 'Motorbike', icon: '/figma/calc/veh-motorbike.png' },
  { id: 'sedan',     label: 'Sedan',     icon: '/figma/calc/veh-sedan.png' },
  { id: 'suv',       label: 'SUV',       icon: '/figma/calc/veh-suv.png' },
  { id: 'pickup',    label: 'Pick-up',   icon: '/figma/calc/veh-pickup.png' },
  { id: 'van',       label: 'Van',       icon: '/figma/calc/veh-van.png' },
];

const BUDGETS = [
  { id: '10-15K', label: '10–15K' },
  { id: '15-25K', label: '15–25K' },
  { id: '30-50K', label: '30–50K' },
];

const WEEKS = [
  { id: 'current', label: 'This week' },
  { id: 'next',    label: 'Next week' },
];

const STATUS_PILL = {
  pending:  { color: '#D97706', bg: '#FEF3C7', label: 'Pending',  Icon: Clock },
  approved: { color: '#059669', bg: '#D1FAE5', label: 'Approved', Icon: CheckCircle },
  rejected: { color: '#DC2626', bg: '#FEE2E2', label: 'Rejected', Icon: XCircle },
};

/* ------------------------------------------------------------------ */
/*  VIN autocomplete                                                   */
/* ------------------------------------------------------------------ */
function VinAutocomplete({ value, onChange, onSelect }) {
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const q = (value || '').trim();
    if (q.length < 3) {
      setResults([]);
      return;
    }
    const handle = setTimeout(async () => {
      setLoading(true);
      try {
        const { data } = await axios.get(
          `${API_URL}/api/manager/wishlist-deals/vin-search`,
          { params: { q, limit: 8 } },
        );
        setResults(Array.isArray(data) ? data : []);
        setOpen(true);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 220);
    return () => clearTimeout(handle);
  }, [value]);

  return (
    <div className="relative">
      <div className="relative">
        <MagnifyingGlass
          size={18}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-[#71717A]"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          onFocus={() => results.length && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 180)}
          placeholder="Enter VIN, lot # or year/make/model"
          data-testid="wishlist-vin-input"
          className="w-full pl-10 pr-4 py-2.5 border border-[#E4E4E7] rounded-xl text-sm focus:outline-none focus:border-[#18181B]"
        />
      </div>
      {open && results.length > 0 && (
        <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-[#E4E4E7] rounded-xl shadow-lg max-h-80 overflow-auto">
          {results.map((r) => (
            <button
              key={r.vin}
              type="button"
              onClick={() => {
                onSelect(r);
                setOpen(false);
              }}
              data-testid={`wishlist-vin-suggest-${r.vin}`}
              className="w-full text-left px-3 py-2.5 hover:bg-[#FAFAFA] flex items-center gap-3 border-b border-[#F4F4F5] last:border-b-0"
            >
              {r.image ? (
                <img src={r.image} alt={r.vin} className="w-14 h-10 object-cover rounded bg-[#F4F4F5]" />
              ) : (
                <div className="w-14 h-10 rounded bg-[#F4F4F5] flex items-center justify-center">
                  <Car size={16} className="text-[#A1A1AA]" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-[#18181B] truncate">
                  {[r.year, r.make, r.model].filter(Boolean).join(' ') || r.title || r.vin}
                </div>
                <div className="text-xs text-[#71717A] truncate">
                  VIN: {r.vin}{r.lot_number ? ` · Lot ${r.lot_number}` : ''}
                </div>
              </div>
              <CaretRight size={14} className="text-[#A1A1AA] flex-shrink-0" />
            </button>
          ))}
        </div>
      )}
      {loading && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#71717A]">…</div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */
const ManagerWishlistPage = () => {
  const { t } = useLang();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState('all'); // all|mine|pending|approved|rejected

  // Form
  const [category, setCategory] = useState('sedan');
  const [budget, setBudget] = useState('10-15K');
  const [week, setWeek] = useState('current');
  const [vin, setVin] = useState('');
  const [note, setNote] = useState('');
  const [selectedSnapshot, setSelectedSnapshot] = useState(null);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filter === 'mine') params.mine_only = true;
      if (['pending', 'approved', 'rejected'].includes(filter)) params.status = filter;
      const { data } = await axios.get(`${API_URL}/api/manager/wishlist-deals`, { params });
      setItems(Array.isArray(data?.data) ? data.data : []);
    } catch {
      toast.error(t('loadingError') || 'Failed to load wishlist');
    } finally {
      setLoading(false);
    }
  }, [filter, t]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const handleCreate = async (e) => {
    e?.preventDefault?.();
    if (!vin.trim()) {
      toast.error('VIN is required');
      return;
    }
    setCreating(true);
    try {
      await axios.post(`${API_URL}/api/manager/wishlist-deals`, {
        vin: vin.trim().toUpperCase(),
        category,
        budget,
        week,
        note: note.trim() || undefined,
      });
      toast.success('Wishlist card created — pending team-lead approval');
      setVin('');
      setNote('');
      setSelectedSnapshot(null);
      fetchItems();
    } catch (err) {
      const msg = err?.response?.data?.detail || 'Failed to create';
      toast.error(msg);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this wishlist card?')) return;
    try {
      await axios.delete(`${API_URL}/api/manager/wishlist-deals/${id}`);
      toast.success('Deleted');
      setItems((prev) => prev.filter((x) => x.id !== id));
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Delete failed');
    }
  };

  const grouped = useMemo(() => {
    const out = { pending: [], approved: [], rejected: [] };
    items.forEach((it) => {
      const k = it.status || 'pending';
      if (out[k]) out[k].push(it);
    });
    return out;
  }, [items]);

  return (
    <motion.div
      data-testid="manager-wishlist-page"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-5"
    >
      {/* Header */}
      <div>
        <h1
          className="text-2xl font-bold text-[#18181B]"
          style={{ fontFamily: 'Mazzard, Mazzard H, Mazzard M, system-ui, sans-serif' }}
        >
          Top Deals of the Week — Builder
        </h1>
        <p className="text-sm text-[#71717A] mt-1">
          Curate the homepage wishlist. Submit cards by VIN → team-lead approves → public block updates.
        </p>
      </div>

      {/* Builder form */}
      <form
        onSubmit={handleCreate}
        className="bg-white rounded-2xl border border-[#E4E4E7] p-5 sm:p-6 space-y-5"
        data-testid="wishlist-builder-form"
      >
        <div className="flex items-center gap-2">
          <Sparkle size={18} className="text-amber-500" weight="fill" />
          <h2 className="text-lg font-semibold text-[#18181B]">New curated pick</h2>
        </div>

        {/* Category */}
        <div>
          <label className="text-xs font-semibold uppercase tracking-wider text-[#71717A] mb-2 block">
            Category
          </label>
          <div className="flex flex-wrap gap-2" role="radiogroup">
            {CATEGORIES.map((c) => (
              <button
                key={c.id}
                type="button"
                role="radio"
                aria-checked={category === c.id}
                onClick={() => setCategory(c.id)}
                data-testid={`wishlist-cat-${c.id}`}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl border text-sm font-medium transition ${
                  category === c.id
                    ? 'bg-amber-400 text-[#18181B] border-amber-400'
                    : 'bg-white text-[#18181B] border-[#E4E4E7] hover:border-[#A1A1AA]'
                }`}
              >
                <span
                  aria-hidden
                  style={{
                    width: 18,
                    height: 18,
                    backgroundColor: 'currentColor',
                    WebkitMaskImage: `url(${c.icon})`,
                    maskImage: `url(${c.icon})`,
                    WebkitMaskRepeat: 'no-repeat',
                    maskRepeat: 'no-repeat',
                    WebkitMaskPosition: 'center',
                    maskPosition: 'center',
                    WebkitMaskSize: 'contain',
                    maskSize: 'contain',
                    display: 'inline-block',
                  }}
                />
                {c.label}
              </button>
            ))}
          </div>
        </div>

        {/* Budget + Week */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-[#71717A] mb-2 block">
              Budget
            </label>
            <div className="flex gap-2" role="radiogroup">
              {BUDGETS.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  role="radio"
                  aria-checked={budget === b.id}
                  onClick={() => setBudget(b.id)}
                  data-testid={`wishlist-bud-${b.id}`}
                  className={`flex-1 px-4 py-2 rounded-xl border text-sm font-semibold transition ${
                    budget === b.id
                      ? 'bg-amber-400 text-[#18181B] border-amber-400'
                      : 'bg-white text-[#18181B] border-[#E4E4E7] hover:border-[#A1A1AA]'
                  }`}
                >
                  {b.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-[#71717A] mb-2 block">
              Week
            </label>
            <div className="flex gap-2" role="radiogroup">
              {WEEKS.map((w) => (
                <button
                  key={w.id}
                  type="button"
                  role="radio"
                  aria-checked={week === w.id}
                  onClick={() => setWeek(w.id)}
                  className={`flex-1 px-4 py-2 rounded-xl border text-sm font-semibold transition ${
                    week === w.id
                      ? 'bg-[#18181B] text-white border-[#18181B]'
                      : 'bg-white text-[#18181B] border-[#E4E4E7] hover:border-[#A1A1AA]'
                  }`}
                >
                  {w.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* VIN search */}
        <div>
          <label className="text-xs font-semibold uppercase tracking-wider text-[#71717A] mb-2 block">
            Vehicle (VIN)
          </label>
          <VinAutocomplete
            value={vin}
            onChange={(v) => {
              setVin(v);
              setSelectedSnapshot(null);
            }}
            onSelect={(r) => {
              setVin(r.vin || '');
              setSelectedSnapshot(r);
            }}
          />
          {selectedSnapshot && (
            <div className="mt-3 flex items-center gap-3 p-3 bg-[#FAFAFA] border border-[#E4E4E7] rounded-xl">
              {selectedSnapshot.image && (
                <img
                  src={selectedSnapshot.image}
                  alt={selectedSnapshot.vin}
                  className="w-20 h-14 rounded-lg object-cover bg-[#F4F4F5]"
                />
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-[#18181B] truncate">
                  {[selectedSnapshot.year, selectedSnapshot.make, selectedSnapshot.model]
                    .filter(Boolean).join(' ') || selectedSnapshot.title}
                </div>
                <div className="text-xs text-[#71717A] truncate">
                  VIN: {selectedSnapshot.vin}
                  {selectedSnapshot.lot_number ? ` · Lot ${selectedSnapshot.lot_number}` : ''}
                  {selectedSnapshot.auction_name ? ` · ${selectedSnapshot.auction_name}` : ''}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Note */}
        <div>
          <label className="text-xs font-semibold uppercase tracking-wider text-[#71717A] mb-2 block">
            Note (optional)
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Why is this a great deal?"
            rows={2}
            className="w-full px-3 py-2 border border-[#E4E4E7] rounded-xl text-sm focus:outline-none focus:border-[#18181B] resize-none"
          />
        </div>

        <div className="flex items-center justify-end gap-3">
          <span className="text-xs text-[#71717A]">
            Submission goes to team-lead for approval.
          </span>
          <button
            type="submit"
            disabled={creating || !vin.trim()}
            data-testid="wishlist-submit"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-400 text-[#18181B] font-semibold hover:bg-amber-300 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            <Plus size={16} weight="bold" />
            {creating ? 'Submitting…' : 'Submit for approval'}
          </button>
        </div>
      </form>

      {/* Filter chips */}
      <div className="flex flex-wrap gap-2">
        {[
          { id: 'all', label: `All (${items.length})` },
          { id: 'mine', label: 'Mine' },
          { id: 'pending', label: `Pending (${grouped.pending.length})` },
          { id: 'approved', label: `Approved (${grouped.approved.length})` },
          { id: 'rejected', label: `Rejected (${grouped.rejected.length})` },
        ].map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            data-testid={`wishlist-filter-${f.id}`}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${
              filter === f.id
                ? 'bg-[#18181B] text-white border-[#18181B]'
                : 'bg-white text-[#18181B] border-[#E4E4E7] hover:border-[#A1A1AA]'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="bg-white rounded-2xl border border-[#E4E4E7] overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-sm text-[#71717A]">Loading…</div>
        ) : items.length === 0 ? (
          <div className="p-10 text-center text-sm text-[#71717A]">
            No wishlist cards yet — create your first pick above.
          </div>
        ) : (
          <div className="divide-y divide-[#E4E4E7]" data-testid="wishlist-items-list">
            <AnimatePresence>
              {items.map((it) => {
                const pill = STATUS_PILL[it.status] || STATUS_PILL.pending;
                const Icon = pill.Icon;
                const s = it.snapshot || {};
                return (
                  <motion.div
                    key={it.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    className="p-4 flex items-center gap-4 hover:bg-[#FAFAFA]"
                    data-testid={`wishlist-item-${it.id}`}
                  >
                    {s.image ? (
                      <img src={s.image} alt={it.vin} className="w-20 h-14 rounded-lg object-cover bg-[#F4F4F5]" />
                    ) : (
                      <div className="w-20 h-14 rounded-lg bg-[#F4F4F5] flex items-center justify-center">
                        <Car size={20} className="text-[#A1A1AA]" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-[#18181B] truncate">
                          {[s.year, s.make, s.model].filter(Boolean).join(' ') || s.title || it.vin}
                        </span>
                        <span
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider"
                          style={{ color: pill.color, background: pill.bg }}
                        >
                          <Icon size={10} weight="fill" /> {pill.label}
                        </span>
                      </div>
                      <div className="text-xs text-[#71717A] truncate">
                        VIN {it.vin} · {it.category} · {it.budget} · Week {it.week_start}
                        {it.note ? ` · "${it.note}"` : ''}
                      </div>
                      <div className="text-[10px] text-[#A1A1AA] mt-0.5">
                        Created by {it.created_by_name || it.created_by}
                        {it.approved_by_name ? ` · ${it.status === 'rejected' ? 'rejected' : 'approved'} by ${it.approved_by_name}` : ''}
                        {it.reject_reason ? ` · ${it.reject_reason}` : ''}
                      </div>
                    </div>
                    <button
                      onClick={() => handleDelete(it.id)}
                      title="Delete"
                      data-testid={`wishlist-delete-${it.id}`}
                      className="p-2 text-[#A1A1AA] hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                    >
                      <Trash size={16} />
                    </button>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default ManagerWishlistPage;
