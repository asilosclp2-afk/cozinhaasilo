import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Clock, CheckCircle2, Play, ChefHat, AlertCircle } from 'lucide-react';
import { Order } from '../types';
import OrderTimer from '../components/OrderTimer';
import { firebaseService } from '../services/firebaseService';
import { audioService } from '../services/audioService';

export default function Kitchen({ orders }: { orders: Order[] }) {
  const [, setTick] = useState(0);
  const [scanBuffer, setScanBuffer] = useState<string>('');
  const lastKeyTime = useRef<number>(0);
  
  const pendingOrders = orders.filter(o => o.status === 'pending' || o.status === 'preparing');

  // Group items by product name
  const groupedItems = pendingOrders.reduce((acc, order) => {
    order.items.forEach(item => {
      if (!item.completed) {
        if (!acc[item.name]) {
          acc[item.name] = {
            name: item.name,
            total: 0,
            tickets: []
          };
        }
        acc[item.name].total += item.quantity;
        // Keep only unique ticket numbers for the display
        if (!acc[item.name].tickets.includes(order.ticket_number)) {
          acc[item.name].tickets.push(order.ticket_number);
        }
      }
    });
    return acc;
  }, {} as Record<string, { name: string, total: number, tickets: string[] }>);

  const productList = Object.values(groupedItems);

  // Keyboard Scanner Logic (for physical USB scanners and numeric keypads)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT') return;

      const currentTime = Date.now();
      // Increase timeout for manual typing (from 50ms to 2000ms)
      if (currentTime - lastKeyTime.current > 2000) {
        setScanBuffer('');
      }
      lastKeyTime.current = currentTime;

      if (e.key === 'Enter') {
        const code = scanBuffer.trim();
        if (code) {
          processScannedCode(code);
        }
        setScanBuffer('');
      } else if (e.key.length === 1 && /[0-9]/.test(e.key)) {
        setScanBuffer(prev => prev + e.key);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [orders, scanBuffer]);

  const processScannedCode = async (code: string) => {
    const rawCleaned = code.trim();
    if (!rawCleaned) return;
    
    const cleaned = await firebaseService.resolveFicha(rawCleaned);
    console.log('Kitchen: Scanned code resolved to:', cleaned);
    
    // Find order by ticket number in ALL orders to allow transition from ready to delivered
    const order = orders.find(o => {
      const ticket = String(o.ticket_number).trim();
      if (ticket === cleaned) return true;
      
      const numTicket = parseInt(ticket);
      const numCleaned = parseInt(cleaned);
      return !isNaN(numTicket) && !isNaN(numCleaned) && numTicket === numCleaned;
    });

    if (order) {
      if (order.status === 'pending' || order.status === 'preparing') {
        console.log('Kitchen: Marking order as READY:', order.id);
        updateStatus(order.id, 'ready');
        audioService.playExternalReadySound();
      } else if (order.status === 'ready') {
        console.log('Kitchen: Marking order as DELIVERED (removing from display):', order.id);
        updateStatus(order.id, 'delivered');
        audioService.playKitchenSuccessDelivered();
      }
    } else {
      console.warn('Kitchen: No active order found for ticket:', cleaned);
    }
  };

  useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 60000);
    return () => clearInterval(timer);
  }, []);

  const count = productList.length;

  // Dynamic grid and sizing logic
  const getGridCols = () => {
    if (count <= 4) return 'grid-cols-1 md:grid-cols-2';
    if (count <= 9) return 'grid-cols-2 lg:grid-cols-3';
    return 'grid-cols-3 xl:grid-cols-4';
  };

  const getCardStyles = () => {
    if (count <= 6) return { 
      card: 'p-8 rounded-[2.5rem] border-4', 
      title: 'text-5xl font-black mb-4',
      ticketList: 'text-3xl font-bold bg-orange-50 p-4 rounded-2xl',
      badge: 'px-4 py-2 text-xl'
    };
    return { 
      card: 'p-6 rounded-3xl border-2', 
      title: 'text-3xl font-black mb-2',
      ticketList: 'text-xl font-bold bg-orange-50 p-3 rounded-xl',
      badge: 'px-3 py-1 text-sm'
    };
  };

  const s = getCardStyles();

  const updateStatus = async (id: string, status: Order['status']) => {
    try {
      await firebaseService.updateOrderStatus(id, status);
    } catch (error) {
      console.error('Error updating order:', error);
    }
  };

  return (
    <div className="max-w-7xl mx-auto">
      <header className="mb-8 flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-black tracking-tight text-[#5A5A40] uppercase italic">Produção</h1>
          <p className="text-gray-500 font-medium">Itens em preparação • Agrupados por Produto</p>
        </div>
        <div className="flex gap-4 items-center">
          {scanBuffer && (
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-black text-white px-4 py-2 rounded-xl border-2 border-orange-500 flex items-center gap-2"
            >
              <span className="text-orange-500 font-black">#</span>
              <span className="text-2xl font-black tabular-nums">{scanBuffer}</span>
            </motion.div>
          )}
          <div className="hidden md:flex items-center gap-2 px-4 py-2 bg-gray-100 rounded-full text-xs font-bold text-gray-400">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            LEITOR DE CÓDIGO ATIVO
          </div>
          <div className="bg-white px-6 py-3 rounded-2xl border border-black/5 flex items-center gap-3">
            <div className="w-3 h-3 bg-orange-400 rounded-full animate-pulse" />
            <span className="font-black text-lg text-gray-700">{pendingOrders.length} PEDIDOS</span>
          </div>
        </div>
      </header>

      <div className={`grid gap-6 ${getGridCols()}`}>
        <AnimatePresence mode="popLayout">
          {productList.map(item => (
            <motion.div
              layout
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              key={item.name}
              className={`bg-white shadow-xl border-orange-200 flex flex-col ${s.card}`}
            >
              <div className="flex flex-col mb-2">
                <h2 className={`${s.title} text-gray-900 leading-none tracking-tight flex flex-wrap items-baseline gap-x-2`}>
                  <span>{item.name}</span>
                  <span className="text-orange-600 opacity-90">
                    {item.tickets.map(t => `#${t}`).join('')}
                  </span>
                </h2>
              </div>
              
              {item.total > 1 && (
                <div className="mt-auto pt-2 border-t border-orange-50">
                  <span className="text-sm font-black text-gray-400 tracking-widest uppercase">Total: {item.total} un</span>
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {productList.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <ChefHat className="w-16 h-16 mb-4 opacity-20" />
          <p className="text-xl italic">Cozinha livre. Nenhum produto pendente!</p>
        </div>
      )}
    </div>
  );
}
