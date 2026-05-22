import React, { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, Send, Lock, FileText, Printer, Clock, QrCode, Camera, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { MenuItem, Order } from '../types';
import FullDashboard from '../components/FullDashboard';
import { Html5Qrcode } from 'html5-qrcode';
import { QRCodeSVG } from 'qrcode.react';
import { firebaseService } from '../services/firebaseService';

interface ReceptionProps {
  isAdmin?: boolean;
  orders: Order[];
}

export default function Reception({ isAdmin, orders }: ReceptionProps) {
  const [ticketNumber, setTicketNumber] = useState('');
  const [selectedItems, setSelectedItems] = useState<{ name: string; quantity: number }[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [orderToPrint, setOrderToPrint] = useState<{ ticket: string; items: { name: string; quantity: number }[] } | null>(null);
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [showReport, setShowReport] = useState(false);
  const [reportData, setReportData] = useState<any>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [deletingId, setDeletingId] = useState<string | number | null>(null);
  const [isScannerEnabled, setIsScannerEnabled] = useState(false);
  const [isKeyboardScannerEnabled, setIsKeyboardScannerEnabled] = useState(true);
  const [isTicketLocked, setIsTicketLocked] = useState(false);
  const [scannerMode, setScannerMode] = useState<'ticket' | 'product'>('ticket');
  const [lastScannedCode, setLastScannedCode] = useState<string | null>(null);
  const [scanStatus, setScanStatus] = useState<string | null>(null);
  const [isTicketInUse, setIsTicketInUse] = useState(false);
  const [submissionCountdown, setSubmissionCountdown] = useState<number | null>(null);
  const ticketNumberRef = useRef<string>('');
  const selectedItemsRef = useRef<{ name: string; quantity: number }[]>([]);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const idleTimerRef = useRef<NodeJS.Timeout | null>(null);
  const scanBuffer = useRef<string>('');
  const lastKeyTime = useRef<number>(0);

  useEffect(() => {
    const checkTicket = async () => {
      if (!ticketNumber || ticketNumber.length < 1) {
        setIsTicketInUse(false);
        return;
      }
      
      const existing = orders.find(o => String(o.ticket_number).trim() === ticketNumber.trim());
      setIsTicketInUse(!!existing);
      if (existing) {
        setScanStatus(`AVISO: Ficha #${ticketNumber} está em uso (${existing.status})`);
      }
    };

    const timer = setTimeout(checkTicket, 500);
    return () => clearTimeout(timer);
  }, [ticketNumber, orders]);

  useEffect(() => {
    ticketNumberRef.current = ticketNumber;
    selectedItemsRef.current = selectedItems;
  }, [ticketNumber, selectedItems]);

  // Handle Automatic Submission after 15 seconds of idle time
  const submitOrder = async (tNumber: string, items: { name: string; quantity: number }[]) => {
    if (isSubmitting) return false;
    setIsSubmitting(true);
    
    try {
      const orderItems = items.map(item => ({ 
        name: item.name, 
        quantity: item.quantity, 
        completed: false 
      }));
      
      await firebaseService.createOrder(tNumber, orderItems);

      // Reset local state
      setTicketNumber('');
      ticketNumberRef.current = '';
      setIsTicketLocked(false);
      setSelectedItems([]);
      selectedItemsRef.current = [];
      setScanStatus(`Pedido #${tNumber} ENVIADO!`);
      
      // Play success sound
      try {
        const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3');
        audio.volume = 0.5;
        audio.play().catch(() => {});
      } catch (e) {}

      // Reset status after 3 seconds
      setTimeout(() => setScanStatus(null), 3000);
      return true;
    } catch (error: any) {
      console.error('Error submitting order:', error);
      setScanStatus(`ERRO: ${error.message || 'Falha ao enviar'}`);
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    if (ticketNumber && selectedItems.length > 0 && !isSubmitting) {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      
      setSubmissionCountdown(10);
      
      idleTimerRef.current = setTimeout(() => {
        console.log(`Auto-submitting ticket #${ticketNumber} after 10s idle...`);
        submitOrder(ticketNumber, selectedItems);
      }, 10000);

      const interval = setInterval(() => {
        setSubmissionCountdown(prev => (prev !== null && prev > 0) ? prev - 1 : 0);
      }, 1000);

      return () => {
        if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
        clearInterval(interval);
      };
    } else {
      setSubmissionCountdown(null);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    }
  }, [ticketNumber, selectedItems, isSubmitting]);

  // Keyboard Scanner Logic (for physical USB scanners)
  useEffect(() => {
    if (!isKeyboardScannerEnabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in any input or textarea
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;

      const currentTime = Date.now();
      
      // If more than 100ms passed, it's likely a new scan or manual typing
      // Increased to 100ms for more tolerance
      if (currentTime - lastKeyTime.current > 100) {
        scanBuffer.current = e.key.length === 1 ? e.key : '';
      } else {
        if (e.key === 'Enter') {
          const code = scanBuffer.current.trim();
          if (code) {
            processScannedCode(code);
          }
          scanBuffer.current = '';
        } else if (e.key.length === 1) {
          scanBuffer.current += e.key;
        }
      }
      
      lastKeyTime.current = currentTime;
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isKeyboardScannerEnabled, menuItems, selectedItems, ticketNumber]);

  const processScannedCode = async (code: string) => {
    const cleanedCode = code.trim();
    if (!cleanedCode) return;

    // 1. Try format "TICKET|ITEM1,ITEM2..." or "TICKET;ITEM1;ITEM2..."
    const separators = ['|', ';', ':'];
    for (const sep of separators) {
      if (cleanedCode.includes(sep)) {
        const parts = cleanedCode.split(sep);
        const ficha = parts[0].trim();
        const itemsList = parts.slice(1).join(sep).split(/[,;]/); // Split by comma or semicolon
        
        let normalizedFicha = ficha;
        if (/FICHA[- ]?(\d+)/i.test(ficha)) {
          const match = ficha.match(/FICHA[- ]?(\d+)/i);
          if (match) normalizedFicha = match[1];
        }

        if (normalizedFicha && itemsList.length > 0 && /^\d+$/.test(normalizedFicha)) {
          setScanStatus(`QR Detectado: Ficha #${normalizedFicha} com ${itemsList.length} itens...`);
          
          // Map string items to menu items to get correct naming
          const itemsToSubmit = itemsList.map(itemStr => {
            const trimmed = itemStr.trim();
            // Try to find exact match in menu
            const matched = menuItems.find(m => m.name.toLowerCase() === trimmed.toLowerCase());
            return { name: matched ? matched.name : trimmed, quantity: 1 };
          }).filter(i => i.name.length > 0);

          if (itemsToSubmit.length > 0) {
            await submitOrder(normalizedFicha, itemsToSubmit);
            setTicketNumber('');
            setSelectedItems([]);
            return;
          }
        }
      }
    }

    // 2. Try JSON Coupon
    try {
      if (cleanedCode.startsWith('{')) {
        const data = JSON.parse(cleanedCode);
        if (data.items && Array.isArray(data.items)) {
          if (!ticketNumberRef.current) {
            setScanStatus("Bipe uma Ficha primeiro!");
            return;
          }
          data.items.forEach((it: any) => addItem(typeof it === 'string' ? it : it.name));
          setScanStatus(`${data.items.length} itens adicionados à Ficha #${ticketNumberRef.current}`);
          return;
        }
      }
    } catch (e) {}

    // 2. Is it a product?
    const product = menuItems.find(item => {
      if (!item.qr_code) return false;
      const targetQr = item.qr_code.trim();
      return cleanedCode === targetQr || cleanedCode.startsWith(targetQr) || String(item.id) === cleanedCode;
    });
    
    if (product) {
      if (!ticketNumberRef.current) {
        setScanStatus("Bipe uma Ficha primeiro!");
        return;
      }
      addItem(product.name);
      setScanStatus(`Adicionado: ${product.name}`);
      setTimeout(() => setScanStatus(null), 3000);
      return;
    }

    // 3. Is it a ticket number? (Numeric or FICHA-X, or Extra Ficha)
    const ficha = await firebaseService.resolveFicha(cleanedCode);
    
    if (ficha && (ficha !== cleanedCode || /^\d+$/.test(ficha))) {

      // SUBMIT PREVIOUS: If scanning any ficha while we have items staged
      if (selectedItemsRef.current.length > 0 && ticketNumberRef.current) {
        setScanStatus(`Enviando #${ticketNumberRef.current}...`);
        await submitOrder(ticketNumberRef.current, selectedItemsRef.current);
        const wasSame = ticketNumberRef.current === ficha;
        setSelectedItems([]);
        setTicketNumber('');
        if (wasSame) return; // Stop here if it was a "confirm scan"
      }

      const existingOrder = orders.find(o => String(o.ticket_number).trim() === ficha);
      if (existingOrder) {
        if (existingOrder.status === 'pending' || existingOrder.status === 'preparing') {
          // Transition -> READY
          setScanStatus(`Ficha #${ficha} - Marcando PRONTO...`);
          await firebaseService.updateOrderStatus(existingOrder.id, 'ready');
          setScanStatus(`FICHA #${ficha} PRONTA!`);
          setTicketNumber('');
          ticketNumberRef.current = '';
          setIsTicketLocked(false);
          try {
            new Audio('https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3').play().catch(() => {});
          } catch (e) {}
          return;
        } else if (existingOrder.status === 'ready') {
          // Transition -> DELIVERED (Recycle)
          setScanStatus(`Ficha #${ficha} - ENTREGANDO...`);
          await firebaseService.updateOrderStatus(existingOrder.id, 'delivered');
          setScanStatus(`FICHA #${ficha} LIBERADA!`);
          setTicketNumber('');
          ticketNumberRef.current = '';
          setIsTicketLocked(false);
          return;
        } else {
          setScanStatus(`Ficha #${ficha} em uso (${existingOrder.status})`);
          setTimeout(() => setScanStatus(null), 3000);
          return;
        }
      }

      // Default: Start new draft for this ficha
      setTicketNumber(ficha);
      setIsTicketLocked(true);
      setScanStatus(`MODO: FICHA #${ficha}`);
      setTimeout(() => setScanStatus(null), 3000);
      return;
    }

    setScanStatus(`Não reconhecido: ${cleanedCode}`);
    setTimeout(() => setScanStatus(null), 3000);
  };

  useEffect(() => {
    firebaseService.getMenu().then(setMenuItems).catch(err => console.error("Failed to fetch menu:", err));
  }, []);

  useEffect(() => {
    const unsubscribe = firebaseService.listenToRecentOrders((orders) => {
      setRecentOrders(orders);
    });
    return () => unsubscribe();
  }, []);

  const onScanSuccessRef = useRef<(text: string) => void>(() => {});

  useEffect(() => {
    onScanSuccessRef.current = async (decodedText: string) => {
      if (decodedText === lastScannedCode) return;
      setLastScannedCode(decodedText);
      
      // Reset lastScannedCode after 2 seconds to allow re-scanning if needed
      setTimeout(() => setLastScannedCode(null), 2000);

      // Use the unified processing logic
      await processScannedCode(decodedText);
    };
  }, [lastScannedCode, menuItems, selectedItems, ticketNumber]);

  useEffect(() => {
    if (isScannerEnabled) {
      const html5QrCode = new Html5Qrcode("qr-reader");
      scannerRef.current = html5QrCode;

      const config = { 
        fps: 20, 
        qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
          const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
          const size = Math.floor(minEdge * 0.7);
          return { width: size, height: size };
        },
        aspectRatio: 1.0,
        experimentalFeatures: {
          useBarCodeDetectorIfSupported: true
        }
      };

      html5QrCode.start(
        { facingMode: "environment" },
        config,
        (text) => onScanSuccessRef.current(text),
        onScanFailure
      ).catch(err => {
        console.error("Failed to start scanner:", err);
        setScanStatus("Erro ao abrir câmera. Verifique as permissões.");
      });

      return () => {
        if (scannerRef.current) {
          if (scannerRef.current.isScanning) {
            scannerRef.current.stop().then(() => {
              scannerRef.current?.clear();
            }).catch(console.error);
          } else {
            scannerRef.current.clear();
          }
        }
      };
    }
  }, [isScannerEnabled]);

  const onScanFailure = (error: any) => {
    // Silently ignore failures as they happen constantly during scanning
  };

  const addItem = (name: string) => {
    setSelectedItems(prev => {
      const existing = prev.find(i => i.name === name);
      if (existing) {
        return prev.map(i => i.name === name ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, { name, quantity: 1 }];
    });
  };

  const removeItem = (name: string) => {
    setSelectedItems(prev => {
      const existing = prev.find(i => i.name === name);
      if (existing && existing.quantity > 1) {
        return prev.map(i => i.name === name ? { ...i, quantity: i.quantity - 1 } : i);
      }
      return prev.filter(i => i.name !== name);
    });
  };

  const handleDeleteOrder = async (id: string) => {
    try {
      await firebaseService.deleteOrder(id);
      setDeletingId(null);
    } catch (error) {
      alert('Erro ao excluir pedido.');
    }
  };

  const handlePrint = (order: { ticket_number: string; items: any[] }, autoPrint = true) => {
    setOrderToPrint({
      ticket: order.ticket_number,
      items: order.items.map(i => ({ name: i.name, quantity: i.quantity }))
    });
    
    if (autoPrint) {
      // Small delay to ensure the DOM is updated with the new order data before printing
      setTimeout(() => {
        window.print();
      }, 150);
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!ticketNumber) return;

    if (selectedItems.length > 0) {
      await submitOrder(ticketNumber, selectedItems);
      return;
    }

    const existingOrder = orders.find(o => o.ticket_number === ticketNumber);
    if (existingOrder) {
      if (existingOrder.status === 'pending' || existingOrder.status === 'preparing') {
        setScanStatus(`Ficha #${ticketNumber} - Marcando como PRONTO...`);
        await firebaseService.updateOrderStatus(existingOrder.id, 'ready');
        setScanStatus(`Ficha #${ticketNumber} está PRONTA!`);
        setTimeout(() => setScanStatus(null), 3000);
        setTicketNumber('');
        setIsTicketLocked(false);
      } else if (existingOrder.status === 'ready') {
        setScanStatus(`Ficha #${ticketNumber} - Marcando como ENTREGUE...`);
        await firebaseService.updateOrderStatus(existingOrder.id, 'delivered');
        setScanStatus(`Ficha #${ticketNumber} ENTREGUE!`);
        setTimeout(() => setScanStatus(null), 3000);
        setTicketNumber('');
        setIsTicketLocked(false);
      }
    }
  };

  const handleCloseKitchen = async () => {
    try {
      const data = await firebaseService.closeKitchen();
      setReportData(data);
      setShowReport(true);
    } catch (error: any) {
      alert('Falha ao fechar cozinha: ' + error.message);
    }
  };

  const handleClearAll = async () => {
    try {
      await firebaseService.clearRecentOrders();
      setShowClearConfirm(false);
    } catch (error) {
      alert('Erro ao limpar pedidos.');
    }
  };

  // Group items by category
  const groupedItems = menuItems.reduce((acc, item) => {
    const cat = item.category_name || 'Outros';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {} as Record<string, MenuItem[]>);

  return (
    <div className="max-w-6xl mx-auto relative pb-24 lg:pb-0">
      {isAdmin && <FullDashboard />}
      
      <header className="mb-8 flex flex-col md:flex-row gap-4 justify-between items-start md:items-end">
        <div className="w-full md:w-auto">
          <h1 className="text-4xl font-serif italic text-[#5A5A40]">Nova Ficha</h1>
          <p className="text-gray-500">Lançamento de pedidos para a cozinha</p>
          <div className="flex flex-wrap gap-3 mt-4">
            {isAdmin && (
              <span className="text-[10px] font-bold uppercase text-gray-400 bg-gray-100 px-2 py-0.5 rounded">Admin Mode</span>
            )}
            <div className="flex items-center gap-2 bg-white border border-black/5 px-3 py-1.5 rounded-xl shadow-sm flex-1 md:flex-none justify-between md:justify-start">
              <div className="flex items-center gap-2">
                <QrCode className={`w-4 h-4 ${isKeyboardScannerEnabled ? 'text-[#5A5A40]' : 'text-gray-300'}`} />
                <span className="text-[10px] md:text-xs font-bold text-gray-500 uppercase">USB/Sem Fio</span>
              </div>
              <button
                onClick={() => setIsKeyboardScannerEnabled(!isKeyboardScannerEnabled)}
                className={`relative inline-flex h-5 w-10 items-center rounded-full transition-colors focus:outline-none ${
                  isKeyboardScannerEnabled ? 'bg-[#5A5A40]' : 'bg-gray-200'
                }`}
              >
                <span
                  className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                    isKeyboardScannerEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            <div className="flex items-center gap-2 bg-white border border-black/5 px-3 py-1.5 rounded-xl shadow-sm flex-1 md:flex-none justify-between md:justify-start">
              <div className="flex items-center gap-2">
                <Camera className={`w-4 h-4 ${isScannerEnabled ? 'text-[#5A5A40]' : 'text-gray-300'}`} />
                <span className="text-[10px] md:text-xs font-bold text-gray-500 uppercase">Câmera</span>
              </div>
              <button
                onClick={() => {
                  setIsScannerEnabled(!isScannerEnabled);
                  setScannerMode('ticket');
                  setScanStatus(null);
                }}
                className={`relative inline-flex h-5 w-10 items-center rounded-full transition-colors focus:outline-none ${
                  isScannerEnabled ? 'bg-[#5A5A40]' : 'bg-gray-200'
                }`}
              >
                <span
                  className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                    isScannerEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          {isAdmin && (
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('change-view', { detail: 'history' }))}
              className="flex-1 md:flex-none px-4 py-2 bg-white text-[#5A5A40] border border-black/5 rounded-xl font-bold text-xs md:text-sm flex items-center justify-center gap-2 hover:bg-gray-50 transition-colors shadow-sm"
            >
              <FileText className="w-4 h-4" />
              Histórico
            </button>
          )}
          <button
            onClick={handleCloseKitchen}
            className="flex-1 md:flex-none px-4 py-2 bg-red-50 text-red-600 rounded-xl font-bold text-xs md:text-sm flex items-center justify-center gap-2 hover:bg-red-100 transition-colors"
          >
            <Lock className="w-4 h-4" />
            Fechar
          </button>
        </div>
      </header>

      {/* Report Modal */}
      <AnimatePresence>
        {showReport && reportData && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-3xl p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl"
            >
              <div className="flex justify-between items-center mb-8">
                <div>
                  <h2 className="text-2xl font-serif italic text-[#5A5A40] flex items-center gap-2">
                    <FileText className="w-6 h-6" />
                    Relatório de Fechamento
                  </h2>
                  <p className="text-sm text-gray-500">{new Date(reportData.date).toLocaleDateString()} • {new Date(reportData.date).toLocaleTimeString()}</p>
                </div>
                <button 
                  onClick={() => setShowReport(false)}
                  className="p-2 hover:bg-gray-100 rounded-full"
                >
                  ✕
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                <div className="bg-[#F5F5F0] p-4 rounded-xl text-center">
                  <span className="text-xs uppercase font-bold text-gray-400 block mb-1">Receita Total</span>
                  <span className="text-3xl font-bold text-[#1A1A1A]">
                    R$ {reportData.totalRevenue?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="bg-[#F5F5F0] p-4 rounded-xl text-center">
                  <span className="text-xs uppercase font-bold text-gray-400 block mb-1">Total Pedidos</span>
                  <span className="text-3xl font-bold text-[#1A1A1A]">{reportData.totalOrders}</span>
                </div>
              </div>

              <div className="space-y-6">
                <div>
                  <h3 className="text-sm font-bold uppercase text-gray-400 mb-3">Itens Mais Vendidos</h3>
                  <div className="space-y-2">
                    {reportData.items.map((item: any, index: number) => (
                      <div key={item.name} className="flex items-center gap-3">
                        <span className="w-6 text-sm font-mono text-gray-300">{index + 1}</span>
                        <div className="flex-1 bg-[#F5F5F0] rounded-lg h-8 relative overflow-hidden">
                          <div 
                            className="absolute top-0 left-0 h-full bg-[#5A5A40]/10"
                            style={{ width: `${(item.count / reportData.items[0].count) * 100}%` }}
                          />
                          <div className="absolute inset-0 flex items-center justify-between px-3">
                            <span className="font-medium text-sm">{item.name}</span>
                            <div className="flex items-center gap-4">
                              <span className="text-xs text-gray-400">R$ {item.total?.toFixed(2)}</span>
                              <span className="font-bold text-sm">{item.count}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-bold uppercase text-gray-400 mb-3">Vendas por Horário</h3>
                  <div className="h-32 flex items-end gap-1">
                    {Object.entries(reportData.hourlyBreakdown).map(([hour, count]: [string, any]) => (
                      <div key={hour} className="flex-1 flex flex-col items-center gap-1 group">
                        <div 
                          className="w-full bg-[#5A5A40]/20 rounded-t-sm hover:bg-[#5A5A40]/40 transition-colors relative"
                          style={{ height: `${(count / (Math.max(...Object.values(reportData.hourlyBreakdown) as number[]) || 1)) * 100}%` }}
                        >
                          <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-xs font-bold opacity-0 group-hover:opacity-100 transition-opacity">
                            {count}
                          </span>
                        </div>
                        <span className="text-[10px] text-gray-400">{hour}h</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-8 pt-6 border-t border-gray-100 flex justify-end">
                <button
                  onClick={() => window.print()}
                  className="px-6 py-3 bg-[#151619] text-white rounded-xl font-bold hover:bg-black flex items-center gap-2"
                >
                  <FileText className="w-4 h-4" />
                  Imprimir Relatório
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Mobile Summary */}
      <AnimatePresence>
        {selectedItems.length > 0 && (
          <motion.div
            initial={{ y: 100 }}
            animate={{ y: 0 }}
            exit={{ y: 100 }}
            className="fixed bottom-4 left-4 right-4 z-40 lg:hidden"
          >
            <div className="bg-[#5A5A40] text-white p-4 rounded-2xl shadow-2xl flex items-center justify-between border border-white/10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center font-bold">
                  {selectedItems.reduce((acc, i) => acc + i.quantity, 0)}
                </div>
                <div>
                  <p className="text-[10px] uppercase font-bold text-white/60">Itens no pedido</p>
                  <p className="font-bold">Ficha #{ticketNumber || '?'}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    const summaryElement = document.getElementById('order-summary');
                    summaryElement?.scrollIntoView({ behavior: 'smooth' });
                  }}
                  className="px-4 py-2 bg-white/10 rounded-xl text-xs font-bold uppercase"
                >
                  Ver
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={isSubmitting || !ticketNumber || isTicketInUse}
                  className="px-6 py-2 bg-white text-[#5A5A40] rounded-xl text-xs font-bold uppercase shadow-lg disabled:opacity-50"
                >
                  {isSubmitting ? '...' : isTicketInUse ? 'Em Uso' : 'Enviar'}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Menu Selection (2 Cols) */}
        <div className="lg:col-span-2 space-y-8">
          {isKeyboardScannerEnabled && !isScannerEnabled && (
            <div className="bg-[#5A5A40] text-white p-4 rounded-2xl shadow-lg border border-white/10 mb-8 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center animate-pulse">
                  <QrCode className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-lg">Modo Automático</h3>
                  <p className="text-sm text-white/70">
                    Fixe a ficha, bipe produtos. Envio automático em 15s.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                {submissionCountdown !== null && (
                  <div className="bg-orange-500 px-3 py-1 rounded-lg font-bold text-xs animate-bounce">
                    Enviando em {submissionCountdown}s
                  </div>
                )}
                {scanStatus && (
                  <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="bg-white/20 px-4 py-2 rounded-xl font-medium text-sm"
                  >
                    {scanStatus}
                  </motion.div>
                )}
              </div>
            </div>
          )}

          {isScannerEnabled && (
            <div className="bg-white p-4 md:p-6 rounded-3xl shadow-sm border border-black/5 overflow-hidden">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xs uppercase tracking-widest font-bold text-gray-400">Scanner Ativo</h2>
                <div className="flex gap-2">
                  <button
                    onClick={() => setScannerMode('ticket')}
                    className={`px-3 py-1 rounded-lg text-[10px] font-bold uppercase transition-colors ${
                      scannerMode === 'ticket' ? 'bg-[#5A5A40] text-white' : 'bg-gray-100 text-gray-400'
                    }`}
                  >
                    Ficha
                  </button>
                  <button
                    onClick={() => setScannerMode('product')}
                    className={`px-3 py-1 rounded-lg text-[10px] font-bold uppercase transition-colors ${
                      scannerMode === 'product' ? 'bg-[#5A5A40] text-white' : 'bg-gray-100 text-gray-400'
                    }`}
                  >
                    Produtos
                  </button>
                  <button
                    onClick={() => setIsScannerEnabled(false)}
                    className="p-1 bg-red-50 text-red-500 rounded-lg"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
              
              <div className="relative aspect-square max-w-md mx-auto bg-black rounded-2xl overflow-hidden border-4 border-[#F5F5F0]">
                <div id="qr-reader" className="w-full h-full"></div>
                {/* Custom Overlay */}
                <div className="absolute inset-0 border-[40px] border-black/30 pointer-events-none">
                   <div className="w-full h-full border-2 border-white/50 rounded-lg relative">
                      <div className="absolute top-0 left-0 w-4 h-4 border-t-4 border-l-4 border-[#5A5A40]" />
                      <div className="absolute top-0 right-0 w-4 h-4 border-t-4 border-r-4 border-[#5A5A40]" />
                      <div className="absolute bottom-0 left-0 w-4 h-4 border-b-4 border-l-4 border-[#5A5A40]" />
                      <div className="absolute bottom-0 right-0 w-4 h-4 border-b-4 border-r-4 border-[#5A5A40]" />
                   </div>
                </div>

                {/* Manual Capture Button Overlay */}
                <div className="absolute bottom-6 left-0 right-0 flex justify-center">
                  <button
                    onClick={() => {
                      // Reset lastScannedCode to allow re-scanning the same code if the user clicks capture
                      setLastScannedCode(null);
                      
                      const flash = document.createElement('div');
                      flash.className = 'absolute inset-0 bg-white z-50 animate-out fade-out duration-300';
                      document.getElementById('qr-reader')?.appendChild(flash);
                      setTimeout(() => flash.remove(), 300);
                      
                      setScanStatus("Capturando...");
                      
                      // Clear "Capturando..." after 1.5s if no scan is detected
                      setTimeout(() => {
                        setScanStatus(prev => prev === "Capturando..." ? null : prev);
                      }, 1500);
                    }}
                    className="w-16 h-16 bg-white rounded-full border-4 border-[#5A5A40] shadow-xl flex items-center justify-center active:scale-90 transition-transform"
                  >
                    <div className="w-12 h-12 bg-[#5A5A40]/10 rounded-full border-2 border-[#5A5A40]/30" />
                  </button>
                </div>
              </div>
              
              {scanStatus && (
                <motion.div
                  key={scanStatus}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`mt-4 p-3 rounded-xl text-center text-sm font-medium flex items-center justify-center gap-2 ${
                    scanStatus === "Capturando..." 
                      ? "bg-blue-50 text-blue-600 animate-pulse" 
                      : scanStatus.includes("não reconhecido") || scanStatus.includes("travada")
                        ? "bg-red-50 text-red-600"
                        : "bg-green-50 text-green-600"
                  }`}
                >
                  {scanStatus === "Capturando..." && <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" />}
                  {scanStatus.includes("Adicionado") && <Plus className="w-4 h-4" />}
                  {scanStatus.includes("fixada") && <Lock className="w-4 h-4" />}
                  {scanStatus}
                </motion.div>
              )}
              
              <div className="mt-4 flex justify-center gap-4">
                <div className="flex items-center gap-2 text-[10px] font-bold text-gray-400 uppercase">
                  <div className={`w-2 h-2 rounded-full ${scannerMode === 'ticket' ? 'bg-blue-500 animate-pulse' : 'bg-gray-200'}`} />
                  1. Ficha
                </div>
                <div className="flex items-center gap-2 text-[10px] font-bold text-gray-400 uppercase">
                  <div className={`w-2 h-2 rounded-full ${scannerMode === 'product' ? 'bg-blue-500 animate-pulse' : 'bg-gray-200'}`} />
                  2. Produtos
                </div>
              </div>
            </div>
          )}

          {(Object.entries(groupedItems) as [string, MenuItem[]][]).map(([category, items]) => (
            <div key={category} className="bg-white p-4 md:p-6 rounded-3xl shadow-sm border border-black/5">
              <h2 className="text-xs uppercase tracking-widest font-bold text-gray-400 mb-4">{category}</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 md:gap-3">
                {items.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => addItem(item.name)}
                    className="flex items-center justify-between p-3 md:p-4 rounded-xl border border-gray-100 hover:border-[#5A5A40] hover:bg-[#F5F5F0] transition-all group text-left"
                  >
                    <span className="font-medium text-sm md:text-base">{item.name}</span>
                    <Plus className="w-5 h-5 text-gray-300 group-hover:text-[#5A5A40]" />
                  </button>
                ))}
              </div>
            </div>
          ))}
          {menuItems.length === 0 && (
            <div className="bg-white p-12 rounded-3xl shadow-sm border border-black/5 text-center text-gray-400 italic">
              Carregando cardápio...
            </div>
          )}
        </div>

        {/* Order Summary (1 Col) */}
        <div className="lg:col-span-1" id="order-summary">
          <form onSubmit={handleSubmit} className="flex flex-col gap-6 sticky top-8">
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-black/5 flex-1">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xs uppercase tracking-widest font-bold text-gray-400">Resumo do Pedido</h2>
                {submissionCountdown !== null && (
                  <div className="flex items-center gap-1.5 text-orange-600 font-bold text-[10px] animate-pulse">
                    <Clock className="w-3 h-3" />
                    ENVIO EM {submissionCountdown}S
                  </div>
                )}
              </div>
              
              <div className="mb-6">
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-xs font-bold text-gray-500 uppercase">Número da Ficha</label>
                  {isTicketLocked && (
                    <button
                      type="button"
                      onClick={() => setIsTicketLocked(false)}
                      className="text-[10px] font-bold text-red-500 uppercase flex items-center gap-1"
                    >
                      <Lock className="w-3 h-3" />
                      Trocar Ficha
                    </button>
                  )}
                </div>
                <div className="relative">
                  <input
                    type="text"
                    required
                    readOnly={isTicketLocked}
                    value={ticketNumber}
                    onChange={e => setTicketNumber(e.target.value)}
                    placeholder="Ex: 123"
                    className={`w-full p-4 rounded-xl border-none focus:ring-2 focus:ring-[#5A5A40] text-2xl font-bold transition-colors ${
                      isTicketLocked ? 'bg-[#5A5A40] text-white' : 'bg-[#F5F5F0] text-black'
                    }`}
                  />
                  {isTicketLocked && (
                    <div className="absolute right-4 top-1/2 -translate-y-1/2">
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="bg-white/20 p-2 rounded-full"
                      >
                        <Lock className="w-5 h-5 text-white" />
                      </motion.div>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                {selectedItems.length === 0 && (
                  <p className="text-center py-8 text-gray-400 italic">Nenhum item selecionado</p>
                )}
                {selectedItems.map((item, index) => (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    key={item.name}
                    className="flex items-center justify-between p-3 bg-[#F5F5F0] rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-8 h-8 bg-[#5A5A40] text-white rounded-full flex items-center justify-center font-bold text-sm">
                        {item.quantity}x
                      </span>
                      <span className="font-medium">{item.name}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeItem(item.name)}
                      className="p-1 text-red-400 hover:text-red-600"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </motion.div>
                ))}
              </div>
            </div>

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={isSubmitting || !ticketNumber}
                className="flex-1 py-6 bg-[#5A5A40] text-white rounded-3xl font-bold text-xl flex items-center justify-center gap-3 hover:bg-[#4A4A30] disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-[#5A5A40]/20"
              >
                {isSubmitting ? 'Enviando...' : (
                  <>
                    {selectedItems.length > 0 ? 'Enviar Pedido' : 'Consultar/Atualizar'}
                    <Send className="w-6 h-6" />
                  </>
                )}
              </button>
              
              <button
                type="button"
                onClick={() => orderToPrint && window.print()}
                disabled={!orderToPrint}
                className="px-6 bg-white text-[#5A5A40] border-2 border-[#5A5A40] rounded-3xl font-bold flex items-center justify-center gap-2 hover:bg-[#F5F5F0] disabled:opacity-30 transition-all shadow-md"
                title="Reimprimir última ficha"
              >
                <Printer className="w-6 h-6" />
              </button>
            </div>

            {/* Recent Orders History */}
            <div className="mt-8 bg-white p-6 rounded-3xl shadow-sm border border-black/5">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xs uppercase tracking-widest font-bold text-gray-400">Últimos 10 Lançados</h2>
                {isAdmin && recentOrders.length > 0 && (
                  <div className="flex items-center gap-2">
                    {showClearConfirm ? (
                      <div className="flex items-center gap-2 bg-red-50 p-1 rounded-lg border border-red-100">
                        <span className="text-[9px] font-bold text-red-600 px-1">Certeza?</span>
                        <button
                          type="button"
                          onClick={handleClearAll}
                          className="text-[9px] font-bold uppercase bg-red-500 text-white px-2 py-1 rounded hover:bg-red-600"
                        >
                          Sim
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowClearConfirm(false)}
                          className="text-[9px] font-bold uppercase bg-gray-200 text-gray-600 px-2 py-1 rounded hover:bg-gray-300"
                        >
                          Não
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setShowClearConfirm(true)}
                        className="text-[10px] font-bold uppercase text-red-500 hover:text-red-700 flex items-center gap-1"
                      >
                        <Trash2 className="w-3 h-3" />
                        Limpar Tudo
                      </button>
                    )}
                  </div>
                )}
              </div>
              <div className="space-y-3">
                {recentOrders.length === 0 && (
                  <p className="text-center py-4 text-gray-400 italic text-sm">Nenhum pedido recente</p>
                )}
                {recentOrders.map((order) => (
                  <div key={order.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100 group">
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <span className="font-black text-lg text-[#5A5A40]">#{order.ticket_number}</span>
                        <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${
                          order.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                          order.status === 'preparing' ? 'bg-orange-100 text-orange-700' :
                          order.status === 'ready' ? 'bg-green-100 text-green-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {order.status === 'preparing' ? 'Esquentando o fuzuê' : 
                           order.status === 'ready' ? 'Tá no ponto, sô!' : 
                           order.status}
                        </span>
                      </div>
                      <span className="text-[10px] text-gray-400 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(order.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <p className="text-[10px] font-medium text-gray-500 truncate max-w-[150px] mt-1">
                        {order.items.map(i => `${i.quantity}x ${i.name}`).join(', ')}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {deletingId === order.id ? (
                        <div className="flex items-center gap-1 bg-red-50 p-1 rounded-lg border border-red-100">
                          <button
                            type="button"
                            onClick={() => handleDeleteOrder(order.id)}
                            className="text-[9px] font-bold uppercase bg-red-500 text-white px-2 py-1 rounded hover:bg-red-600"
                          >
                            Sim
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeletingId(null)}
                            className="text-[9px] font-bold uppercase bg-gray-200 text-gray-600 px-2 py-1 rounded hover:bg-gray-300"
                          >
                            Não
                          </button>
                        </div>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => handlePrint(order)}
                            className="p-2 bg-white text-[#5A5A40] border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors shadow-sm"
                            title="Imprimir esta ficha"
                          >
                            <Printer className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeletingId(order.id)}
                            className="p-2 bg-white text-red-500 border border-gray-200 rounded-lg hover:bg-red-50 transition-colors shadow-sm"
                            title="Excluir pedido"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </form>
        </div>
      </div>

      {/* Hidden Thermal Receipt for Printing */}
      {orderToPrint && (
        <div id="print-receipt" className="hidden print:block">
          <div className="receipt-header">
            <h1 className="font-black text-xl">ARRAIÁ DO LAR</h1>
            <p className="text-sm">SÃO CRISTÓVÃO 2026</p>
            <p className="text-[10pt] mt-1">{new Date().toLocaleString('pt-BR')}</p>
          </div>
          
          <div className="receipt-ticket">
            FICHA: {orderToPrint.ticket}
          </div>

          <div className="flex flex-col items-center justify-center my-4 py-4 border-y border-dashed border-black">
            <QRCodeSVG value={orderToPrint.ticket} size={150} level="H" />
            <p className="mt-2 text-[8pt] font-bold">ESCANEIE PARA ENTREGAR</p>
          </div>
          
          <div className="receipt-items mb-4">
            <div className="receipt-item font-bold border-b border-black mb-1">
              <span>ITEM</span>
              <span>QTD</span>
            </div>
            {orderToPrint.items.map((item, i) => (
              <div key={i} className="receipt-item">
                <span>{item.name}</span>
                <span>{item.quantity}x</span>
              </div>
            ))}
          </div>
          
          <div className="receipt-footer">
            <p>Obrigado pela colaboração!</p>
            <p className="mt-1 font-mono text-[8pt]">#{Math.random().toString(36).substr(2, 9).toUpperCase()}</p>
          </div>
        </div>
      )}
    </div>
  );
}
