const metabase = require('./metabase');
const config = require('../config');

function extractTemplateNames(query = '') {
  const names = new Set();
  const re = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;
  let match;
  while ((match = re.exec(query))) names.add(match[1]);
  return [...names];
}

function inferTemplateTagType(name, filters = []) {
  const list = filters || [];
  const filter = list.find(f => f.slug === name || f.name === name);
  const raw = `${name} ${filter?.type || ''}`.toLowerCase();
  if (raw.includes('date')) return 'date';
  if (raw.includes('number')) return 'number';
  return 'text';
}

function buildTemplateTags(card, filters = []) {
  const existing = card.templateTags || {};
  return extractTemplateNames(card.query).reduce((tags, name) => ({
    ...tags,
    [name]: {
      id: existing[name]?.id || name,
      name,
      'display-name': existing[name]?.['display-name'] || existing[name]?.display_name || name.replace(/_/g, ' '),
      type: existing[name]?.type || inferTemplateTagType(name, filters),
      required: Boolean(existing[name]?.required),
      ...existing[name],
    },
  }), { ...existing });
}

function normalizeParameter(filter) {
  const slug = filter.slug || (filter.name || 'filter').toLowerCase().replace(/\s+/g, '_');
  const type = filter.type || 'string/=';
  const hasStaticValues = filter.values_source_type === 'static-list' && 
                          filter.values_source_config && 
                          Array.isArray(filter.values_source_config.values) && 
                          filter.values_source_config.values.length > 0;
                          
  return {
    id: filter.id || slug,
    name: filter.name || slug,
    slug,
    type,
    sectionId: filter.sectionId || type.split('/')[0],
    target: filter.target || ['dimension', ['template-tag', slug]],
    default: filter.default ?? null,
    required: Boolean(filter.required),
    values_source_type: hasStaticValues ? 'static-list' : null,
    values_source_config: hasStaticValues ? filter.values_source_config : null,
  };
}

function normalizeParameterMapping(mapping, cardId) {
  return {
    parameter_id: mapping.parameter_id,
    card_id: cardId,
    target: mapping.target,
  };
}

/**
 * existingIds shape (stored in DB after first publish):
 * {
 *   dashboardId: 10,
 *   collectionId: 5,
 *   cardIds: { "<local-card-uuid>": <metabase-card-id> }
 * }
 */
async function publish(dashboardConfig, existingIds = null) {
  const { collection = {}, dashboard = {}, cards = [], filters = [], groups = [] } = dashboardConfig || {};
  const safeFilters = filters || [];
  const safeCards = cards || [];
  const safeGroups = groups || [];
  const safeTabs = dashboard.tabs || [];
  const isUpdate = !!(existingIds?.dashboardId);

  // 1. Get database ID
  const dbId = await metabase.getDatabaseId(config.metabase.database);
  if (!dbId) throw new Error(`Database '${config.metabase.database}' not found in Metabase`);

  let collectionId, dashboardId;

  if (isUpdate) {
    collectionId = existingIds.collectionId;
    dashboardId = existingIds.dashboardId;

    // Update collection name/description (only if collectionId exists and name is provided)
    if (collectionId && collection.name && collection.name.trim()) {
      await metabase.put(`/collection/${collectionId}`, {
        name: collection.name,
        description: collection.description || null,
      });
      console.log(`Collection updated: ${collectionId}`);
    }

    // Update dashboard name/description
    await metabase.put(`/dashboard/${dashboardId}`, {
      name: dashboard.name || 'Untitled Dashboard',
      description: dashboard.description || null,
      ...(dashboard.pin ? { collection_position: 1 } : {}),
    });
    console.log(`Dashboard updated: ${dashboardId}`);

  } else {
    // 2. Create collection (only if name is provided)
    if (collection.name && collection.name.trim()) {
      const collectionRes = await metabase.createCollection(
        collection.name,
        collection.description || null,
        collection.parentId || null
      );
      collectionId = collectionRes.id;
      console.log(`Collection created: ${collectionId}`);
    } else {
      collectionId = null;
      console.log(`No collection name provided — creating dashboard in root`);
    }

    // 3. Create dashboard
    const dashRes = await metabase.post('/dashboard', {
      name: dashboard.name || 'Untitled Dashboard',
      description: dashboard.description || null,
      collection_id: collectionId,
      ...(dashboard.pin ? { collection_position: 1 } : {}),
    });
    dashboardId = dashRes.id;
    console.log(`Dashboard created: ${dashboardId}`);
  }

  // 4. Sync tabs
  let tabIdMap = {};
  if (safeTabs.length > 0) {
    const tabRes = await metabase.put(`/dashboard/${dashboardId}`, {
      tabs: safeTabs.map((tab, idx) => {
        const tempId = isUpdate ? (tab.id || -(idx + 1)) : -(idx + 1);
        return { id: tempId, name: tab.name || 'Tab', position: idx };
      }),
    });
    (tabRes.tabs || []).forEach((tab, idx) => { tabIdMap[idx] = tab.id; });
    console.log(`Tabs synced:`, tabIdMap);
  }

  // 5. Create or update question cards
  const prevCardIds = existingIds?.cardIds || {};
  const newCardIds = {};
  const dashcards = [];
  const parameters = safeFilters.map(normalizeParameter);

  for (const card of safeCards) {
    if (!card.query?.trim()) {
      console.log(`Skipping card '${card.title}' — no query`);
      continue;
    }

    const cardPayload = {
      name: card.title || 'Untitled Card',
      display: card.type || 'table',
      dataset_query: {
        type: 'native',
        native: { query: card.query, 'template-tags': buildTemplateTags(card, safeFilters) },
        database: dbId,
      },
      visualization_settings: card.visualization_settings || {},
      collection_id: collectionId,
    };

    let metabaseCardId = prevCardIds[card.id];

    if (metabaseCardId) {
      // Update existing card
      await metabase.put(`/card/${metabaseCardId}`, cardPayload);
      console.log(`Card updated: ${metabaseCardId} — ${card.title}`);
    } else {
      // Create new card
      const cardRes = await metabase.post('/card', cardPayload);
      metabaseCardId = cardRes.id;
      console.log(`Card created: ${metabaseCardId} — ${card.title}`);
    }

    newCardIds[card.id] = metabaseCardId;

    const dashcard = {
      id: -(dashcards.length + 1),
      card_id: metabaseCardId,
      col: parseInt(card.col, 10) || 0,
      row: parseInt(card.row, 10) || 0,
      size_x: parseInt(card.sizeX, 10) || 6,
      size_y: parseInt(card.sizeY, 10) || 4,
      visualization_settings: card.visualization_settings || {},
      parameter_mappings: (card.parameterMappings || [])
        .filter(mapping => mapping.parameter_id && Array.isArray(mapping.target))
        .map(mapping => normalizeParameterMapping(mapping, metabaseCardId)),
    };
    if (card.tabIndex !== undefined && tabIdMap[card.tabIndex]) {
      dashcard.dashboard_tab_id = tabIdMap[card.tabIndex];
    }
    dashcards.push(dashcard);
  }

  // 6. Replace all dashcards + filters on the dashboard
  const finalPayload = {
    dashcards,
    parameters,
  };
  if (safeTabs.length > 0) {
    finalPayload.tabs = safeTabs.map((tab, idx) => ({
      id: tabIdMap[idx],
      name: tab.name || 'Tab',
      position: idx,
    }));
  }
  await metabase.put(`/dashboard/${dashboardId}`, finalPayload);
  console.log(`Dashboard synced with ${dashcards.length} cards, ${parameters.length} filters, and ${safeTabs.length} tabs`);

  // 7. Sync group permissions (only if collectionId exists).
  if (collectionId) {
    for (const group of safeGroups) {
      const existingGroups = await metabase.listGroups();
      const existing = existingGroups.find(g => g.name === group.name);
      const groupId = existing ? existing.id : (await metabase.createGroup(group.name)).id;
      console.log(`Group: ${group.name} (id=${groupId})`);

      const graphData = await metabase.getRevisionId();
      const currentGroups = graphData.groups || {};
      await metabase.addCollectionToGroup({
        revision: graphData.revision,
        groups: {
          ...currentGroups,
          [groupId]: { ...(currentGroups[groupId] || {}), [collectionId]: 'read' },
        },
      });
    }
  }

  return { dashboardId, collectionId, cardIds: newCardIds };
}

module.exports = { publish };
