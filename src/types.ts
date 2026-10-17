export type Screen = 'dashboard' | 'orders' | 'new-order' | 'module';

export type PipelineStage = 'all' | 'new' | 'design' | 'approval' | 'print' | 'cut' | 'delivery';

export interface Customer {
  id: string;
  name: string;
  phone: string;
  address: string;
  channel: 'تەلەفۆن' | 'واتساپ' | 'ئیمەیڵ' | string;
}

export interface OrderItem {
  id: string;
  name: string;
  note: string;
  quantity: number;
  price: number;
  originalPrice: number;
}

export interface Order {
  id: string;
  customerId: string;
  customerName: string;
  phone: string;
  address: string;
  channel: string;
  stage: 'new' | 'design' | 'approval' | 'print' | 'cut' | 'delivery';
  deadline: string; // e.g. "21ی تشرینی یەکەم" or formatted date
  urgent: boolean;
  note: string;
  items: OrderItem[];
  discount: number;
  discountMode: 'percent' | 'amount';
  createdAt: string;
}

export interface ModuleCardItem {
  id: string;
  name: string;
  subtext: string;
  colorClass: string;
  searchKeywords: string;
  screen?: string;
  badge?: string;
  iconType: string;
}

export interface WarehouseProduct {
  id: string;
  name: string;
  subtext: string;
  price: number;
  iconType: string;
}
