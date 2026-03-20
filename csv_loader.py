"""
csv_loader.py — Parse uploaded CSV and bulk-load into PostgreSQL
"""
import csv
import io
# import backend.database as db
import database as db
from psycopg2.extras import execute_values

QUESTION_MAP = db.QUESTION_MAP
GENERIC = db.GENERIC_SUGGESTIONS

RATING_SCORE = {"Very Good": 4.0, "Good": 3.0, "Satisfactory": 2.0, "Unsatisfactory": 1.0}


def load_csv(text: str) -> dict:
    """Parse CSV text and insert rows into the feedback table. Returns stats."""
    reader = csv.DictReader(io.StringIO(text))
    
    rows = []
    skipped = 0
    inserted = 0

    for raw in reader:
        def g(k): return (raw.get(k) or "").strip()

        batch      = g("Student Batch Name")
        student_cl = g("Student Class Name")
        question   = g("Question")
        fac_name   = g("Faculty Name")
        fac_dept   = g("Faculty Department")
        fac_school = g("Faculty School")
        subject    = g("Slot Subject Name")
        option     = g("Selected Option")
        answer     = g("Answer Text")
        email      = g("Faculty Email Id")

        if not batch or not fac_name:
            skipped += 1
            continue

        # Derived fields
        year      = batch[:4] if batch[:4].isdigit() else None
        programme = batch[5:].strip() if year else batch

        q_short   = QUESTION_MAP.get(question)
        score     = RATING_SCORE.get(option)

        is_sugg   = (question == "Additional Suggestions")

        # Filter generic suggestions at load time
        if is_sugg and (not answer or len(answer.strip()) <= 15 or
                        answer.strip().lower() in GENERIC):
            is_sugg = False
            answer  = None   # discard noise

        rows.append((
            batch, student_cl, question, q_short,
            fac_name, fac_dept, fac_school,
            subject, option, score, answer,
            email, year, programme, is_sugg,
        ))

    if not rows:
        return {"status": "error", "message": "No valid rows found in CSV", "inserted": 0}

    conn = db.get_conn()
    try:
        with conn.cursor() as cur:
            # Optionally truncate first (re-upload scenario)
            cur.execute("TRUNCATE TABLE feedback RESTART IDENTITY")

            execute_values(cur, """
                INSERT INTO feedback (
                    student_batch, student_class, question, question_short,
                    faculty_name, faculty_dept, faculty_school,
                    subject, selected_option, score, answer_text,
                    faculty_email, batch_year, batch_programme, is_suggestion
                ) VALUES %s
            """, rows, page_size=2000)

            inserted = len(rows)
        conn.commit()
    except Exception as e:
        conn.rollback()
        return {"status": "error", "message": str(e), "inserted": 0}
    finally:
        conn.close()

    return {
        "status": "ok",
        "inserted": inserted,
        "skipped": skipped,
        "message": f"Successfully loaded {inserted:,} rows ({skipped} skipped)"
    }
