import React, { useState } from 'react';
import { Customer } from '../types';
import { CloseIcon } from './Icons';

interface CustomerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (customer: Customer) => void;
  existingCount: number;
}

export const CustomerModal: React.FC<CustomerModalProps> = ({
  isOpen,
  onClose,
  onSave,
  existingCount,
}) => {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [channel, setChannel] = useState<'واتساپ' | 'تەلەفۆن' | 'ئیمەیڵ'>('واتساپ');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim() || !address.trim()) return;

    const newCustomer: Customer = {
      id: `CUS-${1000 + existingCount + 1}`,
      name: name.trim(),
      phone: phone.trim(),
      address: address.trim(),
      channel,
    };

    onSave(newCustomer);
    setName('');
    setPhone('');
    setAddress('');
    setChannel('واتساپ');
    onClose();
  };

  return (
    <div
      className="customer-modal"
      id="customer-modal"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form className="customer-form" id="customer-form" onSubmit={handleSubmit}>
        <div className="order-form-head">
          <div>
            <small>کڕیاران</small>
            <h2>کڕیاری نوێ</h2>
          </div>
          <button
            id="close-customer-modal"
            type="button"
            aria-label="داخستن"
            onClick={onClose}
          >
            <CloseIcon />
          </button>
        </div>

        <div className="order-form-grid">
          <label>
            <span>ناوی کڕیار</span>
            <input
              name="name"
              required
              placeholder="ناوی تەواوی کڕیار"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </label>
          <label>
            <span>ژمارەی مۆبایل</span>
            <input
              name="phone"
              required
              inputMode="tel"
              placeholder="07XX XXX XXXX"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </label>
        </div>

        <div className="order-form-grid">
          <label>
            <span>ناونیشان</span>
            <input
              name="address"
              required
              placeholder="شار و ناونیشان"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </label>
          <label>
            <span>شێوازی پەیوەندی</span>
            <select
              name="channel"
              required
              value={channel}
              onChange={(e) =>
                setChannel(e.target.value as 'واتساپ' | 'تەلەفۆن' | 'ئیمەیڵ')
              }
            >
              <option value="واتساپ">واتساپ</option>
              <option value="تەلەفۆن">تەلەفۆن</option>
              <option value="ئیمەیڵ">ئیمەیڵ</option>
            </select>
          </label>
        </div>

        <div className="order-form-actions">
          <button id="cancel-customer" type="button" onClick={onClose}>
            پاشگەزبوونەوە
          </button>
          <button type="submit">تۆمارکردنی کڕیار</button>
        </div>
      </form>
    </div>
  );
};
