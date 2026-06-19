const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../services/db');
const publisher = require('../services/publisher');
const metabase = require('../services/metabase');

// Run a native SQL query — returns { columns, rows }
router.post('/query', async (req, res) => {
  try {
    const { sql } = req.body;
    if (!sql) return res.status(400).json({ error: 'sql is required' });
    res.json(await metabase.runQuery(sql));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Metabase proxy helpers for the UI
router.get('/metabase/databases', async (req, res) => {
  try {
    res.json(await metabase.listDatabases());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/metabase/databases/:dbId/metadata', async (req, res) => {
  try {
    res.json(await metabase.getDatabaseMetadata(parseInt(req.params.dbId)));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/metabase/collections', async (req, res) => {
  try {
    res.json(await metabase.listCollections());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/metabase/dashboards', async (req, res) => {
  try {
    const [dashboards, collections] = await Promise.all([
      metabase.listDashboards(),
      metabase.listCollections().catch(() => [])
    ]);

    const collectionMap = {};
    if (Array.isArray(collections)) {
      collections.forEach(c => {
        if (c && c.id) {
          collectionMap[c.id] = c.name;
        }
      });
    }

    const enriched = (dashboards || []).map(d => {
      const collectionId = d.collection_id;
      let collectionName = d.collection?.name || d.collection_name;
      if (!collectionName && collectionId && collectionMap[collectionId]) {
        collectionName = collectionMap[collectionId];
      }
      return {
        ...d,
        collection_name: collectionName || null,
        collection: d.collection ? { ...d.collection, name: collectionName || d.collection.name } : (collectionId ? { id: collectionId, name: collectionName || null } : null)
      };
    });

    res.json(enriched);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/metabase/dashboards/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const dashboard = await metabase.getDashboard(id);
    let cards = dashboard.dashcards || dashboard.ordered_cards || dashboard.cards || [];

    if (!cards.length) {
      try {
        cards = await metabase.getDashboardCards(id);
      } catch (inner) {
        cards = [];
      }
    }

    if (cards.length) {
      cards = await Promise.all(cards.map(async (item) => {
        const cardEntry = item.card || item;
        const cardId = cardEntry.id || cardEntry.card_id;
        if (!cardId) return item;
        try {
          const fullCard = await metabase.getCard(cardId);
          // Preserve dashcard-level fields (parameter_mappings, col, row, size etc.)
          // Only set fullCard as the nested 'card' property
          return { ...item, card: fullCard };
        } catch (err) {
          return item;
        }
      }));
    }

    res.json({ ...dashboard, cards, ordered_cards: cards, dashcards: cards });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});


// Get distinct values for a specific field (for populating dropdown filters)
router.get('/metabase/field/:fieldId/values', async (req, res) => {
  try {
    const fieldId = parseInt(req.params.fieldId);
    const data = await metabase.getFieldValues(fieldId);
    // Metabase returns { values: [[val1], [val2], ...], field_id: ... }
    const values = (data.values || []).map(v => Array.isArray(v) ? v[0] : v);
    res.json({ values, field_id: fieldId });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get user credentials info from environment
router.get('/user', (req, res) => {
  const email = req.app.get('config')?.metabase?.username || process.env.METABASE_USERNAME || 'admin@metabase.com';
  const username = email.split('@')[0];
  let name = username;
  if (username === 'qamitraadmin') {
    name = 'QA Mitra Admin';
  } else {
    name = username.charAt(0).toUpperCase() + username.slice(1);
  }
  res.json({ email, name });
});

// Get app configuration info from environment
router.get('/config', (req, res) => {
  res.json({
    defaultDatabase: req.app.get('config')?.metabase?.database || process.env.METABASE_DATABASE || 'test'
  });
});

// List all saved dashboard configs
router.get('/', async (req, res) => {
  try {
    res.json(await db.list());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get a single config
router.get('/:id', async (req, res) => {
  try {
    const row = await db.getById(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Save / update a dashboard config (draft)
router.post('/', async (req, res) => {
  try {
    const { name, description, config, metabase_dashboard_id, metabase_collection_id, metabase_card_ids } = req.body;
    const id = req.body.id || uuidv4();
    const row = await db.save(
      id,
      name,
      description || '',
      config,
      metabase_dashboard_id || null,
      metabase_collection_id || null,
      metabase_card_ids || {}
    );
    res.json(row);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Delete a config
router.delete('/:id', async (req, res) => {
  try {
    await db.remove(req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Publish — create or update everything in Metabase
router.post('/:id/publish', async (req, res) => {
  try {
    const row = await db.getById(req.params.id);
    if (!row) return res.status(404).json({ error: 'Config not found' });

    // Pass existing Metabase IDs if already published so publisher updates instead of creates
    const existingIds = row.metabase_dashboard_id ? {
      dashboardId: row.metabase_dashboard_id,
      collectionId: row.metabase_collection_id,
      cardIds: row.metabase_card_ids || {},
    } : null;

    const { dashboardId, collectionId, cardIds } = await publisher.publish(row.config, existingIds);
    const updated = await db.markPublished(req.params.id, dashboardId, collectionId, cardIds);
    res.json({ success: true, dashboardId, collectionId, record: updated });
  } catch (e) {
    res.status(e.statusCode || 500).json({ error: e.message });
  }
});

module.exports = router;
