const { Pool } = require('pg');
const config = require('../config');

const pool = new Pool(config.postgres);

const init = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS dashboard_configs (
      id UUID PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      config JSONB NOT NULL,
      status VARCHAR(50) DEFAULT 'draft',
      metabase_dashboard_id INTEGER,
      metabase_collection_id INTEGER,
      metabase_card_ids JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  // Add columns if table already exists from a previous version
  await pool.query(`ALTER TABLE dashboard_configs ADD COLUMN IF NOT EXISTS metabase_collection_id INTEGER`).catch(() => {});
  await pool.query(`ALTER TABLE dashboard_configs ADD COLUMN IF NOT EXISTS metabase_card_ids JSONB DEFAULT '{}'`).catch(() => {});
};

const save = async (id, name, description, config, metabaseDashboardId = null, metabaseCollectionId = null, metabaseCardIds = {}) => {
  const res = await pool.query(
    `INSERT INTO dashboard_configs (id, name, description, config, metabase_dashboard_id, metabase_collection_id, metabase_card_ids)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (id) DO UPDATE SET 
       name=$2, 
       description=$3, 
       config=$4, 
       metabase_dashboard_id=COALESCE(dashboard_configs.metabase_dashboard_id, $5), 
       metabase_collection_id=COALESCE(dashboard_configs.metabase_collection_id, $6), 
       metabase_card_ids=CASE 
         WHEN $7 IS NULL OR $7 = '{}'::jsonb THEN COALESCE(dashboard_configs.metabase_card_ids, '{}'::jsonb)
         ELSE $7 
       END,
       updated_at=NOW()
     RETURNING *`,
    [id, name, description, JSON.stringify(config), metabaseDashboardId, metabaseCollectionId, JSON.stringify(metabaseCardIds)]
  );
  return res.rows[0];
};

const list = async () => {
  const res = await pool.query('SELECT * FROM dashboard_configs ORDER BY updated_at DESC');
  return res.rows;
};

const getById = async (id) => {
  const res = await pool.query('SELECT * FROM dashboard_configs WHERE id=$1', [id]);
  return res.rows[0];
};

const markPublished = async (id, metabaseDashboardId, metabaseCollectionId, metabaseCardIds) => {
  const res = await pool.query(
    `UPDATE dashboard_configs
     SET status='published', metabase_dashboard_id=$2, metabase_collection_id=$3, metabase_card_ids=$4, updated_at=NOW()
     WHERE id=$1 RETURNING *`,
    [id, metabaseDashboardId, metabaseCollectionId, JSON.stringify(metabaseCardIds)]
  );
  return res.rows[0];
};

const remove = async (id) => {
  await pool.query('DELETE FROM dashboard_configs WHERE id=$1', [id]);
};

module.exports = { init, save, list, getById, markPublished, remove };
