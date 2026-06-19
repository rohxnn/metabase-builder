import React, { useEffect, useState } from 'react';
import { v4 as uuidv4, v5 as uuidv5 } from 'uuid';
import { listDashboards, deleteDashboard, publishDashboard, listMetabaseDashboards, getMetabaseDashboard, saveDashboard, getUserInfo } from '../services/api';
import { extractAndCleanWhereConditions } from '../services/queryPreview';

const METABASE_DRAFT_NAMESPACE = '9b9c2a8b-5997-4a0c-8f72-2f8f6e2f2b5a';

const emptyConfig = {
  collection: { name: '', description: '', parentId: null },
  dashboard: { name: '', description: '', pin: true, tabs: [{ name: 'Tab 1' }] },
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
  return title.replace(/\s*[\(-]\s*(Duplicate|Copy)\s*\)?/gi, '').trim();
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

const timeAgo = (dateStr) => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const seconds = Math.floor((now - date) / 1000);
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  return `${days}d ago`;
};

const getDashboardIcon = (name = '', index = 0) => {
  const cleanName = name.toLowerCase();
  if (cleanName.includes('women') || cleanName.includes('insights')) {
    return (
      <svg className="w-5 h-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 002 2h2a2 2 0 002-2z" />
      </svg>
    );
  }
  if (cleanName.includes('youth') || cleanName.includes('demographics')) {
    return (
      <svg className="w-5 h-5 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
      </svg>
    );
  }
  if (cleanName.includes('regional') || cleanName.includes('performance')) {
    return (
      <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
      </svg>
    );
  }
  if (cleanName.includes('financial') || cleanName.includes('health') || cleanName.includes('index')) {
    return (
      <svg className="w-5 h-5 text-cyan-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <circle cx="12" cy="18" r="3" stroke="currentColor" strokeWidth={2} />
        <circle cx="6" cy="6" r="3" stroke="currentColor" strokeWidth={2} />
        <circle cx="18" cy="6" r="3" stroke="currentColor" strokeWidth={2} />
        <path d="M8.5 8.5l7 7M15.5 8.5l-7 7" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
      </svg>
    );
  }
  
  const icons = [
    <svg key="0" className="w-5 h-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 002 2h2a2 2 0 002-2z" />
    </svg>,
    <svg key="1" className="w-5 h-5 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
    </svg>,
    <svg key="2" className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
    </svg>,
    <svg key="3" className="w-5 h-5 text-cyan-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="18" r="3" stroke="currentColor" strokeWidth={2} />
      <circle cx="6" cy="6" r="3" stroke="currentColor" strokeWidth={2} />
      <circle cx="18" cy="6" r="3" stroke="currentColor" strokeWidth={2} />
      <path d="M8.5 8.5l7 7M15.5 8.5l-7 7" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
    </svg>
  ];
  return icons[index % icons.length];
};

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
  const [activeCategory, setActiveCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('recent');
  const [user, setUser] = useState({ name: 'Admin', email: 'admin@metabase.com' });

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

  useEffect(() => {
    load();
    getUserInfo()
      .then(u => setUser(u))
      .catch(() => {});
  }, []);

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


  const filteredDashboards = dashboards.filter(d =>
    d.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    d.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredMetabaseDashboards = metabaseDashboards.filter(d =>
    d.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    d.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const sortedDashboards = [...filteredDashboards].sort((a, b) => {
    if (sortBy === 'alphabetical') {
      return (a.name || '').localeCompare(b.name || '');
    }
    return new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at);
  });

  const sortedMetabaseDashboards = [...filteredMetabaseDashboards].sort((a, b) => {
    if (sortBy === 'alphabetical') {
      return (a.name || '').localeCompare(b.name || '');
    }
    return new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at);
  });

  const allList = [
    ...filteredDashboards.map(d => ({ ...d, isLocal: true })),
    ...filteredMetabaseDashboards.map(d => ({ ...d, isLocal: false }))
  ];

  const sortedAll = [...allList].sort((a, b) => {
    if (sortBy === 'alphabetical') {
      return (a.name || '').localeCompare(b.name || '');
    }
    const dateA = new Date(a.updated_at || a.created_at || 0);
    const dateB = new Date(b.updated_at || b.created_at || 0);
    return dateB - dateA;
  });

  const activeCount = activeCategory === 'all'
    ? dashboards.filter(d => d.status === 'published').length + metabaseDashboards.length
    : activeCategory === 'saved'
      ? dashboards.filter(d => d.status === 'published').length
      : metabaseDashboards.length;

  const draftsCount = activeCategory === 'all'
    ? dashboards.filter(d => d.status !== 'published').length
    : activeCategory === 'saved'
      ? dashboards.filter(d => d.status !== 'published').length
      : 0;

  return (
    <div className="flex h-screen overflow-hidden font-sans text-slate-900 bg-slate-50">
      {/* Left Sidebar */}
      <div className="w-64 bg-white text-slate-700 flex flex-col justify-between shrink-0 border-r border-slate-200 shadow-sm">
        {/* Brand / Logo */}
        <div>
          <div className="flex items-center gap-3 py-6 px-6 border-b border-slate-200 bg-slate-50/20">
            <span className="text-2xl">⚡</span>
            <div>
              <div className="text-sm font-black text-slate-900 uppercase tracking-wider">Metabase Builder</div>
              <div className="text-[10px] text-indigo-600 font-bold tracking-widest uppercase mt-0.5">Builder Platform</div>
            </div>
          </div>

          {/* User Profile */}
          <div className="py-6 px-6 border-b border-slate-200 bg-slate-50/50">
            <div className="flex items-center gap-3.5 bg-slate-100/50 border border-slate-200/50 rounded-xl p-3.5 shadow-sm">
              <div className="relative">
                <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm shadow-sm border border-indigo-400/20">
                  {user.name ? user.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() : 'AD'}
                </div>
                <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-white"></span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-bold text-slate-800 overflow-hidden text-ellipsis whitespace-nowrap" title={user.name}>{user.name}</div>
                <div className="text-[10px] text-slate-500 font-medium overflow-hidden text-ellipsis whitespace-nowrap" title={user.email}>{user.email}</div>
              </div>
            </div>
          </div>

          {/* Navigation Menu */}
          <div className="py-6 px-4">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-3 block mb-3">Dashboards</span>
            <div className="flex flex-col gap-1">
              <button
                onClick={() => setActiveCategory('all')}
                className={`flex items-center justify-between py-2.5 px-3 rounded-lg text-xs font-semibold transition-all border-none outline-none cursor-pointer w-full text-left
                  ${activeCategory === 'all'
                    ? 'bg-indigo-50 text-indigo-600 shadow-sm border border-indigo-100/50 font-bold'
                    : 'bg-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50 font-medium'}`}
              >
                <div className="flex items-center gap-2.5">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                  </svg>
                  <span>All Dashboards</span>
                </div>
                <span className={`text-[10px] font-bold py-0.5 px-2 rounded-full ${activeCategory === 'all' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500'}`}>
                  {dashboards.length + metabaseDashboards.length}
                </span>
              </button>

              <button
                onClick={() => setActiveCategory('saved')}
                className={`flex items-center justify-between py-2.5 px-3 rounded-lg text-xs font-semibold transition-all border-none outline-none cursor-pointer w-full text-left
                  ${activeCategory === 'saved'
                    ? 'bg-indigo-50 text-indigo-600 shadow-sm border border-indigo-100/50 font-bold'
                    : 'bg-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50 font-medium'}`}
              >
                <div className="flex items-center gap-2.5">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                  </svg>
                  <span>Saved Configs</span>
                </div>
                <span className={`text-[10px] font-bold py-0.5 px-2 rounded-full ${activeCategory === 'saved' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500'}`}>
                  {dashboards.length}
                </span>
              </button>

              <button
                onClick={() => setActiveCategory('metabase')}
                className={`flex items-center justify-between py-2.5 px-3 rounded-lg text-xs font-semibold transition-all border-none outline-none cursor-pointer w-full text-left
                  ${activeCategory === 'metabase'
                    ? 'bg-indigo-50 text-indigo-600 shadow-sm border border-indigo-100/50 font-bold'
                    : 'bg-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50 font-medium'}`}
              >
                <div className="flex items-center gap-2.5">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 002 2h2a2 2 0 002-2z" />
                  </svg>
                  <span>Metabase Dashboards</span>
                </div>
                <span className={`text-[10px] font-bold py-0.5 px-2 rounded-full ${activeCategory === 'metabase' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500'}`}>
                  {metabaseDashboards.length}
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">
        {/* Top Header bar */}
        <div className="flex items-center justify-between py-4 px-8 bg-white border-b border-slate-200 shrink-0 shadow-sm">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <h2 className="m-0 text-lg font-bold text-slate-900 tracking-tight">
                {activeCategory === 'all' 
                  ? 'All Dashboards' 
                  : activeCategory === 'saved' 
                    ? 'Saved Dashboard Configs' 
                    : 'Metabase Dashboards'}
              </h2>
              <span className="py-0.5 px-2 bg-indigo-600 text-white text-[10px] font-black rounded-full uppercase tracking-wider">
                {activeCategory === 'all' 
                  ? `${dashboards.length + metabaseDashboards.length} TOTAL` 
                  : activeCategory === 'saved' 
                    ? `${dashboards.length} TOTAL` 
                    : `${metabaseDashboards.length} TOTAL`}
              </span>
            </div>
            <p className="m-0 mt-0.5 text-slate-500 text-xs font-medium font-sans">
              {activeCategory === 'all'
                ? 'Browse and manage all dashboard configurations and Metabase originals'
                : activeCategory === 'saved'
                  ? 'Create, manage, and edit local draft dashboard configurations'
                  : 'Browse stable Metabase connection. Import or duplicate to local drafts'}
            </p>
          </div>

          {/* Search, Sort & Action Controls */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="relative">
              <input
                type="text"
                placeholder="Search configurations..."
                className="py-2 pl-8 pr-4 border border-slate-200 rounded-lg text-xs outline-none bg-slate-50 focus:bg-white focus:border-indigo-500 w-[240px] transition-all font-medium text-slate-600 font-sans"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
              <span className="absolute left-2.5 top-2.5 text-slate-400 select-none pointer-events-none">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </span>
            </div>

            <div className="relative flex items-center">
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value)}
                className="py-2 pl-3 pr-8 border border-slate-200 rounded-lg text-xs outline-none bg-white font-semibold text-slate-600 cursor-pointer hover:border-slate-300 appearance-none font-sans"
              >
                <option value="recent">Sort by: Recent First</option>
                <option value="alphabetical">Sort by: Alphabetical</option>
              </select>
              <span className="absolute right-2.5 pointer-events-none text-slate-400">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </span>
            </div>

            <button
              className="py-2 px-4 bg-indigo-600 hover:bg-indigo-700 text-white border-none rounded-lg cursor-pointer font-bold text-xs shadow-sm hover:shadow-md transition-all outline-none font-sans"
              onClick={onCreate}
            >
              New
            </button>
          </div>
        </div>

        {/* Inner Content Area */}
        <div className="flex-1 overflow-y-auto p-8">
          {message && (
            <div className={`py-3 px-4.5 rounded-lg mb-6 text-xs font-semibold shadow-sm flex items-center justify-between ${
              message.type === 'success' ? 'bg-emerald-50 border border-emerald-200 text-emerald-800' : 'bg-red-50 border border-red-200 text-red-800'
            }`}>
              <span>{message.text}</span>
              <button onClick={() => setMessage(null)} className="border-none bg-transparent cursor-pointer font-bold text-slate-400 hover:text-slate-600 text-xs font-sans">✕</button>
            </div>
          )}

          <div>
            {loading ? (
              <p className="text-slate-500 text-sm font-sans">Loading configs...</p>
            ) : (
              <div className="grid gap-3.5">
                {(activeCategory === 'all'
                  ? sortedAll
                  : activeCategory === 'saved'
                    ? sortedDashboards.map(d => ({ ...d, isLocal: true }))
                    : sortedMetabaseDashboards.map(d => ({ ...d, isLocal: false }))
                ).map((d, index) => {
                  const isLocal = d.isLocal;
                  const collectionName = isLocal
                    ? (d.config?.collection?.name || 'Unknown')
                    : (d.collection?.name || d.collection_name || 'Unknown');
                  return (
                    <div key={d.id} className="flex justify-between items-center gap-5 border border-slate-200/60 rounded-xl p-5 bg-white shadow-sm transition-all hover:shadow-md">
                      <div className="flex items-center gap-4 min-w-0">
                        {/* Icon Block */}
                        <div className="w-12 h-12 flex items-center justify-center rounded-xl bg-indigo-50/70 border border-indigo-100/30 shadow-sm shrink-0">
                          {getDashboardIcon(d.name, index)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2.5 flex-wrap">
                            <span className="text-sm font-bold text-slate-900 overflow-hidden text-ellipsis whitespace-nowrap" title={d.name}>{d.name || 'Untitled Dashboard'}</span>
                            {isLocal ? (
                              <span className={`py-0.5 px-2 rounded text-[9px] font-extrabold uppercase tracking-wider ${
                                d.status === 'published' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'
                              }`}>{d.status === 'published' ? 'PUBLISHED' : 'DRAFT'}</span>
                            ) : (
                              <span className="py-0.5 px-2 rounded bg-indigo-50 text-indigo-700 text-[9px] font-extrabold uppercase tracking-wider border border-indigo-200/20">METABASE</span>
                            )}
                            {collectionName && (
                              <span className="py-0.5 px-2 rounded bg-indigo-50 text-indigo-700 text-[9px] font-extrabold uppercase tracking-wider border border-indigo-200/20 flex items-center gap-1">
                                <svg className="w-2.5 h-2.5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                                </svg>
                                {collectionName}
                              </span>
                            )}
                          </div>
                          {d.description && <div className="mt-1 text-slate-500 text-xs overflow-hidden text-ellipsis whitespace-nowrap max-w-[500px]" title={d.description}>{d.description}</div>}
                          <div className="flex flex-wrap items-center gap-4 mt-2.5 text-slate-400 text-[10px] font-bold">
                            {isLocal ? (
                              <>
                                <span className="flex items-center text-slate-600">
                                  <svg className="w-3.5 h-3.5 mr-1 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                                  </svg>
                                  {d.config?.cards?.length || 0} cards
                                </span>
                                <span className="flex items-center text-slate-600">
                                  <svg className="w-3.5 h-3.5 mr-1 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 8.293A1 1 0 013 7.586V4z" />
                                  </svg>
                                  {d.config?.filters?.length || 0} filters
                                </span>
                                {collectionName && (
                                  <span className="flex items-center text-indigo-600/80">
                                    <svg className="w-3.5 h-3.5 mr-1 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                                    </svg>
                                    {collectionName}
                                  </span>
                                )}
                                {d.metabase_dashboard_id && (
                                  <span className="py-0.5 px-1.5 bg-slate-100 text-slate-500 rounded text-[9px] font-extrabold tracking-wide border border-slate-200/30">
                                    Metabase #{d.metabase_dashboard_id}
                                  </span>
                                )}
                              </>
                            ) : (
                              <>
                                {collectionName && (
                                  <span className="flex items-center text-indigo-600/80">
                                    <svg className="w-3.5 h-3.5 mr-1 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                                    </svg>
                                    {collectionName}
                                  </span>
                                )}
                                <span className="py-0.5 px-1.5 bg-slate-100 text-slate-500 rounded text-[9px] font-extrabold tracking-wide border border-slate-200/30">
                                  Metabase Original
                                </span>
                              </>
                            )}
                            {d.updated_at && <span className="italic font-medium text-slate-400">Updated {timeAgo(d.updated_at)}</span>}
                          </div>
                        </div>
                      </div>

                      <div className="flex justify-end gap-2.5 items-center shrink-0 font-sans">
                        {isLocal ? (
                          <>
                            <button
                              className="flex items-center gap-1.5 py-1.5 px-3 border border-slate-200 rounded-lg text-slate-600 bg-white font-semibold hover:bg-slate-50 hover:text-slate-800 hover:border-slate-300 transition-all text-xs cursor-pointer outline-none"
                              onClick={() => onOpen(d)}
                              title="Edit dashboard"
                            >
                              <svg className="w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                              </svg>
                              Edit
                            </button>
                            <button
                              className="flex items-center gap-1.5 py-1.5 px-3 border border-slate-200 rounded-lg text-slate-600 bg-white font-semibold hover:bg-slate-50 hover:text-slate-800 hover:border-slate-300 transition-all text-xs cursor-pointer outline-none"
                              onClick={() => handleDuplicateSaved(d)}
                              title="Duplicate dashboard"
                            >
                              <svg className="w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" />
                              </svg>
                              Duplicate
                            </button>
                            <button
                              className="flex items-center gap-1.5 py-1.5 px-3 border border-slate-200 rounded-lg text-slate-600 bg-white font-semibold hover:bg-slate-50 hover:text-slate-800 hover:border-slate-300 transition-all text-xs cursor-pointer outline-none disabled:opacity-50"
                              onClick={() => handlePublish(d.id)}
                              disabled={publishing === d.id}
                              title="Publish to Metabase"
                            >
                              <svg className="w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                              </svg>
                              {publishing === d.id ? 'Publishing...' : 'Publish'}
                            </button>
                            <button
                              className="flex items-center justify-center p-2 border border-red-100 rounded-lg text-red-500 bg-red-50/50 hover:bg-red-100 hover:text-red-600 transition-all cursor-pointer outline-none"
                              onClick={() => handleDelete(d.id)}
                              title="Delete dashboard"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              className="flex items-center gap-1.5 py-1.5 px-3 border border-slate-200 rounded-lg text-slate-600 bg-white font-semibold hover:bg-slate-50 hover:text-slate-800 hover:border-slate-300 transition-all text-xs cursor-pointer outline-none disabled:opacity-50"
                              onClick={() => handleEditMetabase(d)}
                              disabled={remoteLoading === `edit-${d.id}`}
                              title="Import & Edit draft"
                            >
                              <svg className="w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                              </svg>
                              {remoteLoading === `edit-${d.id}` ? 'Importing...' : 'Edit'}
                            </button>
                            <button
                              className="flex items-center gap-1.5 py-1.5 px-3 border border-slate-200 rounded-lg text-slate-600 bg-white font-semibold hover:bg-slate-50 hover:text-slate-800 hover:border-slate-300 transition-all text-xs cursor-pointer outline-none disabled:opacity-50"
                              onClick={() => handleDuplicateMetabase(d)}
                              disabled={remoteLoading === `duplicate-${d.id}`}
                              title="Duplicate as new draft"
                            >
                              <svg className="w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" />
                              </svg>
                              {remoteLoading === `duplicate-${d.id}` ? 'Duplicating...' : 'Duplicate'}
                            </button>
                            <a
                              href={getDashboardLink(d)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center justify-center gap-1.5 py-1.5 px-3 bg-white hover:bg-slate-50 hover:text-slate-800 border border-slate-200 hover:border-slate-300 rounded-lg text-xs font-semibold text-slate-600 shadow-sm transition-all text-decoration-none"
                              title="View in Metabase"
                            >
                              <svg className="w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                              </svg>
                              View
                            </a>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* Empty states */}
                {activeCategory === 'all' && sortedAll.length === 0 && (
                  <div className="border-2 border-dashed border-slate-200 rounded-2xl p-12 text-slate-400 bg-white text-center text-sm font-medium shadow-sm font-sans">
                    No dashboards found matching search query.
                  </div>
                )}
                {activeCategory === 'saved' && sortedDashboards.length === 0 && (
                  <div className="border-2 border-dashed border-slate-200 rounded-2xl p-12 text-slate-400 bg-white text-center text-sm font-medium shadow-sm font-sans">
                    No saved configurations found matching search query.
                  </div>
                )}
                {activeCategory === 'metabase' && sortedMetabaseDashboards.length === 0 && (
                  <div className="border-2 border-dashed border-slate-200 rounded-2xl p-12 text-slate-400 bg-white text-center text-sm font-medium shadow-sm font-sans">
                    No Metabase original dashboards found matching search query.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer Area */}
        <div className="py-3 px-8 bg-white border-t border-slate-200 flex justify-between items-center text-xs text-slate-500 shrink-0 font-medium font-sans">
          <div className="flex gap-4 items-center">
            <span className="flex items-center gap-1.5 font-bold text-slate-600">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              {activeCount} Active
            </span>
            <span className="flex items-center gap-1.5 font-bold text-slate-600">
              <span className="w-2 h-2 rounded-full bg-slate-400"></span>
              {draftsCount} Drafts
            </span>
          </div>
          <span className="flex items-center gap-1.5 text-slate-400 font-bold">
            <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
            </svg>
            All configurations synchronized with Metabase Cloud
          </span>
        </div>
      </div>
    </div>
  );
}
