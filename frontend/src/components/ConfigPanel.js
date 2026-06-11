import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { actions } from '../store';
import { listCollections } from '../services/api';

export default function ConfigPanel() {
  const dispatch = useDispatch();
  const { collection, dashboard, filters, groups } = useSelector(s => s.builder.config);
  const [newGroup, setNewGroup] = useState('');
  const [newFilter, setNewFilter] = useState({ name: '', type: 'string/=' });
  const [newTab, setNewTab] = useState('');
  const [collections, setCollections] = useState([]);
  const [isCreatingNew, setIsCreatingNew] = useState(false);

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

  return (
    <div style={styles.panel}>
      <Section title="Collection">
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

      <Section title="Dashboard">
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

      <Section title="Tabs">
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

      <Section title="Filters">
        {filters.map(f => (
          <div key={f.id} style={styles.filterCard}>
            <div style={styles.filterHeader}>
              <span style={styles.filterTitle}>{f.slug || f.name}</span>
              <button style={styles.removeBtn} onClick={() => dispatch(actions.removeFilter(f.id))}>✕</button>
            </div>
            <Field label="Name">
              <input style={styles.input} value={f.name || ''}
                onChange={e => dispatch(actions.updateFilter({ ...f, name: e.target.value }))} />
            </Field>
            <Field label="Slug">
              <input style={styles.input} value={f.slug || ''}
                onChange={e => dispatch(actions.updateFilter({ ...f, slug: e.target.value }))} />
            </Field>
            <div style={styles.twoCol}>
              <Field label="Type">
                <select style={styles.input} value={f.type || 'string/='}
                  onChange={e => dispatch(actions.updateFilter({ ...f, type: e.target.value, sectionId: e.target.value.split('/')[0] }))}>
                  <option value="string/=">string/=</option>
                  <option value="string/contains">string/contains</option>
                  <option value="number/=">number/=</option>
                  <option value="date/range">date/range</option>
                </select>
              </Field>
              <Field label="Source">
                <select style={styles.input} value={f.values_source_type || 'static-list'}
                  onChange={e => dispatch(actions.updateFilter({ ...f, values_source_type: e.target.value }))}>
                  <option value="static-list">static-list</option>
                  <option value="card">card</option>
                  <option value="native-query">native-query</option>
                </select>
              </Field>
            </div>
            <label style={styles.checkLabel}>
              <input type="checkbox" checked={Boolean(f.required)}
                onChange={e => dispatch(actions.updateFilter({ ...f, required: e.target.checked }))} />
              Required
            </label>
          </div>
        ))}
        <div style={styles.addRow}>
          <input style={{ ...styles.input, flex: 1 }} value={newFilter.name} placeholder="Filter name"
            onChange={e => setNewFilter(f => ({ ...f, name: e.target.value }))} />
          <select style={{ ...styles.input, width: 110 }} value={newFilter.type}
            onChange={e => setNewFilter(f => ({ ...f, type: e.target.value }))}>
            <option value="string/=">string/=</option>
            <option value="string/contains">string/contains</option>
            <option value="number/=">number/=</option>
            <option value="date/range">date/range</option>
          </select>
          <button style={styles.addBtn} onClick={() => {
            if (newFilter.name) { dispatch(actions.addFilter(newFilter)); setNewFilter({ name: '', type: 'string/=' }); }
          }}>+</button>
        </div>
      </Section>

      <Section title="Groups">
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
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#868e96', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <label style={{ fontSize: 11, color: '#495057', display: 'block', marginBottom: 3 }}>{label}</label>
      {children}
    </div>
  );
}

const styles = {
  panel: { width: 260, background: '#fff', borderLeft: '1px solid #e2e8f0', padding: 18, overflowY: 'auto', flexShrink: 0 },
  input: { width: '100%', padding: '7px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 12, boxSizing: 'border-box', outline: 'none', transition: 'all 0.2s', background: '#f8fafc' },
  addRow: { display: 'flex', gap: 6, marginTop: 8 },
  addBtn: { padding: '6px 12px', background: '#4f46e5', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 700, fontSize: 12, transition: 'all 0.2s' },
  tag: { display: 'flex', alignItems: 'center', gap: 8, background: '#f1f5f9', borderRadius: 6, padding: '6px 10px', marginBottom: 6, fontSize: 12, fontWeight: 600, color: '#334155', border: '1px solid #e2e8f0' },
  badge: { background: '#dee2e6', borderRadius: 3, padding: '1px 5px', fontSize: 10 },
  filterCard: { border: '1px solid #e2e8f0', borderRadius: 10, padding: 12, marginBottom: 10, background: '#f8fafc', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' },
  filterHeader: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, borderBottom: '1px dashed #e2e8f0', paddingBottom: 6 },
  filterTitle: { fontSize: 12, fontWeight: 700, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  twoCol: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 },
  checkLabel: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#475569', marginTop: 8, fontWeight: 500 },
  removeBtn: { marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 12, transition: 'color 0.2s' },
};
