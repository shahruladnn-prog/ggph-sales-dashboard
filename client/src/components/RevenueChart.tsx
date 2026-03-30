import React from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export function RevenueChart({ data }: { data: any[] }) {
  if (!data || data.length === 0) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center border-2 border-dashed border-gray-700/50 rounded-xl relative">
        <p className="text-gray-400 font-medium">Accumulating Live Data</p>
        <p className="text-xs text-gray-500 mt-1">Pending sync sequence from POS & PMS.</p>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={350}>
      <AreaChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="colorPos" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.8}/>
            <stop offset="95%" stopColor="#06b6d4" stopOpacity={0}/>
          </linearGradient>
          <linearGradient id="colorPms" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#a855f7" stopOpacity={0.8}/>
            <stop offset="95%" stopColor="#a855f7" stopOpacity={0}/>
          </linearGradient>
        </defs>
        <XAxis dataKey="name" stroke="#52525b" />
        <YAxis stroke="#52525b" />
        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
        <Tooltip 
          contentStyle={{ backgroundColor: '#09090b', borderColor: '#27272a', color: '#fff' }} 
          itemStyle={{ color: '#fff' }}
        />
        <Area type="monotone" dataKey="pos" stroke="#06b6d4" fillOpacity={1} fill="url(#colorPos)" />
        <Area type="monotone" dataKey="pms" stroke="#a855f7" fillOpacity={1} fill="url(#colorPms)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}
