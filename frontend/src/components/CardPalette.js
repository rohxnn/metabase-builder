import React from 'react';

const CARD_TYPES = [
  { type: 'bar', label: 'Bar Chart', icon: '📊' },
  { type: 'line', label: 'Line Chart', icon: '📈' },
  { type: 'pie', label: 'Pie Chart', icon: '🥧' },
  { type: 'scalar', label: 'Metric', icon: '🔢' },
  { type: 'table', label: 'Table', icon: '📋' },
  { type: 'map', label: 'Map', icon: '🗺️' },
  { type: 'area', label: 'Area Chart', icon: '📉' },
  { type: 'row', label: 'Row Chart', icon: '📊' },
];

export default function CardPalette({ onAdd }) {
  return (
    <div style={styles.palette}>
      <h3 style={styles.title}>Card Types</h3>
      {CARD_TYPES.map(ct => (
        <div
          key={ct.type}
          style={styles.item}
          draggable
          onDragStart={e => e.dataTransfer.setData('cardType', ct.type)}
          onClick={() => onAdd({ type: ct.type, title: ct.label })}
        >
          <span style={styles.icon}>{ct.icon}</span>
          <span>{ct.label}</span>
        </div>
      ))}
    </div>
  );
}

const styles = {
  palette: { width: 190, background: '#fff', borderRight: '1px solid #e2e8f0', padding: 18, flexShrink: 0, overflowY: 'auto' },
  title: { fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.05em' },
  item: {
    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
    marginBottom: 8, background: '#f8fafc', border: '1px solid #e2e8f0',
    borderRadius: 8, cursor: 'grab', fontSize: 13, fontWeight: 600,
    color: '#334155', userSelect: 'none', transition: 'all 0.2s',
    boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
  },
  icon: { fontSize: 16 },
};
