import React, { useState, useEffect } from 'react';
import { runQuery, listDatabases, getDatabaseMetadata } from '../services/api';
import { hasMetabaseFilters, toPreviewSql } from '../services/queryPreview';

const DISPLAY_TYPES = ['table', 'bar', 'line', 'pie', 'scalar', 'map', 'area', 'row'];

const extractVariables = (query = '') => {
  const names = new Set();
  const re = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;
  let match;
  while ((match = re.exec(query))) names.add(match[1]);
  return [...names];
};

export default function CardEditor({ card, filters, onSave, onClose }) {
  const [form, setForm] = useState({ ...card });
  const [queryResult, setQueryResult] = useState(null); // { columns, rows }
  const [queryError, setQueryError] = useState(null);
  const [running, setRunning] = useState(false);
  const [metadata, setMetadata] = useState(null);
  const [loadingMetadata, setLoadingMetadata] = useState(false);
  const [activeTab, setActiveTab] = useState('query');

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

  // Auto-map filters
  useEffect(() => {
    let updated = false;
    let newMappings = [...(form.parameterMappings || [])];
    
    variables.forEach(variable => {
      const exists = newMappings.some(m => m.target?.[1]?.[1] === variable);
      if (!exists) {
        const matchingFilter = (filters || []).find(f => f.slug === variable);
        if (matchingFilter) {
          newMappings.push({
            parameter_id: matchingFilter.id,
            target: ['dimension', ['template-tag', variable]]
          });
          updated = true;
        }
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
    
    if (filterId) {
      newMappings.push({
        parameter_id: filterId,
        target: ['dimension', ['template-tag', variable]]
      });
    }
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
      const result = await runQuery(toPreviewSql(form.query));
      setQueryResult(result);
    } catch (e) {
      setQueryError(e.response?.data?.error || e.message);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <div style={styles.header}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1a1b1f' }}>Edit Dashboard Card</h3>
            <span style={{ fontSize: 11, color: '#868e96' }}>Configure layout, query details, and parameters</span>
          </div>
          <button onClick={onClose} style={styles.closeBtn}>✕</button>
        </div>

        {/* Modern Tabs Header */}
        <div style={styles.tabsHeader}>
          <button
            style={{ ...styles.tabButton, ...(activeTab === 'query' ? styles.tabButtonActive : {}) }}
            onClick={() => setActiveTab('query')}
          >
            📝 SQL Query & Preview
          </button>
          <button
            style={{ 
              ...styles.tabButton, 
              ...(activeTab === 'variables' ? styles.tabButtonActive : {}),
              ...(variables.length === 0 ? styles.tabButtonDisabled : {}) 
            }}
            onClick={() => variables.length > 0 && setActiveTab('variables')}
            disabled={variables.length === 0}
            title={variables.length === 0 ? "No SQL variables (e.g. {{name}}) detected in the query" : "Configure filter tag variables"}
          >
            🔍 Variables & Field Filters {variables.length > 0 && <span style={styles.badgeCount}>{variables.length}</span>}
          </button>
          <button
            style={{ ...styles.tabButton, ...(activeTab === 'layout' ? styles.tabButtonActive : {}) }}
            onClick={() => setActiveTab('layout')}
          >
            📐 Layout & Size
          </button>
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
            <div style={{ position: 'relative', marginTop: 6 }}>
              <textarea
                style={{ ...styles.input, height: 160, fontFamily: 'monospace', fontSize: 12, paddingBottom: 40, lineHeight: 1.5, background: '#fafafa' }}
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
            <label style={{ ...styles.label, marginTop: 0 }}>SQL Variable Settings & Filter Mappings</label>
            <p style={{ margin: '4px 0 12px 0', fontSize: 12, color: '#6c757d', lineHeight: 1.4 }}>
              Map SQL template variables (e.g. <code>{"{{variable}}"}</code>) to dashboard filters, and configure their database dimensions:
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

                return (
                  <div key={variable} style={styles.variableConfigCard}>
                    <div style={styles.variableConfigHeader}>
                      <span style={styles.variableBadge}>{"{{"} {variable} {"}}"}</span>
                      <span style={{ fontSize: 11, color: '#868e96', fontWeight: 500 }}>
                        {currentTag.type === 'dimension' ? '🔗 Field Filter' : '📝 Simple Tag'}
                      </span>
                    </div>
                    
                    <div style={styles.variableConfigGrid}>
                      <div>
                        <span style={styles.miniLabel}>Variable Type</span>
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

                      <div>
                        <span style={styles.miniLabel}>Dashboard Filter</span>
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

                      {currentTag.type === 'dimension' && (
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
                      )}
                    </div>
                  </div>
                );
              })}
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
  modal: { background: '#fff', borderRadius: 12, padding: 24, width: 720, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.15)' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  closeBtn: { background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#6c757d' },
  label: { display: 'block', fontSize: 12, fontWeight: 600, color: '#495057', marginBottom: 4, marginTop: 12 },
  input: { width: '100%', padding: '8px 10px', border: '1px solid #ced4da', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' },
  detailBox: { marginTop: 12, padding: 12, border: '1px solid #dee2e6', borderRadius: 8, background: '#f8f9fa' },
  detailDescription: { marginBottom: 10, color: '#495057', fontSize: 12, lineHeight: 1.4 },
  detailGrid: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 },
  detailLabel: { display: 'block', color: '#868e96', fontSize: 10, fontWeight: 700, textTransform: 'uppercase' },
  detailValue: { display: 'block', color: '#212529', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  hintBox: { marginBottom: 8, padding: '8px 10px', background: '#fff9db', border: '1px solid #ffe066', borderRadius: 6, color: '#5c4900', fontSize: 12, lineHeight: 1.4 },
  runBtn: {
    position: 'absolute', bottom: 8, right: 8,
    padding: '4px 12px', background: '#2f9e44', color: '#fff',
    border: 'none', borderRadius: 5, cursor: 'pointer', fontSize: 12, fontWeight: 600,
  },
  errorBox: { marginTop: 8, padding: '8px 12px', background: '#fff5f5', border: '1px solid #ffc9c9', borderRadius: 6, color: '#c92a2a', fontSize: 12 },
  resultBox: { marginTop: 8, border: '1px solid #dee2e6', borderRadius: 6, overflow: 'hidden' },
  resultMeta: { padding: '6px 10px', background: '#f8f9fa', fontSize: 11, color: '#868e96', borderBottom: '1px solid #dee2e6' },
  tableWrap: { overflowX: 'auto', maxHeight: 220, overflowY: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 12 },
  th: { padding: '6px 10px', background: '#f1f3f5', borderBottom: '1px solid #dee2e6', textAlign: 'left', fontWeight: 600, color: '#495057', whiteSpace: 'nowrap' },
  td: { padding: '5px 10px', borderBottom: '1px solid #f1f3f5', color: '#212529', whiteSpace: 'nowrap' },
  moreRows: { padding: '6px 10px', fontSize: 11, color: '#868e96', background: '#f8f9fa', textAlign: 'center' },
  footer: { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 },
  cancelBtn: { padding: '8px 16px', border: '1px solid #ced4da', borderRadius: 6, background: '#fff', cursor: 'pointer' },
  saveBtn: { padding: '8px 16px', border: 'none', borderRadius: 6, background: '#4c6ef5', color: '#fff', cursor: 'pointer', fontWeight: 600 },
  mappingBox: { marginTop: 12, padding: 12, border: '1px solid #dee2e6', borderRadius: 8, background: '#f8f9fa' },
  mappingGrid: { display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 },
  mappingRow: { display: 'flex', alignItems: 'center', gap: 10, background: '#fff', border: '1px solid #dee2e6', borderRadius: 6, padding: '6px 10px' },
  variableBadge: { fontSize: 11, fontFamily: 'monospace', fontWeight: 600, color: '#4c6ef5', background: '#edf2ff', padding: '2px 6px', borderRadius: 4 },
  mappingSelect: { flex: 1, padding: '4px 6px', border: '1px solid #ced4da', borderRadius: 5, fontSize: 12, minWidth: 100 },
  variableConfigCard: {
    background: '#fff',
    border: '1px solid #dee2e6',
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
  },
  variableConfigHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    borderBottom: '1px dashed #f1f3f5',
    paddingBottom: 6,
  },
  variableConfigGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: 8,
  },
  miniLabel: {
    display: 'block',
    fontSize: 10,
    fontWeight: 700,
    color: '#868e96',
    textTransform: 'uppercase',
    marginBottom: 2,
    marginTop: 4,
  },
  tabsHeader: {
    display: 'flex',
    gap: 8,
    borderBottom: '2px solid #e9ecef',
    paddingBottom: 0,
    marginBottom: 16,
    marginTop: 12,
  },
  tabButton: {
    background: 'none',
    border: 'none',
    borderBottom: '3px solid transparent',
    padding: '8px 16px',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 600,
    color: '#495057',
    transition: 'all 0.2s',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  tabButtonActive: {
    color: '#4c6ef5',
    borderBottomColor: '#4c6ef5',
  },
  tabButtonDisabled: {
    color: '#adb5bd',
    cursor: 'not-allowed',
    opacity: 0.6,
  },
  badgeCount: {
    background: '#edf2ff',
    color: '#4c6ef5',
    fontSize: 10,
    fontWeight: 700,
    padding: '1px 6px',
    borderRadius: 999,
  },
};
