import React, { useCallback, useEffect, useState } from 'react';
import { Provider } from 'react-redux';
import { v4 as uuidv4 } from 'uuid';
import { store, actions } from './store';
import { getDashboard } from './services/api';
import DashboardList from './components/DashboardList';
import Builder from './components/Builder';

function App() {
  const [view, setView] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('view') === 'builder' ? 'builder' : 'list';
  }); // 'list' | 'builder'
  const [loadingDashboard, setLoadingDashboard] = useState(false);
  const [loadError, setLoadError] = useState(null);

  const updateQuery = useCallback((updates, { replace = false } = {}) => {
    const params = new URLSearchParams(window.location.search);
    Object.entries(updates).forEach(([key, value]) => {
      if (value === null || value === undefined || value === '') {
        params.delete(key);
      } else {
        params.set(key, String(value));
      }
    });

    const query = params.toString();
    const url = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`;
    window.history[replace ? 'replaceState' : 'pushState']({}, '', url);
  }, []);

  const loadDashboardIntoStore = useCallback((row) => {
    store.dispatch(actions.loadDashboard({
      id: row.id,
      name: row.name,
      description: row.description,
      config: row.config,
      status: row.status,
      metabase_dashboard_id: row.metabase_dashboard_id,
      metabase_collection_id: row.metabase_collection_id,
      metabase_card_ids: row.metabase_card_ids,
    }));
  }, []);

  const openDashboard = useCallback((row, { replace = false } = {}) => {
    loadDashboardIntoStore(row);
    setView('builder');
    setLoadError(null);
    updateQuery({ view: 'builder', dashboardId: row.id, new: null }, { replace });
  }, [loadDashboardIntoStore, updateQuery]);

  const createNew = useCallback((id = uuidv4(), { replace = false } = {}) => {
    store.dispatch(actions.loadDashboard({
      id,
      name: 'Untitled Dashboard',
      description: '',
      config: {
        collection: { name: '', description: '', parentId: null },
        dashboard: { name: '', description: '', pin: true, tabs: [{ name: 'Tab 1' }] },
        cards: [],
        filters: [],
        groups: [],
      },
      status: 'draft',
    }));
    setView('builder');
    setLoadError(null);
    updateQuery({ view: 'builder', dashboardId: id, new: '1' }, { replace });
  }, [updateQuery]);

  const goToList = useCallback(({ replace = false } = {}) => {
    setView('list');
    setLoadError(null);
    updateQuery({ view: null, dashboardId: null, new: null, tab: null }, { replace });
  }, [updateQuery]);

  useEffect(() => {
    let cancelled = false;

    const syncFromQuery = async () => {
      const params = new URLSearchParams(window.location.search);
      const nextView = params.get('view');
      const dashboardId = params.get('dashboardId');

      if (nextView !== 'builder') {
        if (!cancelled) goToList({ replace: true });
        return;
      }

      if (!dashboardId) {
        if (!cancelled) goToList({ replace: true });
        return;
      }

      const currentBuilder = store.getState().builder;
      if (view === 'builder' && currentBuilder.id === dashboardId) {
        setLoadError(null);
        return;
      }

      if (params.get('new') === '1') {
        if (!cancelled) createNew(dashboardId, { replace: true });
        return;
      }

      setLoadingDashboard(true);
      setLoadError(null);
      try {
        const dashboard = await getDashboard(dashboardId);
        if (!cancelled) openDashboard(dashboard, { replace: true });
      } catch (err) {
        if (!cancelled) {
          setView('list');
          setLoadError(err.response?.data?.error || err.message || 'Failed to load dashboard');
        }
      } finally {
        if (!cancelled) setLoadingDashboard(false);
      }
    };

    syncFromQuery();
    window.addEventListener('popstate', syncFromQuery);
    return () => {
      cancelled = true;
      window.removeEventListener('popstate', syncFromQuery);
    };
  }, [createNew, goToList, openDashboard, view]);

  return (
    <Provider store={store}>
      {loadingDashboard ? (
        <div className="h-screen flex items-center justify-center bg-slate-100 text-sm font-semibold text-slate-600">
          Loading dashboard...
        </div>
      ) : view === 'list' ? (
        <DashboardList onOpen={openDashboard} onCreate={() => createNew()} />
      ) : (
        <Builder onBack={() => goToList()} />
      )}
      {loadError && (
        <div className="fixed bottom-4 right-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 shadow-lg">
          {loadError}
        </div>
      )}
    </Provider>
  );
}

export default App;
