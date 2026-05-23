import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Truck, QrCode, Hash, CheckCircle2, AlertCircle, Wifi } from 'lucide-react';
import { Order } from '../types';
import { firebaseService } from '../services/firebaseService';

export default function DispatchStation({ orders }: { orders: Order[] }) {
  const [scanBuffer, setScanBuffer] = useState<string>('');
  const [lastProcessed, setLastProcessed] = useState<{ ticket: string, status: string, success: boolean } | null>(null);
  const lastKeyTime = useRef<number>(0);
  
  // Sounds
  const successReady = new Audio('https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3'); // Pronto
  const successDelivered = new Audio('https://assets.mixkit.co/active_storage/sfx/2567/2567-preview.mp3'); // Entregue
  const errorSound = new Audio('https://assets.mixkit.co/active_storage/sfx/2572/2572-preview.mp3'); // Erro

  const [isConnected, setIsConnected] = useState(true); // Firebase handle its own connection mostly

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if in input
      if (document.activeElement?.tagName === 'INPUT') return;

      const currentTime = Date.now();
      lastKeyTime.current = currentTime;

      if (e.key === 'Enter') {
        if (scanBuffer) {
          processCode(scanBuffer);
          setScanBuffer('');
        }
      } else if (e.key === 'Backspace') {
        setScanBuffer(prev => prev.slice(0, -1));
      } else if (/^[0-9]$/.test(e.key) || e.key === '#' || /^[a-zA-Z]$/.test(e.key)) {
        setScanBuffer(prev => prev + e.key);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [scanBuffer, orders]);

  const processCode = async (code: string) => {
    const cleaned = code.trim();
    if (!cleaned) return;

    const ficha = await firebaseService.resolveFicha(cleaned);

    // Direct search in orders
    const order = orders.find(o => {
      const ticket = String(o.ticket_number).trim();
      if (ticket === ficha) return true;
      const nt = parseInt(ticket, 10);
      const nf = parseInt(ficha, 10);
      return !isNaN(nt) && !isNaN(nf) && nt === nf;
    });

    if (order) {
      let nextStatus: Order['status'] = 'ready';
      let sound = successReady;

      if (order.status === 'ready') {
        nextStatus = 'delivered';
        sound = successDelivered;
      }

      try {
        await firebaseService.updateOrderStatus(order.id, nextStatus);
        
        sound.play().catch(() => {});
        setLastProcessed({ 
          ticket: order.ticket_number, 
          status: nextStatus === 'ready' ? 'PARA O PAINEL (PRONTO)' : 'ENTREGUE (SAIU DO PAINEL)', 
          success: true 
        });
      } catch (err) {
        errorSound.play().catch(() => {});
        setLastProcessed({ ticket: cleaned, status: 'ERRO NO SISTEMA', success: false });
      }
    } else {
      errorSound.play().catch(() => {});
      setLastProcessed({ ticket: cleaned, status: 'FICHA NÃO ENCONTRADA', success: false });
    }

    // Reset last processed after 5 seconds
    setTimeout(() => {
      setLastProcessed(null);
    }, 5000);
  };

  return (
    <div className="fixed inset-0 bg-[#0A0A0A] text-white flex flex-col items-center justify-center p-8">
      {/* Background decoration for "in the dark" feel */}
      <div className="absolute inset-0 overflow-hidden opacity-10 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-orange-500 rounded-full blur-[160px] animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#5A5A40] rounded-full blur-[160px] animate-pulse delay-1000" />
      </div>

      <div className="z-10 w-full max-w-4xl text-center">
        <header className="mb-12 relative">
          <div className="absolute -top-12 left-1/2 -translate-x-1/2 flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-900 border border-zinc-800">
            <Wifi className="w-3 h-3 text-green-500" />
            <span className="text-[10px] text-green-500 font-bold uppercase tracking-widest">Conectado ao Firebase</span>
          </div>
          <Truck className="w-20 h-20 text-[#5A5A40] mx-auto mb-4" />
          <h1 className="text-4xl font-black tracking-widest uppercase">Central de Expedição</h1>
          <p className="text-gray-500 mt-2 font-mono uppercase tracking-widest">Aguardando teclado / leitor</p>
        </header>

        <div className="relative mb-12">
          {/* Virtual "Terminal" Display */}
          <div className="bg-zinc-900 border-2 border-zinc-800 rounded-[2rem] p-12 shadow-2xl relative overflow-hidden group">
            <div className="absolute top-0 left-0 w-full h-1 bg-orange-500/20" />
            
            <span className="text-sm font-mono text-zinc-500 uppercase tracking-widest mb-4 block">Entrada Atual</span>
            
            <div className="flex items-center justify-center gap-4">
              <span className="text-7xl font-mono text-white tracking-tighter min-h-[5rem]">
                {scanBuffer || <span className="opacity-10 animate-pulse font-sans">#_ _ _</span>}
              </span>
              {scanBuffer && (
                <motion.div 
                  initial={{ scale: 0 }} 
                  animate={{ scale: 1 }} 
                  className="w-4 h-12 bg-orange-500 animate-[pulse_0.5s_infinite]" 
                />
              )}
            </div>
            
            <p className="mt-8 text-zinc-400 font-bold uppercase tracking-widest text-sm">
              DIGITE O NÚMERO E PRESSIONE [ENTER]
            </p>
          </div>
        </div>

        <AnimatePresence mode="wait">
          {lastProcessed ? (
            <motion.div
              key={lastProcessed.ticket + lastProcessed.status}
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 1.1 }}
              className={`p-8 rounded-3xl border-4 ${
                lastProcessed.success ? 'bg-orange-950/20 border-orange-500/50' : 'bg-red-950/20 border-red-500/50'
              }`}
            >
              <div className="flex items-center justify-center gap-4 mb-2">
                {lastProcessed.success ? (
                  <CheckCircle2 className="w-8 h-8 text-orange-500" />
                ) : (
                  <AlertCircle className="w-8 h-8 text-red-500" />
                )}
                <span className="text-5xl font-black">#{lastProcessed.ticket}</span>
              </div>
              <p className={`text-2xl font-bold uppercase tracking-tight ${
                lastProcessed.success ? 'text-orange-400' : 'text-red-400'
              }`}>
                {lastProcessed.status}
              </p>
            </motion.div>
          ) : (
            <div className="grid grid-cols-2 gap-4 text-left">
              <div className="bg-zinc-900/50 p-6 rounded-2xl border border-zinc-800">
                <Hash className="text-zinc-600 mb-2" />
                <h3 className="text-xs font-black text-zinc-500 uppercase tracking-widest">Painel Produção</h3>
                <p className="text-2xl font-bold text-zinc-300">
                  {orders.filter(o => o.status === 'pending' || o.status === 'preparing').length} Ativos
                </p>
              </div>
              <div className="bg-zinc-900/50 p-6 rounded-2xl border border-zinc-800">
                <QrCode className="text-zinc-600 mb-2" />
                <h3 className="text-xs font-black text-zinc-500 uppercase tracking-widest">Painel Externo</h3>
                <p className="text-2xl font-bold text-zinc-300">
                  {orders.filter(o => o.status === 'ready').length} Prontos
                </p>
              </div>
            </div>
          )}
        </AnimatePresence>
      </div>

      <footer className="mt-auto opacity-20 font-mono text-xs flex gap-8">
        <span>1º BIP: MARCAR PRONTO</span>
        <span>2º BIP: CONFIRMAR ENTREGA</span>
      </footer>
    </div>
  );
}
