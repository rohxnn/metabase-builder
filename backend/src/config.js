require('dotenv').config();

module.exports = {
  port: process.env.PORT || 8081,
  apiToken: process.env.API_TOKEN,
  metabase: {
    url: process.env.METABASE_URL,
    username: process.env.METABASE_USERNAME,
    password: process.env.METABASE_PASSWORD,
    database: process.env.METABASE_DATABASE,
    apiKey: process.env.METABASE_API_KEY,
  },
  postgres: {
    host: process.env.PG_HOST,
    port: parseInt(process.env.PG_PORT || '5432'),
    user: process.env.PG_USER,
    password: process.env.PG_PASSWORD,
    database: process.env.PG_DATABASE,
  },
};
