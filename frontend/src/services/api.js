import axios from 'axios';

const API_TOKEN = process.env.REACT_APP_API_TOKEN || 'your-secret-token';

const api = axios.create({
  baseURL: '/api',
  headers: { Authorization: API_TOKEN },
});

export const listDashboards = () => api.get('/dashboards').then(r => r.data);
export const getDashboard = (id) => api.get(`/dashboards/${id}`).then(r => r.data);
export const saveDashboard = (payload) => api.post('/dashboards', payload).then(r => r.data);
export const deleteDashboard = (id) => api.delete(`/dashboards/${id}`).then(r => r.data);
export const publishDashboard = (id) => api.post(`/dashboards/${id}/publish`).then(r => r.data);

export const listDatabases = () => api.get('/dashboards/metabase/databases').then(r => r.data);
export const getDatabaseMetadata = (dbId) => api.get(`/dashboards/metabase/databases/${dbId}/metadata`).then(r => r.data);
export const listMetabaseDashboards = () => api.get('/dashboards/metabase/dashboards').then(r => r.data);
export const getMetabaseDashboard = (id) => api.get(`/dashboards/metabase/dashboards/${id}`).then(r => r.data);
export const runQuery = (sql) => api.post('/dashboards/query', { sql }).then(r => r.data);
export const listCollections = () => api.get('/dashboards/metabase/collections').then(r => r.data);
export const getFieldValues = (fieldId) => api.get(`/dashboards/metabase/field/${fieldId}/values`).then(r => r.data);
export const getUserInfo = () => api.get('/dashboards/user').then(r => r.data);
export const getAppConfig = () => api.get('/dashboards/config').then(r => r.data);



