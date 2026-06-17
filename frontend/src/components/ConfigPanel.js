import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { actions } from '../store';
import { listCollections, getFieldValues } from '../services/api';

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

const getFilterTypeColor = (type = '') => {
  if (type.startsWith('date')) return '#f59e0b';
  if (type.startsWith('number')) return '#10b981';
  return '#4c6ef5';
};

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
  const { collection, dashboard, filters, groups, whereConditions } = useSelector(s => s.builder.config);
  const metadata = useSelector(s => s.builder.metadata);

  const [newGroup, setNewGroup] = useState('');
  const [newTab, setNewTab] = useState('');
  const [collections, setCollections] = useState([]);
  const [isCreatingNew, setIsCreatingNew] = useState(false);

  // Custom filter form states
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customName, setCustomName] = useState('');
  const [selectedTable, setSelectedTable] = useState('');
  const [selectedField, setSelectedField] = useState('');
  const [customType, setCustomType] = useState('string/=');
  const [isFieldFilter, setIsFieldFilter] = useState(true);
  const [fieldValuesCache, setFieldValuesCache] = useState({});
  const [loadingFieldValues, setLoadingFieldValues] = useState(null);

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

  useEffect(() => {
    listCollections()
      .then(data => {
        const list = Array.isArray(data) ? data : (data.data || []);
        setCollections(list);
        
        if (!collection.name) {
          setIsCreatingNew(true);
        } else {
          const exists = list.some(c => c.name.toLowerCase() === collection.name.toLowerCase());
          if (!exists) {
            setIsCreatingNew(true);
          }
        }
      })
      .catch(err => {
        console.error('Failed to load collections:', err);
        setIsCreatingNew(true);
      });
  }, [collection.name]);

  const handleCollectionChange = (val) => {
    if (val === '__new__') {
      setIsCreatingNew(true);
      dispatch(actions.setCollection({ name: '', description: '', parentId: null }));
    } else {
      setIsCreatingNew(false);
      const selected = collections.find(c => c.name === val);
      if (selected) {
        dispatch(actions.setCollection({
          name: selected.name,
          description: selected.description || '',
          parentId: selected.parent_id || selected.parentId || null
        }));
      } else {
        dispatch(actions.setCollection({ name: '', description: '', parentId: null }));
      }
    }
  };

  const handleAddPredefined = (typeKey) => {
    if (!typeKey) return;
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

  const activeTableObj = metadata?.tables?.find(t => String(t.id) === selectedTable || t.name === selectedTable);

  return (
    <div style={styles.panel}>
      {/* 1. Collection Section */}
      <Section title="📁 Collection">
        <Field label="Select Collection">
          <select
            style={styles.input}
            value={isCreatingNew ? '__new__' : collection.name}
            onChange={e => handleCollectionChange(e.target.value)}
          >
            {!collection.name && <option value="">-- Select Collection --</option>}
            {collections.map(c => (
              <option key={c.id} value={c.name}>{c.name}</option>
            ))}
            {collection.name && !collections.some(c => c.name.toLowerCase() === collection.name.toLowerCase()) && (
              <option value={collection.name}>{collection.name}</option>
            )}
            <option value="__new__">+ New Collection</option>
          </select>
        </Field>

        {isCreatingNew && (
          <>
            <Field label="Collection Name">
              <input
                style={styles.input}
                value={collection.name}
                placeholder="Type collection name..."
                onChange={e => dispatch(actions.setCollection({ name: e.target.value }))}
              />
            </Field>
            <Field label="Collection Description">
              <input
                style={styles.input}
                value={collection.description}
                placeholder="Type collection description..."
                onChange={e => dispatch(actions.setCollection({ description: e.target.value }))}
              />
            </Field>
          </>
        )}
      </Section>

      {/* 2. Global WHERE Conditions Section */}
      <Section title="🔍 Global WHERE Conditions">
        <span style={styles.helpText}>Injected dynamically into all metrics.</span>
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
            <div key={index} style={styles.whereCard}>
              {parsed.type === 'operator' ? (
                <div style={{ width: '100%' }}>
                  <div style={styles.whereLabel}>
                    {parsed.label}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
                    <input
                      style={styles.whereInput}
                      value={parsed.value}
                      placeholder="value..."
                      onChange={e => handleChange(e.target.value)}
                    />
                    <button style={styles.removeBtnSmall} onClick={() => dispatch(actions.removeWhereCondition(index))}>✕</button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%' }}>
                  <input
                    style={styles.whereInput}
                    value={cond}
                    placeholder="e.g. {{state}} or state = 'Karnataka'"
                    onChange={e => handleChange(e.target.value)}
                  />
                  <button style={styles.removeBtnSmall} onClick={() => dispatch(actions.removeWhereCondition(index))}>✕</button>
                </div>
              )}
            </div>
          );
        })}
        <button
          style={{ ...styles.addBtn, width: '100%', marginTop: 8 }}
          onClick={() => dispatch(actions.addWhereCondition(''))}
        >
          + Add WHERE Condition
        </button>
      </Section>

      {/* 3. Filters Section */}
      <Section title="🎛️ Dashboard Filters">
        {filters.map(f => {
          const typeColor = getFilterTypeColor(f.type);
          const typeIcon = getFilterTypeIcon(f);

          return (
            <div key={f.id} style={{ ...styles.filterCard, borderLeft: `4px solid ${typeColor}` }}>
              <div style={styles.filterHeader}>
                <span style={{ fontSize: 14 }}>{typeIcon}</span>
                <span style={styles.filterTitle}>{f.name || f.slug}</span>
                <span style={styles.slugBadge}>{f.slug}</span>
                <button style={styles.removeBtn} onClick={() => dispatch(actions.removeFilter(f.id))}>✕</button>
              </div>
              
              <div style={styles.mappingBadge}>
                {f.fieldId ? (
                  <span>🔗 <b>{f.tableName}.{f.fieldName}</b> <span style={{ opacity: 0.6 }}>(ID: {typeof f.fieldId === 'object' && f.fieldId !== null ? (f.fieldId['lib/uuid'] || JSON.stringify(f.fieldId)) : f.fieldId})</span></span>
                ) : (
                  <span>📝 Simple filter (unmapped)</span>
                )}
              </div>

              <Field label="Name">
                <input style={styles.input} value={f.name || ''}
                  onChange={e => dispatch(actions.updateFilter({ ...f, name: e.target.value }))} />
              </Field>
              <Field label="Slug">
                <input style={{ ...styles.input, fontFamily: 'monospace', fontSize: 11 }} value={f.slug || ''}
                  onChange={e => dispatch(actions.updateFilter({ ...f, slug: e.target.value }))} />
              </Field>
              <div style={styles.twoCol}>
                <Field label="Type">
                  <select style={styles.input} value={f.type || 'string/='}
                    onChange={e => dispatch(actions.updateFilter({ ...f, type: e.target.value, sectionId: e.target.value.split('/')[0] }))}>
                    {TYPE_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.icon} {opt.label}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Widget Type">
                  <select style={styles.input} value={f.values_source_type === 'static-list' ? 'dropdown' : 'input'}
                    onChange={e => {
                      const nextVal = e.target.value === 'dropdown' ? 'static-list' : null;
                      dispatch(actions.updateFilter({ ...f, values_source_type: nextVal, values_source_config: nextVal === 'static-list' ? (f.values_source_config || { values: [] }) : null }));
                    }}>
                    <option value="input">Input Box</option>
                    <option value="dropdown">Dropdown</option>
                  </select>
                </Field>
              </div>

              <Field label="Default Value">
                <input 
                  style={styles.input} 
                  value={f.default || ''} 
                  placeholder="e.g. Monthly"
                  onChange={e => dispatch(actions.updateFilter({ ...f, default: e.target.value || null }))} 
                />
              </Field>

              <label style={styles.checkLabel}>
                <input type="checkbox" checked={Boolean(f.required)}
                  onChange={e => dispatch(actions.updateFilter({ ...f, required: e.target.checked }))} />
                Required
              </label>

              <div style={styles.linkedFiltersSection}>
                <span style={styles.linkedFiltersTitle}>🔗 Limit choices by:</span>
                {filters.filter(other => other.id !== f.id).map(other => {
                  const isChecked = (f.filteringParameters || []).includes(other.id);
                  return (
                    <label key={other.id} style={styles.linkedFilterLabel}>
                      <input 
                        type="checkbox" 
                        checked={isChecked} 
                        onChange={e => {
                          const current = f.filteringParameters || [];
                          const updated = e.target.checked 
                            ? [...current, other.id] 
                            : current.filter(id => id !== other.id);
                          dispatch(actions.updateFilter({ ...f, filteringParameters: updated }));
                        }} 
                      />
                      {other.name || other.slug}
                    </label>
                  );
                })}
                {filters.filter(other => other.id !== f.id).length === 0 && (
                  <span style={styles.noFiltersText}>No other filters to link</span>
                )}
              </div>

              {f.values_source_type === 'static-list' && (
                <div style={styles.staticSection}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span style={styles.staticTitle}>Static Options</span>
                    {f.fieldId && (
                      <button
                        style={{ ...styles.addBtn, padding: '3px 8px', fontSize: 10, background: '#0ea5e9' }}
                        onClick={() => loadFieldValues(f)}
                        disabled={loadingFieldValues === f.id}
                      >
                        {loadingFieldValues === f.id ? '⏳ Loading...' : '⬇ Load from DB'}
                      </button>
                    )}
                  </div>
                  {fieldValuesCache[f.fieldId] && (
                    <div style={{ fontSize: 10, color: '#64748b', marginBottom: 6 }}>
                      📊 {fieldValuesCache[f.fieldId].length} values available from <b>{f.tableName}.{f.fieldName}</b>
                    </div>
                  )}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                    {(f.values_source_config?.values || []).map((val, idx) => (
                      <span key={idx} style={styles.staticOptionBadge}>
                        {val}
                        <span 
                          style={styles.deleteBadgeCross} 
                          onClick={() => {
                            const newValues = (f.values_source_config?.values || []).filter((_, i) => i !== idx);
                            dispatch(actions.updateFilter({
                              id: f.id,
                              values_source_config: {
                                ...f.values_source_config,
                                values: newValues
                              }
                            }));
                          }}
                        >
                          ✕
                        </span>
                      </span>
                    ))}
                    {(f.values_source_config?.values || []).length === 0 && (
                      <span style={{ fontSize: 11, color: '#94a3b8', fontStyle: 'italic' }}>No options added yet</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <input
                      style={styles.whereInput}
                      placeholder="New option..."
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const val = e.target.value.trim();
                          if (val) {
                            const currentValues = f.values_source_config?.values || [];
                            if (!currentValues.includes(val)) {
                              dispatch(actions.updateFilter({
                                id: f.id,
                                values_source_config: {
                                  ...f.values_source_config,
                                  values: [...currentValues, val]
                                }
                              }));
                            }
                            e.target.value = '';
                          }
                        }
                      }}
                    />
                    <button
                      style={{ ...styles.addBtn, padding: '4px 10px', fontSize: 14 }}
                      onClick={e => {
                        const input = e.target.previousSibling;
                        const val = input.value.trim();
                        if (val) {
                          const currentValues = f.values_source_config?.values || [];
                          if (!currentValues.includes(val)) {
                            dispatch(actions.updateFilter({
                              id: f.id,
                              values_source_config: {
                                ...f.values_source_config,
                                values: [...currentValues, val]
                              }
                            }));
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
          );
        })}

        {/* Predefined Add Filter Dropdown */}
        <div style={{ marginTop: 12 }}>
          <span style={styles.miniLabel}>+ Quick Add (Predefined)</span>
          <select 
            style={styles.predefSelect} 
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

        {/* Custom Filter Form Toggle */}
        {!showCustomForm ? (
          <button 
            style={{ ...styles.addBtn, width: '100%', background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', marginTop: 6, padding: '8px 12px' }} 
            onClick={() => { setShowCustomForm(true); setIsFieldFilter(true); }}
          >
            + Add Custom Filter
          </button>
        ) : (
          <div style={styles.customForm}>
            <span style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 10, color: '#1e293b' }}>
              ✨ Add Custom Filter
            </span>
            <Field label="Filter Name">
              <input 
                style={styles.input} 
                value={customName} 
                placeholder="e.g. Organization" 
                onChange={e => setCustomName(e.target.value)} 
              />
            </Field>

            <label style={{ ...styles.checkLabel, marginBottom: 12, marginTop: 10 }}>
              <input 
                type="checkbox" 
                checked={isFieldFilter} 
                onChange={e => setIsFieldFilter(e.target.checked)} 
              />
              <span>Map to Database Field</span>
              <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 400 }}>(Field Filter)</span>
            </label>

            {isFieldFilter && (
              <>
                <Field label="Table">
                  <select 
                    style={styles.input} 
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
                    style={styles.input} 
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

            <Field label="Filter Type">
              <select style={styles.input} value={customType} onChange={e => setCustomType(e.target.value)}>
                {TYPE_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.icon} {opt.label}</option>
                ))}
              </select>
            </Field>
            <div style={{ display: 'flex', gap: 6, marginTop: 14 }}>
              <button 
                style={{ ...styles.addBtn, flex: 1, background: '#64748b' }} 
                onClick={() => setShowCustomForm(false)}
              >
                Cancel
              </button>
              <button 
                style={{ ...styles.addBtn, flex: 1 }} 
                onClick={handleAddCustomFilter}
                disabled={!customName || (isFieldFilter && (!selectedTable || !selectedField))}
              >
                Add Filter
              </button>
            </div>
          </div>
        )}
      </Section>

      {/* 4. Dashboard Details */}
      <Section title="📊 Dashboard">
        <Field label="Name">
          <input style={styles.input} value={dashboard.name}
            onChange={e => dispatch(actions.setDashboardMeta({ name: e.target.value }))} />
        </Field>
        <Field label="Description">
          <input style={styles.input} value={dashboard.description}
            onChange={e => dispatch(actions.setDashboardMeta({ description: e.target.value }))} />
        </Field>
        <Field label="Pin to top">
          <input type="checkbox" checked={dashboard.pin}
            onChange={e => dispatch(actions.setDashboardMeta({ pin: e.target.checked }))} />
        </Field>
      </Section>

      {/* 5. Tabs Section */}
      <Section title="📑 Tabs">
        {dashboard.tabs.map((tab, i) => (
          <div key={i} style={styles.tag}>
            {tab.name}
            <button style={styles.removeBtn} onClick={() => dispatch(actions.removeTab(i))}>✕</button>
          </div>
        ))}
        <div style={styles.addRow}>
          <input style={styles.input} value={newTab} placeholder="Tab name"
            onChange={e => setNewTab(e.target.value)} />
          <button style={styles.addBtn} onClick={() => { if (newTab) { dispatch(actions.addTab(newTab)); setNewTab(''); } }}>+</button>
        </div>
      </Section>

      {/* 6. Groups Section */}
      <Section title="👥 Groups">
        {groups.map((g, i) => (
          <div key={i} style={styles.tag}>
            {g.name}
            <button style={styles.removeBtn} onClick={() => dispatch(actions.removeGroup(i))}>✕</button>
          </div>
        ))}
        <div style={styles.addRow}>
          <input style={styles.input} value={newGroup} placeholder="Group name"
            onChange={e => setNewGroup(e.target.value)} />
          <button style={styles.addBtn} onClick={() => { if (newGroup) { dispatch(actions.addGroup(newGroup)); setNewGroup(''); } }}>+</button>
        </div>
      </Section>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 24, borderBottom: '1px solid #e2e8f0', paddingBottom: 16 }}>
      <div style={styles.sectionHeader}>{title}</div>
      {children}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <label style={styles.fieldLabel}>{label}</label>
      {children}
    </div>
  );
}

const styles = {
  panel: { width: 320, background: '#f8fafc', borderLeft: '1px solid #e2e8f0', padding: 20, overflowY: 'auto', flexShrink: 0 },
  sectionHeader: { fontSize: 12, fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 14, background: '#f1f5f9', padding: '8px 10px', borderRadius: 6, borderLeft: '3px solid #4f46e5' },
  fieldLabel: { fontSize: 11, color: '#475569', display: 'block', marginBottom: 4, fontWeight: 600 },
  input: { width: '100%', padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 12, boxSizing: 'border-box', outline: 'none', transition: 'all 0.2s', background: '#fff' },
  addRow: { display: 'flex', gap: 6, marginTop: 8 },
  addBtn: { padding: '7px 14px', background: '#4f46e5', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 700, fontSize: 12, transition: 'all 0.15s' },
  tag: { display: 'flex', alignItems: 'center', gap: 8, background: '#fff', borderRadius: 8, padding: '8px 12px', marginBottom: 6, fontSize: 12, fontWeight: 600, color: '#334155', border: '1px solid #e2e8f0', boxShadow: '0 1px 2px rgba(0,0,0,0.03)' },
  filterCard: { border: '1px solid #e2e8f0', borderRadius: 10, padding: 14, marginBottom: 10, background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', transition: 'all 0.2s' },
  filterHeader: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, borderBottom: '1px solid #f1f5f9', paddingBottom: 8 },
  filterTitle: { fontSize: 13, fontWeight: 700, color: '#0f172a', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  slugBadge: { fontSize: 10, fontFamily: 'monospace', fontWeight: 600, color: '#64748b', background: '#f1f5f9', padding: '2px 6px', borderRadius: 4, border: '1px solid #e2e8f0' },
  mappingBadge: { fontSize: 10, color: '#475569', marginBottom: 10, background: '#f8fafc', padding: '6px 10px', borderRadius: 6, border: '1px solid #f1f5f9' },
  twoCol: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 },
  checkLabel: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#475569', marginTop: 8, fontWeight: 500, cursor: 'pointer' },
  removeBtn: { marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 13, transition: 'color 0.2s', padding: '2px 4px', borderRadius: 4 },
  removeBtnSmall: { background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 12, transition: 'color 0.2s', flexShrink: 0, padding: '2px 4px' },
  whereCard: { display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 12px', boxShadow: '0 1px 2px rgba(0,0,0,0.03)', width: '100%', boxSizing: 'border-box' },
  whereLabel: { fontSize: 11, fontWeight: 600, color: '#334155', fontFamily: 'monospace', display: 'block', background: '#f1f5f9', padding: '6px 10px', borderRadius: 6, border: '1px solid #e2e8f0', wordBreak: 'break-all', whiteSpace: 'normal', width: '100%', boxSizing: 'border-box', lineHeight: 1.4 },
  whereInput: { flex: 1, padding: '7px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 12, boxSizing: 'border-box', outline: 'none', transition: 'all 0.2s', background: '#fff' },
  helpText: { fontSize: 11, color: '#64748b', display: 'block', marginBottom: 10, fontStyle: 'italic' },
  miniLabel: { display: 'block', fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 4, letterSpacing: '0.03em' },
  predefSelect: { width: '100%', padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 12, outline: 'none', background: '#fff', marginBottom: 8 },
  customForm: { border: '1px solid #cbd5e1', borderRadius: 10, padding: 16, marginTop: 10, background: '#fff', boxShadow: '0 2px 6px rgba(0,0,0,0.05)' },
  staticSection: { marginTop: 12, borderTop: '1px dashed #e2e8f0', paddingTop: 10 },
  staticTitle: { fontSize: 10, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.03em' },
   staticOptionBadge: { display: 'inline-flex', alignItems: 'center', gap: 4, background: '#e0e7ff', color: '#3730a3', padding: '3px 8px', borderRadius: 5, fontSize: 11, fontWeight: 600, border: '1px solid #c7d2fe' },
  deleteBadgeCross: { cursor: 'pointer', color: '#4f46e5', fontWeight: 700, fontSize: 10, marginLeft: 3 },
  linkedFiltersSection: { marginTop: 12, borderTop: '1px dashed #e2e8f0', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 6 },
  linkedFiltersTitle: { fontSize: 10, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.03em' },
  linkedFilterLabel: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#475569', fontWeight: 500, cursor: 'pointer' },
  noFiltersText: { fontSize: 11, color: '#94a3b8', fontStyle: 'italic' },
};
