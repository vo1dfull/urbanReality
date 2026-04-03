import { memo, useEffect, useMemo, useRef, useState } from 'react';
import SearchPanel from '../../components/SearchPanel';

const TopSearch = memo(function TopSearch({ onLocationSelect }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapRef = useRef(null);

  const items = useMemo(() => ([
    { id: 'r1', title: 'Connaught Place, Delhi', subtitle: 'Recent search', lng: 77.2167, lat: 28.6315 },
    { id: 'r2', title: 'Noida Sector 62', subtitle: 'Saved place', lng: 77.364, lat: 28.627 },
    { id: 'r3', title: query ? `Search "${query}"` : 'Type to search', subtitle: 'Suggestion', lng: 77.209, lat: 28.6139 },
  ]), [query]);

  useEffect(() => {
    const onDoc = (e) => {
      if (!wrapRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  return (
    <div ref={wrapRef} style={{ width: '100%', maxWidth: 500, pointerEvents: 'auto' }}>
      <div
        style={{
          height: 44, borderRadius: 24, border: '1px solid rgba(255,255,255,0.12)',
          background: 'rgba(15,23,42,0.86)', backdropFilter: 'blur(14px)',
          display: 'flex', alignItems: 'center', padding: '0 14px',
          boxShadow: '0 10px 20px rgba(2,6,23,0.2)',
        }}
      >
        <span style={{ marginRight: 10, color: '#94a3b8' }}>⌕</span>
        <input
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search places, coordinates, and projects"
          style={{ width: '100%', border: 0, outline: 0, background: 'transparent', color: '#e2e8f0', fontSize: 14 }}
        />
      </div>
      <SearchPanel
        open={open}
        items={items}
        onSelect={(item) => {
          setQuery(item.title);
          setOpen(false);
          onLocationSelect(item.lng, item.lat, item.title);
        }}
      />
    </div>
  );
});

export default TopSearch;
