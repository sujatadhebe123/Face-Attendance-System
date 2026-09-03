from sqlalchemy import text
from database.db import engine

with engine.begin() as conn:
    conn.execute(text("""
        ALTER TABLE attendance_sessions
        ALTER COLUMN assignment_id DROP NOT NULL;
    """))

print("FIX COMPLETE: attendance_sessions.assignment_id now allows NULL.")
