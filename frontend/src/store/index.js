import { configureStore, createSlice } from '@reduxjs/toolkit';
import { v4 as uuidv4 } from 'uuid';

const defaultConfig = {
  collection: { name: '', description: '', parentId: null },
  dashboard: { name: '', description: '', pin: false, tabs: [{ name: 'Tab 1' }] },
  cards: [],
  filters: [],
  groups: [],
  whereConditions: [],
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
    selectedFilterId: null,
    saving: false,
    publishing: false,
    error: null,
    successMessage: null,
    metadata: null,
    previewMode: false,
    previewFilterValues: {},
  },
  reducers: {
    loadDashboard(state, { payload }) {
      const config = payload.config || defaultConfig;
      const dashboard = config.dashboard || {};
      const tabs = (dashboard.tabs && dashboard.tabs.length > 0) ? dashboard.tabs : [{ name: 'Tab 1' }];
      return {
        ...state,
        ...payload,
        selectedFilterId: null,
        previewMode: false,
        previewFilterValues: {},
        config: {
          ...defaultConfig,
          ...config,
          dashboard: {
            ...defaultConfig.dashboard,
            ...dashboard,
            tabs,
          },
          whereConditions: config.whereConditions || [],
        },
        metabase_dashboard_id: payload.metabase_dashboard_id || null,
        metabase_collection_id: payload.metabase_collection_id || null,
        metabase_card_ids: payload.metabase_card_ids || {},
      };
    },
    setMeta(state, { payload }) {
      if (payload.name !== undefined) {
        state.name = payload.name;
        state.config.dashboard.name = payload.name;
      }
      if (payload.description !== undefined) {
        state.description = payload.description;
        state.config.dashboard.description = payload.description;
      }
    },
    setCollection(state, { payload }) {
      state.config.collection = { ...state.config.collection, ...payload };
    },
    setDashboardMeta(state, { payload }) {
      state.config.dashboard = { ...state.config.dashboard, ...payload };
      if (payload.name !== undefined) {
        state.name = payload.name;
      }
      if (payload.description !== undefined) {
        state.description = payload.description;
      }
    },
    addTab(state, { payload }) {
      state.config.dashboard.tabs.push({ name: payload });
    },
    updateTab(state, { payload }) {
      const { index, name } = payload;
      if (state.config.dashboard.tabs && state.config.dashboard.tabs[index]) {
        state.config.dashboard.tabs[index].name = name;
      }
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
          ...localCard
        } = original;
        state.config.cards.push({
          ...localCard,
          id: uuidv4(),
          title: `${original.title} (Duplicate)`,
          col: original.col + 1,
          row: original.row + 1,
          parameterMappings: original.parameterMappings || [],
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
      const filterId = payload.id || uuidv4().slice(0, 8);
      state.config.filters.push({
        id: filterId,
        name: payload.name || 'New Filter',
        slug: payload.slug || (payload.name || 'new_filter').toLowerCase().replace(/\s+/g, '_'),
        type: payload.type || 'string/=',
        sectionId: payload.sectionId || (payload.type || 'string/=').split('/')[0],
        values_source_type: payload.values_source_type || null,
        values_source_config: payload.values_source_config || null,
        values_query_type: payload.values_query_type || null,
        temporal_units: payload.temporal_units || null,
        target: payload.target || null,
        isMultiSelect: payload.isMultiSelect,
        filteringParameters: payload.filteringParameters || payload.filtering_parameters || [],
        databaseId: payload.databaseId || null,
        tableName: payload.tableName || null,
        fieldName: payload.fieldName || null,
        fieldId: payload.fieldId || null,
      });
      state.selectedFilterId = filterId;
    },
    updateFilter(state, { payload }) {
      const idx = state.config.filters.findIndex(f => f.id === payload.id);
      if (idx !== -1) state.config.filters[idx] = { ...state.config.filters[idx], ...payload };
    },
    updateFilters(state, { payload }) {
      state.config.filters = payload;
    },
    setSelectedFilterId(state, { payload }) {
      state.selectedFilterId = payload;
    },
    removeFilter(state, { payload }) {
      const filter = state.config.filters.find(f => f.id === payload);
      if (filter) {
        const slug = filter.slug;
        state.config.filters = state.config.filters.filter(f => f.id !== payload);
        if (state.config.whereConditions) {
          const condText = `{{${slug}}}`;
          state.config.whereConditions = state.config.whereConditions.filter(
            c => c.trim() !== condText
          );
        }
        // Clean up mappings and inline settings in all cards
        (state.config.cards || []).forEach(card => {
          if (card.parameterMappings) {
            card.parameterMappings = card.parameterMappings.filter(m => m.parameter_id !== payload);
          }
          if (card.inlineParameters) {
            card.inlineParameters = card.inlineParameters.filter(id => id !== payload);
          }
        });
      }
      if (state.selectedFilterId === payload) {
        state.selectedFilterId = null;
      }
    },
    addGroup(state, { payload }) {
      state.config.groups.push({ name: payload });
    },
    removeGroup(state, { payload }) {
      state.config.groups.splice(payload, 1);
    },
    setMetadata(state, { payload }) {
      state.metadata = payload;
    },
    addWhereCondition(state, { payload }) {
      if (!state.config.whereConditions) state.config.whereConditions = [];
      state.config.whereConditions.push(payload || '');
    },
    updateWhereCondition(state, { payload }) {
      const { index, value } = payload;
      if (state.config.whereConditions && state.config.whereConditions[index] !== undefined) {
        state.config.whereConditions[index] = value;
      }
    },
    removeWhereCondition(state, { payload }) {
      if (state.config.whereConditions) {
        state.config.whereConditions.splice(payload, 1);
      }
    },
    setSaving(state, { payload }) { state.saving = payload; },
    setPublishing(state, { payload }) { state.publishing = payload; },
    setError(state, { payload }) { state.error = payload; },
    setSuccess(state, { payload }) { state.successMessage = payload; },
    setStatus(state, { payload }) { state.status = payload; },
    setPreviewMode(state, { payload }) {
      state.previewMode = payload;
      if (payload) {
        state.previewFilterValues = {};
        (state.config.filters || []).forEach(f => {
          if (f.default !== undefined && f.default !== null && f.default !== '') {
            state.previewFilterValues[f.id] = f.default;
          }
        });
      } else {
        state.previewFilterValues = {};
      }
    },
    setPreviewFilterValue(state, { payload }) {
      state.previewFilterValues[payload.filterId] = payload.value;
    },
    clearPreviewFilterValue(state, { payload }) {
      delete state.previewFilterValues[payload];
    },
  },
});

export const actions = builderSlice.actions;

export const store = configureStore({ reducer: { builder: builderSlice.reducer } });
