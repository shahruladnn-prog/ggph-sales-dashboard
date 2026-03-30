import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Activity, CircleDollarSign, AlertTriangle, RefreshCw, BarChart2 } from 'lucide-react';
import { RevenueChart } from '../components/RevenueChart';
import { CategoryChart } from '../components/CategoryChart';
import { ManualEntryForm } from '../components/ManualEntryForm';
import { useDashboardStats } from '../lib/useDashboardStats';
import { supabase } from '../lib/supabase';
import { subDays, format } from 'date-fns';

export default function MissionControl() {
  const [showManualForm, setShowManualForm] = useState(false);
  const [startDateStr, setStartDateStr] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [endDateStr, setEndDateStr] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [selectedBranchIds, setSelectedBranchIds] = useState<string[]>([]);
  const [branches, setBranches] = useState<{id: string, name: string}[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');

  useEffect(() => {
    supabase.from('secure_branch_list').select('id, name').then(({data}) => {
       if (data) setBranches(data);
    });
  }, []);

  const handleForceSync = useCallback(async () => {
    setIsSyncing(true);
    setSyncMsg('Syncing...');
    try {
      const res = await fetch('/api/sync', {
        method: 'GET',
        headers: { Authorization: `Bearer ${import.meta.env.VITE_SYNC_SECRET || ''}` },
      });
      const data = await res.json();
      if (res.ok) {
        setSyncMsg(`✅ Synced! Refreshing...`);
        setTimeout(() => window.location.reload(), 1500);
      } else {
        setSyncMsg(`❌ ${data.error || 'Sync failed'}`);
      }
    } catch {
      setSyncMsg('❌ Network error');
    } finally {
      setIsSyncing(false);
      setTimeout(() => setSyncMsg(''), 4000);
    }
  }, []);

  const { startDate, endDate } = useMemo(() => {
    // Construct local midnight from string to avoid TZ shifts
    const startParts = startDateStr.split('-').map(Number);
    const endParts = endDateStr.split('-').map(Number);
    
    // JS Months are 0-indexed (Jan is 0)
    const startDate = new Date(startParts[0], startParts[1] - 1, startParts[2], 0, 0, 0);
    const endDate = new Date(endParts[0], endParts[1] - 1, endParts[2], 23, 59, 59, 999);
    
    return { startDate, endDate };
  }, [startDateStr, endDateStr]);

  const stats = useDashboardStats({ startDate, endDate, selectedBranchIds, allBranches: branches });

  const formatCurrency = (val: number) => new Intl.NumberFormat('en-MY', { style: 'currency', currency: 'MYR' }).format(val);

  return (
    <div className="p-6 md:p-10 max-w-[1600px] mx-auto space-y-8">
      
      {/* 1. Dashboard Header */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-12">
        <div>
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight bg-gradient-to-r from-purple-400 via-fuchsia-400 to-cyan-400 bg-clip-text text-transparent drop-shadow-lg">
            GGPH Sales Dashboard
          </h1>
          <p className="text-muted-foreground mt-2 text-sm md:text-base tracking-wide flex items-center gap-2">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-cyan-500"></span>
            </span>
            Real-Time Revenue & Anomaly Intelligence
          </p>
        </div>
        <div className="flex gap-4">
          <button 
            onClick={() => setShowManualForm(true)}
            className="px-5 py-2.5 rounded-lg text-sm font-semibold glass-panel hover:bg-white/10 active:scale-95 transition-all text-gray-200"
          >
            Manual Entry
          </button>
          <div className="flex flex-col items-end gap-1">
            <button 
              onClick={handleForceSync}
              disabled={isSyncing}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold bg-cyan-900 border border-cyan-500/50 hover:bg-cyan-800 neon-glow-cyan active:scale-95 transition-all text-cyan-100 disabled:opacity-50 disabled:cursor-wait"
            >
              <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
              {isSyncing ? 'Syncing...' : 'Force Sync'}
            </button>
            {syncMsg && <span className="text-xs text-cyan-300 font-mono">{syncMsg}</span>}
          </div>
        </div>
      </header>

      {/* 2. Top-Level Metrics Array */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard 
          title="Total POS Revenue (Loyverse)" 
          value={stats.isLoading ? "..." : formatCurrency(stats.totalPos)} 
          subtitle="Food, Retail & Activities" 
          icon={<CircleDollarSign className="text-cyan-400 w-5 h-5" />} 
          glow="neon-glow-cyan"
        />
        <MetricCard 
          title="Total PMS Revenue (eZee)" 
          value={stats.isLoading ? "..." : formatCurrency(stats.totalPms)} 
          subtitle="Accommodation & Rooms" 
          icon={<CircleDollarSign className="text-purple-400 w-5 h-5" />} 
        />
        <MetricCard 
          title="Portfolio ADR (Rooms)" 
          value={stats.isLoading ? "..." : formatCurrency(stats.adr)} 
          subtitle="Based on selected range" 
          icon={<Activity className="text-fuchsia-400 w-5 h-5" />} 
        />
        <MetricCard 
          title="Gross Portfolio Revenue" 
          value={stats.isLoading ? "..." : formatCurrency(stats.totalGross)} 
          subtitle="Live Consolidated Total" 
          icon={<Activity className="text-emerald-400 w-5 h-5" />} 
          glow="border border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.15)]"
        />
      </div>

      {/* 3. Operational Drill-Downs & Heatmaps */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-10">
        
        {/* Main Drill-Down Chart Area */}
        <div className="lg:col-span-2 space-y-8">
           <div className="glass-panel p-6 rounded-2xl flex flex-col min-h-[400px]">
               <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                 <div>
                   <h3 className="text-lg font-bold text-white tracking-wide mb-3">Unified Portfolio Revenue</h3>
                   <div className="flex flex-wrap gap-2">
                     <button 
                        onClick={() => setSelectedBranchIds([])}
                        className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all ${selectedBranchIds.length === 0 ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300' : 'border-gray-700 text-gray-500 hover:text-gray-300'}`}
                     >
                        Portfolio (All)
                     </button>
                     {branches.map(b => (
                        <button 
                           key={b.id}
                           onClick={() => {
                              if (selectedBranchIds.includes(b.id)) {
                                  setSelectedBranchIds(prev => prev.filter(id => id !== b.id));
                              } else {
                                  setSelectedBranchIds(prev => [...prev, b.id]);
                              }
                           }}
                           className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all ${selectedBranchIds.includes(b.id) ? 'bg-purple-500/20 border-purple-500 text-purple-300 shadow-[0_0_10px_rgba(168,85,247,0.2)]' : 'border-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-200'}`}
                        >
                           {b.name}
                        </button>
                     ))}
                   </div>
                 </div>
                 
                 <div className="flex items-center gap-2 bg-black/40 border border-gray-700 rounded-md px-3 py-1.5 self-start sm:self-auto">
                   <span className="text-xs text-gray-400">From</span>
                   <input type="date" value={startDateStr} onChange={e => setStartDateStr(e.target.value)} className="bg-transparent text-sm focus:outline-none text-white [&::-webkit-calendar-picker-indicator]:filter-[invert(1)]" />
                   <span className="text-xs text-gray-400 ml-2">To</span>
                   <input type="date" value={endDateStr} onChange={e => setEndDateStr(e.target.value)} className="bg-transparent text-sm focus:outline-none text-white [&::-webkit-calendar-picker-indicator]:filter-[invert(1)]" />
                 </div>
               </div>
             
             <div className="flex-grow w-full mt-4 h-[350px]">
                <RevenueChart data={stats.chartData} />
             </div>
           </div>

           <div className="glass-panel p-6 rounded-2xl flex flex-col min-h-[400px]">
             <div className="flex justify-between items-center mb-6">
               <h3 className="text-lg font-bold text-white tracking-wide flex items-center gap-2">
                 <BarChart2 className="w-5 h-5 text-fuchsia-400" /> Top Revenue Drivers (Items & PMS)
               </h3>
             </div>
             <div className="flex-grow w-full h-[300px]">
                <CategoryChart data={stats.categoryBreakdown} />
             </div>
           </div>

           {/* Branch Comparator Arena */}
           {selectedBranchIds.length >= 2 && stats.branchMetrics.length >= 2 && (
              <div className="mt-8 glass-panel p-6 rounded-2xl relative overflow-hidden group border border-purple-500/20 shadow-[0_0_30px_rgba(168,85,247,0.1)]">
                  <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 via-purple-500/5 to-fuchsia-500/10 opacity-70"></div>
                  <h3 className="text-xl font-black text-white tracking-wide flex items-center gap-3 mb-6 relative z-10">
                    <Activity className="w-5 h-5 text-emerald-400" /> Head-To-Head Arena
                  </h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 relative z-10">
                      {stats.branchMetrics.map((competitor, idx) => (
                         <div key={competitor.id} className={`p-5 rounded-xl border ${idx === 0 ? 'border-emerald-500/50 bg-emerald-500/10 shadow-[0_0_20px_rgba(16,185,129,0.15)] transform scale-[1.02]' : 'border-gray-700/80 bg-black/40'}`}>
                             <div className="flex justify-between items-start mb-4">
                                <h4 className={`font-bold ${idx === 0 ? 'text-emerald-400 text-lg' : 'text-gray-300'}`}>{competitor.name}</h4>
                                {idx === 0 && <span className="text-[10px] uppercase tracking-widest bg-emerald-500/20 text-emerald-300 px-2 py-1 rounded font-black border border-emerald-500/30">Winner</span>}
                             </div>
                             <div className="text-3xl font-black text-white tracking-tight">{formatCurrency(competitor.gross)}</div>
                             <div className="flex justify-between mt-4 pb-2 text-xs border-b border-white/5">
                                <span className="text-cyan-400/90 font-semibold tracking-wide flex items-center gap-1">POS <span className="text-white">{formatCurrency(competitor.pos)}</span></span>
                                <span className="text-fuchsia-400/90 font-semibold tracking-wide flex items-center gap-1">PMS <span className="text-white">{formatCurrency(competitor.pms)}</span></span>
                             </div>
                             {idx > 0 && (
                               <div className="mt-3 text-xs font-semibold text-red-400 flex justify-end">
                                  Gap: -{formatCurrency(stats.branchMetrics[0].gross - competitor.gross)}
                               </div>
                             )}
                         </div>
                      ))}
                  </div>
              </div>
           )}
        </div>

        {/* Right Rail: Anomalies & Sync Heartbeats */}
        <div className="space-y-8 lg:col-span-1">
           {/* Alerts Module */}
           <div className="glass-panel p-6 rounded-2xl border-l-[3px] border-l-red-500 border-t-red-500/10 border-b-red-500/10 border-r-red-500/10 shadow-[0_4px_30px_rgba(239,68,68,0.15)] block">
              <div className="flex items-center gap-3 mb-4">
                 <AlertTriangle className="w-5 h-5 text-red-500" />
                 <h3 className="text-white font-bold tracking-wide">Critical Alerts</h3>
              </div>
              <ul className="space-y-4">
                <li className="bg-black/30 p-3 rounded-lg border border-red-500/20">
                  <div className="flex justify-between items-start">
                     <span className="text-xs font-bold text-red-400 bg-red-500/10 px-2 py-0.5 rounded-sm">MANUAL_RATIO</span>
                     <span className="text-[10px] text-gray-400">GCT Ops</span>
                  </div>
                  <p className="text-sm text-gray-300 mt-2">Manual adjustments &gt;22% of daily volume.</p>
                </li>
              </ul>
           </div>

           {/* Live Sync Status */}
           <div className="glass-panel p-6 rounded-2xl">
              <h3 className="text-white font-bold tracking-wide mb-4 flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-purple-400" /> Sync Heartbeats
              </h3>
              <ul className="space-y-3">
                 <li className="flex justify-between text-sm">
                   <span className="text-gray-400">Loyverse (Live)</span>
                   <span className="text-emerald-400 font-mono text-xs">Healthy</span>
                 </li>
                 <li className="flex justify-between text-sm">
                   <span className="text-gray-400">eZee PMS (Cron)</span>
                   <span className="text-emerald-400 font-mono text-xs">Updated 1h ago</span>
                 </li>
              </ul>
           </div>
        </div>

      </div>

      {showManualForm && <ManualEntryForm onClose={() => setShowManualForm(false)} />}
    </div>
  );
}

function MetricCard({ 
  title, 
  value, 
  subtitle, 
  icon, 
  alert = false,
  glow = ''
}: { 
  title: string, 
  value: string, 
  subtitle: string, 
  icon: React.ReactNode, 
  alert?: boolean,
  glow?: string
}) {
  return (
    <div className={`glass-panel p-6 rounded-2xl flex flex-col justify-between group transition-all duration-300 hover:-translate-y-1 
      ${alert ? 'border-red-500/50 shadow-[0_0_20px_rgba(239,68,68,0.2)]' : ''} ${glow}`}
    >
      <div className="flex justify-between items-start">
        <h3 className="text-sm font-semibold text-gray-400 tracking-wide">{title}</h3>
        <div className="p-2 bg-white/5 rounded-lg group-hover:bg-white/10 transition-colors">
          {icon}
        </div>
      </div>
      <div className="mt-6">
        <span className={`text-3xl font-extrabold tracking-tight ${alert ? 'text-red-400' : 'text-white'}`}>{value}</span>
      </div>
      <p className={`text-xs mt-2 font-medium ${alert ? 'text-red-400/80' : 'text-gray-500'}`}>{subtitle}</p>
    </div>
  );
}
