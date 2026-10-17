import React, { useState, useEffect } from 'react';
import { Screen, ModuleCardItem, Customer, Order } from './types';
import { INITIAL_CUSTOMERS, INITIAL_ORDERS, MODULES, STAGE_ORDER } from './data/initialData';
import { DashboardScreen } from './components/DashboardScreen';
import { OrdersScreen } from './components/OrdersScreen';
import { OrderCreateScreen } from './components/OrderCreateScreen';
import { GenericModuleScreen } from './components/GenericModuleScreen';

export const App: React.FC = () => {
  const [screen, setScreen] = useState<Screen>(() => {
    const hash = window.location.hash.slice(1);
    if (hash === 'orders' || hash === 'new-order') return hash;
    return 'dashboard';
  });

  const [activeModule, setActiveModule] = useState<ModuleCardItem | null>(() => MODULES[1]);

  const [customers, setCustomers] = useState<Customer[]>(() => {
    try {
      const saved = localStorage.getItem('naxsh_customers');
      if (saved) return JSON.parse(saved);
    } catch {}
    return INITIAL_CUSTOMERS;
  });

  const [orders, setOrders] = useState<Order[]>(() => {
    try {
      const saved = localStorage.getItem('naxsh_orders');
      if (saved) return JSON.parse(saved);
    } catch {}
    return INITIAL_ORDERS;
  });

  // Save to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('naxsh_customers', JSON.stringify(customers));
    } catch {}
  }, [customers]);

  useEffect(() => {
    try {
      localStorage.setItem('naxsh_orders', JSON.stringify(orders));
    } catch {}
  }, [orders]);

  // Sync hash routing & popstate
  const navigateTo = (targetScreen: Screen, push = true) => {
    setScreen(targetScreen);
    if (push) {
      window.history.pushState({ screen: targetScreen }, '', `#${targetScreen}`);
    }
  };

  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      const stateScreen = e.state?.screen || (window.location.hash.slice(1) as Screen);
      if (stateScreen === 'orders' || stateScreen === 'new-order' || stateScreen === 'dashboard' || stateScreen === 'module') {
        setScreen(stateScreen);
      } else {
        setScreen('dashboard');
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleOpenModule = (mod: ModuleCardItem) => {
    setActiveModule(mod);
    navigateTo('module');
  };

  const handleAdvanceOrder = (orderId: string) => {
    setOrders((prevOrders) =>
      prevOrders.map((ord) => {
        if (ord.id !== orderId) return ord;
        const currentIndex = STAGE_ORDER.indexOf(ord.stage);
        if (currentIndex < STAGE_ORDER.length - 1) {
          const nextStage = STAGE_ORDER[currentIndex + 1];
          return { ...ord, stage: nextStage };
        }
        return ord;
      })
    );
  };

  const handleSaveOrder = (newOrder: Order) => {
    setOrders((prev) => [newOrder, ...prev]);
    navigateTo('orders');
  };

  const handleAddCustomer = (newCustomer: Customer) => {
    setCustomers((prev) => [newCustomer, ...prev]);
  };

  return (
    <>
      {screen === 'dashboard' && (
        <DashboardScreen
          onOpenOrders={() => navigateTo('orders')}
          onOpenModule={handleOpenModule}
          onLogout={() => {
            // Smoothly reload/reset
            window.location.hash = '#dashboard';
            setScreen('dashboard');
          }}
        />
      )}

      {screen === 'orders' && (
        <OrdersScreen
          orders={orders}
          onBackToDashboard={() => navigateTo('dashboard')}
          onNewOrder={() => navigateTo('new-order')}
          onAdvanceOrder={handleAdvanceOrder}
        />
      )}

      {screen === 'new-order' && (
        <OrderCreateScreen
          customers={customers}
          onAddCustomer={handleAddCustomer}
          onSaveOrder={handleSaveOrder}
          onCancel={() => navigateTo('orders')}
        />
      )}

      {screen === 'module' && activeModule && (
        <GenericModuleScreen
          module={activeModule}
          customers={customers}
          onBackToDashboard={() => navigateTo('dashboard')}
          onOpenOrders={() => navigateTo('orders')}
        />
      )}
    </>
  );
};
export default App;
