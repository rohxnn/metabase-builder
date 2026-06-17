import React, { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { runQuery, listDatabases, getDatabaseMetadata } from '../services/api';
import { hasMetabaseFilters, toPreviewSql, injectWhereConditions } from '../services/queryPreview';

const DISPLAY_TYPES = [
  'table', 'bar', 'line', 'pie', 'scalar', 'map', 'area', 'row',
  'gauge', 'progress', 'object', 'combo', 'pivot', 'smartscalar',
  'funnel', 'scatter', 'waterfall'
];

const VISUALISATION_TYPES = [
  // Primary charts
  { type: 'scalar', label: 'Number', icon: '🔢', isPrimary: true },
  { type: 'gauge', label: 'Gauge', icon: '⏲️', isPrimary: true },
  { type: 'progress', label: 'Progress', icon: '📊', isPrimary: true },
  
  // More charts
  { type: 'table', label: 'Table', icon: '📋' },
  { type: 'object', label: 'Detail', icon: '📄' },
  { type: 'bar', label: 'Bar', icon: '📊' },
  { type: 'line', label: 'Line', icon: '📈' },
  { type: 'pie', label: 'Pie', icon: '🥧' },
  { type: 'row', label: 'Row', icon: '↕️' },
  { type: 'area', label: 'Area', icon: '📉' },
  { type: 'combo', label: 'Combo', icon: '📊' },
  { type: 'pivot', label: 'Pivot Table', icon: '📋' },
  { type: 'smartscalar', label: 'Trend', icon: '📈' },
  { type: 'funnel', label: 'Funnel', icon: '⏳' },
  { type: 'map', label: 'Map', icon: '🗺️' },
  { type: 'scatter', label: 'Scatter', icon: '🔵' },
  { type: 'waterfall', label: 'Waterfall', icon: '📶' },
];

const REPORTING_PERIOD_VALUES = ['Weekly', 'Monthly', 'Quarterly', 'Yearly'];

const extractVariables = (query = '') => {
  const names = new Set();
  const re = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;
  let match;
  while ((match = re.exec(query))) names.add(match[1]);
  return [...names];
};

const getVarAccentColor = (tag) => {
  const type = tag?.type || 'text';
  if (type === 'dimension') return '#4c6ef5';
  if (type === 'date') return '#f59e0b';
  if (type === 'number') return '#10b981';
  return '#7c3aed';
};

const getVarTypeLabel = (tag) => {
  const type = tag?.type || 'text';
  if (type === 'dimension') return '🔗 Field Filter';
  if (type === 'date') return '📅 Date';
  if (type === 'number') return '🔢 Number';
  return '📝 Text';
};

export default function CardEditor({ card, filters, onSave, onClose }) {
  const whereConditions = useSelector(s => s.builder.config.whereConditions) || [];
  const [form, setForm] = useState({ ...card });
  const [queryResult, setQueryResult] = useState(null);
  const [queryError, setQueryError] = useState(null);
  const [running, setRunning] = useState(false);
  const [metadata, setMetadata] = useState(null);
  const [loadingMetadata, setLoadingMetadata] = useState(false);
  const [activeTab, setActiveTab] = useState('query');

  // Question-specific filter form states
  const [showQFilterForm, setShowQFilterForm] = useState(false);
  const [qFilterName, setQFilterName] = useState('');
  const [qFilterWidget, setQFilterWidget] = useState('input');

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));
  const hasMetabaseDetails = form.metabaseCardId || form.metabaseDashcardId || form.databaseId || form.display || form.description;

  const variables = extractVariables(form.query || '');
  const reportingPeriodTag = (form.templateTags || {}).reporting_period;
  const reportingPeriodValues = (reportingPeriodTag?.values_source_config?.values || [])
    .map(value => Array.isArray(value) ? value[0] : value);
  const hasReportingPeriodDropdown = reportingPeriodTag?.values_source_type === 'static-list'
    && REPORTING_PERIOD_VALUES.every(value => reportingPeriodValues.includes(value));

  // Load database metadata
  useEffect(() => {
    let active = true;
    const loadMeta = async () => {
      try {
        setLoadingMetadata(true);
        let dbId = form.databaseId;
        if (!dbId) {
          const dbs = await listDatabases();
          const dbList = dbs?.data || dbs || [];
          if (dbList.length > 0) {
            const activeDb = dbList.find(d => d.name === 'test' || d.name === 'mitra5') || dbList[0];
            dbId = activeDb.id;
            setForm(f => ({ ...f, databaseId: dbId }));
          }
        }
        if (dbId && active) {
          const data = await getDatabaseMetadata(dbId);
          if (active) setMetadata(data);
        }
      } catch (e) {
        console.error('Error loading metadata:', e);
      } finally {
        if (active) setLoadingMetadata(false);
      }
    };
    loadMeta();
    return () => { active = false; };
  }, [form.databaseId]);

  // Sync / Initialize template tags
  useEffect(() => {
    let updated = false;
    const existingTags = { ...(form.templateTags || {}) };
    
    variables.forEach(variable => {
      if (!existingTags[variable]) {
        existingTags[variable] = {
          id: variable,
          name: variable,
          'display-name': variable.replace(/_/g, ' '),
          type: 'text',
          required: false,
        };
        updated = true;
      }
    });
    
    if (updated) {
      set('templateTags', existingTags);
    }
  }, [form.query]);

  // Auto-map filters — only for NEW cards that have no existing mappings.
  // Cards imported from Metabase already have correct parameter_mappings
  // (e.g. select_state → state) that we must not overwrite.
  useEffect(() => {
    const existingMappings = form.parameterMappings || [];
    // If card already has mappings (imported or manually set), don't auto-map
    if (existingMappings.length > 0) return;

    let updated = false;
    let newMappings = [];
    
    variables.forEach(variable => {
      // Try exact slug match, then try matching by name
      const matchingFilter = (filters || []).find(f => f.slug === variable)
                          || (filters || []).find(f => f.name?.toLowerCase().replace(/\s+/g, '_') === variable);
      if (matchingFilter) {
        newMappings.push({
          parameter_id: matchingFilter.id,
          target: [matchingFilter.fieldId ? 'dimension' : 'variable', ['template-tag', variable]]
        });
        updated = true;
      }
    });
    
    if (updated) {
      set('parameterMappings', newMappings);
    }
  }, [form.query, filters]);

  const handleTagPropertyChange = (variable, prop, value) => {
    const existingTags = { ...(form.templateTags || {}) };
    const currentTag = existingTags[variable] || {
      id: variable,
      name: variable,
      'display-name': variable.replace(/_/g, ' '),
      type: 'text',
      required: false,
    };

    const updatedTag = { ...currentTag, [prop]: value };

    if (prop === 'type') {
      if (value !== 'dimension') {
        delete updatedTag.dimension;
        delete updatedTag['widget-type'];
      } else {
        updatedTag.dimension = currentTag.dimension || null;
        updatedTag['widget-type'] = currentTag['widget-type'] || 'category';
      }
    }

    set('templateTags', {
      ...existingTags,
      [variable]: updatedTag,
    });
  };

  const handleMapFilter = (variable, filterId) => {
    let newMappings = [...(form.parameterMappings || [])];
    newMappings = newMappings.filter(m => m.target?.[1]?.[1] !== variable);
    
    const oldMapping = (form.parameterMappings || []).find(m => m.target?.[1]?.[1] === variable);
    const oldFilterId = oldMapping ? oldMapping.parameter_id : null;
    let inline = [...(form.inlineParameters || [])];
    if (oldFilterId) {
      inline = inline.filter(id => id !== oldFilterId);
    }
    
    if (filterId) {
      const matchingFilter = (filters || []).find(f => f.id === filterId);
      const isDimension = matchingFilter && matchingFilter.fieldId;
      newMappings.push({
        parameter_id: filterId,
        target: [isDimension ? 'dimension' : 'variable', ['template-tag', variable]]
      });
    }
    set('parameterMappings', newMappings);
    set('inlineParameters', inline);
  };

  const allFields = [];
  if (metadata?.tables) {
    metadata.tables.forEach(table => {
      if (table.fields) {
        table.fields.forEach(field => {
          allFields.push({
            id: field.id,
            name: field.name,
            displayName: field.display_name || field.name,
            tableName: table.display_name || table.name,
            fullLabel: `${table.display_name || table.name} → ${field.display_name || field.name} (${field.name})`,
            baseType: field.base_type,
          });
        });
      }
    });
  }
  allFields.sort((a, b) => a.fullLabel.localeCompare(b.fullLabel));

  const handleRunQuery = async () => {
    if (!form.query.trim()) return;
    setRunning(true);
    setQueryError(null);
    setQueryResult(null);
    try {
      const finalQuery = injectWhereConditions(form.query, whereConditions, filters, metadata);
      const result = await runQuery(toPreviewSql(finalQuery));
      setQueryResult(result);
    } catch (e) {
      setQueryError(e.response?.data?.error || e.message);
    } finally {
      setRunning(false);
    }
  };

  // Question-specific filters: template tags NOT mapped to any dashboard filter
  const questionOnlyVars = Object.entries(form.templateTags || {}).filter(([name]) => {
    const hasDashFilter = (filters || []).some(f => f.slug === name);
    const isInQuery = variables.includes(name);
    return isInQuery && !hasDashFilter;
  });

  const handleAddQuestionFilter = () => {
    if (!qFilterName) return;
    const slug = qFilterName.toLowerCase().replace(/\s+/g, '_');
    
    // Add to template tags
    const existingTags = { ...(form.templateTags || {}) };
    existingTags[slug] = {
      id: slug,
      name: slug,
      'display-name': qFilterName,
      type: 'text',
      required: false,
      values_source_type: qFilterWidget === 'dropdown' ? 'static-list' : null,
      values_source_config: qFilterWidget === 'dropdown' ? { values: [] } : null,
    };

    // Append {{slug}} to query if not already present
    let newQuery = form.query || '';
    if (!newQuery.includes(`{{${slug}}}`)) {
      newQuery = newQuery.trimEnd() + `\n-- Question filter: ${qFilterName}\n-- {{${slug}}}`;
    }

    setForm(f => ({
      ...f,
      query: newQuery,
      templateTags: existingTags,
    }));

    setQFilterName('');
    setQFilterWidget('input');
    setShowQFilterForm(false);
  };

  const handleRemoveQuestionFilter = (slug) => {
    const existingTags = { ...(form.templateTags || {}) };
    delete existingTags[slug];
    set('templateTags', existingTags);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1000]">
      <div className="bg-white rounded-[14px] p-7 w-[780px] max-h-[90vh] overflow-y-auto shadow-[0_12px_40px_rgba(0,0,0,0.18)]">
        <div className="flex justify-between items-center mb-4">
          <div className="flex flex-col gap-1">
            <h3 className="m-0 text-[18px] font-bold text-slate-900">Edit Dashboard Card</h3>
            <span className="text-[11px] text-slate-500">Configure layout, query details, and parameters</span>
          </div>
          <button onClick={onClose} className="bg-transparent border-none text-[18px] cursor-pointer text-slate-400 py-1 px-2 rounded-md transition-all duration-150 hover:text-slate-600 hover:bg-slate-100">✕</button>
        </div>

        {/* Tab Header */}
        <div className="flex gap-1.5 border-b-2 border-slate-200 pb-0 mb-4 mt-3">
          {[
            { key: 'query', label: '📝 SQL Query & Preview', disabled: false },
            { key: 'variables', label: `🔍 Variables & Filters`, disabled: variables.length === 0, count: variables.length },
            { key: 'visualisation', label: '🎨 Visualisation', disabled: false },
            { key: 'layout', label: '📐 Layout & Size', disabled: false },
          ].map(tab => (
            <button
              key={tab.key}
              className={`bg-transparent border-none border-b-[3px] py-2.5 px-4 cursor-pointer text-[13px] font-semibold flex items-center gap-1.5 rounded-t-md transition-all duration-150
                ${activeTab === tab.key ? 'text-indigo-600 border-indigo-600 bg-indigo-50' : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'}
                ${tab.disabled ? 'text-slate-300 cursor-not-allowed opacity-50 hover:text-slate-300 hover:bg-transparent' : ''}`}
              onClick={() => !tab.disabled && setActiveTab(tab.key)}
              disabled={tab.disabled}
              title={tab.disabled ? 'No SQL variables detected in the query' : ''}
            >
              {tab.label}
              {tab.count > 0 && <span className="bg-indigo-600 text-white text-[10px] font-bold py-0.5 px-1.5 rounded-full min-w-[16px] text-center">{tab.count}</span>}
            </button>
          ))}
        </div>

        {/* Tab 1: SQL Query & Preview */}
        {activeTab === 'query' && (
          <div>
            <label className="block text-[12px] font-semibold text-slate-700 mb-1 mt-3.5">Card Title</label>
            <input className="w-full py-2 px-3 border border-slate-300 rounded-md text-[13px] box-border outline-none transition-all duration-150 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" value={form.title} onChange={e => set('title', e.target.value)} placeholder="e.g. User Registrations" />

            <label className="block text-[12px] font-semibold text-slate-700 mb-1 mt-3.5">Display Type</label>
            <select className="w-full py-2 px-3 border border-slate-300 rounded-md text-[13px] box-border outline-none transition-all duration-150 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" value={form.type} onChange={e => set('type', e.target.value)}>
              {DISPLAY_TYPES.map(t => <option key={t} value={t}>{t.toUpperCase()}</option>)}
            </select>

            <label className="block text-[12px] font-semibold text-slate-700 mb-1 mt-3.5">SQL Query</label>
            {hasMetabaseFilters(form.query) && (
              <div className="mb-2 py-2 px-3 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-800 text-[12px] leading-relaxed">
                ℹ️ Metabase filters are active. Preview execution ignores optional <code>[[...]]</code> clauses and treats variables as <code>NULL</code>.
              </div>
            )}
            {whereConditions.length > 0 && (
              <div className="mb-2 py-2 px-3 bg-slate-100 border border-slate-200 rounded-lg text-slate-700 text-[12px] leading-relaxed flex flex-col gap-1">
                <span className="font-bold text-[11px] text-slate-500 uppercase">Active Global WHERE Conditions:</span>
                <div className="flex flex-wrap gap-1.5">
                  {whereConditions.map((cond, i) => (
                    <span key={i} className="bg-slate-200 px-2 py-0.5 rounded text-[11px] font-mono">
                      {cond}
                    </span>
                  ))}
                </div>
              </div>
            )}
            <div className="relative mt-1.5">
              <textarea
                className="w-full py-2 px-3 border border-slate-300 rounded-md box-border outline-none transition-all duration-150 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 h-[160px] font-mono text-[12px] pb-10 leading-normal bg-[#fafbfc]"
                value={form.query}
                onChange={e => set('query', e.target.value)}
                placeholder="SELECT column FROM table WHERE column = {{variable}}"
                onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') handleRunQuery(); }}
              />
              <button
                className="absolute bottom-2 right-2 py-1.5 px-3.5 bg-gradient-to-br from-emerald-500 to-emerald-600 text-white border-none rounded-md cursor-pointer text-[12px] font-bold shadow-[0_2px_6px_rgba(16,185,129,0.3)] transition-all duration-150 hover:from-emerald-600 hover:to-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={handleRunQuery}
                disabled={running || !form.query.trim()}
              >
                {running ? '⏳ Running…' : '▶ Run Query'}
              </button>
            </div>

            {/* Query Results */}
            {queryError && (
              <div className="mt-2 py-2.5 px-3.5 bg-red-50 border border-red-200 rounded-lg text-red-800 text-[12px]">{queryError}</div>
            )}
            {queryResult && (
              <div className="mt-2 border border-slate-200 rounded-lg overflow-hidden">
                <div className="py-2 px-3 bg-slate-50 text-[11px] text-slate-500 border-b border-slate-200 font-semibold">
                  Returned {queryResult.rows.length} row{queryResult.rows.length !== 1 ? 's' : ''}
                </div>
                <div className="overflow-x-auto max-h-[220px] overflow-y-auto">
                  <table className="w-full border-collapse text-[12px]">
                    <thead>
                      <tr>
                        {queryResult.columns.map((col, i) => (
                          <th key={i} className="py-1.5 px-2.5 bg-slate-100 border-b border-slate-200 text-left font-semibold text-slate-700 whitespace-nowrap">{col}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {queryResult.rows.slice(0, 10).map((row, i) => (
                        <tr key={i} className={i % 2 === 0 ? '' : 'bg-slate-50'}>
                          {row.map((cell, j) => (
                            <td key={j} className="py-[5px] px-[10px] border-b border-slate-100 text-slate-900 whitespace-nowrap">{cell === null ? <span className="text-slate-400 italic">null</span> : String(cell)}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {queryResult.rows.length > 10 && (
                    <div className="py-1.5 px-2.5 text-[11px] text-slate-500 bg-slate-50 text-center font-medium">… and {queryResult.rows.length - 10} more rows</div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
        {activeTab === 'variables' && variables.length > 0 && (
          <div className="mt-0 p-0">
            <label className="block text-[14px] font-bold text-slate-700 mb-1 mt-0">SQL Variable Settings & Filter Mappings</label>
            <p className="m-0 mb-3.5 text-[12px] text-slate-500 leading-normal">
              Map SQL template variables (e.g. <code>{"{{variable}}"}</code>) to dashboard filters, and configure their database dimensions.
            </p>
            <div className="flex flex-col gap-2 mt-2">
              {variables.map(variable => {
                const currentTag = (form.templateTags || {})[variable] || {
                  id: variable,
                  name: variable,
                  'display-name': variable.replace(/_/g, ' '),
                  type: 'text',
                  required: false,
                };
                
                const currentMapping = (form.parameterMappings || []).find(m => m.target?.[1]?.[1] === variable);
                const currentFilterId = currentMapping ? currentMapping.parameter_id : '';
                let selectedFieldId = '';
                if (Array.isArray(currentTag.dimension)) {
                  selectedFieldId = currentTag.dimension[1];
                  if (typeof selectedFieldId === 'object' && selectedFieldId !== null && currentTag.dimension[2] !== undefined) {
                    selectedFieldId = currentTag.dimension[2];
                  }
                }
                const accentColor = getVarAccentColor(currentTag);
                const typeLabel = getVarTypeLabel(currentTag);

                return (
                  <div key={variable} className="bg-white border border-slate-200 rounded-[10px] p-3.5 mb-2.5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition-all duration-150" style={{ borderLeft: `4px solid ${accentColor}` }}>
                    {/* Step 1: Variable Badge */}
                    <div className="flex justify-between items-center mb-2.5 border-b border-slate-100 pb-2">
                      <span className="text-[12px] font-mono font-bold text-indigo-600 bg-indigo-50 py-0.5 px-2 rounded-md border border-indigo-200">{"{{" } {variable} {"}}"}</span>
                      <span style={{ fontSize: 11, color: accentColor, fontWeight: 600 }}>
                        {typeLabel}
                      </span>
                    </div>
                    
                    {/* Step 2: Configuration */}
                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <span className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5 mt-1 tracking-wider">⚙️ Variable Type</span>
                        <select
                          className="flex-1 py-1.5 px-2 border border-slate-300 rounded-md text-[12px] min-w-[100px] bg-white outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 w-full"
                          value={currentTag.type || 'text'}
                          onChange={e => handleTagPropertyChange(variable, 'type', e.target.value)}
                        >
                          <option value="text">Text / String</option>
                          <option value="number">Number / Integer</option>
                          <option value="date">Date</option>
                          <option value="dimension">Field Filter (Dimension)</option>
                        </select>
                      </div>

                      {/* Step 3: Dashboard Mapping */}
                      <div>
                        <span className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5 mt-1 tracking-wider">🔗 Dashboard Filter</span>
                        <select
                          className="flex-1 py-1.5 px-2 border border-slate-300 rounded-md text-[12px] min-w-[100px] bg-white outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 w-full"
                          value={currentFilterId}
                          onChange={e => handleMapFilter(variable, e.target.value)}
                        >
                          <option value="">-- No Mapping --</option>
                          {(filters || []).map(f => (
                            <option key={f.id} value={f.id}>
                              {f.name} ({f.slug})
                            </option>
                          ))}
                        </select>
                      </div>

                      {currentTag.type === 'dimension' ? (
                        <>
                          <div className="col-span-2">
                            <span className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5 mt-1 tracking-wider">Maps to Field (Dimension)</span>
                            {loadingMetadata ? (
                              <div className="text-[12px] text-slate-400 py-1">⏳ Loading database metadata…</div>
                            ) : (
                              <select
                                className="flex-1 py-1.5 px-2 border border-slate-300 rounded-md text-[12px] min-w-[100px] bg-white outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 w-full"
                                value={selectedFieldId}
                                onChange={e => {
                                  const fieldId = e.target.value ? parseInt(e.target.value, 10) : null;
                                  handleTagPropertyChange(variable, 'dimension', fieldId ? ['field', fieldId, null] : null);
                                }}
                              >
                                <option value="">-- Select Field --</option>
                                {metadata?.tables?.map(table => {
                                  const fields = table.fields || [];
                                  if (fields.length === 0) return null;
                                  return (
                                    <optgroup key={table.id} label={table.display_name || table.name}>
                                      {fields.map(f => (
                                        <option key={f.id} value={f.id}>
                                          {f.display_name || f.name} ({f.name})
                                        </option>
                                      ))}
                                    </optgroup>
                                  );
                                })}
                              </select>
                            )}
                          </div>
                          
                          <div className="col-span-2">
                            <span className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5 mt-1 tracking-wider">Filter Widget Type</span>
                            <select
                              className="flex-1 py-1.5 px-2 border border-slate-300 rounded-md text-[12px] min-w-[100px] bg-white outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 w-full"
                              value={currentTag['widget-type'] || 'category'}
                              onChange={e => handleTagPropertyChange(variable, 'widget-type', e.target.value)}
                            >
                              <option value="category">Category Dropdown / Input</option>
                              <option value="date/all-options">Date (All Options)</option>
                              <option value="date/month-year">Month and Year</option>
                              <option value="date/quarter-year">Quarter and Year</option>
                              <option value="number/equals">Number Equals</option>
                              <option value="number/between">Number Between</option>
                              <option value="string/contains">String Contains</option>
                              <option value="string/starts-with">String Starts With</option>
                              <option value="string/ends-with">Ends With</option>
                            </select>
                          </div>
                        </>
                      ) : (
                        <>
                          <div>
                            <span className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5 mt-1 tracking-wider">Widget Type</span>
                            <select
                              className="flex-1 py-1.5 px-2 border border-slate-300 rounded-md text-[12px] min-w-[100px] bg-white outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 w-full"
                              value={currentTag.values_source_type === 'static-list' ? 'dropdown' : 'input'}
                              onChange={e => {
                                const isDropdown = e.target.value === 'dropdown';
                                const existingTags = { ...(form.templateTags || {}) };
                                const updated = {
                                  ...currentTag,
                                  values_source_type: isDropdown ? 'static-list' : null,
                                  values_source_config: isDropdown ? (currentTag.values_source_config || { values: [] }) : null,
                                };
                                set('templateTags', { ...existingTags, [variable]: updated });
                              }}
                            >
                              <option value="input">Input Box</option>
                              <option value="dropdown">Dropdown</option>
                            </select>
                          </div>
                          <div>
                            <span className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5 mt-1 tracking-wider">Default Value</span>
                            <input
                              className="flex-1 py-1.5 px-2 border border-slate-300 rounded-md text-[12px] min-w-[100px] bg-white outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 w-full"
                              value={currentTag.default || ''}
                              placeholder="e.g. Monthly"
                              onChange={e => handleTagPropertyChange(variable, 'default', e.target.value || null)}
                            />
                          </div>

                          {currentTag.values_source_type === 'static-list' && (
                            <div className="col-span-2 mt-2.5 border-t border-dashed border-slate-200 pt-2">
                              <span className="text-[10px] font-bold text-slate-500 block mb-1.5 uppercase">
                                Static Options List
                              </span>
                              <div className="flex flex-wrap gap-1 mb-2">
                                {(currentTag.values_source_config?.values || []).map((val, idx) => (
                                  <span key={idx} className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-800 py-0.5 px-2 rounded-md text-[11px] font-semibold border border-indigo-200">
                                    {val}
                                    <span 
                                      className="cursor-pointer text-indigo-600 font-bold text-[10px] ml-1 hover:text-indigo-800" 
                                      onClick={() => {
                                        const newValues = (currentTag.values_source_config?.values || []).filter((_, i) => i !== idx);
                                        const existingTags = { ...(form.templateTags || {}) };
                                        const updated = {
                                          ...currentTag,
                                          values_source_config: {
                                            ...currentTag.values_source_config,
                                            values: newValues
                                          }
                                        };
                                        set('templateTags', { ...existingTags, [variable]: updated });
                                      }}
                                    >
                                      ✕
                                    </span>
                                  </span>
                                ))}
                                {(currentTag.values_source_config?.values || []).length === 0 && (
                                  <span className="text-[11px] text-slate-400 italic">No options added yet</span>
                                )}
                              </div>
                              <div className="flex gap-1">
                                <input
                                  className="flex-1 py-1.5 px-2 border border-slate-300 rounded-md text-[12px] min-w-[100px] bg-white outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                                  placeholder="New option..."
                                  onKeyDown={e => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault();
                                      const val = e.target.value.trim();
                                      if (val) {
                                        const currentValues = currentTag.values_source_config?.values || [];
                                        if (!currentValues.includes(val)) {
                                          const existingTags = { ...(form.templateTags || {}) };
                                          const updated = {
                                            ...currentTag,
                                            values_source_config: {
                                              ...currentTag.values_source_config,
                                              values: [...currentValues, val]
                                            }
                                          };
                                          set('templateTags', { ...existingTags, [variable]: updated });
                                        }
                                        e.target.value = '';
                                      }
                                    }
                                  }}
                                />
                                <button
                                  className="py-1 px-2 bg-indigo-600 text-white border-none rounded-md cursor-pointer font-bold text-[12px] transition-all duration-150 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                  onClick={e => {
                                    const input = e.target.previousSibling;
                                    const val = input.value.trim();
                                    if (val) {
                                      const currentValues = currentTag.values_source_config?.values || [];
                                      if (!currentValues.includes(val)) {
                                        const existingTags = { ...(form.templateTags || {}) };
                                        const updated = {
                                          ...currentTag,
                                          values_source_config: {
                                            ...currentTag.values_source_config,
                                            values: [...currentValues, val]
                                          }
                                        };
                                        set('templateTags', { ...existingTags, [variable]: updated });
                                      }
                                      input.value = '';
                                    }
                                  }}
                                >
                                  +
                                </button>
                              </div>
                            </div>
                          )}
                        </>
                      )}
                      
                      {currentFilterId && (
                        <div className="col-span-2 mt-2 border-t border-dashed border-slate-200 pt-2">
                          <label className={`text-[12px] flex items-center gap-2 cursor-pointer font-medium text-slate-700 py-1.5 px-2.5 rounded-md border transition-all duration-150 ${(form.inlineParameters || []).includes(currentFilterId) ? 'bg-indigo-50 border-indigo-200' : 'bg-slate-50 border-slate-200'}`}>
                            <input
                              type="checkbox"
                              checked={(form.inlineParameters || []).includes(currentFilterId)}
                              onChange={e => {
                                const inline = [...(form.inlineParameters || [])];
                                if (e.target.checked) {
                                  if (!inline.includes(currentFilterId)) inline.push(currentFilterId);
                                } else {
                                  const idx = inline.indexOf(currentFilterId);
                                  if (idx !== -1) inline.splice(idx, 1);
                                }
                                set('inlineParameters', inline);
                              }}
                            />
                            Show filter inline in card header
                          </label>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Question-Specific Filters Section */}
            <div className="mt-5 border-t-2 border-slate-200 pt-4">
              <div className="flex justify-between items-center mb-2">
                <div>
                  <span className="text-[13px] font-bold text-slate-900">➕ Question-Specific Filters</span>
                  <span className="block text-[11px] text-slate-500 mt-0.5">
                    Filters specific to this question only (not shown as dashboard filters)
                  </span>
                </div>
              </div>

              {/* Existing question-only variables */}
              {questionOnlyVars.map(([name, tag]) => (
                <div key={name} className="bg-amber-50 border border-slate-200 rounded-[10px] p-3.5 mb-2.5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition-all duration-150 border-l-4 border-l-amber-500">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-[12px] font-mono font-bold py-0.5 px-2 rounded-md border bg-amber-100 text-amber-800 border-amber-200">{"{{" } {name} {"}}"}</span>
                    <button
                      className="bg-transparent border-none cursor-pointer text-slate-400 text-[13px] hover:text-slate-600"
                      onClick={() => handleRemoveQuestionFilter(name)}
                      title="Remove question filter"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <span className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5 mt-1 tracking-wider">Widget Type</span>
                      <select
                        className="flex-1 py-1.5 px-2 border border-slate-300 rounded-md text-[12px] min-w-[100px] bg-white outline-none w-full"
                        value={tag.values_source_type === 'static-list' ? 'dropdown' : 'input'}
                        onChange={e => {
                          const isDropdown = e.target.value === 'dropdown';
                          const existingTags = { ...(form.templateTags || {}) };
                          const updated = {
                            ...tag,
                            values_source_type: isDropdown ? 'static-list' : null,
                            values_source_config: isDropdown ? (tag.values_source_config || { values: [] }) : null,
                          };
                          set('templateTags', { ...existingTags, [name]: updated });
                        }}
                      >
                        <option value="input">Input Box</option>
                        <option value="dropdown">Dropdown</option>
                      </select>
                    </div>
                    <div>
                      <span className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5 mt-1 tracking-wider">Default Value</span>
                      <input
                        className="flex-1 py-1.5 px-2 border border-slate-300 rounded-md text-[12px] min-w-[100px] bg-white outline-none w-full"
                        value={tag.default || ''}
                        placeholder="e.g. Monthly"
                        onChange={e => handleTagPropertyChange(name, 'default', e.target.value || null)}
                      />
                    </div>
                    {tag.values_source_type === 'static-list' && (
                      <div className="col-span-2 mt-2 border-t border-dashed border-amber-200 pt-2">
                        <span className="text-[10px] font-bold text-amber-800 block mb-1.5 uppercase">
                          Static Options
                        </span>
                        <div className="flex flex-wrap gap-1 mb-2">
                          {(tag.values_source_config?.values || []).map((val, idx) => (
                            <span key={idx} className="inline-flex items-center gap-1 bg-amber-100 text-amber-800 py-0.5 px-2 rounded-md text-[11px] font-semibold border border-amber-200">
                              {val}
                              <span
                                className="cursor-pointer text-amber-700 font-bold text-[10px] ml-1 hover:text-amber-900"
                                onClick={() => {
                                  const newValues = (tag.values_source_config?.values || []).filter((_, i) => i !== idx);
                                  const existingTags = { ...(form.templateTags || {}) };
                                  const updated = { ...tag, values_source_config: { ...tag.values_source_config, values: newValues } };
                                  set('templateTags', { ...existingTags, [name]: updated });
                                }}
                              >
                                ✕
                              </span>
                            </span>
                          ))}
                          {(tag.values_source_config?.values || []).length === 0 && (
                            <span className="text-[11px] text-amber-700 italic">No options yet</span>
                          )}
                        </div>
                        <div className="flex gap-1">
                          <input
                            className="flex-1 py-1.5 px-2 border border-slate-300 rounded-md text-[12px] min-w-[100px] bg-white outline-none"
                            placeholder="New option..."
                            onKeyDown={e => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                const val = e.target.value.trim();
                                if (val) {
                                  const currentValues = tag.values_source_config?.values || [];
                                  if (!currentValues.includes(val)) {
                                    const existingTags = { ...(form.templateTags || {}) };
                                    const updated = { ...tag, values_source_config: { ...tag.values_source_config, values: [...currentValues, val] } };
                                    set('templateTags', { ...existingTags, [name]: updated });
                                  }
                                  e.target.value = '';
                                }
                              }
                            }}
                          />
                          <button
                            className="py-1 px-2 bg-indigo-600 text-white border-none rounded-md cursor-pointer font-bold text-[12px] transition-all duration-150 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                            onClick={e => {
                              const input = e.target.previousSibling;
                              const val = input.value.trim();
                              if (val) {
                                const currentValues = tag.values_source_config?.values || [];
                                if (!currentValues.includes(val)) {
                                  const existingTags = { ...(form.templateTags || {}) };
                                  const updated = { ...tag, values_source_config: { ...tag.values_source_config, values: [...currentValues, val] } };
                                  set('templateTags', { ...existingTags, [name]: updated });
                                }
                                input.value = '';
                              }
                            }}
                          >
                            +
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {/* Quick Templates */}
              <div className="mt-2 mb-1">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  Quick Templates
                </span>
                <div className="flex gap-1.5 mt-1.5 flex-wrap">
                  {!hasReportingPeriodDropdown && (
                    <button
                      className="py-1.5 px-3 border border-amber-200 rounded-lg bg-amber-50 cursor-pointer text-[11px] font-semibold text-amber-800 flex items-center gap-1 transition-all duration-150 hover:bg-amber-100"
                      onClick={() => {
                        const slug = 'reporting_period';
                        const existingTags = { ...(form.templateTags || {}) };
                        const currentValues = (existingTags[slug]?.values_source_config?.values || [])
                          .map(value => Array.isArray(value) ? value[0] : value);
                        existingTags[slug] = {
                          ...(existingTags[slug] || {}),
                          id: slug,
                          name: slug,
                          'display-name': 'Reporting Period',
                          type: existingTags[slug]?.type || 'text',
                          required: existingTags[slug]?.required ?? false,
                          default: existingTags[slug]?.default || 'Monthly',
                          values_source_type: 'static-list',
                          values_source_config: { values: [...new Set([...currentValues, ...REPORTING_PERIOD_VALUES])] },
                        };
                        let newQuery = form.query || '';
                        if (!newQuery.includes(`{{${slug}}}`)) {
                          // Insert as a CASE WHEN in a comment for user reference
                          newQuery = newQuery.trimEnd() + '\n-- Reporting Period filter: use {{reporting_period}} in your CASE WHEN logic';
                        }
                        setForm(f => ({ ...f, query: newQuery, templateTags: existingTags }));
                      }}
                    >
                      📅 {variables.includes('reporting_period') ? 'Use Reporting Period Dropdown' : '+ Reporting Period'}
                    </button>
                  )}
                  {hasReportingPeriodDropdown && (
                    <span className="text-[11px] text-emerald-600 font-semibold py-1.5 px-3 bg-emerald-50 rounded-lg border border-emerald-200">
                      ✅ Reporting Period dropdown ready
                    </span>
                  )}
                </div>
              </div>

              {/* Add Question Filter Form */}
              {!showQFilterForm ? (
                <button
                  className="py-1.5 px-3 bg-amber-800 text-white border-none rounded-md cursor-pointer font-bold text-[12px] transition-all duration-150 hover:bg-amber-950 w-full mt-2"
                  onClick={() => setShowQFilterForm(true)}
                >
                  + Add Custom Question Filter
                </button>
              ) : (
                <div className="border border-amber-200 rounded-lg p-3 mt-2 bg-amber-50">
                  <span className="text-[12px] font-bold block mb-2 text-amber-800">
                    New Question-Specific Filter
                  </span>
                  <div className="mb-2">
                    <span className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5 mt-1 tracking-wider">Filter Name</span>
                    <input
                      className="flex-1 py-1.5 px-2 border border-slate-300 rounded-md text-[12px] min-w-[100px] bg-white outline-none w-full"
                      value={qFilterName}
                      placeholder="e.g. Reporting Period"
                      onChange={e => setQFilterName(e.target.value)}
                    />
                  </div>
                  <div className="mb-2.5">
                    <span className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5 mt-1 tracking-wider">Widget Type</span>
                    <select
                      className="flex-1 py-1.5 px-2 border border-slate-300 rounded-md text-[12px] min-w-[100px] bg-white outline-none w-full"
                      value={qFilterWidget}
                      onChange={e => setQFilterWidget(e.target.value)}
                    >
                      <option value="input">Input Box</option>
                      <option value="dropdown">Dropdown</option>
                    </select>
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      className="py-1.5 px-3 bg-slate-500 text-white border-none rounded-md cursor-pointer font-bold text-[12px] transition-all duration-150 hover:bg-slate-600 flex-1"
                      onClick={() => { setShowQFilterForm(false); setQFilterName(''); }}
                    >
                      Cancel
                    </button>
                    <button
                      className="py-1.5 px-3 bg-amber-800 text-white border-none rounded-md cursor-pointer font-bold text-[12px] transition-all duration-150 hover:bg-amber-900 flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
                      onClick={handleAddQuestionFilter}
                      disabled={!qFilterName}
                    >
                      Add
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 2: Visualisation */}
        {activeTab === 'visualisation' && (
          <div className="mt-2.5">
            <div className="text-[12px] font-semibold text-slate-700 mb-3">Choose how to visualize this query:</div>
            
            {/* Primary Visualisations Grid */}
            <div className="grid grid-cols-3 gap-3 mb-5">
              {VISUALISATION_TYPES.filter(v => v.isPrimary).map(v => {
                const isSelected = form.type === v.type;
                return (
                  <button
                    key={v.type}
                    type="button"
                    onClick={() => set('type', v.type)}
                    className={`flex flex-col items-center justify-center p-4 rounded-xl border-2 cursor-pointer transition-all duration-150 text-center select-none bg-white w-full box-border
                      ${isSelected 
                        ? 'border-indigo-600 bg-indigo-50/20 text-indigo-700 font-bold shadow-[0_2px_8px_rgba(79,70,229,0.15)]' 
                        : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'}`}
                  >
                    <span className="text-3xl mb-1.5">{v.icon}</span>
                    <span className="text-[12px] font-bold tracking-tight">{v.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Divider / MORE CHARTS label */}
            <div className="flex items-center gap-2 mb-4 mt-1">
              <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">MORE CHARTS</span>
              <div className="flex-1 h-[1px] bg-slate-200"></div>
            </div>

            {/* Other Visualisations Grid (4 columns) */}
            <div className="grid grid-cols-4 gap-3 max-h-[260px] overflow-y-auto pr-1">
              {VISUALISATION_TYPES.filter(v => !v.isPrimary).map(v => {
                const isSelected = form.type === v.type;
                return (
                  <button
                    key={v.type}
                    type="button"
                    onClick={() => set('type', v.type)}
                    className={`flex flex-col items-center justify-center p-3.5 rounded-xl border-2 cursor-pointer transition-all duration-150 text-center select-none bg-white w-full box-border
                      ${isSelected 
                        ? 'border-indigo-600 bg-indigo-50/20 text-indigo-700 font-bold shadow-[0_2px_8px_rgba(79,70,229,0.15)]' 
                        : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'}`}
                  >
                    <span className="text-2xl mb-1">{v.icon}</span>
                    <span className="text-[11px] font-bold tracking-tight">{v.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Current Selection Status Footer */}
            <div className="mt-5 p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Active Visualisation</span>
                <span className="text-sm font-extrabold text-indigo-600">
                  {VISUALISATION_TYPES.find(v => v.type === form.type)?.label || form.type?.toUpperCase()}
                </span>
              </div>
              <span className="text-2xl bg-white border border-slate-200 p-2.5 rounded-xl shadow-sm leading-none flex items-center justify-center">
                {VISUALISATION_TYPES.find(v => v.type === form.type)?.icon || '📊'}
              </span>
            </div>
          </div>
        )}

        {/* Tab 3: Layout & Size */}
        {activeTab === 'layout' && (
          <div>
            <label className="block text-[12px] font-semibold text-slate-700 mb-1 mt-3.5">Card Dimensions (columns × rows)</label>
            <div className="flex gap-2 mt-1.5">
              <div>
                <span className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5 mt-1 tracking-wider">Width (Grid Cols)</span>
                <input className="w-[100px] py-2 px-3 border border-slate-300 rounded-md text-[13px] box-border outline-none transition-all duration-150 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" type="number" min={1} max={24} value={form.sizeX}
                  onChange={e => set('sizeX', parseInt(e.target.value))} placeholder="Width" />
              </div>
              <div>
                <span className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5 mt-1 tracking-wider">Height (Grid Rows)</span>
                <input className="w-[100px] py-2 px-3 border border-slate-300 rounded-md text-[13px] box-border outline-none transition-all duration-150 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" type="number" min={1} max={20} value={form.sizeY}
                  onChange={e => set('sizeY', parseInt(e.target.value))} placeholder="Height" />
              </div>
            </div>

            {hasMetabaseDetails && (
              <div className="mt-5">
                <label className="block text-[12px] font-semibold text-slate-700 mb-1 mt-3.5">Metabase Link & Metadata Details</label>
                <div className="mt-3 p-3.5 border border-slate-200 rounded-[10px] bg-slate-50">
                  {form.description && <div className="mb-2.5 text-slate-600 text-[12px] leading-relaxed">{form.description}</div>}
                  <div className="grid grid-cols-2 gap-2.5">
                    <Detail label="Card ID" value={form.metabaseCardId} />
                    <Detail label="Dashcard ID" value={form.metabaseDashcardId} />
                    <Detail label="Database ID" value={form.databaseId} />
                    <Detail label="Metabase Display" value={form.display} />
                    <Detail label="Position" value={`col ${form.col ?? 0}, row ${form.row ?? 0}`} />
                    <Detail label="Size" value={`${form.sizeX ?? 6} x ${form.sizeY ?? 4}`} />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2.5 mt-6 border-t border-slate-200 pt-4">
          <button className="py-[9px] px-[20px] border border-slate-300 rounded-lg bg-white cursor-pointer text-[13px] font-semibold text-slate-600 transition-all duration-150 hover:bg-slate-50 hover:text-slate-800" onClick={onClose}>Cancel</button>
          <button className="py-[9px] px-[20px] border-none rounded-lg bg-gradient-to-br from-indigo-500 to-indigo-600 text-white cursor-pointer font-bold text-[13px] shadow-[0_2px_8px_rgba(79,70,229,0.25)] transition-all duration-150 hover:from-indigo-600 hover:to-indigo-700" onClick={() => onSave(form)}>Save Card</button>
        </div>
      </div>
    </div>
  );
}

function Detail({ label, value }) {
  if (value === undefined || value === null || value === '') return null;
  return (
    <div>
      <span className="block text-slate-400 text-[10px] font-bold uppercase">{label}</span>
      <span className="block text-slate-900 text-[12px] overflow-hidden text-ellipsis whitespace-nowrap">{value}</span>
    </div>
  );
}
