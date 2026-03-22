"""
Faculty Feedback Dashboard — FastAPI Backend
Run: uvicorn main:app --reload --port 8000
"""
from fastapi import FastAPI, Query, UploadFile, File, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from typing import Optional
import database as db
import csv_loader
import os

app = FastAPI(title="Faculty Feedback API", version="1.0.0")

# ── CORS ──────────────────────────────────────────────────────
# FIX: Replace wildcard "*" with explicit origins so credentials work correctly.
# Add your Vercel frontend URL here once deployed.
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "http://localhost:5500").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── on startup ────────────────────────────────────────────────
@app.on_event("startup")
async def startup():
    db.init_db()


# ── auth ──────────────────────────────────────────────────────
ROLES = {
    # DEANS
    "GOPAKUMAR.AV@KRISTUJAYANTI.COM": { "pass": "GOPAKUMAR.AV@KRISTUJAYANTI.COM", "role": "dean", "school": "SCHOOL OF HUMANITIES AND SOCIAL SCIENCES", "upload": False, "label": "Dean" },
    "VIJAYAKUMAR@KRISTUJAYANTI.COM": { "pass": "VIJAYAKUMAR@KRISTUJAYANTI.COM", "role": "dean", "school": "SCHOOL OF COMMERCE, ACCOUNTING AND FINANCE", "upload": False, "label": "Dean" },
    "SURENDRANATH@KRISTUJAYANTI.COM": { "pass": "SURENDRANATH@KRISTUJAYANTI.COM", "role": "dean", "school": "SCHOOL OF BUSINESS AND MANAGEMENT", "upload": False, "label": "Dean" },
    "VIJAYANAND@KRISTUJAYANTI.COM": { "pass": "VIJAYANAND@KRISTUJAYANTI.COM", "role": "dean", "school": "SCHOOL OF BIOLOGICAL AND FORENSIC SCIENCES", "upload": False, "label": "Dean" },
    "RKUMAR@KRISTUJAYANTI.COM": { "pass": "RKUMAR@KRISTUJAYANTI.COM", "role": "dean", "school": "SCHOOL OF COMPUTATIONAL AND PHYSICAL SCIENCES", "upload": False, "label": "Dean" },
    "MANJUNATH.MS@KRISTUJAYANTI.COM": { "pass": "MANJUNATH.MS@KRISTUJAYANTI.COM", "role": "dean", "school": "SCHOOL OF LAW", "upload": False, "label": "Dean" },
    "DEVIKA.R@KRISTUJAYANTI.COM": { "pass": "DEVIKA.R@KRISTUJAYANTI.COM", "role": "dean", "school": "INSTITUTE OF MANAGEMENT", "upload": False, "label": "Dean" },

    # SUPER ADMINS
    "MARIYAN@KRISTUJAYANTI.COM": { "pass": "MARIYAN@KRISTUJAYANTI.COM", "role": "admin", "school": None, "upload": True, "label": "Super Admin" },
    "BINOJOSEPH@KRISTUJAYANTI.COM": { "pass": "BINOJOSEPH@KRISTUJAYANTI.COM", "role": "admin", "school": None, "upload": False, "label": "Super Admin" },
    "AUGUSTINE@KRISTUJAYANTI.COM": { "pass": "AUGUSTINE@KRISTUJAYANTI.COM", "role": "admin", "school": None, "upload": False, "label": "Super Admin" },
    "FR.LIJO@KRISTUJAYANTI.COM": { "pass": "FR.LIJO@KRISTUJAYANTI.COM", "role": "admin", "school": None, "upload": False, "label": "Super Admin" },
    "FR.JOSHY@KRISTUJAYANTI.COM": { "pass": "FR.JOSHY@KRISTUJAYANTI.COM", "role": "admin", "school": None, "upload": False, "label": "Super Admin" },
    "FR.JAIS@KRISTUJAYANTI.COM": { "pass": "FR.JAIS@KRISTUJAYANTI.COM", "role": "admin", "school": None, "upload": False, "label": "Super Admin" },
    "EDWARD@KRISTUJAYANTI.COM": { "pass": "EDWARD@KRISTUJAYANTI.COM", "role": "admin", "school": None, "upload": False, "label": "Super Admin" },
    "CJUDE@KRISTUJAYANTI.COM": { "pass": "CJUDE@KRISTUJAYANTI.COM", "role": "admin", "school": None, "upload": False, "label": "Super Admin" },
    "AS@KRISTUJAYANTI.COM": { "pass": "AS@KRISTUJAYANTI.COM", "role": "admin", "school": None, "upload": False, "label": "Super Admin" },
}


@app.post("/api/login")
async def login(body: dict):
    username = body.get("username", "")
    passcode  = body.get("passcode", "")
    cred = ROLES.get(username)
    if not cred or cred["pass"] != passcode:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return {
        "username": username,
        "role":  cred["role"],
        "dept":  cred.get("dept"),
        "school": cred.get("school"),
        "upload": cred.get("upload", False),
        "label": cred["label"],
    }


# ── filter helpers ────────────────────────────────────────────
@app.get("/api/filters")
async def get_filters(
    role: str = Query("admin"),
    dept: Optional[str] = Query(None),
    school: Optional[str] = Query(None),
    faculty: Optional[str] = Query(None),
    year: Optional[str] = Query(None),
    programme: Optional[str] = Query(None),
    batch: Optional[str] = Query(None),
    rating: Optional[str] = Query(None),
):
    return db.get_filter_options(role=role, dept=dept, school=school, faculty=faculty, year=year, programme=programme, batch=batch, rating=rating)


# ── KPI summary ───────────────────────────────────────────────
@app.get("/api/summary")
async def get_summary(
    role: str = Query("admin"),
    dept: Optional[str] = Query(None),
    school: Optional[str] = Query(None),
    faculty: Optional[str] = Query(None),
    year: Optional[str] = Query(None),
    programme: Optional[str] = Query(None),
    batch: Optional[str] = Query(None),
    rating: Optional[str] = Query(None),
):
    return db.get_summary(role=role, dept=dept, school=school,
                          faculty=faculty, year=year, programme=programme,
                          batch=batch, rating=rating)


# ── overall rating distribution ───────────────────────────────
@app.get("/api/rating-distribution")
async def rating_distribution(
    role: str = Query("admin"),
    dept: Optional[str] = Query(None),
    school: Optional[str] = Query(None),
    faculty: Optional[str] = Query(None),
    year: Optional[str] = Query(None),
    programme: Optional[str] = Query(None),
    batch: Optional[str] = Query(None),
):
    return db.get_rating_distribution(role=role, dept=dept, school=school,
                                      faculty=faculty, year=year,
                                      programme=programme, batch=batch)


# ── batch ratings (stacked bar) ───────────────────────────────
@app.get("/api/batch-ratings")
async def batch_ratings(
    role: str = Query("admin"),
    dept: Optional[str] = Query(None),
    school: Optional[str] = Query(None),
    faculty: Optional[str] = Query(None),
    year: Optional[str] = Query(None),
    programme: Optional[str] = Query(None),
    batch: Optional[str] = Query(None),
):
    return db.get_batch_ratings(role=role, dept=dept, school=school,
                                faculty=faculty, year=year,
                                programme=programme, batch=batch)


# ── score trend ───────────────────────────────────────────────
@app.get("/api/score-trend")
async def score_trend(
    role: str = Query("admin"),
    dept: Optional[str] = Query(None),
    school: Optional[str] = Query(None),
    faculty: Optional[str] = Query(None),
    year: Optional[str] = Query(None),
    programme: Optional[str] = Query(None),
    batch: Optional[str] = Query(None),
    top: int = Query(15),
):
    return db.get_score_trend(role=role, dept=dept, school=school,
                              faculty=faculty, year=year,
                              programme=programme, batch=batch, top=top)


# ── subject performance ───────────────────────────────────────
@app.get("/api/subject-performance")
async def subject_performance(
    role: str = Query("admin"),
    dept: Optional[str] = Query(None),
    school: Optional[str] = Query(None),
    faculty: Optional[str] = Query(None),
    year: Optional[str] = Query(None),
    programme: Optional[str] = Query(None),
    batch: Optional[str] = Query(None),
    top: int = Query(20),
):
    return db.get_subject_performance(role=role, dept=dept, school=school,
                                      faculty=faculty, year=year,
                                      programme=programme, batch=batch, top=top)


# ── question breakdown ────────────────────────────────────────
@app.get("/api/question-breakdown")
async def question_breakdown(
    role: str = Query("admin"),
    dept: Optional[str] = Query(None),
    school: Optional[str] = Query(None),
    faculty: Optional[str] = Query(None),
    year: Optional[str] = Query(None),
    programme: Optional[str] = Query(None),
    batch: Optional[str] = Query(None),
):
    return db.get_question_breakdown(role=role, dept=dept, school=school,
                                     faculty=faculty, year=year,
                                     programme=programme, batch=batch)


# ── student suggestions ───────────────────────────────────────
@app.get("/api/suggestions")
async def suggestions(
    role: str = Query("admin"),
    dept: Optional[str] = Query(None),
    school: Optional[str] = Query(None),
    faculty: Optional[str] = Query(None),
    year: Optional[str] = Query(None),
    programme: Optional[str] = Query(None),
    batch: Optional[str] = Query(None),
    limit: int = Query(50),
    offset: int = Query(0),
):
    return db.get_suggestions(role=role, dept=dept, school=school,
                              faculty=faculty, year=year,
                              programme=programme, batch=batch,
                              limit=limit, offset=offset)


# ── faculty info ──────────────────────────────────────────────
@app.get("/api/faculty-info")
async def faculty_info(
    faculty: Optional[str] = Query(None),
    dept: Optional[str] = Query(None),
):
    return db.get_faculty_info(faculty=faculty, dept=dept)


# ── CSV upload ────────────────────────────────────────────────
@app.post("/api/upload-csv")
async def upload_csv(file: UploadFile = File(...)):
    if not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files accepted")
    content = await file.read()
    text = content.decode("utf-8-sig", errors="replace")
    result = csv_loader.load_csv(text)
    return result


# ── Institutional endpoints ───────────────────────────────────
@app.get("/api/institutional-stats")
async def get_inst_stats(
    role: str = Query("admin"),
    school: Optional[str] = Query(None),
    dept: Optional[str] = Query(None),
    batch: Optional[str] = Query(None)   # ← ADDED
):
    where_clause = "WHERE is_suggestion = FALSE"
    params = []
    if role == "dean" and school:
        where_clause += " AND faculty_school = %s"
        params.append(school)
    if dept:
        where_clause += " AND faculty_dept = %s"
        params.append(dept)
    if batch:                             # ← ADDED
        where_clause += " AND student_batch = %s"
        params.append(batch)
    query = f"""
        SELECT question_short as label, ROUND(AVG(score)::numeric, 2) as value
        FROM institutional_feedback
        {where_clause}
        GROUP BY question_short
    """
    with db.cursor() as cur:
        cur.execute(query, params)
        return cur.fetchall()

# ← ADD THIS NEW ENDPOINT directly below
@app.get("/api/institutional-avg")
async def get_inst_avg(
    role: str = Query("admin"),
    school: Optional[str] = Query(None),
    dept: Optional[str] = Query(None),
    batch: Optional[str] = Query(None)
):
    where_clause = "WHERE is_suggestion = FALSE"
    params = []
    if role == "dean" and school:
        where_clause += " AND faculty_school = %s"
        params.append(school)
    if dept:
        where_clause += " AND faculty_dept = %s"
        params.append(dept)
    if batch:
        where_clause += " AND student_batch = %s"
        params.append(batch)
    with db.cursor() as cur:
        cur.execute(f"""
            SELECT ROUND(AVG(score)::numeric, 2) AS avg
            FROM institutional_feedback
            {where_clause}
        """, params)
        row = cur.fetchone()
        return {"avg": float(row["avg"]) if row["avg"] else None}


@app.get("/api/institutional-filters")
async def inst_filters(
    role: str = Query("admin"),
    school: Optional[str] = Query(None),
    dept: Optional[str] = Query(None)
):
    return db.get_inst_filter_options(role=role, school=school, dept=dept)


@app.get("/api/institutional-suggestions")
async def inst_suggestions(
    role: str = Query("admin"),
    dept: Optional[str] = Query(None),
    school: Optional[str] = Query(None),
    batch: Optional[str] = Query(None),
    limit: int = Query(50),
    offset: int = Query(0),
):
    return db.get_institutional_suggestions(
        role=role, dept=dept, school=school,
        batch=batch, limit=limit, offset=offset
    )


@app.get("/api/institutional-distribution")
async def inst_distribution(
    role: str = Query("admin"),
    dept: Optional[str] = Query(None),
    school: Optional[str] = Query(None),
    batch: Optional[str] = Query(None)
):
    return db.get_institutional_distribution(
        role=role, dept=dept, school=school, batch=batch
    )


# ── Frontend Static Files ─────────────────────────────────────
# FIX: Use env var so path works both locally and on Render
frontend_dir = os.getenv("FRONTEND_DIR", os.path.join(os.path.dirname(__file__), "..", "frontend"))
if os.path.exists(frontend_dir):
    app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")