import React, { useState, useEffect } from 'react';
import { Package, ArrowUpRight, ArrowDownRight, History, Plus, Minus, User, Calendar, Search } from 'lucide-react';
import { MenuItem, StockHistory, User as AppUser } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { firebaseService } from '../services/firebaseService';

interface InventoryProps {
  currentUser: AppUser;
}

const Inventory: React.FC<InventoryProps> = ({ currentUser }) => {
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [history, setHistory] = useState<StockHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [movementType, setMovementType] = useState<'entry' | 'exit'>('entry');
  const [quantity, setQuantity] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [menuData, historyData] = await Promise.all([
        firebaseService.getMenu(),
        firebaseService.getStockHistory()
      ]);
      setMenuItems(menuData);
      setHistory(historyData);
    } catch (error: any) {
      console.error('Error fetching inventory data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleMovement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem || !quantity || isNaN(Number(quantity))) return;

    try {
      const newHistory = await firebaseService.addStockMovement({
        menu_item_id: selectedItem.id,
        type: movementType,
        quantity: Number(quantity),
        user_name: currentUser.name
      });

      setHistory(prev => [newHistory, ...prev]);
      setMenuItems(prev => prev.map(item => 
        String(item.id) === String(selectedItem.id) 
          ? { ...item, stock_quantity: (item.stock_quantity || 0) + (movementType === 'entry' ? Number(quantity) : -Number(quantity)) }
          : item
      ));
      setIsModalOpen(false);
      setQuantity('');
      setSelectedItem(null);
    } catch (error) {
      console.error('Error recording stock movement:', error);
    }
  };

  const filteredItems = menuItems.filter(item => 
    item.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F5F5F5] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#5A5A40]"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F5F5] p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-light tracking-tight text-gray-900 flex items-center gap-3">
              <Package className="w-8 h-8 text-[#5A5A40]" />
              Controle de Estoque
            </h1>
            <p className="text-sm text-gray-500 mt-1">Gerencie as entradas e saídas de produtos</p>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar produto..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 py-2 bg-white border-none rounded-full shadow-sm focus:ring-2 focus:ring-[#5A5A40] w-full md:w-64"
              />
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Stock List */}
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-white rounded-3xl shadow-sm overflow-hidden">
              <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                <h2 className="text-lg font-medium text-gray-800">Produtos em Estoque</h2>
                <span className="text-xs font-mono text-gray-400 uppercase tracking-widest">{filteredItems.length} ITENS</span>
              </div>
              
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-gray-50/50 text-[10px] uppercase tracking-widest text-gray-400 font-semibold">
                      <th className="px-6 py-4">Produto</th>
                      <th className="px-6 py-4">Categoria</th>
                      <th className="px-6 py-4 text-right">Quantidade</th>
                      <th className="px-6 py-4 text-center">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {filteredItems.map(item => (
                      <tr key={item.id} className="hover:bg-gray-50/50 transition-colors group">
                        <td className="px-6 py-4">
                          <div className="font-medium text-gray-900">{item.name}</div>
                          <div className="text-xs text-gray-400">{item.sector}</div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded-md text-[10px] font-medium uppercase tracking-wider">
                            {item.category_name}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <span className={`text-lg font-light ${Number(item.stock_quantity || 0) <= 5 ? 'text-red-500 font-medium' : 'text-gray-900'}`}>
                            {item.stock_quantity || 0}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => {
                                setSelectedItem(item);
                                setMovementType('entry');
                                setIsModalOpen(true);
                              }}
                              className="p-2 text-[#5A5A40] hover:bg-[#5A5A40]/10 rounded-full transition-colors"
                              title="Entrada"
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => {
                                setSelectedItem(item);
                                setMovementType('exit');
                                setIsModalOpen(true);
                              }}
                              className="p-2 text-red-500 hover:bg-red-50 rounded-full transition-colors"
                              title="Saída"
                            >
                              <Minus className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* History */}
          <div className="space-y-4">
            <div className="bg-white rounded-3xl shadow-sm overflow-hidden h-full">
              <div className="p-6 border-b border-gray-100 flex items-center gap-3">
                <History className="w-5 h-5 text-gray-400" />
                <h2 className="text-lg font-medium text-gray-800">Histórico Recente</h2>
              </div>
              
              <div className="p-6 space-y-6 max-h-[600px] overflow-y-auto custom-scrollbar">
                {history.length === 0 ? (
                  <div className="text-center py-12 text-gray-400 italic text-sm">
                    Nenhuma movimentação registrada
                  </div>
                ) : (
                  history.map((log) => (
                    <div key={log.id} className="relative pl-6 border-l border-gray-100 space-y-1">
                      <div className={`absolute left-[-5px] top-1 w-2.5 h-2.5 rounded-full border-2 border-white shadow-sm ${log.type === 'entry' ? 'bg-green-500' : 'bg-red-500'}`} />
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-900">{log.menu_item_name}</span>
                        <span className={`text-xs font-mono font-bold ${log.type === 'entry' ? 'text-green-600' : 'text-red-600'}`}>
                          {log.type === 'entry' ? '+' : '-'}{log.quantity}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-[10px] text-gray-400 uppercase tracking-wider">
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3" /> {log.user_name}
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" /> {new Date(log.created_at).toLocaleString('pt-BR')}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Movement Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-[32px] shadow-2xl w-full max-w-md overflow-hidden"
            >
              <div className={`p-8 ${movementType === 'entry' ? 'bg-green-50' : 'bg-red-50'} flex items-center justify-between`}>
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${movementType === 'entry' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'}`}>
                    {movementType === 'entry' ? <ArrowUpRight className="w-6 h-6" /> : <ArrowDownRight className="w-6 h-6" />}
                  </div>
                  <div>
                    <h3 className="text-xl font-medium text-gray-900">
                      {movementType === 'entry' ? 'Entrada de Estoque' : 'Saída de Estoque'}
                    </h3>
                    <p className="text-sm text-gray-500">{selectedItem?.name}</p>
                  </div>
                </div>
                <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                  <Plus className="w-6 h-6 rotate-45" />
                </button>
              </div>

              <form onSubmit={handleMovement} className="p-8 space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-widest font-bold text-gray-400">Quantidade</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    autoFocus
                    value={quantity}
                    onChange={e => setQuantity(e.target.value)}
                    placeholder="Ex: 10"
                    className="w-full text-4xl font-light tracking-tight border-none p-0 focus:ring-0 placeholder:text-gray-200"
                  />
                </div>

                <div className="pt-4">
                  <button
                    type="submit"
                    className={`w-full py-4 rounded-2xl font-medium text-white shadow-lg transition-all active:scale-95 ${
                      movementType === 'entry' 
                        ? 'bg-green-500 hover:bg-green-600 shadow-green-200' 
                        : 'bg-red-500 hover:bg-red-600 shadow-red-200'
                    }`}
                  >
                    Confirmar {movementType === 'entry' ? 'Entrada' : 'Saída'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Inventory;
