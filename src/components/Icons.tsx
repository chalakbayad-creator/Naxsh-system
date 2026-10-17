import React from 'react';

interface IconProps {
  className?: string;
  style?: React.CSSProperties;
}

export function LogoutIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path d="M10 17l5-5-5-5M15 12H3M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
    </svg>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </svg>
  );
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

export function ChevronLeftIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function MoreIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <circle cx="5" cy="12" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
    </svg>
  );
}

export function PhoneIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.4 19.4 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2.1Z" />
    </svg>
  );
}

export function CalendarIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4M8 3v4M3 10h18" />
    </svg>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path d="m5 12 4 4L19 6" />
    </svg>
  );
}

export function PinIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path d="M8 3h8l-1 5 3 3v2h-5v7l-1 1-1-1v-7H6v-2l3-3-1-5Z" />
    </svg>
  );
}

export function BoxItemsIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path d="m4 7 8-4 8 4-8 4-8-4Z" />
      <path d="m4 7 8 4 8-4v10l-8 4-8-4V7ZM12 11v10" />
    </svg>
  );
}

export function EditPriceIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path d="m4 20 4.5-1 10-10-3.5-3.5-10 10L4 20Z" />
      <path d="m13.5 7 3.5 3.5" />
    </svg>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path d="m8 8 8 8M16 8l-8 8" />
    </svg>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  );
}

export function DeletePromptIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13" />
    </svg>
  );
}

export function MoneyCurrencyIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path d="M12 3v18M16.5 7.5c0-2-2-3-4.5-3s-4.5 1.2-4.5 3S9 10 12 10s4.5 1 4.5 3.5-2 4-4.5 4-4.5-1.2-4.5-3" />
    </svg>
  );
}

export function ModuleIconRenderer({ type }: { type: string }) {
  switch (type) {
    case 'orders':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M9 5h10v16H5V5h4" />
          <path d="M9 3h6v4H9zM8 11h8M8 15h8M8 19h5" />
        </svg>
      );
    case 'purchasing':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 8h12l1 13H5L6 8Z" />
          <path d="M9 9V6a3 3 0 0 1 6 0v3" />
        </svg>
      );
    case 'warehouse':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="m12 3 9 5-9 5-9-5 9-5Z" />
          <path d="m3 12 9 5 9-5M3 16l9 5 9-5" />
        </svg>
      );
    case 'finance':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M3 7h18v13H3z" />
          <path d="M16 14h5M3 10h18M7 4h10" />
          <circle cx="15" cy="15" r="1" />
        </svg>
      );
    case 'production':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 9V4h14v5M5 18H3V9h18v9h-2" />
          <path d="M6 14h12v7H6zM17 12h1" />
        </svg>
      );
    case 'finishing':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 2v14a2 2 0 0 0 2 2h14M18 22V8a2 2 0 0 0-2-2H2" />
        </svg>
      );
    case 'customers':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="9" cy="8" r="4" />
          <path d="M2 21v-2a6 6 0 0 1 12 0v2M16 4a4 4 0 0 1 0 8M16 15a6 6 0 0 1 6 6" />
        </svg>
      );
    case 'employees':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 21v-2a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      );
    case 'reports':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M21 12a9 9 0 1 1-9-9v9Z" />
          <path d="M12 3a9 9 0 0 1 9 9h-9Z" />
        </svg>
      );
    case 'delivery-labels':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="m20.5 13.5-7 7L3 10V3h7Z" />
          <circle cx="7.5" cy="7.5" r="1.5" />
          <path d="m12 10 3.5 3.5M10.5 13.5l3 3" />
        </svg>
      );
    case 'loyalty':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M20.8 5.7a5.2 5.2 0 0 0-7.4 0L12 7.1l-1.4-1.4a5.2 5.2 0 0 0-7.4 7.4L12 22l8.8-8.9a5.2 5.2 0 0 0 0-7.4Z" />
          <path d="m12 10 1 2 2.2.3-1.6 1.6.4 2.2-2-1-2 1 .4-2.2-1.6-1.6 2.2-.3Z" />
        </svg>
      );
    case 'card':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="M7 9h6M7 13h4M16 10h2v4h-2z" />
        </svg>
      );
    case 'flyer':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 3h9l3 3v15H6z" />
          <path d="M9 11h6M9 15h6M15 3v4h4" />
        </svg>
      );
    case 'sticker':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M20 13 13 20 4 11V4h7l9 9Z" />
          <circle cx="8.5" cy="8.5" r="1.5" />
        </svg>
      );
    case 'banner':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 4h14v13H5zM8 21h8M12 17v4" />
          <path d="m8 13 3-3 2 2 3-4" />
        </svg>
      );
    case 'package':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="m4 7 8-4 8 4-8 4-8-4Z" />
          <path d="m4 7 8 4 8-4v10l-8 4-8-4V7ZM12 11v10" />
        </svg>
      );
    case 'poster':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="4" y="3" width="16" height="18" rx="1" />
          <circle cx="9" cy="9" r="2" />
          <path d="m6 18 4-4 3 2 3-4 2 2" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
        </svg>
      );
  }
}
