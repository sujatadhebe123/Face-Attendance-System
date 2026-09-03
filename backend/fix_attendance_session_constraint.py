from database.db import engine
from sqlalchemy import text

with engine.begin() as conn:
    # Remove BOTH old daily-attendance constraints
    conn.execute(text("""
        ALTER TABLE attendance
        DROP CONSTRAINT IF EXISTS unique_student_daily_attendance;
    """))

    conn.execute(text("""
        ALTER TABLE attendance
        DROP CONSTRAINT IF EXISTS unique_student_attendance_date;
    """))

    # Ensure correct session-wise uniqueness
    result = conn.execute(text("""
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'unique_student_session_attendance';
    """))

    if result.fetchone() is None:
        conn.execute(text("""
            ALTER TABLE attendance
            ADD CONSTRAINT unique_student_session_attendance
            UNIQUE (session_id, student_id);
        """))

print("Old daily attendance constraints removed.")
print("Session-wise attendance constraint is active.")