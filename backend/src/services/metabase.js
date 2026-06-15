const axios = require('axios');
const config = require('../config');

class MetabaseService {
  constructor() {
    this.baseUrl = config.metabase.url;
    this.sessionToken = null;
  }

  async authenticate() {
    const res = await axios.post(`${this.baseUrl}/session`, {
      username: config.metabase.username,
      password: config.metabase.password,
    });
    this.sessionToken = res.data.id;
    return this.sessionToken;
  }

  async getToken() {
    if (!this.sessionToken) await this.authenticate();
    return this.sessionToken;
  }

  headers() {
    return { 'Content-Type': 'application/json', 'X-Metabase-Session': this.sessionToken };
  }

  async get(path) {
    await this.getToken();
    const res = await axios.get(`${this.baseUrl}${path}`, { headers: this.headers() });
    return res.data;
  }

  async post(path, data) {
    await this.getToken();
    try {
      const res = await axios.post(`${this.baseUrl}${path}`, data, { headers: this.headers() });
      return res.data;
    } catch (e) {
      const detail = e.response?.data ? JSON.stringify(e.response.data) : e.message;
      throw new Error(`POST ${path} failed [${e.response?.status}]: ${detail}`);
    }
  }

  async put(path, data) {
    await this.getToken();
    try {
      const res = await axios.put(`${this.baseUrl}${path}`, data, { headers: this.headers() });
      return res.data;
    } catch (e) {
      const detail = e.response?.data ? JSON.stringify(e.response.data) : e.message;
      throw new Error(`PUT ${path} failed [${e.response?.status}]: ${detail}`);
    }
  }

  // Collections
  async listCollections() { return this.get('/collection'); }
  async createCollection(name, description, parentId = null) {
    const body = { name, description: description || null };
    if (parentId) body.parent_id = parentId;
    return this.post('/collection', body);
  }

  // Dashboards
  async listDashboards() { return this.get('/dashboard'); }
  async getDashboard(id) { return this.get(`/dashboard/${id}`); }
  async getDashboardCards(id) { return this.get(`/dashboard/${id}/cards`); }
  async createDashboard(name, description, collectionId, pin = false) {
    const body = { name, description, collection_id: collectionId };
    if (pin) body.collection_position = 1;
    return this.post('/dashboard', body);
  }
  async updateDashboard(id, body) { return this.put(`/dashboard/${id}`, body); }

  // Cards (Questions)
  async getCard(id) { return this.get(`/card/${id}`); }
  async createCard(body) { return this.post('/card', body); }

  // Groups
  async listGroups() { return this.get('/permissions/group'); }
  async createGroup(name) { return this.post('/permissions/group', { name }); }
  async getRevisionId() { return this.get('/collection/graph'); }
  async addCollectionToGroup(body) { return this.put('/collection/graph', body); }

  // Users
  async listUsers() { return this.get('/user/?status=all'); }
  async createUser(body) { return this.post('/user', body); }
  async addUserToGroup(userId, groupId) {
    return this.post('/permissions/membership', { user_id: userId, group_id: groupId });
  }

  // Database
  async listDatabases() { return this.get('/database'); }
  async getDatabaseMetadata(dbId) { return this.get(`/database/${dbId}/metadata`); }

  // Field values (distinct values for a field)
  async getFieldValues(fieldId) { return this.get(`/field/${fieldId}/values`); }

  async getDatabaseId(dbName) {
    const data = await this.listDatabases();
    const db = (data.data || []).find(d => d.name === dbName);
    return db ? db.id : null;
  }

  // Run a native SQL query and return { columns, rows }
  async runQuery(sql) {
    await this.getToken();
    const dbId = await this.getDatabaseId(config.metabase.database);
    if (!dbId) throw new Error(`Database '${config.metabase.database}' not found`);
    const res = await axios.post(`${this.baseUrl}/dataset`, {
      database: dbId,
      type: 'native',
      native: { query: sql },
    }, { headers: this.headers() });
    const data = res.data.data || {};
    return {
      columns: (data.cols || []).map(c => c.display_name || c.name),
      rows: data.rows || [],
    };
  }
}

module.exports = new MetabaseService();
