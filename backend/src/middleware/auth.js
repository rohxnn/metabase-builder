const config = require('../config');

module.exports = (req, res, next) => {
  const token = req.headers['authorization'];
  if (!token || token !== config.apiToken) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};
