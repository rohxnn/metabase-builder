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

app.use('/api/dashboards', auth, dashboardRoutes);

db.init()
  .then(() => {
    app.listen(config.port, () => console.log(`Dashboard Builder API running on port ${config.port}`));
  })
  .catch(err => {
    console.error('DB init failed:', err.message);
    process.exit(1);
  });
