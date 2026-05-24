/**
 * Invoice Reminders Dashboard
 * 
 * /admin/invoice-reminders
 * 
 * Monitor and manage invoice reminders & escalations
 */

import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { API_URL, useAuth } from '../App';
import { useLang, getLocale } from '../i18n';
import RefreshButton from '../components/ui/RefreshButton';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import {
  Clock,
  Warning,
  ShieldWarning,
  Bell,
  ArrowsClockwise,
  Check,
  User,
  Envelope,
  CaretRight,
  ChartLineUp,
  Play
} from '@phosphor-icons/react';

// Escalation Level Badge
const EscalationBadge = ({ level  }) => {
  const { t } = useLang();
  const config = {
    0: { bg: 'bg-zinc-100', text: 'text-zinc-600', label: t('pending') },
    1: { bg: 'bg-amber-100', text: 'text-amber-700', label: t('level1Manager') },
    2: { bg: 'bg-orange-100', text: 'text-orange-700', label: t('level2TeamLead') },
    3: { bg: 'bg-red-100', text: 'text-red-700', label: t('level3Owner') },
  };
  const c = config[level] || config[0];
  return (
    <span className={`${c.bg} ${c.text} px-2 py-1 rounded-full text-xs font-medium`}>
      {c.label}
    </span>
  );
};

// Summary Card — компактная версия
const COLOR_MAP = {
  amber:  { bg: 'bg-amber-50',  fg: 'text-amber-600' },
  orange: { bg: 'bg-orange-50', fg: 'text-orange-600' },
  red:    { bg: 'bg-red-50',    fg: 'text-red-600' },
  emerald:{ bg: 'bg-emerald-50',fg: 'text-emerald-600' },
  blue:   { bg: 'bg-blue-50',   fg: 'text-blue-600' },
  violet: { bg: 'bg-violet-50', fg: 'text-violet-600' },
};

const SummaryCard = ({ title, value, icon: Icon, color = 'amber', subtitle }) => {
  const c = COLOR_MAP[color] || COLOR_MAP.amber;
  return (
    <div className="bg-white rounded-2xl border border-[#E4E4E7] p-3 sm:p-4 flex items-center gap-3">
      <div className={`p-2 rounded-xl ${c.bg} flex-shrink-0`}>
        <Icon size={20} weight="duotone" className={c.fg} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xl sm:text-2xl font-bold text-[#18181B] leading-tight"
           style={{ fontFamily: 'Mazzard, Mazzard H, Mazzard M, system-ui, sans-serif' }}>
          {value}
        </p>
        <p className="text-xs sm:text-sm font-medium text-[#18181B] mt-0.5 truncate">{title}</p>
        {subtitle && <p className="text-[10px] sm:text-xs text-[#A1A1AA] mt-0.5 truncate">{subtitle}</p>}
      </div>
    </div>
  );
};

// Invoice Row — compact
const InvoiceRow = ({ invoice }) => (
  <div className="flex items-center gap-3 p-3 bg-white rounded-xl border border-[#E4E4E7] hover:shadow-md transition-all">
    <div className="p-2 rounded-lg bg-red-50 flex-shrink-0">
      <Warning size={18} className="text-red-600" />
    </div>
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2 flex-wrap">
        <p className="font-medium text-[#18181B] truncate text-sm">
          #{invoice.id?.slice(0, 8)}
        </p>
        <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-red-100 text-red-700 flex-shrink-0">
          OVERDUE
        </span>
      </div>
      <p className="text-xs text-[#71717A] truncate">{invoice.title || invoice.description}</p>
    </div>
    <div className="text-right flex-shrink-0">
      <p className="font-bold text-[#18181B] text-sm whitespace-nowrap">${(invoice.amount || 0).toLocaleString()}</p>
      <p className="text-[10px] text-[#71717A] whitespace-nowrap">
        {invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString(getLocale()) : '—'}
      </p>
    </div>
    <CaretRight size={14} className="text-[#A1A1AA] flex-shrink-0" />
  </div>
);

const InvoiceRemindersDashboard = () => {
  const { t } = useLang();
  const { user } = useAuth();
  const [summary, setSummary] = useState(null);
  const [criticalInvoices, setCriticalInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [summaryRes, criticalRes] = await Promise.all([
        axios.get(`${API_URL}/api/invoice-reminders/escalation-summary`),
        axios.get(`${API_URL}/api/invoice-reminders/critical`),
      ]);
      setSummary(summaryRes.data);
      setCriticalInvoices(criticalRes.data || []);
    } catch (error) {
      console.error('Failed to load data:', error);
      toast.error(t('adm_data_loading_error'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleForceProcess = async () => {
    try {
      setProcessing(true);
      const res = await axios.post(`${API_URL}/api/invoice-reminders/process`);
      toast.success(`${t('r9_processed_7f8g9h')} ${res.data.processed} ${t('r9_invoices_sent_rem_0a1b2c')} ${res.data.reminders} ${t('r9_reminders_count_3d4e5f')}`);
      fetchData();
    } catch (error) {
      toast.error(t('adm_processing_error'));
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin w-8 h-8 border-2 border-[#18181B] border-t-transparent rounded-full"></div>
      </div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0 }} 
      animate={{ opacity: 1 }} 
      className="space-y-5 sm:space-y-6"
      data-testid="invoice-reminders-dashboard"
    >
      {/* Header — compact, single-row on all viewports */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl sm:text-2xl font-bold text-[#18181B] truncate" style={{ fontFamily: 'Mazzard, Mazzard H, Mazzard M, system-ui, sans-serif' }}>
            {t('adm_invoice_reminders')}
          </h1>
          <p className="text-xs sm:text-sm text-[#71717A] mt-0.5 line-clamp-2">{t('adm_reminders_and_escalations_monitoring')}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <RefreshButton
            onClick={fetchData}
            ariaLabel="Refresh"
            testId="refresh-btn"
          />
          <button
            onClick={handleForceProcess}
            disabled={processing}
            className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-[#18181B] text-white rounded-xl hover:bg-[#3F3F46] transition-colors disabled:opacity-50 whitespace-nowrap text-sm font-medium"
            data-testid="process-btn"
          >
            {processing ? (
              <ArrowsClockwise size={16} className="animate-spin" />
            ) : (
              <Play size={16} weight="fill" />
            )}
            <span className="hidden xs:inline sm:inline">{t('r9_run_processing_1j2k3l')}</span>
          </button>
        </div>
      </div>

      {/* Escalation Summary — 2 cards / row on mobile, 4 / row on desktop */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <SummaryCard
          title={t('level1Manager')}
          value={summary?.level1Count || 0}
          icon={Clock}
          color="amber"
          subtitle={t('oneDayOverdue')}
        />
        <SummaryCard
          title={t('level2TeamLead')}
          value={summary?.level2Count || 0}
          icon={Warning}
          color="orange"
          subtitle={t('threeDaysOverdue')}
        />
        <SummaryCard
          title={t('level3Owner')}
          value={summary?.level3Count || 0}
          icon={ShieldWarning}
          color="red"
          subtitle={t('fiveDaysOverdue')}
        />
        <SummaryCard
          title={t('criticalLevel')}
          value={summary?.criticalCount || 0}
          icon={Bell}
          color="red"
          subtitle={t('requiresImmediateAction')}
        />
      </div>

      {/* Reminder Rules Info */}
      <div className="bg-gradient-to-br from-violet-50 to-indigo-50 rounded-2xl border border-violet-200 p-4 sm:p-5">
        <h2 className="text-base sm:text-lg font-semibold text-[#18181B] mb-3 sm:mb-4" style={{ fontFamily: 'Mazzard, Mazzard H, Mazzard M, system-ui, sans-serif' }}>
          {t('adm_reminder_rules')}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div className="bg-white/80 rounded-xl p-3">
            <div className="flex items-center gap-2 mb-1.5">
              <div className="p-1.5 rounded-lg bg-blue-100">
                <Clock size={14} className="text-blue-600" />
              </div>
              <span className="font-medium text-[#18181B] text-sm">{t('adm_t24h')}</span>
            </div>
            <p className="text-xs text-[#71717A] leading-snug">{t('adm_reminder_to_customer_and_manager_24_hours_before_d')}</p>
          </div>
          <div className="bg-white/80 rounded-xl p-3">
            <div className="flex items-center gap-2 mb-1.5">
              <div className="p-1.5 rounded-lg bg-amber-100">
                <Bell size={14} className="text-amber-600" />
              </div>
              <span className="font-medium text-[#18181B] text-sm">T-0 (Due Today)</span>
            </div>
            <p className="text-xs text-[#71717A] leading-snug">{t('adm_urgent_reminder_on_deadline_day')}</p>
          </div>
          <div className="bg-white/80 rounded-xl p-3">
            <div className="flex items-center gap-2 mb-1.5">
              <div className="p-1.5 rounded-lg bg-orange-100">
                <Warning size={14} className="text-orange-600" />
              </div>
              <span className="font-medium text-[#18181B] text-sm">{t('adm_t13_days')}</span>
            </div>
            <p className="text-xs text-[#71717A] leading-snug">{t('adm3_l1_team_lead_l2_92d1766266')}</p>
          </div>
          <div className="bg-white/80 rounded-xl p-3">
            <div className="flex items-center gap-2 mb-1.5">
              <div className="p-1.5 rounded-lg bg-red-100">
                <ShieldWarning size={14} className="text-red-600" />
              </div>
              <span className="font-medium text-[#18181B] text-sm">{t('adm_t5_days')}</span>
            </div>
            <p className="text-xs text-[#71717A] leading-snug">{t('adm3_critical_owner_l3_c8f7f1f7c9')}</p>
          </div>
          <div className="bg-white/80 rounded-xl p-3 sm:col-span-2 lg:col-span-2">
            <div className="flex items-center gap-2 mb-1.5">
              <div className="p-1.5 rounded-lg bg-emerald-100">
                <Check size={14} className="text-emerald-600" />
              </div>
              <span className="font-medium text-[#18181B] text-sm">{t('adm_notification_channels')}</span>
            </div>
            <p className="text-xs text-[#71717A] leading-snug">
              {t('adm3_6cb6e969c7')}
            </p>
          </div>
        </div>
      </div>

      {/* Critical Invoices */}
      <div className="bg-white rounded-2xl border border-[#E4E4E7] p-4 sm:p-5">
        <div className="flex items-center justify-between mb-4 gap-2">
          <h2 className="text-base sm:text-lg font-semibold text-[#18181B] truncate" style={{ fontFamily: 'Mazzard, Mazzard H, Mazzard M, system-ui, sans-serif' }}>
            {t('adm_critical_overdue_invoices')}
          </h2>
          <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700 flex-shrink-0 whitespace-nowrap">
            {criticalInvoices.length} total
          </span>
        </div>
        
        {criticalInvoices.length > 0 ? (
          <div className="space-y-2.5">
            {criticalInvoices.map((invoice) => (
              <InvoiceRow key={invoice.id} invoice={invoice} />
            ))}
          </div>
        ) : (
          <div className="text-center py-10">
            <Check size={40} className="mx-auto mb-3 text-emerald-500" />
            <p className="font-medium text-[#18181B] text-sm">{t('adm_no_critical_invoices')}</p>
            <p className="text-xs text-[#71717A] mt-1">{t('adm_all_invoices_are_ok')}</p>
          </div>
        )}
      </div>

      {/* Cron Info */}
      <div className="bg-[#F4F4F5] rounded-xl p-3 sm:p-4 flex items-center gap-3">
        <ChartLineUp size={20} className="text-[#71717A] flex-shrink-0" />
        <div className="min-w-0">
          <p className="text-xs sm:text-sm font-medium text-[#18181B]">{t('adm_automatic_processing')}</p>
          <p className="text-[11px] sm:text-xs text-[#71717A] leading-snug">{t('adm_cron_job_runs_every_hour_to_check_and_send_reminde')}</p>
        </div>
      </div>
    </motion.div>
  );
};

export default InvoiceRemindersDashboard;
