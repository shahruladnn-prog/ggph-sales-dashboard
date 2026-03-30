import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { format, eachDayOfInterval } from 'date-fns';

export interface CategoryBreakdown {
  name: string;
  value: number;
}

export interface BranchMetric {
  id: string;
  name: string;
  gross: number;
  pos: number;
  pms: number;
}

export interface DashboardStats {
  totalGross: number;
  totalPos: number;
  totalPms: number;
  adr: number;
  chartData: any[];
  categoryBreakdown: CategoryBreakdown[];
  branchMetrics: BranchMetric[];
  isLoading: boolean;
  error: string | null;
}

export function useDashboardStats({ 
  startDate, 
  endDate, 
  selectedBranchIds,
  allBranches
}: { 
  startDate: Date, 
  endDate: Date, 
  selectedBranchIds: string[],
  allBranches: {id: string, name: string}[]
}) {
  const [stats, setStats] = useState<DashboardStats>({
    totalGross: 0,
    totalPos: 0,
    totalPms: 0,
    adr: 0,
    chartData: [],
    categoryBreakdown: [],
    branchMetrics: [],
    isLoading: true,
    error: null,
  });

  useEffect(() => {
    async function fetchStats() {
      try {
        setStats(s => ({ ...s, isLoading: true, error: null }));
        
        let query = supabase
          .from('unified_revenue')
          .select('source, transaction_date, gross_amount, category, raw_payload, branch_id')
          .gte('transaction_date', startDate.toISOString())
          .lte('transaction_date', endDate.toISOString())
          .order('transaction_date', { ascending: true });

        // Optimize payload by filtering directly on the database array
        if (selectedBranchIds.length > 0) {
            query = query.in('branch_id', selectedBranchIds);
        }

        const { data: revenueData, error } = await query;

        if (error) throw error;

        let totalGross = 0;
        let totalPos = 0;
        let totalPms = 0;

        // Group data by day for the main chart
        const dailyMap = new Map<string, { name: string, pos: number, pms: number }>();
        const days = eachDayOfInterval({ start: startDate, end: endDate });
        
        days.forEach(day => {
            const dateStr = format(day, 'MMM dd');
            dailyMap.set(dateStr, { name: dateStr, pos: 0, pms: 0 });
        });

        // Group data by Category for the pie chart
        const categoryMap = new Map<string, number>();
        const roomRevenueList: number[] = [];

        // Group Branch Specific Data Comparison
        const branchMap = new Map<string, BranchMetric>();

        (revenueData || []).forEach((row) => {
          const amt = Number(row.gross_amount);
          totalGross += amt;
          
          // Allocate to specific branch
          if (row.branch_id) {
             if (!branchMap.has(row.branch_id)) {
                 const bName = allBranches.find(b => b.id === row.branch_id)?.name || 'Unknown Branch';
                 branchMap.set(row.branch_id, { id: row.branch_id, name: bName, gross: 0, pos: 0, pms: 0 });
             }
             const bData = branchMap.get(row.branch_id)!;
             bData.gross += amt;
             if (row.source === 'LOYVERSE') bData.pos += amt;
             if (row.source === 'EZEE') bData.pms += amt;
          }

          if (row.source === 'LOYVERSE') {
              totalPos += amt;
              // Extract items natively from JSON raw_payload
              if (row.raw_payload && Array.isArray(row.raw_payload.line_items)) {
                  row.raw_payload.line_items.forEach((item: any) => {
                      const itemName = item.item_name || 'POS Misc';
                      const itemRev = Number(item.gross_total_money || item.total_money || 0);
                      categoryMap.set(itemName, (categoryMap.get(itemName) || 0) + itemRev);
                  });
              } else {
                  categoryMap.set('Ungrouped POS Sales', (categoryMap.get('Ungrouped POS Sales') || 0) + amt);
              }
          }

          if (row.source === 'EZEE') {
              totalPms += amt;
              const pmsCat = `PMS: ${row.category || 'Rooms'}`;
              categoryMap.set(pmsCat, (categoryMap.get(pmsCat) || 0) + amt);
              roomRevenueList.push(amt);
          }

          // Assign to daily chart array
          const dayName = format(new Date(row.transaction_date), 'MMM dd');
          if (dailyMap.has(dayName)) {
             const dayData = dailyMap.get(dayName)!;
             if (row.source === 'LOYVERSE') dayData.pos += amt;
             if (row.source === 'EZEE') dayData.pms += amt;
          }
        });

        const adr = roomRevenueList.length ? roomRevenueList.reduce((a,b)=>a+b, 0) / roomRevenueList.length : 0;
        
        // Format category map to an array and sort descending
        let categoryBreakdown = Array.from(categoryMap.entries())
            .map(([name, value]) => ({ name, value }))
            .sort((a,b) => b.value - a.value);

        // Group tail into "Other" so pie chart remains legible
        if (categoryBreakdown.length > 8) {
             const top = categoryBreakdown.slice(0, 8);
             const others = categoryBreakdown.slice(8).reduce((acc, curr) => acc + curr.value, 0);
             if (others > 0) {
                 top.push({ name: 'Other Items', value: others });
             }
             categoryBreakdown = top;
        }

        // Output final branch scoreboard sorted by highest grossing
        const branchMetrics = Array.from(branchMap.values()).sort((a,b) => b.gross - a.gross);

        setStats({
          totalGross,
          totalPos,
          totalPms,
          adr,
          chartData: Array.from(dailyMap.values()),
          categoryBreakdown,
          branchMetrics,
          isLoading: false,
          error: null
        });

      } catch (err: any) {
        console.error('Failed to pull dashboard stats:', err);
        setStats(s => ({ ...s, isLoading: false, error: err.message }));
      }
    }

    fetchStats();
  }, [startDate, endDate, selectedBranchIds, allBranches]);

  return stats;
}
