import React, { useEffect, useState } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  AreaChart, Area 
} from 'recharts';
import { FileText, TrendingUp, DollarSign, Clock } from 'lucide-react';
import { Order } from '../types';
import { firebaseService } from '../services/firebaseService';

export default function AdminDashboard() {
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const dashboardData = await firebaseService.getFinancialSummary();
        setData(dashboardData);
      } catch (err: any) {
        console.error('Error fetching dashboard data:', err.message);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-96">
        <div className="w-8 h-8 border-4 border-[#5A5A40] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const hourlyData = Object.entries(data.hourlyBreakdown || {}).map(([hour, count]) => ({
    hour: `${hour}h`,
    count
  }));

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      <header className="flex justify-between items-start">
        <div>
          <h1 className="text-4xl font-serif italic text-[#5A5A40]">Dashboard</h1>
          <p className="text-gray-500">Visão geral do negócio</p>
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={async () => {
              if (confirm('Deseja realmente ZERAR todos os pedidos pendentes e prontos da cozinha? Isso não apagará o histórico de vendas.')) {
                try {
                  await firebaseService.clearRecentOrders();
                  alert('Produção zerada com sucesso!');
                  window.location.reload();
                } catch (err) {
                  alert('Erro ao zerar produção');
                }
              }
            }}
            className="px-6 py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 flex items-center gap-2 shadow-lg"
          >
            Zerar Produção
          </button>
          <button 
            onClick={() => window.print()}
            className="px-6 py-3 bg-[#151619] text-white rounded-xl font-bold hover:bg-black flex items-center gap-2 shadow-lg"
          >
            <FileText className="w-4 h-4" />
            Imprimir Relatório
          </button>
        </div>
      </header>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-black/5">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 bg-emerald-50 rounded-xl">
              <DollarSign className="w-6 h-6 text-emerald-600" />
            </div>
            <div>
              <p className="text-xs uppercase font-bold text-gray-400">Receita Total</p>
              <h3 className="text-3xl font-bold text-[#1A1A1A]">
                R$ {data.totalRevenue?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </h3>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl shadow-sm border border-black/5">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 bg-blue-50 rounded-xl">
              <Clock className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <p className="text-xs uppercase font-bold text-gray-400">Ticket Médio</p>
              <h3 className="text-3xl font-bold text-[#1A1A1A]">
                R$ {(data.totalRevenue / (data.totalOrders || 1)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </h3>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl shadow-sm border border-black/5">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 bg-purple-50 rounded-xl">
              <TrendingUp className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <p className="text-xs uppercase font-bold text-gray-400">Itens Vendidos</p>
              <h3 className="text-3xl font-bold text-[#1A1A1A]">
                {data.items.reduce((acc: number, item: any) => acc + item.count, 0)}
              </h3>
            </div>
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Top Items by Revenue Chart */}
        <div className="bg-white p-8 rounded-3xl shadow-sm border border-black/5 flex flex-col">
          <h3 className="text-xl font-bold text-[#1A1A1A] mb-6">Receita por Item</h3>
          <div className="w-full h-[400px] min-h-[400px] min-w-0">
            <ResponsiveContainer width="100%" height={400} minWidth={0}>
              <BarChart 
                data={data.items.sort((a: any, b: any) => b.total - a.total).slice(0, 10)} 
                layout="vertical" 
                margin={{ left: 20, right: 20 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E5E7EB" />
                <XAxis type="number" hide />
                <YAxis 
                  dataKey="name" 
                  type="category" 
                  width={120} 
                  tick={{ fontSize: 12, fill: '#6B7280' }} 
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip 
                  cursor={{ fill: '#F3F4F6' }}
                  formatter={(value: number) => `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                />
                <Bar dataKey="total" fill="#10B981" radius={[0, 4, 4, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Hourly Sales Chart */}
        <div className="bg-white p-8 rounded-3xl shadow-sm border border-black/5 flex flex-col">
          <h3 className="text-xl font-bold text-[#1A1A1A] mb-6">Vendas por Horário</h3>
          <div className="w-full h-[400px] min-h-[400px] min-w-0">
            <ResponsiveContainer width="100%" height={400} minWidth={0}>
              <AreaChart data={hourlyData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#5A5A40" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#5A5A40" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                <XAxis 
                  dataKey="hour" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 12, fill: '#6B7280' }} 
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 12, fill: '#6B7280' }} 
                />
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                />
                <Area 
                  type="monotone" 
                  dataKey="count" 
                  stroke="#5A5A40" 
                  fillOpacity={1} 
                  fill="url(#colorCount)" 
                  strokeWidth={3}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
