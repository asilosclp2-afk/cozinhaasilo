import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Order } from '../types';
import { ArrowLeft, ChefHat, Utensils, Flame, Sparkles, BellRing } from 'lucide-react';
import OrderTimer from '../components/OrderTimer';
import { audioService } from '../services/audioService';

const CAIPIRA_MESSAGES = [
  "Eita! O trem tá pronto, sô!",
  "Vem buscar que tá quentinho!",
  "Olha a cobra! É mentira, é o seu pedido!",
  "Uai, seu pedido já saiu do fogo!",
  "Pula a fogueira e vem buscar!",
  "Tá mais pronto que milho em dia de festa!",
  "Aperta o passo que a comida tá na mesa!",
  "Santo Antônio ajudou e seu pedido chegou!",
  "Anarriê! Seu pedido tá no balcão!",
  "Êta trem bão, seu pedido tá pronto!",
  "Corre que o quentão tá esperando!",
  "Segura o chapéu, seu pedido chegou!",
  "Mais rápido que foguete de São João!",
  "O sanfoneiro parou pra ver seu pedido!",
  "Tá cheirando melhor que canjica!",
  "Vem pro arraiá, seu pedido tá na mão!",
  "Simbora buscar que a festa não para!",
  "Olha o balão! E olha o seu pedido!",
  "Ficou pronto no capricho, sô!",
  "Alegria, alegria! Seu pedido tá aqui!"
];

const Bandeirinhas = () => (
  <div className="absolute top-0 left-0 right-0 h-12 flex justify-around pointer-events-none z-20 overflow-hidden">
    {[...Array(20)].map((_, i) => (
      <div 
        key={i}
        className={`w-6 h-8 ${
          ['bg-yellow-400', 'bg-red-500', 'bg-blue-500', 'bg-green-500', 'bg-orange-500'][i % 5]
        }`}
        style={{
          clipPath: 'polygon(0% 0%, 100% 0%, 100% 100%, 50% 80%, 0% 100%)',
          transform: `rotate(${Math.sin(i) * 10}deg) translateY(${Math.cos(i) * 5}px)`,
        }}
      />
    ))}
  </div>
);

export default function Display({ orders, onBack }: { orders: Order[], onBack: () => void }) {
  const preparing = orders.filter(o => o.status === 'preparing' || o.status === 'pending');
  const ready = orders.filter(o => o.status === 'ready');
  
  const notifiedIdsRef = useRef<Set<string>>(new Set(ready.map(o => o.id)));
  const [showNotification, setShowNotification] = useState(false);
  const [notifOrder, setNotifOrder] = useState<Order | null>(null);
  const [currentMessage, setCurrentMessage] = useState('');
  const [queue, setQueue] = useState<Order[]>([]);

  // Add new ready orders to the queue
  useEffect(() => {
    const newlyReady = ready.filter(o => !notifiedIdsRef.current.has(o.id));
    
    if (newlyReady.length > 0) {
      newlyReady.forEach(o => notifiedIdsRef.current.add(o.id));
      setQueue(prev => [...prev, ...newlyReady]);
    }
  }, [ready]);

  // Process the queue
  useEffect(() => {
    if (queue.length > 0 && !showNotification) {
      const nextOrder = queue[0];
      setNotifOrder(nextOrder);
      setCurrentMessage(CAIPIRA_MESSAGES[Math.floor(Math.random() * CAIPIRA_MESSAGES.length)]);
      setShowNotification(true);
      
      // Play external announcement sound
      audioService.playExternalReadySound();
      
      setQueue(prev => prev.slice(1));
    }
  }, [queue, showNotification]);

  // Auto-hide notification
  useEffect(() => {
    if (showNotification) {
      const timer = setTimeout(() => {
        setShowNotification(false);
      }, 7000);
      return () => clearTimeout(timer);
    }
  }, [showNotification]);

  return (
    <div className="fixed inset-0 bg-[#1A1A1A] text-white z-[100] flex flex-col overflow-hidden font-sans">
      <Bandeirinhas />
      
      {/* Animated Notification Overlay */}
      <AnimatePresence>
        {showNotification && notifOrder && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 flex items-center justify-center z-[200] bg-black/40 backdrop-blur-sm pointer-events-none"
          >
            <motion.div
              initial={{ scale: 0.5, y: 100, rotate: -5 }}
              animate={{ scale: 1, y: 0, rotate: 0 }}
              exit={{ scale: 0.5, opacity: 0, y: -100 }}
              transition={{ type: "spring", stiffness: 260, damping: 20 }}
              className="bg-gradient-to-br from-yellow-400 to-orange-600 p-1 rounded-[40px] shadow-[0_0_100px_rgba(250,204,21,0.5)]"
            >
              <div className="bg-[#1A1A1A] px-16 py-12 rounded-[38px] flex flex-col items-center gap-6 border-4 border-yellow-400/20">
                <div className="relative">
                  <BellRing className="w-24 h-24 text-yellow-400 animate-bounce" />
                  <Sparkles className="absolute -top-4 -right-4 w-12 h-12 text-white animate-pulse" />
                </div>
                <div className="text-center">
                  <h3 className="text-3xl font-black uppercase tracking-widest text-yellow-400 mb-2 italic">
                    {currentMessage}
                  </h3>
                  <span className="text-9xl font-black text-white tracking-tighter drop-shadow-2xl block leading-none">
                    {notifOrder.ticket_number}
                  </span>
                </div>
                <div className="bg-yellow-400 text-black px-8 py-3 rounded-full font-black text-xl uppercase tracking-widest shadow-lg">
                  Favor Retirar no Balcão
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <button 
        onClick={onBack}
        className="absolute top-14 left-6 p-3 rounded-full bg-white/5 hover:bg-white/10 text-white/20 hover:text-white transition-all z-50 group"
      >
        <ArrowLeft className="w-6 h-6" />
        <span className="absolute left-full ml-2 top-1/2 -translate-y-1/2 text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
          Voltar ao menu
        </span>
      </button>

      {/* Header */}
      <header className="h-28 bg-[#151619] border-b border-white/5 flex items-center justify-between px-12 shrink-0 relative pt-4">
        <div className="flex items-center gap-6">
          <div className="w-16 h-16 bg-gradient-to-br from-orange-500 to-red-600 rounded-2xl flex items-center justify-center shadow-lg shadow-orange-500/20 rotate-3">
            <Flame className="text-white w-10 h-10 animate-pulse" />
          </div>
          <div>
            <h1 className="text-4xl font-black tracking-tighter uppercase italic text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 via-orange-500 to-red-500 pr-2">
              Arraiá do Lar São Cristóvão
            </h1>
            <p className="text-sm text-gray-400 font-bold uppercase tracking-widest flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-yellow-500" />
              Festa de São João 2026
            </p>
          </div>
        </div>
        <div className="text-right">
          <div className="text-4xl font-mono font-black text-orange-500 drop-shadow-[0_0_10px_rgba(249,115,22,0.3)]">
            {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
      </header>

      {/* Main Content - Split Layout */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Left Column: Preparing (40%) */}
        <div className="w-[40%] bg-[#202124] border-r border-white/5 flex flex-col p-8 relative">
          <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(#fff 1px, transparent 1px)', backgroundSize: '20px 20px' }} />
          
          <div className="flex items-center gap-4 mb-8 pb-4 border-b border-white/10 relative z-10">
            <div className="w-5 h-5 rounded-full bg-orange-600 animate-pulse shadow-[0_0_20px_rgba(234,88,12,0.8)]" />
            <h2 className="text-4xl font-black uppercase tracking-tighter italic text-transparent bg-clip-text bg-gradient-to-r from-orange-500 to-yellow-500 pr-2">
              Esquentando o fuzuê
            </h2>
            <ChefHat className="w-10 h-10 text-orange-500/50 ml-auto animate-bounce" />
          </div>
          
          <div className="grid grid-cols-3 gap-3 overflow-y-auto pr-2 custom-scrollbar content-start relative z-10">
            <AnimatePresence mode="popLayout">
                {preparing.map(order => {
                  // Calculate progress based on 15 minutes (900000ms) target
                  const elapsed = new Date().getTime() - new Date(order.created_at).getTime();
                  const progress = Math.min(Math.max(elapsed / 900000, 0.05), 0.95); // Min 5%, Max 95%

                  return (
                    <motion.div
                      layout
                      key={order.id}
                      initial={{ opacity: 0, scale: 0.8, rotate: -5 }}
                      animate={{ opacity: 1, scale: 1, rotate: 0 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      className="bg-white/5 border border-white/10 rounded-2xl aspect-square flex flex-col items-center justify-center relative overflow-hidden group hover:border-orange-500/50 transition-colors shadow-inner"
                    >
                      {/* Fire Fill Animation based on time */}
                      <motion.div 
                        initial={{ height: "0%" }}
                        animate={{ 
                          height: `${progress * 100}%`,
                          opacity: [0.4, 0.6, 0.5, 0.7, 0.5]
                        }}
                        transition={{ 
                          height: { duration: 1, ease: "easeOut" },
                          opacity: { duration: 3, repeat: Infinity, ease: "easeInOut" }
                        }}
                        className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-orange-700 via-orange-500 to-yellow-400/20 pointer-events-none"
                      />
                      
                      {/* Animated flame tips */}
                      <motion.div
                        animate={{ 
                          y: [0, -5, 0],
                          scaleY: [1, 1.2, 1]
                        }}
                        transition={{ duration: 0.5, repeat: Infinity, ease: "easeInOut" }}
                        className="absolute left-0 right-0 bg-gradient-to-t from-orange-500 to-transparent h-8 pointer-events-none"
                        style={{ bottom: `${progress * 100}%` }}
                      />
                      
                      <div className="relative z-10 flex flex-col items-center justify-center">
                        <span className={`font-black text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] transition-all tracking-tighter text-center px-1 group-hover:scale-110 ${
                          order.ticket_number.length > 8 ? 'text-xs' : order.ticket_number.length > 4 ? 'text-xl' : 'text-3xl'
                        }`}>
                          {order.ticket_number}
                        </span>
                        <OrderTimer 
                          startTime={order.created_at} 
                          variant="default"
                          color="light"
                          className="mt-1 opacity-80 group-hover:opacity-100 scale-[0.7] font-bold" 
                        />
                      </div>
                      
                      <div className="absolute inset-0 bg-gradient-to-tr from-orange-500/0 to-orange-500/0 group-hover:from-orange-500/10 group-hover:to-orange-500/20 transition-all duration-500" />
                    </motion.div>
                  );
                })}
            </AnimatePresence>
            {preparing.length === 0 && (
              <div className="col-span-2 py-12 text-center text-gray-600 italic font-medium">
                Cozinha livre no momento
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Ready (60%) */}
        <div className="flex-1 bg-[#1A1A1A] flex flex-col p-8 relative overflow-hidden">
          {/* Background decoration */}
          <div className="absolute top-[-10%] right-[-10%] w-[600px] h-[600px] bg-orange-500/10 rounded-full blur-[120px] pointer-events-none animate-pulse" />
          <div className="absolute bottom-[-10%] left-[20%] w-[400px] h-[400px] bg-yellow-500/5 rounded-full blur-[100px] pointer-events-none" />

          <div className="flex items-center gap-6 mb-10 pb-4 border-b border-white/10 relative z-10">
            <div className="w-6 h-6 rounded-full bg-yellow-400 shadow-[0_0_25px_rgba(250,204,21,0.8)]" />
            <h2 className="text-5xl font-black uppercase tracking-normal text-white italic pr-4">Tá no ponto, sô!</h2>
            <div className="ml-auto flex gap-2">
              <span className="bg-yellow-400 text-black font-black uppercase tracking-widest text-xs px-6 py-2.5 rounded-full shadow-lg shadow-yellow-400/30">
                Balcão
              </span>
            </div>
          </div>

          <div className="grid grid-cols-5 gap-3 overflow-y-auto pr-2 custom-scrollbar content-start relative z-10">
            <AnimatePresence mode="popLayout">
              {ready.map(order => (
                <motion.div
                  layout
                  layoutId={`order-${order.id}`}
                  key={order.id}
                  initial={{ opacity: 0, y: 50, scale: 0.9, rotate: 5 }}
                  animate={{ 
                    opacity: 1, 
                    y: 0, 
                    scale: [1, 1.05, 1],
                    rotate: [0, -2, 2, 0],
                    borderColor: "rgba(250,204,21,0.6)"
                  }}
                  exit={{ opacity: 0, scale: 0.9, y: -50 }}
                  transition={{ 
                    scale: { repeat: Infinity, duration: 2, ease: "easeInOut" },
                    rotate: { repeat: Infinity, duration: 4, ease: "easeInOut" },
                    type: "spring", stiffness: 300, damping: 25 
                  }}
                  className="bg-gradient-to-br from-yellow-400/20 to-orange-500/20 border-2 border-yellow-400/40 rounded-[24px] aspect-square flex flex-col items-center justify-center shadow-[0_10px_30px_rgba(250,204,21,0.15)] relative overflow-hidden group"
                >
                  <div className="absolute top-2 right-2">
                    <Sparkles className="w-4 h-4 text-yellow-400 animate-pulse" />
                  </div>
                  
                  <span className={`font-black text-white tracking-tighter drop-shadow-[0_5px_5px_rgba(0,0,0,0.5)] text-center px-1 leading-none ${
                    order.ticket_number.length > 12 ? 'text-sm' : order.ticket_number.length > 8 ? 'text-lg' : order.ticket_number.length > 4 ? 'text-2xl' : 'text-4xl'
                  }`}>
                    {order.ticket_number}
                  </span>
                  
                  <div className="mt-1 px-2 py-0.5 bg-yellow-400 text-black text-[8px] font-black uppercase tracking-widest rounded-full shadow-lg transform group-hover:scale-110 transition-transform">
                    Tá no ponto!
                  </div>
                  
                  {/* Festive Shine effect */}
                  <div className="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/10 to-white/0 translate-x-[-100%] animate-[shimmer_2s_infinite]" />
                </motion.div>
              ))}
            </AnimatePresence>
            {ready.length === 0 && (
              <div className="col-span-3 py-20 text-center flex flex-col items-center justify-center text-gray-600">
                <div className="w-32 h-32 rounded-full bg-white/5 flex items-center justify-center mb-8 border border-white/5">
                  <Utensils className="w-12 h-12 opacity-20" />
                </div>
                <span className="text-3xl font-black italic uppercase tracking-tighter opacity-30">O Arraiá tá começando...</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
