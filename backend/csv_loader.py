"""
csv_loader.py — Parse uploaded CSV and bulk-load into PostgreSQL

Duplicate prevention strategy:
- Uses upload_log table to track uploaded filenames
- If same filename uploaded again → deletes previous rows from that file → re-inserts fresh
- If new filename → appends rows safely
- No DB schema changes needed beyond the auto-created upload_log table

Before starting a FRESH upload cycle (new semester data):
    TRUNCATE TABLE public.feedback RESTART IDENTITY;
    TRUNCATE TABLE public.institutional_feedback RESTART IDENTITY;
    TRUNCATE TABLE public.upload_log RESTART IDENTITY;
"""
import csv
import io
import database as db
from psycopg2.extras import execute_values

QUESTION_MAP = db.QUESTION_MAP
GENERIC = db.GENERIC_SUGGESTIONS

RATING_SCORE = {"Very Good": 4.0, "Good": 3.0, "Satisfactory": 2.0, "Unsatisfactory": 1.0}


def load_csv(text: str, filename: str = "unknown") -> dict:
    """Parse CSV text and route rows to either Faculty or Institutional tables."""
    reader = csv.DictReader(io.StringIO(text))

    fac_rows = []
    inst_rows = []
    skipped = 0

    RATING_MAP = {
        "Very Good": 4.0, "Good": 3.0, "Satisfactory": 2.0, "Unsatisfactory": 1.0,
        "Strongly Agree": 5.0, "Agree": 4.0, "Neutral": 3.0, "Disagree": 2.0, "Strongly Disagree": 1.0
    }

    for raw in reader:
        def g(k): return (raw.get(k) or "").strip()

        identifier = g("Identifier")
        batch      = g("Student Batch Name")
        question   = g("Question")
        answer     = g("Answer Text")

        if not batch or not question:
            skipped += 1
            continue

        year      = batch[:4] if batch[:4].isdigit() else None
        programme = batch[5:].strip() if year else batch

        # --- ROUTE TO INSTITUTIONAL TABLE ---
        if identifier == "I&D":
            q_short = db.INSTITUTION_QUESTION_MAP.get(question, question[:30])
            option  = g("Selected Option")
            score   = RATING_MAP.get(option, 0.0)
            is_sugg = (question == "Additional Suggestions")

            if is_sugg and (not answer or len(answer.strip()) <= 15 or
                            answer.strip().lower() in db.GENERIC_SUGGESTIONS):
                is_sugg = False
                answer = None

            inst_rows.append((
                batch, g("Student Class Name"), question, q_short,
                g("Faculty School"), g("Faculty Department"),
                option, score, answer, year, programme, is_sugg
            ))

        # --- ROUTE TO FACULTY TABLE ---
        else:
            fac_name = g("Faculty Name")
            if not fac_name:
                skipped += 1
                continue

            q_short = db.QUESTION_MAP.get(question)
            option  = g("Selected Option")
            score   = RATING_MAP.get(option)
            is_sugg = (question == "Additional Suggestions")

            if is_sugg and (not answer or len(answer.strip()) <= 15 or
                            answer.strip().lower() in db.GENERIC_SUGGESTIONS):
                is_sugg = False
                answer = None

            fac_rows.append((
                batch, g("Student Class Name"), question, q_short,
                fac_name, g("Faculty Department"), g("Faculty School"),
                g("Slot Subject Name"), option, score, answer,
                g("Faculty Email Id"), year, programme, is_sugg
            ))

    if not fac_rows and not inst_rows:
        return {"status": "error", "message": "No valid rows found", "inserted": 0}

    conn = db.get_conn()
    try:
        with conn.cursor() as cur:

            # ── Ensure upload_log table exists ────────────────────
            cur.execute("""
                CREATE TABLE IF NOT EXISTS upload_log (
                    id              SERIAL PRIMARY KEY,
                    filename        TEXT UNIQUE,
                    uploaded_at     TIMESTAMP DEFAULT NOW(),
                    fac_rows        INTEGER DEFAULT 0,
                    inst_rows       INTEGER DEFAULT 0
                )
            """)

            # ── Check if this file was uploaded before ────────────
            cur.execute("SELECT id FROM upload_log WHERE filename = %s", (filename,))
            already_uploaded = cur.fetchone()

            if already_uploaded:
                # File uploaded before — delete its previous rows using row id range
                # We stored row counts, so delete last N rows for this file
                # Simpler: delete by re-tracking with upload_id foreign key
                # Best approach: delete rows inserted in the previous upload of this file
                # Since we track fac_rows count, delete last fac_rows rows for this filename
                cur.execute("SELECT fac_rows, inst_rows FROM upload_log WHERE filename = %s", (filename,))
                prev = cur.fetchone()

                if prev["fac_rows"] > 0:
                    cur.execute("""
                        DELETE FROM feedback 
                        WHERE id IN (
                            SELECT id FROM feedback 
                            ORDER BY id DESC 
                            LIMIT %s
                        )
                    """, (prev["fac_rows"],))

                if prev["inst_rows"] > 0:
                    cur.execute("""
                        DELETE FROM institutional_feedback 
                        WHERE id IN (
                            SELECT id FROM institutional_feedback 
                            ORDER BY id DESC 
                            LIMIT %s
                        )
                    """, (prev["inst_rows"],))

            # ── Insert Faculty rows ───────────────────────────────
            if fac_rows:
                execute_values(cur, """
                    INSERT INTO feedback (
                        student_batch, student_class, question, question_short,
                        faculty_name, faculty_dept, faculty_school,
                        subject, selected_option, score, answer_text,
                        faculty_email, batch_year, batch_programme, is_suggestion
                    ) VALUES %s
                """, fac_rows, page_size=2000)

            # ── Insert Institutional rows ─────────────────────────
            if inst_rows:
                execute_values(cur, """
                    INSERT INTO institutional_feedback (
                        student_batch, student_class, question, question_short,
                        faculty_school, faculty_dept,
                        selected_option, score, answer_text,
                        batch_year, batch_programme, is_suggestion
                    ) VALUES %s
                """, inst_rows, page_size=2000)

            # ── Log this upload ───────────────────────────────────
            cur.execute("""
                INSERT INTO upload_log (filename, fac_rows, inst_rows)
                VALUES (%s, %s, %s)
                ON CONFLICT (filename) 
                DO UPDATE SET 
                    uploaded_at = NOW(),
                    fac_rows    = EXCLUDED.fac_rows,
                    inst_rows   = EXCLUDED.inst_rows
            """, (filename, len(fac_rows), len(inst_rows)))

        conn.commit()
    except Exception as e:
        conn.rollback()
        return {"status": "error", "message": str(e), "inserted": 0}
    finally:
        conn.close()

    return {
        "status": "ok",
        "message": f"Successfully loaded {len(fac_rows)} Faculty and {len(inst_rows)} Institutional rows.",
        "inserted": len(fac_rows) + len(inst_rows),
        "skipped": skipped
    }
