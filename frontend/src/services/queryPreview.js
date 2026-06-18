export const hasMetabaseFilters = (query = '') => /\{\{\s*[a-zA-Z0-9_.-]+\s*\}\}/.test(query);

export const toPreviewSql = (query = '') => {
  let sql = query;

  // 1. For optional clauses containing 'WHEN' (case-insensitive), we strip the brackets so they remain in the query.
  sql = sql.replace(/\[\[([^\]]*?\bwhen\b[^\]]*?)\]\]/gi, '$1');

  // 2. For all other optional clauses [[ ... ]], we remove them completely (like Metabase does when params are null).
  sql = sql.replace(/\[\[[\s\S]*?\]\]/g, '');

  // 3. Replace template tags:
  sql = sql.replace(/\{\{\s*reporting_period\s*\}\}/gi, "'Monthly'");
  
  // Replace template tags used in comparisons with NULL
  sql = sql.replace(/([=<>!]+|in\s*\(|like\s*)\s*\{\{\s*[a-zA-Z0-9_.-]+\s*\}\}/gi, "$1 NULL");

  // Replace standalone template tags (like {{state}}) with 1=1 so they evaluate to true and return data
  sql = sql.replace(/\{\{\s*[a-zA-Z0-9_.-]+\s*\}\}/g, '1=1');

  return sql;
};

export function isConditionSafeForQuery(cond, query, filters = [], metadata = null) {
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

export function extractAndCleanWhereConditions(query) {
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

  if (whereIdx === -1) {
    return { cleanedQuery: query, extractedConditions: [] };
  }

  let endIdx = query.length;
  parenDepth = 0;
  const keywords = ['group by', 'order by', 'limit', 'union'];
  for (let i = whereIdx + 5; i < query.length; i++) {
    if (query[i] === '(') parenDepth++;
    else if (query[i] === ')') {
      if (parenDepth === 0) {
        endIdx = i;
        break;
      }
      parenDepth--;
    } else if (parenDepth === 0) {
      const remaining = query.slice(i).toLowerCase();
      const foundKeyword = keywords.find(kw => remaining.startsWith(kw) && /\s/.test(query[i-1]) && (i + kw.length === query.length || /\s/.test(query[i+kw.length])));
      if (foundKeyword) {
        endIdx = i;
        break;
      }
    }
  }

  const beforeWhere = query.slice(0, whereIdx);
  const whereText = query.slice(whereIdx + 5, endIdx);
  const afterWhere = query.slice(endIdx);

  // Parse whereText into cleanParts (text vs optional blocks)
  const cleanParts = [];
  let lastIdx = 0;
  let optDepth = 0;
  let optStart = -1;
  
  for (let i = 0; i < whereText.length; i++) {
    if (whereText.slice(i, i + 2) === '[[') {
      if (optDepth === 0) {
        optStart = i;
        cleanParts.push({ type: 'text', value: whereText.slice(lastIdx, i) });
      }
      optDepth++;
      i++;
    } else if (whereText.slice(i, i + 2) === ']]') {
      optDepth = Math.max(0, optDepth - 1);
      if (optDepth === 0 && optStart !== -1) {
        cleanParts.push({ type: 'optional', value: whereText.slice(optStart, i + 2) });
        lastIdx = i + 2;
      }
      i++;
    }
  }
  if (lastIdx < whereText.length) {
    cleanParts.push({ type: 'text', value: whereText.slice(lastIdx) });
  }

  const extractedConditions = [];
  const processedParts = [];

  for (const part of cleanParts) {
    if (part.type === 'optional') {
      processedParts.push(part.value);
    } else {
      const text = part.value;
      if (!text.trim()) {
        processedParts.push(text);
        continue;
      }

      // Split the text part by AND at depth 0
      const conds = [];
      let currentCond = '';
      let pDepth = 0;
      let j = 0;
      while (j < text.length) {
        if (text[j] === '(') {
          pDepth++;
          currentCond += '(';
          j++;
          continue;
        }
        if (text[j] === ')') {
          pDepth = Math.max(0, pDepth - 1);
          currentCond += ')';
          j++;
          continue;
        }

        if (pDepth === 0) {
          const remaining = text.slice(j);
          const andMatch = /^(?:and)\b/i.exec(remaining);
          if (andMatch) {
            const trimmed = currentCond.trim();
            if (trimmed) conds.push(trimmed);
            currentCond = '';
            j += andMatch[0].length;
            continue;
          }
        }

        currentCond += text[j];
        j++;
      }
      const trimmed = currentCond.trim();
      if (trimmed) conds.push(trimmed);

      // Filter and collect conditions
      const keptConds = [];
      for (const cond of conds) {
        const cleanedCond = cond.trim();
        if (cleanedCond && cleanedCond !== '1=1' && cleanedCond !== '1 = 1') {
          const programIdMatch = /(?:programs\.id|submissions\.program_id|program_id)\s*=\s*'([^']+)'/i.exec(cleanedCond);
          const leaderIdMatch = /(?:leader_category\.id|submissions\.leader_id|leader_id)\s*=\s*'([^']+)'/i.exec(cleanedCond);
          
          if (programIdMatch) {
            extractedConditions.push(`programs.id = '${programIdMatch[1]}'`);
          } else if (leaderIdMatch) {
            extractedConditions.push(`leader_category.id = '${leaderIdMatch[1]}'`);
          } else {
            keptConds.push(cleanedCond);
          }
        }
      }
      
      if (keptConds.length > 0) {
        processedParts.push(' ' + keptConds.join(' AND ') + ' ');
      } else {
        processedParts.push(' 1=1 ');
      }
    }
  }

  const cleanedWhereText = processedParts.join('');
  const cleanedQuery = beforeWhere + 'WHERE' + cleanedWhereText + afterWhere;

  return { cleanedQuery, extractedConditions };
}

export function injectWhereConditions(query = '', conditions = [], filters = [], metadata = null) {
  const activeConditions = (conditions || [])
     .map(c => c?.trim())
     .filter(Boolean)
     .filter(cond => {
       // Skip template tag variables — these are handled by Metabase's filter system
       if (/^\{\{.*\}\}$/.test(cond.trim())) return false;
       // Skip null checks — these are data quality logic, not filters
       if (/\bIS\s+(NOT\s+)?NULL\b/i.test(cond)) return false;
       // Skip empty string checks
       if (/TRIM\s*\(.*\)\s*<>\s*''/i.test(cond)) return false;
       // Skip if condition already exists in query
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

export function injectPreviewFilterValues(query, parameterMappings = [], filters = [], filterValues = {}, metadata = null) {
  let sql = query;

  for (const mapping of parameterMappings) {
    const filterId = mapping.parameter_id;
    const value = filterValues[filterId];

    const targetTag = mapping.target?.[1]?.[1];
    if (!targetTag) continue;

    const filterObj = filters.find(f => f.id === filterId);
    if (!filterObj) continue;

    const isDimension = mapping.target?.[0] === 'dimension';
    const hasValue = value !== undefined && value !== null && value !== '';

    // Format the value
    let replacement = '';
    if (hasValue) {
      if (isDimension) {
        let tableAndCol = '';
        if (filterObj.fieldId && metadata?.tables) {
          for (const table of metadata.tables) {
            const field = table.fields?.find(f => f.id === filterObj.fieldId);
            if (field) {
              tableAndCol = `${table.name}.${field.name}`;
              break;
            }
          }
        }
        if (!tableAndCol) {
          if (filterObj.tableName && filterObj.fieldName) {
            tableAndCol = `${filterObj.tableName}.${filterObj.fieldName}`;
          } else {
            tableAndCol = filterObj.slug;
          }
        }

        if (Array.isArray(value)) {
          replacement = `${tableAndCol} IN (${value.map(val => `'${String(val).replace(/'/g, "''")}'`).join(', ')})`;
        } else {
          replacement = `${tableAndCol} = '${String(value).replace(/'/g, "''")}'`;
        }
      } else {
        const baseType = filterObj.type?.split('/')?.[0] || 'string';
        if (baseType === 'number') {
          replacement = String(value);
        } else {
          replacement = `'${String(value).replace(/'/g, "''")}'`;
        }
      }
    }

    // Replace optional blocks containing the tag: [[ ... {{tag}} ... ]]
    const optionalRegex = new RegExp(`\\[\\[([^\\]]*?)\\{\\{\\s*${targetTag}\\s*\\}\\}([^\\]]*?)\\]\\]`, 'g');
    if (hasValue) {
      sql = sql.replace(optionalRegex, `$1${replacement}$2`);
    } else {
      sql = sql.replace(optionalRegex, '');
    }

    // Replace any remaining standalone tag (not inside optional blocks)
    const standaloneRegex = new RegExp(`\\{\\{\\s*${targetTag}\\s*\\}\\}`, 'g');
    if (hasValue) {
      sql = sql.replace(standaloneRegex, replacement);
    }
  }

  return sql;
}

