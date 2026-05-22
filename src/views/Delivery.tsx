import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, Truck, UserCheck } from 'lucide-react';
import { Order } from '../types';
import OrderTimer from '../components/OrderTimer';
import { firebaseService } from '../services/firebaseService';

export default function Delivery({ orders }: { orders: Order[] }) {
  const readyOrders = orders.filter(o => o.status === 'ready');
  const scanBuffer = useRef<string>('');
  const lastKeyTime = useRef<number>(0);

  // Keyboard Scanner Logic (for physical USB scanners)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input
      if (document.activeElement?.tagName === 'INPUT') return;

      const currentTime = Date.now();
      
      // If more than 50ms passed, it's likely a new scan or manual typing
      if (currentTime - lastKeyTime.current > 50) {
        scanBuffer.current = '';
      }
      
      lastKeyTime.current = currentTime;

      if (e.key === 'Enter') {
        const code = scanBuffer.current.trim();
        if (code) {
          processScannedCode(code);
        }
        scanBuffer.current = '';
      } else if (e.key.length === 1) {
        scanBuffer.current += e.key;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [orders]);

  const processScannedCode = async (code: string) => {
    const cleaned = code.trim();
    if (!cleaned) return;

    const ficha = await firebaseService.resolveFicha(cleaned);
    
    // Find ANY active order by ticket number (status not delivered)
    const order = orders.find(o => String(o.ticket_number).trim() === ficha && o.status !== 'delivered');
    if (order) {
      deliverOrder(order.id);
    }
  };

  const deliverOrder = async (id: string) => {
    try {
      await firebaseService.updateOrderStatus(id, 'delivered');
    } catch (err) {
      console.error('Error delivering order:', err);
    }
  };

  const toggleItem = async (orderId: string, index: number) => {
    try {
      await firebaseService.toggleOrderItem(orderId, index);
    } catch (err) {
      console.error('Error updating item:', err);
    }
  };

  return (
    <div className="max-w-5xl mx-auto">
      <header className="mb-8">
        <h1 className="text-4xl font-serif italic text-[#5A5A40]">Expedição</h1>
        <p className="text-gray-500">Entregar pedidos prontos aos clientes</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <AnimatePresence mode="popLayout">
          {readyOrders.map(order => (
            <motion.div
              layout
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              key={order.id}
              className="bg-white rounded-3xl shadow-sm border border-green-100 overflow-hidden flex"
            >
              <div className="bg-green-500 w-32 flex flex-col items-center justify-center text-white p-4">
                <span className="text-[10px] uppercase font-bold opacity-60">Sistema {order.id}</span>
                <span className="text-[10px] uppercase font-bold opacity-80 mt-1">Ficha</span>
                <span className={`font-black text-center px-2 leading-tight ${
                  order.ticket_number.length > 8 ? 'text-base' : order.ticket_number.length > 4 ? 'text-xl' : 'text-3xl'
                }`}>
                  {order.ticket_number}
                </span>
                <OrderTimer 
                  startTime={order.created_at} 
                  variant="badge"
                  className="mt-2"
                />
              </div>
              
              <div className="flex-1 p-6 flex flex-col">
                <div className="flex-1">
                  <h3 className="text-xs uppercase font-bold text-gray-400 mb-2">Itens do Pedido</h3>
                  <ul className="space-y-1">
                    {order.items.map((item, i) => (
                      <li 
                        key={i} 
                        onClick={() => toggleItem(order.id, i)}
                        className={`font-bold text-lg cursor-pointer select-none flex items-center gap-2 ${item.completed ? 'text-green-600' : 'text-gray-800'}`}
                      >
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                          item.completed ? 'bg-green-500 border-green-500' : 'border-gray-300'
                        }`}>
                          {item.completed && <CheckCircle2 className="w-3 h-3 text-white" />}
                        </div>
                        {item.quantity > 1 && <span className="text-green-600 mr-2">{item.quantity}x</span>}
                        {item.name}
                      </li>
                    ))}
                  </ul>
                </div>

                <button
                  onClick={() => deliverOrder(order.id)}
                  className="mt-6 w-full py-4 bg-[#151619] text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-black transition-all shadow-lg"
                >
                  <UserCheck className="w-5 h-5" />
                  Confirmar Entrega
                </button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {readyOrders.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-4">
            <Truck className="w-10 h-10 opacity-20" />
          </div>
          <p className="text-xl italic">Nenhum pedido pronto para entrega no momento.</p>
        </div>
      )}
    </div>
  );
}
