import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Customer, Order, OrderItem, WarehouseProduct } from '../types';
import { WAREHOUSE_PRODUCTS, CALENDAR_MONTH_NAMES } from '../data/initialData';
import {
  ChevronRightIcon,
  ChevronLeftIcon,
  SearchIcon,
  PlusIcon,
  CalendarIcon,
  CheckIcon,
  PinIcon,
  BoxItemsIcon,
  EditPriceIcon,
  TrashIcon,
  ModuleIconRenderer,
} from './Icons';
import { CustomerModal } from './CustomerModal';
import { ConfirmModal } from './ConfirmModal';

interface OrderCreateScreenProps {
  customers: Customer[];
  onAddCustomer: (customer: Customer) => void;
  onSaveOrder: (newOrder: Order) => void;
  onCancel: () => void;
}

const moneyFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

export const OrderCreateScreen: React.FC<OrderCreateScreenProps> = ({
  customers,
  onAddCustomer,
  onSaveOrder,
  onCancel,
}) => {
  // Customer selection state
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerSearchInput, setCustomerSearchInput] = useState('');
  const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState(false);
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const customerComboboxRef = useRef<HTMLDivElement>(null);

  // Deadline date picker state
  const [deadlineDate, setDeadlineDate] = useState<Date | null>(null);
  const [isDeadlinePopoverOpen, setIsDeadlinePopoverOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState<Date>(
    new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  );
  const deadlinePickerRef = useRef<HTMLDivElement>(null);

  // Urgency & Note
  const [isUrgent, setIsUrgent] = useState(false);
  const [note, setNote] = useState('');

  // Items state
  const [items, setItems] = useState<OrderItem[]>([
    {
      id: 'item-initial-1',
      name: '',
      note: '',
      quantity: 1,
      price: 1500,
      originalPrice: 1500,
    },
  ]);
  const [isWarehousePickerOpen, setIsWarehousePickerOpen] = useState(false);
  const [editingPriceItemId, setEditingPriceItemId] = useState<string | null>(null);

  // Modals state
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmEditPriceId, setConfirmEditPriceId] = useState<string | null>(null);

  // Pricing & Discounts
  const [discountMode, setDiscountMode] = useState<'percent' | 'amount'>('percent');
  const [discountValue, setDiscountValue] = useState<number>(0);

  // Validation feedback
  const [formError, setFormError] = useState<string | null>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (
        customerComboboxRef.current &&
        !customerComboboxRef.current.contains(event.target as Node)
      ) {
        setIsCustomerDropdownOpen(false);
      }
      if (
        deadlinePickerRef.current &&
        !deadlinePickerRef.current.contains(event.target as Node)
      ) {
        setIsDeadlinePopoverOpen(false);
      }
    };
    document.addEventListener('click', handleOutsideClick);
    return () => document.removeEventListener('click', handleOutsideClick);
  }, []);

  // Filter customers for combobox
  const filteredCustomers = useMemo(() => {
    const q = customerSearchInput.trim().toLocaleLowerCase('ku');
    if (!q) return customers;
    return customers.filter((c) =>
      `${c.name} ${c.phone}`.toLocaleLowerCase('ku').includes(q)
    );
  }, [customers, customerSearchInput]);

  const handleSelectCustomer = (customer: Customer) => {
    setSelectedCustomer(customer);
    setCustomerSearchInput(customer.name);
    setIsCustomerDropdownOpen(false);
    setFormError(null);
  };

  const handleAddCustomerCreated = (newCust: Customer) => {
    onAddCustomer(newCust);
    handleSelectCustomer(newCust);
  };

  // Add order item from warehouse
  const handleSelectWarehouseProduct = (wp: WarehouseProduct) => {
    setItems((prev) => [
      ...prev.filter((i) => i.name.trim() !== '' || prev.length > 1),
      {
        id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: wp.name,
        note: wp.subtext,
        quantity: 1,
        price: wp.price,
        originalPrice: wp.price,
      },
    ]);
    setIsWarehousePickerOpen(false);
  };

  // Add blank item
  const handleAddBlankItem = () => {
    setIsWarehousePickerOpen(true);
  };

  // Update item fields
  const handleUpdateItem = (id: string, updates: Partial<OrderItem>) => {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, ...updates } : it))
    );
  };

  // Delete item
  const handleConfirmDeleteItem = () => {
    if (!confirmDeleteId) return;
    setItems((prev) => {
      if (prev.length <= 1) {
        return [
          {
            id: `item-${Date.now()}`,
            name: '',
            note: '',
            quantity: 1,
            price: 0,
            originalPrice: 0,
          },
        ];
      }
      return prev.filter((it) => it.id !== confirmDeleteId);
    });
    setConfirmDeleteId(null);
  };

  // Price editing confirmation
  const handleConfirmEditPrice = () => {
    if (!confirmEditPriceId) return;
    setEditingPriceItemId(confirmEditPriceId);
    setConfirmEditPriceId(null);
  };

  // Deadline selection
  const handleSetDeadlineDate = (d: Date) => {
    setDeadlineDate(d);
    setIsDeadlinePopoverOpen(false);
  };

  const handleSetQuickDeadline = (daysAhead: number) => {
    const d = new Date();
    d.setDate(d.getDate() + daysAhead);
    handleSetDeadlineDate(d);
  };

  // Deadline display string
  const deadlineDisplayString = useMemo(() => {
    if (!deadlineDate) return 'بەروار هەڵبژێرە';
    const day = String(deadlineDate.getDate()).padStart(2, '0');
    const month = String(deadlineDate.getMonth() + 1).padStart(2, '0');
    const year = deadlineDate.getFullYear();
    return `${day}/${month}/${year}`;
  }, [deadlineDate]);

  // Calendar rendering math
  const calendarYear = calendarMonth.getFullYear();
  const calendarMonthIndex = calendarMonth.getMonth();
  const firstDayOfWeek = new Date(calendarYear, calendarMonthIndex, 1).getDay();
  const daysInCurrentMonth = new Date(calendarYear, calendarMonthIndex + 1, 0).getDate();
  const today = new Date();

  // Price calculations
  const subtotal = useMemo(() => {
    return items.reduce((sum, it) => sum + (it.quantity || 0) * (it.price || 0), 0);
  }, [items]);

  const discountAmount = useMemo(() => {
    const val = Math.max(0, discountValue || 0);
    if (discountMode === 'percent') {
      return (subtotal * Math.min(100, val)) / 100;
    }
    return Math.min(subtotal, val);
  }, [subtotal, discountMode, discountValue]);

  const grandTotal = Math.max(0, subtotal - discountAmount);

  // Form submit
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer) {
      setFormError('تکایە سەرەتا کڕیارێک هەڵبژێرە');
      setIsCustomerDropdownOpen(true);
      return;
    }

    const validItems = items.filter((i) => i.name.trim() !== '');
    if (validItems.length === 0) {
      setFormError('تکایە لانیکەم یەک ئایتم زیاد بکە');
      return;
    }

    const newOrder: Order = {
      id: `ORD-${Math.floor(1050 + Math.random() * 900)}`,
      customerId: selectedCustomer.id,
      customerName: selectedCustomer.name,
      phone: selectedCustomer.phone,
      address: selectedCustomer.address,
      channel: selectedCustomer.channel,
      stage: 'new',
      deadline: deadlineDate ? deadlineDisplayString : 'ئەمڕۆ، 5:00',
      urgent: isUrgent,
      note,
      items: validItems,
      discount: discountValue,
      discountMode,
      createdAt: new Date().toISOString().split('T')[0],
    };

    onSaveOrder(newOrder);
  };

  return (
    <section className="app-screen order-modal order-create-screen" id="order-modal">
      <form className="order-form" id="order-form" onSubmit={handleSubmit}>
        <header className="module-page-topbar order-page-topbar">
          <button
            className="back-dashboard"
            id="close-order-modal"
            type="button"
            aria-label="گەڕانەوە بۆ ئۆردەرەکان"
            onClick={onCancel}
          >
            <ChevronRightIcon />
            <span>گەڕانەوە بۆ ئۆردەرەکان</span>
          </button>
        </header>

        <div className="order-form-body">
          {/* Customer & Meta Panel */}
          <aside className="pos-customer-panel">
            <div className="pos-panel-heading">
              <span>
                <small>کڕیار</small>
                <strong>زانیاریی ئۆردەر</strong>
              </span>
              <i>01</i>
            </div>

            <div className="order-form-grid customer-fields">
              <label className="customer-combobox-label">
                <span>ناوی کڕیار</span>
                <div
                  ref={customerComboboxRef}
                  className={`customer-combobox ${isCustomerDropdownOpen ? 'is-open' : ''}`}
                  id="customer-combobox"
                >
                  <input
                    id="customer-search-input"
                    name="customer"
                    type="search"
                    role="combobox"
                    aria-autocomplete="list"
                    aria-expanded={isCustomerDropdownOpen}
                    aria-controls="customer-options"
                    autoComplete="off"
                    required
                    placeholder="گەڕان بە ناو یان ژمارەی مۆبایل..."
                    value={customerSearchInput}
                    onFocus={() => setIsCustomerDropdownOpen(true)}
                    onChange={(e) => {
                      setCustomerSearchInput(e.target.value);
                      setSelectedCustomer(null);
                      setIsCustomerDropdownOpen(true);
                      setFormError(null);
                    }}
                  />
                  <SearchIcon className="customer-combobox-icon" />

                  {isCustomerDropdownOpen && (
                    <div className="customer-dropdown" id="customer-dropdown">
                      <div className="customer-options" id="customer-options" role="listbox">
                        {filteredCustomers.length === 0 ? (
                          <div className="customer-empty">هیچ کڕیارێک نەدۆزرایەوە</div>
                        ) : (
                          filteredCustomers.map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              className="customer-option"
                              role="option"
                              onClick={() => handleSelectCustomer(c)}
                            >
                              <span>{c.name.slice(0, 2)}</span>
                              <span>
                                <strong>{c.name}</strong>
                                <small>
                                  {c.phone} • {c.channel}
                                </small>
                              </span>
                            </button>
                          ))
                        )}
                      </div>
                      <button
                        className="add-customer-option"
                        id="add-customer-option"
                        type="button"
                        onClick={() => {
                          setIsCustomerDropdownOpen(false);
                          setIsCustomerModalOpen(true);
                        }}
                      >
                        <PlusIcon />
                        <span>تۆمارکردنی کڕیاری نوێ</span>
                      </button>
                    </div>
                  )}
                </div>
              </label>

              <label>
                <span>ژمارەی مۆبایل</span>
                <input
                  id="customer-phone"
                  name="phone"
                  readOnly
                  aria-readonly="true"
                  placeholder="دوای هەڵبژاردنی کڕیار"
                  value={selectedCustomer?.phone || ''}
                />
              </label>
            </div>

            <div className="order-form-grid">
              <label>
                <span>ناونیشان</span>
                <input
                  id="customer-address"
                  name="address"
                  readOnly
                  aria-readonly="true"
                  placeholder="دوای هەڵبژاردنی کڕیار"
                  value={selectedCustomer?.address || ''}
                />
              </label>
              <label>
                <span>شێوازی پەیوەندی</span>
                <input
                  id="customer-channel"
                  name="channel"
                  readOnly
                  aria-readonly="true"
                  placeholder="دوای هەڵبژاردنی کڕیار"
                  value={selectedCustomer?.channel || ''}
                />
              </label>
            </div>

            <div className="order-options-row">
              <label className="deadline-field">
                <span>دێدلاین</span>
                <div
                  ref={deadlinePickerRef}
                  className={`deadline-picker ${isDeadlinePopoverOpen ? 'is-open' : ''}`}
                  id="deadline-picker"
                >
                  <button
                    className={`deadline-trigger ${deadlineDate ? 'has-value' : ''}`}
                    id="deadline-trigger"
                    type="button"
                    aria-expanded={isDeadlinePopoverOpen}
                    onClick={() => setIsDeadlinePopoverOpen(!isDeadlinePopoverOpen)}
                  >
                    <span className="deadline-calendar">
                      <CalendarIcon />
                    </span>
                    <span>
                      <small>بەرواری تەواوبوون</small>
                      <strong id="deadline-display">{deadlineDisplayString}</strong>
                    </span>
                    <ChevronRightIcon className="deadline-chevron" />
                  </button>

                  {isDeadlinePopoverOpen && (
                    <div className="deadline-popover" id="deadline-popover">
                      <div className="custom-calendar-head">
                        <button
                          id="calendar-prev"
                          type="button"
                          aria-label="مانگی پێشوو"
                          onClick={() =>
                            setCalendarMonth(
                              new Date(calendarYear, calendarMonthIndex - 1, 1)
                            )
                          }
                        >
                          <ChevronRightIcon />
                        </button>
                        <strong id="calendar-title">
                          {CALENDAR_MONTH_NAMES[calendarMonthIndex]} {calendarYear}
                        </strong>
                        <button
                          id="calendar-next"
                          type="button"
                          aria-label="مانگی دواتر"
                          onClick={() =>
                            setCalendarMonth(
                              new Date(calendarYear, calendarMonthIndex + 1, 1)
                            )
                          }
                        >
                          <ChevronLeftIcon />
                        </button>
                      </div>

                      <div className="calendar-weekdays">
                        <span>ی</span>
                        <span>د</span>
                        <span>س</span>
                        <span>چ</span>
                        <span>پ</span>
                        <span>ه</span>
                        <span>ش</span>
                      </div>

                      <div className="calendar-days" id="calendar-days">
                        {Array.from({ length: firstDayOfWeek }, (_, idx) => (
                          <span key={`spacer-${idx}`} className="calendar-spacer" />
                        ))}

                        {Array.from({ length: daysInCurrentMonth }, (_, idx) => {
                          const dayNum = idx + 1;
                          const currentDate = new Date(
                            calendarYear,
                            calendarMonthIndex,
                            dayNum
                          );
                          const isSelected =
                            deadlineDate &&
                            deadlineDate.getDate() === dayNum &&
                            deadlineDate.getMonth() === calendarMonthIndex &&
                            deadlineDate.getFullYear() === calendarYear;
                          const isCurrentToday =
                            today.getDate() === dayNum &&
                            today.getMonth() === calendarMonthIndex &&
                            today.getFullYear() === calendarYear;

                          return (
                            <button
                              key={`day-${dayNum}`}
                              type="button"
                              className={`${isSelected ? 'is-selected' : ''} ${
                                isCurrentToday ? 'is-today' : ''
                              }`}
                              onClick={() => handleSetDeadlineDate(currentDate)}
                            >
                              {dayNum}
                            </button>
                          );
                        })}
                      </div>

                      <span className="quick-date-label">هەڵبژاردنی خێرا</span>
                      <div className="deadline-quick-options">
                        <button type="button" onClick={() => handleSetQuickDeadline(0)}>
                          ئەمڕۆ
                        </button>
                        <button type="button" onClick={() => handleSetQuickDeadline(1)}>
                          سبەی
                        </button>
                        <button type="button" onClick={() => handleSetQuickDeadline(3)}>
                          دوای 3 ڕۆژ
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </label>

              <div className="urgent-field">
                <span>گرنگی کار</span>
                <label className={`urgent-toggle ${isUrgent ? 'is-urgent' : ''}`}>
                  <input
                    id="urgent-order"
                    name="urgent"
                    type="checkbox"
                    checked={isUrgent}
                    onChange={(e) => setIsUrgent(e.target.checked)}
                  />
                  <span className="urgent-check">
                    <CheckIcon />
                  </span>
                  <span className="urgent-copy">
                    <strong>کاری بەپەلە</strong>
                    <small>ئۆردەرەکە لە سەرەوە پین دەکرێت</small>
                  </span>
                  <PinIcon className="urgent-pin" />
                </label>
              </div>
            </div>

            <label className="form-note">
              <span>تێبینی</span>
              <textarea
                name="note"
                placeholder="زانیاریی زیاتر دەربارەی ئۆردەرەکە..."
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>

            {formError && (
              <div
                style={{
                  color: '#b51e58',
                  fontSize: '12px',
                  fontWeight: 600,
                  marginTop: '8px',
                  background: '#fff2f6',
                  padding: '6px 10px',
                  borderRadius: '3px',
                }}
              >
                {formError}
              </div>
            )}

            <div className="order-form-actions">
              <button id="cancel-order" type="button" onClick={onCancel}>
                پاشگەزبوونەوە
              </button>
              <button type="submit">پاشەکەوتکردنی ئۆردەر</button>
            </div>
          </aside>

          {/* Items & Warehouse Panel */}
          <section className="pos-items-panel">
            <div className="form-divider">
              <span className="items-section-title">
                <i>
                  <BoxItemsIcon />
                </i>
                <span>
                  <strong>ئایتمەکانی ئۆردەر</strong>
                  <small>ناو، تێبینی، ژمارە و نرخەکان لێرە ڕێکبخە</small>
                </span>
              </span>
              <button
                id="add-order-item"
                type="button"
                className={isWarehousePickerOpen ? 'is-active' : ''}
                onClick={handleAddBlankItem}
              >
                <i>
                  <PlusIcon />
                </i>
                <span>زیادکردنی ئایتم</span>
              </button>
            </div>

            {/* Warehouse Picker Overlay */}
            {isWarehousePickerOpen ? (
              <section className="warehouse-picker" id="warehouse-picker">
                <div className="warehouse-picker-head">
                  <span>
                    <small>کۆگا</small>
                    <strong>کاڵایەک هەڵبژێرە</strong>
                  </span>
                  <button
                    id="close-warehouse-picker"
                    type="button"
                    onClick={() => setIsWarehousePickerOpen(false)}
                  >
                    <ChevronLeftIcon />
                    <span>گەڕانەوە بۆ خشتە</span>
                  </button>
                </div>
                <div className="warehouse-products" id="warehouse-products">
                  {WAREHOUSE_PRODUCTS.map((wp) => (
                    <button
                      key={wp.id}
                      className="warehouse-product"
                      type="button"
                      onClick={() => handleSelectWarehouseProduct(wp)}
                    >
                      <i>
                        <ModuleIconRenderer type={wp.iconType} />
                      </i>
                      <span>
                        <strong>{wp.name}</strong>
                        <small>{wp.subtext}</small>
                      </span>
                      <b>
                        {moneyFormatter.format(wp.price)} <em>IQD</em>
                      </b>
                    </button>
                  ))}
                </div>
              </section>
            ) : (
              <div className="form-items-table">
                <div className="form-items-head">
                  <span>ناوی ئایتم</span>
                  <span>تێبینی</span>
                  <span>دانە</span>
                  <span>نرخی دانە</span>
                  <span></span>
                </div>
                <div className="form-items" id="form-items">
                  {items.map((item) => {
                    const isPriceEditing = editingPriceItemId === item.id;
                    return (
                      <div
                        key={item.id}
                        className={`form-item ${isPriceEditing ? 'is-price-editing' : ''}`}
                      >
                        <input
                          name="item"
                          required
                          placeholder="ناوی ئایتم"
                          value={item.name}
                          onChange={(e) =>
                            handleUpdateItem(item.id, { name: e.target.value })
                          }
                        />
                        <input
                          name="itemNote"
                          placeholder="زانیاریی کورت..."
                          value={item.note}
                          onChange={(e) =>
                            handleUpdateItem(item.id, { note: e.target.value })
                          }
                        />
                        <input
                          name="quantity"
                          type="number"
                          min="1"
                          placeholder="0"
                          value={item.quantity}
                          onChange={(e) =>
                            handleUpdateItem(item.id, {
                              quantity: Math.max(1, parseInt(e.target.value) || 1),
                            })
                          }
                        />
                        <div className="item-price-control">
                          <input
                            name="price"
                            type="number"
                            min="0"
                            readOnly={!isPriceEditing}
                            aria-label="نرخی دانە"
                            value={item.price}
                            onChange={(e) =>
                              handleUpdateItem(item.id, {
                                price: Math.max(0, parseInt(e.target.value) || 0),
                              })
                            }
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                setEditingPriceItemId(null);
                              }
                            }}
                            onBlur={() => {
                              if (isPriceEditing) setEditingPriceItemId(null);
                            }}
                          />
                          <span>IQD</span>
                          <button
                            className="edit-item-price"
                            type="button"
                            aria-label="دەستکاریکردنی نرخ"
                            onClick={() => {
                              if (isPriceEditing) {
                                setEditingPriceItemId(null);
                              } else {
                                setConfirmEditPriceId(item.id);
                              }
                            }}
                          >
                            <EditPriceIcon />
                          </button>
                        </div>
                        <button
                          className="delete-order-item"
                          type="button"
                          aria-label="سڕینەوەی ئایتم"
                          onClick={() => setConfirmDeleteId(item.id)}
                        >
                          <TrashIcon />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </section>

          {/* POS Summary Panel */}
          <aside className="pos-summary-panel">
            <section className="order-totals" aria-label="پوختەی نرخەکان">
              <div className="totals-breakdown">
                <span>
                  <small>سەب تۆتاڵ</small>
                  <strong id="subtotal-value">
                    {moneyFormatter.format(subtotal)} <i>IQD</i>
                  </strong>
                </span>

                <span className="discount-entry">
                  <span className="discount-entry-head">
                    <small>داشکاندن</small>
                    <span className="discount-mode" aria-label="جۆری داشکاندن">
                      <button
                        className={discountMode === 'percent' ? 'is-active' : ''}
                        type="button"
                        onClick={() => {
                          setDiscountMode('percent');
                          setDiscountValue(0);
                        }}
                      >
                        %
                      </button>
                      <button
                        className={discountMode === 'amount' ? 'is-active' : ''}
                        type="button"
                        onClick={() => {
                          setDiscountMode('amount');
                          setDiscountValue(0);
                        }}
                      >
                        IQD
                      </button>
                    </span>
                  </span>
                  <label className="discount-control">
                    <input
                      id="discount-input"
                      type="number"
                      min="0"
                      max={discountMode === 'percent' ? 100 : undefined}
                      value={discountValue}
                      aria-label="بڕی داشکاندن"
                      onChange={(e) =>
                        setDiscountValue(
                          Math.max(
                            0,
                            discountMode === 'percent'
                              ? Math.min(100, parseInt(e.target.value) || 0)
                              : parseInt(e.target.value) || 0
                          )
                        )
                      }
                    />
                    <b id="discount-unit">
                      {discountMode === 'percent' ? '%' : 'IQD'}
                    </b>
                  </label>
                </span>

                <span>
                  <small>بڕی داشکاندن</small>
                  <strong id="discount-value">
                    {moneyFormatter.format(discountAmount)} <i>IQD</i>
                  </strong>
                </span>
              </div>

              <div className="grand-total">
                <span>
                  <small>کۆی گشتی دوای داشکاندن</small>
                  <b>پارەی کۆتایی ئۆردەر</b>
                </span>
                <strong id="grand-total-value">
                  {moneyFormatter.format(grandTotal)} <i>IQD</i>
                </strong>
              </div>
            </section>
          </aside>
        </div>
      </form>

      {/* Delete Item Confirmation Modal */}
      <ConfirmModal
        isOpen={confirmDeleteId !== null}
        type="delete-item"
        onClose={() => setConfirmDeleteId(null)}
        onConfirm={handleConfirmDeleteItem}
      />

      {/* Price Edit Confirmation Modal */}
      <ConfirmModal
        isOpen={confirmEditPriceId !== null}
        type="edit-price"
        onClose={() => setConfirmEditPriceId(null)}
        onConfirm={handleConfirmEditPrice}
      />

      {/* Add New Customer Modal */}
      <CustomerModal
        isOpen={isCustomerModalOpen}
        existingCount={customers.length}
        onClose={() => setIsCustomerModalOpen(false)}
        onSave={handleAddCustomerCreated}
      />
    </section>
  );
};
