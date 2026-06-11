import { configureStore, createSlice } from '@reduxjs/toolkit';
import { v4 as uuidv4 } from 'uuid';

const defaultConfig = {
  collection: { name: '', description: '', parentId: null },
  dashboard: { name: '', description: '', pin: false, tabs: [] },
  cards: [],
  filters: [],
  groups: [],
};

const builderSlice = createSlice({
  name: 'builder',
  initialState: {
    id: uuidv4(),
    name: 'Untitled Dashboard',
    description: '',
    config: defaultConfig,
    status: 'draft',
    metabase_dashboard_id: null,
    metabase_collection_id: null,
    metabase_card_ids: {},
    saving: false,
    publishing: false,
    error: null,
    successMessage: null,
  },
  reducers: {
    loadDashboard(state, { payload }) {
      return {
        ...state,
        ...payload,
        config: payload.config || defaultConfig,
        metabase_dashboard_id: payload.metabase_dashboard_id || null,
        metabase_collection_id: payload.metabase_collection_id || null,
        metabase_card_ids: payload.metabase_card_ids || {},
      };
    },
    setMeta(state, { payload }) {
      state.name = payload.name ?? state.name;
      state.description = payload.description ?? state.description;
    },
    setCollection(state, { payload }) {
      state.config.collection = { ...state.config.collection, ...payload };
    },
    setDashboardMeta(state, { payload }) {
      state.config.dashboard = { ...state.config.dashboard, ...payload };
    },
    addTab(state, { payload }) {
      state.config.dashboard.tabs.push({ name: payload });
    },
    removeTab(state, { payload }) {
      state.config.dashboard.tabs.splice(payload, 1);
      // remove cards belonging to this tab
      state.config.cards = state.config.cards.filter(c => c.tabIndex !== payload);
    },
    addCard(state, { payload }) {
      state.config.cards.push({
        id: uuidv4(),
        title: payload.title || 'New Card',
        type: payload.type || 'table',
        query: payload.query || '',
        visualization_settings: payload.visualization_settings || {},
        col: payload.col ?? 0,
        row: payload.row ?? 0,
        sizeX: payload.sizeX ?? 6,
        sizeY: payload.sizeY ?? 4,
        tabIndex: payload.tabIndex ?? undefined,
        parameterMappings: payload.parameterMappings || [],
        templateTags: payload.templateTags || {},
      });
    },
    updateCard(state, { payload }) {
      const idx = state.config.cards.findIndex(c => c.id === payload.id);
      if (idx !== -1) state.config.cards[idx] = { ...state.config.cards[idx], ...payload };
    },
    duplicateCard(state, { payload }) {
      const original = state.config.cards.find(c => c.id === payload);
      if (original) {
        const {
          metabaseCardId,
          metabaseDashcardId,
          dashboardTabId,
          resultMetadata,
          rawDatasetQuery,
          parameterMappings,
          ...localCard
        } = original;
        state.config.cards.push({
          ...localCard,
          id: uuidv4(),
          title: `${original.title} (Copy)`,
          col: original.col + 1,
          row: original.row + 1,
          parameterMappings: [],
        });
      }
    },
    updateCardLayout(state, { payload }) {
      // payload: [{ id, col, row, sizeX, sizeY }]
      payload.forEach(({ id, col, row, sizeX, sizeY }) => {
        const card = state.config.cards.find(c => c.id === id);
        if (card) { card.col = col; card.row = row; card.sizeX = sizeX; card.sizeY = sizeY; }
      });
    },
    removeCard(state, { payload }) {
      state.config.cards = state.config.cards.filter(c => c.id !== payload);
    },
    addFilter(state, { payload }) {
      state.config.filters.push({
        id: uuidv4().slice(0, 8),
        name: payload.name || 'New Filter',
        slug: (payload.name || 'new_filter').toLowerCase().replace(/\s+/g, '_'),
        type: payload.type || 'string/=',
        sectionId: payload.sectionId || 'string',
        values_source_type: payload.values_source_type || 'static-list',
        values_source_config: payload.values_source_config || {},
      });
    },
    updateFilter(state, { payload }) {
      const idx = state.config.filters.findIndex(f => f.id === payload.id);
      if (idx !== -1) state.config.filters[idx] = { ...state.config.filters[idx], ...payload };
    },
    removeFilter(state, { payload }) {
      state.config.filters = state.config.filters.filter(f => f.id !== payload);
    },
    addGroup(state, { payload }) {
      state.config.groups.push({ name: payload });
    },
    removeGroup(state, { payload }) {
      state.config.groups.splice(payload, 1);
    },
    setSaving(state, { payload }) { state.saving = payload; },
    setPublishing(state, { payload }) { state.publishing = payload; },
    setError(state, { payload }) { state.error = payload; },
    setSuccess(state, { payload }) { state.successMessage = payload; },
    setStatus(state, { payload }) { state.status = payload; },
  },
});

export const actions = builderSlice.actions;

export const store = configureStore({ reducer: { builder: builderSlice.reducer } });
