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

function isConditionSafeForQuery(cond, query, filters = [], metadata = null) {
  const sanitizedQuery = query.toLowerCase();
  
  // 1. Find all table references like table_name.column_name
  const tableRefRegex = /\b([a-zA-Z0-9_-]+)\.[a-zA-Z0-9_-]+\b/g;
  let match;
  
  const cleanCond = cond.replace(/'[^']*'/g, '');
  
  while ((match = tableRefRegex.exec(cleanCond)) !== null) {
    const tableName = match[1].toLowerCase();
    
    // Check if the table name exists in the query as a whole word
    const tableWordRegex = new RegExp('\\b' + tableName + '\\b', 'i');
    if (!tableWordRegex.test(sanitizedQuery)) {
      return false; // Table not referenced in query, unsafe!
    }
  }

  // 2. If it's a template tag like {{state}} or {{program}}
  const tagRegex = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;
  while ((match = tagRegex.exec(cond)) !== null) {
    const tagName = match[1].toLowerCase();
    
    // Find matching filter in the filters list
    const filter = (filters || []).find(f => f.slug?.toLowerCase() === tagName || f.name?.toLowerCase() === tagName);
    const expectedTable = filter?.tableName || filter?.table_name;

    if (expectedTable) {
      const tableWordRegex = new RegExp('\\b' + expectedTable.toLowerCase() + '\\b', 'i');
      if (!tableWordRegex.test(sanitizedQuery)) {
        return false; // Expected table not in query, unsafe!
      }
    }
  }

  // 3. For unqualified column names in the condition (without prefix, e.g. statement_type = 'challenges')
  // Verify that the column belongs to at least one table referenced in the query.
  if (metadata && metadata.tables) {
    const words = cleanCond.match(/\b[a-zA-Z_][a-zA-Z0-9_]*\b/g) || [];
    const sqlKeywords = new Set([
      'and', 'or', 'not', 'in', 'like', 'is', 'null', 'true', 'false', 'between', 'exists', 'select', 'where', 'trim'
    ]);
    
    const tablesInQuery = metadata.tables.filter(t => {
      const tableWordRegex = new RegExp('\\b' + t.name.toLowerCase() + '\\b', 'i');
      return tableWordRegex.test(sanitizedQuery);
    });

    for (const word of words) {
      const lowerWord = word.toLowerCase();
      if (sqlKeywords.has(lowerWord)) continue;

      let isKnownColumn = false;
      let isAvailableInQuery = false;

      for (const table of metadata.tables) {
        const hasField = table.fields?.some(f => f.name.toLowerCase() === lowerWord);
        if (hasField) {
          isKnownColumn = true;
          const isInQuery = tablesInQuery.some(t => t.name.toLowerCase() === table.name.toLowerCase());
          if (isInQuery) {
            isAvailableInQuery = true;
          }
        }
      }

      if (isKnownColumn && !isAvailableInQuery) {
        return false; // Column is known but its table is not in the query, unsafe!
      }
    }
  }

  return true;
}

function findFilterForTag(tagName, safeFilters = []) {
  const name = (tagName || '').toLowerCase();
  if (!name) return null;

  // 1. Exact slug match
  let filter = safeFilters.find(f => f.slug === name);
  if (filter) return filter;

  // 2. Exact name match (normalized)
  filter = safeFilters.find(f => (f.name || '').toLowerCase().replace(/\s+/g, '_') === name);
  if (filter) return filter;

  // 3. Loose match: filter slug contains tag name, or tag name contains filter slug
  filter = safeFilters.find(f => f.slug && (f.slug.includes(name) || name.includes(f.slug)));
  if (filter) return filter;

  // 4. Loose name match
  filter = safeFilters.find(f => {
    const fName = (f.name || '').toLowerCase().replace(/\s+/g, '_');
    return fName && (fName.includes(name) || name.includes(fName));
  });
  return filter || null;
}

function injectWhereConditions(query = '', conditions = [], filters = [], metadata = null) {
  const activeConditions = (conditions || [])
    .map(c => c?.trim())
    .filter(Boolean)
    .filter(cond => {
      // Skip template tag variables — handled by Metabase filter system
      if (/^\{\{.*\}\}$/.test(cond.trim())) return false;
      // Skip null checks — data quality logic, not filters
      if (/\bIS\s+(NOT\s+)?NULL\b/i.test(cond)) return false;
      // Skip empty string checks
      if (/TRIM\s*\(.*\)\s*<>\s*''/i.test(cond)) return false;
      // Skip if already in query
      const sanitizedCond = cond.toLowerCase().replace(/\s+/g, '');
      const sanitizedQuery = query.toLowerCase().replace(/\s+/g, '');
      if (sanitizedQuery.includes(sanitizedCond)) return false;
      return isConditionSafeForQuery(cond, query, filters, metadata);
    });

  if (activeConditions.length === 0) return query;

  if (!/from/i.test(query)) return query;

  let whereIdx = -1;
  let parenDepth = 0;
  for (let i = 0; i < query.length; i++) {
    if (query[i] === '(') parenDepth++;
    else if (query[i] === ')') parenDepth--;
    else if (parenDepth === 0 && query.slice(i, i + 5).toLowerCase() === 'where' && (i === 0 || /\s/.test(query[i-1])) && (i + 5 === query.length || /\s/.test(query[i+5]))) {
      whereIdx = i;
      break;
    }
  }

  const joinConditions = activeConditions.join(' AND ');

  if (whereIdx !== -1) {
    const insertPos = whereIdx + 5;
    return query.slice(0, insertPos) + ' (' + joinConditions + ') AND ' + query.slice(insertPos);
  } else {
    let insertPos = query.length;
    parenDepth = 0;
    const keywords = ['group by', 'order by', 'limit', 'union'];
    for (let i = 0; i < query.length; i++) {
      if (query[i] === '(') parenDepth++;
      else if (query[i] === ')') parenDepth--;
      else if (parenDepth === 0) {
        const remaining = query.slice(i).toLowerCase();
        const foundKeyword = keywords.find(kw => remaining.startsWith(kw) && (i === 0 || /\s/.test(query[i-1])) && (i + kw.length === query.length || /\s/.test(query[i+kw.length])));
        if (foundKeyword) {
          insertPos = i;
          break;
        }
      }
    }
    return query.slice(0, insertPos) + ' WHERE ' + joinConditions + ' ' + query.slice(insertPos);
  }
}

function extractFieldId(fieldVal, existingDimension = null) {
  if (!fieldVal) return null;
  if (typeof fieldVal === 'number' || typeof fieldVal === 'string') {
    return fieldVal;
  }
  if (typeof fieldVal === 'object') {
    // If it's a lib/uuid object, look inside existingDimension if available
    if (Array.isArray(existingDimension) && existingDimension[0] === 'field') {
      if (typeof existingDimension[1] === 'object' && existingDimension[1] !== null && existingDimension[2] !== undefined) {
        return existingDimension[2];
      }
      if (typeof existingDimension[1] === 'number' || typeof existingDimension[1] === 'string') {
        return existingDimension[1];
      }
    }
    // As a backup, check if fieldVal itself is an array
    if (Array.isArray(fieldVal) && fieldVal[0] === 'field') {
      if (typeof fieldVal[1] === 'object' && fieldVal[1] !== null && fieldVal[2] !== undefined) {
        return fieldVal[2];
      }
      return fieldVal[1];
    }
  }
  return fieldVal;
}

function normalizeDimension(dim) {
  if (!Array.isArray(dim)) return dim;
  if (dim[0] === 'field') {
    if (typeof dim[1] === 'object' && dim[1] !== null && dim[2] !== undefined) {
      return ['field', dim[2], null];
    }
  }
  return dim;
}

/**
 * Build template tags for a native SQL query card.
 * 
 * Determines tag types from:
 * 1. Card's existing parameterMappings (which carry the correct 'dimension' vs 'variable' target from Metabase)
 * 2. Card's own templateTags stored in config  
 * 3. Filter's fieldId (if set)
 * 4. Fallback inference from name
 */
function buildTemplateTags(card, filters = []) {
  const existing = card.templateTags || {};
  const mappings = card.parameterMappings || [];
  
  // Build a set of tag names that are mapped as 'dimension' type
  // based on the parameterMappings targets from Metabase
  const dimensionTags = new Set();
  mappings.forEach(m => {
    if (m.target?.[0] === 'dimension' && m.target?.[1]?.[1]) {
      dimensionTags.add(m.target[1][1]);
    }
  });

  return extractTemplateNames(card.query).reduce((tags, name) => {
    const filter = findFilterForTag(name, filters);
    const hasFieldMapping = filter && filter.fieldId;
    
    // Determine the tag type:
    // Priority 1: If the parameterMappings say it's a dimension, use dimension
    // Priority 2: If the filter has a fieldId, use dimension
    // Priority 3: Use existing tag type from card config
    // Priority 4: Infer from name
    let tagType;
    if (dimensionTags.has(name)) {
      tagType = 'dimension';
    } else if (hasFieldMapping) {
      tagType = 'dimension';
    } else {
      tagType = existing[name]?.type || inferTemplateTagType(name, filters);
    }

    const tagObj = {
      id: existing[name]?.id || name,
      name,
      'display-name': existing[name]?.['display-name'] || existing[name]?.display_name || name.replace(/_/g, ' '),
      type: tagType,
      required: Boolean(existing[name]?.required),
      ...existing[name],
    };

    // Force the type to our resolved value (existing[name] spread may have overwritten it)
    tagObj.type = tagType;

    // Preserve card-level dropdown configs (question-specific filters like reporting_period)
    // Handle both underscored (our format) and hyphenated (Metabase format) keys
    const srcType = existing[name]?.values_source_type || existing[name]?.['values-source-type'];
    const srcConfig = existing[name]?.values_source_config || existing[name]?.['values-source-config'];
    if (srcType) {
      // Write both formats for compatibility
      tagObj['values-source-type'] = srcType;
      tagObj['values-source-config'] = srcConfig || null;
      tagObj.values_source_type = srcType;
      tagObj.values_source_config = srcConfig || null;
    }

    // Preserve default value from card-level tag or dashboard filter
    if (existing[name]?.default != null) {
      tagObj.default = existing[name].default;
    } else if (filter?.default != null) {
      tagObj.default = filter.default;
    }

    if (tagType === 'dimension') {
      // For dimension tags, we need the field reference
      let resolvedFieldId = null;
      if (filter && filter.fieldId) {
        resolvedFieldId = extractFieldId(filter.fieldId, existing[name]?.dimension);
      }
      if (!resolvedFieldId && existing[name]?.dimension) {
        const norm = normalizeDimension(existing[name].dimension);
        if (Array.isArray(norm) && norm[0] === 'field') {
          resolvedFieldId = norm[1];
        }
      }

      if (resolvedFieldId) {
        tagObj.dimension = ['field', resolvedFieldId, null];
      } else if (existing[name]?.dimension) {
        tagObj.dimension = normalizeDimension(existing[name].dimension);
      }
      tagObj['widget-type'] = existing[name]?.['widget-type'] || filter?.type || 'string/=';
    }

    return {
      ...tags,
      [name]: tagObj,
    };
  }, { ...existing });
}

function normalizeParameter(filter) {
  const slug = filter.slug || (filter.name || 'filter').toLowerCase().replace(/\s+/g, '_');
  const type = filter.type || 'string/=';
  const hasStaticValues = filter.values_source_type === 'static-list' && 
                          filter.values_source_config && 
                          Array.isArray(filter.values_source_config.values) && 
                          filter.values_source_config.values.length > 0;

  let valuesConfig = null;
  if (hasStaticValues) {
    const formattedValues = filter.values_source_config.values.map(val => {
      if (Array.isArray(val)) return val;
      return [val];
    });
    valuesConfig = { values: formattedValues };
  }

  // NOTE: Do NOT include `target` here — Metabase's parameter validator
  // crashes (ClassCastException) when it encounters a `target` on dashboard-level
  // parameters. Targets belong only on parameter_mappings inside dashcards.
  const param = {
    id: filter.id || slug,
    name: filter.name || slug,
    slug,
    type,
    sectionId: filter.sectionId || type.split('/')[0],
  };

  // Only include optional fields if they have meaningful values
  if (filter.default !== undefined && filter.default !== null) {
    param.default = filter.default;
  }
  if (filter.required) {
    param.required = true;
  }
  if (hasStaticValues) {
    param.values_source_type = 'static-list';
    param.values_source_config = valuesConfig;
  }

  // Preserve filteringParameters (linked filter dependencies)
  if (Array.isArray(filter.filteringParameters) && filter.filteringParameters.length > 0) {
    param.filteringParameters = filter.filteringParameters;
  } else if (Array.isArray(filter.filtering_parameters) && filter.filtering_parameters.length > 0) {
    param.filteringParameters = filter.filtering_parameters;
  }
  
  // Preserve isMultiSelect if set
  if (filter.isMultiSelect !== undefined) {
    param.isMultiSelect = filter.isMultiSelect;
  }

  return param;
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
  const metadata = await metabase.getDatabaseMetadata(dbId).catch(() => null);

  let collectionId, dashboardId;

  if (isUpdate) {
    collectionId = existingIds.collectionId;
    dashboardId = existingIds.dashboardId;

    // Ensure dashboard is not archived — unarchive if needed
    try {
      const existing = await metabase.get(`/dashboard/${dashboardId}`);
      if (existing.archived) {
        await metabase.put(`/dashboard/${dashboardId}`, { archived: false });
        console.log(`Dashboard ${dashboardId} was archived — unarchived`);
      }
    } catch (e) {
      // Dashboard might not exist at all, create a new one instead
      console.log(`Dashboard ${dashboardId} not accessible, creating new: ${e.message}`);
      const dashRes = await metabase.post('/dashboard', {
        name: dashboard.name || 'Untitled Dashboard',
        description: dashboard.description || null,
        collection_id: collectionId,
        ...(dashboard.pin ? { collection_position: 1 } : {}),
      });
      dashboardId = dashRes.id;
      console.log(`New dashboard created: ${dashboardId} (replacing broken ${existingIds.dashboardId})`);
    }

    // Create collection if it's missing but we have a collection name
    if (!collectionId && collection.name && collection.name.trim()) {
      const collectionRes = await metabase.createCollection(
        collection.name,
        collection.description || null,
        collection.parentId || null
      );
      collectionId = collectionRes.id;
      console.log(`Collection created (was missing): ${collectionId}`);
      
      // Move dashboard to the new collection
      await metabase.put(`/dashboard/${dashboardId}`, { collection_id: collectionId });
    }

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

  // 4. Create/locate sub-collection (Removed: assign directly to dashboard's collection and link via dashboard_id)

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

    const finalQuery = injectWhereConditions(card.query, dashboardConfig.whereConditions || [], safeFilters, metadata);

    // Build template tags — this now uses parameterMappings to correctly
    // detect dimension vs variable types
    const compiledTags = buildTemplateTags({ ...card, query: finalQuery }, safeFilters);

    // Helper: build a properly-typed mapping target for a given template tag name
    function buildMappingTarget(tagName) {
      const tagType = compiledTags[tagName]?.type;
      if (tagType === 'dimension') {
        return ['dimension', ['template-tag', tagName], { 'stage-number': 0 }];
      }
      return ['variable', ['template-tag', tagName]];
    }

    const finalMappings = [];
    // Heal parameter_id in existing mappings if there is a mismatch (e.g. from cloning)
    (card.parameterMappings || []).forEach(mapping => {
      let filter = safeFilters.find(f => f.id === mapping.parameter_id);
      if (!filter) {
        const tagName = mapping.target?.[1]?.[1];
        if (tagName) {
          filter = findFilterForTag(tagName, safeFilters);
        }
      }
      if (filter) {
        const tagName = mapping.target?.[1]?.[1];
        finalMappings.push({
          parameter_id: filter.id || filter.slug,
          target: tagName ? buildMappingTarget(tagName) : mapping.target,
        });
      } else {
        finalMappings.push(mapping);
      }
    });
    const extractedTags = extractTemplateNames(finalQuery);
    extractedTags.forEach(tagName => {
      const exists = finalMappings.some(m => m.target?.[1]?.[1] === tagName);
      if (!exists) {
        const matchingFilter = findFilterForTag(tagName, safeFilters);
        if (matchingFilter) {
          finalMappings.push({
            parameter_id: matchingFilter.id || matchingFilter.slug,
            target: buildMappingTarget(tagName),
          });
        }
      }
    });

    const cardPayload = {
      name: card.title || 'Untitled Card',
      display: card.type || 'table',
      dataset_query: {
        type: 'native',
        native: { 
          query: finalQuery, 
          'template-tags': compiledTags,
        },
        database: dbId,
      },
      visualization_settings: card.visualization_settings || {},
      collection_id: collectionId,
      dashboard_id: dashboardId,
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
      card: { id: metabaseCardId },  // Required by Metabase for new dashcards with negative IDs
      col: parseInt(card.col, 10) || 0,
      row: parseInt(card.row, 10) || 0,
      size_x: parseInt(card.sizeX, 10) || 6,
      size_y: parseInt(card.sizeY, 10) || 4,
      visualization_settings: card.visualization_settings || {},
      parameter_mappings: (finalMappings || [])
        .filter(mapping => mapping.parameter_id && Array.isArray(mapping.target))
        .map(mapping => normalizeParameterMapping(mapping, metabaseCardId)),
    };
    if (card.tabIndex !== undefined && card.tabIndex >= 0 && card.tabIndex < safeTabs.length) {
      dashcard.dashboard_tab_id = -(card.tabIndex + 1);
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
      id: -(idx + 1),
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
