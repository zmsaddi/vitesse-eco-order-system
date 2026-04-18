'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';

/**
 * @typedef {{ id: number, [k: string]: any }} Row
 * @typedef {{ key: string, label: string, icon: string, endpoint: string, fields: string[], display: (r: Row) => string, sub: (r: Row) => string|null, href: (r: Row) => string, roles: string[] }} Entity
 */

/** @type {Entity[]} */
const ENTITIES = [
  {
    key: 'clients',
    label: 'العملاء',
    icon: '👥',
    endpoint: '/api/clients?withDebt=true',
    fields: ['name', 'description_ar', 'phone', 'email', 'address'],
    display: (r) => r.name + (r.description_ar ? ` — ${r.description_ar}` : ''),
    sub: (r) => [r.phone, r.email].filter(Boolean).join(' • ') || null,
    href: (r) => `/clients/${r.id}`,
    roles: ['admin', 'manager'],
  },
  {
    key: 'suppliers',
    label: 'الموردين',
    icon: '🏭',
    endpoint: '/api/suppliers',
    fields: ['name', 'contact_person', 'phone', 'email'],
    display: (r) => r.name + (r.contact_person ? ` — ${r.contact_person}` : ''),
    sub: (r) => [r.phone, r.email].filter(Boolean).join(' • ') || null,
    href: (r) => `/suppliers/${r.id}`,
    roles: ['admin', 'manager'],
  },
  {
    key: 'products',
    label: 'المخزون',
    icon: '📦',
    endpoint: '/api/products',
    fields: ['name', 'sku', 'category'],
    display: (r) => r.name + (r.sku ? ` (${r.sku})` : ''),
    sub: (r) => r.category || null,
    href: () => '/stock',
    roles: ['admin', 'manager', 'seller'],
  },
  {
    key: 'sales',
    label: 'المبيعات',
    icon: '💰',
    endpoint: '/api/sales',
    fields: ['client_name', 'product_name', 'notes'],
    display: (r) => `فاتورة #${r.id} — ${r.client_name || 'عميل'}`,
    sub: (r) => r.product_name || null,
    href: () => '/sales',
    roles: ['admin', 'manager', 'seller'],
  },
  {
    key: 'purchases',
    label: 'المشتريات',
    icon: '🛒',
    endpoint: '/api/purchases',
    fields: ['supplier_name', 'product_name', 'notes'],
    display: (r) => `مشتريات #${r.id} — ${r.supplier_name || 'مورد'}`,
    sub: (r) => r.product_name || null,
    href: () => '/purchases',
    roles: ['admin', 'manager'],
  },
  {
    key: 'expenses',
    label: 'المصاريف',
    icon: '📋',
    endpoint: '/api/expenses',
    fields: ['description', 'category', 'notes'],
    display: (r) => r.description || `مصروف #${r.id}`,
    sub: (r) => r.category || null,
    href: () => '/expenses',
    roles: ['admin', 'manager'],
  },
];

export default function GlobalSearch({ open, onClose }) {
  const router = useRouter();
  const { data: session } = useSession();
  const role = /** @type {any} */ (session?.user)?.role || 'seller';

  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [cache, setCache] = useState({});           // { entityKey: rows[] }
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  const visibleEntities = ENTITIES.filter((e) => e.roles.includes(role));

  // Escape to close
  useEffect(() => {
    /** @param {KeyboardEvent} e */
    const handler = (e) => {
      if (e.key === 'Escape') onClose();
    };
    if (open) window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // Focus input when opening
  useEffect(() => {
    if (open) {
      setQuery('');
      setResults([]);
      setActiveIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Fetch data for all entities on first open (lazy load + cache)
  const fetchAll = useCallback(async () => {
    if (Object.keys(cache).length > 0) return cache;
    setLoading(true);
    const newCache = {};
    const fetches = visibleEntities.map(async (entity) => {
      try {
        const res = await fetch(entity.endpoint, { cache: 'no-store' });
        const data = await res.json();
        newCache[entity.key] = Array.isArray(data) ? data : [];
      } catch {
        newCache[entity.key] = [];
      }
    });
    await Promise.all(fetches);
    setCache(newCache);
    setLoading(false);
    return newCache;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cache, role]);

  // Search whenever query changes
  useEffect(() => {
    if (!open) return;
    if (!query.trim()) {
      setResults([]);
      setActiveIndex(0);
      return;
    }

    const doSearch = async () => {
      const data = Object.keys(cache).length > 0 ? cache : await fetchAll();
      const q = query.toLowerCase().trim();
      const grouped = [];

      for (const entity of visibleEntities) {
        const rows = data[entity.key] || [];
        const matches = rows.filter((/** @type {Row} */ row) =>
          entity.fields.some((f) => {
            const val = row[f];
            return val && String(val).toLowerCase().includes(q);
          })
        ).slice(0, 5); // max 5 results per entity

        if (matches.length > 0) {
          grouped.push({ entity, matches });
        }
      }
      setResults(grouped);
      setActiveIndex(0);
    };

    const timeout = setTimeout(doSearch, 150); // debounce
    return () => clearTimeout(timeout);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, open, cache]);

  // Flat list for keyboard nav
  const flatResults = results.flatMap((g) =>
    g.matches.map((/** @type {Row} */ row) => ({ entity: g.entity, row }))
  );

  /** @param {React.KeyboardEvent} e */
  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, flatResults.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && flatResults[activeIndex]) {
      e.preventDefault();
      const { entity, row } = flatResults[activeIndex];
      router.push(entity.href(row));
      onClose();
    }
  };

  // Scroll active item into view
  useEffect(() => {
    if (!listRef.current) return;
    const active = listRef.current.querySelector('[data-active="true"]');
    if (active) active.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  /** @param {Entity} entity @param {Row} row */
  const handleSelect = (entity, row) => {
    router.push(entity.href(row));
    onClose();
  };

  // Invalidate cache periodically (every 2 min)
  useEffect(() => {
    const interval = setInterval(() => setCache({}), 120_000);
    return () => clearInterval(interval);
  }, []);

  if (!open) return null;

  let flatIndex = 0;

  return (
    <div className="global-search-overlay" onClick={() => onClose()}>
      <div className="global-search-modal" onClick={(e) => e.stopPropagation()}>
        {/* Search input */}
        <div className="global-search-input-wrap">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" width="20" height="20" style={{ color: '#94a3b8', flexShrink: 0 }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            className="global-search-input"
            placeholder="ابحث في العملاء، الموردين، المبيعات، المخزون..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <kbd className="global-search-kbd">ESC</kbd>
        </div>

        {/* Results */}
        <div className="global-search-results" ref={listRef}>
          {loading && (
            <div className="global-search-empty">جاري التحميل...</div>
          )}
          {!loading && query && results.length === 0 && (
            <div className="global-search-empty">
              لا توجد نتائج لـ &quot;{query}&quot;
            </div>
          )}
          {!loading && !query && (
            <div className="global-search-empty">
              اكتب للبحث في جميع البيانات
            </div>
          )}
          {results.map((group) => (
            <div key={group.entity.key} className="global-search-group">
              <div className="global-search-group-label">
                <span>{group.entity.icon}</span> {group.entity.label}
              </div>
              {group.matches.map((/** @type {Row} */ row) => {
                const idx = flatIndex++;
                const isActive = idx === activeIndex;
                return (
                  <button
                    key={`${group.entity.key}-${row.id}`}
                    className={`global-search-item ${isActive ? 'active' : ''}`}
                    data-active={isActive}
                    onClick={() => handleSelect(group.entity, row)}
                    onMouseEnter={() => setActiveIndex(idx)}
                  >
                    <div className="global-search-item-text">
                      <span className="global-search-item-title">
                        {group.entity.display(row)}
                      </span>
                      {group.entity.sub(row) && (
                        <span className="global-search-item-sub">
                          {group.entity.sub(row)}
                        </span>
                      )}
                    </div>
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" width="16" height="16" style={{ opacity: 0.3, flexShrink: 0, transform: 'scaleX(-1)' }}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                    </svg>
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* Footer hint */}
        <div className="global-search-footer">
          <span><kbd>↑</kbd> <kbd>↓</kbd> للتنقل</span>
          <span><kbd>Enter</kbd> للفتح</span>
          <span><kbd>Esc</kbd> للإغلاق</span>
        </div>
      </div>
    </div>
  );
}

/** Trigger button — place in Sidebar or TopBar */
export function SearchTrigger({ onClick }) {
  return (
    <button className="global-search-trigger" onClick={onClick} title="بحث (Ctrl+K)">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" width="18" height="18">
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
      </svg>
      <span>بحث...</span>
      <kbd>Ctrl+K</kbd>
    </button>
  );
}
