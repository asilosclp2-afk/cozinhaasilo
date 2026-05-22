import React, { useEffect, useState } from 'react';
import { TrendingUp, Clock, DollarSign, AlertCircle } from 'lucide-react';
import { motion } from 'motion/react';

import { firebaseService } from '../services/firebaseService';

export default function MiniDashboard() {
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    const fetchData = async () => {
      if (document.hidden) return;
      
      try {
        const dashboardData = await firebaseService.getFinancialSummary();
        if (dashboardData) {
          setData(dashboardData);
        }
      } catch (err: any) {
        console.error("Dashboard fetch error:", err.message);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 120000);
    return () => clearInterval(interval);
  }, []);

  if (!data) return null;

  return (
    <motion.div 
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-8 grid grid-cols-1 md:grid-cols-4 gap-4"
    >
      <div className="bg-[#151619] text-white p-4 rounded-2xl shadow-lg border border-white/10 flex items-center gap-4">
        <div className="p-3 bg-white/10 rounded-xl">
          <TrendingUp className="w-5 h-5 text-green-400" />
        </div>
        <div>
          <p className="text-[10px] uppercase font-bold text-gray-400">Total Pedidos</p>
          <h3 className="text-2xl font-bold">{data.totalOrders}</h3>
        </div>
      </div>

      <div className="bg-white p-4 rounded-2xl shadow-sm border border-black/5 flex items-center gap-4">
        <div className="p-3 bg-blue-50 rounded-xl">
          <Clock className="w-5 h-5 text-blue-600" />
        </div>
        <div>
          <p className="text-[10px] uppercase font-bold text-gray-400">Pico de Vendas</p>
          <h3 className="text-2xl font-bold text-[#1A1A1A]">
            {data.peakHour !== null ? `${data.peakHour}h` : '-'}
          </h3>
        </div>
      </div>

      <div className="bg-white p-4 rounded-2xl shadow-sm border border-black/5 flex items-center gap-4">
        <div className="p-3 bg-purple-50 rounded-xl">
          <DollarSign className="w-5 h-5 text-purple-600" />
        </div>
        <div>
          <p className="text-[10px] uppercase font-bold text-gray-400">Itens Vendidos</p>
          <h3 className="text-2xl font-bold text-[#1A1A1A]">
            {data.items.reduce((acc: number, item: any) => acc + item.count, 0)}
          </h3>
        </div>
      </div>

      <div className="bg-white p-4 rounded-2xl shadow-sm border border-black/5 flex items-center gap-4">
        <div className="p-3 bg-orange-50 rounded-xl">
          <AlertCircle className="w-5 h-5 text-orange-600" />
        </div>
        <div>
          <p className="text-[10px] uppercase font-bold text-gray-400">Top Item</p>
          <h3 className="text-lg font-bold text-[#1A1A1A] truncate max-w-[120px]" title={data.items[0]?.name}>
            {data.items[0]?.name || '-'}
          </h3>
        </div>
      </div>
    </motion.div>
  );
}
