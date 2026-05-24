/**
 * Manager Engagement Page  -  /manager/engagement
 * --------------------------------------------------
 * Read-only customer-activity dashboard for managers.
 *
 * Surfaces the SAME engagement signal the admin team uses:
 *   • Top vehicles by favorites + compare + shares
 *   • Top customers by activity score   (manager's "who to call" queue)
 *   • Per-VIN exact stats               (gauge demand before quoting)
 *   • Per-customer activity drill-down  (full trail of favorites/
 *     comparisons/shares so manager can see exactly where the
 *     customer's journey breaks off)
 *
 * Data source: /api/manager/engagement/*  (read-only mirror of the
 * /api/admin/engagement surface, gated by `require_manager_or_admin`).
 */
import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Heart,
  Scales,
  ShareNetwork,
  Users,
  Fire,
  MagnifyingGlass,
  ChartLine,
  Eye,
  CaretRight,
  EnvelopeSimple,
  Phone,
  Car,
  X,
  ArrowsClockwise,
} from '@phosphor-icons/react';

import { useLang } from '../../i18n';
import { useAuth } from '../../App';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */
const LEVEL_BADGE = {
  hot: 'bg-rose-100 text-rose-700 border-rose-200',
  warm: 'bg-amber-100 text-amber-700 border-amber-200',
  cold: 'bg-slate-100 text-slate-600 border-slate-200',
};

const fmtDate = (d) => {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleString(undefined, {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return String(d);
  }
};

const carLine = (it) => {
  const bits = [it.year, it.make, it.model].filter(Boolean).join(' ');
  return bits || it.title || it.vin || '—';
};

/* ------------------------------------------------------------------ */
/*  Stat card                                                          */
/* ------------------------------------------------------------------ */
const StatCard = ({ icon: Icon, label, value, color = '#18181B', alert = false }) => (
  <div
    className={`bg-white rounded-2xl border ${
      alert ? 'border-rose-200 ring-1 ring-rose-100' : 'border-[#E4E4E7]'
    } p-4 sm:p-5`}
  >
    <div className="flex items-center justify-between mb-2">
      <span className="text-xs font-medium uppercase tracking-wider text-[#71717A]">{label}</span>
      <Icon size={20} weight="duotone" style={{ color }} />
    </div>
    <div className="text-2xl sm:text-3xl font-bold" style={{ color }}>
      {value ?? '—'}
    </div>
  </div>
);

/* ------------------------------------------------------------------ */
/*  Customer drill-down modal                                          */
/* ------------------------------------------------------------------ */
const CustomerActivityModal = ({ customerId, onClose }) => {
  const { t } = useLang();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    axios
      .get(`${API_URL}/api/manager/engagement/customer/${encodeURIComponent(customerId)}?limit=50`)
      .then((r) => {
        if (!cancelled) setData(r.data || null);
      })
      .catch(() => {
        if (!cancelled) toast.error(t('loadingError') || 'Failed to load');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [customerId, t]);

  const Section = ({ icon: Icon, color, label, items, kind }) => (
    <div className="border border-[#E4E4E7] rounded-xl overflow-hidden">
      <div className="px-4 py-3 bg-[#FAFAFA] border-b border-[#E4E4E7] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon size={18} style={{ color }} weight="fill" />
          <span className="font-semibold text-[#18181B] text-sm uppercase tracking-wider">
            {label}
          </span>
        </div>
        <span className="text-xs font-bold text-[#71717A]">{items?.length || 0}</span>
      </div>
      <div className="divide-y divide-[#E4E4E7] max-h-72 overflow-auto">
        {(items || []).length === 0 ? (
          <div className="p-4 text-center text-xs text-[#A1A1AA]">No {kind} yet</div>
        ) : (
          items.map((it, i) => (
            <div key={`${it.vin}-${i}`} className="px-4 py-3 flex items-center gap-3">
              {it.image ? (
                <img
                  src={it.image}
                  alt={it.vin}
                  className="w-14 h-10 rounded object-cover bg-[#F4F4F5] flex-shrink-0"
                />
              ) : (
                <div className="w-14 h-10 rounded bg-[#F4F4F5] flex items-center justify-center flex-shrink-0">
                  <Car size={16} className="text-[#A1A1AA]" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-[#18181B] truncate">{carLine(it)}</div>
                <div className="text-xs text-[#71717A] truncate">VIN: {it.vin}</div>
              </div>
              <div className="text-right">
                <div className="text-xs text-[#71717A]">{fmtDate(it.createdAt)}</div>
                {it.channel && (
                  <div className="text-[10px] uppercase tracking-wider text-[#A1A1AA]">
                    {it.channel}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-3 sm:p-6"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.98 }}
        className="bg-white rounded-2xl w-full max-w-4xl max-h-[92vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-[#E4E4E7] flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-wider text-[#71717A] mb-0.5">
              Customer activity
            </div>
            <h3 className="font-semibold text-[#18181B] text-lg" data-testid="me-customer-modal-title">
              {loading ? customerId : data?.profile?.name || customerId}
            </h3>
            {data?.profile?.email && (
              <div className="text-xs text-[#71717A] mt-0.5 flex items-center gap-3">
                <span className="inline-flex items-center gap-1">
                  <EnvelopeSimple size={12} /> {data.profile.email}
                </span>
                {data.profile.phone && (
                  <span className="inline-flex items-center gap-1">
                    <Phone size={12} /> {data.profile.phone}
                  </span>
                )}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-[#F4F4F5]"
            data-testid="me-customer-modal-close"
          >
            <X size={20} />
          </button>
        </div>

        <div className="px-5 py-4 grid grid-cols-3 gap-3 border-b border-[#E4E4E7] bg-[#FAFAFA]">
          <div className="text-center">
            <div className="text-2xl font-bold text-rose-600">
              {data?.counts?.favorites ?? 0}
            </div>
            <div className="text-xs text-[#71717A] uppercase tracking-wider mt-0.5">Favorites</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-indigo-600">
              {data?.counts?.compares ?? 0}
            </div>
            <div className="text-xs text-[#71717A] uppercase tracking-wider mt-0.5">Compares</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-emerald-600">
              {data?.counts?.shares ?? 0}
            </div>
            <div className="text-xs text-[#71717A] uppercase tracking-wider mt-0.5">Shares</div>
          </div>
        </div>

        <div className="p-5 overflow-auto space-y-4">
          {loading ? (
            <div className="text-center text-sm text-[#71717A] py-10">Loading…</div>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <span
                  className={`px-2.5 py-1 text-xs font-bold uppercase tracking-wider rounded-full border ${
                    LEVEL_BADGE[data?.level || 'cold']
                  }`}
                >
                  {data?.level || 'cold'} · score {data?.score || 0}
                </span>
              </div>

              <Section
                icon={Heart}
                color="#E11D48"
                label="Favorites"
                kind="favorites"
                items={data?.favorites}
              />
              <Section
                icon={Scales}
                color="#4F46E5"
                label="Comparisons"
                kind="comparisons"
                items={data?.compares}
              />
              <Section
                icon={ShareNetwork}
                color="#059669"
                label="Shares"
                kind="shares"
                items={data?.shares}
              />
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
};

/* ------------------------------------------------------------------ */
/*  Main page                                                          */
/* ------------------------------------------------------------------ */
const ManagerEngagementPage = () => {
  const { t } = useLang();
  // user is read from auth context but currently not used directly — kept for future
  // role-conditional behavior (manager vs admin). Suppress unused-var via destructure.
  useAuth();
  const [loading, setLoading] = useState(true);
  const [analytics, setAnalytics] = useState(null);
  const [topUsers, setTopUsers] = useState([]);
  const [topVehicles, setTopVehicles] = useState([]);
  const [activeTab, setActiveTab] = useState('users');

  // VIN lookup
  const [vinInput, setVinInput] = useState('');
  const [vinStats, setVinStats] = useState(null);

  // Customer drill-down
  const [focusCustomer, setFocusCustomer] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [aRes, uRes, vRes] = await Promise.all([
        axios.get(`${API_URL}/api/manager/engagement/analytics`),
        axios.get(`${API_URL}/api/manager/engagement/top-users?limit=50`),
        axios.get(`${API_URL}/api/manager/engagement/top-vehicles?limit=50`),
      ]);
      setAnalytics(aRes.data || null);
      setTopUsers(Array.isArray(uRes.data) ? uRes.data : []);
      setTopVehicles(Array.isArray(vRes.data) ? vRes.data : []);
    } catch (err) {
      toast.error(t('loadingError') || 'Failed to load engagement data');
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleVinLookup = async () => {
    const v = (vinInput || '').trim();
    if (!v) return;
    try {
      const r = await axios.get(
        `${API_URL}/api/manager/engagement/vin-stats?vin=${encodeURIComponent(v)}`,
      );
      setVinStats(r.data || null);
    } catch {
      toast.error('VIN lookup failed');
      setVinStats(null);
    }
  };

  if (loading) {
    return (
      <div className="p-6 animate-pulse" data-testid="manager-engagement-loading">
        <div className="h-8 bg-gray-200 rounded w-1/3 mb-6"></div>
        <div className="grid grid-cols-4 gap-4 mb-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 bg-gray-100 rounded-2xl"></div>
          ))}
        </div>
        <div className="h-96 bg-gray-100 rounded-2xl"></div>
      </div>
    );
  }

  return (
    <motion.div
      data-testid="manager-engagement-page"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-5"
    >
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1
            className="text-2xl font-bold text-[#18181B]"
            style={{ fontFamily: 'Mazzard, Mazzard H, Mazzard M, system-ui, sans-serif' }}
          >
            Customer Engagement
          </h1>
          <p className="text-sm text-[#71717A] mt-1">
            See who favorited, compared or shared which car — pick up the phone before they cool off.
          </p>
        </div>
        <button
          onClick={fetchData}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#18181B] text-white text-sm font-medium hover:bg-[#27272A] transition"
          data-testid="manager-engagement-refresh"
        >
          <ArrowsClockwise size={16} /> Refresh
        </button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <StatCard
          icon={Users}
          label="Total customers"
          value={analytics?.totalUsers ?? 0}
          color="#18181B"
        />
        <StatCard
          icon={Eye}
          label="Active customers"
          value={analytics?.activeUsers ?? 0}
          color="#4F46E5"
        />
        <StatCard
          icon={Fire}
          label="Hot"
          value={analytics?.hotUsers ?? 0}
          color="#DC2626"
          alert={(analytics?.hotUsers || 0) > 0}
        />
        <StatCard
          icon={ChartLine}
          label="Engagement"
          value={`${analytics?.engagementRate ?? 0}%`}
          color="#059669"
        />
      </div>

      {/* VIN lookup widget */}
      <div className="bg-white rounded-2xl border border-[#E4E4E7] p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-3">
          <MagnifyingGlass size={18} className="text-[#18181B]" />
          <h3 className="font-semibold text-[#18181B]">VIN demand check</h3>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={vinInput}
            onChange={(e) => setVinInput(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === 'Enter' && handleVinLookup()}
            placeholder="Enter VIN to see exact engagement counts"
            className="flex-1 px-3 py-2 border border-[#E4E4E7] rounded-xl text-sm focus:outline-none focus:border-[#18181B]"
            data-testid="me-vin-input"
          />
          <button
            onClick={handleVinLookup}
            className="px-4 py-2 bg-amber-400 text-[#18181B] font-semibold rounded-xl hover:bg-amber-300 transition"
            data-testid="me-vin-lookup"
          >
            Look up
          </button>
        </div>
        {vinStats && (
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-rose-50 border border-rose-200 rounded-xl p-3">
              <div className="text-xs uppercase tracking-wider text-rose-700">Favorites</div>
              <div className="text-2xl font-bold text-rose-700 mt-1">
                {vinStats.favoritesCount}
              </div>
            </div>
            <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3">
              <div className="text-xs uppercase tracking-wider text-indigo-700">Compares</div>
              <div className="text-2xl font-bold text-indigo-700 mt-1">
                {vinStats.comparesCount}
              </div>
            </div>
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
              <div className="text-xs uppercase tracking-wider text-emerald-700">Shares</div>
              <div className="text-2xl font-bold text-emerald-700 mt-1">{vinStats.sharesCount}</div>
            </div>
            <div className="bg-[#FAFAFA] border border-[#E4E4E7] rounded-xl p-3">
              <div className="text-xs uppercase tracking-wider text-[#71717A]">Total views</div>
              <div className="text-2xl font-bold text-[#18181B] mt-1">{vinStats.viewsCount}</div>
              {vinStats.title && (
                <div className="text-xs text-[#71717A] mt-1 truncate">{vinStats.title}</div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-2xl border border-[#E4E4E7] overflow-hidden">
        <div className="flex border-b border-[#E4E4E7]">
          <button
            onClick={() => setActiveTab('users')}
            className={`px-5 py-3 text-sm font-medium transition-colors ${
              activeTab === 'users'
                ? 'text-[#18181B] border-b-2 border-amber-400'
                : 'text-[#71717A] hover:text-[#18181B]'
            }`}
            data-testid="me-tab-users"
          >
            <Users size={16} className="inline mr-2 -mt-0.5" /> Top customers ({topUsers.length})
          </button>
          <button
            onClick={() => setActiveTab('vehicles')}
            className={`px-5 py-3 text-sm font-medium transition-colors ${
              activeTab === 'vehicles'
                ? 'text-[#18181B] border-b-2 border-amber-400'
                : 'text-[#71717A] hover:text-[#18181B]'
            }`}
            data-testid="me-tab-vehicles"
          >
            <Car size={16} className="inline mr-2 -mt-0.5" /> Top vehicles ({topVehicles.length})
          </button>
        </div>

        {/* USERS */}
        {activeTab === 'users' && (
          <div className="divide-y divide-[#E4E4E7]" data-testid="me-users-list">
            {topUsers.length === 0 ? (
              <div className="p-10 text-center text-sm text-[#71717A]">
                No customer activity yet — once users add favorites, comparisons or share links,
                they'll appear here.
              </div>
            ) : (
              topUsers.map((u) => (
                <button
                  key={u.id}
                  onClick={() => setFocusCustomer(u.id)}
                  className="w-full text-left px-5 py-4 hover:bg-[#FAFAFA] transition-colors flex items-center gap-4"
                  data-testid={`me-user-${u.id}`}
                >
                  <span
                    className={`px-2.5 py-1 text-xs font-bold uppercase tracking-wider rounded-full border ${
                      LEVEL_BADGE[u.level]
                    }`}
                  >
                    {u.level}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-[#18181B] truncate">{u.name}</div>
                    <div className="text-xs text-[#71717A] truncate">
                      {u.email || '—'}{u.phone ? ` · ${u.phone}` : ''}
                    </div>
                  </div>
                  <div className="hidden sm:flex items-center gap-4 text-xs">
                    <span className="text-rose-600">
                      <Heart size={12} weight="fill" className="inline -mt-0.5 mr-0.5" />
                      {u.favoritesCount}
                    </span>
                    <span className="text-indigo-600">
                      <Scales size={12} weight="fill" className="inline -mt-0.5 mr-0.5" />
                      {u.comparesCount}
                    </span>
                    <span className="text-emerald-600">
                      <ShareNetwork size={12} weight="fill" className="inline -mt-0.5 mr-0.5" />
                      {u.sharesCount}
                    </span>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-[#18181B]">{u.score}</div>
                    <div className="text-[10px] uppercase tracking-wider text-[#A1A1AA]">score</div>
                  </div>
                  <CaretRight size={16} className="text-[#A1A1AA]" />
                </button>
              ))
            )}
          </div>
        )}

        {/* VEHICLES */}
        {activeTab === 'vehicles' && (
          <div className="divide-y divide-[#E4E4E7]" data-testid="me-vehicles-list">
            {topVehicles.length === 0 ? (
              <div className="p-10 text-center text-sm text-[#71717A]">
                No vehicle engagement yet.
              </div>
            ) : (
              topVehicles.map((v) => (
                <div
                  key={v.vin}
                  className="px-5 py-4 hover:bg-[#FAFAFA] transition-colors flex items-center gap-4"
                >
                  {v.image ? (
                    <img
                      src={v.image}
                      alt={v.vin}
                      className="w-20 h-14 rounded-lg object-cover bg-[#F4F4F5] flex-shrink-0"
                    />
                  ) : (
                    <div className="w-20 h-14 rounded-lg bg-[#F4F4F5] flex items-center justify-center flex-shrink-0">
                      <Car size={20} className="text-[#A1A1AA]" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-[#18181B] truncate">{carLine(v)}</div>
                    <div className="text-xs text-[#71717A] truncate">VIN: {v.vin}</div>
                  </div>
                  <div className="hidden sm:flex items-center gap-4 text-xs">
                    <span className="text-rose-600">
                      <Heart size={12} weight="fill" className="inline -mt-0.5 mr-0.5" />
                      {v.favoritesCount}
                    </span>
                    <span className="text-indigo-600">
                      <Scales size={12} weight="fill" className="inline -mt-0.5 mr-0.5" />
                      {v.comparesCount}
                    </span>
                    <span className="text-emerald-600">
                      <ShareNetwork size={12} weight="fill" className="inline -mt-0.5 mr-0.5" />
                      {v.sharesCount}
                    </span>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-[#18181B]">{v.viewsCount}</div>
                    <div className="text-[10px] uppercase tracking-wider text-[#A1A1AA]">total</div>
                  </div>
                  {v.vin && (
                    <Link
                      to={`/cars/${encodeURIComponent(v.vin)}`}
                      className="text-xs text-[#18181B] underline hover:no-underline"
                      data-testid={`me-vehicle-open-${v.vin}`}
                    >
                      Open
                    </Link>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Customer drill-down */}
      <AnimatePresence>
        {focusCustomer && (
          <CustomerActivityModal
            customerId={focusCustomer}
            onClose={() => setFocusCustomer(null)}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default ManagerEngagementPage;
