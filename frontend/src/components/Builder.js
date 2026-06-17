import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { actions } from '../store';
import { saveDashboard, publishDashboard, listDatabases, getDatabaseMetadata } from '../services/api';
import CardPalette from './CardPalette';
import DashboardCanvas from './DashboardCanvas';
import ConfigPanel from './ConfigPanel';

export default function Builder({ onBack }) {
  const dispatch = useDispatch();
  const state = useSelector(s => s.builder);
  const tabs = state.config.dashboard.tabs;
  const [activeTab, setActiveTab] = useState(tabs.length > 0 ? 0 : null);

  useEffect(() => {
    if (tabs.length === 0) {
      if (activeTab !== null) {
        setActiveTab(null);
      }
    } else {
      if (activeTab === null) {
        setActiveTab(0);
      } else if (activeTab >= tabs.length) {
        setActiveTab(tabs.length - 1);
      }
    }
  }, [tabs, activeTab]);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    const fetchMeta = async () => {
      try {
        const dbs = await listDatabases();
        const dbList = dbs?.data || dbs || [];
        const activeDb = dbList.find(d => d.name === 'mitra5') || dbList[0];
        if (activeDb) {
          const meta = await getDatabaseMetadata(activeDb.id);
          dispatch(actions.setMetadata(meta));
        }
      } catch (err) {
        console.error('Failed to load database metadata in Builder:', err);
      }
    };
    fetchMeta();
  }, [dispatch]);

  const filters = state.config.filters;
  const metadata = state.metadata;

  useEffect(() => {
    if (!metadata || !filters || filters.length === 0) return;
    
    let updated = false;
    const newFilters = filters.map(f => {
      // Case 1: Has fieldId but missing tableName/fieldName (imported from Metabase)
      if (f.fieldId && (!f.tableName || !f.fieldName)) {
        for (const table of metadata.tables || []) {
          const field = table.fields?.find(fieldObj => fieldObj.id === f.fieldId);
          if (field) {
            updated = true;
            return {
              ...f,
              tableName: table.name,
              fieldName: field.name,
              databaseId: metadata.id || f.databaseId || 3,
            };
          }
        }
      }
      
      // Case 2: Has tableName/fieldName but missing fieldId (added predefined or custom before metadata loaded)
      if (f.tableName && f.fieldName && !f.fieldId) {
        const table = metadata.tables?.find(t => t.name === f.tableName || t.display_name === f.tableName);
        const field = table?.fields?.find(fieldObj => fieldObj.name === f.fieldName || fieldObj.display_name === f.fieldName);
        if (field) {
          updated = true;
          return {
            ...f,
            fieldId: field.id,
            databaseId: metadata.id || f.databaseId || 3,
          };
        }
      }

      // Case 3: Simple filter tag with no fieldId, tableName, fieldName (from Metabase import)
      // but matches standard filter slugs. We auto-bind it to database fields.
      if (!f.fieldId && !f.tableName && !f.fieldName) {
        let tableName = '';
        let fieldName = '';
        let type = f.type || 'string/=';

        const slug = f.slug?.toLowerCase();
        if (slug === 'program') {
          tableName = 'programs';
          fieldName = 'name';
        } else if (slug === 'leader_category') {
          tableName = 'leader_category';
          fieldName = 'name';
        } else if (slug === 'state') {
          tableName = 'submissions';
          fieldName = 'state';
        } else if (slug === 'district') {
          tableName = 'submissions';
          fieldName = 'district';
        } else if (slug === 'date') {
          tableName = 'submissions';
          fieldName = 'created_at';
          type = 'date/range';
        }

        if (tableName && fieldName) {
          const table = metadata.tables?.find(t => t.name === tableName);
          const field = table?.fields?.find(fieldObj => fieldObj.name === fieldName);
          if (field) {
            updated = true;
            return {
              ...f,
              tableName,
              fieldName,
              fieldId: field.id,
              databaseId: metadata.id || f.databaseId || 3,
              type,
              sectionId: type.split('/')[0]
            };
          }
        }
      }
      
      return f;
    });

    if (updated) {
      dispatch(actions.updateFilters(newFilters));
    }
  }, [metadata, filters, dispatch]);

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await saveDashboard({
        id: state.id,
        name: state.name,
        description: state.description,
        config: state.config,
        metabase_dashboard_id: state.metabase_dashboard_id || null,
        metabase_collection_id: state.metabase_collection_id || null,
        metabase_card_ids: state.metabase_card_ids || {},
      });
      setMessage({ type: 'success', text: 'Saved!' });
    } catch (e) {
      setMessage({ type: 'error', text: e.response?.data?.error || e.message });
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    setPublishing(true);
    setMessage(null);
    try {
      await saveDashboard({
        id: state.id,
        name: state.name,
        description: state.description,
        config: state.config,
        metabase_dashboard_id: state.metabase_dashboard_id || null,
        metabase_collection_id: state.metabase_collection_id || null,
        metabase_card_ids: state.metabase_card_ids || {},
      });
      console.log(state, 'statess')
      const res = await publishDashboard(state.id);
      dispatch(actions.setStatus('published'));
      setMessage({ type: 'success', text: `Published to Metabase! Dashboard ID: ${res.dashboardId}` });
    } catch (e) {
      setMessage({ type: 'error', text: e.response?.data?.error || e.message });
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div style={styles.root}>
      {/* Top toolbar */}
      <div style={styles.toolbar}>
        <button style={styles.backBtn} onClick={onBack}>← Back</button>
        <div style={styles.titleArea}>
          <input
            style={styles.titleInput}
            value={state.name}
            onChange={e => dispatch(actions.setMeta({ name: e.target.value }))}
          />
          <span style={{ ...styles.statusBadge, background: state.status === 'published' ? '#d3f9d8' : '#fff3bf' }}>
            {state.status}
          </span>
        </div>
        {message && (
          <span style={{ fontSize: 12, color: message.type === 'success' ? '#2f9e44' : '#c92a2a', marginRight: 12 }}>
            {message.text}
          </span>
        )}
        <button style={styles.saveBtn} onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save Draft'}
        </button>
        <button style={styles.publishBtn} onClick={handlePublish} disabled={publishing}>
          {publishing ? 'Publishing…' : '🚀 Publish to Metabase'}
        </button>
      </div>

      {/* Tab bar */}
      {tabs.length > 0 && (
        <div style={styles.tabBar}>
          {tabs.map((tab, i) => (
            <button key={i} style={{ ...styles.tab, ...(activeTab === i ? styles.activeTab : {}) }} onClick={() => setActiveTab(i)}>
              {tab.name}
            </button>
          ))}
        </div>
      )}

      {/* Main area */}
      <div style={styles.main}>
        <CardPalette onAdd={card => dispatch(actions.addCard({ ...card, tabIndex: activeTab ?? undefined }))} />
        <DashboardCanvas activeTab={activeTab} />
        <ConfigPanel />
      </div>
    </div>
  );
}

const styles = {
  root: { display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: 'system-ui, -apple-system, sans-serif', color: '#0f172a', background: '#f1f5f9' },
  toolbar: { display: 'flex', alignItems: 'center', gap: 16, padding: '14px 24px', background: '#fff', borderBottom: '1px solid #e2e8f0', flexShrink: 0, boxShadow: '0 1px 3px rgba(0,0,0,0.02)' },
  backBtn: { padding: '8px 16px', border: '1px solid #cbd5e1', borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#475569', transition: 'all 0.2s' },
  titleArea: { display: 'flex', alignItems: 'center', gap: 12, flex: 1 },
  titleInput: { fontSize: 18, fontWeight: 700, border: 'none', outline: 'none', background: 'transparent', minWidth: 250, color: '#0f172a', padding: '4px 8px', borderRadius: 6, transition: 'all 0.2s' },
  statusBadge: { fontSize: 11, padding: '3px 10px', borderRadius: 999, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.025em' },
  saveBtn: { padding: '8px 16px', border: '1px solid #cbd5e1', borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#334155', transition: 'all 0.2s' },
  publishBtn: { padding: '8px 20px', border: 'none', borderRadius: 8, background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 13, boxShadow: '0 2px 8px rgba(16, 185, 129, 0.25)', transition: 'all 0.2s' },
  tabBar: { display: 'flex', gap: 6, padding: '10px 24px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' },
  tab: { padding: '6px 16px', border: '1px solid #cbd5e1', borderRadius: 999, background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#475569', transition: 'all 0.2s' },
  activeTab: { background: '#4f46e5', color: '#fff', borderColor: '#4f46e5', boxShadow: '0 2px 4px rgba(79, 70, 229, 0.15)' },
  main: { display: 'flex', flex: 1, overflow: 'hidden' },
};
