import React, { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { runQuery, listDatabases, getDatabaseMetadata } from '../services/api';
import { hasMetabaseFilters, toPreviewSql, injectWhereConditions } from '../services/queryPreview';

const DISPLAY_TYPES = ['table', 'bar', 'line', 'pie', 'scalar', 'map', 'area', 'row'];

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
            dbId = dbList[0].id;
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
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <div style={styles.header}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#0f172a' }}>Edit Dashboard Card</h3>
            <span style={{ fontSize: 11, color: '#64748b' }}>Configure layout, query details, and parameters</span>
          </div>
          <button onClick={onClose} style={styles.closeBtn}>✕</button>
        </div>

        {/* Tab Header */}
        <div style={styles.tabsHeader}>
          {[
            { key: 'query', label: '📝 SQL Query & Preview', disabled: false },
            { key: 'variables', label: `🔍 Variables & Filters`, disabled: variables.length === 0, count: variables.length },
            { key: 'layout', label: '📐 Layout & Size', disabled: false },
          ].map(tab => (
            <button
              key={tab.key}
              style={{
                ...styles.tabButton,
                ...(activeTab === tab.key ? styles.tabButtonActive : {}),
                ...(tab.disabled ? styles.tabButtonDisabled : {}),
              }}
              onClick={() => !tab.disabled && setActiveTab(tab.key)}
              disabled={tab.disabled}
              title={tab.disabled ? 'No SQL variables detected in the query' : ''}
            >
              {tab.label}
              {tab.count > 0 && <span style={styles.badgeCount}>{tab.count}</span>}
            </button>
          ))}
        </div>

        {/* Tab 1: SQL Query & Preview */}
        {activeTab === 'query' && (
          <div>
            <label style={styles.label}>Card Title</label>
            <input style={styles.input} value={form.title} onChange={e => set('title', e.target.value)} placeholder="e.g. User Registrations" />

            <label style={styles.label}>Display Type</label>
            <select style={styles.input} value={form.type} onChange={e => set('type', e.target.value)}>
              {DISPLAY_TYPES.map(t => <option key={t} value={t}>{t.toUpperCase()}</option>)}
            </select>

            <label style={styles.label}>SQL Query</label>
            {hasMetabaseFilters(form.query) && (
              <div style={styles.hintBox}>
                ℹ️ Metabase filters are active. Preview execution ignores optional <code>[[...]]</code> clauses and treats variables as <code>NULL</code>.
              </div>
            )}
            {whereConditions.length > 0 && (
              <div style={{ ...styles.hintBox, background: '#f1f5f9', border: '1px solid #e2e8f0', color: '#334155', display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontWeight: 700, fontSize: 11, color: '#475569', textTransform: 'uppercase' }}>Active Global WHERE Conditions:</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {whereConditions.map((cond, i) => (
                    <span key={i} style={{ background: '#e2e8f0', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontFamily: 'monospace' }}>
                      {cond}
                    </span>
                  ))}
                </div>
              </div>
            )}
            <div style={{ position: 'relative', marginTop: 6 }}>
              <textarea
                style={{ ...styles.input, height: 160, fontFamily: 'monospace', fontSize: 12, paddingBottom: 40, lineHeight: 1.5, background: '#fafbfc' }}
                value={form.query}
                onChange={e => set('query', e.target.value)}
                placeholder="SELECT column FROM table WHERE column = {{variable}}"
                onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') handleRunQuery(); }}
              />
              <button
                style={styles.runBtn}
                onClick={handleRunQuery}
                disabled={running || !form.query.trim()}
              >
                {running ? '⏳ Running…' : '▶ Run Query'}
              </button>
            </div>

            {/* Query Results */}
            {queryError && (
              <div style={styles.errorBox}>{queryError}</div>
            )}
            {queryResult && (
              <div style={styles.resultBox}>
                <div style={styles.resultMeta}>
                  Returned {queryResult.rows.length} row{queryResult.rows.length !== 1 ? 's' : ''}
                </div>
                <div style={styles.tableWrap}>
                  <table style={styles.table}>
                    <thead>
                      <tr>
                        {queryResult.columns.map((col, i) => (
                          <th key={i} style={styles.th}>{col}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {queryResult.rows.slice(0, 10).map((row, i) => (
                        <tr key={i} style={i % 2 === 0 ? {} : { background: '#f8f9fa' }}>
                          {row.map((cell, j) => (
                            <td key={j} style={styles.td}>{cell === null ? <span style={{ color: '#adb5bd', fontStyle: 'italic' }}>null</span> : String(cell)}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {queryResult.rows.length > 10 && (
                    <div style={styles.moreRows}>… and {queryResult.rows.length - 10} more rows</div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Variables & Field Filters */}
        {activeTab === 'variables' && variables.length > 0 && (
          <div style={styles.mappingBox}>
            <label style={{ ...styles.label, marginTop: 0, fontSize: 14, fontWeight: 700 }}>SQL Variable Settings & Filter Mappings</label>
            <p style={{ margin: '4px 0 14px 0', fontSize: 12, color: '#64748b', lineHeight: 1.4 }}>
              Map SQL template variables (e.g. <code>{"{{variable}}"}</code>) to dashboard filters, and configure their database dimensions.
            </p>
            <div style={styles.mappingGrid}>
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
                const selectedFieldId = currentTag.dimension?.[1] || '';
                const accentColor = getVarAccentColor(currentTag);
                const typeLabel = getVarTypeLabel(currentTag);

                return (
                  <div key={variable} style={{ ...styles.variableConfigCard, borderLeft: `4px solid ${accentColor}` }}>
                    {/* Step 1: Variable Badge */}
                    <div style={styles.variableConfigHeader}>
                      <span style={styles.variableBadge}>{"{{" } {variable} {"}}"}</span>
                      <span style={{ fontSize: 11, color: accentColor, fontWeight: 600 }}>
                        {typeLabel}
                      </span>
                    </div>
                    
                    {/* Step 2: Configuration */}
                    <div style={styles.variableConfigGrid}>
                      <div>
                        <span style={styles.miniLabel}>⚙️ Variable Type</span>
                        <select
                          style={styles.mappingSelect}
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
                        <span style={styles.miniLabel}>🔗 Dashboard Filter</span>
                        <select
                          style={styles.mappingSelect}
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
                          <div style={{ gridColumn: 'span 2' }}>
                            <span style={styles.miniLabel}>Maps to Field (Dimension)</span>
                            {loadingMetadata ? (
                              <div style={{ fontSize: 12, color: '#868e96', padding: '4px 0' }}>⏳ Loading database metadata…</div>
                            ) : (
                              <select
                                style={styles.mappingSelect}
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
                          
                          <div style={{ gridColumn: 'span 2' }}>
                            <span style={styles.miniLabel}>Filter Widget Type</span>
                            <select
                              style={styles.mappingSelect}
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
                            <span style={styles.miniLabel}>Widget Type</span>
                            <select
                              style={styles.mappingSelect}
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
                            <span style={styles.miniLabel}>Default Value</span>
                            <input
                              style={styles.mappingSelect}
                              value={currentTag.default || ''}
                              placeholder="e.g. Monthly"
                              onChange={e => handleTagPropertyChange(variable, 'default', e.target.value || null)}
                            />
                          </div>

                          {currentTag.values_source_type === 'static-list' && (
                            <div style={{ gridColumn: 'span 2', marginTop: 10, borderTop: '1px dashed #e2e8f0', paddingTop: 8 }}>
                              <span style={{ fontSize: 10, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 6, textTransform: 'uppercase' }}>
                                Static Options List
                              </span>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                                {(currentTag.values_source_config?.values || []).map((val, idx) => (
                                  <span key={idx} style={styles.staticOptionBadge}>
                                    {val}
                                    <span 
                                      style={styles.deleteBadgeCross} 
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
                                  <span style={{ fontSize: 11, color: '#94a3b8', fontStyle: 'italic' }}>No options added yet</span>
                                )}
                              </div>
                              <div style={{ display: 'flex', gap: 4 }}>
                                <input
                                  style={styles.mappingSelect}
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
                                  style={{ ...styles.addBtn, padding: '4px 8px' }}
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
                        <div style={{ gridColumn: 'span 2', marginTop: 8, borderTop: '1px dashed #e2e8f0', paddingTop: 8 }}>
                          <label style={{
                            fontSize: 12,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            cursor: 'pointer',
                            fontWeight: 500,
                            color: '#334155',
                            padding: '6px 10px',
                            borderRadius: 6,
                            background: (form.inlineParameters || []).includes(currentFilterId) ? '#eef2ff' : '#f8fafc',
                            border: `1px solid ${(form.inlineParameters || []).includes(currentFilterId) ? '#c7d2fe' : '#e2e8f0'}`,
                            transition: 'all 0.15s',
                          }}>
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
            <div style={{ marginTop: 20, borderTop: '2px solid #e2e8f0', paddingTop: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>➕ Question-Specific Filters</span>
                  <span style={{ display: 'block', fontSize: 11, color: '#64748b', marginTop: 2 }}>
                    Filters specific to this question only (not shown as dashboard filters)
                  </span>
                </div>
              </div>

              {/* Existing question-only variables */}
              {questionOnlyVars.map(([name, tag]) => (
                <div key={name} style={{ ...styles.variableConfigCard, borderLeft: '4px solid #f59e0b', background: '#fffbeb' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ ...styles.variableBadge, background: '#fef3c7', color: '#92400e' }}>{"{{" } {name} {"}}"}</span>
                    <button
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 13 }}
                      onClick={() => handleRemoveQuestionFilter(name)}
                      title="Remove question filter"
                    >
                      ✕
                    </button>
                  </div>
                  <div style={styles.variableConfigGrid}>
                    <div>
                      <span style={styles.miniLabel}>Widget Type</span>
                      <select
                        style={styles.mappingSelect}
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
                      <span style={styles.miniLabel}>Default Value</span>
                      <input
                        style={styles.mappingSelect}
                        value={tag.default || ''}
                        placeholder="e.g. Monthly"
                        onChange={e => handleTagPropertyChange(name, 'default', e.target.value || null)}
                      />
                    </div>
                    {tag.values_source_type === 'static-list' && (
                      <div style={{ gridColumn: 'span 2', marginTop: 8, borderTop: '1px dashed #fde68a', paddingTop: 8 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: '#92400e', display: 'block', marginBottom: 6, textTransform: 'uppercase' }}>
                          Static Options
                        </span>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                          {(tag.values_source_config?.values || []).map((val, idx) => (
                            <span key={idx} style={{ ...styles.staticOptionBadge, background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a' }}>
                              {val}
                              <span
                                style={{ ...styles.deleteBadgeCross, color: '#b45309' }}
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
                            <span style={{ fontSize: 11, color: '#b45309', fontStyle: 'italic' }}>No options yet</span>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <input
                            style={styles.mappingSelect}
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
                            style={{ ...styles.addBtn, padding: '4px 8px' }}
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
              <div style={{ marginTop: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                  Quick Templates
                </span>
                <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                  {!variables.includes('reporting_period') && (
                    <button
                      style={{
                        padding: '6px 12px', border: '1px solid #fde68a', borderRadius: 8,
                        background: '#fffbeb', cursor: 'pointer', fontSize: 11, fontWeight: 600,
                        color: '#92400e', display: 'flex', alignItems: 'center', gap: 4,
                        transition: 'all 0.15s',
                      }}
                      onClick={() => {
                        const slug = 'reporting_period';
                        const existingTags = { ...(form.templateTags || {}) };
                        existingTags[slug] = {
                          id: slug,
                          name: slug,
                          'display-name': 'Reporting Period',
                          type: 'text',
                          required: false,
                          default: 'Monthly',
                          values_source_type: 'static-list',
                          values_source_config: { values: ['Monthly', 'Quarterly', 'Yearly'] },
                        };
                        let newQuery = form.query || '';
                        if (!newQuery.includes(`{{${slug}}}`)) {
                          // Insert as a CASE WHEN in a comment for user reference
                          newQuery = newQuery.trimEnd() + '\n-- Reporting Period filter: use {{reporting_period}} in your CASE WHEN logic';
                        }
                        setForm(f => ({ ...f, query: newQuery, templateTags: existingTags }));
                      }}
                    >
                      📅 + Reporting Period
                    </button>
                  )}
                  {variables.includes('reporting_period') && (
                    <span style={{ fontSize: 11, color: '#059669', fontWeight: 600, padding: '6px 12px', background: '#ecfdf5', borderRadius: 8, border: '1px solid #a7f3d0' }}>
                      ✅ Reporting Period already added
                    </span>
                  )}
                </div>
              </div>

              {/* Add Question Filter Form */}
              {!showQFilterForm ? (
                <button
                  style={{ ...styles.addBtn, width: '100%', marginTop: 8, background: '#92400e' }}
                  onClick={() => setShowQFilterForm(true)}
                >
                  + Add Custom Question Filter
                </button>
              ) : (
                <div style={{ border: '1px solid #fde68a', borderRadius: 8, padding: 12, marginTop: 8, background: '#fffbeb' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 8, color: '#92400e' }}>
                    New Question-Specific Filter
                  </span>
                  <div style={{ marginBottom: 8 }}>
                    <span style={styles.miniLabel}>Filter Name</span>
                    <input
                      style={styles.mappingSelect}
                      value={qFilterName}
                      placeholder="e.g. Reporting Period"
                      onChange={e => setQFilterName(e.target.value)}
                    />
                  </div>
                  <div style={{ marginBottom: 10 }}>
                    <span style={styles.miniLabel}>Widget Type</span>
                    <select
                      style={styles.mappingSelect}
                      value={qFilterWidget}
                      onChange={e => setQFilterWidget(e.target.value)}
                    >
                      <option value="input">Input Box</option>
                      <option value="dropdown">Dropdown</option>
                    </select>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      style={{ ...styles.addBtn, flex: 1, background: '#64748b' }}
                      onClick={() => { setShowQFilterForm(false); setQFilterName(''); }}
                    >
                      Cancel
                    </button>
                    <button
                      style={{ ...styles.addBtn, flex: 1, background: '#92400e' }}
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

        {/* Tab 3: Layout & Size */}
        {activeTab === 'layout' && (
          <div>
            <label style={styles.label}>Card Dimensions (columns × rows)</label>
            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              <div>
                <span style={styles.miniLabel}>Width (Grid Cols)</span>
                <input style={{ ...styles.input, width: 100 }} type="number" min={1} max={24} value={form.sizeX}
                  onChange={e => set('sizeX', parseInt(e.target.value))} placeholder="Width" />
              </div>
              <div>
                <span style={styles.miniLabel}>Height (Grid Rows)</span>
                <input style={{ ...styles.input, width: 100 }} type="number" min={1} max={20} value={form.sizeY}
                  onChange={e => set('sizeY', parseInt(e.target.value))} placeholder="Height" />
              </div>
            </div>

            {hasMetabaseDetails && (
              <div style={{ marginTop: 20 }}>
                <label style={styles.label}>Metabase Link & Metadata Details</label>
                <div style={styles.detailBox}>
                  {form.description && <div style={styles.detailDescription}>{form.description}</div>}
                  <div style={styles.detailGrid}>
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

        <div style={styles.footer}>
          <button style={styles.cancelBtn} onClick={onClose}>Cancel</button>
          <button style={styles.saveBtn} onClick={() => onSave(form)}>Save Card</button>
        </div>
      </div>
    </div>
  );
}

function Detail({ label, value }) {
  if (value === undefined || value === null || value === '') return null;
  return (
    <div>
      <span style={styles.detailLabel}>{label}</span>
      <span style={styles.detailValue}>{value}</span>
    </div>
  );
}

const styles = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  modal: { background: '#fff', borderRadius: 14, padding: 28, width: 780, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 12px 40px rgba(0,0,0,0.18)' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  closeBtn: { background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#94a3b8', padding: '4px 8px', borderRadius: 6, transition: 'all 0.15s' },
  label: { display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 4, marginTop: 14 },
  input: { width: '100%', padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13, boxSizing: 'border-box', outline: 'none', transition: 'all 0.15s' },
  detailBox: { marginTop: 12, padding: 14, border: '1px solid #e2e8f0', borderRadius: 10, background: '#f8fafc' },
  detailDescription: { marginBottom: 10, color: '#475569', fontSize: 12, lineHeight: 1.4 },
  detailGrid: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 },
  detailLabel: { display: 'block', color: '#94a3b8', fontSize: 10, fontWeight: 700, textTransform: 'uppercase' },
  detailValue: { display: 'block', color: '#0f172a', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  hintBox: { marginBottom: 8, padding: '8px 12px', background: '#fefce8', border: '1px solid #fde68a', borderRadius: 8, color: '#713f12', fontSize: 12, lineHeight: 1.4 },
  runBtn: {
    position: 'absolute', bottom: 8, right: 8,
    padding: '6px 14px', background: 'linear-gradient(135deg, #10b981, #059669)', color: '#fff',
    border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 700,
    boxShadow: '0 2px 6px rgba(16,185,129,0.3)', transition: 'all 0.15s',
  },
  errorBox: { marginTop: 8, padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, color: '#991b1b', fontSize: 12 },
  resultBox: { marginTop: 8, border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' },
  resultMeta: { padding: '8px 12px', background: '#f8fafc', fontSize: 11, color: '#64748b', borderBottom: '1px solid #e2e8f0', fontWeight: 600 },
  tableWrap: { overflowX: 'auto', maxHeight: 220, overflowY: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 12 },
  th: { padding: '6px 10px', background: '#f1f5f9', borderBottom: '1px solid #e2e8f0', textAlign: 'left', fontWeight: 600, color: '#334155', whiteSpace: 'nowrap' },
  td: { padding: '5px 10px', borderBottom: '1px solid #f1f5f9', color: '#0f172a', whiteSpace: 'nowrap' },
  moreRows: { padding: '6px 10px', fontSize: 11, color: '#64748b', background: '#f8fafc', textAlign: 'center', fontWeight: 500 },
  footer: { display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 24, borderTop: '1px solid #e2e8f0', paddingTop: 16 },
  cancelBtn: { padding: '9px 20px', border: '1px solid #cbd5e1', borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#475569', transition: 'all 0.15s' },
  saveBtn: { padding: '9px 20px', border: 'none', borderRadius: 8, background: 'linear-gradient(135deg, #4f46e5, #4338ca)', color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 13, boxShadow: '0 2px 8px rgba(79,70,229,0.25)', transition: 'all 0.15s' },
  mappingBox: { marginTop: 0, padding: 0 },
  mappingGrid: { display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 },
  mappingRow: { display: 'flex', alignItems: 'center', gap: 10, background: '#fff', border: '1px solid #dee2e6', borderRadius: 6, padding: '6px 10px' },
  variableBadge: { fontSize: 12, fontFamily: 'monospace', fontWeight: 700, color: '#4f46e5', background: '#eef2ff', padding: '3px 8px', borderRadius: 5, border: '1px solid #c7d2fe' },
  mappingSelect: { flex: 1, padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 12, minWidth: 100, background: '#fff', outline: 'none' },
  variableConfigCard: {
    background: '#fff',
    border: '1px solid #e2e8f0',
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
    transition: 'all 0.15s',
  },
  variableConfigHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    borderBottom: '1px solid #f1f5f9',
    paddingBottom: 8,
  },
  variableConfigGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: 10,
  },
  miniLabel: {
    display: 'block',
    fontSize: 10,
    fontWeight: 700,
    color: '#64748b',
    textTransform: 'uppercase',
    marginBottom: 3,
    marginTop: 4,
    letterSpacing: '0.03em',
  },
  tabsHeader: {
    display: 'flex',
    gap: 6,
    borderBottom: '2px solid #e2e8f0',
    paddingBottom: 0,
    marginBottom: 16,
    marginTop: 12,
  },
  tabButton: {
    background: 'none',
    border: 'none',
    borderBottom: '3px solid transparent',
    padding: '10px 16px',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 600,
    color: '#64748b',
    transition: 'all 0.15s',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    borderRadius: '6px 6px 0 0',
  },
  tabButtonActive: {
    color: '#4f46e5',
    borderBottomColor: '#4f46e5',
    background: '#eef2ff',
  },
  tabButtonDisabled: {
    color: '#cbd5e1',
    cursor: 'not-allowed',
    opacity: 0.5,
  },
  badgeCount: {
    background: '#4f46e5',
    color: '#fff',
    fontSize: 10,
    fontWeight: 700,
    padding: '1px 6px',
    borderRadius: 999,
    minWidth: 16,
    textAlign: 'center',
  },
  addBtn: { padding: '6px 12px', background: '#4f46e5', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 700, fontSize: 12, transition: 'all 0.15s' },
  staticOptionBadge: { display: 'inline-flex', alignItems: 'center', gap: 4, background: '#e0e7ff', color: '#3730a3', padding: '3px 8px', borderRadius: 5, fontSize: 11, fontWeight: 600, border: '1px solid #c7d2fe' },
  deleteBadgeCross: { cursor: 'pointer', color: '#4f46e5', fontWeight: 700, fontSize: 10, marginLeft: 3 },
};
