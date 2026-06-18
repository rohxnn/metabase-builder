import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { actions } from '../store';
import { saveDashboard, publishDashboard, listDatabases, getDatabaseMetadata } from '../services/api';
import CardPalette from './CardPalette';
import DashboardCanvas from './DashboardCanvas';
import ConfigPanel from './ConfigPanel';
import CardEditor from './CardEditor';

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
  const [addingNewQuestion, setAddingNewQuestion] = useState(false);

  useEffect(() => {
    const fetchMeta = async () => {
      try {
        const dbs = await listDatabases();
        const dbList = dbs?.data || dbs || [];
        const activeDb = dbList.find(d => d.name === 'test' || d.name === 'mitra5') || dbList[0];
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
    <div className="flex flex-col h-screen font-sans text-slate-900 bg-slate-100">
      {/* Top toolbar */}
      <div className="flex items-center gap-4 py-3.5 px-6 bg-white border-b border-slate-200 shrink-0 shadow-sm">
        <button
          className="py-2 px-4 border border-slate-300 rounded-lg bg-white cursor-pointer text-xs font-semibold text-slate-600 transition-all hover:bg-slate-50 hover:border-slate-400"
          onClick={onBack}
        >
          ← Back
        </button>
        <div className="flex items-center gap-3 flex-1">
          <input
            className="text-lg font-bold border border-transparent hover:border-slate-200 focus:border-slate-300 outline-none bg-transparent min-w-[250px] text-slate-900 py-1 px-2 rounded-md transition-all focus:bg-slate-50 disabled:hover:border-transparent"
            value={state.name}
            onChange={e => dispatch(actions.setMeta({ name: e.target.value }))}
            disabled={state.previewMode}
          />
          <span
            className={`text-[10px] py-1 px-2.5 rounded-full font-semibold uppercase tracking-wider ${
              state.status === 'published' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
            }`}
          >
            {state.status}
          </span>
        </div>
        {message && (
          <span
            className={`text-xs font-medium mr-3 ${
              message.type === 'success' ? 'text-emerald-700' : 'text-red-700'
            }`}
          >
            {message.text}
          </span>
        )}
        {state.previewMode ? (
          <button
            className="py-2 px-4 border border-indigo-300 rounded-lg bg-indigo-50 cursor-pointer text-xs font-semibold text-indigo-600 transition-all hover:bg-indigo-100"
            onClick={() => dispatch(actions.setPreviewMode(false))}
          >
            📝 Exit Preview
          </button>
        ) : (
          <>
            <button
              className="py-2 px-4 border border-slate-300 rounded-lg bg-white cursor-pointer text-xs font-semibold text-slate-700 transition-all hover:bg-slate-50 hover:border-slate-400"
              onClick={() => dispatch(actions.setPreviewMode(true))}
            >
              👁️ Preview Mode
            </button>
            <button
              className="py-2 px-4 border border-slate-300 rounded-lg bg-white cursor-pointer text-xs font-semibold text-slate-700 transition-all hover:bg-slate-50 hover:border-slate-400 disabled:opacity-50"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? 'Saving…' : 'Save Draft'}
            </button>
            <button
              className="py-2 px-5 border-none rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-600 text-white cursor-pointer font-bold text-xs shadow-md hover:from-emerald-600 hover:to-emerald-700 hover:shadow-lg transition-all disabled:opacity-50"
              onClick={handlePublish}
              disabled={publishing}
            >
              {publishing ? 'Publishing…' : '🚀 Publish to Metabase'}
            </button>
          </>
        )}
      </div>

      {/* Tab bar */}
      {tabs.length > 0 && (
        <div className="flex items-center gap-1.5 py-2.5 px-6 bg-slate-50 border-b border-slate-200">
          {tabs.map((tab, i) => {
            const isActive = activeTab === i;
            return (
              <button
                key={i}
                className={`py-1.5 px-4 border rounded-full cursor-pointer text-xs font-semibold transition-all ${
                  isActive
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm hover:bg-indigo-700'
                    : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50 hover:border-slate-400'
                }`}
                onClick={() => setActiveTab(i)}
              >
                {tab.name}
              </button>
            );
          })}
          {!state.previewMode && (
            <button
              onClick={() => setAddingNewQuestion(true)}
              className="ml-auto w-7 h-7 flex items-center justify-center rounded-full border border-dashed border-slate-300 bg-white text-slate-500 hover:text-indigo-600 hover:border-indigo-500 hover:bg-indigo-50/30 transition-all font-bold text-base cursor-pointer shadow-sm"
              title="Add Question"
            >
              +
            </button>
          )}
        </div>
      )}

      {/* Main area */}
      <div className="flex flex-1 overflow-hidden">
        {!state.previewMode && (
          <CardPalette onAdd={card => dispatch(actions.addCard({ ...card, tabIndex: activeTab ?? undefined }))} />
        )}
        <DashboardCanvas activeTab={activeTab} />
        {!state.previewMode && <ConfigPanel />}
      </div>

      {addingNewQuestion && (
        <CardEditor
          card={{
            title: 'New Question',
            type: 'table',
            query: '',
            parameterMappings: [],
            templateTags: {},
            tabIndex: activeTab ?? undefined,
          }}
          filters={filters}
          onSave={newCard => {
            dispatch(actions.addCard(newCard));
            setAddingNewQuestion(false);
          }}
          onClose={() => setAddingNewQuestion(false)}
        />
      )}
    </div>
  );
}
