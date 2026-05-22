import React, { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, User, Utensils, Shield, Layers, Edit2, X, Key, QrCode as QrCodeIcon, Download, Printer, FileDown, RefreshCw, Camera, Eye } from 'lucide-react';
import { MenuItem, User as UserType, Category } from '../types';
import { QRCodeSVG } from 'qrcode.react';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { Html5Qrcode } from 'html5-qrcode';
import { motion } from 'motion/react';
import { firebaseService } from '../services/firebaseService';

export default function Admin() {
  const [activeTab, setActiveTab] = useState<'menu' | 'users' | 'categories' | 'qrcodes'>('menu');
  const qrContainerRef = useRef<HTMLDivElement>(null);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [users, setUsers] = useState<UserType[]>([]);
  
  // Form States
  const [newItemName, setNewItemName] = useState('');
  const [newItemCategory, setNewItemCategory] = useState<string>('');
  const [newItemPrice, setNewItemPrice] = useState('');
  const [newItemSector, setNewItemSector] = useState('Outros');
  const [newItemQrCode, setNewItemQrCode] = useState('');
  const [editingMenuItemId, setEditingMenuItemId] = useState<string | null>(null);
  const [newCategoryName, setNewCategoryName] = useState('');
  
  // User Form States
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [selectedViews, setSelectedViews] = useState<string[]>(['reception']);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newUserPassword, setNewUserPassword] = useState('');

  // QR Code States
  const [qrType, setQrType] = useState<'fichas' | 'items'>('fichas');
  const [fichasRange, setFichasRange] = useState({ start: 1, end: 20 });
  const [selectedQrItem, setSelectedQrItem] = useState<MenuItem | null>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [qrInputValue, setQrInputValue] = useState('');
  const [scanCallback, setScanCallback] = useState<((code: string) => void) | null>(null);
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);

  const [isSavingFichas, setIsSavingFichas] = useState(false);
  const [fichasSaveSuccess, setFichasSaveSuccess] = useState<string | null>(null);

  const handleSaveFichasToDatabase = async () => {
    setIsSavingFichas(true);
    setFichasSaveSuccess(null);
    try {
      const itemsToRegister: { code: string; alias: string }[] = [];
      const start = Math.max(1, fichasRange.start);
      const end = Math.max(start, fichasRange.end);
      
      for (let num = start; num <= end; num++) {
        const numStr = num.toString();
        // Register raw format
        itemsToRegister.push({ code: numStr, alias: numStr });
        // Register prefixed hyphenated format
        itemsToRegister.push({ code: `FICHA-${numStr}`, alias: numStr });
        // Register prefixed format with space
        itemsToRegister.push({ code: `FICHA ${numStr}`, alias: numStr });
      }

      await firebaseService.registerExtraFichasBatch(itemsToRegister);
      setFichasSaveSuccess(`Sucesso: Fichas do #${start} ao #${end} registradas no banco de dados para sempre!`);
      setTimeout(() => setFichasSaveSuccess(null), 5000);
    } catch (err: any) {
      console.error(err);
      setError('Erro ao salvar fichas no banco de dados: ' + (err.message || ''));
    } finally {
      setIsSavingFichas(false);
    }
  };

  const startScanning = (onScan: (code: string) => void) => {
    setIsScanning(true);
    setScanCallback(() => onScan);
    
    setTimeout(() => {
      const html5QrCode = new Html5Qrcode("qr-reader");
      html5QrCodeRef.current = html5QrCode;
      
      html5QrCode.start(
        { facingMode: "environment" },
        {
          fps: 20, // Increased FPS for smoother detection
          qrbox: (viewfinderWidth, viewfinderHeight) => {
            const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
            const edgeSize = Math.floor(minEdge * 0.7);
            return { width: edgeSize, height: edgeSize };
          },
          aspectRatio: 1.0
        },
        (decodedText) => {
          onScan(decodedText);
          stopScanning();
        },
        () => {
          // Completely ignore "not found" errors to avoid UI/Console noise
        }
      ).catch((err) => {
        console.error("Erro ao iniciar câmera:", err);
      });
    }, 300);
  };

  const stopScanning = () => {
    if (html5QrCodeRef.current) {
      html5QrCodeRef.current.stop().then(() => {
        html5QrCodeRef.current = null;
        setIsScanning(false);
        setScanCallback(null);
      }).catch(err => {
        console.error("Erro ao parar câmera:", err);
        setIsScanning(false);
        setScanCallback(null);
      });
    } else {
      setIsScanning(false);
      setScanCallback(null);
    }
  };

  const generatePDF = async (action: 'download' | 'preview' = 'download') => {
    if (!qrContainerRef.current) {
      alert('Nenhum conteúdo para gerar PDF.');
      return;
    }
    
    setIsGeneratingPdf(true);

    // Automatically save fichas to database on PDF generation for 100% reliable scanner match
    if (qrType === 'fichas') {
      try {
        const itemsToRegister: { code: string; alias: string }[] = [];
        const start = Math.max(1, fichasRange.start);
        const end = Math.max(start, fichasRange.end);
        for (let num = start; num <= end; num++) {
          const numStr = num.toString();
          itemsToRegister.push({ code: numStr, alias: numStr });
          itemsToRegister.push({ code: `FICHA-${numStr}`, alias: numStr });
          itemsToRegister.push({ code: `FICHA ${numStr}`, alias: numStr });
        }
        firebaseService.registerExtraFichasBatch(itemsToRegister).catch(e => {
          console.error("Error in auto-saving generated QR codes to DB:", e);
        });
      } catch (e) {
        console.error(e);
      }
    }
    
    try {
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
        compress: true
      });

      const container = qrContainerRef.current;
      const chips = Array.from(container.children) as HTMLElement[];
      const chipsPerPage = 9; 
      
      // Values for A4 at 96 DPI (Standard web resolution)
      const A4_WIDTH = 794; 
      const A4_HEIGHT = 1123;
      
      for (let i = 0; i < chips.length; i += chipsPerPage) {
        if (i > 0) pdf.addPage();
        
        // Create an off-screen page for high-fidelity capture
        const pageWrapper = document.createElement('div');
        pageWrapper.id = "pdf-capture-temp";
        Object.assign(pageWrapper.style, {
          position: 'fixed',
          left: '-9999px',
          top: '0',
          width: `${A4_WIDTH}px`,
          height: `${A4_HEIGHT}px`,
          backgroundColor: 'white',
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gridTemplateRows: 'repeat(3, 1fr)',
          gap: '0',
          padding: '40px',
          boxSizing: 'border-box'
        });
        
        const pageChips = chips.slice(i, i + chipsPerPage);
        pageChips.forEach((chip) => {
          const clone = chip.cloneNode(true) as HTMLElement;
          Object.assign(clone.style, {
            width: '100%',
            height: '100%',
            boxSizing: 'border-box',
            border: '2px solid #F27D26',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '20px',
            margin: '0',
            visibility: 'visible !important'
          });
          
          // Fix number text scaling in clone
          const numSpan = clone.querySelector('span.text-6xl');
          if (numSpan) {
            (numSpan as HTMLElement).style.fontSize = '80px';
            (numSpan as HTMLElement).style.lineHeight = '1';
          }

          pageWrapper.appendChild(clone);
        });
        
        document.body.appendChild(pageWrapper);
        
        // Ensure styles are applied and images loaded
        await new Promise(resolve => setTimeout(resolve, 800));
        
        const canvas = await html2canvas(pageWrapper, {
          scale: 2,
          useCORS: true,
          logging: false,
          backgroundColor: '#ffffff',
          width: A4_WIDTH,
          height: A4_HEIGHT,
          onclone: (clonedDoc) => {
            const el = clonedDoc.getElementById("pdf-capture-temp");
            if (el) el.style.left = '0';
          }
        });
        
        document.body.removeChild(pageWrapper);
        
        const imgData = canvas.toDataURL('image/jpeg', 0.95);
        pdf.addImage(imgData, 'JPEG', 0, 0, 210, 297);
      }
      
      const fileName = `fichas-arraia-${new Date().getTime()}.pdf`;
      if (action === 'download') {
        pdf.save(fileName);
      } else {
        const blob = pdf.output('blob');
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
      }
    } catch (error) {
      console.error('Erro ao gerar PDF:', error);
      alert('Houve um erro ao gerar o PDF. Verifique se as janelas pop-up estão permitidas.');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const VIEWS = [
    { id: 'reception', label: 'Ficha' },
    { id: 'kitchen', label: 'Cozinha' },
    { id: 'kitchen-sectors', label: 'Setores' },
    { id: 'delivery', label: 'Entrega' },
    { id: 'display', label: 'Painel' },
    { id: 'inventory', label: 'Estoque' },
    { id: 'history', label: 'Histórico' },
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'admin', label: 'Config' },
  ];

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [cats, menu, usersList] = await Promise.all([
          firebaseService.getCategories(),
          firebaseService.getMenu(),
          firebaseService.getUsers()
        ]);
        
        setCategories(cats);
        setMenuItems(menu);
        setUsers(usersList);
      } catch (error) {
        console.error('Error fetching data:', error);
      }
    };

    fetchData();
  }, []);

  const addCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategoryName.trim()) return;

    setError(null);
    try {
      const data = await firebaseService.createCategory(newCategoryName.trim());
      setCategories(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
      setNewCategoryName('');
    } catch (err: any) {
      console.error('Error adding category:', err);
      setError(err.message);
    }
  };

  const deleteCategory = async (id: string) => {
    if (!confirm('Ao deletar uma categoria, você deve remover manualmente os itens dela. Continuar?')) return;
    try {
      await firebaseService.deleteCategory(id);
      setCategories(prev => prev.filter(c => c.id !== id));
    } catch (err) {
      console.error('Error deleting category:', err);
    }
  };

  const addMenuItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemName.trim() || !newItemCategory) return;

    setError(null);
    const category = categories.find(c => c.id === newItemCategory);

    try {
      const body = {
        name: newItemName.trim(),
        category_id: newItemCategory,
        category_name: category?.name || '',
        price: Number(newItemPrice) || 0,
        sector: newItemSector,
        qr_code: newItemQrCode.trim() || null,
        active: true
      };

      let data;
      if (editingMenuItemId) {
        data = await firebaseService.updateMenuItem(editingMenuItemId, body);
        setMenuItems(prev => prev.map(i => String(i.id) === String(editingMenuItemId) ? data : i));
      } else {
        data = await firebaseService.createMenuItem(body);
        setMenuItems(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
      }
      
      resetMenuItemForm();
    } catch (err: any) {
      console.error('Error saving menu item:', err);
      setError(err.message);
    }
  };

  const startEditingMenuItem = (item: MenuItem) => {
    setEditingMenuItemId(String(item.id));
    setNewItemName(item.name);
    setNewItemCategory(String(item.category_id));
    setNewItemPrice(item.price.toString());
    setNewItemSector(item.sector || 'Outros');
    setNewItemQrCode(item.qr_code || '');
  };

  const resetMenuItemForm = () => {
    setEditingMenuItemId(null);
    setNewItemName('');
    setNewItemCategory('');
    setNewItemPrice('');
    setNewItemSector('Outros');
    setNewItemQrCode('');
    setError(null);
  };

  const deleteMenuItem = async (id: string) => {
    try {
      await firebaseService.deleteMenuItem(id);
      setMenuItems(prev => prev.filter(i => String(i.id) !== String(id)));
    } catch (err) {
      console.error('Error deleting menu item:', err);
    }
  };

  const handleUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserName || (!editingUserId && !newUserPassword)) return;

    setIsSaving(true);
    setError(null);

    try {
      const userData: any = {
        name: newUserName.trim(),
        role: 'staff',
        allowed_views: selectedViews.join(',')
      };
      if (newUserPassword) userData.password = newUserPassword.trim();

      let savedUser;
      if (editingUserId) {
        savedUser = await firebaseService.updateUser(editingUserId, userData);
        setUsers(prev => prev.map(u => String(u.id) === String(editingUserId) ? savedUser : u));
      } else {
        savedUser = await firebaseService.createUser({
          ...userData,
          password: newUserPassword.trim()
        });
        setUsers(prev => [...prev, savedUser].sort((a, b) => a.name.localeCompare(b.name)));
      }
      resetUserForm();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const startEditingUser = (user: UserType) => {
    setEditingUserId(user.id);
    setNewUserName(user.name);
    setNewUserPassword('');
    setSelectedViews(user.allowed_views ? user.allowed_views.split(',') : []);
  };

  const resetUserForm = () => {
    setEditingUserId(null);
    setNewUserName('');
    setNewUserPassword('');
    setSelectedViews(['reception']);
  };

  const toggleView = (viewId: string) => {
    setSelectedViews(prev => 
      prev.includes(viewId) 
        ? prev.filter(v => v !== viewId)
        : [...prev, viewId]
    );
  };

  const deleteUser = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este usuário?')) return;
    try {
      await firebaseService.deleteUser(id);
      setUsers(prev => prev.filter(u => String(u.id) !== String(id)));
    } catch (err) {
      console.error('Error deleting user:', err);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <header className="mb-8 flex justify-between items-start">
        <div>
          <h1 className="text-4xl font-serif italic text-[#5A5A40]">Administração</h1>
          <p className="text-gray-500">Gerenciar cardápio, categorias e usuários</p>
        </div>
      </header>

      <div className="flex gap-4 mb-8 overflow-x-auto pb-2">
        <button
          onClick={() => setActiveTab('menu')}
          className={`px-6 py-3 rounded-xl font-bold flex items-center gap-2 transition-all whitespace-nowrap ${
            activeTab === 'menu' 
              ? 'bg-[#5A5A40] text-white shadow-lg' 
              : 'bg-white text-gray-400 hover:bg-gray-50'
          }`}
        >
          <Utensils className="w-4 h-4" />
          Cardápio
        </button>
        <button
          onClick={() => setActiveTab('categories')}
          className={`px-6 py-3 rounded-xl font-bold flex items-center gap-2 transition-all whitespace-nowrap ${
            activeTab === 'categories' 
              ? 'bg-[#5A5A40] text-white shadow-lg' 
              : 'bg-white text-gray-400 hover:bg-gray-50'
          }`}
        >
          <Layers className="w-4 h-4" />
          Categorias
        </button>
        <button
          onClick={() => setActiveTab('users')}
          className={`px-6 py-3 rounded-xl font-bold flex items-center gap-2 transition-all whitespace-nowrap ${
            activeTab === 'users' 
              ? 'bg-[#5A5A40] text-white shadow-lg' 
              : 'bg-white text-gray-400 hover:bg-gray-50'
          }`}
        >
          <User className="w-4 h-4" />
          Usuários
        </button>
        <button
          onClick={() => setActiveTab('qrcodes')}
          className={`px-6 py-3 rounded-xl font-bold flex items-center gap-2 transition-all whitespace-nowrap ${
            activeTab === 'qrcodes' 
              ? 'bg-[#5A5A40] text-white shadow-lg' 
              : 'bg-white text-gray-400 hover:bg-gray-50'
          }`}
        >
          <QrCodeIcon className="w-4 h-4" />
          QR Codes
        </button>
      </div>

      <div className="bg-white rounded-[32px] p-8 shadow-sm border border-black/5">
        {error && (
          <div className="mb-6 p-4 bg-red-50 text-red-600 rounded-2xl text-sm font-medium border border-red-100 flex items-center gap-2">
            <X className="w-4 h-4" onClick={() => setError(null)} />
            <span>Erro: {error}</span>
          </div>
        )}
        
        {activeTab === 'menu' && (
          <div>
            <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
              <Utensils className="w-5 h-5 text-[#5A5A40]" />
              {editingMenuItemId ? 'Editar Item' : 'Itens do Cardápio'}
            </h2>
            
              <form onSubmit={addMenuItem} className="flex flex-wrap gap-4 mb-8 bg-gray-50 p-6 rounded-2xl border border-gray-100">
                <input
                  type="text"
                  value={newItemName}
                  onChange={e => setNewItemName(e.target.value)}
                  placeholder="Nome do item..."
                  className="flex-[2] min-w-[200px] p-4 bg-white rounded-xl border-none focus:ring-2 focus:ring-[#5A5A40]"
                />
                <select
                  value={newItemCategory}
                  onChange={e => setNewItemCategory(e.target.value)}
                  className="flex-1 min-w-[150px] p-4 bg-white rounded-xl border-none focus:ring-2 focus:ring-[#5A5A40]"
                >
                  <option value="">Categoria...</option>
                  {categories.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
                <select
                  value={newItemSector}
                  onChange={e => setNewItemSector(e.target.value)}
                  className="w-40 p-4 bg-white rounded-xl border-none focus:ring-2 focus:ring-[#5A5A40]"
                >
                  <option value="Fritadeira">Fritadeira</option>
                  <option value="Lanches">Lanches</option>
                  <option value="Outros">Outros</option>
                </select>
                <input
                  type="number"
                  step="0.01"
                  value={newItemPrice}
                  onChange={e => setNewItemPrice(e.target.value)}
                  placeholder="Preço"
                  className="w-24 p-4 bg-white rounded-xl border-none focus:ring-2 focus:ring-[#5A5A40]"
                />
                <div className="relative flex-1 min-w-[120px]">
                  <input
                    type="text"
                    maxLength={10}
                    value={newItemQrCode}
                    onChange={e => setNewItemQrCode(e.target.value)}
                    placeholder="Prefixo (4 dígitos)"
                    className="w-full p-4 bg-white rounded-xl border-none focus:ring-2 focus:ring-[#5A5A40] pr-20"
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
                    <button
                      type="button"
                      onClick={() => startScanning((code) => setNewItemQrCode(code.substring(0, 4)))}
                      className="p-2 text-[#5A5A40] hover:bg-[#5A5A40]/10 rounded-lg transition-all"
                      title="Escanear QR Code (pega 4 dígitos)"
                    >
                      <Camera className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewItemQrCode(Math.floor(1000 + Math.random() * 9000).toString())}
                      className="p-2 text-[#5A5A40] hover:bg-[#5A5A40]/10 rounded-lg transition-all"
                      title="Gerar prefixo aleatório"
                    >
                      <RefreshCw className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="absolute -bottom-5 left-0 text-[10px] text-gray-400 font-medium whitespace-nowrap">
                    Digite os 4 primeiros dígitos do QR da máquina
                  </p>
                </div>
                <div className="flex gap-2 w-full md:w-auto">
                  {editingMenuItemId && (
                    <button 
                      type="button"
                      onClick={resetMenuItemForm}
                      className="flex-1 md:flex-none px-6 py-4 bg-gray-200 text-gray-600 rounded-xl font-bold hover:bg-gray-300"
                    >
                      Cancelar
                    </button>
                  )}
                  <button 
                    type="submit"
                    disabled={!newItemName || !newItemCategory}
                    className="flex-1 md:flex-none px-6 py-4 bg-[#151619] text-white rounded-xl font-bold hover:bg-black disabled:opacity-50"
                  >
                    {editingMenuItemId ? 'Salvar' : 'Adicionar'}
                  </button>
                </div>
              </form>

            <div className="space-y-2">
              {menuItems.map(item => (
                <div key={item.id} className="flex items-center justify-between p-4 bg-[#F5F5F0] rounded-xl group">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center font-bold text-[#5A5A40] text-xs">
                      R$
                    </div>
                    <div>
                      <span className="font-medium block">{item.name}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-gray-400 uppercase font-bold">{item.category_name}</span>
                        <span className="text-[10px] text-gray-400 uppercase font-bold">• {item.sector}</span>
                        <span className="text-[10px] text-[#5A5A40] font-bold bg-[#5A5A40]/10 px-1.5 rounded">
                          R$ {item.price?.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => {
                        setSelectedQrItem(item);
                        setActiveTab('qrcodes');
                        setQrType('items');
                      }}
                      className="p-2 text-gray-400 hover:text-[#5A5A40] hover:bg-[#5A5A40]/10 rounded-lg transition-all"
                      title="Ver QR Code"
                    >
                      <QrCodeIcon className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => startEditingMenuItem(item)}
                      className="p-2 text-gray-400 hover:text-[#5A5A40] hover:bg-[#5A5A40]/10 rounded-lg transition-all"
                      title="Editar"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => deleteMenuItem(item.id)}
                      className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                      title="Excluir"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
              {menuItems.length === 0 && (
                <p className="text-center py-8 text-gray-400 italic">Nenhum item cadastrado.</p>
              )}
            </div>
          </div>
        )}

        {activeTab === 'categories' && (
          <div>
            <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
              <Layers className="w-5 h-5 text-[#5A5A40]" />
              Categorias
            </h2>
            
            <form onSubmit={addCategory} className="flex gap-4 mb-8">
              <input
                type="text"
                value={newCategoryName}
                onChange={e => setNewCategoryName(e.target.value)}
                placeholder="Nome da nova categoria..."
                className="flex-1 p-4 bg-[#F5F5F0] rounded-xl border-none focus:ring-2 focus:ring-[#5A5A40]"
              />
              <button 
                type="submit"
                disabled={!newCategoryName}
                className="px-6 bg-[#151619] text-white rounded-xl font-bold hover:bg-black disabled:opacity-50"
              >
                Adicionar
              </button>
            </form>

            <div className="space-y-2">
              {categories.map(cat => (
                <div key={cat.id} className="flex items-center justify-between p-4 bg-[#F5F5F0] rounded-xl group">
                  <span className="font-medium">{cat.name}</span>
                  <button
                    onClick={() => deleteCategory(cat.id)}
                    className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
              {categories.length === 0 && (
                <p className="text-center py-8 text-gray-400 italic">Nenhuma categoria cadastrada.</p>
              )}
            </div>
          </div>
        )}

        {activeTab === 'users' && (
          <div>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <User className="w-5 h-5 text-[#5A5A40]" />
                {editingUserId ? 'Editar Usuário' : 'Usuários do Sistema'}
              </h2>
            </div>

            <form onSubmit={handleUserSubmit} className="flex flex-col gap-4 mb-8 bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
              {error && (
                <div className="p-3 bg-red-50 text-red-600 rounded-xl text-sm font-medium border border-red-100">
                  {error}
                </div>
              )}
              <div className="flex gap-4">
                <input
                  type="text"
                  value={newUserName}
                  onChange={e => setNewUserName(e.target.value)}
                  placeholder="Nome do usuário..."
                  className="flex-1 p-4 bg-[#F5F5F0] rounded-xl border-none focus:ring-2 focus:ring-[#5A5A40]"
                />
                <input
                  type="password"
                  value={newUserPassword}
                  onChange={e => setNewUserPassword(e.target.value)}
                  placeholder={editingUserId ? "Nova senha (deixe em branco para manter)" : "Senha..."}
                  className="flex-1 p-4 bg-[#F5F5F0] rounded-xl border-none focus:ring-2 focus:ring-[#5A5A40]"
                />
              </div>
              
              <div className="flex flex-wrap gap-2">
                {VIEWS.map(view => (
                  <button
                    key={view.id}
                    type="button"
                    onClick={() => toggleView(view.id)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${
                      selectedViews.includes(view.id)
                        ? 'bg-[#5A5A40] text-white border-[#5A5A40]'
                        : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {view.label}
                  </button>
                ))}
              </div>

              <div className="flex gap-2 justify-end mt-2">
                {editingUserId && (
                  <button 
                    type="button"
                    onClick={resetUserForm}
                    className="px-6 py-3 bg-gray-100 text-gray-600 rounded-xl font-bold hover:bg-gray-200 flex items-center gap-2"
                  >
                    <X className="w-4 h-4" />
                    Cancelar
                  </button>
                )}
                <button 
                  type="submit"
                  disabled={!newUserName || (!editingUserId && !newUserPassword) || isSaving}
                  className="px-6 py-3 bg-[#151619] text-white rounded-xl font-bold hover:bg-black disabled:opacity-50 flex items-center gap-2"
                >
                  {isSaving ? 'Salvando...' : (
                    <>
                      {editingUserId ? <Edit2 className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                      {editingUserId ? 'Salvar Alterações' : 'Adicionar Usuário'}
                    </>
                  )}
                </button>
              </div>
            </form>

            <div className="space-y-2">
              {users.map(user => (
                <div key={user.id} className={`flex items-center justify-between p-4 rounded-xl group transition-all ${
                  editingUserId === user.id ? 'bg-[#5A5A40]/10 border border-[#5A5A40]' : 'bg-[#F5F5F0]'
                }`}>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-[#5A5A40]/10 rounded-full flex items-center justify-center">
                      <User className="w-4 h-4 text-[#5A5A40]" />
                    </div>
                    <div>
                      <span className="font-medium block">{user.name}</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {user.allowed_views?.split(',').map(view => (
                          <span key={view} className="px-1.5 py-0.5 bg-gray-200 rounded text-[10px] text-gray-600">
                            {VIEWS.find(v => v.id === view)?.label || view}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => startEditingUser(user)}
                      className="p-2 text-gray-400 hover:text-[#5A5A40] hover:bg-[#5A5A40]/10 rounded-lg transition-all"
                      title="Editar"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => deleteUser(user.id)}
                      className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                      title="Excluir"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
              {users.length === 0 && (
                <p className="text-center py-8 text-gray-400 italic">Nenhum usuário cadastrado.</p>
              )}
            </div>
          </div>
        )}

        {activeTab === 'qrcodes' && (
          <div>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <QrCodeIcon className="w-5 h-5 text-[#5A5A40]" />
                Gerador de QR Codes
              </h2>
              <button
                onClick={() => window.print()}
                className="px-4 py-2 bg-[#5A5A40] text-white rounded-xl font-bold text-sm flex items-center gap-2 hover:bg-[#4A4A30] transition-colors shadow-sm"
              >
                <Printer className="w-4 h-4" />
                Imprimir Todos
              </button>
            </div>

            <div className="flex gap-4 mb-8">
              <button
                onClick={() => setQrType('fichas')}
                className={`flex-1 py-3 rounded-xl font-bold transition-all ${
                  qrType === 'fichas' ? 'bg-[#5A5A40] text-white' : 'bg-gray-100 text-gray-500'
                }`}
              >
                Fichas (Mesas)
              </button>
              <button
                onClick={() => setQrType('items')}
                className={`flex-1 py-3 rounded-xl font-bold transition-all ${
                  qrType === 'items' ? 'bg-[#5A5A40] text-white' : 'bg-gray-100 text-gray-500'
                }`}
              >
                Itens do Cardápio
              </button>
            </div>

            {qrType === 'fichas' ? (
              <div className="space-y-6">
                <div className="flex items-end gap-4 bg-gray-50 p-6 rounded-2xl border border-gray-100 no-print">
                  <div className="flex-1">
                    <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Início</label>
                    <input
                      type="number"
                      value={fichasRange.start}
                      onChange={e => setFichasRange(prev => ({ ...prev, start: parseInt(e.target.value) || 1 }))}
                      className="w-full p-4 bg-white rounded-xl border-none focus:ring-2 focus:ring-[#5A5A40]"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Fim</label>
                    <input
                      type="number"
                      value={fichasRange.end}
                      onChange={e => setFichasRange(prev => ({ ...prev, end: parseInt(e.target.value) || 1 }))}
                      className="w-full p-4 bg-white rounded-xl border-none focus:ring-2 focus:ring-[#5A5A40]"
                    />
                  </div>
                  <button 
                    onClick={() => generatePDF('download')}
                    disabled={isGeneratingPdf}
                    className="px-6 py-4 bg-[#5A5A40] text-white rounded-xl font-bold hover:bg-[#4A4A30] flex items-center gap-2 disabled:opacity-50"
                  >
                    <FileDown className="w-4 h-4" />
                    {isGeneratingPdf ? 'Gerando...' : 'Baixar PDF'}
                  </button>
                  <button 
                    onClick={() => generatePDF('preview')}
                    disabled={isGeneratingPdf}
                    className="px-6 py-4 bg-[#F27D26] text-white rounded-xl font-bold hover:bg-[#D26D16] flex items-center gap-2 disabled:opacity-50"
                  >
                    <Eye className="w-4 h-4" />
                    Visualizar
                  </button>
                  <button 
                    onClick={() => window.print()}
                    className="px-6 py-4 bg-[#151619] text-white rounded-xl font-bold hover:bg-black flex items-center gap-2"
                  >
                    <Printer className="w-4 h-4" />
                    Imprimir
                  </button>
                </div>

                {/* Banco de dados e persistencia */}
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 no-print shadow-sm">
                  <div className="flex-1">
                    <h3 className="text-amber-800 font-bold text-sm mb-1 font-sans">Salvar / Atualizar Fichas no Banco de Dados</h3>
                    <p className="text-amber-700 text-xs leading-relaxed">
                      Para garantir que o sistema de pedidos e os leitores portáteis de câmera reconheçam suas fichas impressas para sempre, clique no botão ao lado para salvar a faixa de fichas do <strong>#{fichasRange.start} ao #{fichasRange.end}</strong> de forma permanente no banco de dados.
                    </p>
                  </div>
                  <button
                    onClick={handleSaveFichasToDatabase}
                    disabled={isSavingFichas}
                    className="flex items-center gap-2 px-6 py-3.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl text-sm transition-all shadow-sm active:scale-95 disabled:opacity-50 whitespace-nowrap"
                  >
                    <RefreshCw className={`w-4 h-4 ${isSavingFichas ? 'animate-spin' : ''}`} />
                    {isSavingFichas ? 'Salvando no Banco...' : 'Gravar Fichas no Sistema'}
                  </button>
                </div>
                {fichasSaveSuccess && (
                  <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl p-4 text-xs font-bold no-print shadow-sm transition-all">
                    {fichasSaveSuccess}
                  </div>
                )}

                <div 
                  id="qr-capture-container"
                  ref={qrContainerRef}
                  className="grid grid-cols-3 gap-0 bg-[#ffffff] mx-auto print:grid-cols-3"
                  style={{ width: '210mm', minHeight: '100px' }}
                >
                  {Array.from({ length: Math.max(0, fichasRange.end - fichasRange.start + 1) }, (_, i) => {
                    const num = fichasRange.start + i;
                    return (
                      <div 
                        key={num} 
                        className="bg-[#ffffff] border-4 border-[#F27D26] flex flex-col items-center justify-between relative overflow-hidden"
                        style={{ 
                          width: '70mm', 
                          height: '80mm', 
                          padding: '6mm 4mm',
                          backgroundImage: 'radial-gradient(#F27D26 0.5px, transparent 0.5px)',
                          backgroundSize: '10px 10px'
                        }}
                      >
                        {/* Plaid-like corner accents */}
                        <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-[#5A5A40] opacity-40" />
                        <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-[#5A5A40] opacity-40" />
                        <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-[#5A5A40] opacity-40" />
                        <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-[#5A5A40] opacity-40" />

                        <div className="text-center z-10">
                          <p className="text-[10px] font-black text-[#F27D26] uppercase tracking-[0.4em] mb-0">Arraiá do Lar</p>
                          <h4 className="text-2xl font-serif italic text-[#5A5A40] leading-none">São Cristóvão</h4>
                        </div>
                        
                        <div className="flex-1 flex flex-col items-center justify-center gap-0.5 w-full -mt-1">
                          <div className="p-1.5 bg-[#ffffff] border-[3px] border-[#F27D26] rounded-2xl shadow-md rotate-1">
                            <QRCodeSVG value={num.toString()} size={100} level="H" />
                          </div>
                          
                          <div className="flex flex-col items-center z-10 -mt-1">
                            <span className="text-[9px] font-bold text-[#9ca3af] uppercase tracking-[0.2em] mb-0">Ficha Número</span>
                            <span className="text-6xl font-black text-[#151619] leading-none tracking-tighter">{num}</span>
                          </div>
                        </div>
                        
                        <div className="pt-1 border-t border-dashed border-[#F27D26] w-full text-center mt-0" style={{ borderColor: 'rgba(242, 125, 38, 0.4)' }}>
                          <p className="text-[10px] text-[#5A5A40] font-bold uppercase italic tracking-tight">🔥 Êta trem bão, sô! 🔥</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="bg-gray-50 p-6 rounded-2xl border border-gray-100">
                  <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Selecionar Item</label>
                  <select
                    value={selectedQrItem?.id || ''}
                    onChange={e => {
                      const item = menuItems.find(i => String(i.id) === String(e.target.value)) || null;
                      setSelectedQrItem(item);
                      setQrInputValue(item?.qr_code || '');
                    }}
                    className="w-full p-4 bg-white rounded-xl border-none focus:ring-2 focus:ring-[#5A5A40]"
                  >
                    <option value="">Selecione um item...</option>
                    {menuItems.map(item => (
                      <option key={item.id} value={item.id}>
                        {item.name} {item.qr_code ? `(${item.qr_code})` : '(Sem QR)'}
                      </option>
                    ))}
                  </select>
                </div>

                {selectedQrItem ? (
                  <div className="space-y-6">
                    {selectedQrItem.qr_code ? (
                      <>
                        <div className="flex items-center gap-4 no-print">
                          <button 
                            onClick={() => generatePDF('download')}
                            disabled={isGeneratingPdf}
                            className="px-6 py-4 bg-[#5A5A40] text-white rounded-xl font-bold hover:bg-[#4A4A30] flex items-center gap-2 disabled:opacity-50"
                          >
                            <FileDown className="w-4 h-4" />
                            {isGeneratingPdf ? 'Gerando...' : 'Baixar PDF'}
                          </button>
                          <button 
                            onClick={() => generatePDF('preview')}
                            disabled={isGeneratingPdf}
                            className="px-6 py-4 bg-[#F27D26] text-white rounded-xl font-bold hover:bg-[#D26D16] flex items-center gap-2 disabled:opacity-50"
                          >
                            <Eye className="w-4 h-4" />
                            Visualizar
                          </button>
                          <button 
                            onClick={() => window.print()}
                            className="px-6 py-4 bg-[#151619] text-white rounded-xl font-bold hover:bg-black flex items-center gap-2"
                          >
                            <Printer className="w-4 h-4" />
                            Imprimir
                          </button>
                        </div>

                        <div 
                          id="qr-capture-item"
                          ref={qrContainerRef}
                          className="bg-[#ffffff] p-12 rounded-[32px] border border-[#f3f4f6] shadow-sm flex flex-col items-center gap-6 max-w-2xl mx-auto"
                        >
                          <div className="text-center">
                            <h3 className="text-2xl font-serif italic text-[#5A5A40] mb-1">{selectedQrItem.name}</h3>
                            <p className="text-[#9ca3af] text-sm font-bold uppercase tracking-widest">{selectedQrItem.category_name}</p>
                          </div>
                          
                          <div className="p-4 bg-[#ffffff] border-4 border-[#5A5A40] rounded-3xl qrcode-wrapper">
                            <QRCodeSVG value={selectedQrItem.qr_code || ''} size={200} level="H" />
                          </div>
      
                          <div className="text-center">
                            <span className="text-xs font-bold text-[#d1d5db] block mb-1 uppercase">Código Escaneável</span>
                            <code className="bg-[#f3f4f6] px-4 py-2 rounded-lg font-mono text-[#5A5A40] font-bold">
                              {selectedQrItem.qr_code}
                            </code>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="bg-white p-12 rounded-[32px] border border-[#f3f4f6] shadow-sm flex flex-col items-center gap-6 max-w-2xl mx-auto text-center">
                        <QrCodeIcon className="w-16 h-16 text-gray-200" />
                        <div>
                          <h3 className="text-xl font-bold text-gray-700 mb-2">Item sem QR Code</h3>
                          <p className="text-gray-400 mb-6">Este item ainda não possui um código QR associado. Defina um código abaixo para gerá-lo.</p>
                        </div>
                        <div className="flex gap-2 w-full max-w-sm">
                          <div className="relative flex-1">
                            <input
                              type="text"
                              value={qrInputValue}
                              onChange={e => setQrInputValue(e.target.value.toUpperCase())}
                              placeholder="Digite ou gere um código..."
                              className="w-full p-4 bg-gray-50 rounded-xl border-none focus:ring-2 focus:ring-[#5A5A40] pr-20"
                            />
                            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
                              <button
                                type="button"
                                onClick={() => startScanning((code) => {
                                  setQrInputValue(code);
                                })}
                                className="p-2 text-[#5A5A40] hover:bg-[#5A5A40]/10 rounded-lg transition-all"
                                title="Escanear QR Code"
                              >
                                <Camera className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setQrInputValue(Math.random().toString(36).substring(2, 10).toUpperCase());
                                }}
                                className="p-2 text-[#5A5A40] hover:bg-[#5A5A40]/10 rounded-lg transition-all"
                                title="Gerar código aleatório"
                              >
                                <RefreshCw className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                          <button
                            onClick={async () => {
                              if (qrInputValue && selectedQrItem) {
                                try {
                                  const updatedData = { ...selectedQrItem, qr_code: qrInputValue };
                                  await firebaseService.updateMenuItem(selectedQrItem.id, updatedData);
                                  setMenuItems(prev => prev.map(i => String(i.id) === String(selectedQrItem.id) ? { ...i, qr_code: qrInputValue } : i));
                                  setSelectedQrItem({ ...selectedQrItem, qr_code: qrInputValue });
                                } catch (error) {
                                  console.error('Erro ao salvar QR code:', error);
                                }
                              }
                            }}
                            className="px-6 py-4 bg-[#5A5A40] text-white rounded-xl font-bold hover:bg-[#4A4A30]"
                          >
                            Salvar
                          </button>
                        </div>
                        
                        {qrInputValue && (
                          <div className="mt-4 p-4 bg-white border-2 border-dashed border-gray-200 rounded-2xl flex flex-col items-center gap-2">
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Pré-visualização</span>
                            <QRCodeSVG value={qrInputValue} size={120} />
                            <code className="text-xs font-mono text-gray-500">{qrInputValue}</code>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-12 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                    <QrCodeIcon className="w-12 h-12 text-gray-200 mx-auto mb-4" />
                    <p className="text-gray-400 italic">Selecione um item para visualizar ou gerar seu QR Code.</p>
                  </div>
                )}
              </div>
            )}

            {/* Hidden Section for Printing All QR Codes */}
            <div className="hidden print:block print-qr-section">
              <div className="grid grid-cols-3 gap-8 p-8">
                {/* Fichas */}
                {Array.from({ length: Math.max(0, fichasRange.end - fichasRange.start + 1) }, (_, i) => {
                  const num = fichasRange.start + i;
                  return (
                    <div key={`print-ficha-${num}`} className="flex flex-col items-center p-4 border-2 border-black rounded-2xl">
                      <QRCodeSVG value={num.toString()} size={150} />
                      <p className="mt-2 font-bold text-lg">Ficha #{num}</p>
                    </div>
                  );
                })}
                {/* Items */}
                {menuItems.filter(i => i.qr_code).map(item => (
                  <div key={`print-item-${item.id}`} className="flex flex-col items-center p-4 border-2 border-black rounded-2xl">
                    <QRCodeSVG value={item.qr_code || ''} size={150} />
                    <p className="mt-2 font-bold text-lg text-center">{item.name}</p>
                    <p className="text-sm text-gray-500">{item.qr_code}</p>
                  </div>
                ))}
              </div>
            </div>

            <style dangerouslySetInnerHTML={{ __html: `
              @media print {
                body * { visibility: hidden !important; }
                .print-qr-section, .print-qr-section * { visibility: visible !important; }
                .print-qr-section { 
                  position: absolute !important; 
                  left: 0 !important; 
                  top: 0 !important; 
                  width: 100% !important; 
                  background: white !important;
                }
                @page {
                  size: A4 portrait !important;
                  margin: 10mm !important;
                }
              }
            ` }} />

            {/* Scanner Modal */}
            {isScanning && (
              <div className="fixed inset-0 bg-black/90 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
                <div className="bg-white rounded-[40px] p-8 w-full max-w-md shadow-2xl relative overflow-hidden">
                  {/* Decorative Background */}
                  <div className="absolute top-0 right-0 w-32 h-32 bg-[#5A5A40]/5 rounded-full -mr-16 -mt-16" />
                  
                  <div className="flex justify-between items-center mb-8 relative z-10">
                    <div>
                      <h3 className="text-2xl font-serif italic text-[#5A5A40]">Escanear QR</h3>
                      <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">Aponte para o código</p>
                    </div>
                    <button 
                      onClick={stopScanning} 
                      className="p-3 bg-gray-50 hover:bg-gray-100 rounded-2xl text-gray-400 transition-all"
                    >
                      <X className="w-6 h-6" />
                    </button>
                  </div>

                  <div className="relative group">
                    <div id="qr-reader" className="overflow-hidden rounded-[32px] border-4 border-[#5A5A40] bg-black aspect-square shadow-inner"></div>
                    
                    {/* Scanner Overlay UI */}
                    <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                      <div className="w-64 h-64 border-2 border-white/30 rounded-3xl relative">
                        {/* Corners */}
                        <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-[#F27D26] rounded-tl-xl" />
                        <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-[#F27D26] rounded-tr-xl" />
                        <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-[#F27D26] rounded-bl-xl" />
                        <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-[#F27D26] rounded-br-xl" />
                        
                        {/* Scanning Line */}
                        <motion.div 
                          animate={{ top: ['10%', '90%', '10%'] }}
                          transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                          className="absolute left-4 right-4 h-0.5 bg-[#F27D26] shadow-[0_0_15px_rgba(242,125,38,0.8)] z-20"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="mt-8 space-y-4 relative z-10">
                    <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-2xl border border-gray-100">
                      <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm">
                        <Camera className="w-5 h-5 text-[#5A5A40]" />
                      </div>
                      <p className="text-sm text-gray-600 font-medium">
                        O código será importado automaticamente ao ser detectado.
                      </p>
                    </div>
                    
                    <button
                      onClick={() => {
                        const manualCode = prompt("Digite o código manualmente:");
                        if (manualCode && scanCallback) {
                          scanCallback(manualCode.toUpperCase());
                          stopScanning();
                        }
                      }}
                      className="w-full py-4 bg-white border-2 border-[#5A5A40] text-[#5A5A40] rounded-2xl font-bold hover:bg-gray-50 transition-all flex items-center justify-center gap-2"
                    >
                      <Edit2 className="w-4 h-4" />
                      Digitar Manualmente
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
