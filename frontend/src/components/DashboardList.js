import React, { useEffect, useState } from 'react';
import { v4 as uuidv4, v5 as uuidv5 } from 'uuid';
import { listDashboards, deleteDashboard, publishDashboard, listMetabaseDashboards, getMetabaseDashboard, saveDashboard } from '../services/api';
import { extractAndCleanWhereConditions } from '../services/queryPreview';

const METABASE_DRAFT_NAMESPACE = '9b9c2a8b-5997-4a0c-8f72-2f8f6e2f2b5a';

const emptyConfig = {
  collection: { name: '', description: '', parentId: null },
  dashboard: { name: '', description: '', pin: false, tabs: [] },
  cards: [],
  filters: [],
  groups: [],
};

const asArray = (value) => {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.data)) return value.data;
  return [];
};

const copyText = (value) => `${value || 'Untitled Dashboard'} (Duplicate)`;
const cleanCardTitle = (title) => {
  if (!title) return '';
  return title.replace(/\s*\(Duplicate\)/gi, '').trim();
};
const metabaseDraftId = (id) => uuidv5(`metabase-dashboard:${id}`, METABASE_DRAFT_NAMESPACE);

const cloneConfig = (config = {}, name = '', description = '') => {
  const cloned = JSON.parse(JSON.stringify(config));
  cloned.dashboard = {
    ...(cloned.dashboard || {}),
    name: copyText(cloned.dashboard?.name || name),
    description: cloned.dashboard?.description || description || '',
  };

  // Generate new IDs for filters and build a mapping table
  const filterIdMap = {};
  cloned.filters = asArray(cloned.filters).map(filter => {
    const newId = uuidv4().slice(0, 8);
    if (filter.id) {
      filterIdMap[filter.id] = newId;
    }
    return { ...filter, id: newId };
  });

  cloned.cards = asArray(cloned.cards).map(card => {
    const {
      metabaseCardId,
      metabaseDashcardId,
      dashboardTabId,
      resultMetadata,
      rawDatasetQuery,
      ...localCard
    } = card;

    // Update parameterMappings to refer to the new filter IDs
    const updatedMappings = asArray(card.parameterMappings).map(mapping => {
      const newParamId = filterIdMap[mapping.parameter_id] || mapping.parameter_id;
      return {
        ...mapping,
        parameter_id: newParamId
      };
    });

    return {
      ...localCard,
      id: uuidv4(),
      title: cleanCardTitle(card.title),
      col: (card.col ?? 0) + 1,
      row: (card.row ?? 0) + 1,
      parameterMappings: updatedMappings,
    };
  });

  cloned.groups = asArray(cloned.groups);
  cloned.whereConditions = asArray(cloned.whereConditions);
  return cloned;
};

const METABASE_URL = process.env.REACT_APP_METABASE_URL || 'http://localhost:3000';
const getDashboardLink = (dashboard) => {
  if (dashboard.public_uuid) return `${METABASE_URL}/public/dashboard/${dashboard.public_uuid}`;
  if (dashboard.id) return `${METABASE_URL}/dashboard/${dashboard.id}`;
  return '#';
};

const pickDashcards = (dashboard) => (
  asArray(dashboard.dashcards).length
    ? asArray(dashboard.dashcards)
    : asArray(dashboard.ordered_cards).length
      ? asArray(dashboard.ordered_cards)
      : asArray(dashboard.cards)
);

const getCardQuery = (card = {}) => {
  const datasetQuery = card.dataset_query || card.query || {};

  if (typeof datasetQuery === 'string') return datasetQuery;
  if (Array.isArray(datasetQuery)) return datasetQuery[0]?.query || datasetQuery[0]?.native || '';
  if (datasetQuery.type === 'native') return datasetQuery.native?.query || '';
  if (typeof datasetQuery.native === 'string') return datasetQuery.native;
  if (datasetQuery.native?.query) return datasetQuery.native.query;

  const nativeStage = asArray(datasetQuery.stages).find(stage => stage.native || stage?.native?.query);
  if (typeof nativeStage?.native === 'string') return nativeStage.native;
  if (nativeStage?.native?.query) return nativeStage.native.query;

  if (datasetQuery.type === 'query') {
    return typeof datasetQuery.query === 'string'
      ? datasetQuery.query
      : JSON.stringify(datasetQuery.query || '');
  }

  return '';
};

const getTemplateTags = (card = {}) => {
  const datasetQuery = card.dataset_query || {};
  const nativeStage = asArray(datasetQuery.stages).find(stage => stage['template-tags'] || stage.template_tags);
  if (nativeStage) {
    return nativeStage['template-tags'] || nativeStage.template_tags || {};
  }
  return (
    datasetQuery.native?.['template-tags']
    || datasetQuery.native?.template_tags
    || datasetQuery?.['template-tags']
    || datasetQuery?.template_tags
    || {}
  );
};

const extractTemplateNames = (query = '', templateTags = {}) => {
  const names = new Set(Object.keys(templateTags));
  const matches = query.matchAll(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g);
  for (const match of matches) names.add(match[1]);
  return [...names];
};

const inferFilterType = (name, tag = {}) => {
  const raw = `${name} ${tag.type || ''} ${tag['widget-type'] || ''}`.toLowerCase();
  if (raw.includes('date')) return 'date/range';
  if (raw.includes('number') || raw.includes('integer') || raw.includes('float')) return 'number/=';
  if (raw.includes('contains')) return 'string/contains';
  return 'string/=';
};

const makeFilterFromTemplate = (name, tag = {}) => ({
  id: tag.id || uuidv4().slice(0, 8),
  name: tag.display_name || tag.name || name.replace(/_/g, ' '),
  slug: name,
  type: inferFilterType(name, tag),
  sectionId: inferFilterType(name, tag).split('/')[0],
  values_source_type: tag.values_source_type || null,
  values_source_config: tag.values_source_config || null,
  required: Boolean(tag.required),
  default: tag.default ?? null,
});

const makeTemplateTag = (name, tag = {}) => ({
  id: tag.id || name,
  name,
  'display-name': tag['display-name'] || tag.display_name || tag.name || name.replace(/_/g, ' '),
  type: tag.type || (inferFilterType(name, tag).startsWith('date') ? 'date' : inferFilterType(name, tag).startsWith('number') ? 'number' : 'text'),
  required: Boolean(tag.required),
});

const ensureTemplateTags = (query, templateTags = {}) => (
  extractTemplateNames(query, templateTags).reduce((acc, name) => ({
    ...acc,
    [name]: { ...makeTemplateTag(name, templateTags[name]), ...(templateTags[name] || {}) },
  }), {})
);

const getCardType = (card = {}) => {
  const display = String(
    card.visualization_settings?.graph_type
    || card.visualization_settings?.['graph.type']
    || card.visualization_settings?.type
    || card.display
    || ''
  ).toLowerCase();
  if (display.includes('bar')) return 'bar';
  if (display.includes('line')) return 'line';
  if (display.includes('pie') || display.includes('donut')) return 'pie';
  if (display.includes('area')) return 'area';
  if (display.includes('scalar') || display.includes('number') || display.includes('progress')) return 'scalar';
  if (display.includes('map')) return 'map';
  if (display.includes('row')) return 'row';
  if (display.includes('table')) return 'table';
  return 'table';
};

export default function DashboardList({ onOpen, onCreate }) {
  const [dashboards, setDashboards] = useState([]);
  const [metabaseDashboards, setMetabaseDashboards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(null);
  const [remoteLoading, setRemoteLoading] = useState(null);
  const [message, setMessage] = useState(null);

  const load = () => {
    setLoading(true);
    setMessage(null);
    Promise.all([
      listDashboards(),
      listMetabaseDashboards()
    ])
      .then(([configs, metabase]) => {
        setDashboards(asArray(configs));
        setMetabaseDashboards(asArray(metabase));
      })
      .catch(e => {
        setMessage({ type: 'error', text: e.response?.data?.error || e.message });
      })
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this dashboard config?')) return;
    await deleteDashboard(id);
    load();
  };

  const handlePublish = async (id) => {
    setPublishing(id);
    setMessage(null);
    try {
      const res = await publishDashboard(id);
      setMessage({ type: 'success', text: `Published! Metabase Dashboard ID: ${res.dashboardId}` });
      load();
    } catch (e) {
      setMessage({ type: 'error', text: e.response?.data?.error || e.message });
    } finally {
      setPublishing(null);
    }
  };

  const buildMetabaseDraft = async (dashboard, duplicate = false) => {
    const remote = await getMetabaseDashboard(dashboard.id);
    const tabIdToIndex = new Map(asArray(remote.tabs).map((tab, index) => [tab.id, index]));
    const rawCards = pickDashcards(remote);
    const filtersBySlug = new Map();
    asArray(remote.parameters).forEach(parameter => {
      // Keep dashboard parameters, including static dropdowns mapping to variable targets
      const slug = parameter.slug || parameter.id;

      let values = parameter.values_source_config?.values || [];
      if (Array.isArray(values)) {
        values = values.map(v => Array.isArray(v) ? v[0] : v);
      }
      const values_source_config = { ...parameter.values_source_config, values };

      filtersBySlug.set(slug, {
        id: parameter.id || uuidv4().slice(0, 8),
        name: parameter.name || parameter.slug || 'Filter',
        slug: parameter.slug || (parameter.name || 'filter').toLowerCase().replace(/\s+/g, '_'),
        type: parameter.type || 'string/=',
        sectionId: parameter.sectionId || parameter.section_id || 'string',
        values_source_type: parameter.values_source_type || null,
        values_source_config,
        values_query_type: parameter.values_query_type || null,
        temporal_units: parameter.temporal_units || null,
        target: parameter.target || null,
        isMultiSelect: parameter.isMultiSelect,
        filteringParameters: parameter.filteringParameters || parameter.filtering_parameters || [],
        required: Boolean(parameter.required),
        default: parameter.default ?? null,
      });
    });

    const extractedWhereConditions = [];

    const cards = rawCards.map((item, index) => {
      const card = item.card || item;
      const title = card.name || card.display_name || `Card ${index + 1}`;
      const dashboardTabId = item.dashboard_tab_id ?? item.dashboardTabId ?? item.tab_id;
      const rawQuery = getCardQuery(card);
      const { cleanedQuery, extractedConditions } = extractAndCleanWhereConditions(rawQuery);
      if (extractedConditions && extractedConditions.length > 0) {
        extractedWhereConditions.push(...extractedConditions);
      }
      const query = cleanedQuery;
      const templateTags = ensureTemplateTags(query, getTemplateTags(card));
      // Auto-add template tags as dashboard filters for ease of use by non-tech teams.
      // Skip question-only filters (tags with static-list custom values not in remote.parameters).
      extractTemplateNames(query, templateTags).forEach(name => {
        if (!filtersBySlug.has(name)) {
          const tag = templateTags[name] || {};
          const hasStaticValues = tag['values-source-type'] === 'static-list' || tag.values_source_type === 'static-list';
          // If it has custom static dropdown values, it's a question-specific filter (e.g. reporting_period)
          if (hasStaticValues) return;
          const filter = makeFilterFromTemplate(name, tag);
          filtersBySlug.set(name, filter);
        }
      });

      return {
        id: uuidv4(),
        title: duplicate ? cleanCardTitle(title) : title,
        type: getCardType(card),
        query,
        description: card.description || '',
        metabaseCardId: card.id || item.card_id || null,
        metabaseDashcardId: item.id || null,
        databaseId: card.database_id || card.dataset_query?.database || null,
        display: card.display || null,
        visualization_settings: card.visualization_settings || {},
        col: item.position?.x ?? item.x ?? item.col ?? 0,
        row: item.position?.y ?? item.y ?? item.row ?? index * 4,
        sizeX: item.size?.x ?? item.size_x ?? item.sizeX ?? item.w ?? 6,
        sizeY: item.size?.y ?? item.size_y ?? item.sizeY ?? item.h ?? 4,
        tabIndex: tabIdToIndex.has(dashboardTabId) ? tabIdToIndex.get(dashboardTabId) : undefined,
        dashboardTabId: dashboardTabId || null,
        parameterMappings: item.parameter_mappings || card.parameter_mappings || [],
        inlineParameters: item.inline_parameters || [],
        templateTags,
      };
    });

    // Extract dimensions (Field Filters) from cards' parameters mappings & template tags
    cards.forEach(card => {
      (card.parameterMappings || []).forEach(mapping => {
        const paramId = mapping.parameter_id;
        const targetTag = mapping.target?.[1]?.[1];
        if (paramId && targetTag) {
          const tagObj = card.templateTags?.[targetTag];
          if (tagObj && tagObj.type === 'dimension' && Array.isArray(tagObj.dimension)) {
            let fieldId = tagObj.dimension[1];
            if (typeof fieldId === 'object' && fieldId !== null && tagObj.dimension[2] !== undefined) {
              fieldId = tagObj.dimension[2];
            }
            let filter = filtersBySlug.get(paramId);
            if (!filter) {
              filter = Array.from(filtersBySlug.values()).find(f => f.id === paramId || f.slug === paramId);
            }
            if (filter && fieldId) {
              filter.fieldId = fieldId;
              filter.databaseId = card.databaseId || 3;
              if (tagObj['widget-type']) {
                filter.type = tagObj['widget-type'];
              }
            }
          }
        }
      });
    });

    // Global WHERE conditions are extracted from card queries on import.
    // Necessary unique conditions (like program_id and leader_id) are placed in whereConditions
    // so they can be modified globally and dynamically injected upon publish.
    const whereConditions = [...new Set(extractedWhereConditions)];

    const name = duplicate ? copyText(remote.name || dashboard.name) : (remote.name || dashboard.name);
    const description = remote.description || dashboard.description || '';

    return {
      id: duplicate ? uuidv4() : metabaseDraftId(remote.id),
      name,
      description,
      sourceMetabaseDashboardId: remote.id,
      metabase_dashboard_id: duplicate ? null : remote.id,
      metabase_collection_id: duplicate ? null : (remote.collection?.id || null),
      metabase_card_ids: duplicate ? {} : cards.reduce((acc, c) => {
        if (c.metabaseCardId) acc[c.id] = c.metabaseCardId;
        return acc;
      }, {}),
      config: {
        collection: {
          name: remote.collection?.name || '',
          description: remote.collection?.description || '',
          parentId: remote.collection?.id || null,
        },
        dashboard: {
          name,
          description,
          pin: Boolean(remote.collection_position),
          tabs: asArray(remote.tabs).map(tab => ({
            id: tab.id,
            name: tab.name || 'Untitled Tab',
          })),
        },
        cards,
        filters: [...filtersBySlug.values()],
        groups: [],
        whereConditions,
      },
      status: 'draft',
    };
  };

  const handleEditMetabase = async (dashboard) => {
    setMessage(null);
    setRemoteLoading(`edit-${dashboard.id}`);
    try {
      onOpen && onOpen(await buildMetabaseDraft(dashboard));
    } catch (e) {
      setMessage({ type: 'error', text: e.response?.data?.error || e.message });
    } finally {
      setRemoteLoading(null);
    }
  };

  const handleDuplicateSaved = async (dashboard) => {
    setMessage(null);
    const name = copyText(dashboard.name);
    const newId = uuidv4();
    const newConfig = cloneConfig(dashboard.config, dashboard.name, dashboard.description);
    
    try {
      setLoading(true);
      const res = await saveDashboard({
        id: newId,
        name,
        description: dashboard.description || '',
        config: newConfig,
        metabase_dashboard_id: null,
        metabase_collection_id: null,
        metabase_card_ids: {},
      });
      load();
      onOpen && onOpen(res);
    } catch (e) {
      setMessage({ type: 'error', text: e.response?.data?.error || e.message });
    } finally {
      setLoading(false);
    }
  };

  const handleDuplicateMetabase = async (dashboard) => {
    setMessage(null);
    setRemoteLoading(`duplicate-${dashboard.id}`);
    try {
      const draft = await buildMetabaseDraft(dashboard, true);
      const res = await saveDashboard({
        id: draft.id,
        name: draft.name,
        description: draft.description || '',
        config: draft.config,
        metabase_dashboard_id: null,
        metabase_collection_id: null,
        metabase_card_ids: {},
      });
      load();
      onOpen && onOpen(res);
    } catch (e) {
      setMessage({ type: 'error', text: e.response?.data?.error || e.message });
    } finally {
      setRemoteLoading(null);
    }
  };

  return (
    <div className="py-10 px-8 max-w-[1120px] mx-auto font-sans text-slate-900 bg-slate-50 min-h-screen">
      <div className="flex justify-between items-start gap-4 mb-6">
        <div>
          <h2 className="m-0 text-3xl font-extrabold text-slate-900 tracking-tight">Dashboards</h2>
          <p className="mt-2 text-slate-600 text-sm font-normal">Open, duplicate, publish, or import dashboards into the builder.</p>
        </div>
        <button className="py-2.5 px-5.5 bg-gradient-to-r from-indigo-600 to-blue-600 text-white border-none rounded-lg cursor-pointer font-semibold text-sm shadow-md hover:shadow-lg transition-all focus:outline-none" onClick={onCreate}>+ New Dashboard</button>
      </div>

      {message && (
        <div className={`py-3 px-4.5 rounded-lg mb-4 text-sm font-medium ${
          message.type === 'success' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
        }`}>
          {message.text}
        </div>
      )}

      <section className="mb-10">
        <div className="flex justify-between items-center gap-4 mb-4 border-b-2 border-slate-200 pb-2.5 mt-10">
          <div>
            <h3 className="m-0 text-xl font-bold text-slate-800">Saved Dashboard Configs</h3>
            <p className="mt-1 text-slate-500 text-xs">Drafts and dashboards created from this builder.</p>
          </div>
          <span className="min-w-[24px] h-6 flex items-center justify-center rounded-full bg-slate-200 text-slate-600 text-xs font-bold px-2">{dashboards.length}</span>
        </div>

        {loading ? <p className="text-slate-500 text-sm">Loading dashboards...</p> : (
          <div className="grid gap-3">
            {dashboards.map(d => (
              <div key={d.id} className="flex justify-between items-center gap-4 border border-slate-200 rounded-xl p-5 bg-white shadow-sm transition-all hover:shadow-md">
                <div className="min-w-0">
                  <div className="text-base font-bold text-slate-900 overflow-hidden text-ellipsis whitespace-nowrap">{d.name}</div>
                  {d.description && <div className="mt-1 text-slate-600 text-xs overflow-hidden text-ellipsis whitespace-nowrap">{d.description}</div>}
                  <div className="flex flex-wrap items-center gap-3 mt-3 text-slate-500 text-xs font-semibold">
                    <span className={`py-0.5 px-2.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${
                      d.status === 'published' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                    }`}>{d.status || 'draft'}</span>
                    {d.config?.cards && <span className="bg-indigo-50 text-indigo-700 py-0.5 px-2 rounded-full text-[10px] font-semibold">📊 {d.config.cards.length} cards</span>}
                    {d.config?.filters && d.config.filters.length > 0 && <span className="bg-emerald-50 text-emerald-700 py-0.5 px-2 rounded-full text-[10px] font-semibold">🎛️ {d.config.filters.length} filters</span>}
                    <span>{d.metabase_dashboard_id ? `Metabase #${d.metabase_dashboard_id}` : 'Not published'}</span>
                    {d.updated_at && <span>Updated {new Date(d.updated_at).toLocaleString()}</span>}
                  </div>
                </div>
                <div className="flex justify-end gap-2 flex-wrap shrink-0">
                  <button className="py-2 px-4 border-none rounded-lg cursor-pointer text-xs bg-indigo-600 text-white font-semibold shadow-sm hover:bg-indigo-700 transition-all" onClick={() => onOpen(d)} title="Edit dashboard">✏️ Edit</button>
                  <button className="py-2 px-4 border border-slate-300 rounded-lg cursor-pointer text-xs bg-white text-slate-700 font-semibold transition-all hover:bg-slate-50 hover:border-slate-400" onClick={() => handleDuplicateSaved(d)} title="Duplicate dashboard">📋 Duplicate</button>
                  <button
                    className="py-2 px-4 border border-emerald-600 rounded-lg cursor-pointer text-xs bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-semibold shadow-sm hover:from-emerald-600 hover:to-emerald-700 transition-all disabled:opacity-50"
                    onClick={() => handlePublish(d.id)}
                    disabled={publishing === d.id}
                    title="Publish to Metabase"
                  >
                    {publishing === d.id ? '⏳ Publishing...' : '🚀 Publish'}
                  </button>
                  <button
                    className="py-2 px-4 border border-red-200 rounded-lg cursor-pointer text-xs bg-red-50 text-red-700 font-semibold transition-all hover:bg-red-100 hover:border-red-300"
                    onClick={() => handleDelete(d.id)}
                    title="Delete dashboard"
                  >
                    🗑 Delete
                  </button>
                </div>
              </div>
            ))}
            {dashboards.length === 0 && (
              <div className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-slate-500 bg-slate-50 text-center text-sm">No saved dashboards yet. Create one or import from Metabase below.</div>
            )}
          </div>
        )}
      </section>

      <section className="mb-10">
        <div className="flex justify-between items-center gap-4 mb-4 border-b-2 border-slate-200 pb-2.5 mt-10">
          <div>
            <h3 className="m-0 text-xl font-bold text-slate-800">Metabase Dashboards</h3>
            <p className="mt-1 text-slate-500 text-xs">Edit opens a stable local draft. Duplicate creates a frontend-only copy.</p>
          </div>
          <span className="min-w-[24px] h-6 flex items-center justify-center rounded-full bg-slate-200 text-slate-600 text-xs font-bold px-2">{metabaseDashboards.length}</span>
        </div>
        {loading ? (
          <p className="text-slate-500 text-sm">Loading Metabase dashboards...</p>
        ) : metabaseDashboards.length > 0 ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-5">
            {metabaseDashboards.map(d => (
              <div key={d.id} className="border border-slate-200 rounded-xl p-5 bg-white flex flex-col min-h-[180px] shadow-sm transition-all hover:shadow-md">
                <div className="flex justify-between gap-2.5 items-start">
                  <h4 className="m-0 mb-2 text-base font-bold text-slate-900 leading-snug">{d.name}</h4>
                  <span className="py-0.5 px-2 rounded-full bg-slate-100 text-slate-500 text-[10px] font-bold shrink-0">#{d.id}</span>
                </div>
                {d.description && <p className="m-0 mb-4 text-xs text-slate-600 leading-relaxed">{d.description}</p>}
                <div className="grid gap-1 text-[11px] text-slate-500 mb-4 font-semibold">
                  <span>{d.collection?.name || d.collection_name || 'Metabase'}</span>
                  {d.updated_at && <span>Updated {new Date(d.updated_at).toLocaleString()}</span>}
                </div>
                <div className="flex gap-2 flex-wrap mt-auto">
                  <button
                    className="py-2 px-4 border-none rounded-lg cursor-pointer text-xs bg-indigo-600 text-white font-semibold shadow-sm hover:bg-indigo-700 transition-all disabled:opacity-50"
                    onClick={() => handleEditMetabase(d)}
                    disabled={remoteLoading === `edit-${d.id}`}
                    title="Edit in builder"
                  >
                    {remoteLoading === `edit-${d.id}` ? '⏳ Loading...' : '✏️ Edit'}
                  </button>
                  <button
                    className="py-2 px-4 border border-slate-300 rounded-lg cursor-pointer text-xs bg-white text-slate-700 font-semibold transition-all hover:bg-slate-50 hover:border-slate-400 disabled:opacity-50"
                    onClick={() => handleDuplicateMetabase(d)}
                    disabled={remoteLoading === `duplicate-${d.id}`}
                    title="Duplicate as new draft"
                  >
                    {remoteLoading === `duplicate-${d.id}` ? '⏳ Duplicating...' : '📋 Duplicate'}
                  </button>
                  <a
                    href={getDashboardLink(d)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block py-2 px-3.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-xs font-semibold shadow-sm transition-all"
                    title="View in Metabase"
                  >
                    🔗 View in Metabase
                  </a>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-slate-500 bg-slate-50 text-center text-sm">No Metabase dashboards found.</div>
        )}
      </section>
    </div>
  );
}
