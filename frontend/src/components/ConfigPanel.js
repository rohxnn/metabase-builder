import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { actions } from '../store';
import { getFieldValues } from '../services/api';

const findMetadataField = (metadata, tableName, fieldName) => {
  const table = metadata?.tables?.find(t => t.name === tableName || t.display_name === tableName);
  const field = table?.fields?.find(f => f.name === fieldName || f.display_name === fieldName);
  return {
    tableId: table?.id || null,
    fieldId: field?.id || null,
    dbId: metadata?.id || 3,
  };
};

const parseUIWhereCondition = (cond = '') => {
  const tagMatch = cond.match(/^\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}$/);
  if (tagMatch) {
    return {
      type: 'variable',
      label: `{{${tagMatch[1]}}}`,
      value: cond,
      lhs: '',
      op: '',
    };
  }

  const operators = ['!=', '<>', '=', ' in ', ' IN ', ' like ', ' LIKE ', ' is not ', ' IS NOT ', ' is ', ' IS '];
  for (const op of operators) {
    const idx = cond.indexOf(op);
    if (idx !== -1) {
      const lhs = cond.slice(0, idx).trim();
      const rhs = cond.slice(idx + op.length).trim();
      return {
        type: 'operator',
        label: lhs + ' ' + op.trim(),
        value: rhs,
        lhs: lhs,
        op: op,
      };
    }
  }

  return {
    type: 'raw',
    label: cond.length > 20 ? cond.slice(0, 17) + '...' : cond || 'Condition',
    value: cond,
    lhs: '',
    op: '',
  };
};

const TYPE_OPTIONS = [
  { value: 'string/=', label: 'Text (Exact Match)', icon: '📝' },
  { value: 'string/contains', label: 'Text (Contains)', icon: '📝' },
  { value: 'number/=', label: 'Number', icon: '🔢' },
  { value: 'date/range', label: 'Date Range', icon: '📅' },
  { value: 'date/all-options', label: 'Date (All Options)', icon: '📅' },
  { value: 'date/single', label: 'Specific Date', icon: '📅' },
  { value: 'date/relative', label: 'Relative Date', icon: '📅' },
  { value: 'date/month-year', label: 'Month & Year', icon: '📅' },
  { value: 'date/quarter-year', label: 'Quarter & Year', icon: '📅' },
];

const PARAMETER_TYPES = [
  { value: 'date', label: 'Date picker' },
  { value: 'time_grouping', label: 'Time grouping' },
  { value: 'location', label: 'Location' },
  { value: 'string', label: 'Text or Category' },
  { value: 'number', label: 'Number' },
  { value: 'boolean', label: 'Boolean' },
  { value: 'id', label: 'ID' },
];

const OPERATORS_BY_TYPE = {
  string: [
    { value: '=', label: 'Is' },
    { value: '!=', label: 'Is not' },
    { value: 'contains', label: 'Contains' },
    { value: 'does_not_contain', label: 'Does not contain' },
    { value: 'starts_with', label: 'Starts with' },
    { value: 'ends_with', label: 'Ends with' },
  ],
  number: [
    { value: '=', label: 'Is' },
    { value: '!=', label: 'Is not' },
    { value: '>', label: 'Greater than' },
    { value: '<', label: 'Less than' },
    { value: '>=', label: 'Greater than or equal to' },
    { value: '<=', label: 'Less than or equal to' },
  ],
  date: [
    { value: 'range', label: 'Date Range' },
    { value: 'all-options', label: 'Date (All Options)' },
    { value: 'single', label: 'Specific Date' },
    { value: 'relative', label: 'Relative Date' },
    { value: 'month-year', label: 'Month & Year' },
    { value: 'quarter-year', label: 'Quarter & Year' },
  ],
  default: [
    { value: '=', label: 'Is' }
  ]
};

const getFilterTypeColor = (type = '') => {
  if (type.startsWith('date')) return '#f97316';
  if (type.startsWith('number')) return '#10b981';
  return '#3b82f6';
};

const LinkIcon = ({ color }) => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ display: 'inline-flex', alignItems: 'center' }}
  >
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  </svg>
);

const GridIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ color: '#475569', display: 'inline-flex', alignItems: 'center' }}
  >
    <rect x="3" y="3" width="7" height="7" />
    <rect x="14" y="3" width="7" height="7" />
    <rect x="14" y="14" width="7" height="7" />
    <rect x="3" y="14" width="7" height="7" />
  </svg>
);

const GearIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ color: '#475569', display: 'inline-flex', alignItems: 'center' }}
  >
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

const getFilterTypeIcon = (filter) => {
  if (filter.fieldId) return '🔗';
  const type = filter.type || '';
  if (type.startsWith('date')) return '📅';
  if (type.startsWith('number')) return '🔢';
  return '📝';
};

const getTypeLabel = (value) => {
  const opt = TYPE_OPTIONS.find(o => o.value === value);
  return opt ? opt.label : value;
};

export default function ConfigPanel() {
  const dispatch = useDispatch();
  const { collection, dashboard, filters, groups, whereConditions, cards } = useSelector(s => s.builder.config);
  const metadata = useSelector(s => s.builder.metadata);

  // Selected filter state (from Redux)
  const selectedFilterId = useSelector(s => s.builder.selectedFilterId);
  const setSelectedFilterId = (id) => dispatch(actions.setSelectedFilterId(id));
  const selectedFilter = filters?.find(filter => filter.id === selectedFilterId) || null;
  const [filterSearchQuery, setFilterSearchQuery] = useState('');

  // Modal states for selectable values edit popup
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [valueSource, setValueSource] = useState('custom');
  const [textareaValues, setTextareaValues] = useState('');
  const [modalTable, setModalTable] = useState('');
  const [modalField, setModalField] = useState('');

  // Drag and drop filter reordering states & handlers
  const [draggedOverIndex, setDraggedOverIndex] = useState(null);

  const handleDragStart = (e, index) => {
    e.dataTransfer.setData('text/plain', String(index));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDrop = (e, targetIndex) => {
    e.preventDefault();
    const draggedIndexStr = e.dataTransfer.getData('text/plain');
    if (draggedIndexStr === '') return;
    const draggedIndex = parseInt(draggedIndexStr, 10);
    if (draggedIndex === targetIndex) return;

    const reordered = [...filters];
    const [removed] = reordered.splice(draggedIndex, 1);
    reordered.splice(targetIndex, 0, removed);

    dispatch(actions.updateFilters(reordered));
  };

  // Custom filter form states
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customName, setCustomName] = useState('');
  const [selectedTable, setSelectedTable] = useState('');
  const [selectedField, setSelectedField] = useState('');
  const [customType, setCustomType] = useState('string/=');
  const [isFieldFilter, setIsFieldFilter] = useState(true);
  const [fieldValuesCache, setFieldValuesCache] = useState({});
  const [loadingFieldValues, setLoadingFieldValues] = useState(null);

  const activeTableObj = metadata?.tables?.find(
    t => t.name === selectedTable || String(t.id) === selectedTable
  );

  const loadFieldValues = async (filter) => {
    if (!filter.fieldId) return;
    setLoadingFieldValues(filter.id);
    try {
      const data = await getFieldValues(filter.fieldId);
      const values = data.values || [];
      setFieldValuesCache(prev => ({ ...prev, [filter.fieldId]: values }));
      // Auto-populate static options if dropdown and empty
      if (filter.values_source_type === 'static-list') {
        const currentValues = filter.values_source_config?.values || [];
        const merged = [...new Set([...currentValues, ...values.map(String)])];
        dispatch(actions.updateFilter({
          id: filter.id,
          values_source_config: { ...filter.values_source_config, values: merged }
        }));
      }
    } catch (e) {
      console.error('Failed to load field values:', e);
    } finally {
      setLoadingFieldValues(null);
    }
  };

  // Auto-fetch database field values when a filter is selected or updated
  useEffect(() => {
    if (selectedFilter && selectedFilter.fieldId) {
      const fieldId = selectedFilter.fieldId;
      if (!fieldValuesCache[fieldId]) {
        loadFieldValues(selectedFilter);
      }
    }
  }, [selectedFilterId, selectedFilter?.fieldId]);

  // Scroll to selected filter on selection change
  useEffect(() => {
    if (selectedFilterId) {
      const timer = setTimeout(() => {
        const el = document.getElementById(`filter-item-${selectedFilterId}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [selectedFilterId]);

  const handleDisconnectAll = () => {
    if (!selectedFilterId) return;
    if (window.confirm('Are you sure you want to disconnect this filter from all cards?')) {
      const activeCards = cards || [];
      activeCards.forEach(card => {
        const hasMapping = (card.parameterMappings || []).some(m => m.parameter_id === selectedFilterId);
        if (hasMapping) {
          const newMappings = (card.parameterMappings || []).filter(m => m.parameter_id !== selectedFilterId);
          dispatch(actions.updateCard({ id: card.id, parameterMappings: newMappings }));
        }
      });
    }
  };

  const handleSaveModalValues = () => {
    if (!selectedFilterId) return;
    const f = filters.find(filter => filter.id === selectedFilterId);
    if (!f) return;

    if (valueSource === 'custom') {
      const parsedValues = textareaValues
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean);
      dispatch(actions.updateFilter({
        ...f,
        values_source_type: 'static-list',
        values_source_config: { values: parsedValues },
        tableName: null,
        fieldName: null,
        fieldId: null,
        databaseId: null
      }));
    } else if (valueSource === 'connected') {
      const fieldMeta = findMetadataField(metadata, modalTable, modalField);
      dispatch(actions.updateFilter({
        ...f,
        values_source_type: 'static-list', // connected fields still act as dropdown
        tableName: modalTable,
        fieldName: modalField,
        fieldId: fieldMeta.fieldId,
        databaseId: fieldMeta.dbId,
        values_source_config: null
      }));
    }
    setIsEditModalOpen(false);
  };



  const handleAddPredefined = (typeKey) => {
    if (!typeKey) return;
    setSelectedFilterId(null);
    setIsEditModalOpen(false);
    let name = '';
    let slug = '';
    let tableName = '';
    let fieldName = '';
    let type = 'string/=';

    if (typeKey === 'leader_category') {
      name = 'Leader Category';
      slug = 'leader_category';
      tableName = 'leader_category';
      fieldName = 'name';
    } else if (typeKey === 'program') {
      name = 'Program';
      slug = 'program';
      tableName = 'programs';
      fieldName = 'name';
    } else if (typeKey === 'state') {
      name = 'State';
      slug = 'state';
      tableName = 'submissions';
      fieldName = 'state';
    } else if (typeKey === 'district') {
      name = 'District';
      slug = 'district';
      tableName = 'submissions';
      fieldName = 'district';
    } else if (typeKey === 'date') {
      name = 'Date';
      slug = 'date';
      tableName = 'submissions';
      fieldName = 'created_at';
      type = 'date/range';
    }

    const resolved = findMetadataField(metadata, tableName, fieldName);

    dispatch(actions.addFilter({
      name,
      slug,
      type,
      databaseId: resolved.dbId,
      tableName,
      fieldName,
      fieldId: resolved.fieldId,
    }));

    // Auto-prefill where condition
    const condText = `{{${slug}}}`;
    if (!(whereConditions || []).includes(condText)) {
      dispatch(actions.addWhereCondition(condText));
    }
  };

  const handleOpenCustomFilterForm = () => {
    setSelectedFilterId(null);
    setIsEditModalOpen(false);
    setShowCustomForm(true);
    setIsFieldFilter(true);
  };

  const handleAddCustomFilter = () => {
    if (!customName) return;
    const slug = customName.toLowerCase().replace(/\s+/g, '_');

    if (isFieldFilter) {
      if (!selectedTable || !selectedField) return;
      const tableObj = metadata?.tables?.find(t => String(t.id) === selectedTable || t.name === selectedTable);
      const fieldObj = tableObj?.fields?.find(f => String(f.id) === selectedField || f.name === selectedField);

      if (tableObj && fieldObj) {
        dispatch(actions.addFilter({
          name: customName,
          slug,
          type: customType,
          databaseId: metadata?.id || 3,
          tableName: tableObj.name,
          fieldName: fieldObj.name,
          fieldId: fieldObj.id,
        }));

        const condText = `{{${slug}}}`;
        if (slug !== 'reporting_period' && !(whereConditions || []).includes(condText)) {
          dispatch(actions.addWhereCondition(condText));
        }
      }
    } else {
      dispatch(actions.addFilter({
        name: customName,
        slug,
        type: customType,
        databaseId: null,
        tableName: null,
        fieldName: null,
        fieldId: null,
      }));

      const condText = `{{${slug}}}`;
      if (slug !== 'reporting_period' && !(whereConditions || []).includes(condText)) {
        dispatch(actions.addWhereCondition(condText));
      }
    }

    // Reset form
    setCustomName('');
    setSelectedTable('');
    setSelectedField('');
    setIsFieldFilter(true);
    setShowCustomForm(false);
  };

  return (
    <div className="w-[320px] bg-slate-50 border-l border-slate-200 p-5 overflow-y-auto shrink-0 box-border flex flex-col gap-6">
      {/* 2. Global WHERE Conditions Section */}
      <Section title="🔍 Global WHERE Conditions">
        <span className="text-[11px] text-slate-500 block mb-2.5 italic">Injected dynamically into all metrics.</span>
        {(whereConditions || []).map((cond, index) => {
          const parsed = parseUIWhereCondition(cond);

          const handleChange = (newVal) => {
            if (parsed.type === 'operator') {
              const updated = parsed.lhs + parsed.op + newVal;
              dispatch(actions.updateWhereCondition({ index, value: updated }));
            } else {
              dispatch(actions.updateWhereCondition({ index, value: newVal }));
            }
          };

          return (
            <div key={index} className="flex flex-col gap-1 mb-2 bg-white border border-slate-200 rounded-lg p-2.5 shadow-sm w-full box-border">
              {parsed.type === 'operator' ? (
                <div className="w-full">
                  <div className="text-[11px] font-semibold text-slate-700 font-mono block bg-slate-100 py-1.5 px-2.5 rounded-lg border border-slate-200 break-all whitespace-normal w-full box-border leading-relaxed">
                    {parsed.label}
                  </div>
                  <div className="flex items-center gap-1.5 mt-2">
                    <input
                      className="flex-1 bg-white border border-slate-200 rounded-lg py-1.5 px-2.5 text-xs text-slate-700 placeholder:text-slate-400 outline-none transition-all focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:shadow-sm shadow-sm"
                      value={parsed.value}
                      placeholder="value..."
                      onChange={e => handleChange(e.target.value)}
                    />
                    <button className="bg-transparent border-none cursor-pointer text-slate-400 text-xs transition-colors hover:text-red-500 shrink-0 p-1" onClick={() => dispatch(actions.removeWhereCondition(index))}>✕</button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 w-full">
                  <input
                    className="flex-1 bg-white border border-slate-200 rounded-lg py-1.5 px-2.5 text-xs text-slate-700 placeholder:text-slate-400 outline-none transition-all focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:shadow-sm shadow-sm"
                    value={cond}
                    placeholder="e.g. {{state}} or state = 'Karnataka'"
                    onChange={e => handleChange(e.target.value)}
                  />
                  <button className="bg-transparent border-none cursor-pointer text-slate-400 text-xs transition-colors hover:text-red-500 shrink-0 p-1" onClick={() => dispatch(actions.removeWhereCondition(index))}>✕</button>
                </div>
              )}
            </div>
          );
        })}
        <button
          className="w-full py-2 px-4 bg-indigo-600 text-white border-none rounded-lg cursor-pointer font-bold text-xs transition-all hover:bg-indigo-700 mt-2"
          onClick={() => dispatch(actions.addWhereCondition(''))}
        >
          + Add WHERE Condition
        </button>
      </Section>

      {/* 3. Filters Section */}
      <div className="mb-6 border-b border-slate-200 pb-4">
        {/* Section Header Card */}
        {/* Section Header Card */}
        <div className="flex items-center justify-between py-3 px-4 bg-slate-100 rounded-xl mb-3 select-none">
          <div className="flex items-center gap-2.5">
            <GridIcon />
            <span className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">DASHBOARD FILTERS</span>
          </div>
          {selectedFilterId && (
            <button
              onClick={() => setSelectedFilterId(null)}
              className="py-1 px-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg border-none cursor-pointer font-bold text-[10px] shadow-sm transition-all"
            >
              Show Metrices
            </button>
          )}
        </div>

        {filters.length > 0 ? (
          <div className="flex flex-col mt-3">
            {filters.map((f, idx) => {
              const isSelected = f.id === selectedFilterId;
              const typeColor = getFilterTypeColor(f.type);
              const isDraggedOver = draggedOverIndex === idx;

              const combinedType = f.type || 'string/=';
              const parts = combinedType.split('/');
              const baseType = parts[0] || 'string';
              const operator = parts[1] || '=';

              const dropdownOptions = [...new Set([
                ...(f.values_source_config?.values || []),
                ...(f.fieldId ? (fieldValuesCache[f.fieldId] || []) : [])
              ])].map(String);
              const isLoadingValues = loadingFieldValues === f.id;

              return (
                <div key={f.id} id={`filter-item-${f.id}`} className="mb-3 flex flex-col">
                  {/* Filter Pill */}
                  <div
                    className={`bg-white border-[1.5px] rounded-xl py-3 px-4 flex items-center justify-between cursor-pointer transition-all hover:border-slate-300 hover:-translate-y-0.5 hover:shadow-sm select-none ${
                      isSelected ? 'shadow-sm' : 'border-slate-200'
                    }`}
                    onClick={() => isSelected ? setSelectedFilterId(null) : setSelectedFilterId(f.id)}
                    draggable
                    onDragStart={e => handleDragStart(e, idx)}
                    onDragEnter={() => setDraggedOverIndex(idx)}
                    onDragLeave={() => setDraggedOverIndex(null)}
                    onDragEnd={() => setDraggedOverIndex(null)}
                    onDragOver={e => e.preventDefault()}
                    onDrop={e => {
                      handleDrop(e, idx);
                      setDraggedOverIndex(null);
                    }}
                    style={{
                      borderColor: isSelected ? typeColor : undefined,
                      color: isSelected ? typeColor : undefined,
                      opacity: isDraggedOver ? 0.5 : 1,
                      transform: isDraggedOver ? 'scale(0.97)' : 'none',
                      borderStyle: isDraggedOver ? 'dashed' : 'solid',
                    }}
                  >
                    <div className="flex items-center gap-2.5">
                      <LinkIcon color={isSelected ? typeColor : '#60a5fa'} />
                      <span className="text-xs font-semibold">
                        {f.name || f.slug}
                      </span>
                    </div>
                    <button
                      className="bg-transparent border-none cursor-pointer text-slate-300 text-xs p-1 rounded flex items-center justify-center transition-all hover:text-red-500 hover:bg-red-50"
                      onClick={(e) => {
                        e.stopPropagation();
                        dispatch(actions.removeFilter(f.id));
                      }}
                    >
                      ✕
                    </button>
                  </div>

                  {/* Inline Dropdown Editor */}
                  {isSelected && (
                    <div className="mt-2 ml-1.5 pl-3.5 border-l-2 border-indigo-500 bg-slate-50/30 rounded-r-xl p-3 flex flex-col gap-3.5 border-y border-r border-slate-200 shadow-inner">
                      {/* SECTION 1: FILTER IDENTITY */}
                      <div className="bg-white rounded-xl p-3.5 border border-slate-200/80 shadow-sm flex flex-col gap-3">
                        <div className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">FILTER IDENTITY</div>
                        
                        <div className="flex flex-col gap-1">
                          <label className="text-[11px] font-bold text-slate-600">Name</label>
                          <input
                            className="w-full py-2 px-2.5 border border-slate-300 rounded-lg text-xs outline-none bg-white focus:border-slate-400"
                            value={f.name || ''}
                            onChange={e => dispatch(actions.updateFilter({ ...f, name: e.target.value }))}
                          />
                        </div>

                        <div className="flex flex-col gap-1">
                          <label className="text-[11px] font-bold text-slate-600">Slug</label>
                          <div className="flex items-center border border-slate-300 rounded-lg overflow-hidden bg-white focus-within:border-slate-400">
                            <span className="py-2 px-3 bg-slate-100 text-slate-500 border-r border-slate-300 text-xs font-semibold flex items-center justify-center">#</span>
                            <input
                              className="flex-1 border-none py-2 px-2.5 text-xs outline-none bg-transparent w-full box-border"
                              value={f.slug || ''}
                              onChange={e => dispatch(actions.updateFilter({ ...f, slug: e.target.value }))}
                            />
                          </div>
                        </div>

                        <div className="flex flex-col gap-1">
                          <label className="text-[11px] font-bold text-slate-600">Filter or parameter type</label>
                          <select
                            className="w-full py-2 px-2.5 border border-slate-300 rounded-lg text-xs outline-none bg-white focus:border-indigo-500 font-semibold text-slate-700"
                            value={baseType}
                            onChange={e => {
                              const nextBase = e.target.value;
                              let nextOp = '=';
                              if (nextBase === 'date') nextOp = 'range';
                              dispatch(actions.updateFilter({
                                ...f,
                                type: `${nextBase}/${nextOp}`,
                                sectionId: nextBase
                              }));
                            }}
                          >
                            {PARAMETER_TYPES.map(opt => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                        </div>

                        {(baseType === 'string' || baseType === 'number' || baseType === 'date') && (
                          <div className="flex flex-col gap-1">
                            <label className="text-[11px] font-bold text-slate-600">Filter operator</label>
                            <select
                              className="w-full py-2 px-2.5 border border-slate-300 rounded-lg text-xs outline-none bg-white focus:border-indigo-500 font-semibold text-slate-700"
                              value={operator}
                              onChange={e => {
                                const nextOp = e.target.value;
                                dispatch(actions.updateFilter({
                                  ...f,
                                  type: `${baseType}/${nextOp}`
                                }));
                              }}
                            >
                              {(OPERATORS_BY_TYPE[baseType] || OPERATORS_BY_TYPE.default).map(opt => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                              ))}
                            </select>
                          </div>
                        )}

                        <div className="flex flex-col gap-2 mt-1">
                          <label className="text-[11px] font-bold text-slate-600">How should people filter on this column?</label>
                          <div className="flex flex-col gap-2.5 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                            <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-700 font-semibold">
                              <input
                                type="radio"
                                name={`widgetType-${f.id}`}
                                value="dropdown"
                                checked={f.values_source_type === 'static-list'}
                                onChange={() => {
                                  dispatch(actions.updateFilter({
                                    ...f,
                                    values_source_type: 'static-list',
                                    values_source_config: f.values_source_config || { values: [] },
                                    default: null
                                  }));
                                }}
                              />
                              <span>Dropdown list</span>
                              {f.values_source_type === 'static-list' && (
                                <span
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setValueSource(f.tableName && f.fieldName ? 'connected' : 'custom');
                                    setTextareaValues((f.values_source_config?.values || []).join('\n'));
                                    setModalTable(f.tableName || '');
                                    setModalField(f.fieldName || '');
                                    setIsEditModalOpen(true);
                                  }}
                                  className="text-xs text-sky-600 font-bold hover:text-sky-700 cursor-pointer ml-auto hover:underline"
                                >
                                  Edit
                                </span>
                              )}
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-700 font-semibold">
                              <input
                                type="radio"
                                name={`widgetType-${f.id}`}
                                value="search"
                                checked={f.values_source_type === 'search'}
                                onChange={() => {
                                  dispatch(actions.updateFilter({
                                    ...f,
                                    values_source_type: 'search',
                                    values_source_config: null,
                                    default: null
                                  }));
                                }}
                              />
                              <span>Search box</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-700 font-semibold">
                              <input
                                type="radio"
                                name={`widgetType-${f.id}`}
                                value="input"
                                checked={!f.values_source_type || f.values_source_type === 'input'}
                                onChange={() => {
                                  dispatch(actions.updateFilter({
                                    ...f,
                                    values_source_type: null,
                                    values_source_config: null,
                                    default: null
                                  }));
                                }}
                              />
                              <span>Input box</span>
                            </label>
                          </div>
                        </div>

                        <div className="flex flex-col gap-2 mt-1">
                          <label className="text-[11px] font-bold text-slate-600">People can pick</label>
                          <div className="flex flex-col gap-2 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                            <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-700 font-semibold">
                              <input
                                type="radio"
                                name={`isMultiSelect-${f.id}`}
                                value="true"
                                checked={f.isMultiSelect !== false}
                                onChange={() => {
                                  dispatch(actions.updateFilter({
                                    ...f,
                                    isMultiSelect: true
                                  }));
                                }}
                              />
                              <span>Multiple values</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-700 font-semibold">
                              <input
                                type="radio"
                                name={`isMultiSelect-${f.id}`}
                                value="false"
                                checked={f.isMultiSelect === false}
                                onChange={() => {
                                  dispatch(actions.updateFilter({
                                    ...f,
                                    isMultiSelect: false
                                  }));
                                }}
                              />
                              <span>A single value</span>
                            </label>
                          </div>
                        </div>

                        <div className="flex flex-col gap-1">
                          <div className="flex justify-between items-center">
                            <label className="text-[11px] font-bold text-slate-600">Default Value</label>
                            {isLoadingValues && (
                              <span className="text-[10px] text-indigo-500 font-semibold animate-pulse">Loading options...</span>
                            )}
                          </div>
                          {f.values_source_type === 'static-list' || f.fieldId ? (
                            <select
                              className="w-full py-2 px-2.5 border border-slate-300 rounded-lg text-xs outline-none bg-white focus:border-indigo-500 font-semibold text-slate-700"
                              value={Array.isArray(f.default) ? (f.default[0] || '') : (f.default || '')}
                              onChange={e => dispatch(actions.updateFilter({ ...f, default: e.target.value || null }))}
                            >
                              <option value="">-- No Default Value --</option>
                              {dropdownOptions.map(val => (
                                <option key={val} value={val}>{val}</option>
                              ))}
                            </select>
                          ) : (
                            <input
                              className="w-full py-2 px-2.5 border border-slate-300 rounded-lg text-xs outline-none bg-white focus:border-indigo-500"
                              value={Array.isArray(f.default) ? (f.default[0] || '') : (f.default || '')}
                              placeholder="e.g. Karnataka or 2026-06-17"
                              onChange={e => dispatch(actions.updateFilter({ ...f, default: e.target.value || null }))}
                            />
                          )}
                        </div>

                        <div className="flex items-center justify-between border-t border-slate-100 pt-3">
                          <div className="flex flex-col gap-0.5">
                            <span className="text-xs font-bold text-slate-700">Always require a value</span>
                            <span className="text-[10px] text-slate-400 max-w-[170px] leading-normal font-medium">
                              When enabled, people can change the value or reset it, but can't clear it entirely.
                            </span>
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              className="sr-only peer"
                              checked={f.required || false}
                              onChange={e => dispatch(actions.updateFilter({ ...f, required: e.target.checked }))}
                            />
                            <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                          </label>
                        </div>

                        <div className="flex flex-col gap-2 border-t border-slate-100 pt-3.5 mt-1">
                          <button
                            onClick={() => setSelectedFilterId(null)}
                            className="w-full py-2 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl cursor-pointer font-bold text-xs shadow-md transition-all text-center flex items-center justify-center gap-1.5"
                          >
                            ✓ Done (Show Metrices)
                          </button>
                          <button
                            onClick={() => alert('Drag filter pills at the top to reorder their sequence.')}
                            className="w-full py-2 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-xl cursor-pointer font-bold text-xs transition-all text-center flex items-center justify-center gap-1.5"
                          >
                            Move filter
                          </button>
                          <button
                            onClick={handleDisconnectAll}
                            className="w-full py-2 px-4 bg-white text-red-600 border border-red-200 hover:border-red-300 hover:bg-red-50/20 rounded-xl cursor-pointer font-bold text-xs transition-all text-center flex items-center justify-center gap-1.5"
                          >
                            Disconnect from cards
                          </button>
                        </div>
                      </div>

                      {/* SECTION 2: LIMIT CHOICES BY */}
                      <div className="bg-white rounded-xl p-3.5 border border-slate-200/80 shadow-sm flex flex-col gap-3">
                        <div className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">LIMIT CHOICES BY</div>
                        
                        {/* Search other filters */}
                        <div className="flex items-center border border-slate-300 rounded-lg py-0.5 px-2 bg-white focus-within:border-slate-400">
                          <span className="text-slate-400 mr-1.5 text-xs">🔍</span>
                          <input
                            className="flex-1 border-none outline-none py-1 text-xs bg-transparent"
                            placeholder="Search other filters..."
                            value={filterSearchQuery}
                            onChange={e => setFilterSearchQuery(e.target.value)}
                          />
                        </div>

                        <div className="flex flex-wrap gap-2">
                          {filters
                            .filter(other => other.id !== f.id)
                            .filter(other => {
                              if (!filterSearchQuery) return true;
                              const name = (other.name || other.slug || '').toLowerCase();
                              return name.includes(filterSearchQuery.toLowerCase());
                            })
                            .map(other => {
                              const isChecked = (f.filteringParameters || []).includes(other.id);
                              return (
                                <div
                                  key={other.id}
                                  onClick={() => {
                                    const current = f.filteringParameters || [];
                                    const updated = isChecked
                                      ? current.filter(id => id !== other.id)
                                      : [...current, other.id];
                                    dispatch(actions.updateFilter({ ...f, filteringParameters: updated }));
                                  }}
                                  className={`inline-flex items-center gap-1.5 py-1 px-2.5 rounded-full text-[10px] font-semibold cursor-pointer border transition-all ${
                                      isChecked
                                        ? 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100'
                                        : 'border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100'
                                  }`}
                                >
                                  <span>{other.name || other.slug}</span>
                                  <span className="text-[9px] font-bold ml-0.5">{isChecked ? '✕' : '+'}</span>
                                </div>
                              );
                            })}
                          {filters.filter(other => other.id !== f.id).length === 0 && (
                            <span className="text-xs text-slate-400 italic">No other filters to link</span>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-xs text-slate-400 italic mb-3 text-center py-3">
            No filters added yet
          </div>
        )}

        {/* Predefined Add Filter Dropdown & Custom forms */}
        <div className="mt-4 flex flex-col gap-2.5">
          {!showCustomForm && (
            <button
              onClick={handleOpenCustomFilterForm}
              className="w-full p-3 bg-blue-500 text-white border-none rounded-xl cursor-pointer font-bold text-xs transition-all hover:bg-blue-600 hover:shadow-md text-center flex items-center justify-center gap-1.5"
            >
              + Add Filter
            </button>
          )}

          {filters.length > 0 && (
            <button
              onClick={() => {
                if (window.confirm('Are you sure you want to clear all filters?')) {
                  dispatch(actions.updateFilters([]));
                  setSelectedFilterId(null);
                }
              }}
              className="bg-transparent border-none text-slate-400 hover:text-slate-600 cursor-pointer text-[11px] font-bold py-1 text-center w-full outline-none transition-all block mt-3 hover:underline"
            >
              Clear All Filters
            </button>
          )}

          {/* Quick Add Predefined Filter */}
          <div className="mt-2">
            <span className="block text-[10px] font-extrabold text-slate-400 uppercase mb-1 tracking-wider">+ Quick Add (Predefined)</span>
            <select 
              className="w-full py-2 px-2.5 border border-slate-300 rounded-lg text-xs outline-none bg-white mb-2" 
              value="" 
              onChange={e => { handleAddPredefined(e.target.value); e.target.value = ''; }}
            >
              <option value="">-- Choose Predefined Filter --</option>
              <option value="leader_category">Leader Category (leader_category.name)</option>
              <option value="program">Program (programs.name)</option>
              <option value="state">State (submissions.state)</option>
              <option value="district">District (submissions.district)</option>
              <option value="date">Date (submissions.created_at)</option>
            </select>
          </div>

          {/* Custom Filter Form */}
          {showCustomForm && (
            <div className="border border-slate-300 rounded-xl p-4 mt-2.5 bg-white shadow-md">
              <span className="text-xs font-bold block mb-2.5 text-slate-800">
                ✨ Add Custom Filter
              </span>
              <Field label="Filter Name">
                <input 
                  className="w-full py-2 px-2.5 border border-slate-300 rounded-lg text-xs outline-none bg-white focus:border-slate-400" 
                  value={customName} 
                  placeholder="e.g. Organization" 
                  onChange={e => setCustomName(e.target.value)} 
                />
              </Field>

              <label className="flex items-center gap-2 text-xs text-slate-600 mt-2.5 mb-3 font-medium cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={isFieldFilter} 
                  onChange={e => setIsFieldFilter(e.target.checked)} 
                />
                <span>Map to Database Field</span>
                <span className="text-[10px] text-slate-400 font-normal">(Field Filter)</span>
              </label>

              {isFieldFilter && (
                <>
                  <Field label="Table">
                    <select 
                      className="w-full py-2 px-2.5 border border-slate-300 rounded-lg text-xs outline-none bg-white focus:border-slate-400" 
                      value={selectedTable} 
                      onChange={e => { setSelectedTable(e.target.value); setSelectedField(''); }}
                    >
                      <option value="">-- Select Table --</option>
                      {metadata?.tables?.map(t => (
                        <option key={t.id} value={t.name}>{t.display_name || t.name}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Field">
                    <select 
                      className="w-full py-2 px-2.5 border border-slate-300 rounded-lg text-xs outline-none bg-white focus:border-slate-400" 
                      value={selectedField} 
                      disabled={!selectedTable} 
                      onChange={e => setSelectedField(e.target.value)}
                    >
                      <option value="">-- Select Field --</option>
                      {activeTableObj?.fields?.map(f => (
                        <option key={f.id} value={f.name}>{f.display_name || f.name}</option>
                      ))}
                    </select>
                  </Field>
                </>
              )}

              {(() => {
                const customParts = customType.split('/');
                const customBaseType = customParts[0] || 'string';
                const customOperator = customParts[1] || '=';
                return (
                  <>
                    <Field label="Filter or parameter type">
                      <select
                        className="w-full py-2 px-2.5 border border-slate-300 rounded-lg text-xs outline-none bg-white focus:border-indigo-500 font-semibold text-slate-700"
                        value={customBaseType}
                        onChange={e => {
                          const nextBase = e.target.value;
                          let nextOp = '=';
                          if (nextBase === 'date') nextOp = 'range';
                          setCustomType(`${nextBase}/${nextOp}`);
                        }}
                      >
                        {PARAMETER_TYPES.map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </Field>

                    {(customBaseType === 'string' || customBaseType === 'number' || customBaseType === 'date') && (
                      <Field label="Filter operator">
                        <select
                          className="w-full py-2 px-2.5 border border-slate-300 rounded-lg text-xs outline-none bg-white focus:border-indigo-500 font-semibold text-slate-700"
                          value={customOperator}
                          onChange={e => {
                            const nextOp = e.target.value;
                            setCustomType(`${customBaseType}/${nextOp}`);
                          }}
                        >
                          {(OPERATORS_BY_TYPE[customBaseType] || OPERATORS_BY_TYPE.default).map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      </Field>
                    )}
                  </>
                );
              })()}
              <div className="flex gap-1.5 mt-3.5">
                <button 
                  className="py-2 px-4 bg-slate-500 text-white border-none rounded-lg cursor-pointer font-bold text-xs transition-all hover:bg-slate-600 flex-1" 
                  onClick={() => setShowCustomForm(false)}
                >
                  Cancel
                </button>
                <button 
                  className="py-2 px-4 bg-indigo-600 text-white border-none rounded-lg cursor-pointer font-bold text-xs transition-all hover:bg-indigo-700 flex-1 disabled:opacity-50" 
                  onClick={handleAddCustomFilter}
                  disabled={!customName || (isFieldFilter && (!selectedTable || !selectedField))}
                >
                  Add Filter
                </button>
              </div>
            </div>
          )}
        </div>
      </div>



      {/* Selectable values modal */}
      {isEditModalOpen && selectedFilter && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-[680px] max-h-[85vh] overflow-hidden flex flex-col font-sans">
            {/* Header */}
            <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100 shrink-0">
              <span className="text-base font-bold text-slate-800">
                Selectable values for {selectedFilter.name || selectedFilter.slug}
              </span>
              <button
                className="text-slate-400 hover:text-slate-600 bg-transparent border-none cursor-pointer text-xl font-bold p-1 leading-none transition-colors"
                onClick={() => setIsEditModalOpen(false)}
              >
                ✕
              </button>
            </div>

            {/* Body */}
            <div className="p-6 flex flex-1 gap-6 overflow-y-auto min-h-[300px]">
              {/* Left Column: Source Selection */}
              <div className="flex flex-col gap-4 w-[240px] shrink-0 border-r border-slate-100 pr-6">
                <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
                  Where values should come from
                </span>
                <div className="flex flex-col gap-3.5">
                  <label className="flex items-start gap-2.5 cursor-pointer text-xs font-semibold text-slate-700">
                    <input
                      type="radio"
                      name="valueSource"
                      value="connected"
                      checked={valueSource === 'connected'}
                      onChange={() => setValueSource('connected')}
                      className="mt-0.5"
                    />
                    <div className="flex flex-col">
                      <span>From connected fields</span>
                    </div>
                  </label>
                  <label className="flex items-start gap-2.5 cursor-pointer text-xs font-semibold text-slate-700">
                    <input
                      type="radio"
                      name="valueSource"
                      value="model"
                      checked={valueSource === 'model'}
                      onChange={() => setValueSource('model')}
                      className="mt-0.5"
                    />
                    <div className="flex flex-col">
                      <span>From another model or question</span>
                    </div>
                  </label>
                  <label className="flex items-start gap-2.5 cursor-pointer text-xs font-semibold text-slate-700">
                    <input
                      type="radio"
                      name="valueSource"
                      value="custom"
                      checked={valueSource === 'custom'}
                      onChange={() => setValueSource('custom')}
                      className="mt-0.5"
                    />
                    <div className="flex flex-col">
                      <span>Custom list</span>
                    </div>
                  </label>
                </div>
              </div>

              {/* Right Column: Values / Fields Editor */}
              <div className="flex-1 flex flex-col justify-start">
                {valueSource === 'custom' && (
                  <div className="flex flex-col gap-2 h-full flex-1">
                    <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mb-1">
                      Enter Custom values (one per line)
                    </span>
                    <textarea
                      className="w-full flex-1 border border-slate-300 rounded-lg p-3 text-xs outline-none bg-slate-50/50 focus:border-indigo-500 focus:bg-white resize-none font-mono min-h-[180px]"
                      placeholder="e.g. Shiksha Chaupals&#10;SLC Program&#10;Youth Leader Programs"
                      value={textareaValues}
                      onChange={e => setTextareaValues(e.target.value)}
                    />
                    <span className="text-[10px] text-slate-400 leading-normal font-medium">
                      Enter one value per line. You can optionally give each value a display label after a comma.
                    </span>
                  </div>
                )}

                {valueSource === 'connected' && (
                  <div className="flex flex-col gap-4">
                    <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
                      Select Database Field
                    </span>
                    <div className="flex flex-col gap-3">
                      <div className="flex flex-col gap-1">
                        <label className="text-[11px] font-bold text-slate-600">Table</label>
                        <select
                          className="w-full py-2 px-2.5 border border-slate-300 rounded-lg text-xs outline-none bg-white focus:border-indigo-500 font-semibold text-slate-700"
                          value={modalTable}
                          onChange={e => {
                            setModalTable(e.target.value);
                            setModalField('');
                          }}
                        >
                          <option value="">-- Select Table --</option>
                          {metadata?.tables?.map(t => (
                            <option key={t.id} value={t.name}>{t.display_name || t.name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[11px] font-bold text-slate-600">Field</label>
                        <select
                          className="w-full py-2 px-2.5 border border-slate-300 rounded-lg text-xs outline-none bg-white focus:border-indigo-500 font-semibold text-slate-700"
                          value={modalField}
                          disabled={!modalTable}
                          onChange={e => setModalField(e.target.value)}
                        >
                          <option value="">-- Select Field --</option>
                          {metadata?.tables?.find(t => t.name === modalTable)?.fields?.map(fd => (
                            <option key={fd.id} value={fd.name}>{fd.display_name || fd.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                )}

                {valueSource === 'model' && (
                  <div className="flex flex-col gap-2 p-4 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-500 italic">
                    Mapping to other model or question is currently not supported. Please choose "Custom list" or "From connected fields".
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-2.5 px-6 py-4 border-t border-slate-100 bg-slate-50 shrink-0">
              <button
                className="py-2 px-4 bg-slate-100 text-slate-700 border border-slate-300 hover:bg-slate-200 rounded-lg cursor-pointer font-bold text-xs transition-colors"
                onClick={() => setIsEditModalOpen(false)}
              >
                Cancel
              </button>
              <button
                className="py-2 px-5 bg-blue-600 hover:bg-blue-700 text-white border-none rounded-lg cursor-pointer font-bold text-xs shadow-sm transition-colors"
                onClick={handleSaveModalValues}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="mb-6 border-b border-slate-200 pb-4">
      <div className="text-xs font-extrabold text-slate-600 uppercase tracking-wider mb-3.5 bg-slate-100 py-2 px-2.5 rounded-lg border-l-4 border-indigo-600">
        {title}
      </div>
      {children}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="mb-2.5">
      <label className="text-[11px] text-slate-600 block mb-1 font-semibold">{label}</label>
      {children}
    </div>
  );
}
