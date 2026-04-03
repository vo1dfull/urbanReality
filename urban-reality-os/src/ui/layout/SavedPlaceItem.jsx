import { memo } from 'react';

const placeCategoryLabel = (category) => {
  if (!category) return 'Custom';
  const map = {
    home: 'Home',
    work: 'Work',
    project: 'Project',
    landmark: 'Landmark',
    custom: 'Custom',
  };
  return map[category] || category;
};

const SavedPlaceItem = memo(function SavedPlaceItem({ place, selected, onSelect, onFlyTo, onDelete, onRename }) {
  const isSelected = selected === place.id;

  return (
    <div
      onClick={() => onSelect?.(place)}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: isSelected ? 'rgba(37,99,235,0.16)' : 'rgba(15, 23, 42, 0.78)',
        border: `1px solid ${isSelected ? 'rgba(37,99,235,0.8)' : 'rgba(148,163,184,0.22)'}`,
        borderRadius: 10,
        padding: '10px',
        marginBottom: 8,
        cursor: 'pointer',
        transition: 'transform 0.18s ease, box-shadow 0.18s ease, background 0.18s ease',
        boxShadow: isSelected ? '0 8px 20px rgba(30, 60, 140, 0.3)' : '0 4px 10px rgba(0,0,0,0.12)',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.transform = 'translateY(-1px) scale(1.01)')}
      onMouseLeave={(e) => (e.currentTarget.style.transform = 'translateY(0) scale(1)')}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#f8fafc', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{place.name}</span>
          <span style={{ fontSize: 11, color: '#94a3b8', background: 'rgba(148,163,184,0.22)', borderRadius: 4, padding: '1px 5px' }}>{placeCategoryLabel(place.category)}</span>
        </div>
        <div style={{ fontSize: 12, color: '#cbd5e1' }}>{place.coordinates[1].toFixed(5)}, {place.coordinates[0].toFixed(5)}</div>
      </div>
      <div style={{ display: 'flex', gap: 6, marginLeft: 8 }}>
        <button
          onClick={(e) => { e.stopPropagation(); onFlyTo?.(place); }}
          style={{ border: 'none', background: 'rgba(34,197,94,0.9)', color: '#fff', borderRadius: 6, padding: '5px 8px', fontSize: 11, cursor: 'pointer' }}
        >Go</button>
        <button
          onClick={(e) => { e.stopPropagation(); onRename?.(place); }}
          style={{ border: 'none', background: 'rgba(59,130,246,0.9)', color: '#fff', borderRadius: 6, padding: '5px 8px', fontSize: 11, cursor: 'pointer' }}
        >✎</button>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete?.(place.id); }}
          style={{ border: 'none', background: 'rgba(239,68,68,0.9)', color: '#fff', borderRadius: 6, padding: '5px 8px', fontSize: 11, cursor: 'pointer' }}
          aria-label="Delete saved place"
        >🗑</button>
      </div>
    </div>
  );
});

export default SavedPlaceItem;
