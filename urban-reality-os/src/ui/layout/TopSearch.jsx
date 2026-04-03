import { memo, useEffect, useMemo, useRef, useState } from 'react';
import SearchPanel from '../../components/SearchPanel';

const HISTORY_KEY = 'recentSearches';
const MAX_HISTORY = 8;

const TopSearch = memo(function TopSearch({ onLocationSelect }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [remote, setRemote] = useState([]);
  const [history, setHistory] = useState([]);
  const wrapRef = useRef(null);
  const abortRef = useRef(null);

  const items = useMemo(() => {
    const trimmed = query.trim();
    const coords = parseCoordinates(trimmed);
    const fromHistory = history
      .filter((x) => !trimmed || x.title.toLowerCase().includes(trimmed.toLowerCase()))
      .map((x) => ({ ...x, subtitle: 'Recent search' }));
    const suggestions = remote.map((x) => ({ ...x, subtitle: 'Suggestion' }));
    const coordOption = coords ? [{ id: `coord-${coords.lng}-${coords.lat}`, title: `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`, subtitle: 'Coordinates', lat: coords.lat, lng: coords.lng }] : [];
    const merged = [...coordOption, ...suggestions, ...fromHistory];
    return merged.slice(0, 10);
  }, [history, query, remote]);

  useEffect(() => {
    try {
      setHistory(JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'));
    } catch {
      setHistory([]);
    }
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (!q || q.length < 2 || parseCoordinates(q)) {
      setRemote([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        abortRef.current?.abort();
        const c = new AbortController();
        abortRef.current = c;
        const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=6&q=${encodeURIComponent(q)}`;
        const res = await fetch(url, { signal: c.signal, headers: { Accept: 'application/json' } });
        if (!res.ok) return;
        const data = await res.json();
        setRemote((data || []).map((r, i) => ({
          id: `n-${r.place_id || i}`,
          title: r.display_name || 'Unknown place',
          lat: Number(r.lat),
          lng: Number(r.lon),
        })).filter((x) => Number.isFinite(x.lat) && Number.isFinite(x.lng)));
      } catch {
        setRemote([]);
      }
    }, 220);
    return () => clearTimeout(timer);
  }, [query]);

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
          setHistory((prev) => {
            const next = [{ id: `h-${Date.now()}`, title: item.title, lat: item.lat, lng: item.lng }, ...prev.filter((x) => x.title !== item.title)].slice(0, MAX_HISTORY);
            localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
            return next;
          });
          onLocationSelect(item.lng, item.lat, item.title);
        }}
      />
    </div>
  );
});

export default TopSearch;

function parseCoordinates(input) {
  const m = input.match(/^\s*(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  if (Math.abs(a) <= 90 && Math.abs(b) <= 180) return { lat: a, lng: b };
  if (Math.abs(b) <= 90 && Math.abs(a) <= 180) return { lat: b, lng: a };
  return null;
}
