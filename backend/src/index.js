const express = require('express');
const cors = require('cors');
const config = require('./config');
const auth = require('./middleware/auth');
const dashboardRoutes = require('./routes/dashboards');
const db = require('./services/db');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.get('/health', (req, res) => res.json({ status: 'UP' }));

app.get('/debug-db', async (req, res) => {
  try {
    const metabase = require('./services/metabase');
    const dbId = await metabase.getDatabaseId(config.metabase.database);
    res.json({ dbName: config.metabase.database, dbId, metabaseUrl: config.metabase.url });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.use('/api/dashboards', auth, dashboardRoutes);

db.init()
  .then(() => {
    app.listen(config.port, () => console.log(`Dashboard Builder API running on port ${config.port}`));
  })
  .catch(err => {
    console.error('DB init failed:', err.message);
    process.exit(1);
  });
