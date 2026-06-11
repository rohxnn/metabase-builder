export const hasMetabaseFilters = (query = '') => /\{\{\s*[a-zA-Z0-9_.-]+\s*\}\}/.test(query);

export const toPreviewSql = (query = '') => query
  // Metabase optional clauses are only valid inside Metabase, so remove them for direct preview runs.
  .replace(/\[\[[\s\S]*?\{\{\s*[a-zA-Z0-9_.-]+\s*\}\}[\s\S]*?\]\]/g, '')
  .replace(/\{\{\s*[a-zA-Z0-9_.-]+\s*\}\}/g, 'NULL');
