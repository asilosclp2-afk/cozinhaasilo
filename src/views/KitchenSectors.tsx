import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Bell, Flame, Utensils, Star, Package, AlertCircle, QrCode, Keyboard } from 'lucide-react';
import { Order } from '../types';
import { firebaseService } from '../services/firebaseService';

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTES DE DETECÇÃO
// Leitores QR/barcode enviam todos os chars em < 50ms entre teclas.
// Humano digita em >= 100ms entre teclas.
// ─────────────────────────────────────────────────────────────────────────────
const QR_MAX_INTERVAL_MS = 80;   // intervalo máximo entre chars para ser considerado scanner
const QR_MIN_LENGTH     = 2;    // tamanho mínimo para processar como QR

export default function KitchenSectors({ orders }: { orders: Order[] }) {
  const [showNotification, setShowNotification] = useState(false);
  const [alertMessage, setAlertMessage]         = useState<string | null>(null);

  // ── Estado do campo manual (digitação humana) ──────────────────────────────
  const [manualInput, setManualInput] = useState('');
  const manualRef = useRef<HTMLInputElement>(null);

  // ── Buffer invisível para captura do QR Code ───────────────────────────────
  const qrBuffer        = useRef('');
  const qrLastKeyTime   = useRef(0);
  const qrFlushTimer    = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Fonte da última ação (para feedback visual) ────────────────────────────
  const [lastSource, setLastSource] = useState<'qr' | 'manual' | null>(null);

  const audioRef = useRef(new Audio('https://assets.mixkit.co/active_storage/sfx/2847/2847-preview.mp3'));

  const pendingOrders = orders.filter(o => o.status === 'pending' || o.status === 'preparing');

  // ── Processa o código (comum para QR e manual) ─────────────────────────────
  const processCode = useCallback(async (code: string, source: 'qr' | 'manual') => {
    const cleaned = code.trim();
    if (!cleaned) return;

    setLastSource(source);
    setTimeout(() => setLastSource(null), 1500);

    const ficha = await firebaseService.resolveFicha(cleaned);
    const order  = orders.find(
      o => String(o.ticket_number).trim() === ficha && o.status !== 'delivered'
    );

    if (order) {
      setAlertMessage(null);
      if (source === 'qr') {
        if (order.status === 'pending' || order.status === 'preparing') {
          await firebaseService.updateOrderStatus(order.id, 'ready');
          new Audio('https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3').play().catch(() => {});
        } else if (order.status === 'ready') {
          await firebaseService.updateOrderStatus(order.id, 'delivered');
          new Audio('https://assets.mixkit.co/active_storage/sfx/1435/1435-preview.mp3').play().catch(() => {});
        }
      } else {
        // Teclado (manual): apenas Saída ou Zerar Ficha (ambos resultam em entregue/zerado)
        await firebaseService.updateOrderStatus(order.id, 'delivered');
        new Audio('https://assets.mixkit.co/active_storage/sfx/1435/1435-preview.mp3').play().catch(() => {});
      }
    } else {
      setAlertMessage(`Ficha #${ficha} sem pedido ativo.`);
      new Audio('https://assets.mixkit.co/active_storage/sfx/2847/2847-preview.mp3').play().catch(() => {});
      setTimeout(() => setAlertMessage(prev => (prev?.includes(`#${ficha}`) ? null : prev)), 3000);
    }

    if (source === 'manual') setManualInput('');
  }, [orders]);

  // ── Listener global de teclado — captura QR Code ──────────────────────────
  // Funciona mesmo se o foco estiver no campo manual, pois detecta pela
  // velocidade. Se for QR, consome o evento e NÃO deixa cair no campo manual.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const now = Date.now();
      const interval = now - qrLastKeyTime.current;
      qrLastKeyTime.current = now;

      // Enter pode ser fim do QR ou confirmação manual — decidimos pelo buffer
      if (e.key === 'Enter') {
        if (qrBuffer.current.length >= QR_MIN_LENGTH) {
          // É fim de leitura QR → processa e bloqueia o Enter de cair no form
          e.preventDefault();
          e.stopPropagation();
          const code = qrBuffer.current;
          qrBuffer.current = '';
          if (qrFlushTimer.current) clearTimeout(qrFlushTimer.current);
          processCode(code, 'qr');
        }
        // Se buffer vazio, deixa o Enter passar normalmente (submit do form manual)
        return;
      }

      // Caractere normal: verifica se é parte de uma sequência de QR
      if (e.key.length === 1) {
        const isScanner = interval < QR_MAX_INTERVAL_MS || qrBuffer.current.length > 0;

        if (isScanner) {
          // Acumula no buffer QR e bloqueia o char de cair no campo manual
          e.preventDefault();
          e.stopPropagation();
          qrBuffer.current += e.key;

          // Timer de segurança: se não vier Enter, processa após 150ms de silêncio
          if (qrFlushTimer.current) clearTimeout(qrFlushTimer.current);
          qrFlushTimer.current = setTimeout(() => {
            if (qrBuffer.current.length >= QR_MIN_LENGTH) {
              const code = qrBuffer.current;
              qrBuffer.current = '';
              processCode(code, 'qr');
            } else {
              qrBuffer.current = '';
            }
          }, 150);
        }
        // Se não for scanner, deixa o char cair normalmente no campo manual focado
      }
    };

    // capture: true garante que interceptamos antes de qualquer elemento
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true });
  }, [processCode]);

  // ── Submit do form manual ──────────────────────────────────────────────────
  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualInput.trim()) processCode(manualInput, 'manual');
  };

  // ── Agrupamento de itens por setor ─────────────────────────────────────────
  const getGroupedItems = () => {
    const groups: Record<string, { name: string; quantity: number; sector: string; tickets: string[] }> = {};
    pendingOrders.forEach(order => {
      order.items.forEach((item: any) => {
        if (!item.completed) {
          const key = item.name;
          if (!groups[key]) groups[key] = { name: item.name, quantity: 0, sector: item.sector || 'Outros', tickets: [] };
          groups[key].quantity += item.quantity;
          if (!groups[key].tickets.includes(order.ticket_number)) groups[key].tickets.push(order.ticket_number);
        }
      });
    });
    return Object.values(groups);
  };

  const groupedItems = getGroupedItems();

  const sectors = [
    { id: 'Fritadeira', label: 'Fritadeira', icon: <Flame   className="w-6 h-6 text-orange-500" />, color: 'border-orange-500', bg: 'bg-orange-50/30' },
    { id: 'Lanches',    label: 'Lanches',    icon: <Utensils className="w-6 h-6 text-blue-500"   />, color: 'border-blue-500',   bg: 'bg-blue-50/30'   },
    { id: 'Outros',     label: 'Outros',     icon: <Star     className="w-6 h-6 text-purple-500" />, color: 'border-purple-500', bg: 'bg-purple-50/30' },
  ];

  const getItemsForSector = (sectorId: string) => {
    if (sectorId === 'Outros') {
      const defined = sectors.filter(s => s.id !== 'Outros').map(s => s.id);
      return groupedItems.filter(i => i.sector === 'Outros' || !defined.includes(i.sector));
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
        .animate-blink { animation: blink 0.6s infinite; }
      `}</style>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="p-4 flex justify-between items-center bg-white border-b border-black/5 shadow-sm z-10">
        <div className="flex items-center gap-8">
          <div>
            <h1 className="text-3xl font-serif italic text-[#5A5A40]">Monitor de Produção</h1>
            <p className="text-gray-500 font-bold uppercase tracking-widest text-[10px]">Consolidado por Setor</p>
          </div>

          {/* Campo manual — só aceita digitação humana */}
          <form onSubmit={handleManualSubmit} className="flex items-center gap-3">
            <div className={`bg-[#1A1A1A] text-white px-6 py-3 rounded-2xl border-2 shadow-2xl flex items-center gap-4 transition-all
              ${lastSource === 'manual' ? 'border-green-400 scale-105' : 'border-orange-500'}`}>
              <span className="text-orange-500 font-black text-3xl">#</span>
              <input
                ref={manualRef}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={manualInput}
                onChange={e => setManualInput(e.target.value)}
                placeholder="---"
                className="bg-transparent border-none focus:ring-0 text-4xl font-black tabular-nums w-24 p-0 placeholder:text-gray-700"
              />
              <button type="submit" className="hidden" />
            </div>

            {/* Indicador de fonte */}
            <div className="flex flex-col gap-1">
              <div className={`flex items-center gap-1 text-[10px] font-black uppercase px-2 py-1 rounded-lg transition-all
                ${lastSource === 'qr' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-400'}`}>
                <QrCode className="w-3 h-3" /> QR Code
              </div>
              <div className={`flex items-center gap-1 text-[10px] font-black uppercase px-2 py-1 rounded-lg transition-all
                ${lastSource === 'manual' ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-400'}`}>
                <Keyboard className="w-3 h-3" /> Teclado
              </div>
            </div>

            <p className="text-[10px] font-bold text-gray-400 uppercase w-32 leading-tight">
              Entrada: QR Code • Teclado: Saída / Zerar Ficha
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

      {/* ── Grade de Setores ────────────────────────────────────────────────── */}
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
                          <span className="text-orange-600 font-black text-sm tracking-tight border-b-0 pb-0">
                            {item.tickets.map(t => `#${t}`).join(' ')}
                          </span>
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

      {/* ── Toast de alerta ─────────────────────────────────────────────────── */}
      <AnimatePresence>
        {alertMessage && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed bottom-6 right-6 w-80 z-50"
          >
            <div className="bg-[#EF4444] text-white rounded-3xl shadow-2xl border-4 border-white flex items-center p-5 gap-4">
              <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center shrink-0">
                <AlertCircle className="w-6 h-6 text-white" />
              </div>
              <div className="flex flex-col">
                <span className="font-black uppercase tracking-tight text-sm leading-none mb-1">Ficha Sem Pedido</span>
                <span className="text-[11px] font-semibold opacity-95 leading-tight">{alertMessage}</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
