import React, { useState, useEffect } from 'react';
import GridLayout, { WidthProvider } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { useDispatch, useSelector } from 'react-redux';

const ReactGridLayout = WidthProvider(GridLayout);
import { actions } from '../store';
import { runQuery, getFieldValues } from '../services/api';
import { toPreviewSql, injectWhereConditions, injectPreviewFilterValues } from '../services/queryPreview';
import CardEditor from './CardEditor';
import {
  ResponsiveContainer,
  BarChart, Bar,
  LineChart, Line,
  AreaChart, Area,
  PieChart, Pie, Cell,
  XAxis, YAxis,
  CartesianGrid,
  Tooltip
} from 'recharts';

const CARD_ICONS = {
  scalar: '🔢', gauge: '⏲️', progress: '📊',
  table: '📋', object: '📄', detail: '📄', bar: '📊', line: '📈', pie: '🥧', row: '↕️', area: '📉',
  combo: '📊', pivot: '📋', smartscalar: '📈', trend: '📈', funnel: '⏳', map: '🗺️', scatter: '🔵',
  waterfall: '📶'
};
const CHART_COLORS = ['#4c6ef5', '#12b886', '#f59f00', '#e64980', '#15aabf', '#845ef7', '#fd7e14'];

const extractVariables = (query = '') => {
  const names = new Set();
  const re = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;
  let match;
  while ((match = re.exec(query))) names.add(match[1]);
  return [...names];
};

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

function CustomTooltip({ active, payload }) {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-slate-900 text-white px-2.5 py-1.5 rounded-lg shadow-md border border-slate-800 text-[11px] font-medium leading-normal">
        <p className="font-semibold text-slate-300 mb-0.5">{data.name}</p>
        <p className="text-[12px] font-bold text-white">{data.value.toLocaleString()}</p>
      </div>
    );
  }
  return null;
}

function ChartPreview({ type, result }) {
  const points = getChartPoints(result);
  if (!points.length) return <MiniTable result={result} />;

  if (type === 'pie') return <PiePreview points={points} />;
  if (type === 'line' || type === 'area') return <LinePreview points={points} area={type === 'area'} />;
  if (type === 'row') return <RowPreview points={points} />;
  return <BarPreview points={points} />;
}

function BarPreview({ points }) {
  const data = points.map((p, index) => ({
    name: p.label,
    value: p.value,
    color: CHART_COLORS[index % CHART_COLORS.length]
  }));

  return (
    <div className="w-full h-full min-h-[140px] p-2 flex-1 min-w-0">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
          <XAxis
            dataKey="name"
            tick={{ fill: '#64748b', fontSize: 10, fontWeight: 500 }}
            tickLine={false}
            axisLine={false}
            dy={5}
          />
          <YAxis
            tick={{ fill: '#64748b', fontSize: 10, fontWeight: 500 }}
            tickLine={false}
            axisLine={false}
            dx={-5}
          />
          <Tooltip
            content={<CustomTooltip />}
            cursor={{ fill: 'rgba(241, 245, 249, 0.4)' }}
          />
          <Bar dataKey="value" radius={[4, 4, 0, 0]}>
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function RowPreview({ points }) {
  const data = points.map((p, index) => ({
    name: p.label,
    value: p.value,
    color: CHART_COLORS[index % CHART_COLORS.length]
  }));

  return (
    <div className="w-full h-full min-h-[140px] p-2 flex-1 min-w-0">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 10, right: 15, left: 10, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
          <XAxis
            type="number"
            tick={{ fill: '#64748b', fontSize: 10, fontWeight: 500 }}
            tickLine={false}
            axisLine={false}
            dy={5}
          />
          <YAxis
            type="category"
            dataKey="name"
            tick={{ fill: '#64748b', fontSize: 10, fontWeight: 500 }}
            tickLine={false}
            axisLine={false}
            width={70}
            dx={-5}
          />
          <Tooltip
            content={<CustomTooltip />}
            cursor={{ fill: 'rgba(241, 245, 249, 0.4)' }}
          />
          <Bar dataKey="value" radius={[0, 4, 4, 0]}>
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function LinePreview({ points, area }) {
  const data = points.map(p => ({
    name: p.label,
    value: p.value
  }));

  if (area) {
    return (
      <div className="w-full h-full min-h-[140px] p-2 flex-1 min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={data}
            margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
          >
            <defs>
              <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#4c6ef5" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#4c6ef5" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
            <XAxis
              dataKey="name"
              tick={{ fill: '#64748b', fontSize: 10, fontWeight: 500 }}
              tickLine={false}
              axisLine={false}
              dy={5}
            />
            <YAxis
              tick={{ fill: '#64748b', fontSize: 10, fontWeight: 500 }}
              tickLine={false}
              axisLine={false}
              dx={-5}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="value"
              stroke="#4c6ef5"
              strokeWidth={3}
              fillOpacity={1}
              fill="url(#areaGradient)"
              dot={{ r: 2, stroke: '#4c6ef5', strokeWidth: 1, fill: '#fff' }}
              activeDot={{ r: 5, stroke: '#4c6ef5', strokeWidth: 2, fill: '#fff' }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    );
  }

  return (
    <div className="w-full h-full min-h-[140px] p-2 flex-1 min-w-0">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
          <XAxis
            dataKey="name"
            tick={{ fill: '#64748b', fontSize: 10, fontWeight: 500 }}
            tickLine={false}
            axisLine={false}
            dy={5}
          />
          <YAxis
            tick={{ fill: '#64748b', fontSize: 10, fontWeight: 500 }}
            tickLine={false}
            axisLine={false}
            dx={-5}
          />
          <Tooltip content={<CustomTooltip />} />
          <Line
            type="monotone"
            dataKey="value"
            stroke="#4c6ef5"
            strokeWidth={3}
            dot={{ r: 2, stroke: '#4c6ef5', strokeWidth: 1, fill: '#fff' }}
            activeDot={{ r: 5, stroke: '#4c6ef5', strokeWidth: 2, fill: '#fff' }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function PiePreview({ points }) {
  const total = points.reduce((sum, point) => sum + Math.abs(point.value), 0) || 1;
  const data = points.map((p, index) => ({
    name: p.label,
    value: Math.abs(p.value),
    rawValue: p.value,
    color: CHART_COLORS[index % CHART_COLORS.length],
    percentage: ((Math.abs(p.value) / total) * 100).toFixed(1)
  }));

  return (
    <div className="grid grid-cols-[1fr_minmax(120px,160px)] gap-2 items-center p-2 overflow-hidden flex-1 h-full min-h-[140px]">
      <div className="w-full h-full min-h-[120px] flex items-center justify-center">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius="55%"
              outerRadius="80%"
              paddingAngle={2}
              dataKey="value"
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const item = payload[0].payload;
                  return (
                    <div className="bg-slate-900 text-white px-2.5 py-1.5 rounded-lg shadow-md border border-slate-800 text-[11px] font-medium leading-normal">
                      <p className="font-semibold text-slate-300 mb-0.5">{item.name}</p>
                      <p className="text-[12px] font-bold text-white">
                        {item.rawValue.toLocaleString()} ({item.percentage}%)
                      </p>
                    </div>
                  );
                }
                return null;
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="grid gap-1.5 overflow-y-auto max-h-[140px] pr-1 scrollbar-thin">
        {data.slice(0, 6).map((item, index) => (
          <div key={`${item.name}-${index}`} className="grid grid-cols-[8px_1fr_auto] gap-2 items-center min-w-0">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: item.color }} />
            <span className="text-[11px] text-slate-500 overflow-hidden text-ellipsis whitespace-nowrap font-medium" title={item.name}>{item.name}</span>
            <span className="text-[11px] text-slate-900 font-semibold text-right">{item.percentage}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MiniTable({ result }) {
  return (
    <div className="overflow-x-auto overflow-y-auto flex-1">
      <table className="w-full border-collapse text-[11px]">
        <thead>
          <tr>
            {result.columns.map((col, i) => (
              <th key={i} className="py-1.5 px-2.5 bg-slate-50 border-b-2 border-slate-200 text-left font-semibold text-slate-600 whitespace-nowrap sticky top-0">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {result.rows.slice(0, 5).map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j} className="py-1.25 px-2.5 border-b border-slate-100 text-slate-600 whitespace-nowrap">
                  {cell === null ? <span className="text-slate-400">—</span> : String(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {result.rows.length > 5 && (
        <div className="py-1.5 px-2.5 text-[10px] text-slate-500 bg-slate-50 text-center border-t border-slate-200 font-medium">
          +{result.rows.length - 5} more rows
        </div>
      )}
    </div>
  );
}

// Renders query result based on display type
function CardPreview({ card, result }) {
  if (!result) return <span className="text-xs text-slate-400 italic p-3">No query — click ✏️ to edit</span>;
  if (result.error) return <span className="text-xs text-red-500 p-3 font-semibold">⚠ {result.error}</span>;
  if (!result.rows || result.rows.length === 0) return <span className="text-xs text-slate-400 italic p-3">No data returned</span>;

  if (card.type === 'scalar') {
    const val = result.rows && result.rows[0] ? result.rows[0][0] : 'No data';
    return <div className="text-4xl font-extrabold text-indigo-600 p-5 text-center flex-1 flex items-center justify-center tracking-tight">{val === null ? '—' : String(val)}</div>;
  }

  if (['bar', 'line', 'pie', 'area', 'row'].includes(card.type)) {
    return <ChartPreview type={card.type} result={result} />;
  }

  return <MiniTable result={result} />;
}

function CardItem({ card, onEdit, onRemove, onDuplicate }) {
  const dispatch = useDispatch();
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const whereConditions = useSelector(s => s.builder.config.whereConditions) || [];
  const filters = useSelector(s => s.builder.config.filters) || [];
  const metadata = useSelector(s => s.builder.metadata);
  const selectedFilterId = useSelector(s => s.builder.selectedFilterId);
  const selectedFilter = useSelector(s => s.builder.config.filters.find(f => f.id === selectedFilterId));

  const previewMode = useSelector(s => s.builder.previewMode);
  const previewFilterValues = useSelector(s => s.builder.previewFilterValues) || {};

  useEffect(() => {
    if (selectedFilterId) return; // Skip preview query run when configuring/mapping filters

    if (!card.query?.trim()) { setResult(null); return; }
    setLoading(true);
    let finalQuery = injectWhereConditions(card.query, whereConditions, filters, metadata);
    if (previewMode) {
      finalQuery = injectPreviewFilterValues(finalQuery, card.parameterMappings, filters, previewFilterValues, metadata);
    }
    runQuery(toPreviewSql(finalQuery))
      .then(r => setResult(r))
      .catch(e => setResult({ error: e.response?.data?.error || e.message }))
      .finally(() => setLoading(false));
  }, [card.query, whereConditions, filters, metadata, selectedFilterId, previewMode, previewFilterValues]);

  const handleRemoveMapping = () => {
    const newMappings = (card.parameterMappings || []).filter(m => m.parameter_id !== selectedFilterId);
    dispatch(actions.updateCard({
      id: card.id,
      parameterMappings: newMappings,
    }));
  };

  const handleAddMapping = (variable) => {
    if (!variable) return;
    let newMappings = [...(card.parameterMappings || [])];
    newMappings = newMappings.filter(m => m.target?.[1]?.[1] !== variable);
    const isDimension = !!selectedFilter?.fieldId;
    newMappings.push({
      parameter_id: selectedFilterId,
      target: [isDimension ? 'dimension' : 'variable', ['template-tag', variable]]
    });
    dispatch(actions.updateCard({
      id: card.id,
      parameterMappings: newMappings,
    }));
  };

  const cardVariables = extractVariables(card.query || '');
  const currentMapping = (card.parameterMappings || []).find(m => m.parameter_id === selectedFilterId);
  const mappedVariable = currentMapping ? currentMapping.target?.[1]?.[1] : null;

  return (
    <div className="bg-white/70 backdrop-blur-md border border-white/50 rounded-2xl overflow-hidden flex flex-col h-full shadow-[0_8px_30px_rgb(0,0,0,0.04),_0_1px_2px_rgb(0,0,0,0.03),_inset_0_1px_0_rgba(255,255,255,0.75)]">
      <div className="flex justify-between items-center py-2.5 px-4 bg-slate-50/40 backdrop-blur-sm border-b border-slate-200/40 shrink-0">
        <span className="text-[13px] font-bold text-slate-800 overflow-hidden text-ellipsis whitespace-nowrap">{CARD_ICONS[card.type] || '📋'} {card.title}</span>
        {!selectedFilterId && !previewMode && (
          <div className="flex gap-1.5" onMouseDown={e => e.stopPropagation()}>
            <button className="bg-white/60 border border-white/80 rounded-md cursor-pointer text-xs p-1 flex items-center justify-center transition-all hover:bg-white/90 hover:border-slate-300/50 shadow-[0_1px_2px_rgba(0,0,0,0.02)]" onClick={onEdit} title="Edit">✏️</button>
            <button className="bg-white/60 border border-white/80 rounded-md cursor-pointer text-xs p-1 flex items-center justify-center transition-all hover:bg-white/90 hover:border-slate-300/50 shadow-[0_1px_2px_rgba(0,0,0,0.02)]" onClick={onDuplicate} title="Duplicate">📄</button>
            <button className="bg-white/60 border border-white/80 rounded-md cursor-pointer text-xs p-1 flex items-center justify-center transition-all hover:bg-white/90 hover:border-slate-300/50 shadow-[0_1px_2px_rgba(0,0,0,0.02)]" onClick={onRemove} title="Remove">🗑️</button>
          </div>
        )}
      </div>
      <div className="flex-1 overflow-hidden flex flex-col justify-center p-4">
        {selectedFilterId ? (
          <div className="bg-white rounded-2xl p-5 shadow-lg flex flex-col items-center justify-center gap-2.5 mx-auto min-w-[170px] max-w-[90%] border border-slate-100">
            <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider text-center">COLUMN TO FILTER ON</span>
            {mappedVariable ? (
              <button
                onClick={handleRemoveMapping}
                className="inline-flex items-center gap-1.5 py-1.5 px-3.5 rounded-lg text-xs font-semibold bg-blue-500 text-white hover:bg-blue-600 border-none shadow-sm cursor-pointer transition-all"
              >
                <span>{mappedVariable}</span>
                <span className="text-[10px] font-bold ml-1 hover:text-red-200">✕</span>
              </button>
            ) : cardVariables.length > 0 ? (
              <select
                className="py-1.5 px-3 border border-slate-300 rounded-lg text-xs outline-none bg-white focus:border-indigo-500 shadow-sm font-semibold text-slate-700 w-full min-w-[130px] cursor-pointer"
                value=""
                onChange={e => handleAddMapping(e.target.value)}
              >
                <option value="">Select...</option>
                {cardVariables.map(v => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            ) : (
              <span className="text-xs text-slate-400 italic">No variables to map</span>
            )}
          </div>
        ) : loading ? (
          <span className="text-xs text-slate-400 italic p-3 self-start">Loading…</span>
        ) : (
          <CardPreview card={card} result={result} />
        )}
      </div>
    </div>
  );
}

const findForeignKeyField = (childTableObj, parentTableName) => {
  if (!childTableObj || !parentTableName) return null;
  const pName = parentTableName.toLowerCase();
  const singularPName = pName.replace(/s$/, '');

  let fkField = childTableObj.fields?.find(f => 
    f.name.toLowerCase() === `${pName}_id` || 
    f.name.toLowerCase() === `${singularPName}_id`
  );

  if (fkField) return fkField.name;

  fkField = childTableObj.fields?.find(f => {
    const name = f.name.toLowerCase();
    if (!name.endsWith('_id')) return false;
    const prefix = name.slice(0, -3).replace(/s$/, '');
    return pName.startsWith(prefix) || 
           prefix.startsWith(singularPName) || 
           singularPName.startsWith(prefix);
  });

  return fkField ? fkField.name : null;
};

function FilterPill({ filter, value, onChange, onClear, isOpen, setIsOpen, allFilters = [], previewFilterValues = {}, metadata = null }) {
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!isOpen || !filter.fieldId) return;

    // Check if there are active parent filters
    const activeParentFilters = (filter.filteringParameters || [])
      .map(pId => {
        const parentF = allFilters.find(f => f.id === pId);
        const parentVal = previewFilterValues[pId];
        return { parentF, parentVal };
      })
      .filter(p => p.parentF && p.parentVal !== undefined && p.parentVal !== null && p.parentVal !== '');

    if (activeParentFilters.length > 0) {
      setOptions([]);
      setLoading(true);
      const tableName = filter.tableName || filter.table_name;
      const fieldName = filter.fieldName || filter.field_name;

      if (tableName && fieldName) {
        let sql = `SELECT DISTINCT ${tableName}.${fieldName} FROM ${tableName}`;
        const conditions = [];
        const joins = [];

        activeParentFilters.forEach(({ parentF, parentVal }) => {
          const pTable = parentF.tableName || parentF.table_name;
          const pField = parentF.fieldName || parentF.field_name;

          if (pTable === tableName && pField) {
            if (Array.isArray(parentVal)) {
              conditions.push(`${tableName}.${pField} IN (${parentVal.map(v => `'${String(v).replace(/'/g, "''")}'`).join(', ')})`);
            } else {
              conditions.push(`${tableName}.${pField} = '${String(parentVal).replace(/'/g, "''")}'`);
            }
          } else if (pTable && pField) {
            const childTableObj = metadata?.tables?.find(t => t.name === tableName);
            const fkFieldName = findForeignKeyField(childTableObj, pTable);

            if (fkFieldName) {
              const parentTableObj = metadata?.tables?.find(t => t.name === pTable);
              const parentPkField = parentTableObj?.fields?.find(f => f.name.toLowerCase() === 'id')?.name || 'id';

              joins.push(`JOIN ${pTable} ON ${tableName}.${fkFieldName} = ${pTable}.${parentPkField}`);

              if (Array.isArray(parentVal)) {
                conditions.push(`${pTable}.${pField} IN (${parentVal.map(v => `'${String(v).replace(/'/g, "''")}'`).join(', ')})`);
              } else {
                conditions.push(`${pTable}.${pField} = '${String(parentVal).replace(/'/g, "''")}'`);
              }
            } else {
              const parentFieldExistsInChildTable = childTableObj?.fields?.some(f => f.name === pField);
              if (parentFieldExistsInChildTable) {
                if (Array.isArray(parentVal)) {
                  conditions.push(`${tableName}.${pField} IN (${parentVal.map(v => `'${String(v).replace(/'/g, "''")}'`).join(', ')})`);
                } else {
                  conditions.push(`${tableName}.${pField} = '${String(parentVal).replace(/'/g, "''")}'`);
                }
              }
            }
          }
        });

        if (joins.length > 0) {
          sql += ` ${joins.join(' ')}`;
        }
        if (conditions.length > 0) {
          sql += ` WHERE ${conditions.join(' AND ')}`;
        }
        sql += ` ORDER BY ${tableName}.${fieldName} ASC LIMIT 1000`;

        runQuery(sql)
          .then(r => {
            const rows = r.rows || [];
            const values = rows.map(row => Array.isArray(row) ? row[0] : row).filter(v => v !== null && v !== undefined);
            setOptions(values);
          })
          .catch(err => {
            console.error('Failed to load linked filter options via query', err);
            fetchUnfiltered();
          })
          .finally(() => setLoading(false));
      } else {
        fetchUnfiltered();
      }
    } else {
      if (options.length > 0) return;
      fetchUnfiltered();
    }

    function fetchUnfiltered() {
      setLoading(true);
      getFieldValues(filter.fieldId)
        .then(r => setOptions(r.values || []))
        .catch(err => console.error('Failed to load filter options', err))
        .finally(() => setLoading(false));
    }
  }, [
    isOpen,
    filter.fieldId,
    JSON.stringify(filter.filteringParameters),
    JSON.stringify(previewFilterValues),
    allFilters,
    metadata
  ]);

  const typeIcon = filter.type?.startsWith('date') ? '📅' : '📝';
  const displayLabel = value !== undefined && value !== null && value !== ''
    ? `${filter.name}: ${value}`
    : filter.name;

  const isSelected = value !== undefined && value !== null && value !== '';

  const staticOptions = filter.values_source_type === 'static-list'
    ? (filter.values_source_config?.values || [])
    : [];

  const combinedOptions = [...new Set([...staticOptions, ...options])].map(String);
  const filteredOptions = combinedOptions.filter(opt => opt.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="relative inline-block" onMouseDown={e => e.stopPropagation()}>
      <div
        className={`inline-flex items-center gap-1.5 py-1.5 px-3 rounded-lg border cursor-pointer text-xs font-semibold select-none transition-all shadow-sm
          ${isSelected 
            ? 'border-indigo-200 bg-indigo-50/50 text-indigo-700 hover:bg-indigo-100/50' 
            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-300'}`}
        onClick={() => setIsOpen(isOpen ? null : filter.id)}
      >
        <span>{typeIcon}</span>
        <span>{displayLabel}</span>
        {isSelected ? (
          <span
            className="text-[10px] font-bold ml-1 hover:text-red-500 hover:bg-red-50 p-0.5 rounded"
            onClick={(e) => {
              e.stopPropagation();
              onClear();
              setIsOpen(null);
            }}
          >
            ✕
          </span>
        ) : (
          <span className="text-[10px] text-slate-400">▼</span>
        )}
      </div>

      {isOpen && (
        <div className="absolute left-0 mt-1.5 bg-white border border-slate-200 rounded-xl shadow-xl z-50 p-2 min-w-[200px] max-h-[300px] flex flex-col gap-1.5 overflow-hidden">
          {filter.type?.startsWith('date') ? (
            <div className="p-1.5 flex flex-col gap-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Select Date</span>
              <input
                type="date"
                className="w-full border border-slate-200 rounded-lg py-1.5 px-2.5 text-xs outline-none focus:border-indigo-500 bg-slate-50 focus:bg-white"
                value={value || ''}
                onChange={e => {
                  onChange(e.target.value);
                  setIsOpen(null);
                }}
              />
            </div>
          ) : combinedOptions.length > 0 || loading ? (
            <>
              <input
                type="text"
                placeholder="Search options..."
                className="w-full py-1.5 px-2.5 border border-slate-200 rounded-lg text-xs outline-none bg-slate-50 focus:bg-white focus:border-indigo-500 mb-1"
                value={search}
                onChange={e => setSearch(e.target.value)}
                onClick={e => e.stopPropagation()}
              />
              <div className="overflow-y-auto flex-1 flex flex-col max-h-[200px] gap-0.5 pr-0.5">
                {loading ? (
                  <span className="text-xs text-slate-400 italic p-2">Loading options...</span>
                ) : filteredOptions.length > 0 ? (
                  filteredOptions.map(opt => (
                    <div
                      key={opt}
                      className={`py-1.5 px-2.5 rounded-lg text-xs cursor-pointer hover:bg-indigo-50 hover:text-indigo-600 transition-all font-medium text-slate-700 ${value === opt ? 'bg-indigo-50 text-indigo-600 font-bold' : ''}`}
                      onClick={() => {
                        onChange(opt);
                        setIsOpen(null);
                      }}
                    >
                      {opt}
                    </div>
                  ))
                ) : (
                  <span className="text-xs text-slate-400 italic p-2">No options found</span>
                )}
              </div>
            </>
          ) : (
            <div className="p-1.5 flex flex-col gap-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Enter Filter Value</span>
              <input
                type="text"
                placeholder="Type and press Enter..."
                className="w-full border border-slate-200 rounded-lg py-1.5 px-2.5 text-xs outline-none focus:border-indigo-500 bg-slate-50 focus:bg-white"
                value={value || ''}
                onChange={e => onChange(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    onChange(e.target.value);
                    setIsOpen(null);
                  }
                }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function DashboardCanvas({ activeTab }) {
  const dispatch = useDispatch();
  const cards = useSelector(s => s.builder.config.cards).filter(
    c => activeTab === null ? true : c.tabIndex === activeTab
  );
  const filters = useSelector(s => s.builder.config.filters);
  const metadata = useSelector(s => s.builder.metadata);
  const allCards = useSelector(s => s.builder.config.cards) || [];
  const mappedFilters = filters.filter(f => 
    allCards.some(c => (c.parameterMappings || []).some(m => m.parameter_id === f.id))
  );
  const selectedFilterId = useSelector(s => s.builder.selectedFilterId);
  const selectedFilter = useSelector(s => s.builder.config.filters.find(f => f.id === selectedFilterId));
  const [editingCard, setEditingCard] = useState(null);

  const previewMode = useSelector(s => s.builder.previewMode);
  const previewFilterValues = useSelector(s => s.builder.previewFilterValues) || {};
  const [activeDropdownFilterId, setActiveDropdownFilterId] = useState(null);

  const isReadOnly = previewMode || !!selectedFilterId;
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
    <div className="flex-1 bg-slate-100 p-5 overflow-y-auto min-h-[600px] flex flex-col" onDragOver={e => e.preventDefault()}>
      {previewMode && mappedFilters.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-5 p-4 bg-white border border-slate-200 rounded-2xl shadow-sm items-center shrink-0">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mr-2">Filters:</span>
          {mappedFilters.map(f => (
            <FilterPill
              key={f.id}
              filter={f}
              value={previewFilterValues[f.id]}
              onChange={val => dispatch(actions.setPreviewFilterValue({ filterId: f.id, value: val }))}
              onClear={() => dispatch(actions.clearPreviewFilterValue(f.id))}
              isOpen={activeDropdownFilterId === f.id}
              setIsOpen={id => setActiveDropdownFilterId(id)}
              allFilters={filters}
              previewFilterValues={previewFilterValues}
              metadata={metadata}
            />
          ))}
        </div>
      )}

      {cards.length === 0 && (
        <div className="flex items-center justify-center h-[250px] text-slate-400 text-sm font-medium border-2 border-dashed border-slate-300 rounded-xl m-5">
          <p>{previewMode ? 'This dashboard has no cards yet.' : 'Drag cards from the left panel or click a card type to add'}</p>
        </div>
      )}

      <ReactGridLayout
        className="layout"
        layout={layout}
        cols={24}
        rowHeight={60}
        onLayoutChange={onLayoutChange}
        isDroppable={!isReadOnly}
        isDraggable={!isReadOnly}
        isResizable={!isReadOnly}
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
      </ReactGridLayout>

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
