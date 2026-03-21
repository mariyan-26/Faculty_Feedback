-- Run this once in psql or pgAdmin to create the database and user
-- Usage: psql -U postgres -f setup_db.sql

CREATE DATABASE faculty_feedback;

-- Optional: create a dedicated user
-- CREATE USER ff_user WITH PASSWORD 'yourpassword';
-- GRANT ALL PRIVILEGES ON DATABASE faculty_feedback TO ff_user;
-- Then update DATABASE_URL in .env accordingly

\c faculty_feedback

-- The table is created automatically by FastAPI on startup via database.init_db()
-- But you can also run it manually here if needed:

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

CREATE INDEX IF NOT EXISTS idx_faculty    ON feedback(faculty_name);
CREATE INDEX IF NOT EXISTS idx_dept       ON feedback(faculty_dept);
CREATE INDEX IF NOT EXISTS idx_school     ON feedback(faculty_school);
CREATE INDEX IF NOT EXISTS idx_batch      ON feedback(student_batch);
CREATE INDEX IF NOT EXISTS idx_year       ON feedback(batch_year);
CREATE INDEX IF NOT EXISTS idx_programme  ON feedback(batch_programme);
CREATE INDEX IF NOT EXISTS idx_option     ON feedback(selected_option);
CREATE INDEX IF NOT EXISTS idx_suggestion ON feedback(is_suggestion);
