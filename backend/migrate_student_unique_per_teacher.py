"""
Run this file ONCE from the backend folder.

Purpose:
- Remove the old GLOBAL unique constraints on students.email and students.roll_number.
- Add teacher-wise unique constraints instead:
    (user_id, email)
    (user_id, roll_number)

After this:
Teacher 1 can have roll no 01 / student@gmail.com
Teacher 2 can also have roll no 01 / student@gmail.com
But the SAME teacher cannot register the same roll/email twice.
"""

from sqlalchemy import text
from database.db import engine


with engine.begin() as conn:
    # Old global constraints from the original single-teacher schema.
    conn.execute(text("""
        ALTER TABLE students
        DROP CONSTRAINT IF EXISTS students_email_key;
    """))

    conn.execute(text("""
        ALTER TABLE students
        DROP CONSTRAINT IF EXISTS students_roll_number_key;
    """))

    # Add teacher-wise composite uniqueness.
    conn.execute(text("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint
                WHERE conname = 'uq_students_user_email'
            ) THEN
                ALTER TABLE students
                ADD CONSTRAINT uq_students_user_email
                UNIQUE (user_id, email);
            END IF;
        END $$;
    """))

    conn.execute(text("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint
                WHERE conname = 'uq_students_user_roll_number'
            ) THEN
                ALTER TABLE students
                ADD CONSTRAINT uq_students_user_roll_number
                UNIQUE (user_id, roll_number);
            END IF;
        END $$;
    """))

print("Student uniqueness migration complete.")
print("Email and roll number are now unique per teacher, not globally.")
