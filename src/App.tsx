import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ChefHat, 
  ClipboardList, 
  Monitor, 
  Truck, 
  Plus, 
  CheckCircle2, 
  Clock, 
  AlertCircle,
  UtensilsCrossed,
  History as HistoryIcon,
  LogOut,
  Package,
  QrCode,
  Layers
} from 'lucide-react';
import { firebaseService } from './services/firebaseService';
import { audioService } from './services/audioService';
import { Order, User } from './types';
import Reception from './views/Reception';
import Kitchen from './views/Kitchen';
import KitchenSectors from './views/KitchenSectors';
import Display from './views/Display';
import Delivery from './views/Delivery';
import History from './views/History';
import AdminDashboard from './views/AdminDashboard';
import Admin from './views/Admin';
import Inventory from './views/Inventory';
import { KitchenScanner } from './views/KitchenScanner';
import ExtraFichas from './views/ExtraFichas';
import Login from './views/Login';
import DispatchStation from './views/DispatchStation';

type View = 'reception' | 'kitchen' | 'kitchen-sectors' | 'display' | 'delivery' | 'history' | 'admin' | 'dashboard' | 'inventory' | 'kitchen-scanner' | 'extra-fichas';

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('kitchen_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [currentView, setCurrentView] = useState<View>(() => {
    const hash = window.location.hash.replace('#', '');
    const validViews: View[] = ['reception', 'kitchen', 'kitchen-sectors', 'display', 'delivery', 'history', 'admin', 'dashboard', 'inventory', 'kitchen-scanner', 'extra-fichas'];
    return (validViews.includes(hash as View) ? hash : 'reception') as View;
  });
  const [isTvMode, setIsTvMode] = useState(() => {
    const hash = window.location.hash.replace('#', '');
    return hash === 'display' || hash === 'kitchen-sectors';
  });

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '');
      const validViews: View[] = ['reception', 'kitchen', 'kitchen-sectors', 'display', 'delivery', 'history', 'admin', 'dashboard', 'inventory', 'kitchen-scanner', 'extra-fichas'];
      if (validViews.includes(hash as View)) {
        setCurrentView(hash as View);
        setIsTvMode(hash === 'display' || hash === 'kitchen-sectors');
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const currentViewRef = useRef(currentView);
  const ordersCountRef = useRef(0);

  useEffect(() => {
    currentViewRef.current = currentView;
  }, [currentView]);

  const [orders, setOrders] = useState<Order[]>([]);
  const [isInitializing, setIsInitializing] = useState(true);
  const [isAuthReady, setIsAuthReady] = useState(false);

  useEffect(() => {
    const init = async () => {
      try {
        await firebaseService.ensureAuth();
        await firebaseService.seedInitialData();
      } catch (err) {
        console.warn('Initial auth/seeding failed (continuing to login):', err);
      } finally {
        setIsAuthReady(true);
      }
    };
    init();
  }, []);

  useEffect(() => {
    if (!isAuthReady || !currentUser) {
      if (isAuthReady && !currentUser) setIsInitializing(false);
      return;
    }

    // Listen to orders in real-time
    const unsubscribe = firebaseService.listenToOrders((newOrders) => {
      const prevCount = ordersCountRef.current;
      ordersCountRef.current = newOrders.length;

      setOrders(newOrders);
      
      // Play a loud counter bell when a new order appears in any of the kitchen or display views
      if (prevCount > 0 && newOrders.length > prevCount) {
        if (['kitchen', 'display', 'kitchen-sectors', 'kitchen-scanner'].includes(currentViewRef.current)) {
          audioService.playInternalOrderSound();
        }
      }
      setIsInitializing(false);
    });

    // Timeout safety for initialization: if orders listener doesn't fire in 5s, continue anyway
    const timeout = setTimeout(() => {
      setIsInitializing(false);
    }, 5000);

    return () => {
      unsubscribe();
      clearTimeout(timeout);
    };
  }, [isAuthReady, currentUser?.id]);

  useEffect(() => {
    const handleViewChange = (e: any) => {
      if (e.detail) setCurrentView(e.detail);
    };
    window.addEventListener('change-view', handleViewChange);
    return () => window.removeEventListener('change-view', handleViewChange);
  }, []);

  const handleLogin = (user: User) => {
    setCurrentUser(user);
    // Set initial view to first allowed view
    const allowed = user.allowed_views ? user.allowed_views.split(',') : [];
    if (allowed.length > 0) {
      setCurrentView(allowed[0] as View);
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
  };

  const renderView = () => {
    switch (currentView) {
      case 'reception': return <Reception isAdmin={currentUser?.role === 'admin'} orders={orders} />;
      case 'kitchen': return <Kitchen orders={orders} />;
      case 'kitchen-sectors': return <KitchenSectors orders={orders} />;
      case 'display': return <Display orders={orders} onBack={() => setCurrentView('reception')} />;
      case 'delivery': return <DispatchStation orders={orders} />;
      case 'history': return <History />;
      case 'dashboard': return <AdminDashboard />;
      case 'inventory': return <Inventory currentUser={currentUser!} />;
      case 'admin': return <Admin />;
      case 'kitchen-scanner': return <KitchenScanner />;
      case 'extra-fichas': return <ExtraFichas />;
    }
  };

  if (!isAuthReady || (currentUser && isInitializing)) {
    return (
      <div className="min-h-screen bg-[#F5F5F0] flex flex-col items-center justify-center p-8 text-center">
        <div className="w-16 h-16 bg-[#5A5A40] rounded-2xl flex items-center justify-center mb-6 animate-bounce">
          <UtensilsCrossed className="text-white w-8 h-8" />
        </div>
        <h2 className="text-2xl font-serif italic text-[#5A5A40] mb-2">Carregando Sistema...</h2>
        <p className="text-gray-500 text-sm uppercase tracking-widest">Arraiá do Lar São Cristóvão</p>
      </div>
    );
  }

  if (!currentUser) {
    return <Login onLogin={handleLogin} />;
  }

  const allowedViews = currentUser.allowed_views ? currentUser.allowed_views.split(',') : [];

  return (
    <div className="min-h-screen bg-[#F5F5F0] text-[#1A1A1A] font-sans">
      {/* Navigation Rail */}
      {!isTvMode && (
        <nav className="fixed left-0 top-0 h-full w-20 bg-[#151619] flex flex-col items-center py-8 gap-8 z-50 overflow-y-auto overflow-x-hidden">
          <div className="w-12 h-12 bg-[#5A5A40] rounded-2xl flex items-center justify-center mb-4">
            <UtensilsCrossed className="text-white w-6 h-6" />
          </div>
          
          {allowedViews.includes('reception') && (
            <NavButton 
              active={currentView === 'reception'} 
              onClick={() => setCurrentView('reception')}
              icon={<Plus />}
              label="Ficha"
            />
          )}
          {allowedViews.includes('kitchen') && (
            <NavButton 
              active={currentView === 'kitchen'} 
              onClick={() => setCurrentView('kitchen')}
              icon={<ChefHat />}
              label="Cozinha"
            />
          )}
          {allowedViews.includes('kitchen-scanner') && (
            <NavButton 
              active={currentView === 'kitchen-scanner'} 
              onClick={() => setCurrentView('kitchen-scanner')}
              icon={<QrCode />}
              label="Bip Cozinha"
            />
          )}
          {allowedViews.includes('kitchen-sectors') && (
            <NavButton 
              active={currentView === 'kitchen-sectors'} 
              onClick={() => setCurrentView('kitchen-sectors')}
              icon={<Layers className="text-orange-500" />}
              label="Setores"
            />
          )}
          {allowedViews.includes('delivery') && (
            <NavButton 
              active={currentView === 'delivery'} 
              onClick={() => setCurrentView('delivery')}
              icon={<Truck />}
              label="Entrega"
            />
          )}
          {allowedViews.includes('display') && (
            <NavButton 
              active={currentView === 'display'} 
              onClick={() => setCurrentView('display')}
              icon={<Monitor />}
              label="Painel"
            />
          )}
          {allowedViews.includes('inventory') && (
            <NavButton 
              active={currentView === 'inventory'} 
              onClick={() => setCurrentView('inventory')}
              icon={<Package />}
              label="Estoque"
            />
          )}
          {allowedViews.includes('history') && (
            <NavButton 
              active={currentView === 'history'} 
              onClick={() => setCurrentView('history')}
              icon={<HistoryIcon />}
              label="Histórico"
            />
          )}
          
          <div className="mt-auto flex flex-col gap-4 items-center">
            {allowedViews.includes('dashboard') && (
              <NavButton 
                active={currentView === 'dashboard'} 
                onClick={() => setCurrentView('dashboard')}
                icon={<ClipboardList />}
                label="Dash"
              />
            )}
            {allowedViews.includes('admin') && (
              <NavButton 
                active={currentView === 'admin'} 
                onClick={() => setCurrentView('admin')}
                icon={<AlertCircle />}
                label="Config"
              />
            )}

            {allowedViews.includes('admin') && (
              <NavButton 
                active={currentView === 'extra-fichas'} 
                onClick={() => setCurrentView('extra-fichas')}
                icon={<QrCode className="text-yellow-500" />}
                label="Extras"
              />
            )}
            
            <button
              onClick={handleLogout}
              className="p-3 text-gray-500 hover:text-red-400 hover:bg-white/5 rounded-xl transition-all"
              title="Sair"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </nav>
      )}

      {/* Main Content */}
      <main className={`${!isTvMode ? 'pl-20' : ''} min-h-screen`}>
        <AnimatePresence mode="wait">
          <motion.div
            key={currentView}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
            className="p-8"
          >
            {renderView()}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}

function NavButton({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button
      onClick={onClick}
      className={`group relative flex flex-col items-center gap-1 transition-all ${
        active ? 'text-white' : 'text-gray-500 hover:text-gray-300'
      }`}
    >
      <div className={`p-3 rounded-xl transition-all ${
        active ? 'bg-[#5A5A40]' : 'bg-transparent group-hover:bg-white/5'
      }`}>
        {icon}
      </div>
      <span className="text-[10px] uppercase tracking-wider font-bold">{label}</span>
      {active && (
        <motion.div 
          layoutId="active-nav"
          className="absolute -right-4 top-1/2 -translate-y-1/2 w-1 h-8 bg-[#5A5A40] rounded-l-full"
        />
      )}
    </button>
  );
}
