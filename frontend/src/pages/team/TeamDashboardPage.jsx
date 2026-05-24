/**
 * BIBI Cars - Team Lead Dashboard
 * Main operational control center for team lead
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
  Users,
  ChartLineUp,
  Fire,
  Clock,
  Warning,
  CreditCard,
  Truck,
  Lightning,
  Eye,
  ArrowRight,
  Phone,
  Target,
  Hourglass,
  CheckCircle,
  XCircle
} from '@phosphor-icons/react';
import RefreshButton from '../../components/ui/RefreshButton';

const TeamDashboardPage = () => {
  const { t } = useLang();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [kpi, setKpi] = useState({
    activeLeads: 0,
    hotLeads: 0,
    staleLeads: 0,
    overdueTasks: 0,
    overdueInvoices: 0,
    stalledShipments: 0
  });
  const [managers, setManagers] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [overdueInvoices, setOverdueInvoices] = useState([]);
  const [shipmentIssues, setShipmentIssues] = useState([]);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const [kpiRes, managersRes, alertsRes, invoicesRes, shipmentsRes] = await Promise.all([
        axios.get(`${API_URL}/api/team/dashboard`).catch(() => ({ data: { kpi: {} } })),
        axios.get(`${API_URL}/api/team/managers`).catch(() => ({ data: [] })),
        axios.get(`${API_URL}/api/team/alerts`).catch(() => ({ data: [] })),
        axios.get(`${API_URL}/api/team/payments/overdue`).catch(() => ({ data: [] })),
        axios.get(`${API_URL}/api/team/shipping/stalled`).catch(() => ({ data: [] })),
      ]);

      setKpi(kpiRes.data?.kpi || kpiRes.data || {});
      const managersData = managersRes.data?.data || managersRes.data || [];
      setManagers(Array.isArray(managersData) ? managersData : []);
      const alertsData = alertsRes.data?.data || alertsRes.data || [];
      setAlerts(Array.isArray(alertsData) ? alertsData : []);
      const invoicesData = invoicesRes.data?.data || invoicesRes.data || [];
      setOverdueInvoices(Array.isArray(invoicesData) ? invoicesData : []);
      const shipmentsData = shipmentsRes.data?.data || shipmentsRes.data || [];
      setShipmentIssues(Array.isArray(shipmentsData) ? shipmentsData : []);
    } catch (err) {
      console.error('Dashboard error:', err);
    } finally {
      setLoading(false);
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
      data-testid="team-dashboard-page"
      initial={{ opacity: 0, y: 10 }} 
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* Header — Refresh docked top-right; secondary nav links (Managers / Reassignments)
          drop to their own bottom-left row, vertically centered with equal heights. */}
      <div className="space-y-3">
        <div className="flex flex-row items-start justify-between gap-3">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-[#18181B] text-white flex items-center justify-center shrink-0">
              <ChartLineUp size={18} weight="duotone" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold text-[#18181B] leading-tight break-words" style={{ fontFamily: 'Mazzard, Mazzard H, Mazzard M, system-ui, sans-serif' }}>
                {t('teamDashboard')}
              </h1>
              <p className="text-xs sm:text-sm text-[#71717A] mt-0.5 break-words">
                {t('teamDashboardDesc')}
              </p>
            </div>
          </div>
          <div className="shrink-0">
            <RefreshButton onClick={fetchDashboardData} loading={loading} ariaLabel={t('adm_refresh_3') || 'Refresh'} testId="team-dashboard-refresh-btn" />
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            to="/team/managers"
            className="inline-flex items-center justify-center h-9 px-4 bg-[#18181B] text-white rounded-xl text-sm font-medium hover:bg-[#27272A] active:bg-black transition-colors whitespace-nowrap leading-none focus:outline-none focus-visible:ring-4 focus-visible:ring-black/15"
            data-testid="dash-managers-link"
          >
            {t('managers')}
          </Link>
          <Link
            to="/team/reassignments"
            className="inline-flex items-center justify-center h-9 px-4 bg-white border border-[#E4E4E7] text-[#18181B] rounded-xl text-sm font-medium hover:bg-[#F4F4F5] transition-colors whitespace-nowrap leading-none focus:outline-none focus-visible:ring-4 focus-visible:ring-black/10"
            data-testid="dash-reassignments-link"
          >
            {t('reassignments')}
          </Link>
        </div>
      </div>

      {/* KPI Cards — neutral black icons; semantic red applies only on alert. */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <KPICard icon={Users} label={t('activeLeads')} value={kpi.activeLeads || 0} color="#18181B" />
        <KPICard icon={Fire} label={t('hotLeads')} value={kpi.hotLeads || 0} color={kpi.hotLeads > 0 ? '#DC2626' : '#18181B'} alert={kpi.hotLeads > 0} />
        <KPICard icon={Hourglass} label={t('staleLeads')} value={kpi.staleLeads || 0} color={kpi.staleLeads > 3 ? '#DC2626' : '#18181B'} alert={kpi.staleLeads > 3} />
        <KPICard icon={Clock} label={t('overdueTasks')} value={kpi.overdueTasks || 0} color={kpi.overdueTasks > 5 ? '#DC2626' : '#18181B'} alert={kpi.overdueTasks > 5} />
        <KPICard icon={CreditCard} label={t('overdueInvoices')} value={kpi.overdueInvoices || 0} color={kpi.overdueInvoices > 0 ? '#DC2626' : '#18181B'} alert={kpi.overdueInvoices > 0} />
        <KPICard icon={Truck} label={t('stalledShipments')} value={kpi.stalledShipments || 0} color={kpi.stalledShipments > 0 ? '#DC2626' : '#18181B'} alert={kpi.stalledShipments > 0} />
      </div>

      {/* Manager Load Board */}
      <div className="bg-white rounded-2xl border border-[#E4E4E7] overflow-hidden">
        <div className="px-5 py-4 border-b border-[#E4E4E7] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users size={20} className="text-[#18181B]" weight="duotone" />
            <h3 className="font-semibold text-[#18181B]">{t('managerLoadBoard')}</h3>
          </div>
          <Link to="/team/managers" className="text-sm text-[#18181B] hover:underline flex items-center gap-1">
            {t('allManagers') || t('teamManagers')} <ArrowRight size={14} />
          </Link>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-[#F4F4F5]">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-[#71717A] uppercase">{t('managerAlerts')}</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-[#71717A] uppercase">{t('score')}</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-[#71717A] uppercase">{t('leadsTab')}</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-[#71717A] uppercase">{t('hotShort')}</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-[#71717A] uppercase">{t('staleFilter')}</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-[#71717A] uppercase">{t('overdueTab')}</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-[#71717A] uppercase">{t('dealsTab')}</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-[#71717A] uppercase">{t('problem')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E4E4E7]">
              {managers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-sm text-[#71717A]">
                    {t('noManagersFound')}
                  </td>
                </tr>
              ) : (
                managers.map((m, idx) => (
                  <tr key={m.managerId || idx} className="hover:bg-[#FAFAFA] transition-colors">
                    <td className="px-4 py-3">
                      <Link to={`/team/managers/${m.managerId || m._id}`} className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-[#F4F4F5] rounded-full flex items-center justify-center text-sm font-medium text-[#18181B]">
                          {(m.name || 'M')[0]}
                        </div>
                        <span className="font-medium text-[#18181B]">{m.name || t('managerAlerts')}</span>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-1 text-xs font-bold rounded-full ${
                        (m.band || '').toLowerCase() === 'high' ? 'bg-[#ECFDF5] text-[#059669]' :
                        (m.band || '').toLowerCase() === 'medium' ? 'bg-[#FEF3C7] text-[#D97706]' :
                        (m.band || '').toLowerCase() === 'low' ? 'bg-[#FEF2F2] text-[#DC2626]' :
                        'bg-[#F4F4F5] text-[#71717A]'
                      }`}>
                        {m.band?.toUpperCase() || 'N/A'} {m.performanceScore || 0}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center font-medium">{m.activeLeads || 0}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={m.hotLeads > 0 ? 'text-[#DC2626] font-bold' : 'text-[#71717A]'}>
                        {m.hotLeads || 0}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={m.staleLeads > 2 ? 'text-[#D97706] font-bold' : 'text-[#71717A]'}>
                        {m.staleLeads || 0}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={m.overdueTasks > 0 ? 'text-[#DC2626] font-bold' : 'text-[#71717A]'}>
                        {m.overdueTasks || 0}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center font-medium text-[#059669]">{m.dealsWon || 0}</td>
                    <td className="px-4 py-3 text-center">
                      {(m.staleLeads > 3 || m.overdueTasks > 3) ? (
                        <span className="text-[#DC2626]">
                          <Warning size={20} weight="fill" />
                        </span>
                      ) : m.staleLeads > 0 || m.overdueTasks > 0 ? (
                        <span className="text-[#D97706]">
                          <Warning size={20} weight="duotone" />
                        </span>
                      ) : (
                        <span className="text-[#059669]">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Two Column Grid: Payments & Shipping */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Unpaid Invoices */}
        <div className="bg-white rounded-2xl border border-[#E4E4E7] overflow-hidden">
          <div className="px-5 py-4 border-b border-[#E4E4E7] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CreditCard size={20} className="text-[#DC2626]" weight="duotone" />
              <h3 className="font-semibold text-[#18181B]">{t('unpaidInvoices')}</h3>
            </div>
            <Link to="/team/payments" className="text-sm text-[#18181B] hover:underline">
              {t('viewAll')}
            </Link>
          </div>
          <div className="divide-y divide-[#E4E4E7] max-h-72 overflow-auto">
            {overdueInvoices.length === 0 ? (
              <div className="p-6 text-center text-sm text-[#71717A]">
                {t('noOverduePayments')}
              </div>
            ) : (
              overdueInvoices.slice(0, 5).map((inv, idx) => (
                <div key={idx} className="px-5 py-3 hover:bg-[#FAFAFA]">
                  <div className="flex justify-between items-start mb-1">
                    <span className="font-medium text-[#18181B]">{inv.customerName || t('client')}</span>
                    <span className="font-bold text-[#DC2626]">${inv.amount?.toLocaleString() || 0}</span>
                  </div>
                  <div className="flex justify-between text-xs text-[#71717A]">
                    <span>{inv.managerName || t('managerAlerts')} • {inv.type || t('tableInvoiceType')}</span>
                    <span className="text-[#DC2626]">{inv.daysOverdue || 0} {t('daysOverdueShort') || t('adm3_53ae167051')}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Shipment Issues */}
        <div className="bg-white rounded-2xl border border-[#E4E4E7] overflow-hidden">
          <div className="px-5 py-4 border-b border-[#E4E4E7] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Truck size={20} className="text-[#D97706]" weight="duotone" />
              <h3 className="font-semibold text-[#18181B]">{t('shippingWatch')}</h3>
            </div>
            <Link to="/team/shipping" className="text-sm text-[#18181B] hover:underline">
              {t('viewAll')}
            </Link>
          </div>
          <div className="divide-y divide-[#E4E4E7] max-h-72 overflow-auto">
            {shipmentIssues.length === 0 ? (
              <div className="p-6 text-center text-sm text-[#71717A]">
                {t('noShipmentIssues')}
              </div>
            ) : (
              shipmentIssues.slice(0, 5).map((ship, idx) => (
                <div key={idx} className="px-5 py-3 hover:bg-[#FAFAFA]">
                  <div className="flex justify-between items-start mb-1">
                    <span className="font-mono text-sm font-medium text-[#18181B]">{ship.vin?.slice(-8) || 'VIN'}</span>
                    <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                      ship.issue === 'no_tracking' ? 'bg-[#FEF2F2] text-[#DC2626]' :
                      ship.issue === 'stalled' ? 'bg-[#FEF3C7] text-[#D97706]' :
                      'bg-[#F4F4F5] text-[#71717A]'
                    }`}>
                      {ship.issue === 'no_tracking' ? t('noTracking') :
                       ship.issue === 'stalled' ? t('stalled') : ship.status || 'Issue'}
                    </span>
                  </div>
                  <div className="text-xs text-[#71717A]">
                    {ship.managerName || t('managerAlerts')} • {ship.daysSinceUpdate || 0} {t('daysNoUpdate') || t('adm3_4c282c0345')}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Critical Alerts */}
      {alerts.length > 0 && (
        <div className="bg-[#FEF2F2] rounded-2xl border border-[#FECACA] overflow-hidden">
          <div className="px-5 py-4 border-b border-[#FECACA] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Lightning size={20} className="text-[#DC2626]" weight="fill" />
              <h3 className="font-semibold text-[#DC2626]">{t('critical')}</h3>
            </div>
            <Link to="/team/alerts" className="text-sm text-[#DC2626] hover:underline">
              {t('viewAll')}
            </Link>
          </div>
          <div className="divide-y divide-[#FECACA]">
            {alerts.slice(0, 5).map((alert, idx) => (
              <div key={idx} className="px-5 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Warning size={18} className="text-[#DC2626]" weight="fill" />
                  <div>
                    <p className="text-sm font-medium text-[#DC2626]">{alert.title || alert.message}</p>
                    <p className="text-xs text-[#71717A]">{alert.managerName || ''}</p>
                  </div>
                </div>
                <span className="text-xs text-[#DC2626]">{alert.severity || 'critical'}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
};

const KPICard = ({ icon: Icon, label, value, color, alert }) => (
  <div className={`bg-white rounded-xl p-4 border ${alert ? 'border-[#FECACA] bg-[#FEF2F2]' : 'border-[#E4E4E7]'}`}>
    <div className="flex items-center gap-2 mb-2">
      <Icon size={18} style={{ color }} weight="duotone" />
      <span className="text-xs font-medium text-[#71717A]">{label}</span>
    </div>
    <div className="text-2xl font-bold" style={{ color: alert ? '#DC2626' : '#18181B' }}>
      {value}
    </div>
  </div>
);

export default TeamDashboardPage;
