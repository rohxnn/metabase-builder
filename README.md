# Dashboard Builder

A visual drag-and-drop dashboard builder that publishes directly to Metabase via API. Config-driven — every dashboard is stored as a JSON config in PostgreSQL.

## Architecture

```
frontend (React + react-grid-layout)  →  backend (Node/Express)  →  Metabase API
                                               ↕
                                         PostgreSQL (dashboard_configs table)
```

## How it works

1. Support team opens the UI, drags card types onto the canvas
2. Each card gets a SQL query, display type, and layout position
3. Filters, groups, tabs, and collection settings are configured in the right panel
4. **Save Draft** persists the config JSON to PostgreSQL
5. **Publish to Metabase** calls the backend which:
   - Creates the Collection
   - Creates the Dashboard (with tabs if configured)
   - Creates each Question/Card
   - Adds cards + filters to the dashboard
   - Creates Groups and grants collection access

## Config Schema

```json
{
  "collection": { "name": "My Collection", "description": "", "parentId": null },
  "dashboard": { "name": "My Dashboard", "description": "", "pin": false, "tabs": [{ "name": "Tab 1" }] },
  "cards": [
    {
      "title": "Projects by State",
      "type": "bar",
      "query": "SELECT state_name, COUNT(*) FROM projects GROUP BY 1",
      "col": 0, "row": 0, "sizeX": 6, "sizeY": 4,
      "tabIndex": 0,
      "parameterMappings": [],
      "templateTags": {}
    }
  ],
  "filters": [
    {
      "name": "Select State", "slug": "select_state", "id": "abc12345",
      "type": "string/=", "sectionId": "location",
      "values_source_type": "card",
      "values_source_config": { "card_id": 123, "value_field": ["field", "state_name", { "base-type": "type/Text" }] }
    }
  ],
  "groups": [{ "name": "State Admins" }]
}
```

## Setup

### Prerequisites
- Node.js 20+
- PostgreSQL (the existing one from the data-pipeline stack)
- Metabase running at `http://localhost:3000`

### Backend

```bash
cd dashboard-builder/backend
npm install
# Edit .env with your credentials
npm run dev
```

### Frontend

```bash
cd dashboard-builder/frontend
npm install
npm start
# Opens at http://localhost:3000 (React dev server proxies /api to :8081)
```

### Docker (both together)

```bash
cd dashboard-builder
docker compose up --build
# Frontend: http://localhost:3001
# Backend:  http://localhost:8081
```

## API Endpoints

All endpoints require `Authorization: <API_TOKEN>` header.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/dashboards` | List all configs |
| GET | `/api/dashboards/:id` | Get a config |
| POST | `/api/dashboards` | Save/update a config |
| DELETE | `/api/dashboards/:id` | Delete a config |
| POST | `/api/dashboards/:id/publish` | Publish to Metabase |
| GET | `/api/dashboards/metabase/databases` | List Metabase databases |
| GET | `/api/dashboards/metabase/databases/:id/metadata` | DB metadata (tables/fields) |
| GET | `/api/dashboards/metabase/collections` | List collections |
