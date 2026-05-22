import React, { useEffect, useState, useRef } from 'react';
import { Search, Calendar, ChevronRight, FileText, Clock, CheckCircle2, Trash2, FileDown, Printer } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Order } from '../types';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { firebaseService } from '../services/firebaseService';

export default function History() {
  const [activeTab, setActiveTab] = useState<'orders' | 'reports'>('orders');
  const [orders, setOrders] = useState<Order[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [selectedReport, setSelectedReport] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const pdfContainerRef = useRef<HTMLDivElement>(null);

  const generateProfessionalPDF = async (type: 'orders' | 'report') => {
    setIsGeneratingPdf(true);
    try {
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      const itemsToPrint = type === 'orders' ? filteredOrders : (selectedReport ? [selectedReport] : []);
      if (itemsToPrint.length === 0) {
        alert('Nenhum dado para gerar PDF.');
        return;
      }

      // Create a hidden container for measuring
      const measureContainer = document.createElement('div');
      measureContainer.style.position = 'fixed';
      measureContainer.style.left = '-9999px';
      measureContainer.style.top = '0';
      measureContainer.style.width = '190mm'; // Standard A4 content width (210 - 20 margin)
      measureContainer.style.backgroundColor = 'white';
      document.body.appendChild(measureContainer);

      // Create a container for the current page being built
      const pageContainer = document.createElement('div');
      pageContainer.style.position = 'fixed';
      pageContainer.style.left = '-9999px';
      pageContainer.style.top = '0';
      pageContainer.style.width = '210mm';
      pageContainer.style.height = '297mm';
      pageContainer.style.padding = '15mm';
      pageContainer.style.backgroundColor = 'white';
      pageContainer.style.display = 'flex';
      pageContainer.style.flexDirection = 'column';
      pageContainer.style.gap = '10px';
      document.body.appendChild(pageContainer);

      const a4HeightPx = 297 * 3.78; // approx px for 297mm
      const marginPx = 15 * 3.78 * 2;
      const maxPageContentHeight = a4HeightPx - marginPx;

      let currentPageHeight = 0;
      let isFirstPage = true;

      const addPageToPdf = async () => {
        const canvas = await html2canvas(pageContainer, {
          scale: 2,
          useCORS: true,
          logging: false,
          backgroundColor: '#ffffff',
          width: 210 * 3.78,
          height: 297 * 3.78
        });
        const imgData = canvas.toDataURL('image/jpeg', 0.95);
        if (!isFirstPage) pdf.addPage();
        pdf.addImage(imgData, 'JPEG', 0, 0, 210, 297);
        isFirstPage = false;
        pageContainer.innerHTML = '';
        currentPageHeight = 0;
      };

      // Add Header to every page
      const createHeader = () => {
        const header = document.createElement('div');
        header.style.borderBottom = '2px solid #000';
        header.style.paddingBottom = '10px';
        header.style.marginBottom = '20px';
        header.style.display = 'flex';
        header.style.justifyContent = 'space-between';
        header.style.alignItems = 'flex-end';
        header.innerHTML = `
          <div>
            <h1 style="margin: 0; font-size: 20pt; font-family: serif; font-style: italic; color: #5A5A40;">Arraiá do Lar São Cristóvão</h1>
            <p style="margin: 5px 0 0 0; font-size: 10pt; color: #666;">Relatório de ${type === 'orders' ? 'Pedidos' : 'Fechamento Financeiro'}</p>
          </div>
          <div style="text-align: right; font-size: 9pt; color: #999;">
            Gerado em: ${new Date().toLocaleString()}
          </div>
        `;
        return header;
      };

      if (type === 'orders') {
        for (let i = 0; i < itemsToPrint.length; i++) {
          const order = itemsToPrint[i];
          const block = document.createElement('div');
          block.className = 'ficha';
          block.style.border = '1px solid #000';
          block.style.padding = '12px';
          block.style.backgroundColor = '#ffffff';
          block.style.width = '100%';
          
          block.innerHTML = `
            <h2 style="margin: 0 0 10px 0; font-size: 14pt; color: #000; font-weight: bold; border-bottom: 1px solid #000; padding-bottom: 5px;">
              Pedido #${orders.length - orders.indexOf(order)} - Ficha ${order.ticket_number}
            </h2>
            <div style="margin-bottom: 10px; font-size: 10pt; color: #444;">
              <b>Data:</b> ${new Date(order.created_at).toLocaleString()} | <b>Status:</b> ${order.status === 'delivered' ? 'Entregue' : 'Arquivado'}
            </div>
            <table style="width: 100%; border-collapse: collapse;">
              <thead>
                <tr style="background-color: #f0f0f0;">
                  <th style="text-align: left; padding: 8px; border: 1px solid #000; font-size: 10pt;">Item</th>
                  <th style="text-align: right; padding: 8px; border: 1px solid #000; font-size: 10pt;">Qtd</th>
                </tr>
              </thead>
              <tbody>
                ${order.items.map((item: any) => `
                  <tr>
                    <td style="padding: 8px; border: 1px solid #000; font-size: 11pt;">${item.name}</td>
                    <td style="padding: 8px; border: 1px solid #000; font-size: 11pt; text-align: right; font-weight: bold;">${item.quantity}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          `;

          measureContainer.innerHTML = '';
          measureContainer.appendChild(block);
          const blockHeight = measureContainer.offsetHeight;

          if (currentPageHeight + blockHeight > maxPageContentHeight && !isFirstPage) {
            await addPageToPdf();
          }

          if (pageContainer.innerHTML === '') {
            pageContainer.appendChild(createHeader());
            currentPageHeight = 60; // Approx height of header
          }

          pageContainer.appendChild(block.cloneNode(true));
          currentPageHeight += blockHeight + 10; // 10px gap
        }
      } else if (selectedReport) {
        // Detailed Report
        const stats = document.createElement('div');
        stats.style.display = 'grid';
        stats.style.gridTemplateColumns = '1fr 1fr';
        stats.style.gap = '10px';
        stats.style.marginBottom = '20px';
        stats.innerHTML = `
          <div style="border: 1px solid #000; padding: 15px; background: #f9f9f9; text-align: center;">
            <p style="margin: 0; font-size: 10pt; color: #666; text-transform: uppercase; font-weight: bold; letter-spacing: 1px;">Receita Total</p>
            <p style="margin: 10px 0 0 0; font-size: 24pt; font-weight: bold; color: #5A5A40;">R$ ${selectedReport.totalRevenue?.toFixed(2)}</p>
          </div>
          <div style="border: 1px solid #000; padding: 15px; background: #f9f9f9; text-align: center;">
            <p style="margin: 0; font-size: 10pt; color: #666; text-transform: uppercase; font-weight: bold; letter-spacing: 1px;">Total Pedidos</p>
            <p style="margin: 10px 0 0 0; font-size: 24pt; font-weight: bold; color: #5A5A40;">${selectedReport.totalOrders}</p>
          </div>
        `;

        const reportBlock = document.createElement('div');
        reportBlock.style.border = '1px solid #000';
        reportBlock.style.padding = '15px';
        reportBlock.style.backgroundColor = '#ffffff';
        
        reportBlock.innerHTML = `
          <h2 style="margin: 0 0 15px 0; font-size: 16pt; font-weight: bold; border-bottom: 2px solid #000; padding-bottom: 8px; text-align: center;">RESUMO DE VENDAS POR PRODUTO</h2>
          <table style="width: 100%; border-collapse: collapse;">
            <thead>
              <tr style="background-color: #f0f0f0;">
                <th style="text-align: left; padding: 10px; border: 1px solid #000; font-size: 11pt;">Produto</th>
                <th style="text-align: center; padding: 10px; border: 1px solid #000; font-size: 11pt;">Qtd</th>
                <th style="text-align: right; padding: 10px; border: 1px solid #000; font-size: 11pt;">Total Bruto</th>
              </tr>
            </thead>
            <tbody>
              ${selectedReport.items.map((item: any) => `
                <tr>
                  <td style="padding: 10px; border: 1px solid #000; font-size: 11pt; font-weight: bold;">${item.name}</td>
                  <td style="padding: 10px; border: 1px solid #000; font-size: 11pt; text-align: center;">${item.count}</td>
                  <td style="padding: 10px; border: 1px solid #000; font-size: 11pt; text-align: right; font-weight: bold;">R$ ${item.total?.toFixed(2)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        `;

        pageContainer.appendChild(createHeader());
        pageContainer.appendChild(stats);
        pageContainer.appendChild(reportBlock);
      }

      await addPageToPdf();

      document.body.removeChild(measureContainer);
      document.body.removeChild(pageContainer);

      pdf.save(`relatorio-${type}-${new Date().getTime()}.pdf`);
    } catch (error) {
      console.error('Erro ao gerar PDF:', error);
      alert('Erro ao gerar PDF.');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const fetchHistory = () => {
    setIsLoading(true);
    if (activeTab === 'orders') {
      firebaseService.getOrderHistory()
        .then(data => {
          setOrders(data);
          setIsLoading(false);
        })
        .catch(err => {
          console.error("Failed to fetch history:", err);
          setIsLoading(false);
        });
    } else {
      firebaseService.getFinancialSummary()
        .then(data => {
          setReports(data.totalOrders > 0 ? [data] : []);
          setIsLoading(false);
        })
        .catch(err => {
          console.error("Failed to fetch dashboard:", err);
          setIsLoading(false);
        });
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [activeTab]);

  const handleClearHistory = async (type: 'all' | 'closed') => {
    const password = prompt(`Digite a senha de administrador para confirmar a exclusão ${type === 'all' ? 'de TODO o histórico' : 'deste fechamento'}:`);
    if (password === null) return;
    if (!password) {
      alert('A senha é obrigatória para realizar esta ação.');
      return;
    }

    setIsDeleting(true);
    try {
      if (password !== 'admin123') { // Simple check for now, can be improved
        throw new Error('Senha incorreta');
      }
      await firebaseService.clearHistory(password, 'all');
      alert('Exclusão realizada com sucesso!');
      setSelectedOrder(null);
      setSelectedReport(null);
      fetchHistory();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteIndividualOrder = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este pedido permanentemente?')) return;
    
    setIsDeleting(true);
    try {
      await firebaseService.deleteOrder(id);
      setSelectedOrder(null);
      fetchHistory();
    } catch (error: any) {
      alert(error.message);
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredOrders = orders.filter(order => 
    order.ticket_number.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="max-w-6xl mx-auto">
      <header className="mb-8 flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-serif italic text-[#5A5A40]">Histórico e Relatórios</h1>
          <p className="text-gray-500">Pedidos finalizados e fechamentos de caixa</p>
        </div>
        <div className="flex bg-white p-1 rounded-xl border border-black/5 shadow-sm">
          <button
            onClick={() => setActiveTab('orders')}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
              activeTab === 'orders' ? 'bg-[#5A5A40] text-white' : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            Pedidos
          </button>
          <button
            onClick={() => setActiveTab('reports')}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
              activeTab === 'reports' ? 'bg-[#5A5A40] text-white' : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            Fechamentos
          </button>
        </div>
      </header>

      {activeTab === 'orders' ? (
        <>
          <div className="mb-8 relative flex gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Buscar por número da ficha..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-12 pr-4 py-4 bg-white rounded-2xl border border-black/5 shadow-sm focus:ring-2 focus:ring-[#5A5A40] outline-none"
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => generateProfessionalPDF('orders')}
                disabled={isGeneratingPdf || filteredOrders.length === 0}
                className="px-6 py-4 bg-[#5A5A40] text-white rounded-2xl font-bold hover:bg-[#4A4A30] transition-all flex items-center gap-2 disabled:opacity-50"
              >
                <FileDown className="w-5 h-5" />
                {isGeneratingPdf ? 'Gerando...' : 'PDF de Pedidos'}
              </button>
              <button
                onClick={() => handleClearHistory('all')}
                disabled={isDeleting}
                className="px-6 py-4 bg-red-50 text-red-600 rounded-2xl font-bold hover:bg-red-100 transition-all flex items-center gap-2 disabled:opacity-50"
              >
                <Trash2 className="w-5 h-5" />
                Limpar Tudo
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-3">
              {isLoading ? (
                <div className="text-center py-12 text-gray-400 italic">Carregando histórico...</div>
              ) : filteredOrders.length === 0 ? (
                <div className="text-center py-12 text-gray-400 italic">Nenhum pedido encontrado.</div>
              ) : (
                filteredOrders.map(order => (
                  <motion.button
                    key={order.id}
                    onClick={() => setSelectedOrder(order)}
                    className={`w-full flex items-center justify-between p-4 rounded-2xl border transition-all ${
                      selectedOrder?.id === order.id 
                        ? 'bg-[#5A5A40] text-white border-[#5A5A40] shadow-lg' 
                        : 'bg-white text-gray-600 border-black/5 hover:border-gray-200 shadow-sm'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div className="flex flex-col items-center">
                        <span className="text-[10px] uppercase font-bold text-gray-400 mb-1">Ficha</span>
                        <div className={`w-14 h-14 rounded-xl flex items-center justify-center font-black text-2xl shadow-inner ${
                          selectedOrder?.id === order.id ? 'bg-white/20 text-white' : 'bg-[#F5F5F0] text-[#5A5A40]'
                        }`}>
                          {order.ticket_number}
                        </div>
                      </div>
                      <div className="text-left flex-1">
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded ${
                            selectedOrder?.id === order.id ? 'bg-white/20 text-white' : 'bg-[#5A5A40]/10 text-[#5A5A40]'
                          }`}>
                            Sistema
                          </span>
                          <p className="font-black text-lg">Pedido {orders.length - orders.indexOf(order)}</p>
                        </div>
                        <p className={`text-xs mt-1 ${selectedOrder?.id === order.id ? 'text-white/60' : 'text-gray-400'}`}>
                          {new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {new Date(order.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase ${
                        order.status === 'delivered' ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-600'
                      }`}>
                        {order.status === 'delivered' ? 'Entregue' : 'Arquivado'}
                      </span>
                      <ChevronRight className="w-5 h-5 opacity-40" />
                    </div>
                  </motion.button>
                ))
              )}
            </div>

            <div className="lg:col-span-1">
              <AnimatePresence mode="wait">
                {selectedOrder ? (
                  <motion.div
                    key={selectedOrder.id}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    className="bg-white p-8 rounded-[32px] shadow-sm border border-black/5 sticky top-8"
                  >
                    <div className="flex items-center gap-3 mb-6">
                      <FileText className="w-6 h-6 text-[#5A5A40]" />
                      <h2 className="text-xl font-bold">Detalhes do Pedido</h2>
                    </div>

                    <div className="space-y-6">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-[#F5F5F0] p-4 rounded-2xl border border-black/5">
                          <span className="text-[10px] text-gray-400 uppercase font-black block mb-1">Ficha do Cliente</span>
                          <span className="text-3xl font-black text-[#5A5A40]">{selectedOrder.ticket_number}</span>
                        </div>
                        <div className="bg-[#151619] p-4 rounded-2xl border border-white/5">
                          <span className="text-[10px] text-gray-500 uppercase font-black block mb-1">Ordem Sistema</span>
                          <span className="text-3xl font-black text-white">
                            {orders.length - orders.indexOf(selectedOrder)}
                          </span>
                        </div>
                      </div>

                      <div className="flex justify-between items-center py-3 border-b border-gray-100">
                        <span className="text-xs text-gray-400 uppercase font-bold">ID Interno</span>
                        <span className="text-sm font-mono text-gray-400">#{selectedOrder.id}</span>
                      </div>

                      <div>
                        <span className="text-xs text-gray-400 uppercase font-bold block mb-3">Itens do Pedido</span>
                        <div className="space-y-2">
                          {selectedOrder.items.map((item, idx) => (
                            <div key={idx} className="flex items-center gap-3 p-3 bg-[#F5F5F0] rounded-xl">
                              <CheckCircle2 className="w-4 h-4 text-green-500" />
                              <span className="text-sm font-medium">
                                {item.quantity > 1 && <span className="font-bold mr-2">{item.quantity}x</span>}
                                {item.name}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="pt-4 space-y-3">
                        <div className="flex items-center gap-2 text-xs text-gray-400">
                          <Clock className="w-3 h-3" />
                          <span>Criado em: {new Date(selectedOrder.created_at).toLocaleString()}</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-gray-400">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Finalizado em: {new Date(selectedOrder.updated_at).toLocaleString()}</span>
                        </div>
                      </div>

                      <div className="pt-6 border-t border-gray-100">
                        <button
                          onClick={() => handleDeleteIndividualOrder(selectedOrder.id)}
                          disabled={isDeleting}
                          className="w-full py-3 bg-red-50 text-red-600 rounded-xl font-bold hover:bg-red-100 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                          <Trash2 className="w-4 h-4" />
                          Excluir este Pedido
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ) : (
                  <div className="bg-white/50 border border-dashed border-gray-200 p-12 rounded-[32px] text-center text-gray-400 italic sticky top-8">
                    Selecione um pedido para ver os detalhes
                  </div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1 space-y-3">
            {reports.map((report, idx) => (
              <button
                key={idx}
                onClick={() => setSelectedReport(report)}
                className={`w-full p-6 rounded-2xl border transition-all text-left ${
                  selectedReport === report ? 'bg-[#5A5A40] text-white' : 'bg-white text-gray-600 border-black/5'
                }`}
              >
                <p className="font-black text-lg">Fechamento de Caixa</p>
                <p className={`text-xs ${selectedReport === report ? 'text-white/60' : 'text-gray-400'}`}>
                  {new Date(report.date).toLocaleDateString()} • {new Date(report.date).toLocaleTimeString()}
                </p>
                <div className="mt-4 flex justify-between items-end">
                  <div>
                    <p className="text-[10px] uppercase font-bold opacity-60">Receita</p>
                    <p className="font-black">R$ {report.totalRevenue?.toFixed(2)}</p>
                  </div>
                  <ChevronRight className="w-5 h-5 opacity-40" />
                </div>
              </button>
            ))}
          </div>
          <div className="lg:col-span-2">
            {selectedReport ? (
              <div className="bg-white p-8 rounded-[32px] shadow-sm border border-black/5">
                <div className="flex justify-between items-center mb-8">
                  <h2 className="text-2xl font-serif italic text-[#5A5A40]">Relatório Detalhado</h2>
                  <div className="flex gap-4">
                    <button 
                      onClick={() => generateProfessionalPDF('report')}
                      disabled={isGeneratingPdf}
                      className="text-sm font-bold text-[#5A5A40] hover:underline flex items-center gap-1"
                    >
                      <FileDown className="w-4 h-4" />
                      {isGeneratingPdf ? 'Gerando PDF...' : 'Gerar PDF Profissional'}
                    </button>
                    <button 
                      onClick={() => handleClearHistory('closed')}
                      disabled={isDeleting}
                      className="text-sm font-bold text-red-500 hover:underline flex items-center gap-1"
                    >
                      <Trash2 className="w-4 h-4" />
                      Excluir Fechamento
                    </button>
                    <button onClick={() => window.print()} className="text-sm font-bold text-[#5A5A40] hover:underline">Imprimir</button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 mb-8">
                  <div className="bg-[#F5F5F0] p-6 rounded-2xl">
                    <p className="text-xs uppercase font-bold text-gray-400 mb-1">Receita Total</p>
                    <p className="text-3xl font-black text-[#5A5A40]">R$ {selectedReport.totalRevenue?.toFixed(2)}</p>
                  </div>
                  <div className="bg-[#F5F5F0] p-6 rounded-2xl">
                    <p className="text-xs uppercase font-bold text-gray-400 mb-1">Total Pedidos</p>
                    <p className="text-3xl font-black text-[#5A5A40]">{selectedReport.totalOrders}</p>
                  </div>
                </div>
                <div className="space-y-4">
                  <h3 className="font-bold text-gray-400 uppercase text-xs">Itens Vendidos</h3>
                  {selectedReport.items.map((item: any) => (
                    <div key={item.name} className="flex items-center justify-between p-4 bg-[#F5F5F0] rounded-xl">
                      <div className="flex items-center gap-3">
                        <span className="w-8 h-8 bg-[#5A5A40] text-white rounded-full flex items-center justify-center font-bold text-xs">{item.count}x</span>
                        <span className="font-medium">{item.name}</span>
                      </div>
                      <span className="font-bold">R$ {item.total?.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="bg-white/50 border border-dashed border-gray-200 p-12 rounded-[32px] text-center text-gray-400 italic">
                Selecione um fechamento para ver o relatório detalhado
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
