export type OrderStatus = 'pending' | 'preparing' | 'ready' | 'delivered' | 'closed';

export interface OrderItem {
  name: string;
  completed: boolean;
  quantity: number;
  price: number;
}

export interface Order {
  id: string;
  ticket_number: string;
  items: OrderItem[];
  status: OrderStatus;
  total: number;
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: string;
  name: string;
}

export interface MenuItem {
  id: string;
  name: string;
  category_id: string;
  category_name?: string;
  price: number;
  sector?: string;
  qr_code?: string;
  stock_quantity?: number;
  active: boolean;
}

export interface StockHistory {
  id: string;
  menu_item_id: string;
  menu_item_name?: string;
  type: 'entry' | 'exit';
  quantity: number;
  user_name: string;
  created_at: string;
}

export interface User {
  id: string;
  name: string;
  password?: string;
  role: 'admin' | 'staff';
  allowed_views?: string; // comma separated
  email?: string;
  created_at?: string;
}

export interface ExtraFicha {
  id: string;
  code: string;
  alias: string;
  created_at: string;
}
