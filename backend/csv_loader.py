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
    """Parse CSV text and route rows to either Faculty or Institutional tables."""
    reader = csv.DictReader(io.StringIO(text))
    
    fac_rows = []
    inst_rows = []
    skipped = 0

    # Unified Rating Map for both 4-point and 5-point scales
    RATING_MAP = {
        # Faculty Scale
        "Very Good": 4.0, "Good": 3.0, "Satisfactory": 2.0, "Unsatisfactory": 1.0,
        # Institutional Scale
        "Strongly Agree": 5.0, "Agree": 4.0, "Neutral": 3.0, "Disagree": 2.0, "Strongly Disagree": 1.0
    }

    for raw in reader:
        def g(k): return (raw.get(k) or "").strip()

        identifier = g("Identifier") # The new column you are adding
        batch      = g("Student Batch Name")
        question   = g("Question")
        answer     = g("Answer Text")
        
        if not batch or not question:
            skipped += 1
            continue

        # Shared Derived fields
        year      = batch[:4] if batch[:4].isdigit() else None
        programme = batch[5:].strip() if year else batch

        # --- ROUTE TO INSTITUTIONAL TABLE ---
        if identifier == "I&D":
            q_short = db.INSTITUTION_QUESTION_MAP.get(question, question[:30])
            option  = g("Selected Option")
            score   = RATING_MAP.get(option, 0.0)
            
            # Check if it's the suggestion question
            is_sugg = (question == "Additional Suggestions")
            
            # Filter generic noise for suggestions
            if is_sugg and (not answer or len(answer.strip()) <= 15 or 
                            answer.strip().lower() in db.GENERIC_SUGGESTIONS):
                is_sugg = False
                answer = None

            inst_rows.append((
                batch, g("Student Class Name"), question, q_short,
                g("Faculty School"), g("Faculty Department"),
                option, score, answer, year, programme, is_sugg
            ))

        # --- ROUTE TO FACULTY TABLE (Original Logic) ---
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
            # 1. Handle Faculty Data
            if fac_rows:
                # ONLY truncate feedback if we are uploading new faculty rows
                cur.execute("TRUNCATE TABLE feedback RESTART IDENTITY")
                execute_values(cur, """
                    INSERT INTO feedback (
                        student_batch, student_class, question, question_short,
                        faculty_name, faculty_dept, faculty_school,
                        subject, selected_option, score, answer_text,
                        faculty_email, batch_year, batch_programme, is_suggestion
                    ) VALUES %s
                """, fac_rows, page_size=2000)

            # 2. Handle Institutional Data
            if inst_rows:
                # ONLY truncate institutional_feedback if we are uploading new I&D rows
                cur.execute("TRUNCATE TABLE institutional_feedback RESTART IDENTITY")
                execute_values(cur, """
                    INSERT INTO institutional_feedback (
                        student_batch, student_class, question, question_short,
                        faculty_school, faculty_dept,
                        selected_option, score, answer_text, 
                        batch_year, batch_programme, is_suggestion
                    ) VALUES %s
                """, inst_rows, page_size=2000)

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