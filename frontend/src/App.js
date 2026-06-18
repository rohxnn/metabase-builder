import React, { useState } from 'react';
import { Provider } from 'react-redux';
import { store, actions } from './store';
import DashboardList from './components/DashboardList';
import Builder from './components/Builder';

function App() {
  const [view, setView] = useState('list'); // 'list' | 'builder'

  const openDashboard = (row) => {
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
    setView('builder');
  };

  const createNew = () => {
    store.dispatch(actions.loadDashboard({
      id: require('uuid').v4(),
      name: 'Untitled Dashboard',
      description: '',
      config: {
        collection: { name: '', description: '', parentId: null },
        dashboard: { name: '', description: '', pin: false, tabs: [{ name: 'Tab 1' }] },
        cards: [],
        filters: [],
        groups: [],
      },
      status: 'draft',
    }));
    setView('builder');
  };

  return (
    <Provider store={store}>
      {view === 'list'
        ? <DashboardList onOpen={openDashboard} onCreate={createNew} />
        : <Builder onBack={() => setView('list')} />
      }
    </Provider>
  );
}

export default App;
