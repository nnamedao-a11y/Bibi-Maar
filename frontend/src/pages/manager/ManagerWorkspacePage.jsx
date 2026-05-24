/**
 * BIBI Cars - Manager Workspace (Daily Cockpit)
 * Main workspace with 4 blocks: HOT Leads, Tasks, Payments, Shipments
 */

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API_URL, useAuth } from '../../App';
import { useLang } from '../../i18n';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import { uk } from 'date-fns/locale';
import { Link } from 'react-router-dom';
import {
  Fire,
  ListChecks,
  CreditCard,
  Truck,
  Phone,
  Clock,
  Warning,
  ArrowRight,
  Eye,
  Check,
  CalendarCheck,
  Sparkle,
  CheckCircle,
  XCircle,
  Hourglass
} from '@phosphor-icons/react';
import ProviderHealthWidget from '../../components/ProviderHealthWidget';

const ManagerWorkspacePage = () => {
  const { t } = useLang();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [hotLeads, setHotLeads] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [payments, setPayments] = useState([]);
  const [shipments, setShipments] = useState([]);
  // Свои Top Deals карточки — счётчики по статусам. Отдельный виджет
  // на дашборде, чтобы менеджер сразу видел сколько у него ждёт апрува,
  // сколько уже одобрено и сколько отклонено (с возможностью переделать).
  const [myDeals, setMyDeals] = useState({ pending: 0, approved: 0, rejected: 0 });

  useEffect(() => {
    fetchWorkspaceData();
  }, []);

  const fetchWorkspaceData = async () => {
    try {
      const userId = user?._id || user?.id;
      
      const [leadsRes, tasksRes, paymentsRes, shipmentsRes, dealsRes] = await Promise.all([
        axios.get(`${API_URL}/api/leads?managerId=${userId}&score_gte=70`).catch(() => ({ data: [] })),
        axios.get(`${API_URL}/api/tasks?assigneeId=${userId}&status=pending`).catch(() => ({ data: [] })),
        axios.get(`${API_URL}/api/invoices?managerId=${userId}&status=overdue`).catch(() => ({ data: [] })),
        axios.get(`${API_URL}/api/shipments?managerId=${userId}`).catch(() => ({ data: [] })),
        // Свои Top Deals карточки. mine_only=true фильтрует на бэке по
        // created_by = текущему пользователю. Если запрос упал — спокойно
        // показываем нули, не блокируем дашборд.
        axios.get(`${API_URL}/api/manager/wishlist-deals`, { params: { mine_only: true } })
          .catch(() => ({ data: { data: [] } })),
      ]);

      setHotLeads(Array.isArray(leadsRes.data) ? leadsRes.data : (leadsRes.data?.data || []));
      setTasks(Array.isArray(tasksRes.data) ? tasksRes.data : (tasksRes.data?.data || []));
      setPayments(Array.isArray(paymentsRes.data) ? paymentsRes.data : (paymentsRes.data?.data || []));
      setShipments(Array.isArray(shipmentsRes.data) ? shipmentsRes.data : (shipmentsRes.data?.data || []));

      const dealsList = Array.isArray(dealsRes.data?.data) ? dealsRes.data.data : [];
      const tally = { pending: 0, approved: 0, rejected: 0 };
      dealsList.forEach((d) => {
        const s = d?.status || 'pending';
        if (s in tally) tally[s] += 1;
      });
      setMyDeals(tally);
    } catch (err) {
      console.error('Workspace error:', err);
      setHotLeads([]);
      setTasks([]);
      setPayments([]);
      setShipments([]);
      setMyDeals({ pending: 0, approved: 0, rejected: 0 });
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteTask = async (taskId) => {
    try {
      await axios.patch(`${API_URL}/api/tasks/${taskId}`, { status: 'completed' });
      toast.success(t('taskCompleted'));
      fetchWorkspaceData();
    } catch (err) {
      toast.error(t('error'));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-2 border-[#4F46E5] border-t-transparent rounded-full"></div>
      </div>
    );
  }

  return (
    <motion.div 
      data-testid="manager-workspace-page"
      initial={{ opacity: 0, y: 10 }} 
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[#18181B]" style={{ fontFamily: 'Mazzard, Mazzard H, Mazzard M, system-ui, sans-serif' }}>
          {t('myWorkspace')}
        </h1>
        <p className="text-sm text-[#71717A] mt-1">
          {user?.name || t('manager')}
        </p>
      </div>

      {/* Provider Pressure self-view */}
      <ProviderHealthWidget className="max-w-md" />

      {/* Customer engagement entry point — quick link to the read-only
          engagement dashboard so managers can see which cars customers
          favorited / compared / shared and follow up before the lead cools. */}
      <Link
        to="/manager/engagement"
        data-testid="manager-engagement-cta"
        className="block bg-gradient-to-r from-rose-50 to-amber-50 border border-rose-100 rounded-2xl p-4 sm:p-5 hover:border-rose-200 hover:shadow-sm transition group"
      >
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-white border border-rose-100 flex items-center justify-center flex-shrink-0">
            <Eye size={22} className="text-rose-600" weight="duotone" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-[#18181B] flex items-center gap-2">
              {t('userEngagement') || 'Customer engagement'}
              <span className="text-[10px] uppercase tracking-wider bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full">
                read-only
              </span>
            </div>
            <div className="text-xs text-[#71717A] mt-1">
              Favorites · Comparisons · Shares — see who is hot to call right now.
            </div>
          </div>
          <ArrowRight size={20} className="text-[#71717A] group-hover:text-[#18181B] group-hover:translate-x-1 transition flex-shrink-0" />
        </div>
      </Link>

      {/* My Top Deals — single widget с тремя счётчиками по статусам.
          Менеджеру важно видеть: сколько висит на апруве у тимлида,
          сколько уже опубликовано, сколько отклонено (есть что переделать).
          Клик ведёт сразу на /manager/wishlist. */}
      <Link
        to="/manager/wishlist"
        data-testid="manager-mydeals-widget"
        className={`block rounded-2xl border p-4 sm:p-5 transition group ${
          myDeals.rejected > 0
            ? 'bg-gradient-to-r from-rose-50 to-amber-50 border-rose-200 hover:border-rose-300'
            : myDeals.pending > 0
              ? 'bg-gradient-to-r from-amber-50 to-orange-50 border-amber-200 hover:border-amber-300'
              : 'bg-white border-[#E4E4E7] hover:border-[#A1A1AA]'
        }`}
      >
        <div className="flex items-center gap-4">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${
            myDeals.rejected > 0 ? 'bg-white border border-rose-100'
              : myDeals.pending > 0 ? 'bg-white border border-amber-100'
              : 'bg-[#F4F4F5]'
          }`}>
            <Sparkle
              size={22}
              weight={myDeals.pending > 0 || myDeals.rejected > 0 ? 'fill' : 'duotone'}
              className={
                myDeals.rejected > 0 ? 'text-rose-600'
                  : myDeals.pending > 0 ? 'text-amber-600'
                  : 'text-[#71717A]'
              }
            />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-[#18181B] flex items-center gap-2 flex-wrap">
              My Top Deals of the Week
              {myDeals.rejected > 0 && (
                <span className="text-[10px] uppercase tracking-wider bg-rose-500 text-white px-2 py-0.5 rounded-full">
                  rework needed
                </span>
              )}
              {myDeals.rejected === 0 && myDeals.pending > 0 && (
                <span className="text-[10px] uppercase tracking-wider bg-amber-500 text-white px-2 py-0.5 rounded-full">
                  awaiting approval
                </span>
              )}
              {myDeals.pending === 0 && myDeals.rejected === 0 && myDeals.approved === 0 && (
                <span className="text-[10px] uppercase tracking-wider bg-[#F4F4F5] text-[#71717A] px-2 py-0.5 rounded-full">
                  empty
                </span>
              )}
            </div>
            <div className="text-xs text-[#71717A] mt-1">
              {myDeals.pending === 0 && myDeals.rejected === 0 && myDeals.approved === 0
                ? 'You have no curated picks yet — create cards for this week\'s budgets.'
                : myDeals.rejected > 0
                ? `${myDeals.rejected} of your card${myDeals.rejected === 1 ? '' : 's'} ${myDeals.rejected === 1 ? 'was' : 'were'} rejected — fix and re-submit.`
                : myDeals.pending > 0
                ? `${myDeals.pending} card${myDeals.pending === 1 ? '' : 's'} waiting for team-lead approval — meanwhile keep curating.`
                : `All ${myDeals.approved} of your picks are live on the homepage.`}
            </div>
          </div>
          {/* Три счётчика — ключевая ценность этого виджета. */}
          <div className="hidden sm:flex items-center gap-4 px-2">
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 text-amber-600">
                <Hourglass size={14} weight="fill" />
                <span className="text-xl font-bold leading-none">{myDeals.pending}</span>
              </div>
              <div className="text-[10px] uppercase tracking-wider text-[#71717A] mt-0.5">Pending</div>
            </div>
            <div className="w-px h-8 bg-[#E4E4E7]" />
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 text-emerald-600">
                <CheckCircle size={14} weight="fill" />
                <span className="text-xl font-bold leading-none">{myDeals.approved}</span>
              </div>
              <div className="text-[10px] uppercase tracking-wider text-[#71717A] mt-0.5">Approved</div>
            </div>
            <div className="w-px h-8 bg-[#E4E4E7]" />
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 text-rose-600">
                <XCircle size={14} weight="fill" />
                <span className="text-xl font-bold leading-none">{myDeals.rejected}</span>
              </div>
              <div className="text-[10px] uppercase tracking-wider text-[#71717A] mt-0.5">Rejected</div>
            </div>
          </div>
          {/* Компактная версия счётчиков для мобильных. */}
          <div className="flex sm:hidden items-center gap-2 text-xs">
            <span className="text-amber-700 font-bold">{myDeals.pending}p</span>
            <span className="text-emerald-700 font-bold">{myDeals.approved}a</span>
            <span className="text-rose-700 font-bold">{myDeals.rejected}r</span>
          </div>
          <ArrowRight size={20} className="text-[#71717A] group-hover:text-[#18181B] group-hover:translate-x-1 transition flex-shrink-0" />
        </div>
      </Link>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <QuickStat icon={Fire} label={t('hotLeads')} value={hotLeads.length} color="#DC2626" alert={hotLeads.length > 0} />
        <QuickStat icon={ListChecks} label={t('myTasks')} value={tasks.length} color="#4F46E5" alert={tasks.filter(t => t.priority === 'high').length > 0} />
        <QuickStat icon={CreditCard} label={t('paymentsToChase')} value={payments.length} color="#D97706" alert={payments.length > 0} />
        <QuickStat icon={Truck} label={t('myShipments')} value={shipments.length} color="#059669" />
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* My HOT Leads */}
        <div className="bg-white rounded-2xl border border-[#E4E4E7] overflow-hidden">
          <div className="px-5 py-4 border-b border-[#E4E4E7] flex items-center justify-between bg-[#FEF2F2]">
            <div className="flex items-center gap-2">
              <Fire size={20} className="text-[#DC2626]" weight="fill" />
              <h3 className="font-semibold text-[#DC2626]">{t('myHotLeads')}</h3>
            </div>
            <Link to="/manager/leads" className="text-sm text-[#DC2626] hover:underline">
              {t('viewAll')}
            </Link>
          </div>
          <div className="divide-y divide-[#E4E4E7] max-h-80 overflow-auto">
            {hotLeads.length === 0 ? (
              <div className="p-6 text-center text-sm text-[#71717A]">
                {t('noHotLeads')}
              </div>
            ) : (
              hotLeads.slice(0, 5).map((lead, idx) => (
                <div key={idx} className="px-5 py-4 hover:bg-[#FAFAFA] transition-colors">
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-medium text-[#18181B]">{lead.name || 'Client'}</div>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-[#FEF2F2] text-[#DC2626] text-xs font-bold rounded-full">
                      <Fire size={12} weight="fill" /> {lead.score || 0}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-[#71717A]">
                    <span>Last action: {lead.lastActionAt ? format(new Date(lead.lastActionAt), 'HH:mm', { locale: uk }) : 'N/A'}</span>
                    <span className={`font-medium ${!lead.lastContactAt ? 'text-[#DC2626]' : 'text-[#71717A]'}`}>
                      {!lead.lastContactAt ? 'URGENT - No contact' : 'Call'}
                    </span>
                  </div>
                  <div className="mt-2">
                    <button className="flex items-center gap-1 text-xs text-[#18181B] hover:underline">
                      <Phone size={12} /> {t('adm_call_now')}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* My Tasks */}
        <div className="bg-white rounded-2xl border border-[#E4E4E7] overflow-hidden">
          <div className="px-5 py-4 border-b border-[#E4E4E7] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ListChecks size={20} className="text-[#18181B]" weight="duotone" />
              <h3 className="font-semibold text-[#18181B]">{t('myTasks')}</h3>
            </div>
            <Link to="/manager/tasks" className="text-sm text-[#18181B] hover:underline">
              {t('viewAll')}
            </Link>
          </div>
          <div className="divide-y divide-[#E4E4E7] max-h-80 overflow-auto">
            {tasks.length === 0 ? (
              <div className="p-6 text-center text-sm text-[#71717A]">
                {t('noOverdueTasks')}
              </div>
            ) : (
              tasks.slice(0, 5).map((task, idx) => (
                <div key={idx} className="px-5 py-4 hover:bg-[#FAFAFA] transition-colors">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-[#18181B]">{task.title || task.type}</span>
                        {task.priority === 'high' && (
                          <span className="px-2 py-0.5 bg-[#FEF2F2] text-[#DC2626] text-xs font-medium rounded-full">
                            {t('adm_high')}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-[#71717A]">
                        {task.dueAt ? `Due: ${format(new Date(task.dueAt), 'dd MMM, HH:mm', { locale: uk })}` : 'No due date'}
                      </div>
                    </div>
                    <button
                      onClick={() => handleCompleteTask(task._id)}
                      className="p-2 text-[#71717A] hover:text-[#059669] hover:bg-[#ECFDF5] rounded-lg transition-colors"
                    >
                      <Check size={18} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* My Payments to Chase */}
        <div className="bg-white rounded-2xl border border-[#E4E4E7] overflow-hidden">
          <div className="px-5 py-4 border-b border-[#E4E4E7] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CreditCard size={20} className="text-[#D97706]" weight="duotone" />
              <h3 className="font-semibold text-[#18181B]">{t('paymentsToChase')}</h3>
            </div>
            <Link to="/manager/invoices" className="text-sm text-[#18181B] hover:underline">
              {t('viewAll')}
            </Link>
          </div>
          <div className="divide-y divide-[#E4E4E7] max-h-80 overflow-auto">
            {payments.length === 0 ? (
              <div className="p-6 text-center text-sm text-[#71717A]">
                {t('noOverduePayments')}
              </div>
            ) : (
              payments.slice(0, 5).map((inv, idx) => (
                <div key={idx} className="px-5 py-4 hover:bg-[#FAFAFA] transition-colors">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-[#18181B]">{inv.customerName || 'Client'}</span>
                    <span className="font-bold text-[#DC2626]">${inv.amount?.toLocaleString() || 0}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-[#71717A]">
                    <span>{inv.type || 'Invoice'}</span>
                    <span className="text-[#DC2626]">{inv.daysOverdue || 0} days overdue</span>
                  </div>
                  <div className="mt-2">
                    <button className="flex items-center gap-1 text-xs text-[#18181B] hover:underline">
                      <Phone size={12} /> {t('adm_call')}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* My Shipments */}
        <div className="bg-white rounded-2xl border border-[#E4E4E7] overflow-hidden">
          <div className="px-5 py-4 border-b border-[#E4E4E7] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Truck size={20} className="text-[#059669]" weight="duotone" />
              <h3 className="font-semibold text-[#18181B]">{t('myShipments')}</h3>
            </div>
            <Link to="/manager/shipments" className="text-sm text-[#18181B] hover:underline">
              {t('viewAll')}
            </Link>
          </div>
          <div className="divide-y divide-[#E4E4E7] max-h-80 overflow-auto">
            {shipments.length === 0 ? (
              <div className="p-6 text-center text-sm text-[#71717A]">
                {t('noShipmentIssues')}
              </div>
            ) : (
              shipments.slice(0, 5).map((ship, idx) => (
                <div key={idx} className="px-5 py-4 hover:bg-[#FAFAFA] transition-colors">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-mono text-sm font-medium text-[#18181B]">
                      {ship.vin?.slice(-8) || 'VIN'}
                    </span>
                    <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                      ship.trackingActive ? 'bg-[#ECFDF5] text-[#059669]' : 'bg-[#FEF2F2] text-[#DC2626]'
                    }`}>
                      {ship.trackingActive ? 'Tracking' : 'No Tracking'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-[#71717A]">
                    <span>{ship.status?.replace('_', ' ') || 'Status'}</span>
                    <span>ETA: {ship.eta ? format(new Date(ship.eta), 'dd MMM', { locale: uk }) : 'N/A'}</span>
                  </div>
                  {!ship.trackingActive && (
                    <div className="mt-2 flex items-center gap-1 text-xs text-[#DC2626]">
                      <Warning size={12} /> {t('adm_action_needed_add_tracking')}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
};

const QuickStat = ({ icon: Icon, label, value, color, alert }) => (
  <div className={`bg-white rounded-xl p-4 border ${alert ? 'border-[#FECACA] bg-[#FEF2F2]' : 'border-[#E4E4E7]'}`}>
    <div className="flex items-center gap-2 mb-2">
      <Icon size={18} style={{ color }} weight={alert ? 'fill' : 'duotone'} />
      <span className="text-xs font-medium text-[#71717A]">{label}</span>
    </div>
    <div className="text-2xl font-bold" style={{ color: alert ? '#DC2626' : '#18181B' }}>
      {value}
    </div>
  </div>
);

export default ManagerWorkspacePage;
