import React, { useState, useEffect, useMemo, useRef } from 'react';
import { MODULES } from '../data/initialData';
import { ModuleCardItem } from '../types';
import { LogoutIcon, SearchIcon, ChevronRightIcon, ChevronLeftIcon, ModuleIconRenderer } from './Icons';

interface DashboardScreenProps {
  onOpenOrders: () => void;
  onOpenModule: (module: ModuleCardItem) => void;
  onLogout?: () => void;
}

const PAGE_SIZE = 10;

export const DashboardScreen: React.FC<DashboardScreenProps> = ({
  onOpenOrders,
  onOpenModule,
  onLogout,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(0);
  const [transitionState, setTransitionState] = useState<'idle' | 'leave-next' | 'leave-previous' | 'enter-next' | 'enter-previous'>('idle');
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Ctrl+K to focus search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const filteredModules = useMemo(() => {
    const q = searchQuery.trim().toLocaleLowerCase('ku');
    if (!q) return MODULES;
    return MODULES.filter((mod) =>
      `${mod.name} ${mod.searchKeywords} ${mod.subtext}`.toLocaleLowerCase('ku').includes(q)
    );
  }, [searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredModules.length / PAGE_SIZE));

  useEffect(() => {
    setCurrentPage(0);
  }, [searchQuery]);

  const pagedModules = useMemo(() => {
    const start = currentPage * PAGE_SIZE;
    return filteredModules.slice(start, start + PAGE_SIZE);
  }, [filteredModules, currentPage]);

  const changePage = (nextPage: number) => {
    const targetPage = Math.max(0, Math.min(nextPage, totalPages - 1));
    if (targetPage === currentPage || transitionState !== 'idle') return;

    const dir = targetPage > currentPage ? 'next' : 'previous';
    setTransitionState(`leave-${dir}`);

    window.setTimeout(() => {
      setCurrentPage(targetPage);
      setTransitionState(`enter-${dir}`);
      window.setTimeout(() => {
        setTransitionState('idle');
      }, 300);
    }, 120);
  };

  const isSparse = totalPages > 1 && pagedModules.length > 0 && pagedModules.length <= 5;
  const pageColumns = Math.max(1, Math.min(5, pagedModules.length));
  const pageRows = Math.max(1, Math.ceil(pagedModules.length / 5));

  return (
    <div className="page-shell" id="dashboard-screen">
      <header className="topbar">
        <div className="topbar-actions">
          <button
            className="logout-button"
            type="button"
            aria-label="دەرچوون"
            onClick={onLogout || (() => {})}
          >
            <LogoutIcon />
            <span>دەرچوون</span>
          </button>
        </div>

        <label className="search-box topbar-search">
          <SearchIcon />
          <input
            ref={searchInputRef}
            id="module-search"
            type="search"
            placeholder="ناوی مۆدیول بنووسە... (Ctrl+K)"
            autoComplete="off"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </label>
      </header>

      <main>
        <section className="hero">
          <a className="brand brand-main" href="#" aria-label="Naxsh" onClick={(e) => e.preventDefault()}>
            <img src="assets/naxsh-logo-transparent.png" alt="Naxsh" />
          </a>
        </section>

        <section className="modules-section" aria-labelledby="modules-title">
          <div className="module-browser">
            <button
              className="page-nav page-nav-right"
              id="page-prev"
              type="button"
              aria-label="پەڕەی پێشوو"
              disabled={currentPage === 0}
              onClick={() => changePage(currentPage - 1)}
            >
              <ChevronRightIcon />
            </button>

            <div
              className={`module-grid ${isSparse ? 'is-sparse-page' : ''} ${
                transitionState === 'leave-next'
                  ? 'page-leave-next'
                  : transitionState === 'leave-previous'
                  ? 'page-leave-previous'
                  : transitionState === 'enter-next'
                  ? 'page-enter-next'
                  : transitionState === 'enter-previous'
                  ? 'page-enter-previous'
                  : ''
              }`}
              id="module-grid"
              style={
                {
                  '--page-columns': pageColumns,
                  '--page-rows': pageRows,
                } as React.CSSProperties
              }
            >
              {pagedModules.map((module) => (
                <button
                  key={module.id}
                  className={`module-card ${module.colorClass}`}
                  type="button"
                  data-name={module.searchKeywords}
                  data-screen={module.screen}
                  onClick={() => {
                    if (module.screen === 'orders') {
                      onOpenOrders();
                    } else {
                      onOpenModule(module);
                    }
                  }}
                >
                  <span className="module-icon">
                    <ModuleIconRenderer type={module.iconType} />
                  </span>
                  <span className="card-text">
                    <strong>{module.name}</strong>
                    <small>{module.subtext}</small>
                  </span>
                  {module.badge && <span className="badge">{module.badge}</span>}
                </button>
              ))}
            </div>

            <button
              className="page-nav page-nav-left"
              id="page-next"
              type="button"
              aria-label="پەڕەی دواتر"
              disabled={currentPage >= totalPages - 1}
              onClick={() => changePage(currentPage + 1)}
            >
              <ChevronLeftIcon />
            </button>
          </div>

          {totalPages > 1 && (
            <div className="page-indicator" id="page-indicator" aria-label="پەڕەکانی مۆدیولەکان">
              {Array.from({ length: totalPages }, (_, idx) => (
                <button
                  key={idx}
                  type="button"
                  className={`page-dot ${idx === currentPage ? 'is-active' : ''}`}
                  aria-label={`پەڕەی ${idx + 1}`}
                  aria-current={idx === currentPage ? 'page' : 'false'}
                  onClick={() => changePage(idx)}
                />
              ))}
            </div>
          )}

          <p className={`empty-state ${filteredModules.length === 0 ? 'visible' : ''}`} id="empty-state">
            هیچ مۆدیولێک نەدۆزرایەوە
          </p>
        </section>
      </main>
    </div>
  );
};
