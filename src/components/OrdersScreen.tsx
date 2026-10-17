import React, { useState, useMemo } from 'react';
import { Order, PipelineStage } from '../types';
import { PIPELINE_STAGES, STAGE_LABELS, STAGE_ORDER } from '../data/initialData';
import {
  ChevronRightIcon,
  PlusIcon,
  SearchIcon,
  MoreIcon,
  PhoneIcon,
  ChevronLeftIcon,
} from './Icons';

interface OrdersScreenProps {
  orders: Order[];
  onBackToDashboard: () => void;
  onNewOrder: () => void;
  onAdvanceOrder: (orderId: string) => void;
}

export const OrdersScreen: React.FC<OrdersScreenProps> = ({
  orders,
  onBackToDashboard,
  onNewOrder,
  onAdvanceOrder,
}) => {
  const [selectedStage, setSelectedStage] = useState<PipelineStage>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedOrderId, setSelectedOrderId] = useState<string>(
    orders[0]?.id || ''
  );

  // Compute pipeline stage counts
  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = { all: orders.length };
    PIPELINE_STAGES.forEach((s) => {
      if (s.id !== 'all') {
        counts[s.id] = orders.filter((o) => o.stage === s.id).length;
      }
    });
    return counts;
  }, [orders]);

  // Filter orders by stage and search
  const filteredOrders = useMemo(() => {
    const q = searchQuery.trim().toLocaleLowerCase('ku');
    return orders.filter((order) => {
      const matchesStage = selectedStage === 'all' || order.stage === selectedStage;
      const matchesQuery =
        !q ||
        `${order.id} ${order.customerName} ${order.phone} ${order.items.map((i) => i.name).join(' ')}`
          .toLocaleLowerCase('ku')
          .includes(q);
      return matchesStage && matchesQuery;
    });
  }, [orders, selectedStage, searchQuery]);

  // Determine currently selected order
  const selectedOrder = useMemo(() => {
    return (
      orders.find((o) => o.id === selectedOrderId) ||
      filteredOrders[0] ||
      orders[0]
    );
  }, [orders, selectedOrderId, filteredOrders]);

  // Summary statistics
  const todayCount = orders.filter((o) => o.stage === 'new' || o.deadline.includes('ئەمڕۆ')).length || 6;
  const inProgressCount = orders.filter((o) => o.stage !== 'delivery').length;
  const waitingApprovalCount = orders.filter((o) => o.stage === 'approval').length;
  const readyCount = orders.filter((o) => o.stage === 'delivery').length;

  const currentStageIndex = selectedOrder
    ? STAGE_ORDER.indexOf(selectedOrder.stage)
    : 0;

  const canAdvance = selectedOrder && selectedOrder.stage !== 'delivery';

  return (
    <section className="app-screen orders-screen" id="orders-screen">
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

      <div className="orders-shell">
        <div className="orders-heading">
          <div>
            <span className="orders-eyebrow">بەڕێوەبردنی کار</span>
            <h1>ئۆردەرەکان</h1>
            <p>لە داواکاریی کڕیارەوە تا چاپ، بڕین و گەیاندن.</p>
          </div>
          <button
            className="new-order-button"
            id="new-order-button"
            type="button"
            onClick={onNewOrder}
          >
            <PlusIcon />
            <span>ئۆردەری نوێ</span>
          </button>
        </div>

        <div className="order-stats" aria-label="پوختەی ئۆردەرەکان">
          <div>
            <span>ئەمڕۆ</span>
            <strong>{todayCount}</strong>
            <small>ئۆردەری نوێ</small>
          </div>
          <div>
            <span>لە کاردایە</span>
            <strong>{inProgressCount}</strong>
            <small>لە هەموو قۆناخەکان</small>
          </div>
          <div>
            <span>چاوەڕوان</span>
            <strong>{waitingApprovalCount}</strong>
            <small>پەسەندی کڕیار</small>
          </div>
          <div>
            <span>ئامادەیە</span>
            <strong>{readyCount}</strong>
            <small>بۆ ناردن</small>
          </div>
        </div>

        <nav className="order-pipeline" aria-label="قۆناخەکانی ئۆردەر">
          {PIPELINE_STAGES.map((stage) => (
            <button
              key={stage.id}
              className={selectedStage === stage.id ? 'is-active' : ''}
              type="button"
              data-stage={stage.id}
              onClick={() => setSelectedStage(stage.id)}
            >
              <span>{stage.label}</span>
              <b>{stageCounts[stage.id] ?? 0}</b>
            </button>
          ))}
        </nav>

        <div className="orders-workspace">
          <section className="orders-list-panel">
            <div className="orders-list-head">
              <div>
                <strong>کارە چالاکەکان</strong>
                <small id="orders-result-count">{filteredOrders.length} ئۆردەر</small>
              </div>
              <label className="orders-search">
                <SearchIcon />
                <input
                  id="orders-search"
                  type="search"
                  placeholder="گەڕان بە ناوی کڕیار یان کۆدی ئۆردەر..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </label>
            </div>

            <div className="orders-table-head">
              <span>ئۆردەر و کڕیار</span>
              <span>ئایتم</span>
              <span>دێدلاین</span>
              <span>قۆناخ</span>
            </div>

            <div className="orders-list" id="orders-list">
              {filteredOrders.length === 0 ? (
                <div style={{ padding: '32px 16px', textAlign: 'center', color: '#8b8292' }}>
                  هیچ ئۆردەرێک لەم بەشەدا نەدۆزرایەوە
                </div>
              ) : (
                filteredOrders.map((order) => {
                  const isSelected = selectedOrder?.id === order.id;
                  const totalItemsCount = order.items.reduce(
                    (acc, it) => acc + (it.quantity || 1),
                    0
                  );
                  return (
                    <button
                      key={order.id}
                      className={`order-row ${isSelected ? 'is-selected' : ''}`}
                      type="button"
                      data-stage={order.stage}
                      data-id={order.id}
                      onClick={() => setSelectedOrderId(order.id)}
                    >
                      <span className="order-identity">
                        <b>{order.id}</b>
                        <strong>{order.customerName}</strong>
                        <small>{order.channel}</small>
                      </span>
                      <span>
                        {order.items.length}{' '}
                        {order.items.length === 1 ? 'ئایتم' : 'ئایتم'}
                      </span>
                      <span>{order.deadline}</span>
                      <span className={`order-status status-${order.stage}`}>
                        {STAGE_LABELS[order.stage] || order.stage}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </section>

          {selectedOrder && (
            <aside className="order-detail-panel" id="order-detail-panel">
              <div className="order-detail-title">
                <span>
                  <small>ئۆردەری هەڵبژێردراو</small>
                  <strong id="detail-id">{selectedOrder.id}</strong>
                </span>
                <button type="button" aria-label="زیاتر">
                  <MoreIcon />
                </button>
              </div>

              <div className="customer-card">
                <span>{selectedOrder.customerName.slice(0, 2)}</span>
                <div>
                  <strong id="detail-customer">{selectedOrder.customerName}</strong>
                  <small id="detail-phone">{selectedOrder.phone}</small>
                </div>
                <button
                  type="button"
                  aria-label="پەیوەندی"
                  onClick={() => {
                    if (selectedOrder.phone) {
                      window.location.href = `tel:${selectedOrder.phone.replace(/\s+/g, '')}`;
                    }
                  }}
                >
                  <PhoneIcon />
                </button>
              </div>

              <div className="detail-section">
                <div className="detail-label">
                  <span>ئایتمەکان</span>
                  <b>{selectedOrder.items.length}</b>
                </div>
                {selectedOrder.items.map((item) => (
                  <div key={item.id} className="detail-item">
                    <span></span>
                    <div>
                      <strong id="detail-item">{item.name}</strong>
                      {item.note && <small>{item.note}</small>}
                    </div>
                  </div>
                ))}
              </div>

              <div className="detail-section">
                <div className="detail-label">
                  <span>پێشکەوتن</span>
                  <small id="detail-deadline">{selectedOrder.deadline}</small>
                </div>
                <div className="order-progress">
                  {STAGE_ORDER.map((stage, idx) => {
                    let className = '';
                    if (idx < currentStageIndex) className = 'done';
                    else if (idx === currentStageIndex) className = 'active';
                    return <i key={stage} className={className} />;
                  })}
                </div>
                <div className="progress-labels">
                  <span>نوێ</span>
                  <span>دیزاین</span>
                  <span>پەسەندکردن</span>
                  <span>چاپ</span>
                  <span>بڕین</span>
                  <span>ناردن</span>
                </div>
              </div>

              <button
                className="advance-order"
                type="button"
                disabled={!canAdvance}
                style={{ opacity: canAdvance ? 1 : 0.5, cursor: canAdvance ? 'pointer' : 'not-allowed' }}
                onClick={() => onAdvanceOrder(selectedOrder.id)}
              >
                <span>{canAdvance ? 'بردن بۆ قۆناخی دواتر' : 'تەواوکراوە'}</span>
                <ChevronLeftIcon />
              </button>
            </aside>
          )}
        </div>
      </div>
    </section>
  );
};
