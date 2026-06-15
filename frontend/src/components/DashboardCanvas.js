import React, { useState, useEffect } from 'react';
import GridLayout from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { useDispatch, useSelector } from 'react-redux';
import { actions } from '../store';
import { runQuery } from '../services/api';
import { toPreviewSql, injectWhereConditions } from '../services/queryPreview';
import CardEditor from './CardEditor';

const CARD_ICONS = { bar: '📊', line: '📈', pie: '🥧', scalar: '🔢', table: '📋', map: '🗺️', area: '📉', row: '📊' };
const CHART_COLORS = ['#4c6ef5', '#12b886', '#f59f00', '#e64980', '#15aabf', '#845ef7', '#fd7e14'];

const toNumber = value => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const getChartPoints = (result) => {
  const rows = (result.rows || []).slice(0, 12);
  return rows
    .map((row, rowIndex) => {
      const valueIndex = row.findIndex(cell => toNumber(cell) !== null);
      if (valueIndex === -1) return null;
      const labelIndex = row.findIndex((cell, index) => index !== valueIndex && cell !== null && cell !== undefined);
      return {
        label: String(labelIndex === -1 ? result.columns?.[valueIndex] || `Row ${rowIndex + 1}` : row[labelIndex]),
        value: toNumber(row[valueIndex]),
      };
    })
    .filter(Boolean);
};

function ChartPreview({ type, result }) {
  const points = getChartPoints(result);
  if (!points.length) return <MiniTable result={result} />;

  if (type === 'pie') return <PiePreview points={points} />;
  if (type === 'line' || type === 'area') return <LinePreview points={points} area={type === 'area'} />;
  return <BarPreview points={points} />;
}

function BarPreview({ points }) {
  const max = Math.max(...points.map(p => Math.abs(p.value)), 1);
  return (
    <div style={styles.chartWrap}>
      {points.map((point, index) => (
        <div key={`${point.label}-${index}`} style={styles.barRow}>
          <span style={styles.barLabel} title={point.label}>{point.label}</span>
          <div style={styles.barTrack}>
            <div
              style={{
                ...styles.barFill,
                width: `${Math.max(3, Math.abs(point.value) / max * 100)}%`,
                background: CHART_COLORS[index % CHART_COLORS.length],
              }}
            />
          </div>
          <span style={styles.barValue}>{point.value.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}

function LinePreview({ points, area }) {
  const width = 260;
  const height = 150;
  const values = points.map(p => p.value);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const range = max - min || 1;
  const coords = points.map((point, index) => {
    const x = points.length === 1 ? width / 2 : (index / (points.length - 1)) * width;
    const y = height - ((point.value - min) / range) * (height - 24) - 12;
    return { x, y, ...point };
  });
  const linePath = coords.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
  const areaPath = `${linePath} L ${coords[coords.length - 1].x} ${height} L ${coords[0].x} ${height} Z`;

  return (
    <div style={styles.svgWrap}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height="100%"
        preserveAspectRatio="none"
        style={styles.svg}
      >
        {area && <path d={areaPath} fill="#dbe4ff" />}
        <path d={linePath} fill="none" stroke="#4c6ef5" strokeWidth="3" vectorEffect="non-scaling-stroke" />
        {coords.map((point, index) => (
          <circle key={`${point.label}-${index}`} cx={point.x} cy={point.y} r="3" fill="#4c6ef5" />
        ))}
      </svg>
      <div style={styles.chartFooter}>
        <span title={points[0].label}>{points[0].label}</span>
        <span title={points[points.length - 1].label}>{points[points.length - 1].label}</span>
      </div>
    </div>
  );
}

function PiePreview({ points }) {
  const total = points.reduce((sum, point) => sum + Math.abs(point.value), 0) || 1;
  let offset = 25;
  const segments = points.map((point, index) => {
    const value = Math.abs(point.value);
    const dash = value / total * 100;
    const segment = { ...point, dash, offset, color: CHART_COLORS[index % CHART_COLORS.length] };
    offset -= dash;
    return segment;
  });

  return (
    <div style={styles.pieWrap}>
      <svg viewBox="0 0 42 42" style={styles.pieSvg}>
        <circle cx="21" cy="21" r="15.915" fill="transparent" stroke="#edf2ff" strokeWidth="8" />
        {segments.map((segment, index) => (
          <circle
            key={`${segment.label}-${index}`}
            cx="21"
            cy="21"
            r="15.915"
            fill="transparent"
            stroke={segment.color}
            strokeWidth="8"
            strokeDasharray={`${segment.dash} ${100 - segment.dash}`}
            strokeDashoffset={segment.offset}
          />
        ))}
      </svg>
      <div style={styles.legend}>
        {segments.slice(0, 5).map((segment, index) => (
          <div key={`${segment.label}-${index}`} style={styles.legendItem}>
            <span style={{ ...styles.legendDot, background: segment.color }} />
            <span style={styles.legendText} title={segment.label}>{segment.label}</span>
            <span style={styles.legendValue}>{segment.value.toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MiniTable({ result }) {
  return (
    <div style={styles.miniTableWrap}>
      <table style={styles.miniTable}>
        <thead>
          <tr>{result.columns.map((col, i) => <th key={i} style={styles.miniTh}>{col}</th>)}</tr>
        </thead>
        <tbody>
          {result.rows.slice(0, 5).map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j} style={styles.miniTd}>
                  {cell === null ? <span style={{ color: '#adb5bd' }}>—</span> : String(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {result.rows.length > 5 && (
        <div style={styles.moreRows}>+{result.rows.length - 5} more rows</div>
      )}
    </div>
  );
}

// Renders query result based on display type
function CardPreview({ card, result }) {
  if (!result) return <span style={styles.noQuery}>No query — click ✏️ to edit</span>;
  if (result.error) return <span style={styles.errorText}>⚠ {result.error}</span>;
  if (!result.rows || result.rows.length === 0) return <span style={styles.noQuery}>No data returned</span>;

  if (card.type === 'scalar') {
    const val = result.rows && result.rows[0] ? result.rows[0][0] : 'No data';
    return <div style={styles.scalar}>{val === null ? '—' : String(val)}</div>;
  }

  if (['bar', 'line', 'pie', 'area', 'row'].includes(card.type)) {
    return <ChartPreview type={card.type} result={result} />;
  }

  return <MiniTable result={result} />;
}

function CardItem({ card, onEdit, onRemove, onDuplicate }) {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const whereConditions = useSelector(s => s.builder.config.whereConditions) || [];
  const filters = useSelector(s => s.builder.config.filters) || [];
  const metadata = useSelector(s => s.builder.metadata);

  useEffect(() => {
    if (!card.query?.trim()) { setResult(null); return; }
    setLoading(true);
    const finalQuery = injectWhereConditions(card.query, whereConditions, filters, metadata);
    runQuery(toPreviewSql(finalQuery))
      .then(r => setResult(r))
      .catch(e => setResult({ error: e.response?.data?.error || e.message }))
      .finally(() => setLoading(false));
  }, [card.query, whereConditions, filters, metadata]);

  return (
    <div style={styles.card}>
      <div style={styles.cardHeader}>
        <span style={styles.cardTitle}>{CARD_ICONS[card.type] || '📋'} {card.title}</span>
        <div style={{ display: 'flex', gap: 4 }} onMouseDown={e => e.stopPropagation()}>
          <button style={styles.iconBtn} onClick={onEdit} title="Edit">✏️</button>
          <button style={styles.iconBtn} onClick={onDuplicate} title="Duplicate">📄</button>
          <button style={styles.iconBtn} onClick={onRemove} title="Remove">🗑️</button>
        </div>
      </div>
      <div style={styles.cardBody}>
        {loading
          ? <span style={styles.noQuery}>Loading…</span>
          : <CardPreview card={card} result={result} />
        }
      </div>
    </div>
  );
}

export default function DashboardCanvas({ activeTab }) {
  const dispatch = useDispatch();
  const cards = useSelector(s => s.builder.config.cards).filter(
    c => activeTab === null ? true : c.tabIndex === activeTab
  );
  const filters = useSelector(s => s.builder.config.filters);
  const [editingCard, setEditingCard] = useState(null);

  const layout = cards.map(c => ({ i: c.id, x: c.col, y: c.row, w: c.sizeX, h: c.sizeY }));

  const onLayoutChange = (newLayout) => {
    dispatch(actions.updateCardLayout(
      newLayout.map(l => ({ id: l.i, col: l.x, row: l.y, sizeX: l.w, sizeY: l.h }))
    ));
  };

  const onDrop = (layout, item, e) => {
    const cardType = e.dataTransfer.getData('cardType');
    if (!cardType) return;
    dispatch(actions.addCard({
      type: cardType,
      title: cardType.charAt(0).toUpperCase() + cardType.slice(1) + ' Chart',
      col: item.x, row: item.y, sizeX: item.w, sizeY: item.h,
      tabIndex: activeTab ?? undefined,
    }));
  };

  return (
    <div style={styles.canvas} onDragOver={e => e.preventDefault()}>
      {cards.length === 0 && (
        <div style={styles.empty}>
          <p>Drag cards from the left panel or click a card type to add</p>
        </div>
      )}
      <GridLayout
        className="layout"
        layout={layout}
        cols={24}
        rowHeight={60}
        width={1100}
        onLayoutChange={onLayoutChange}
        isDroppable
        onDrop={onDrop}
        droppingItem={{ i: '__dropping__', w: 6, h: 4 }}
      >
        {cards.map(card => (
          <div key={card.id}>
            <CardItem
              card={card}
              onEdit={() => setEditingCard(card)}
              onDuplicate={() => dispatch(actions.duplicateCard(card.id))}
              onRemove={() => dispatch(actions.removeCard(card.id))}
            />
          </div>
        ))}
      </GridLayout>

      {editingCard && (
        <CardEditor
          card={editingCard}
          filters={filters}
          onSave={updated => { dispatch(actions.updateCard(updated)); setEditingCard(null); }}
          onClose={() => setEditingCard(null)}
        />
      )}
    </div>
  );
}

const styles = {
  canvas: { flex: 1, background: '#f1f5f9', padding: 20, overflowY: 'auto', minHeight: 600 },
  empty: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: 250, color: '#94a3b8', fontSize: 15, fontWeight: 500, border: '2px dashed #cbd5e1', borderRadius: 12, margin: 20 },
  card: { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column', height: '100%', boxShadow: '0 4px 6px -1px rgba(0,0, 0, 0.05), 0 2px 4px -2px rgba(0, 0, 0, 0.05)', transition: 'transform 0.2s, box-shadow 0.2s' },
  cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', flexShrink: 0 },
  cardTitle: { fontSize: 13, fontWeight: 700, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  cardBody: { flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' },
  noQuery: { fontSize: 12, color: '#94a3b8', fontStyle: 'italic', padding: 12 },
  errorText: { fontSize: 12, color: '#ef4444', padding: 12, fontWeight: 500 },
  scalar: { fontSize: 36, fontWeight: 800, color: '#4f46e5', padding: 20, textAlign: 'center', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', letterSpacing: '-0.02em' },
  chartWrap: { display: 'grid', gap: 8, padding: 14, overflow: 'auto', flex: 1 },
  barRow: { display: 'grid', gridTemplateColumns: '82px 1fr 56px', gap: 8, alignItems: 'center', minHeight: 20 },
  barLabel: { fontSize: 11, color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 },
  barTrack: { height: 9, borderRadius: 999, background: '#f1f5f9', overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 999 },
  barValue: { fontSize: 11, color: '#0f172a', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 },
  svgWrap: { padding: 14, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' },
  svg: { width: '100%', height: '100%', minHeight: 90, display: 'block' },
  chartFooter: { display: 'flex', justifyContent: 'space-between', gap: 10, color: '#64748b', fontSize: 10, overflow: 'hidden', fontWeight: 500, marginTop: 4 },
  pieWrap: { display: 'grid', gridTemplateColumns: 'minmax(90px, 130px) 1fr', gap: 14, alignItems: 'center', padding: 14, overflow: 'hidden', flex: 1 },
  pieSvg: { width: '100%', maxHeight: 130, transform: 'rotate(-90deg)' },
  legend: { display: 'grid', gap: 6, minWidth: 0 },
  legendItem: { display: 'grid', gridTemplateColumns: '9px minmax(0, 1fr) auto', gap: 8, alignItems: 'center' },
  legendDot: { width: 8, height: 8, borderRadius: 999 },
  legendText: { fontSize: 11, color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 },
  legendValue: { fontSize: 11, color: '#0f172a', fontWeight: 600 },
  miniTableWrap: { overflowX: 'auto', overflowY: 'auto', flex: 1 },
  miniTable: { width: '100%', borderCollapse: 'collapse', fontSize: 11 },
  miniTh: { padding: '6px 10px', background: '#f8fafc', borderBottom: '2px solid #e2e8f0', textAlign: 'left', fontWeight: 600, color: '#475569', whiteSpace: 'nowrap', position: 'sticky', top: 0 },
  miniTd: { padding: '5px 10px', borderBottom: '1px solid #f1f5f9', color: '#334155', whiteSpace: 'nowrap' },
  moreRows: { padding: '6px 10px', fontSize: 10, color: '#64748b', background: '#f8fafc', textAlign: 'center', borderTop: '1px solid #e2e8f0', fontWeight: 500 },
  iconBtn: { background: '#fff', border: '1px solid #cbd5e1', borderRadius: 6, cursor: 'pointer', fontSize: 12, padding: '4px 6px', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' },
};
