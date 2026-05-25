import { 
  collection, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  setDoc,
  doc, 
  getDocs, 
  getDoc,
  serverTimestamp,
  Timestamp,
  limit,
  writeBatch
} from 'firebase/firestore';
import { signInAnonymously } from 'firebase/auth';
import { db, auth } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/firestoreUtils';
import { Order, MenuItem, Category, User, StockHistory, OrderStatus } from '../types';

const COLLECTIONS = {
  CATEGORIES: 'categories',
  MENU_ITEMS: 'menu_items',
  ORDERS: 'orders',
  USERS: 'users',
  STOCK_HISTORY: 'stock_history',
  EXTRA_FICHAS: 'extra_fichas'
};

export const firebaseService = {
  // --- AUTH ---
  async ensureAuth(): Promise<void> {
    try {
      if (!auth.currentUser) {
        await signInAnonymously(auth);
      }
    } catch (error: any) {
      console.error('Auth error:', error);
      if (error.code === 'auth/admin-restricted-operation' || error.message?.includes('admin-restricted-operation')) {
        throw new Error(
          'AUTENTICAÇÃO ANÔNIMA DESATIVADA: Para permitir login sem Google, você deve ativar o provedor "Anônimo" no Console do Firebase (Authentication > Provedores).'
        );
      }
      throw error;
    }
  },

  async login(username: string, password?: string): Promise<User> {
    try {
      await this.ensureAuth();
      const currentUid = auth.currentUser!.uid;

      const q = query(
        collection(db, COLLECTIONS.USERS), 
        where('name', '==', username)
      );
      
      const snapshot = await getDocs(q);
      if (snapshot.empty) {
        // Se for o administrador principal e o banco estiver vazio, podemos tentar criar
        if (username.toLowerCase() === 'admin' && (password === '1234' || !password)) {
           return this.createFirstAdmin(currentUid);
        }
        throw new Error('Usuário não encontrado');
      }

      const foundUserDoc = snapshot.docs[0];
      const userData = foundUserDoc.data() as User;
      
      if (userData.password && userData.password !== password) {
        throw new Error('Senha incorreta');
      }

      const userRef = doc(db, COLLECTIONS.USERS, currentUid);
      const authenticatedUser = { 
        ...userData, 
        id: currentUid,
        original_doc_id: foundUserDoc.id,
        updated_at: serverTimestamp() 
      };
      
      const { password: _, updated_at: __, ...secureData } = authenticatedUser;
      await setDoc(userRef, secureData, { merge: true });

      // Return a clean object for the UI/LocalStorage
      return { 
        ...secureData, 
        id: currentUid,
        updated_at: new Date().toISOString() 
      } as unknown as User;
    } catch (error: any) {
      if (error.message.includes('AUTENTICAÇÃO ANÔNIMA')) throw error;
      handleFirestoreError(error, OperationType.GET, COLLECTIONS.USERS);
    }
  },

  async createFirstAdmin(uid: string): Promise<User> {
    const adminData = {
      name: 'admin',
      password: '1234',
      role: 'admin',
      allowed_views: 'reception,kitchen,kitchen-scanner,kitchen-sectors,delivery,display,inventory,history,dashboard,admin',
      created_at: serverTimestamp()
    };
    await setDoc(doc(db, COLLECTIONS.USERS, uid), adminData);
    return { id: uid, ...adminData } as unknown as User;
  },

  async getUsers(): Promise<User[]> {
    try {
      const q = query(collection(db, COLLECTIONS.USERS), orderBy('name'));
      const snapshot = await getDocs(q);
      return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as User));
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, COLLECTIONS.USERS);
    }
  },

  async createUser(user: Partial<User>): Promise<User> {
    try {
      const docData = {
        ...user,
        created_at: serverTimestamp()
      };
      const docRef = await addDoc(collection(db, COLLECTIONS.USERS), docData);
      return { id: docRef.id, ...docData } as unknown as User;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, COLLECTIONS.USERS);
    }
  },

  async updateUser(id: string, updates: Partial<User>): Promise<void> {
    try {
      await updateDoc(doc(db, COLLECTIONS.USERS, id), updates);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, COLLECTIONS.USERS);
    }
  },

  async deleteUser(id: string): Promise<void> {
    try {
      await deleteDoc(doc(db, COLLECTIONS.USERS, id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, COLLECTIONS.USERS);
    }
  },

  // --- CATEGORIES ---
  async getCategories(): Promise<Category[]> {
    try {
      const q = query(collection(db, COLLECTIONS.CATEGORIES), orderBy('name'));
      const snapshot = await getDocs(q);
      return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Category));
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, COLLECTIONS.CATEGORIES);
    }
  },

  async createCategory(name: string): Promise<Category> {
    try {
      const docData = { name, created_at: serverTimestamp() };
      const docRef = await addDoc(collection(db, COLLECTIONS.CATEGORIES), docData);
      return { id: docRef.id, name };
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, COLLECTIONS.CATEGORIES);
    }
  },

  async deleteCategory(id: string): Promise<void> {
    try {
      await deleteDoc(doc(db, COLLECTIONS.CATEGORIES, id));
      // Optionally delete menu items in this category or set category_id to null
      const q = query(collection(db, COLLECTIONS.MENU_ITEMS), where('category_id', '==', id));
      const snapshot = await getDocs(q);
      const batch = writeBatch(db);
      snapshot.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, COLLECTIONS.CATEGORIES);
    }
  },

  // --- MENU ITEMS ---
  async getMenu(): Promise<MenuItem[]> {
    try {
      const q = query(collection(db, COLLECTIONS.MENU_ITEMS), orderBy('name'));
      const snapshot = await getDocs(q);
      // We might need to join with categories in the client for category_name if rules allow it
      // but let's assume we fetch categories separately
      return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as MenuItem));
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, COLLECTIONS.MENU_ITEMS);
    }
  },

  async createMenuItem(item: Partial<MenuItem>): Promise<MenuItem> {
    try {
      const docData = {
        ...item,
        active: item.active ?? true,
        stock_quantity: item.stock_quantity ?? 0,
        price: item.price ?? 0,
        created_at: serverTimestamp()
      };
      const docRef = await addDoc(collection(db, COLLECTIONS.MENU_ITEMS), docData);
      return { id: docRef.id, ...docData } as MenuItem;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, COLLECTIONS.MENU_ITEMS);
    }
  },

  async updateMenuItem(id: string, updates: Partial<MenuItem>): Promise<void> {
    try {
      await updateDoc(doc(db, COLLECTIONS.MENU_ITEMS, id), updates);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, COLLECTIONS.MENU_ITEMS);
    }
  },

  async deleteMenuItem(id: string): Promise<void> {
    try {
      await deleteDoc(doc(db, COLLECTIONS.MENU_ITEMS, id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, COLLECTIONS.MENU_ITEMS);
    }
  },

  // --- ORDERS ---
  listenToOrders(callback: (orders: Order[]) => void) {
    // Only listen to non-closed orders for active views
    const q = query(
      collection(db, COLLECTIONS.ORDERS),
      where('status', 'in', ['pending', 'preparing', 'ready', 'delivered']),
      orderBy('created_at', 'desc')
    );

    return onSnapshot(q, (snapshot) => {
      const orders = snapshot.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          ...data,
          created_at: data.created_at?.toDate?.()?.toISOString() || new Date().toISOString(),
          updated_at: data.updated_at?.toDate?.()?.toISOString() || new Date().toISOString()
        } as Order;
      });
      callback(orders);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, COLLECTIONS.ORDERS);
    });
  },

  listenToRecentOrders(callback: (orders: Order[]) => void) {
    const q = query(
      collection(db, COLLECTIONS.ORDERS),
      orderBy('created_at', 'desc'),
      limit(10)
    );

    return onSnapshot(q, (snapshot) => {
      const orders = snapshot.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          ...data,
          created_at: data.created_at?.toDate?.()?.toISOString() || new Date().toISOString(),
          updated_at: data.updated_at?.toDate?.()?.toISOString() || new Date().toISOString()
        } as Order;
      });
      callback(orders);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, COLLECTIONS.ORDERS);
    });
  },

  async createOrder(ticketNumber: string, items: any[]): Promise<Order> {
    try {
      const docData = {
        ticket_number: ticketNumber,
        items,
        status: 'pending',
        created_at: serverTimestamp(),
        updated_at: serverTimestamp()
      };
      const docRef = await addDoc(collection(db, COLLECTIONS.ORDERS), docData);
      return { id: docRef.id, ...docData } as unknown as Order;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, COLLECTIONS.ORDERS);
    }
  },

  async updateOrderStatus(orderId: string, status: OrderStatus): Promise<void> {
    try {
      await updateDoc(doc(db, COLLECTIONS.ORDERS, orderId), {
        status,
        updated_at: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, COLLECTIONS.ORDERS);
    }
  },

  async toggleOrderItem(orderId: string, index: number): Promise<void> {
    try {
      const orderRef = doc(db, COLLECTIONS.ORDERS, orderId);
      const snap = await getDoc(orderRef);
      if (!snap.exists()) throw new Error('Pedido não encontrado');
      
      const data = snap.data();
      const items = [...data.items];
      if (items[index]) {
        items[index].completed = !items[index].completed;
        await updateDoc(orderRef, {
          items,
          updated_at: serverTimestamp()
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, COLLECTIONS.ORDERS);
    }
  },

  async updateOrderItems(orderId: string, items: any[]): Promise<void> {
    try {
      await updateDoc(doc(db, COLLECTIONS.ORDERS, orderId), {
        items,
        updated_at: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, COLLECTIONS.ORDERS);
    }
  },

  async deleteOrder(id: string): Promise<void> {
    try {
      await deleteDoc(doc(db, COLLECTIONS.ORDERS, id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, COLLECTIONS.ORDERS);
    }
  },

  async clearRecentOrders(): Promise<void> {
    try {
      const q = query(
        collection(db, COLLECTIONS.ORDERS),
        where('status', 'in', ['pending', 'preparing', 'ready', 'delivered'])
      );
      const snapshot = await getDocs(q);
      const batch = writeBatch(db);
      snapshot.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, COLLECTIONS.ORDERS);
    }
  },

  async checkFichaActive(ticketNumber: string): Promise<Order | null> {
    try {
      const q = query(
        collection(db, COLLECTIONS.ORDERS),
        where('ticket_number', '==', ticketNumber),
        where('status', 'in', ['pending', 'preparing', 'ready']),
        limit(1)
      );
      const snapshot = await getDocs(q);
      if (snapshot.empty) return null;
      const d = snapshot.docs[0];
      const data = d.data();
      return { 
        id: d.id, 
        ...data,
        created_at: data.created_at?.toDate?.()?.toISOString() || new Date().toISOString(),
        updated_at: data.updated_at?.toDate?.()?.toISOString() || new Date().toISOString()
      } as Order;
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, COLLECTIONS.ORDERS);
    }
  },

  // --- STOCK ---
  async getStockHistory(): Promise<StockHistory[]> {
    try {
      const q = query(collection(db, COLLECTIONS.STOCK_HISTORY), orderBy('created_at', 'desc'), limit(100));
      const snapshot = await getDocs(q);
      return snapshot.docs.map(d => {
        const data = d.data();
        return { 
          id: d.id, 
          ...data,
          created_at: data.created_at?.toDate?.()?.toISOString() || new Date().toISOString()
        } as StockHistory;
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, COLLECTIONS.STOCK_HISTORY);
    }
  },

  async addStockMovement({ menu_item_id, type, quantity, user_name }: { menu_item_id: string, type: 'entry' | 'exit', quantity: number, user_name: string }): Promise<StockHistory> {
    try {
      const itemRef = doc(db, COLLECTIONS.MENU_ITEMS, menu_item_id);
      const itemSnap = await getDoc(itemRef);
      if (!itemSnap.exists()) throw new Error('Item não encontrado');
      
      const itemData = itemSnap.data();
      const currentQty = itemData.stock_quantity || 0;
      const newQty = type === 'entry' ? currentQty + quantity : currentQty - quantity;
      
      const historyRef = doc(collection(db, COLLECTIONS.STOCK_HISTORY));
      const now = new Date();
      const historyData = {
        menu_item_id,
        menu_item_name: itemData.name,
        type,
        quantity,
        user_name,
        created_at: now.toISOString()
      };

      const batch = writeBatch(db);
      batch.update(itemRef, { stock_quantity: newQty });
      batch.set(historyRef, {
        ...historyData,
        created_at: serverTimestamp()
      });

      await batch.commit();

      return {
        id: historyRef.id,
        ...historyData
      } as StockHistory;
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, COLLECTIONS.STOCK_HISTORY);
    }
  },

  // --- DASHBOARD / CLOSING ---
  async getOrderHistory(): Promise<Order[]> {
    try {
      const q = query(
        collection(db, COLLECTIONS.ORDERS), 
        where('status', 'in', ['delivered', 'closed']),
        orderBy('updated_at', 'desc'), 
        limit(50)
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map(d => {
        const data = d.data();
        return { 
          id: d.id, 
          ...data,
          created_at: data.created_at?.toDate?.()?.toISOString() || new Date().toISOString(),
          updated_at: data.updated_at?.toDate?.()?.toISOString() || new Date().toISOString()
         } as Order;
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, COLLECTIONS.ORDERS);
    }
  },

  async getRecentOrdersForHistory(): Promise<Order[]> {
     const q = query(collection(db, COLLECTIONS.ORDERS), orderBy('created_at', 'desc'), limit(50));
     const snapshot = await getDocs(q);
     return snapshot.docs.map(d => {
       const data = d.data();
       return { 
         id: d.id, 
         ...data,
         created_at: data.created_at?.toDate?.()?.toISOString() || new Date().toISOString()
        } as Order;
     });
  },

  async clearHistory(password: string, type: 'all' | 'closed'): Promise<void> {
    try {
      // Check admin password
      const q = query(collection(db, COLLECTIONS.USERS), where('role', '==', 'admin'), limit(1));
      const snap = await getDocs(q);
      if (snap.empty) throw new Error('Admin não encontrado');
      const admin = snap.docs[0].data();
      if (admin.password !== password) throw new Error('Senha administrativa incorreta');

      const statusQuery = type === 'closed' ? ['closed'] : ['delivered', 'closed'];
      const qOrders = query(collection(db, COLLECTIONS.ORDERS), where('status', 'in', statusQuery));
      const orderSnap = await getDocs(qOrders);
      
      const batch = writeBatch(db);
      orderSnap.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, COLLECTIONS.ORDERS);
    }
  },

  async getFinancialSummary(): Promise<any> {
    try {
      const q = query(collection(db, COLLECTIONS.ORDERS), where('status', 'in', ['delivered', 'closed']));
      const snapshot = await getDocs(q);
      const orders = snapshot.docs.map(d => d.data());
      return this.generateReport(orders);
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, COLLECTIONS.ORDERS);
    }
  },

  async closeKitchen(): Promise<any> {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const threshold = Timestamp.fromDate(today);

      const q = query(
        collection(db, COLLECTIONS.ORDERS),
        where('status', '!=', 'closed'),
        where('created_at', '>=', threshold)
      );

      const snapshot = await getDocs(q);
      const batch = writeBatch(db);
      const closedOrders: any[] = [];

      snapshot.docs.forEach(d => {
        batch.update(d.ref, { status: 'closed', updated_at: serverTimestamp() });
        closedOrders.push({ ...d.data(), id: d.id });
      });

      await batch.commit();
      return this.generateReport(closedOrders);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, COLLECTIONS.ORDERS);
    }
  },

  generateReport(orders: any[]) {
    const itemCounts: Record<string, { count: number, total: number }> = {};
    const hourlyCounts: Record<number, number> = {};
    let totalRevenue = 0;

    orders.forEach(order => {
      const items = order.items || [];
      if (Array.isArray(items)) {
        items.forEach((item: any) => {
          const name = item.name;
          const qty = item.quantity || 1;
          const price = item.price || 0; // Fix: price should be included in order item for historical accuracy
          const lineTotal = qty * price;

          if (!itemCounts[name]) {
            itemCounts[name] = { count: 0, total: 0 };
          }
          itemCounts[name].count += qty;
          itemCounts[name].total += lineTotal;
          totalRevenue += lineTotal;
        });
      }
      const hour = order.created_at?.toDate?.()?.getHours() || new Date().getHours();
      hourlyCounts[hour] = (hourlyCounts[hour] || 0) + 1;
    });

    const sortedItems = Object.entries(itemCounts)
      .sort(([, a], [, b]) => b.count - a.count)
      .map(([name, data]) => ({ name, count: data.count, total: data.total }));

    const peakHourEntry = Object.entries(hourlyCounts).sort(([, a], [, b]) => b - a)[0];

    return { 
      date: new Date().toISOString(), 
      totalOrders: orders.length, 
      totalRevenue,
      items: sortedItems, 
      peakHour: peakHourEntry ? Number(peakHourEntry[0]) : null, 
      hourlyBreakdown: hourlyCounts 
    };
  },

  async seedInitialData(): Promise<void> {
    try {
      // Seeding should ideally only be done by the owner
      if (auth.currentUser?.email?.toLowerCase() !== 'asilosclp2@gmail.com') return;

      const catsSnap = await getDocs(collection(db, COLLECTIONS.CATEGORIES));
      if (catsSnap.empty) {
        console.log("Seeding categories...");
        const initialCategories = ["Geral", "Árabe", "Japonês", "Bebidas"];
        const batch = writeBatch(db);
        initialCategories.forEach(name => {
          batch.set(doc(collection(db, COLLECTIONS.CATEGORIES)), { name, created_at: serverTimestamp() });
        });
        await batch.commit();
      }

      const usersSnap = await getDocs(collection(db, COLLECTIONS.USERS));
      if (usersSnap.empty) {
        console.log("Seeding users...");
        const adminUser = {
          name: 'Admin',
          password: '1234',
          role: 'admin',
          allowed_views: 'reception,kitchen,kitchen-scanner,kitchen-sectors,delivery,display,inventory,history,dashboard,admin,extra-fichas',
          created_at: serverTimestamp()
        };
        await addDoc(collection(db, COLLECTIONS.USERS), adminUser);
      }

      const menuSnap = await getDocs(collection(db, COLLECTIONS.MENU_ITEMS));
      if (menuSnap.empty) {
        console.log("Seeding menu items...");
        // Fetch categories to link them
        const cats = await this.getCategories();
        const geral = cats.find(c => c.name === 'Geral');
        const bebidas = cats.find(c => c.name === 'Bebidas');
        
        if (geral && bebidas) {
          const items = [
            { name: "Espetinho de Carne", category_id: geral.id, price: 0, sector: 'Outros' },
            { name: "Espetinho de Frango", category_id: geral.id, price: 0, sector: 'Outros' },
            { name: "Refrigerante", category_id: bebidas.id, price: 0, sector: 'Outros' }
          ];
          const batch = writeBatch(db);
          items.forEach(item => {
            batch.set(doc(collection(db, COLLECTIONS.MENU_ITEMS)), { 
              ...item, 
              active: true, 
              stock_quantity: 0, 
              created_at: serverTimestamp() 
            });
          });
          await batch.commit();
        }
      }
    } catch (e) {
      console.error("Seeding error:", e);
    }
  },

  // --- EXTRA FICHAS ---
  async getExtraFichas(): Promise<any[]> {
    try {
      const q = query(collection(db, COLLECTIONS.EXTRA_FICHAS), orderBy('created_at', 'desc'));
      const snapshot = await getDocs(q);
      return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, COLLECTIONS.EXTRA_FICHAS);
    }
  },

  async registerExtraFicha(code: string, alias?: string): Promise<any> {
    try {
      // Check if already exists
      const q = query(collection(db, COLLECTIONS.EXTRA_FICHAS), where('code', '==', code));
      const snap = await getDocs(q);
      
      if (!snap.empty) {
        return { id: snap.docs[0].id, ...snap.docs[0].data(), already_existed: true };
      }

      const docData = {
        code,
        alias: alias || code,
        created_at: serverTimestamp()
      };
      const docRef = await addDoc(collection(db, COLLECTIONS.EXTRA_FICHAS), docData);
      return { id: docRef.id, ...docData };
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, COLLECTIONS.EXTRA_FICHAS);
    }
  },

  async deleteExtraFicha(id: string): Promise<void> {
    try {
      await deleteDoc(doc(db, COLLECTIONS.EXTRA_FICHAS, id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, COLLECTIONS.EXTRA_FICHAS);
    }
  },

  parseQR(code: string): { type: 'ticket' | 'product' | 'unknown'; value: string } {
    const cleaned = code.trim().toLowerCase();
    if (!cleaned) {
      return { type: 'unknown', value: '' };
    }

    // 1. Check for standard Ticket/Ficha keyword formats
    const fichaMatch = cleaned.match(/^ficha[- ]?(\d+)$/i);
    if (fichaMatch) {
      const val = parseInt(fichaMatch[1].substring(0, 3), 10);
      return { type: 'ticket', value: String(val) };
    }

    // 2. Normalization: If starts with '117', strip it
    let normalized = cleaned;
    if (normalized.startsWith('117')) {
      normalized = normalized.substring(3);
    }

    // 3. Match the first 4 consecutive digits (to support product categorization)
    const match4 = normalized.match(/(\d{4})/);
    if (match4) {
      const value4 = match4[1];
      const numericVal = parseInt(value4, 10);
      if (numericVal >= 800) {
        return { type: 'product', value: value4 };
      } else {
        // Ticket: extract only the first 3 digits of the sequence
        const first3 = value4.substring(0, 3);
        const ticketNum = parseInt(first3, 10);
        return { type: 'ticket', value: String(ticketNum) };
      }
    }

    // 4. Fallback: Match any sequence of digits from the normalized code
    const matchDigits = normalized.match(/(\d+)/);
    if (matchDigits) {
      const digits = matchDigits[1];
      const numericVal = parseInt(digits, 10);
      if (numericVal >= 800 && digits.length >= 4) {
        return { type: 'product', value: digits.substring(0, 4) };
      } else {
        // Ticket: extract only the first 3 digits of the sequence
        const first3 = digits.substring(0, 3);
        const ticketNum = parseInt(first3, 10);
        return { type: 'ticket', value: String(ticketNum) };
      }
    }

    return { type: 'unknown', value: cleaned };
  },

  async resolveFicha(code: string): Promise<string> {
    try {
      const cleaned = code.trim();

      const parsed = this.parseQR(cleaned);
      if (parsed.type === 'ticket') {
        return parsed.value;
      }

      if (parsed.type === 'product') {
        return ''; // Decidedly NOT a ticket!
      }

      // 3. Check Extra Fichas collection
      const q = query(collection(db, COLLECTIONS.EXTRA_FICHAS), where('code', '==', cleaned));
      const snap = await getDocs(q);
      if (!snap.empty) {
        return snap.docs[0].data().alias;
      }

      return cleaned; // Fallback to raw code
    } catch (e) {
      return code;
    }
  },

  async saveGlobalAudioSettings(settings: any): Promise<void> {
    try {
      const docRef = doc(db, 'settings', 'audio');
      await setDoc(docRef, settings, { merge: true });
    } catch (error) {
      console.error('Error saving global settings', error);
    }
  },

  async saveUploadedAudioFile(key: 'uploaded-ext' | 'uploaded-int', base64Data: string, fileName: string): Promise<void> {
    try {
      const docId = key === 'uploaded-ext' ? 'uploaded_ext' : 'uploaded_int';
      const docRef = doc(db, 'settings', docId);
      await setDoc(docRef, { base64Data, fileName }, { merge: true });
    } catch (error) {
      console.error(`Error saving uploaded audio file ${key}`, error);
      throw error;
    }
  },

  listenToGlobalAudioSettings(callback: (data: any) => void): () => void {
    const docRef = doc(db, 'settings', 'audio');
    return onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        callback(docSnap.data());
      }
    }, (err) => {
      console.error('Error listening to global settings:', err);
    });
  },

  listenToUploadedAudioFile(key: 'uploaded-ext' | 'uploaded-int', callback: (data: any) => void): () => void {
    const docId = key === 'uploaded-ext' ? 'uploaded_ext' : 'uploaded_int';
    const docRef = doc(db, 'settings', docId);
    return onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        callback(docSnap.data());
      }
    }, (err) => {
      console.error(`Error listening to uploaded audio file ${key}:`, err);
    });
  }
};
