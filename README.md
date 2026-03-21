# Faculty Feedback Dashboard

Full-stack application: **FastAPI + PostgreSQL backend** · **Vanilla JS + Chart.js frontend**

---

## Project Structure

```
faculty_dashboard/
├── backend/
│   ├── main.py          ← FastAPI app, all REST endpoints
│   ├── database.py      ← PostgreSQL queries (psycopg2)
│   ├── csv_loader.py    ← CSV parser + bulk insert
│   ├── requirements.txt
│   └── .env.example     ← Copy to .env and update
├── frontend/
│   └── index.html       ← Single-file dashboard (open in browser)
└── scripts/
    └── setup_db.sql     ← DB + table creation SQL
```

---

## Prerequisites

- **Python 3.10+**
- **PostgreSQL 13+**  (running locally or remote)

---

## Step 1 — Create the Database

```bash
# Option A: via psql
psql -U postgres -f scripts/setup_db.sql

# Option B: via pgAdmin
# Create a database named: faculty_feedback
# Then run scripts/setup_db.sql in the query tool
```

---

## Step 2 — Backend Setup

```bash
cd backend

# Copy and configure environment
cp .env.example .env
# Edit .env: set your DATABASE_URL if different from default

# Install dependencies
pip install -r requirements.txt

# Run the server
uvicorn main:app --reload --port 8000
```

The API will be available at: **http://localhost:8000**  
Interactive docs: **http://localhost:8000/docs**

---

## Step 3 — Open the Frontend

Simply open `frontend/index.html` in your browser.  
No build step required.

> **Note:** The frontend calls `http://localhost:8000/api` by default.  
> If your backend runs on a different host/port, edit the `const API = '...'` line at the top of the script section in `frontend/index.html`.

---

## Step 4 — Load Your Data

1. Open the dashboard in your browser
2. Sign in as **admin** (user: `admin`, pass: `admin123`)
3. Click **📂 Upload CSV** in the top bar
4. Select your feedback CSV file

Expected CSV columns:
```
Student Batch Name, Student Class Name, Question,
Faculty Name, Faculty Department, Faculty School,
Slot Subject Name, Selected Option, Answer Text, Faculty Email Id
```

The upload will:
- Parse all rows
- Map questions to short labels
- Compute score (Very Good=4, Good=3, Satisfactory=2, Unsatisfactory=1)
- Filter out generic suggestions automatically
- **Replace** existing data on each upload (full refresh)

---

## Credentials

| Role | Username | Passcode | Access |
|------|----------|----------|--------|
| Super Admin | `admin` | `admin123` | All data |
| HOD – Mgmt | `hod_mgmt` | `hod123` | Dept. of Professional Mgmt Studies only |

To add more HOD accounts, edit the `ROLES` dict in `backend/main.py`:
```python
ROLES = {
    "hod_science": {
        "pass": "science456",
        "role": "hod",
        "dept": "DEPARTMENT OF SCIENCE",
        "label": "HOD"
    },
    ...
}
```

---

## Dashboard Features

| Section | What it shows |
|---------|--------------|
| **Filters** | School → Dept → Faculty (cascade) · Year · Programme · Batch (searchable dropdown) · Rating |
| **KPIs** | Total responses, Avg score, % Good+VG, % Unsatisfactory, Suggestion count |
| **Rating Donut** | Overall split with counts and % |
| **Ratings by Batch** | Stacked bar per batch |
| **Score Trend** | Horizontal bar — top 15 batches by volume, colour-coded by score |
| **Subject Performance** | Horizontal bar — avg score per subject, colour-coded |
| **Question Breakdown** | Segmented bars for 10 criteria · hover for exact counts |
| **Radar** | Faculty competency web |
| **Suggestions** | Filtered feed · per-batch dropdown · load more pagination |

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/login` | Authenticate |
| GET | `/api/filters` | Get available filter options |
| GET | `/api/summary` | KPI numbers |
| GET | `/api/rating-distribution` | Donut data |
| GET | `/api/batch-ratings` | Stacked bar data |
| GET | `/api/score-trend` | Trend bar data |
| GET | `/api/subject-performance` | Subject bar data |
| GET | `/api/question-breakdown` | Question bars + radar data |
| GET | `/api/suggestions` | Paginated suggestions |
| GET | `/api/faculty-info` | Faculty card data |
| POST | `/api/upload-csv` | Upload + reload CSV |

All GET endpoints accept: `role`, `dept`, `school`, `faculty`, `year`, `programme`, `batch`, `rating`

---

## Production Notes

- For production, set `allow_origins` in `main.py` to your specific frontend domain
- Use environment variables (not `.env` file) for secrets in production
- Consider adding pgBouncer for connection pooling with 900k+ rows
- Add a `CREATE INDEX ON feedback(faculty_dept, batch_year)` composite index if query time degrades
