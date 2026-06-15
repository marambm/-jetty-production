# Monorepo

A full-stack Jetty with three independent services:

| Folder | Stack | Default Port |
|---|---|---|
| `frontend/` | React (JSX) + Tailwind CSS + Vite | 5000 |
| `backend/` | Node.js + Express + Mongoose (MongoDB) | 4000 |
| `ai-service/` | Python FastAPI + pandas + scikit-learn + xgboost | 8000 |

---

## Prerequisites

- **Node.js** v18+
- **Python** 3.10+
- **MongoDB** running locally or a remote connection string

---

## 1. Frontend

```bash
cd frontend
npm install
npm run dev
```

Runs on **http://localhost:5000**. API calls to `/api/*` are proxied to the backend on port 4000.

## 2. Backend

```bash
cd backend
cp .env.example .env   # then edit MONGODB_URI if needed
npm install
npm run dev            # uses nodemon for auto-reload
# or: npm start       # plain node, no auto-reload
```

**File structure:**
```
backend/
  src/
    app.js                  # Express app (middleware, routes, error handler)
    server.js               # Entry point (dotenv, DB connect, listen)
    config/db.js            # Mongoose connection
    middlewares/errorHandler.js  # 404 + centralized error handler
    models/Item.js          # Example Mongoose model
    routes/health.js        # GET /api/health
    routes/items.js         # CRUD /api/items
    routes/ai.js            # Proxy to AI service
  .env.example              # Environment variable template
  package.json
```

Runs on **http://localhost:4000**. Endpoints:

| Method | Path | Description |
|---|---|---|
| GET | `/api/health` | Backend health check |
| GET | `/api/items` | List all items |
| POST | `/api/items` | Create an item |
| GET | `/api/items/:id` | Get one item |
| PUT | `/api/items/:id` | Update an item |
| DELETE | `/api/items/:id` | Delete an item |
| GET | `/api/ai/health` | AI service health (proxied) |
| POST | `/api/ai/predict` | Send features to AI model (proxied) |

## 3. AI Service

```bash
cd ai-service
pip install -r requirements.txt
python main.py
```

Runs on **http://localhost:8000**. Endpoints:

| Method | Path | Description |
|---|---|---|
| GET | `/health` | AI service health check |
| POST | `/predict` | Predict using the demo XGBoost/Iris classifier |

Example predict request:

```json
{
  "features": [5.1, 3.5, 1.4, 0.2]
}
```

---

## Architecture

```
frontend (React) ---> backend (Express) ---> ai-service (FastAPI)
       :5000              :4000                    :8000
```

The frontend proxies `/api/*` requests to the backend. The backend proxies `/api/ai/*` requests to the AI service.
