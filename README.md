# Metabase Dashboard Builder

A visual drag-and-drop dashboard orchestrator that publishes directly to Metabase via API. This tool is config-driven; every dashboard is designed locally and persisted as a unified JSON config in PostgreSQL before being compiled and published to Metabase.

---

## Architecture

```
                                  +---------------------------------------+
                                  |         Browser client (React)        |
                                  |    (Visual Canvas, Card Editor, etc.) |
                                  +-------------------+-------------------+
                                                      |
                                                      | HTTP JSON REST API
                                                      v
                                  +-------------------+-------------------+
                                  |         Backend Node / Express        |
                                  |       (REST routes, normalizer)       |
                                  +--------+---------------------+--------+
                                           |                     |
                                           | DB Queries          | REST Metabase API
                                           v                     v
                         +-----------------+-----------+   +-----+----------------+
                         |     PostgreSQL DB (mitra5)  |   |     Metabase Server  |
                         | (dashboard_configs table)   |   |  (Dashboards, Cards) |
                         +-----------------------------+   +----------------------+
```

---

## Key Features

*   **Visual Drag-and-Drop Canvas:** Arrange, resize, and position cards dynamically across multiple tabs on the dashboard layout utilizing `react-grid-layout`.
*   **Easy Dashboard Duplication:** Duplicate any dashboard configuration draft with a single click. This creates an independent copy in the PostgreSQL database, enabling quick dashboard cloning and templating.
*   **Inline Card Queries:** Write SQL queries directly inside each card within the Card Editor modal. You do not need to create individual Saved Questions in Metabase first—the builder automatically normalizes, compiles, and registers them.
*   **On-the-Fly Filter Mapping & Creation:** When you define a new SQL variable or template tag inside a question's query, you can map it directly to a dashboard-level filter. If the filter does not exist yet, you can create and register it (both predefined filters like State, District, Date, Leader Category, Program, or custom filters) directly from the Card Editor mapping dropdown.
*   **Synchronized Global WHERE Conditions:** View and manage all active global WHERE conditions from a unified UI. Updating a global condition automatically synchronizes and updates the query parameters for all cards across the entire dashboard.
*   **Individual Active WHERE Conditions:** Configure local card-level WHERE conditions (e.g., `submissions.submission_type = 'story'`) independently within each Card Editor to refine the local query logic on a single card without affecting others.
*   **Staging Preview Sandbox:** Toggle into "Preview Mode" to test cascading / linked filters (e.g., selecting a State narrows down the District list to only show districts belonging to that State) and query database metadata in real-time.


---

## Configuration Schema (PostgreSQL)

Dashboards are stored in the PostgreSQL database under the `dashboard_configs` table using the following JSONB schema format:

```json
{
  "collection": { "name": "State Performance", "description": "Submissions overview", "parentId": null },
  "dashboard": { "name": "Women Leader Dashboard", "description": "", "pin": false, "tabs": [{ "name": "Tab 1" }] },
  "cards": [
    {
      "id": "1a2b3c4d",
      "title": "Projects by State",
      "type": "bar",
      "query": "SELECT state_name, COUNT(*) FROM projects GROUP BY 1",
      "col": 0, "row": 0, "sizeX": 6, "sizeY": 4,
      "tabIndex": 0,
      "parameterMappings": [
        {
          "parameter_id": "state_filter_id",
          "target": ["dimension", ["template-tag", "state"]]
        }
      ],
      "templateTags": {
        "state": {
          "id": "state",
          "name": "state",
          "display-name": "State",
          "type": "dimension",
          "dimension": ["field", 45, null],
          "widget-type": "category"
        }
      }
    }
  ],
  "filters": [
    {
      "id": "state_filter_id",
      "name": "State",
      "slug": "state",
      "type": "string/=",
      "databaseId": 3,
      "tableName": "submissions",
      "fieldName": "state",
      "fieldId": 45
    }
  ],
  "groups": [{ "name": "State Admins" }]
}
```

---

## Setup & Installation

### Prerequisites
- **Node.js** 20+
- **PostgreSQL** database (table `dashboard_configs` must be configured)
- **Metabase** instance running and accessible via API

### Environment Configuration

Create a `.env` file inside the `backend` folder with the following variables:

```ini
# Server configuration
PORT=8081
API_TOKEN=your-secret-token-here

# Metabase credentials & details
METABASE_URL=http://your-metabase-url:3000/api
METABASE_USERNAME=admin@domain.com
METABASE_PASSWORD=your-metabase-password
METABASE_DATABASE=test
METABASE_API_KEY=your-api-key-here

# PostgreSQL connection details
PG_HOST=localhost
PG_PORT=5432
PG_USER=postgres
PG_PASSWORD=postgres
PG_DATABASE=mitra5
```

### Installation Steps

1.  **Clone the Repository**
2.  **Start the Backend Service**
    ```bash
    cd backend
    npm install
    npm run dev
    ```
    The server will start listening on port `8081`.
3.  **Start the Frontend Service**
    ```bash
    cd ../frontend
    npm install
    npm start
    ```
    The React application will launch at `http://localhost:3000` (which is configured to proxy `/api/*` requests to the backend server).

### Run with Docker Compose

To start both services together with Docker compose, run:

```bash
docker compose up --build
```
- **Frontend Dashboard:** Access at `http://localhost:3001`
- **Backend API Server:** Access at `http://localhost:8081`

---

## API References

All endpoints require an `Authorization: <API_TOKEN>` header matching your configured backend server secret token.

| Method | Path | Description |
| :--- | :--- | :--- |
| **GET** | `/api/dashboards` | Retrieve list of all dashboard configurations. |
| **GET** | `/api/dashboards/:id` | Get configuration details for a specific dashboard. |
| **POST** | `/api/dashboards` | Create or update a dashboard configuration draft in the database. |
| **DELETE** | `/api/dashboards/:id` | Delete a dashboard configuration draft. |
| **POST** | `/api/dashboards/:id/publish` | Compile and publish the dashboard config to Metabase via API. |
| **GET** | `/api/dashboards/metabase/databases` | Fetch list of databases configured on the Metabase instance. |
| **GET** | `/api/dashboards/metabase/databases/:id/metadata` | Retrieve schema metadata (tables/columns) for a specific database. |
| **GET** | `/api/dashboards/metabase/collections` | Fetch list of collections present on Metabase. |
