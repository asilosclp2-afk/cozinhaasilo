import React, { useEffect, useState } from 'react';
import { TrendingUp, Clock, DollarSign, AlertCircle, ShoppingBag, BarChart3, RefreshCw } from 'lucide-react';
import { motion } from 'motion/react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from 'recharts';

import { firebaseService } from '../services/firebaseService';

export default function FullDashboard() {
  const [data, setData] = useState<any>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchData = async () => {
    if (document.hidden) return;
    
    setIsRefreshing(true);
    try {
      const dashboardData = await firebaseService.getFinancialSummary();
      if (dashboardData) {
        setData(dashboardData);
      }
    } catch (err: any) {
      console.error("Dashboard fetch error:", err.message);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 180000); // 180 seconds (3 minutes)
    return () => clearInterval(interval);
  }, []);

  if (!data) return null;

  const chartData = Object.entries(data.hourlyBreakdown).map(([hour, count]) => ({
    hour: `${hour}h`,
    count
  }));

  const COLORS = ['#5A5A40', '#8E9299', '#151619', '#E6E6E6', '#F27D26'];

  return (
    <motion.div 
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-12 space-y-6"
    >
      <div className="flex justify-between items-center">
        <h2 className="text-xs uppercase tracking-widest font-bold text-gray-400">Dashboard em Tempo Real</h2>
        <button 
          onClick={fetchData}
          disabled={isRefreshing}
          className="p-2 text-gray-400 hover:text-[#5A5A40] transition-colors disabled:opacity-50"
          title="Atualizar dados"
        >
          <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-[#151619] text-white p-6 rounded-3xl shadow-lg border border-white/10 flex items-center gap-4">
          <div className="p-3 bg-white/10 rounded-2xl">
            <ShoppingBag className="w-6 h-6 text-green-400" />
          </div>
          <div>
            <p className="text-xs uppercase font-bold text-gray-400">Total Pedidos</p>
            <h3 className="text-3xl font-bold">{data.totalOrders}</h3>
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl shadow-sm border border-black/5 flex items-center gap-4">
          <div className="p-3 bg-blue-50 rounded-2xl">
            <Clock className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <p className="text-xs uppercase font-bold text-gray-400">Pico de Vendas</p>
            <h3 className="text-3xl font-bold text-[#1A1A1A]">
              {data.peakHour !== null ? `${data.peakHour}h` : '-'}
            </h3>
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl shadow-sm border border-black/5 flex items-center gap-4">
          <div className="p-3 bg-purple-50 rounded-2xl">
            <BarChart3 className="w-6 h-6 text-purple-600" />
          </div>
          <div>
            <p className="text-xs uppercase font-bold text-gray-400">Itens Vendidos</p>
            <h3 className="text-3xl font-bold text-[#1A1A1A]">
              {data.items.reduce((acc: number, item: any) => acc + item.count, 0)}
            </h3>
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl shadow-sm border border-black/5 flex items-center gap-4">
          <div className="p-3 bg-orange-50 rounded-2xl">
            <AlertCircle className="w-6 h-6 text-orange-600" />
          </div>
          <div>
            <p className="text-xs uppercase font-bold text-gray-400">Top Item</p>
            <h3 className="text-xl font-bold text-[#1A1A1A] truncate max-w-[140px]" title={data.items[0]?.name}>
              {data.items[0]?.name || '-'}
            </h3>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white p-8 rounded-[32px] shadow-sm border border-black/5">
          <h3 className="text-sm font-bold uppercase text-gray-400 mb-6">Fluxo de Pedidos por Hora</h3>
          <div className="h-[250px] w-full min-w-0">
            <ResponsiveContainer width="100%" height={250} minWidth={0}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F0F0F0" />
                <XAxis dataKey="hour" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#9CA3AF' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#9CA3AF' }} />
                <Tooltip 
                  contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  cursor={{ fill: '#F5F5F0' }}
                />
                <Bar dataKey="count" fill="#5A5A40" radius={[4, 4, 0, 0]} barSize={30} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-8 rounded-[32px] shadow-sm border border-black/5">
          <h3 className="text-sm font-bold uppercase text-gray-400 mb-6">Top 5 Itens</h3>
          <div className="space-y-4">
            {data.items.slice(0, 5).map((item: any, index: number) => (
              <div key={item.name} className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-[#F5F5F0] flex items-center justify-center text-xs font-bold text-[#5A5A40]">
                  {index + 1}
                </div>
                <div className="flex-1">
                  <div className="flex justify-between mb-1">
                    <span className="text-sm font-medium">{item.name}</span>
                    <span className="text-sm font-bold">{item.count}</span>
                  </div>
                  <div className="w-full bg-[#F5F5F0] rounded-full h-1.5 overflow-hidden">
                    <div 
                      className="bg-[#5A5A40] h-full rounded-full"
                      style={{ width: `${(item.count / data.items[0].count) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
            {data.items.length === 0 && (
              <p className="text-center py-12 text-gray-400 italic">Sem dados de vendas hoje.</p>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
