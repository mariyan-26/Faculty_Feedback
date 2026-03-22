"""
database.py — PostgreSQL data layer using psycopg2
All filter parameters flow through a single build_where() helper.
"""

import os
import psycopg2
from psycopg2.extras import RealDictCursor
from contextlib import contextmanager
from typing import Optional

from dotenv import load_dotenv
load_dotenv()

# ── connection ─────────────────────────────────────────────────
DB_URL = os.getenv("DATABASE_URL")

if not DB_URL:
    raise ValueError("DATABASE_URL is not set. Check your .env file.")

def get_conn():
    return psycopg2.connect(DB_URL)

@contextmanager
def cursor():
    conn = get_conn()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            yield cur
        conn.commit()
    finally:
        conn.close()


# ── schema ─────────────────────────────────────────────────────
SCHEMA = """
CREATE TABLE IF NOT EXISTS feedback (
    id                  SERIAL PRIMARY KEY,
    student_batch       TEXT,
    student_class       TEXT,
    question            TEXT,
    question_short      TEXT,
    faculty_name        TEXT,
    faculty_dept        TEXT,
    faculty_school      TEXT,
    subject             TEXT,
    selected_option     TEXT,
    score               NUMERIC(3,1),
    answer_text         TEXT,
    faculty_email       TEXT,
    batch_year          TEXT,
    batch_programme     TEXT,
    is_suggestion       BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_faculty   ON feedback(faculty_name);
CREATE INDEX IF NOT EXISTS idx_dept      ON feedback(faculty_dept);
CREATE INDEX IF NOT EXISTS idx_school    ON feedback(faculty_school);
CREATE INDEX IF NOT EXISTS idx_batch     ON feedback(student_batch);
CREATE INDEX IF NOT EXISTS idx_year      ON feedback(batch_year);
CREATE INDEX IF NOT EXISTS idx_programme ON feedback(batch_programme);
CREATE INDEX IF NOT EXISTS idx_option    ON feedback(selected_option);
CREATE INDEX IF NOT EXISTS idx_suggestion ON feedback(is_suggestion);
"""

# --- INSTITUTION OR DEPARTMENT SCHEMA ---
INSTITUTION_SCHEMA = """
CREATE TABLE IF NOT EXISTS institutional_feedback (
    id                  SERIAL PRIMARY KEY,
    student_batch       TEXT,
    student_class       TEXT,
    question            TEXT,
    question_short      TEXT,
    faculty_school      TEXT,
    faculty_dept        TEXT,
    selected_option     TEXT,
    score               NUMERIC(3,1),
    answer_text         TEXT,
    batch_year          TEXT,
    batch_programme     TEXT,
    is_suggestion       BOOLEAN DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS idx_inst_school ON institutional_feedback(faculty_school);
CREATE INDEX IF NOT EXISTS idx_inst_dept   ON institutional_feedback(faculty_dept);
"""

def init_db():
    with cursor() as cur:
        cur.execute(SCHEMA)
        cur.execute(INSTITUTION_SCHEMA)


# ── filter builder ─────────────────────────────────────────────
QUESTION_MAP = {
    "The faculty member demonstrates clear knowledge and understanding of the subject":
        "Knowledge & Subject Clarity",
    "The faculty member is well-prepared and organized for classes/lab sessions":
        "Preparation & Organisation",
    "The faculty member encourages student participation and interaction in the classroom.":
        "Student Participation",
    "The teaching methods and learning resources used by the faculty are effective":
        "Teaching Methods & Resources",
    "The faculty member maintains discipline, punctuality, and professional conduct in class":
        "Discipline & Punctuality",
    "The faculty member is accessible and approachable for clarifying doubts":
        "Accessibility & Doubt Clearing",
    "The faculty member is fair in internal evaluation processes":
        "Fairness in Evaluation",
    "The faculty member informs students about expected competencies, course outcomes, and programme outcomes":
        "Outcomes & Competency Awareness",
    "The faculty member uses student-centric methods, such as experiential learning, participative learning, and problem-solving methodologies, to enhance learning experiences":
        "Student-Centric Methods",
    "Efforts are made by the faculty member to inculcate soft skills, life skills, and employability skills":
        "Soft & Life Skills Development",
}

GENERIC_SUGGESTIONS = {
    "good","nil","nothing","no","na","none","nill","ok","okay","no suggestion",
    "no suggestions","good.","good!","good!!!","good teaching","...","n","nio",
    "very good","everything is good","not applicable","satisfied","nice","great",
    "no other suggestions.","no other suggestions","no suggestions.","nill.",
    "null","—","no comments","no comment","nothing.","ok.","fine","fine.",
}

# ---INSTITUTION_QUESTION_MAP---
INSTITUTION_QUESTION_MAP = {
    "The curriculum of my programme is current and relevant.": "Curriculum Relevance",
    "The courses provide a strong conceptual foundation.": "Conceptual Foundation",
    "The department provides adequate academic guidance and mentoring.": "Mentoring & Guidance",
    "The department organises academic enrichment activities - Conferences, workshops, guest lectures, etc.": "Enrichment Activities",
    "Infrastructure and facilities in the department are adequate for learning.": "Infrastructure",
    "The institution provides effective academic and administrative support services.": "Admin Support",
    "The campus environment is safe, inclusive and conducive to learning.": "Campus Environment",
    "The University promotes holistic development through cultural, sports, and extracurricular activities.": "Holistic Development",
    "Additional Suggestions": "Suggestions"
}

def build_where(
    role="admin", dept=None, school=None,
    faculty=None, year=None, programme=None,
    batch=None, rating=None,
    extra_conditions=None
):
    # Always start with WHERE 1=1 so every subsequent AND clause is always valid
    # regardless of whether any filters are active.
    conds = ["1=1"]
    params = []

    # Strict role scoping
    if role == "hod":
        conds.append("faculty_dept = %s")
        params.append(dept)
    elif role == "dean":
        conds.append("faculty_school = %s")
        params.append(school)
        if dept:
            conds.append("faculty_dept = %s")
            params.append(dept)
    else:
        # User is admin, or role is not restricted. Apply selected filters if present.
        if dept:
            conds.append("faculty_dept = %s")
            params.append(dept)
        if school:
            conds.append("faculty_school = %s")
            params.append(school)

    if faculty:
        conds.append("faculty_name = %s")
        params.append(faculty)
    if year:
        conds.append("batch_year = %s")
        params.append(year)
    if programme:
        conds.append("batch_programme = %s")
        params.append(programme)
    if batch:
        conds.append("student_batch = %s")
        params.append(batch)
    if rating:
        conds.append("selected_option = %s")
        params.append(rating)

    if extra_conditions:
        for ec, ep in extra_conditions:
            conds.append(ec)
            params.extend(ep if isinstance(ep, list) else [ep])

    where = "WHERE " + " AND ".join(conds)
    return where, params


# ── filters endpoint ───────────────────────────────────────────
def get_filter_options(role="admin", dept=None, school=None, faculty=None, year=None, programme=None, batch=None, rating=None):
    eval_sch = school if role == "dean" else None
    eval_dep = dept if role == "hod" else None

    w_sch, p_sch = build_where(role=role, dept=dept, school=eval_sch, faculty=faculty, year=year, programme=programme, batch=batch, rating=rating)
    w_dep, p_dep = build_where(role=role, dept=eval_dep, school=school, faculty=faculty, year=year, programme=programme, batch=batch, rating=rating)
    w_fac, p_fac = build_where(role=role, dept=dept, school=school, faculty=None, year=year, programme=programme, batch=batch, rating=rating)
    w_yr, p_yr = build_where(role=role, dept=dept, school=school, faculty=faculty, year=None, programme=programme, batch=batch, rating=rating)
    w_pro, p_pro = build_where(role=role, dept=dept, school=school, faculty=faculty, year=year, programme=None, batch=batch, rating=rating)
    w_bat, p_bat = build_where(role=role, dept=dept, school=school, faculty=faculty, year=year, programme=programme, batch=None, rating=rating)
    where, params = build_where(role=role, dept=dept, school=school, faculty=faculty, year=year, programme=programme, batch=batch, rating=rating)

    with cursor() as cur:
        cur.execute(f"SELECT DISTINCT faculty_school FROM feedback {w_sch} ORDER BY 1", p_sch)
        schools = [r["faculty_school"] for r in cur.fetchall() if r["faculty_school"]]

        cur.execute(f"SELECT DISTINCT faculty_dept FROM feedback {w_dep} ORDER BY 1", p_dep)
        departments = [r["faculty_dept"] for r in cur.fetchall() if r["faculty_dept"]]

        cur.execute(f"SELECT DISTINCT faculty_name, faculty_dept, faculty_school FROM feedback {w_fac} ORDER BY 1", p_fac)
        faculty_list = [dict(r) for r in cur.fetchall() if r["faculty_name"]]

        cur.execute(f"SELECT DISTINCT batch_year FROM feedback {w_yr} ORDER BY 1", p_yr)
        years = [r["batch_year"] for r in cur.fetchall() if r["batch_year"]]

        cur.execute(f"SELECT DISTINCT batch_programme FROM feedback {w_pro} ORDER BY 1", p_pro)
        programmes = [r["batch_programme"] for r in cur.fetchall() if r["batch_programme"]]

        cur.execute(f"SELECT DISTINCT student_batch, batch_year, batch_programme FROM feedback {w_bat} ORDER BY batch_year, student_batch", p_bat)
        batches = [dict(r) for r in cur.fetchall() if r["student_batch"]]

        cur.execute(f"SELECT DISTINCT subject FROM feedback {where} ORDER BY 1", params)
        subjects = [r["subject"] for r in cur.fetchall() if r["subject"]]

    return {
        "schools": schools,
        "departments": departments,
        "faculty": faculty_list,
        "years": years,
        "programmes": programmes,
        "batches": batches,
        "subjects": subjects,
    }


# ── summary / KPIs ─────────────────────────────────────────────
def get_summary(**kwargs):
    rating = kwargs.pop("rating", None)
    where, params = build_where(**kwargs)

    with cursor() as cur:
        cur.execute(f"""
            SELECT
                COUNT(*) FILTER (WHERE selected_option IS NOT NULL AND is_suggestion = FALSE) AS total_ratings,
                COUNT(*) FILTER (WHERE selected_option = 'Very Good')                         AS very_good,
                COUNT(*) FILTER (WHERE selected_option = 'Good')                              AS good,
                COUNT(*) FILTER (WHERE selected_option = 'Satisfactory')                      AS satisfactory,
                COUNT(*) FILTER (WHERE selected_option = 'Unsatisfactory')                    AS unsatisfactory,
                COUNT(*) FILTER (WHERE is_suggestion = TRUE AND answer_text IS NOT NULL)      AS total_suggestions,
                COUNT(DISTINCT faculty_name)                                                  AS faculty_count,
                COUNT(DISTINCT student_batch)                                                 AS batch_count
            FROM feedback
            {where}
        """, params)
        row = dict(cur.fetchone())

    total = row["total_ratings"] or 0
    row["very_good_pct"]      = round((row["very_good"] or 0) / total * 100, 1) if total else 0
    row["good_pct"]           = round((row["good"] or 0) / total * 100, 1) if total else 0
    row["satisfactory_pct"]   = round((row["satisfactory"] or 0) / total * 100, 1) if total else 0
    row["unsatisfactory_pct"] = round((row["unsatisfactory"] or 0) / total * 100, 1) if total else 0
    return row


# ── rating distribution (donut) ────────────────────────────────
def get_rating_distribution(**kwargs):
    where, params = build_where(**kwargs)
    with cursor() as cur:
        cur.execute(f"""
            SELECT selected_option AS rating, COUNT(*) AS count
            FROM feedback
            {where}
            AND selected_option IN ('Very Good','Good','Satisfactory','Unsatisfactory')
            GROUP BY selected_option
            ORDER BY CASE selected_option
                WHEN 'Very Good' THEN 1 WHEN 'Good' THEN 2
                WHEN 'Satisfactory' THEN 3 WHEN 'Unsatisfactory' THEN 4 END
        """, params)
        return cur.fetchall()


# ── batch ratings (stacked bar) ────────────────────────────────
def get_batch_ratings(**kwargs):
    where, params = build_where(**kwargs)
    with cursor() as cur:
        cur.execute(f"""
            SELECT
                student_batch,
                batch_year,
                batch_programme,
                selected_option AS rating,
                COUNT(*) AS count
            FROM feedback
            {where}
            AND selected_option IN ('Very Good','Good','Satisfactory','Unsatisfactory')
            GROUP BY student_batch, batch_year, batch_programme, selected_option
            ORDER BY batch_year, student_batch
        """, params)
        rows = cur.fetchall()

    batches = {}
    for r in rows:
        b = r["student_batch"]
        if b not in batches:
            batches[b] = {
                "batch": b,
                "year": r["batch_year"],
                "programme": r["batch_programme"],
                "short": b, # Use full batch name for 'short' as per instruction
                "Very Good": 0, "Good": 0, "Satisfactory": 0, "Unsatisfactory": 0,
            }
        batches[b][r["rating"]] = r["count"]

    return list(batches.values())


# ── score trend ────────────────────────────────────────────────
def get_score_trend(**kwargs):
    top = kwargs.pop("top", 15)
    where, params = build_where(**kwargs)
    with cursor() as cur:
        cur.execute(f"""
            SELECT
                student_batch,
                batch_year,
                batch_programme,
                ROUND(AVG(score), 3) AS avg_score,
                COUNT(*)             AS response_count
            FROM feedback
            {where}
            AND score IS NOT NULL
            GROUP BY student_batch, batch_year, batch_programme
            ORDER BY response_count DESC, student_batch
            LIMIT %s
        """, params + [top])
        rows = cur.fetchall()

    result = []
    for r in rows:
        short = (r["student_batch"] or "")
        if r["batch_year"]:
            short = short.replace(r["batch_year"], "").strip()
        result.append({
            "batch": r["student_batch"],
            "short": short,
            "year": r["batch_year"],
            "avg_score": float(r["avg_score"]) if r["avg_score"] else 0,
            "response_count": r["response_count"],
        })
    return result


# ── subject performance ────────────────────────────────────────
def get_subject_performance(**kwargs):
    top = kwargs.pop("top", 20)
    where, params = build_where(**kwargs)
    with cursor() as cur:
        cur.execute(f"""
            SELECT
                subject,
                ROUND(AVG(score), 3) AS avg_score,
                COUNT(*)             AS response_count
            FROM feedback
            {where}
            AND score IS NOT NULL AND subject IS NOT NULL AND subject != ''
            GROUP BY subject
            ORDER BY avg_score DESC
            LIMIT %s
        """, params + [top])
        return [dict(r) for r in cur.fetchall()]


# ── question breakdown ─────────────────────────────────────────
def get_question_breakdown(**kwargs):
    where, params = build_where(**kwargs)
    with cursor() as cur:
        cur.execute(f"""
            SELECT
                question_short,
                selected_option AS rating,
                COUNT(*) AS count
            FROM feedback
            {where}
            AND selected_option IN ('Very Good','Good','Satisfactory','Unsatisfactory')
            AND question_short IS NOT NULL AND question_short != ''
            AND is_suggestion = FALSE
            GROUP BY question_short, selected_option
            ORDER BY question_short
        """, params)
        rows = cur.fetchall()

    questions = {}
    ORDER = [
        "Knowledge & Subject Clarity", "Preparation & Organisation",
        "Student Participation", "Teaching Methods & Resources",
        "Discipline & Punctuality", "Accessibility & Doubt Clearing",
        "Fairness in Evaluation", "Outcomes & Competency Awareness",
        "Student-Centric Methods", "Soft & Life Skills Development",
    ]
    for r in rows:
        q = r["question_short"]
        if q not in questions:
            questions[q] = {"question": q, "Very Good": 0, "Good": 0, "Satisfactory": 0, "Unsatisfactory": 0}
        questions[q][r["rating"]] = r["count"]

    result = []
    for q in ORDER:
        if q in questions:
            d = questions[q]
            tot = d["Very Good"] + d["Good"] + d["Satisfactory"] + d["Unsatisfactory"]
            avg = (d["Very Good"]*4 + d["Good"]*3 + d["Satisfactory"]*2 + d["Unsatisfactory"]*1) / tot if tot else 0
            result.append({**d, "avg_score": round(avg, 2), "total": tot})

    return result


# ── suggestions ────────────────────────────────────────────────
def get_suggestions(**kwargs):
    limit  = kwargs.pop("limit", 50)
    offset = kwargs.pop("offset", 0)
    where, params = build_where(**kwargs)

    with cursor() as cur:
        cur.execute(f"""
            SELECT COUNT(*) AS cnt FROM feedback
            {where}
            AND is_suggestion = TRUE
            AND answer_text IS NOT NULL
            AND LENGTH(TRIM(answer_text)) > 15
        """, params)
        total = cur.fetchone()["cnt"]

        cur.execute(f"""
            SELECT
                answer_text,
                student_batch,
                batch_year,
                batch_programme,
                faculty_name,
                faculty_dept,
                subject
            FROM feedback
            {where}
            AND is_suggestion = TRUE
            AND answer_text IS NOT NULL
            AND LENGTH(TRIM(answer_text)) > 15
            ORDER BY LENGTH(answer_text) DESC
            LIMIT %s OFFSET %s
        """, params + [limit, offset])
        rows = [dict(r) for r in cur.fetchall()]

    return {"total": total, "items": rows, "limit": limit, "offset": offset}


# ── faculty info ───────────────────────────────────────────────
def get_faculty_info(faculty=None, dept=None):
    with cursor() as cur:
        if faculty:
            cur.execute("""
                SELECT DISTINCT faculty_name, faculty_dept, faculty_school,
                    array_agg(DISTINCT subject) FILTER (WHERE subject IS NOT NULL AND subject != '') AS subjects,
                    faculty_email
                FROM feedback
                WHERE faculty_name = %s
                GROUP BY faculty_name, faculty_dept, faculty_school, faculty_email
                LIMIT 1
            """, [faculty])
        elif dept:
            cur.execute("""
                SELECT DISTINCT faculty_name, faculty_dept, faculty_school,
                    array_agg(DISTINCT subject) FILTER (WHERE subject IS NOT NULL AND subject != '') AS subjects,
                    faculty_email
                FROM feedback
                WHERE faculty_dept = %s
                GROUP BY faculty_name, faculty_dept, faculty_school, faculty_email
                ORDER BY faculty_name
            """, [dept])
        else:
            return []
        return [dict(r) for r in cur.fetchall()]
    

def get_inst_filter_options(role="admin", school=None, dept=None):
    """Specific filter options for the Institutional Table"""
    # Use your existing build_where but we'll apply it to the inst table
    where, params = build_where(role=role, school=school, dept=dept)
    
    with cursor() as cur:
        # Get Schools available in Institutional Data
        cur.execute(f"SELECT DISTINCT faculty_school FROM institutional_feedback {where} ORDER BY 1", params)
        schools = [r["faculty_school"] for r in cur.fetchall() if r["faculty_school"]]

        # Get Depts available in Institutional Data
        cur.execute(f"SELECT DISTINCT faculty_dept FROM institutional_feedback {where} ORDER BY 1", params)
        depts = [r["faculty_dept"] for r in cur.fetchall() if r["faculty_dept"]]

        # Get Batches available in Institutional Data
        cur.execute(f"SELECT DISTINCT student_batch FROM institutional_feedback {where} ORDER BY 1", params)
        batches = [r["student_batch"] for r in cur.fetchall() if r["student_batch"]]

    return {
        "schools": schools,
        "departments": depts,
        "batches": batches
    }

def get_institutional_stats(**kwargs):
    # This remains the same, ensuring suggestions don't ruin the bar chart
    where, params = build_where(**kwargs)
    with cursor() as cur:
        cur.execute(f"""
            SELECT 
                question_short AS label, 
                ROUND(AVG(score), 2) AS value
            FROM institutional_feedback
            {where}
            AND is_suggestion = FALSE  -- Filters out text-based suggestions
            GROUP BY question_short
            ORDER BY value DESC
        """, params)
        return cur.fetchall()

def get_institutional_suggestions(**kwargs):
    # Added defaults for limit and offset to prevent errors
    limit  = kwargs.pop("limit", 50)
    offset = kwargs.pop("offset", 0)
    
    where, params = build_where(**kwargs)

    with cursor() as cur:
        cur.execute(f"""
            SELECT COUNT(*) AS cnt FROM institutional_feedback
            {where}
            AND is_suggestion = TRUE
            AND answer_text IS NOT NULL
            AND LENGTH(TRIM(answer_text)) > 15
        """, params)
        total = cur.fetchone()["cnt"]

        cur.execute(f"""
            SELECT
                answer_text,
                student_batch,
                faculty_school,
                faculty_dept
            FROM institutional_feedback
            {where}
            AND is_suggestion = TRUE
            AND answer_text IS NOT NULL
            AND LENGTH(TRIM(answer_text)) > 15
            ORDER BY id DESC
            LIMIT %s OFFSET %s
        """, params + [limit, offset])
        rows = [dict(r) for r in cur.fetchall()]

    return {"total": total, "items": rows, "limit": limit, "offset": offset}


def get_institutional_distribution(**kwargs):
    where, params = build_where(**kwargs)
    with cursor() as cur:
        cur.execute(f"""
            SELECT 
                COUNT(*) FILTER (WHERE score >= 4.5) as strongly_agree,
                COUNT(*) FILTER (WHERE score >= 3.5 AND score < 4.5) as agree,
                COUNT(*) FILTER (WHERE score >= 2.5 AND score < 3.5) as neutral,
                COUNT(*) FILTER (WHERE score < 2.5) as disagree
            FROM institutional_feedback
            {where}
            AND is_suggestion = FALSE
        """, params)
        return dict(cur.fetchone())