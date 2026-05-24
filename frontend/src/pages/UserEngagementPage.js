/**
 * User Engagement Control Center
 * 
 * Адмін-панель для:
 * - Перегляду топ авто по інтересу (favorites/compare)
 * - Перегляду топ користувачів
 * - Запуску масових кампаній по VIN
 * - Аналітики кампаній
 */

import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { API_URL } from '../App';
import { useLang, getLocale } from '../i18n';
import { toast } from 'sonner';
import { 
  Heart, 
  Scales, 
  Fire, 
  Users,
  PaperPlaneTilt,
  MagnifyingGlass,
  ChatCircle,
  EnvelopeSimple,
  Phone,
  ChartLine,
  Lightning,
  CaretDown,
  CaretUp,
  Eye,
  Clock
} from '@phosphor-icons/react';
import { motion, AnimatePresence } from 'framer-motion';

import {
  AdminPageHeader,
} from '../components/ui/AdminPagePrimitives';
import RefreshButton from '../components/ui/RefreshButton';
import SectionTabs from '../components/ui/SectionTabs';

const UserEngagementPage = () => {
  const { t } = useLang();
  const [activeTab, setActiveTab] = useState('vehicles');
  const [loading, setLoading] = useState(true);
  
  // Data
  const [topVehicles, setTopVehicles] = useState([]);
  const [topUsers, setTopUsers] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [campaignHistory, setCampaignHistory] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  
  // Campaign form
  const [selectedVin, setSelectedVin] = useState('');
  const [vinSearch, setVinSearch] = useState('');
  const [vinStats, setVinStats] = useState(null);
  const [audiencePreview, setAudiencePreview] = useState(null);
  const [showCampaignModal, setShowCampaignModal] = useState(false);
  
  // Campaign params
  const [campaignChannel, setCampaignChannel] = useState('sms');
  const [campaignMessage, setCampaignMessage] = useState('');
  const [campaignIntentMin, setCampaignIntentMin] = useState(0);
  const [campaignOnlyHot, setCampaignOnlyHot] = useState(false);
  const [sendingCampaign, setSendingCampaign] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [vehiclesRes, usersRes, templatesRes, historyRes, analyticsRes] = await Promise.all([
        axios.get(`${API_URL}/api/admin/engagement/top-vehicles?limit=50`),
        axios.get(`${API_URL}/api/admin/engagement/top-users?limit=50`),
        axios.get(`${API_URL}/api/admin/engagement/templates`),
        axios.get(`${API_URL}/api/admin/engagement/history?limit=20`),
        axios.get(`${API_URL}/api/admin/engagement/analytics`),
      ]);
      
      setTopVehicles(vehiclesRes.data || []);
      setTopUsers(usersRes.data || []);
      setTemplates(templatesRes.data || []);
      setCampaignHistory(historyRes.data?.items || []);
      setAnalytics(analyticsRes.data);
    } catch (err) {
      console.error('Error fetching data:', err);
      toast.error(t('adm_data_loading_error'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Search VIN stats
  const searchVinStats = async () => {
    if (!vinSearch.trim()) return;
    try {
      const [statsRes, audienceRes] = await Promise.all([
        axios.get(`${API_URL}/api/admin/engagement/vin-stats?vin=${vinSearch.trim()}`),
        axios.get(`${API_URL}/api/admin/engagement/audience?vin=${vinSearch.trim()}&intentMin=${campaignIntentMin}&onlyHot=${campaignOnlyHot}`),
      ]);
      setVinStats(statsRes.data);
      setAudiencePreview(audienceRes.data);
      setSelectedVin(vinSearch.trim().toUpperCase());
    } catch (err) {
      toast.error(t('adm_vin_not_found'));
    }
  };

  // Open campaign modal for VIN
  const openCampaignModal = (vin) => {
    setSelectedVin(vin);
    setVinSearch(vin);
    setShowCampaignModal(true);
    // Load audience
    axios.get(`${API_URL}/api/admin/engagement/audience?vin=${vin}`).then(res => {
      setAudiencePreview(res.data);
    });
  };

  // Send campaign
  const sendCampaign = async () => {
    if (!selectedVin || !campaignMessage.trim()) {
      toast.error(t('adm_fill_in_vin_and_message'));
      return;
    }

    setSendingCampaign(true);
    try {
      const res = await axios.post(`${API_URL}/api/admin/engagement/campaign`, {
        vin: selectedVin,
        channel: campaignChannel,
        message: campaignMessage,
        filterFavorites: true,
        filterCompare: true,
        intentMin: campaignIntentMin,
        onlyHot: campaignOnlyHot,
      });
      
      toast.success(t('r9_campaign_sent_stats', { sentCount: res.data.sentCount, failedCount: res.data.failedCount }));
      setShowCampaignModal(false);
      setCampaignMessage('');
      fetchData();
    } catch (err) {
      toast.error(t('adm_campaign_sending_error'));
    } finally {
      setSendingCampaign(false);
    }
  };

  // Apply template
  const applyTemplate = (template) => {
    setCampaignMessage(template.message);
  };

  const tabs = [
    { id: 'vehicles', label: t('adm_top_cars'), icon: Heart },
    { id: 'users', label: t('adm_users'), icon: Users },
    { id: 'history', label: t('adm_history'), icon: Clock },
  ];

  if (loading) {
    return (
      <div className="p-6 animate-pulse" data-testid="engagement-loading">
        <div className="h-8 bg-gray-200 rounded w-1/3 mb-6"></div>
        <div className="grid grid-cols-4 gap-4 mb-6">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-20 bg-gray-100 rounded-xl"></div>)}
        </div>
        <div className="h-96 bg-gray-100 rounded-xl"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-5" data-testid="user-engagement-page">
      <AdminPageHeader
        icon={Lightning}
        title={t('adm_user_engagement_control')}
        subtitle={t('adm_mass_mailings_and_analytics_for_favoritescompare')}
        testId="engagement-header"
        actions={(
          <RefreshButton
            onClick={fetchData}
            ariaLabel={t('adm_refresh_3') || 'Refresh'}
            testId="engagement-refresh-btn"
          />
        )}
      />

      {/* Stats Cards */}
      {analytics && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          <StatCard 
            icon={PaperPlaneTilt}
            label={t('adm_campaigns')}
            value={analytics.totalCampaigns}
            color="purple"
          />
          <StatCard 
            icon={EnvelopeSimple}
            label={t('adm_sent_2')}
            value={analytics.totalSent}
            color="blue"
          />
          <StatCard 
            icon={Heart}
            label={t('adm_top_cars')}
            value={topVehicles.length}
            color="red"
          />
          <StatCard 
            icon={Fire}
            label={t('adm_hot_users')}
            value={topUsers.filter(u => u.level === 'hot').length}
            color="orange"
          />
        </div>
      )}

      {/* VIN Search & Quick Campaign */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 md:p-5">
        <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <MagnifyingGlass className="w-5 h-5 flex-shrink-0" />
          <span>{t('adm_quick_vin_campaign')}</span>
        </h3>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={vinSearch}
            onChange={(e) => setVinSearch(e.target.value.toUpperCase())}
            placeholder={t('adm_enter_vin')}
            className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#18181B]/20 focus:border-transparent text-sm"
            data-testid="vin-search-input"
          />
          <div className="flex gap-2">
            <button
              onClick={searchVinStats}
              className="flex-1 sm:flex-none px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm whitespace-nowrap"
            >
              {t('adm_search')}
            </button>
            <button
              onClick={() => vinSearch && openCampaignModal(vinSearch)}
              className="flex-1 sm:flex-none px-4 py-2.5 bg-[#18181B] text-white rounded-lg hover:bg-[#27272A] transition-colors flex items-center justify-center gap-2 text-sm whitespace-nowrap"
              data-testid="send-campaign-btn"
            >
              <PaperPlaneTilt className="w-4 h-4 flex-shrink-0" />
              <span>{t('adm_send')}</span>
            </button>
          </div>
        </div>

        {/* VIN Stats Preview */}
        {vinStats && (
          <div className="mt-4 p-4 bg-gray-50 rounded-lg">
            <div className="grid grid-cols-4 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-red-600">{vinStats.favoritesCount}</div>
                <div className="text-xs text-gray-500">{t('adm_favorites_2')}</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-blue-600">{vinStats.comparesCount}</div>
                <div className="text-xs text-gray-500">{t('adm_compare')}</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-orange-600">{vinStats.hotUsersCount}</div>
                <div className="text-xs text-gray-500">{t('adm_hot')}</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-[#18181B]">{vinStats.totalInterested}</div>
                <div className="text-xs text-gray-500">{t('adm_total_5')}</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Tabs — unified black-outline */}
      <SectionTabs
        tabs={tabs.map(t2 => ({ id: t2.id, label: t2.label, icon: t2.icon }))}
        activeId={activeTab}
        onChange={setActiveTab}
        testIdPrefix="engagement-tab"
        ariaLabel="Engagement sections"
        className="-mx-1 sm:mx-0"
      />

      {/* Tab Content */}
      <AnimatePresence mode="wait">
        {activeTab === 'vehicles' && (
          <motion.div
            key="vehicles"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <TopVehiclesTable 
              vehicles={topVehicles} 
              onCampaign={openCampaignModal}
            />
          </motion.div>
        )}

        {activeTab === 'users' && (
          <motion.div
            key="users"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <TopUsersTable users={topUsers} />
          </motion.div>
        )}

        {activeTab === 'history' && (
          <motion.div
            key="history"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <CampaignHistoryTable campaigns={campaignHistory} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Campaign Modal */}
      {showCampaignModal && (
        <CampaignModal
          vin={selectedVin}
          audience={audiencePreview}
          templates={templates}
          channel={campaignChannel}
          setChannel={setCampaignChannel}
          message={campaignMessage}
          setMessage={setCampaignMessage}
          intentMin={campaignIntentMin}
          setIntentMin={setCampaignIntentMin}
          onlyHot={campaignOnlyHot}
          setOnlyHot={setCampaignOnlyHot}
          onApplyTemplate={applyTemplate}
          onSend={sendCampaign}
          onClose={() => setShowCampaignModal(false)}
          sending={sendingCampaign}
        />
      )}
    </div>
  );
};

// Stat Card Component
const UserEngagementPage_StatCardLEGACY = null; // placeholder for diff anchor
const StatCard = ({ icon: Icon, label, value, tint, color }) => {
  // Back-compat: callers may still pass `color="purple"` — that prop is now
  // ignored visually. ALL icons render in the muted admin gray so the four
  // KPI cards look uniform (no red heart / orange flame breaking the palette).
  const resolvedTint = tint || color || 'muted';
  // Single source of truth — every legacy palette key resolves to the same
  // neutral gray. If we ever want a real status tint, route it through
  // `tint="rose|amber|blue"` deliberately rather than via leftover `color=…`.
  const TINT = {
    rose:  'text-rose-500',
    amber: 'text-amber-500',
    blue:  'text-blue-500',
    muted: 'text-[#A1A1AA]',
  };
  const safeTint = TINT[resolvedTint] || TINT.muted;
  // Value can be undefined while analytics is still loading or the backend
  // returns nothing — render an explicit `0` so all KPI cards have the same
  // visual rhythm (label + icon row, big numeric row underneath).
  const displayValue =
    value === undefined || value === null || value === '' ? '0' : value;
  return (
    <div className="bg-white border border-[#E4E4E7] rounded-2xl p-3 sm:p-4 min-w-0 overflow-hidden hover:border-[#D4D4D8] transition-colors">
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="text-[10.5px] sm:text-[11px] font-semibold uppercase tracking-[0.10em] text-[#71717A] truncate">
          {label}
        </span>
        {Icon && <Icon size={14} weight="bold" className={`${safeTint} flex-shrink-0`} />}
      </div>
      <div className="text-[22px] sm:text-[26px] font-semibold tabular-nums leading-tight text-[#18181B] truncate" title={String(displayValue)}>
        {displayValue}
      </div>
    </div>
  );
};

// Original `color` prop is preserved (red/blue/purple/orange/green) — it gets
// mapped to a monochrome muted tone above, so no caller needs to change.
// Kept around just to absorb old usages; not exported.
const _StatCardLegacyShim = StatCard;

// Top Vehicles Table
const TopVehiclesTable = ({ vehicles, onCampaign }) => {
  const { t } = useLang();
  if (!vehicles.length) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-500">
        <Heart className="w-12 h-12 mx-auto text-gray-300 mb-2" />
        <p>{t('adm_no_data_for_favoritescompare')}</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full" data-testid="top-vehicles-table">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">VIN</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">{t('adm_favorites_2')}</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">{t('adm_compare')}</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">{t('adm_hot')}</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">{t('adm_total_5')}</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">{t('adm_actions_2')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {vehicles.map((vehicle, idx) => (
              <tr key={vehicle.vin} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <code className="text-sm font-mono bg-gray-100 px-2 py-1 rounded">
                    {vehicle.vin}
                  </code>
                </td>
                <td className="px-4 py-3 text-center">
                  <span className="inline-flex items-center gap-1 text-red-600 font-semibold">
                    <Heart className="w-4 h-4" weight="fill" />
                    {vehicle.favoritesCount}
                  </span>
                </td>
                <td className="px-4 py-3 text-center">
                  <span className="inline-flex items-center gap-1 text-blue-600 font-semibold">
                    <Scales className="w-4 h-4" weight="fill" />
                    {vehicle.comparesCount}
                  </span>
                </td>
                <td className="px-4 py-3 text-center">
                  <span className="inline-flex items-center gap-1 text-orange-600 font-semibold">
                    <Fire className="w-4 h-4" weight="fill" />
                    {vehicle.hotUsersCount}
                  </span>
                </td>
                <td className="px-4 py-3 text-center font-bold text-[#18181B]">
                  {vehicle.totalInterested}
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => onCampaign(vehicle.vin)}
                    className="px-3 py-1.5 bg-[#F4F4F5] text-[#3F3F46] rounded-lg hover:bg-[#E4E4E7] transition-colors text-sm font-medium flex items-center gap-1 ml-auto"
                    data-testid={`campaign-btn-${vehicle.vin}`}
                  >
                    <PaperPlaneTilt className="w-4 h-4" />
                    {t('adm_campaign')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// Top Users Table
const TopUsersTable = ({ users }) => {
  const { t } = useLang();
  const getIntentBadge = (level, score) => {
    if (level === 'hot') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold bg-red-100 text-red-700">
          <Fire className="w-3 h-3" weight="fill" /> HOT {score}
        </span>
      );
    }
    if (level === 'warm') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold bg-yellow-100 text-yellow-700">
          WARM {score}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-700">
        COLD {score}
      </span>
    );
  };

  if (!users.length) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-500">
        <Users className="w-12 h-12 mx-auto text-gray-300 mb-2" />
        <p>{t('adm_no_data_2')}</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full" data-testid="top-users-table">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('adm_user')}</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('adm_intent')}</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">❤️</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">⚖️</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">📋</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('adm_last_activity')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {users.map((user) => (
              <tr key={user.userId || user.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <div className="text-sm font-medium text-gray-900">
                    {user.context?.name || user.name || (user.userId || user.id || '').substring(0, 12) || '-'}
                  </div>
                  <div className="text-xs text-gray-500">
                    {user.context?.email || user.email || user.context?.phone || '-'}
                  </div>
                </td>
                <td className="px-4 py-3">
                  {getIntentBadge(user.level, user.score)}
                </td>
                <td className="px-4 py-3 text-center text-sm">{user.favoritesCount || 0}</td>
                <td className="px-4 py-3 text-center text-sm">{user.comparesCount || 0}</td>
                <td className="px-4 py-3 text-center text-sm">{user.historyRequestsCount || 0}</td>
                <td className="px-4 py-3 text-sm text-gray-500">
                  {user.lastActivityAt 
                    ? new Date(user.lastActivityAt).toLocaleDateString(getLocale())
                    : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// Campaign History Table
const CampaignHistoryTable = ({ campaigns }) => {
  const { t } = useLang();
  const getStatusBadge = (status) => {
    const colors = {
      completed: 'bg-green-100 text-green-700',
      sending: 'bg-yellow-100 text-yellow-700',
      pending: 'bg-gray-100 text-gray-700',
      failed: 'bg-red-100 text-red-700',
    };
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${colors[status] || colors.pending}`}>
        {status?.toUpperCase()}
      </span>
    );
  };

  const getChannelIcon = (channel) => {
    switch (channel) {
      case 'sms': return <Phone className="w-4 h-4" />;
      case 'telegram': return <ChatCircle className="w-4 h-4" />;
      case 'whatsapp': return <ChatCircle className="w-4 h-4" />;
      case 'email': return <EnvelopeSimple className="w-4 h-4" />;
      default: return <PaperPlaneTilt className="w-4 h-4" />;
    }
  };

  if (!campaigns.length) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-500">
        <Clock className="w-12 h-12 mx-auto text-gray-300 mb-2" />
        <p>{t('adm_no_campaign_history')}</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full" data-testid="campaign-history-table">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">VIN</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">{t('adm_channel')}</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">{t('adm_status')}</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">{t('adm_sent')}</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">{t('adm_failed')}</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('adm_date')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {campaigns.map((campaign, idx) => (
              <tr key={campaign._id || idx} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <code className="text-sm font-mono bg-gray-100 px-2 py-1 rounded">
                    {campaign.vin}
                  </code>
                </td>
                <td className="px-4 py-3 text-center">
                  <span className="inline-flex items-center gap-1 text-gray-600">
                    {getChannelIcon(campaign.channel)}
                    {campaign.channel?.toUpperCase()}
                  </span>
                </td>
                <td className="px-4 py-3 text-center">
                  {getStatusBadge(campaign.status)}
                </td>
                <td className="px-4 py-3 text-center font-semibold text-green-600">
                  {campaign.sentCount}
                </td>
                <td className="px-4 py-3 text-center font-semibold text-red-600">
                  {campaign.failedCount}
                </td>
                <td className="px-4 py-3 text-sm text-gray-500">
                  {campaign.createdAt 
                    ? new Date(campaign.createdAt).toLocaleString(getLocale())
                    : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// Campaign Modal
const CampaignModal = ({
  vin,
  audience,
  templates,
  channel,
  setChannel,
  message,
  setMessage,
  intentMin,
  setIntentMin,
  onlyHot,
  setOnlyHot,
  onApplyTemplate,
  onSend,
  onClose,
  sending,
}) => {
  const { t } = useLang();
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" data-testid="campaign-modal">
      <div className="flex items-center justify-center min-h-screen p-4">
        <div className="fixed inset-0 bg-black/50" onClick={onClose} />
        
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="relative bg-white rounded-2xl shadow-xl max-w-lg w-full p-6"
        >
          <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
            <PaperPlaneTilt className="w-6 h-6 text-[#18181B]" />
            {t('adm_campaign_for_vin')}
          </h2>
          
          <div className="mb-4 p-3 bg-gray-100 rounded-lg">
            <code className="text-sm font-mono">{vin}</code>
            {audience && (
              <div className="text-xs text-gray-500 mt-1">
                {audience.totalUsers} {t('r9_users_will_receive')}
              </div>
            )}
          </div>

          {/* Channel Select */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">{t('adm_channel_2')}</label>
            <div className="grid grid-cols-4 gap-2">
              {['sms', 'telegram', 'whatsapp', 'email'].map(ch => (
                <button
                  key={ch}
                  onClick={() => setChannel(ch)}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    channel === ch
                      ? 'bg-[#18181B] text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {ch.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* Templates */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">{t('adm_templates')}</label>
            <div className="flex flex-wrap gap-2">
              {templates.map(template => (
                <button
                  key={template.id}
                  onClick={() => onApplyTemplate(template)}
                  className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm"
                >
                  {template.name}
                </button>
              ))}
            </div>
          </div>

          {/* Message */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">{t('adm_message')}</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              placeholder={t('adm3_17d4364748')}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#18181B]/20 focus:border-transparent"
              data-testid="campaign-message-input"
            />
            <div className="text-xs text-gray-500 mt-1">
              Placeholder: {'{vin}'}, {'{name}'}, {'{score}'}
            </div>
          </div>

          {/* Filters */}
          <div className="mb-6 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm text-gray-700">{t('adm_min_intent_score')}</label>
              <input
                type="number"
                min={0}
                max={100}
                value={intentMin}
                onChange={(e) => setIntentMin(parseInt(e.target.value) || 0)}
                className="w-20 px-3 py-1 border border-gray-300 rounded-lg text-center"
              />
            </div>
            <div className="flex items-center justify-between">
              <label className="text-sm text-gray-700">{t('adm_only_hot_users')}</label>
              <button
                onClick={() => setOnlyHot(!onlyHot)}
                className={`w-12 h-6 rounded-full transition-colors ${
                  onlyHot ? 'bg-[#18181B]' : 'bg-gray-300'
                }`}
              >
                <span className={`block w-5 h-5 bg-white rounded-full shadow transition-transform ${
                  onlyHot ? 'translate-x-6' : 'translate-x-0.5'
                }`} />
              </button>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              {t('adm_cancel_3')}
            </button>
            <button
              onClick={onSend}
              disabled={sending || !message.trim()}
              className="flex-1 px-4 py-2 bg-[#18181B] text-white rounded-lg hover:bg-[#27272A] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              data-testid="send-campaign-confirm-btn"
            >
              {sending ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  {t('adm_sending')}
                </>
              ) : (
                <>
                  <PaperPlaneTilt className="w-4 h-4" />
                  {t('adm_send')}
                </>
              )}
            </button>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default UserEngagementPage;
