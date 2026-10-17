import React from 'react';
import { DeletePromptIcon, MoneyCurrencyIcon } from './Icons';

interface ConfirmModalProps {
  isOpen: boolean;
  type: 'delete-item' | 'edit-price';
  onClose: () => void;
  onConfirm: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  type,
  onClose,
  onConfirm,
}) => {
  if (!isOpen) return null;

  const isDelete = type === 'delete-item';

  return (
    <div
      className={`confirm-modal ${!isDelete ? 'price-confirm-modal' : ''}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="confirm-card"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
      >
        <span className="confirm-icon">
          {isDelete ? <DeletePromptIcon /> : <MoneyCurrencyIcon />}
        </span>
        <div>
          <h3 id="confirm-title">
            {isDelete ? 'سڕینەوەی ئایتم' : 'گۆڕینی نرخی کۆگا'}
          </h3>
          <p>
            {isDelete
              ? 'دڵنیایت لە سڕینەوەی ئەم ئایتمە لە ئۆردەرەکە؟'
              : 'ئەم نرخە لە ئایتمی کۆگاوە وەرگیراوە. دڵنیایت دەتەوێت تەنها بۆ ئەم ئۆردەرە بیگۆڕیت؟'}
          </p>
        </div>
        <div className="confirm-actions">
          <button type="button" onClick={onClose}>
            {isDelete ? 'نەخێر، بیهێڵەوە' : 'نەخێر، نرخەکە بهێڵەوە'}
          </button>
          <button
            type="button"
            style={!isDelete ? { background: '#39205f', borderColor: '#39205f' } : {}}
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {isDelete ? 'بەڵێ، بیسڕەوە' : 'بەڵێ، دەستکاری بکە'}
          </button>
        </div>
      </div>
    </div>
  );
};
