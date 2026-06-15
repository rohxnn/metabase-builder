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
      title: copyText(card.title),
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

const getTemplateTags = (card = {}) => (
  card.dataset_query?.native?.['template-tags']
  || card.dataset_query?.native?.template_tags
  || card.dataset_query?.['template-tags']
  || card.dataset_query?.template_tags
  || {}
);

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
      const slug = parameter.slug || parameter.id;
      // Skip question-only parameters (e.g. reporting_period with static-list values)
      // These live in the card's templateTags, not as dashboard-level filters
      const isStaticDropdown = parameter.values_source_type === 'static-list';
      const isVariableTarget = parameter.target?.[0] === 'variable';
      if (isStaticDropdown && isVariableTarget) return;

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
        title: duplicate ? copyText(title) : title,
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
            const fieldId = tagObj.dimension[1];
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
    <div style={styles.page}>
      <div style={styles.header}>
        <div>
          <h2 style={styles.pageTitle}>Dashboards</h2>
          <p style={styles.subtitle}>Open, duplicate, publish, or import dashboards into the builder.</p>
        </div>
        <button style={styles.createBtn} onClick={onCreate}>+ New Dashboard</button>
      </div>

      {message && (
        <div style={{ ...styles.alert, background: message.type === 'success' ? '#d3f9d8' : '#ffe3e3', color: message.type === 'success' ? '#2f9e44' : '#c92a2a' }}>
          {message.text}
        </div>
      )}

      <section style={styles.section}>
        <div style={styles.sectionHeader}>
          <div>
            <h3 style={styles.sectionTitle}>Saved Dashboard Configs</h3>
            <p style={styles.sectionHelp}>Drafts and dashboards created from this builder.</p>
          </div>
          <span style={styles.countBadge}>{dashboards.length}</span>
        </div>

        {loading ? <p style={styles.muted}>Loading dashboards...</p> : (
          <div style={styles.savedList}>
            {dashboards.map(d => (
              <div key={d.id} style={styles.savedRow}>
                <div style={styles.savedMain}>
                  <div style={styles.savedTitle}>{d.name}</div>
                  {d.description && <div style={styles.savedDescription}>{d.description}</div>}
                  <div style={styles.metaLine}>
                    <span style={{ ...styles.badge, background: d.status === 'published' ? '#d3f9d8' : '#fff3bf' }}>{d.status || 'draft'}</span>
                    {d.config?.cards && <span style={{ background: '#eef2ff', color: '#4f46e5', padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600 }}>📊 {d.config.cards.length} cards</span>}
                    {d.config?.filters && d.config.filters.length > 0 && <span style={{ background: '#f0fdf4', color: '#16a34a', padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600 }}>🎛️ {d.config.filters.length} filters</span>}
                    <span>{d.metabase_dashboard_id ? `Metabase #${d.metabase_dashboard_id}` : 'Not published'}</span>
                    {d.updated_at && <span>Updated {new Date(d.updated_at).toLocaleString()}</span>}
                  </div>
                </div>
                <div style={styles.rowActions}>
                  <button style={styles.primaryActionBtn} onClick={() => onOpen(d)} title="Edit dashboard">✏️ Edit</button>
                  <button style={styles.actionBtn} onClick={() => handleDuplicateSaved(d)} title="Duplicate dashboard">📋 Duplicate</button>
                  <button
                    style={{ ...styles.actionBtn, background: 'linear-gradient(135deg, #10b981, #059669)', color: '#fff', borderColor: '#059669' }}
                    onClick={() => handlePublish(d.id)}
                    disabled={publishing === d.id}
                    title="Publish to Metabase"
                  >
                    {publishing === d.id ? '⏳ Publishing...' : '🚀 Publish'}
                  </button>
                  <button
                    style={{ ...styles.actionBtn, background: '#fff5f5', color: '#c92a2a', borderColor: '#ffc9c9' }}
                    onClick={() => handleDelete(d.id)}
                    title="Delete dashboard"
                  >
                    🗑 Delete
                  </button>
                </div>
              </div>
            ))}
            {dashboards.length === 0 && (
              <div style={styles.emptyState}>No saved dashboards yet. Create one or import from Metabase below.</div>
            )}
          </div>
        )}
      </section>

      <section style={styles.section}>
        <div style={styles.sectionHeader}>
          <div>
            <h3 style={styles.sectionTitle}>Metabase Dashboards</h3>
            <p style={styles.sectionHelp}>Edit opens a stable local draft. Duplicate creates a frontend-only copy.</p>
          </div>
          <span style={styles.countBadge}>{metabaseDashboards.length}</span>
        </div>
        {loading ? (
          <p style={styles.muted}>Loading Metabase dashboards...</p>
        ) : metabaseDashboards.length > 0 ? (
          <div style={styles.dashboardGrid}>
            {metabaseDashboards.map(d => (
              <div key={d.id} style={styles.dashboardCard}>
                <div style={styles.cardTopline}>
                  <h4 style={styles.cardTitle}>{d.name}</h4>
                  <span style={styles.idPill}>#{d.id}</span>
                </div>
                {d.description && <p style={styles.cardDescription}>{d.description}</p>}
                <div style={styles.cardMeta}>
                  <span>{d.collection?.name || d.collection_name || 'Metabase'}</span>
                  {d.updated_at && <span>Updated {new Date(d.updated_at).toLocaleString()}</span>}
                </div>
                <div style={styles.cardActions}>
                  <button
                    style={styles.primaryActionBtn}
                    onClick={() => handleEditMetabase(d)}
                    disabled={remoteLoading === `edit-${d.id}`}
                    title="Edit in builder"
                  >
                    {remoteLoading === `edit-${d.id}` ? '⏳ Loading...' : '✏️ Edit'}
                  </button>
                  <button
                    style={styles.actionBtn}
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
                    style={styles.viewBtn}
                    title="View in Metabase"
                  >
                    🔗 View in Metabase
                  </a>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={styles.emptyState}>No Metabase dashboards found.</div>
        )}
      </section>
    </div>
  );
}

const styles = {
  page: { padding: '40px 32px', maxWidth: 1120, margin: '0 auto', fontFamily: 'system-ui, -apple-system, sans-serif', color: '#0f172a', background: '#f8fafc', minHeight: '100vh' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 24 },
  pageTitle: { margin: 0, fontSize: 32, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.025em' },
  subtitle: { margin: '8px 0 0', color: '#475569', fontSize: 15, fontWeight: 400 },
  createBtn: { padding: '10px 22px', background: 'linear-gradient(135deg, #4f46e5 0%, #2563eb 100%)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 14, boxShadow: '0 4px 12px rgba(79, 70, 229, 0.25)', transition: 'all 0.2s', outline: 'none' },
  alert: { padding: '12px 18px', borderRadius: 8, marginBottom: 16, fontSize: 14, fontWeight: 500 },
  section: { marginBottom: 40 },
  sectionHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, marginBottom: 16, borderBottom: '2px solid #e2e8f0', paddingBottom: 10, marginTop: 40 },
  sectionTitle: { margin: 0, fontSize: 20, fontWeight: 700, color: '#1e293b' },
  sectionHelp: { margin: '4px 0 0', color: '#64748b', fontSize: 13 },
  countBadge: { minWidth: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 999, background: '#e2e8f0', color: '#475569', fontSize: 12, fontWeight: 700, padding: '0 8px' },
  muted: { color: '#64748b', fontSize: 14 },
  savedList: { display: 'grid', gap: 12 },
  savedRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, border: '1px solid #e2e8f0', borderRadius: 12, padding: 20, background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', transition: 'all 0.2s' },
  savedMain: { minWidth: 0 },
  savedTitle: { fontSize: 16, fontWeight: 700, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  savedDescription: { marginTop: 4, color: '#475569', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  metaLine: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, marginTop: 12, color: '#64748b', fontSize: 12, fontWeight: 500 },
  rowActions: { display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap', flexShrink: 0 },
  badge: { padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.025em' },
  primaryActionBtn: { padding: '8px 16px', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, background: '#4f46e5', color: '#fff', fontWeight: 600, boxShadow: '0 2px 4px rgba(79, 70, 229, 0.15)', transition: 'all 0.2s' },
  actionBtn: { padding: '8px 16px', border: '1px solid #cbd5e1', borderRadius: 8, cursor: 'pointer', fontSize: 13, background: '#fff', color: '#334155', fontWeight: 600, transition: 'all 0.2s' },
  dashboardGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 20 },
  dashboardCard: { border: '1px solid #e2e8f0', borderRadius: 12, padding: 20, background: '#fff', display: 'flex', flexDirection: 'column', minHeight: 180, boxShadow: '0 1px 3px rgba(0,0,0,0.05)', transition: 'all 0.2s' },
  cardTopline: { display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' },
  cardTitle: { margin: '0 0 8px 0', fontSize: 16, fontWeight: 700, color: '#0f172a', lineHeight: 1.4 },
  idPill: { padding: '2px 8px', borderRadius: 999, background: '#f1f5f9', color: '#64748b', fontSize: 11, fontWeight: 700, flexShrink: 0 },
  cardDescription: { margin: '0 0 16px 0', fontSize: 13, color: '#475569', lineHeight: 1.5 },
  cardMeta: { display: 'grid', gap: 4, fontSize: 12, color: '#64748b', marginBottom: 16, fontWeight: 500 },
  cardActions: { display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 'auto' },
  viewBtn: { display: 'inline-block', padding: '8px 14px', background: '#3b82f6', color: '#fff', borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer', boxShadow: '0 2px 4px rgba(59, 130, 246, 0.15)', transition: 'all 0.2s' },
  emptyState: { border: '2px dashed #cbd5e1', borderRadius: 12, padding: 32, color: '#64748b', background: '#f8fafc', textAlign: 'center', fontSize: 15 },
};
