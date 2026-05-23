import React, { useState, useEffect, useRef, useCallback } from 'react';
import { QrCode, CheckCircle2, Loader2, Camera, UserCheck, Timer, FileUp, Files } from 'lucide-react';
import { Scanner } from '@yudiel/react-qr-scanner';
import { firebaseService } from '../services/firebaseService';
import * as pdfjsLib from 'pdfjs-dist';
import { BrowserQRCodeReader } from '@zxing/library';
import { audioService } from '../services/audioService';

// Instala o worker do PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

export function KitchenScanner() {
  const [scanStatus, setScanStatus] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isSubmittingRef = useRef(false);
  const [useCamera, setUseCamera] = useState(false);
  const [lastScanned, setLastScanned] = useState<string | null>(null);
  const [activeFicha, setActiveFicha] = useState<string | null>(null);
  const [stagedItems, setStagedItems] = useState<any[]>([]);
  const scannerInputRef = useRef<string>("");
  const stagedItemsRef = useRef<any[]>([]);
  const activeFichaRef = useRef<string | null>(null);
  const timerRef = useRef<NodeJS.Timeout|null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isProcessingPdf, setIsProcessingPdf] = useState(false);
  const qrReader = useRef(new BrowserQRCodeReader());

  // Sync refs with state for access in callbacks
  useEffect(() => {
    stagedItemsRef.current = stagedItems;
    activeFichaRef.current = activeFicha;
  }, [stagedItems, activeFicha]);

  const submitOrder = async (ficha: string, items: any[]) => {
    if (items.length === 0) return;
    try {
      await firebaseService.createOrder(ficha, items.map(it => ({
        ...it,
        quantity: it.quantity || 1,
        completed: false
      })));
      
      setScanStatus(`ENVIADO PARA COZINHA: FICHA #${ficha}`);
      audioService.playInternalOrderSound();
    } catch (err: any) {
      console.error("Failed to submit order:", err);
      setScanStatus(`ERRO: ${err.message || 'Falha ao enviar'}`);
      setTimeout(() => setScanStatus(null), 5000);
    }
  };

  const processScannedCode = useCallback(async (code: string) => {
    if (isSubmittingRef.current) return;
    
    const input = code.trim();
    if (!input) return;

    isSubmittingRef.current = true;
    setIsSubmitting(true);

    try {
      // 1. Try to parse as JSON first (full order coupon)
      try {
        if (input.startsWith('{')) {
          const data = JSON.parse(input);
          if (data.items && Array.isArray(data.items)) {
            if (!activeFichaRef.current) {
              setScanStatus("Bipe uma Ficha primeiro!");
              return;
            }
            const itemsFromCoupon = data.items.map((it: any) => typeof it === 'string' ? { name: it } : it);
            const newItems = [...stagedItemsRef.current, ...itemsFromCoupon];
            setStagedItems(newItems);
            setScanStatus(`${itemsFromCoupon.length} itens adicionados à Ficha #${activeFichaRef.current}`);
            
            if (timerRef.current) clearTimeout(timerRef.current);
            timerRef.current = setTimeout(() => {
              if (activeFichaRef.current && stagedItemsRef.current.length > 0) {
                submitOrder(activeFichaRef.current, stagedItemsRef.current);
                setStagedItems([]);
                setActiveFicha(null);
              }
            }, 10000); // 10s for full coupon
            return;
          }
        }
      } catch (e) {}

      // 2. Check if it's a menu item QR code
      const menu = await firebaseService.getMenu();
      const parsedScanned = firebaseService.parseQR(input);
      const detectedItem = menu.find(item => {
        if (!item.qr_code) return false;
        const target = item.qr_code.trim().toLowerCase();
        if (target === input.trim().toLowerCase()) return true;

        const parsedTarget = firebaseService.parseQR(target);
        return parsedTarget.value === parsedScanned.value && parsedScanned.type === 'product';
      });
      
      if (detectedItem) {
        if (!activeFichaRef.current) {
          setScanStatus("Bipe uma Ficha primeiro!");
          return;
        }
        
        const newItems = [...stagedItemsRef.current, { 
          menu_item_id: detectedItem.id,
          name: detectedItem.name,
          category_name: detectedItem.category_name,
          price: detectedItem.price,
          sector: detectedItem.sector,
          quantity: 1
        }];
        setStagedItems(newItems);
        setScanStatus(`${detectedItem.name} adicionado à Ficha #${activeFichaRef.current}`);
        
        // Timer for auto-submit
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
          if (activeFichaRef.current && stagedItemsRef.current.length > 0) {
            submitOrder(activeFichaRef.current, stagedItemsRef.current);
            setStagedItems([]);
            setActiveFicha(null);
          }
        }, 10000);
        return;
      }

      // 3. Treat as Ficha Number
      const ficha = await firebaseService.resolveFicha(input);

      if (ficha && (ficha !== input || /^\d+$/.test(ficha))) {
        
        // SWITCH OR SUBMIT: If scanning same ficha with items OR different ficha with items
        if (stagedItemsRef.current.length > 0 && activeFichaRef.current) {
          if (timerRef.current) clearTimeout(timerRef.current);
          await submitOrder(activeFichaRef.current, stagedItemsRef.current);
          const wasSameFicha = activeFichaRef.current === ficha;
          setStagedItems([]);
          stagedItemsRef.current = [];
          setActiveFicha(null);
          activeFichaRef.current = null;
          
          if (wasSameFicha) return; // Just submitted, stop here.
        }

        // Check DB for existing order status
        const existingOrder = await firebaseService.checkFichaActive(ficha);

        if (existingOrder) {
          if (existingOrder.status === 'preparing' || existingOrder.status === 'pending') {
            await firebaseService.updateOrderStatus(existingOrder.id, 'ready');
            setScanStatus(`FICHA #${ficha} PRONTA!`);
            setActiveFicha(null);
            activeFichaRef.current = null;
            setStagedItems([]);
            stagedItemsRef.current = [];
            audioService.playExternalReadySound();
          } else if (existingOrder.status === 'ready') {
            await firebaseService.updateOrderStatus(existingOrder.id, 'delivered');
            setScanStatus(`FICHA #${ficha} LIBERADA!`);
            setActiveFicha(null);
            activeFichaRef.current = null;
            setStagedItems([]);
            stagedItemsRef.current = [];
            audioService.playKitchenSuccessDelivered();
          }
        } else {
          setActiveFicha(ficha);
          activeFichaRef.current = ficha;
          setStagedItems([]);
          stagedItemsRef.current = [];
          setScanStatus(`MODO: FICHA #${ficha}`);
          setLastScanned(ficha);
        }
      } else {
        setScanStatus("Código não reconhecido.");
      }

    } catch (error: any) {
      console.error(error);
      setScanStatus("Erro no processamento.");
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
      setTimeout(() => setScanStatus(null), 4000);
    }
  }, []);

  // Physical Scanner Logic (Keyboard Emulation)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        if (scannerInputRef.current.length > 0) {
          processScannedCode(scannerInputRef.current);
          scannerInputRef.current = "";
        }
      } else {
        if (e.key.length === 1) {
          scannerInputRef.current += e.key;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [processScannedCode]);

  const handlePdfUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsProcessingPdf(true);
    setScanStatus("Iniciando leitura de PDF...");

    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
      let qrsFound = 0;
      const uniqueCodes = new Set<string>();

      for (let i = 1; i <= pdf.numPages; i++) {
        setScanStatus(`Processando página ${i} de ${pdf.numPages}...`);
        const page = await pdf.getPage(i);
        const scale = 4.0; // Even higher resolution for small QR codes
        const viewport = page.getViewport({ scale });
        
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (!context) continue;

        canvas.height = viewport.height;
        canvas.width = viewport.width;

        await (page as any).render({ 
          canvasContext: context, 
          viewport: viewport
        }).promise;

        // Apply basic contrast enhancement to the page canvas
        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        for (let j = 0; j < data.length; j += 4) {
          // Simple high-contrast thresholding
          const avg = (data[j] + data[j + 1] + data[j + 2]) / 3;
          const val = avg > 160 ? 255 : 0;
          data[j] = data[j + 1] = data[j + 2] = val;
        }
        context.putImageData(imageData, 0, 0);

        // Strategy to detect multiple QR codes:
        // 1. Scan tiles of the page with high overlap
        const tiles = [
          { x: 0, y: 0, w: 1, h: 1 }, // Whole page
          // Grid 2x2
          { x: 0, y: 0, w: 0.6, h: 0.6 },
          { x: 0.4, y: 0, w: 0.6, h: 0.6 },
          { x: 0, y: 0.4, w: 0.6, h: 0.6 },
          { x: 0.4, y: 0.4, w: 0.6, h: 0.6 },
          // Grid 3x3 (more dense)
          { x: 0, y: 0, w: 0.4, h: 0.4 },
          { x: 0.3, y: 0, w: 0.4, h: 0.4 },
          { x: 0.6, y: 0, w: 0.4, h: 0.4 },
          { x: 0, y: 0.3, w: 0.4, h: 0.4 },
          { x: 0.3, y: 0.3, w: 0.4, h: 0.4 },
          { x: 0.6, y: 0.3, w: 0.4, h: 0.4 },
          { x: 0, y: 0.6, w: 0.4, h: 0.4 },
          { x: 0.3, y: 0.6, w: 0.4, h: 0.4 },
          { x: 0.6, y: 0.6, w: 0.4, h: 0.4 },
        ];

        for (const tile of tiles) {
          const tileCanvas = document.createElement('canvas');
          const tCtx = tileCanvas.getContext('2d');
          if (!tCtx) continue;

          tileCanvas.width = canvas.width * tile.w;
          tileCanvas.height = canvas.height * tile.h;

          tCtx.drawImage(
            canvas,
            canvas.width * tile.x, canvas.height * tile.y,
            canvas.width * tile.w, canvas.height * tile.h,
            0, 0,
            tileCanvas.width, tileCanvas.height
          );

          try {
            // Try detecting at 0, 90, 180, 270 degrees if needed
            // (ZXing usually handles rotation but tickets might be rotated at odd angles)
            const result = await qrReader.current.decodeFromCanvas(tileCanvas);
            if (result && result.getText()) {
              let code = result.getText().trim();
              
              // Normalize ficha codes (e.g. "FICHA-5" -> "5")
              if (/FICHA[- ]?(\d+)/i.test(code)) {
                const match = code.match(/FICHA[- ]?(\d+)/i);
                if (match) code = match[1];
              }

              if (!uniqueCodes.has(code)) {
                uniqueCodes.add(code);
                await processScannedCode(code);
                qrsFound++;
              }
            }
          } catch (e) {
            // No QR code found in this tile, ignore
          }
        }
      }

      if (qrsFound === 0) {
        setScanStatus("Nenhum código identificado no PDF.");
      } else {
        setScanStatus(`${qrsFound} Fichas lidas e processadas!`);
        try {
          new Audio('https://assets.mixkit.co/active_storage/sfx/1435/1435-preview.mp3').play().catch(() => {});
        } catch (e) {}
      }
    } catch (err) {
      console.error("PDF processing error:", err);
      setScanStatus("Erro ao processar o arquivo PDF.");
    } finally {
      setIsProcessingPdf(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="fixed inset-0 pl-20 bg-[#F5F5F0] flex flex-col items-center justify-center p-8">
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handlePdfUpload} 
        accept="application/pdf" 
        className="hidden" 
      />
      
      <div className="w-full max-w-2xl bg-white rounded-[48px] shadow-2xl border border-black/5 p-12 flex flex-col items-center text-center">
        <div className="w-24 h-24 bg-[#E0E0D0] rounded-full flex items-center justify-center mb-8">
          <QrCode className="w-12 h-12 text-[#5A5A40]" />
        </div>

        <h1 className="text-4xl font-black text-[#1A1A1A] mb-4">
          Ciclo Inteligente de Fichas
        </h1>
        <p className="text-xl text-[#5A5A40] mb-8 max-w-md">
          Bipe Ficha → Produtos → Outra Ficha (Envia) → Ficha (Pronto) → Ficha (Libera)
        </p>

        {stagedItems.length > 0 && (
          <div className="mb-6 px-4 py-2 bg-[#5A5A40] text-white rounded-full text-sm font-bold animate-pulse">
            {stagedItems.length} ITENS AGUARDANDO NA FICHA #{activeFicha}
          </div>
        )}

        {/* Scan Status Display */}
        <div className={`w-full py-8 px-6 rounded-3xl mb-12 transition-all duration-300 ${
          scanStatus?.includes('PRONTO') ? 'bg-green-100 text-green-700' : 
          scanStatus?.includes('Erro') || scanStatus?.includes('não') || scanStatus?.includes('Nenhum') ? 'bg-red-100 text-red-700' :
          'bg-gray-100 text-gray-700'
        }`}>
          {isSubmitting || isProcessingPdf ? (
            <div className="flex items-center justify-center gap-3">
              <Loader2 className="w-8 h-8 animate-spin" />
              <span className="text-2xl font-bold">{isProcessingPdf ? "Lendo PDF..." : "Processando..."}</span>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <span className="text-3xl font-black uppercase tracking-tight">
                {scanStatus || "Aguardando Leitura..."}
              </span>
              {!scanStatus && (
                <span className="text-sm opacity-60 font-medium">Use o leitor físico, a câmera ou envie um PDF</span>
              )}
            </div>
          )}
        </div>

        {/* Modes Toggle */}
        <div className="flex gap-4">
          <button 
            onClick={() => setUseCamera(!useCamera)}
            className="flex items-center gap-3 px-8 py-4 bg-[#1A1A1A] text-white rounded-2xl font-bold hover:scale-105 active:scale-95 transition-all shadow-xl"
          >
            {useCamera ? <QrCode className="w-6 h-6" /> : <Camera className="w-6 h-6" />}
            {useCamera ? "Leitor Físico" : "Abrir Câmera"}
          </button>

          <button 
            onClick={() => fileInputRef.current?.click()}
            disabled={isProcessingPdf}
            className="flex items-center gap-3 px-8 py-4 bg-white border-2 border-[#1A1A1A] text-[#1A1A1A] rounded-2xl font-bold hover:scale-105 active:scale-95 transition-all shadow-xl disabled:opacity-50"
          >
            <FileUp className="w-6 h-6" />
            Carregar PDF
          </button>
        </div>

        {/* Camera Scanner View */}
        {useCamera && (
          <div className="mt-8 relative w-full aspect-square max-w-sm rounded-3xl overflow-hidden border-4 border-[#1A1A1A] shadow-2xl">
            <Scanner
              onScan={(result) => result && processScannedCode(result[0].rawValue)}
              allowMultiple={false}
              paused={isSubmitting}
              constraints={{
                aspectRatio: 1,
                facingMode: 'environment'
              }}
              scanDelay={200}
            />
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 border-2 border-white/50 border-dashed rounded-2xl"></div>
            </div>
          </div>
        )}

        {/* Information Panel */}
        <div className="mt-12 grid grid-cols-2 gap-6 w-full">
          <div className={`p-6 rounded-3xl text-left flex items-start gap-4 transition-colors ${activeFicha ? 'bg-[#5A5A40] text-white' : 'bg-[#F5F5F0]'}`}>
            <UserCheck className={`w-6 h-6 mt-1 ${activeFicha ? 'text-white' : 'text-[#5A5A40]'}`} />
            <div>
              <p className={`text-sm font-bold uppercase tracking-wider ${activeFicha ? 'text-white/60' : 'text-[#5A5A40]/60'}`}>Ficha Ativa</p>
              <p className="text-2xl font-black">{activeFicha ? `#${activeFicha}` : "--"}</p>
            </div>
          </div>
          <div className="bg-[#F5F5F0] p-6 rounded-3xl text-left flex items-start gap-4">
            <Timer className="w-6 h-6 text-[#5A5A40] mt-1" />
            <div>
              <p className="text-sm font-bold text-[#5A5A40]/60 uppercase tracking-wider">Última Leitura</p>
              <p className="text-2xl font-black text-[#1A1A1A]">#{lastScanned || "--"}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
