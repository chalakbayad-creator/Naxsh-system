import React from 'react';
import { ModuleCardItem, Customer } from '../types';
import { ChevronRightIcon, ModuleIconRenderer } from './Icons';
import { WAREHOUSE_PRODUCTS } from '../data/initialData';

interface GenericModuleScreenProps {
  module: ModuleCardItem;
  customers: Customer[];
  onBackToDashboard: () => void;
  onOpenOrders: () => void;
}

export const GenericModuleScreen: React.FC<GenericModuleScreenProps> = ({
  module,
  customers,
  onBackToDashboard,
  onOpenOrders,
}) => {
  return (
    <section className="app-screen generic-module-screen" id="generic-module-screen">
      <header className="module-page-topbar">
        <button
          className="back-dashboard"
          type="button"
          onClick={onBackToDashboard}
          aria-label="گەڕانەوە بۆ داشبۆرد"
        >
          <ChevronRightIcon />
          <span>گەڕانەوە بۆ داشبۆرد</span>
        </button>
      </header>

      <div className="generic-module-body">
        <div className="generic-module-card">
          <span className="generic-large-icon" id="generic-large-icon">
            <ModuleIconRenderer type={module.iconType} />
          </span>
          <h1 id="generic-body-title">{module.name}</h1>
          <p>{module.subtext}</p>
          <p style={{ marginTop: '6px', color: '#887e93', fontSize: '12px' }}>
            سکرینی تایبەتی ئەم مۆدیولە ئامادەیە بۆ بەستنەوە بە بەشەکانی تری سیستەم.
          </p>

          {/* Contextual content for specific modules */}
          {module.id === 'warehouse' && (
            <div style={{ marginTop: '24px', textAlign: 'right', direction: 'rtl' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '10px', color: '#39205f' }}>
                کاڵاکانی کۆگا ({WAREHOUSE_PRODUCTS.length} جۆر):
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                {WAREHOUSE_PRODUCTS.map((wp) => (
                  <div
                    key={wp.id}
                    style={{
                      padding: '10px 12px',
                      background: '#fff',
                      border: '1px solid rgba(57,32,95,.09)',
                      borderRadius: '4px',
                      fontSize: '12px',
                    }}
                  >
                    <strong>{wp.name}</strong>
                    <div style={{ color: '#8b8291', fontSize: '10px' }}>{wp.subtext}</div>
                    <div style={{ color: '#e82970', fontWeight: 700, marginTop: '4px' }}>
                      {wp.price.toLocaleString()} IQD
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {module.id === 'customers' && (
            <div style={{ marginTop: '24px', textAlign: 'right', direction: 'rtl' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '10px', color: '#39205f' }}>
                کڕیارە تۆمارکراوەکان ({customers.length}):
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '180px', overflowY: 'auto' }}>
                {customers.map((c) => (
                  <div
                    key={c.id}
                    style={{
                      padding: '8px 12px',
                      background: '#fff',
                      border: '1px solid rgba(57,32,95,.09)',
                      borderRadius: '3px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <strong>{c.name}</strong>
                      <span style={{ fontSize: '10px', color: '#8b8291', marginRight: '8px' }}>
                        {c.address}
                      </span>
                    </div>
                    <small style={{ color: '#e82970', direction: 'ltr' }}>{c.phone}</small>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ marginTop: '22px' }}>
            <button
              type="button"
              className="back-dashboard"
              style={{ background: '#39205f', color: '#fff', borderColor: '#39205f' }}
              onClick={onOpenOrders}
            >
              <span>چوون بۆ بەشی ئۆردەرەکان</span>
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};
