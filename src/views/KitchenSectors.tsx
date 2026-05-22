import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Bell, Flame, Utensils, Star, Package, AlertCircle, QrCode, Keyboard } from 'lucide-react';
import { Order, MenuItem } from '../types';
import { firebaseService } from '../services/firebaseService';

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTES DE DETECÇÃO
// Leitores QR/barcode enviam todos os chars em < 50ms entre teclas.
// Humano digita em >= 100ms entre teclas.
// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTES DE DETECÇÃO
// ─────────────────────────────────────────────────────────────────────────────

export default function KitchenSectors({ orders }: { orders: Order[] }) {
  const [showNotification, setShowNotification] = useState(false);
  const [alertMessage, setAlertMessage]         = useState<string | null>(null);

  // ── Cardápio para mapear os itens do QR de forma reativa nos setores ────────
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const menuItemsRef = useRef<MenuItem[]>([]);

  useEffect(() => {
    menuItemsRef.current = menuItems;
  }, [menuItems]);

  useEffect(() => {
    firebaseService.getMenu().then(m => {
      if (m) setMenuItems(m);
    }).catch(err => {
      console.error("Failed to load menu in sectors:", err);
    });
  }, []);

  // ── Estado do campo manual (digitação humana) ──────────────────────────────
  const [manualInput, setManualInput] = useState('');
  const manualRef = useRef<HTMLInputElement>(null);

  // ── Guardar os pedidos mais atualizados em uma ref para evitar stale closure ──
  const ordersRef = useRef(orders);
  useEffect(() => {
    ordersRef.current = orders;
  }, [orders]);

  // ── Fonte da última ação (para feedback visual) ────────────────────────────
  const [lastSource, setLastSource] = useState<'qr' | 'manual' | null>(null);

  // ── Estado do último QR Code bipado para mostrar no canto inferior direito ──
  const [lastScannedQrFicha, setLastScannedQrFicha] = useState<string | null>(null);

  // ── Sincronização em tempo real do rascunho de pedido ativo na Recepção ──
  const [activeReceptionDraft, setActiveReceptionDraft] = useState<{ ticket_number: string; items: { name: string; quantity: number }[] } | null>(null);

  useEffect(() => {
    const unsubscribe = firebaseService.listenToActiveReceptionDraft((draft) => {
      setActiveReceptionDraft(draft);
    });
    return () => unsubscribe();
  }, []);

  const audioRef = useRef(new Audio('https://assets.mixkit.co/active_storage/sfx/2847/2847-preview.mp3'));

  const pendingOrders = orders.filter(o => o.status === 'pending' || o.status === 'preparing');

  // ── Processa o código (comum para QR e manual) ─────────────────────────────
  const processCode = useCallback(async (code: string, source: 'qr' | 'manual') => {
    const cleaned = code.trim();
    if (!cleaned) return;

    setLastSource(source);
    setTimeout(() => setLastSource(null), 1500);

    // Normalização para evitar incompatibilidade por zeros à esquerda (ex: "05" vs "5") ou espaços
    const normalize = (val: string) => {
      const t = val.trim().toLowerCase();
      const stripped = t.replace(/^0+/, '');
      return stripped === '' ? '0' : stripped;
    };

    // ──────────────── MODO NORMAL DE OPERAÇÃO (Setores / Cozinha) ────────────────
    // Se for entrada via QR Code, tentamos extrair ficha e itens usando delimitadores para autoinserção
    if (source === 'qr') {
      const separators = ['|', ';', ':'];
      let parsedFicha: string | null = null;
      let parsedItems: string[] = [];

      for (const sep of separators) {
        if (cleaned.includes(sep)) {
          const parts = cleaned.split(sep);
          const possibleFicha = parts[0].trim();
          const possibleItems = parts.slice(1).join(sep).split(/[,;]/).map(i => i.trim()).filter(Boolean);
          if (possibleFicha && possibleItems.length > 0) {
            parsedFicha = possibleFicha;
            parsedItems = possibleItems;
            break;
          }
        }
      }

      // Suporte a JSON estruturado, caso o scanner do QR envie JSON
      if (!parsedFicha && cleaned.startsWith('{')) {
        try {
          const data = JSON.parse(cleaned);
          if (data.items && Array.isArray(data.items)) {
            const itemNames = data.items.map((it: any) => typeof it === 'string' ? it : (it.name || ''));
            if (data.ticket_number || data.ficha) {
              parsedFicha = String(data.ticket_number || data.ficha);
              parsedItems = itemNames;
            }
          }
        } catch (e) {}
      }

      // Se detectou multiplos itens no QR Code recebido, criamos o pedido diretamente
      if (parsedFicha && parsedItems.length > 0) {
        const resolvedFicha = await firebaseService.resolveFicha(parsedFicha);
        const normFicha = normalize(resolvedFicha);
        setLastScannedQrFicha(normFicha);

        // Mapeia strings para os itens do cardápio cadastrado para coletar categorias, setores e valores automaticamente
        const orderItems = parsedItems.map(itemStr => {
          const trimmed = itemStr.toLowerCase();
          const matched = menuItemsRef.current.find(m => m.name.toLowerCase() === trimmed);
          return {
            name: matched ? matched.name : itemStr,
            quantity: 1,
            completed: false,
            sector: matched ? (matched.sector || 'Outros') : 'Outros',
            category_name: matched ? (matched.category_name || 'Outros') : 'Outros',
            price: matched ? (matched.price || 0) : 0
          };
        });

        try {
          await firebaseService.createOrder(resolvedFicha, orderItems);
          setAlertMessage(null);
          new Audio('https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3').play().catch(() => {});
          return;
        } catch (error: any) {
          console.error("Falha ao criar o pedido via QR Code nos setores:", error);
          setAlertMessage(`Erro ao inserir ficha QR: ${error.message || error}`);
          new Audio('https://assets.mixkit.co/active_storage/sfx/2847/2847-preview.mp3').play().catch(() => {});
          return;
        }
      }
    }

    const ficha = await firebaseService.resolveFicha(cleaned);
    const normFicha = normalize(ficha);

    const order = ordersRef.current.find(
      o => normalize(String(o.ticket_number)) === normFicha && o.status !== 'delivered'
    );

    if (order) {
      setAlertMessage(null);
      // Armazena e exibe o painel de detalhes apenas se houver um pedido ativo
      if (source === 'qr') {
        setLastScannedQrFicha(normFicha);
      }

      if (source === 'qr') {
        if (order.status === 'pending' || order.status === 'preparing') {
          await firebaseService.updateOrderStatus(order.id, 'ready');
          new Audio('https://assets.mixkit.co/active_storage/sfx/911/911-preview.mp3').play().catch(() => {});
        } else if (order.status === 'ready') {
          setAlertMessage(`Ficha #${ficha} já está PRONTA! Use o teclado para dar saída.`);
          new Audio('https://assets.mixkit.co/active_storage/sfx/2847/2847-preview.mp3').play().catch(() => {});
          setTimeout(() => setAlertMessage(prev => (prev?.includes(`#${ficha}`) ? null : prev)), 4000);
        }
      } else {
        // Teclado (manual)
        if (order.status === 'pending' || order.status === 'preparing') {
          // Vai para status PRONTO
          await firebaseService.updateOrderStatus(order.id, 'ready');
          new Audio('https://assets.mixkit.co/active_storage/sfx/911/911-preview.mp3').play().catch(() => {});
        } else if (order.status === 'ready') {
          // Vai para status ENTREGUE / ZERADO (Some/Limpa a ficha)
          await firebaseService.updateOrderStatus(order.id, 'delivered');
          new Audio('https://assets.mixkit.co/active_storage/sfx/2567/2567-preview.mp3').play().catch(() => {});
          if (lastScannedQrFicha === normFicha) {
            setLastScannedQrFicha(null);
          }
        }
      }
    } else {
      // Se não há pedido ativo para esta ficha, garantimos que o painel de detalhes não se abra de forma confusa
      if (source === 'qr') {
        setLastScannedQrFicha(null);
      }
      setAlertMessage(`Ficha #${ficha} sem pedido ativo.`);
      new Audio('https://assets.mixkit.co/active_storage/sfx/2847/2847-preview.mp3').play().catch(() => {});
      setTimeout(() => setAlertMessage(prev => (prev?.includes(`#${ficha}`) ? null : prev)), 3000);
    }

    if (source === 'manual') setManualInput('');
  }, [lastScannedQrFicha]);

  // ── Ref para manter processCode estável na escuta global sem re-registrar listeners ──
  const processCodeRef = useRef(processCode);
  useEffect(() => {
    processCodeRef.current = processCode;
  }, [processCode]);

  // ── Buffer invisível para captura do QR Code (Leitor de Código de Barras / QR Code) ──
  const scanBuffer = useRef('');
  const qrLastKeyTime = useRef(0);

  // ── Listener global de teclado ──
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Se o usuário estiver ativamente digitando no input manual, 
      // deixamos a digitação ocorrer nativamente para não interferir.
      const target = e.target as HTMLElement;
      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable) {
        return;
      }

      // Ignorar teclas de controle e de layout
      if (e.key === 'Shift' || e.key === 'Control' || e.key === 'Alt' || e.key === 'Meta') return;

      const currentTime = Date.now();
      
      // Se o intervalo for > 200ms, assumimos nova leitura do scanner (mais tolerante a oscilações e main thread)
      if (currentTime - qrLastKeyTime.current > 200) {
        scanBuffer.current = e.key.length === 1 ? e.key : '';
      } else {
        if (e.key === 'Enter') {
          const code = scanBuffer.current.trim();
          if (code) {
            processCodeRef.current(code, 'qr');
          }
          scanBuffer.current = '';
        } else if (e.key.length === 1) {
          scanBuffer.current += e.key;
        }
      }

      qrLastKeyTime.current = currentTime;
    };

    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => {
      window.removeEventListener('keydown', onKeyDown, { capture: true });
    };
  }, []);

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

  // Procurar o pedido da última ficha bipada por QR Code de forma reativa
  const scannedOrder = lastScannedQrFicha
    ? orders.find(o => {
        const normalizeVal = (val: string) => {
          const t = val.trim().toLowerCase();
          const stripped = t.replace(/^0+/, '');
          return stripped === '' ? '0' : stripped;
        };
        return normalizeVal(String(o.ticket_number)) === normalizeVal(lastScannedQrFicha);
      })
    : null;

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
        <div className="flex items-center gap-6">
          <div>
            <h1 className="text-2xl xl:text-3xl font-serif italic text-[#5A5A40]">Monitor de Produção</h1>
            <p className="text-gray-500 font-bold uppercase tracking-widest text-[10px]">Consolidado por Setor</p>
          </div>

          {/* Campo manual — aceita digitação física ou cliques no teclado virtual */}
          <form onSubmit={handleManualSubmit} className="flex items-center gap-3">
            <div className={`bg-[#1A1A1A] text-white px-5 py-2.5 rounded-2xl border-2 shadow-2xl flex items-center gap-3 transition-all
              ${lastSource === 'manual' ? 'border-green-400 scale-105' : 'border-orange-500'}`}>
              <span className="text-orange-500 font-black text-2xl">#</span>
              <input
                ref={manualRef}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={manualInput}
                onChange={e => setManualInput(e.target.value)}
                placeholder="---"
                className="bg-transparent border-none focus:ring-0 text-3xl font-black tabular-nums w-20 p-0 placeholder:text-gray-700"
              />
              <button type="submit" className="hidden" />
            </div>

            {/* Teclado numérico virtual para fácil toque de Saída/Zerar */}
            <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl shadow-sm border border-black/5">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'].map(digit => (
                <button
                  key={digit}
                  type="button"
                  onClick={() => setManualInput(prev => prev + digit)}
                  className="w-8 h-8 bg-white hover:bg-gray-50 active:bg-gray-100 text-gray-900 font-bold rounded-lg text-sm flex items-center justify-center transition-all shadow-sm active:scale-95"
                >
                  {digit}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setManualInput(prev => prev.slice(0, -1))}
                className="w-12 h-8 bg-red-50 hover:bg-red-100 text-red-600 font-bold rounded-lg text-xs flex items-center justify-center transition-all shadow-sm active:scale-95"
              >
                Apagar
              </button>
              <button
                type="submit"
                disabled={!manualInput}
                className="px-3 h-8 bg-[#5A5A40] hover:bg-[#4A4A30] text-white font-bold rounded-lg text-xs flex items-center justify-center transition-all shadow-sm disabled:opacity-50 active:scale-95"
              >
                OK
              </button>
            </div>

            {/* Indicador de fonte */}
            <div className="flex flex-col gap-1">
              <div className={`flex items-center gap-1 text-[10px] font-black uppercase px-2 py-0.5 rounded transition-all
                ${lastSource === 'qr' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-400'}`}>
                <QrCode className="w-2.5 h-2.5" /> QR Code
              </div>
              <div className={`flex items-center gap-1 text-[10px] font-black uppercase px-2 py-0.5 rounded transition-all
                ${lastSource === 'manual' ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-400'}`}>
                <Keyboard className="w-2.5 h-2.5" /> Teclado
              </div>
            </div>

            <p className="text-[10px] font-bold text-gray-400 uppercase w-48 leading-tight hidden xl:block">
              Leitor: Fichar Pronto • Teclado: Dar Saída / Zerar
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

      {/* ── Painel de Ficha QR / Modo Recepção no Canto Inferior Direito ── */}
      <AnimatePresence>
        {/* RASCUNHO EM TEMPO REAL DA RECEPÇÃO */}
        {activeReceptionDraft && activeReceptionDraft.ticket_number && (
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            className="fixed bottom-4 right-4 w-72 bg-white rounded-[16px] shadow-xl border-2 border-orange-500 z-50 overflow-hidden flex flex-col max-h-[280px]"
          >
            {/* Header */}
            <div className="bg-orange-500 text-white px-3.5 py-2.5 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-2">
                <QrCode className="w-4 h-4 text-white animate-pulse" />
                <div>
                  <h3 className="font-extrabold text-sm tracking-tight leading-none">Ficha #{activeReceptionDraft.ticket_number}</h3>
                  <p className="text-[8px] text-white/90 uppercase font-bold tracking-wider mt-0.5 font-sans">Sendo Lançada na Recepção...</p>
                </div>
              </div>
              <span className="w-2 h-2 rounded-full bg-red-400 animate-ping" />
            </div>

            {/* Content: Draft Items list or placeholder to scan products */}
            <div className="p-2.5 overflow-y-auto flex-1 space-y-2 bg-[#F5F5F0]/30 min-h-[100px]">
              {activeReceptionDraft.items && activeReceptionDraft.items.length > 0 ? (
                <div className="space-y-1 font-sans">
                  <div className="text-[8px] font-black text-gray-400 uppercase tracking-widest pb-1 mb-1 border-b border-black/5">Produtos Sendo Bipados:</div>
                  {activeReceptionDraft.items.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between p-1.5 bg-white rounded-lg shadow-sm border border-black/5">
                      <div className="flex items-center gap-1.5 truncate">
                        <span className="w-5 h-5 bg-orange-100 text-orange-700 rounded flex items-center justify-center font-black text-[10px] shrink-0">
                          {item.quantity}x
                        </span>
                        <span className="font-bold text-xs text-[#1A1A1A] truncate">{item.name}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-6 text-center text-gray-400 italic flex flex-col items-center justify-center gap-1.5 h-full">
                  <QrCode className="w-6 h-6 text-orange-400 opacity-60 animate-bounce" />
                  <div>
                    <p className="font-extrabold text-[#1A1A1A] text-xs not-italic uppercase mb-0.5 font-sans">Ficha Bipada</p>
                    <p className="text-[10px] text-gray-500 font-sans">Aguardando produtos na recepção...</p>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="bg-gray-50 border-t border-black/5 p-2 text-center text-[8px] font-bold text-[#5A5A40] uppercase tracking-wider shrink-0 font-sans">
              Recepção em Tempo Real
            </div>
          </motion.div>
        )}

        {/* MODO NORMAL: PAINEL DE FICHA QR DETALHES */}
        {!activeReceptionDraft && lastScannedQrFicha && (
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            className="fixed bottom-4 right-4 w-72 bg-white rounded-[16px] shadow-xl border-2 border-[#5A5A40] z-50 overflow-hidden flex flex-col max-h-[280px]"
          >
            {/* Header do Painel */}
            <div className="bg-[#5A5A40] text-white px-3.5 py-2.5 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-2">
                <QrCode className="w-4 h-4 text-orange-400" />
                <div>
                  <h3 className="font-extrabold text-sm tracking-tight leading-none">Ficha #{lastScannedQrFicha}</h3>
                  <p className="text-[8px] text-white/70 uppercase font-bold tracking-wider mt-0.5">QR Code Bipado</p>
                </div>
              </div>
              <button
                onClick={() => setLastScannedQrFicha(null)}
                className="w-6 h-6 bg-white/10 hover:bg-white/20 active:scale-95 text-white flex items-center justify-center rounded-full transition-all text-xs font-bold"
              >
                ✕
              </button>
            </div>

            {/* Conteúdo - Lista de Produtos */}
            <div className="p-2.5 overflow-y-auto flex-1 space-y-2 bg-[#F5F5F0]/30 min-h-[105px]">
              {scannedOrder ? (
                <>
                  <div className="flex justify-between items-center border-b border-black/5 pb-1.5 mb-1.5">
                    <span className="text-[8px] font-black text-gray-400 uppercase">Status:</span>
                    <span className={`text-[8px] uppercase font-extrabold px-2 py-0.5 rounded-full ${
                      scannedOrder.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                      scannedOrder.status === 'preparing' ? 'bg-orange-100 text-orange-850' :
                      scannedOrder.status === 'ready' ? 'bg-green-100 text-green-800 animate-pulse' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {scannedOrder.status === 'pending' ? 'Pendente' : 
                       scannedOrder.status === 'preparing' ? 'Preparando' : 
                       scannedOrder.status === 'ready' ? 'Fichado Pronto!' : 
                       'Entregue/Zerado'}
                    </span>
                  </div>

                  <div className="space-y-1">
                    {scannedOrder.items.map((item: any, idx: number) => (
                      <div key={idx} className="flex items-center justify-between p-1.5 bg-white rounded-lg shadow-sm border border-black/5">
                        <div className="flex items-center gap-1.5 truncate">
                          <span className="w-5 h-5 bg-[#5A5A40]/10 text-[#5A5A40] rounded flex items-center justify-center font-black text-[10px] shrink-0">
                            {item.quantity}x
                          </span>
                          <span className="font-bold text-xs text-[#1A1A1A] truncate">{item.name}</span>
                        </div>
                        <span className="text-[7px] font-black uppercase text-gray-400 bg-gray-50 px-1 py-0.5 rounded shrink-0">
                          {item.sector || 'Geral'}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="py-6 text-center text-gray-400 italic flex flex-col items-center justify-center gap-1.5 h-full">
                  <AlertCircle className="w-6 h-6 text-orange-400 opacity-60 animate-bounce" />
                  <div>
                    <p className="font-extrabold text-[#1A1A1A] text-xs not-italic uppercase mb-0.5">Sem Pedido Ativo</p>
                    <p className="text-[10px] text-gray-500">Aguardando lançamento ou já entregue.</p>
                  </div>
                </div>
              )}
            </div>

            {/* Ações rápidas */}
            <div className="bg-gray-50 border-t border-black/5 p-2 flex gap-1.5 shrink-0">
              {scannedOrder ? (
                <>
                  {scannedOrder.status !== 'delivered' && (
                    <button
                      type="button"
                      onClick={async () => {
                        await firebaseService.updateOrderStatus(scannedOrder.id, 'delivered');
                        new Audio('https://assets.mixkit.co/active_storage/sfx/2567/2567-preview.mp3').play().catch(() => {});
                      }}
                      className="flex-1 py-1.5 bg-green-600 hover:bg-green-700 active:scale-95 text-white text-[10px] font-black uppercase rounded-lg transition-all shadow-md"
                    >
                      ✓ Dar Saída / Zerar
                    </button>
                  )}
                  {(scannedOrder.status === 'pending' || scannedOrder.status === 'preparing') && (
                    <button
                      type="button"
                      onClick={async () => {
                        await firebaseService.updateOrderStatus(scannedOrder.id, 'ready');
                        new Audio('https://assets.mixkit.co/active_storage/sfx/911/911-preview.mp3').play().catch(() => {});
                      }}
                      className="flex-1 py-1.5 bg-[#5A5A40] hover:bg-[#4A4A30] active:scale-95 text-white text-[10px] font-black uppercase rounded-lg transition-all shadow-md"
                    >
                      Pronto
                    </button>
                  )}
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setLastScannedQrFicha(null)}
                  className="flex-1 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-700 text-[10px] font-bold uppercase rounded-lg transition-all"
                >
                  Fechar Painel
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Toast de alerta ─────────────────────────────────────────────────── */}
      <AnimatePresence>
        {alertMessage && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed bottom-6 left-6 w-80 z-50"
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
