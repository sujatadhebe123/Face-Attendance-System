"""
Run this ONCE after replacing models/student.py and BEFORE restarting the app.

It adds students.user_id and assigns all existing students to your existing
teacher account id=1, preserving your current students and attendance.
"""

from sqlalchemy import text
from database.db import engine


with engine.begin() as conn:
    conn.execute(text("""
        ALTER TABLE students
        ADD COLUMN IF NOT EXISTS user_id INTEGER;
    """))

    # Existing project data belongs to the first teacher account you created.
    conn.execute(text("""
        UPDATE students
        SET user_id = 1
        WHERE user_id IS NULL;
    """))

    conn.execute(text("""
        CREATE INDEX IF NOT EXISTS ix_students_user_id
        ON students(user_id);
    """))

    # Add FK only if it is not already present.
    conn.execute(text("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint
                WHERE conname = 'fk_students_user_id_users'
            ) THEN
                ALTER TABLE students
                ADD CONSTRAINT fk_students_user_id_users
                FOREIGN KEY (user_id)
                REFERENCES users(id);
            END IF;
        END $$;
    """))

    conn.execute(text("""
        ALTER TABLE students
        ALTER COLUMN user_id SET NOT NULL;
    """))

print("Migration complete.")
print("Existing students are assigned to teacher user_id = 1.")
