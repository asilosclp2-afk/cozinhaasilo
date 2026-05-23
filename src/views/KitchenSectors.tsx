import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Bell, Flame, Utensils, Star, Package } from 'lucide-react';
import { Order } from '../types';
import { firebaseService } from '../services/firebaseService';

export default function KitchenSectors({ orders }: { orders: Order[] }) {
  const [lastItemCount, setLastItemCount] = useState(0);
  const [showNotification, setShowNotification] = useState(false);
  const [scanBuffer, setScanBuffer] = useState<string>('');
  const [manualInput, setManualInput] = useState<string>('');
  const lastKeyTime = useRef<number>(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Distinct sound for kitchen (Bubble Pop)
  const audioRef = useRef(new Audio('https://assets.mixkit.co/active_storage/sfx/2847/2847-preview.mp3'));

  const pendingOrders = orders.filter(o => o.status === 'pending' || o.status === 'preparing');

  // Auto-focus input on mount and periodically
  useEffect(() => {
    const interval = setInterval(() => {
      if (document.activeElement?.tagName !== 'INPUT') {
        inputRef.current?.focus();
      }
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const processScannedCode = async (code: string) => {
    const cleaned = code.trim();
    if (!cleaned) return;
    
    // Resolve ficha (handles numeric input and extra ficha aliases)
    const ficha = await firebaseService.resolveFicha(cleaned);
    
    // Find order by resolved ticket number
    const order = orders.find(o => {
      const t = String(o.ticket_number).trim();
      if (t === ficha) return true;
      const nt = parseInt(t, 10);
      const nf = parseInt(ficha, 10);
      return !isNaN(nt) && !isNaN(nf) && nt === nf;
    });

    if (order) {
      if (order.status === 'pending' || order.status === 'preparing') {
        // Immediate update instead of queue
        updateStatus(order.id, 'ready');
        try {
          const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2019/2019-preview.mp3');
          audio.volume = 1.0; // Max volume for kitchen loudness
          audio.play().catch(() => {});
        } catch (e) {}
      } else if (order.status === 'ready') {
        // Second scan (if already ready): mark as delivered (clear ficha)
        updateStatus(order.id, 'delivered');
        try {
          const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/1435/1435-preview.mp3');
          audio.volume = 1.0; // Max volume for kitchen loudness
          audio.play().catch(() => {});
        } catch (e) {}
      }
    } else {
      // If no order found, maybe check if there's any active for this ficha in other statuses
      console.warn(`Nenhum pedido ativo encontrado para a ficha: ${ficha}`);
      // Visual feedback for not found
      setManualInput('');
    }
    setManualInput('');
  };

  const handleManualInput = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualInput) {
      processScannedCode(manualInput);
    }
  };

  const updateStatus = async (id: string, status: Order['status']) => {
    try {
      await firebaseService.updateOrderStatus(id, status);
    } catch (error) {
      console.error('Error updating order:', error);
    }
  };

  // Group items by name and sector
  const getGroupedItems = () => {
    const groups: Record<string, { name: string, quantity: number, sector: string, tickets: string[] }> = {};
    pendingOrders.forEach(order => {
      order.items.forEach((item: any) => {
        if (!item.completed) {
          const key = item.name;
          if (!groups[key]) {
            groups[key] = { 
              name: item.name, 
              quantity: 0, 
              sector: item.sector || 'Outros',
              tickets: []
            };
          }
          groups[key].quantity += item.quantity;
          if (!groups[key].tickets.includes(order.ticket_number)) {
            groups[key].tickets.push(order.ticket_number);
          }
        }
      });
    });
    return Object.values(groups);
  };

  const groupedItems = getGroupedItems();
  const totalPendingItems = groupedItems.reduce((acc, item) => acc + item.quantity, 0);

  const sectors = [
    { id: 'Fritadeira', label: 'Fritadeira', icon: <Flame className="w-6 h-6 text-orange-500" />, color: 'border-orange-500', bg: 'bg-orange-50/30' },
    { id: 'Lanches', label: 'Lanches', icon: <Utensils className="w-6 h-6 text-blue-500" />, color: 'border-blue-500', bg: 'bg-blue-50/30' },
    { id: 'Outros', label: 'Outros', icon: <Star className="w-6 h-6 text-purple-500" />, color: 'border-purple-500', bg: 'bg-purple-50/30' },
  ];

  const getItemsForSector = (sectorId: string) => {
    if (sectorId === 'Outros') {
      // Include items with 'Outros' or any sector NOT in the defined list
      const definedSectorIds = sectors.filter(s => s.id !== 'Outros').map(s => s.id);
      return groupedItems.filter(i => i.sector === 'Outros' || !definedSectorIds.includes(i.sector));
    }
    return groupedItems.filter(i => i.sector === sectorId);
  };

  return (
    <div className="fixed inset-0 pl-20 bg-[#F5F5F0] flex flex-col overflow-hidden">
      <style>{`
        @keyframes blink {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.8; transform: scale(1.02); background-color: #ef4444; }
        }
        .animate-blink {
          animation: blink 0.6s infinite;
        }
      `}</style>

      <header className="p-4 flex justify-between items-center bg-white border-b border-black/5 shadow-sm z-10">
        <div className="flex items-center gap-12">
          <div>
            <h1 className="text-3xl font-serif italic text-[#5A5A40]">Monitor de Produção</h1>
            <p className="text-gray-500 font-bold uppercase tracking-widest text-[10px]">Consolidado por Setor</p>
          </div>

          <form onSubmit={handleManualInput} className="flex items-center">
            <div className="bg-[#1A1A1A] text-white px-6 py-3 rounded-2xl border-2 border-orange-500 shadow-2xl flex items-center gap-4 transition-all hover:scale-[1.02]">
              <span className="text-orange-500 font-black text-3xl">#</span>
              <input
                ref={inputRef}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={manualInput}
                onChange={(e) => setManualInput(e.target.value)}
                placeholder="---"
                className="bg-transparent border-none focus:ring-0 text-4xl font-black tabular-nums w-24 p-0 placeholder:text-gray-700"
                autoFocus
              />
              <button type="submit" className="hidden">Enter</button>
            </div>
            <p className="ml-4 text-[10px] font-bold text-gray-400 uppercase w-24 leading-tight">
              Digite e Enter para alternar status
            </p>
          </form>
        </div>

        <AnimatePresence>
          {showNotification && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8, x: 50 }}
              animate={{ opacity: 1, scale: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="bg-red-600 text-white px-6 py-3 rounded-xl shadow-2xl flex items-center gap-3 border-4 border-white animate-blink"
            >
              <Bell className="w-6 h-6" />
              <div className="flex flex-col">
                <span className="font-black text-xl uppercase tracking-tighter leading-none">Novo Item!</span>
                <span className="text-[10px] font-bold opacity-80 uppercase">Verifique a fila</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      <div className="flex-1 grid grid-cols-3 gap-3 p-3 overflow-hidden">
        {sectors.map(sector => {
          const items = getItemsForSector(sector.id);
          
          return (
            <div key={sector.id} className="bg-white rounded-[32px] shadow-lg border border-black/5 flex flex-col overflow-hidden">
              <div className={`p-5 border-b-4 ${sector.color} ${sector.bg} flex justify-between items-center`}>
                <div className="flex items-center gap-3">
                  {sector.icon}
                  <h2 className="text-xl font-black uppercase tracking-tighter text-[#1A1A1A]">{sector.label}</h2>
                </div>
                <div className="bg-white w-10 h-10 rounded-xl flex items-center justify-center shadow-md border border-black/5">
                  <span className="text-lg font-black text-[#5A5A40]">
                    {items.reduce((acc, i) => acc + i.quantity, 0)}
                  </span>
                </div>
              </div>

              <div className="flex-1 p-4 space-y-2 overflow-y-auto">
                <AnimatePresence mode="popLayout">
                  {items.length > 0 ? (
                    items.map(item => (
                      <motion.div
                        layout
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        key={item.name}
                        className="flex items-center justify-between p-3 bg-[#F5F5F0] rounded-xl border border-black/5"
                      >
                        <div className="flex flex-col flex-1 truncate pr-2">
                          <span className="text-lg font-bold text-[#1A1A1A] leading-tight">{item.name}</span>
                          <span className="text-orange-600 font-black text-sm tracking-tight">{item.tickets.map(t => `#${t}`).join('')}</span>
                        </div>
                        <span className="text-2xl font-black text-[#5A5A40] bg-white min-w-[45px] h-[45px] rounded-lg flex items-center justify-center shadow-inner border border-black/5">
                          {item.quantity}
                        </span>
                      </motion.div>
                    ))
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center opacity-10 py-10">
                      <Package className="w-20 h-20 mb-2" />
                      <p className="font-black uppercase tracking-[0.2em] text-xs">Limpo</p>
                    </div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          );
        })}
      </div>

    </div>
  );
}
