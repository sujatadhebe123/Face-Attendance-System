"""
FOUNDATION MIGRATION — RUN ONCE.

This does NOT delete your students or attendance.

It:
1. Creates colleges.
2. Links every existing teacher to a shared college_id.
3. Creates classrooms.
4. Adds students.class_id.
5. Backfills each existing student into a classroom based on:
   college + department + year + division + academic_year.
6. Creates teaching_assignments table for the next step.

Your existing teacher-wise attendance routes continue working after this step.
"""

from sqlalchemy import text
from database.db import engine


with engine.begin() as conn:
    # -------------------------
    # Colleges
    # -------------------------
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS colleges (
            id SERIAL PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            normalized_name VARCHAR(255) NOT NULL UNIQUE
        );
    """))

    conn.execute(text("""
        CREATE UNIQUE INDEX IF NOT EXISTS ix_colleges_normalized_name
        ON colleges(normalized_name);
    """))

    conn.execute(text("""
        ALTER TABLE users
        ADD COLUMN IF NOT EXISTS college_id INTEGER;
    """))

    # One shared college row for teachers who typed the same college name
    # (case/extra spaces ignored).
    conn.execute(text("""
        INSERT INTO colleges (name, normalized_name)
        SELECT
            MIN(TRIM(college_name)) AS name,
            LOWER(REGEXP_REPLACE(TRIM(college_name), '\\s+', ' ', 'g')) AS normalized_name
        FROM users
        WHERE college_name IS NOT NULL
          AND TRIM(college_name) <> ''
        GROUP BY LOWER(REGEXP_REPLACE(TRIM(college_name), '\\s+', ' ', 'g'))
        ON CONFLICT (normalized_name) DO NOTHING;
    """))

    conn.execute(text("""
        UPDATE users u
        SET college_id = c.id
        FROM colleges c
        WHERE u.college_id IS NULL
          AND c.normalized_name =
              LOWER(REGEXP_REPLACE(TRIM(u.college_name), '\\s+', ' ', 'g'));
    """))

    conn.execute(text("""
        CREATE INDEX IF NOT EXISTS ix_users_college_id
        ON users(college_id);
    """))

    conn.execute(text("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint
                WHERE conname = 'fk_users_college_id'
            ) THEN
                ALTER TABLE users
                ADD CONSTRAINT fk_users_college_id
                FOREIGN KEY (college_id)
                REFERENCES colleges(id);
            END IF;
        END $$;
    """))

    # -------------------------
    # Classrooms
    # -------------------------
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS classrooms (
            id SERIAL PRIMARY KEY,
            college_id INTEGER NOT NULL REFERENCES colleges(id),
            department VARCHAR(120) NOT NULL,
            year INTEGER NOT NULL,
            division VARCHAR(30) NOT NULL,
            academic_year VARCHAR(20) NOT NULL,
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            CONSTRAINT uq_classroom_identity UNIQUE (
                college_id, department, year, division, academic_year
            )
        );
    """))

    conn.execute(text("""
        CREATE INDEX IF NOT EXISTS ix_classrooms_college_id
        ON classrooms(college_id);
    """))

    conn.execute(text("""
        ALTER TABLE students
        ADD COLUMN IF NOT EXISTS class_id INTEGER;
    """))

    # Build classroom rows from existing student records and their registrar's college.
    conn.execute(text("""
        INSERT INTO classrooms (
            college_id, department, year, division, academic_year, is_active
        )
        SELECT DISTINCT
            u.college_id,
            COALESCE(NULLIF(TRIM(s.department), ''), 'Unknown'),
            COALESCE(s.year, 1),
            UPPER(COALESCE(NULLIF(TRIM(s.division), ''), 'A')),
            COALESCE(NULLIF(TRIM(s.academic_year), ''), 'Unknown'),
            TRUE
        FROM students s
        JOIN users u ON u.id = s.user_id
        WHERE u.college_id IS NOT NULL
        ON CONFLICT (
            college_id, department, year, division, academic_year
        ) DO NOTHING;
    """))

    conn.execute(text("""
        UPDATE students s
        SET class_id = c.id
        FROM users u, classrooms c
        WHERE s.user_id = u.id
          AND u.college_id = c.college_id
          AND c.department = COALESCE(NULLIF(TRIM(s.department), ''), 'Unknown')
          AND c.year = COALESCE(s.year, 1)
          AND c.division = UPPER(COALESCE(NULLIF(TRIM(s.division), ''), 'A'))
          AND c.academic_year = COALESCE(NULLIF(TRIM(s.academic_year), ''), 'Unknown')
          AND s.class_id IS NULL;
    """))

    conn.execute(text("""
        CREATE INDEX IF NOT EXISTS ix_students_class_id
        ON students(class_id);
    """))

    conn.execute(text("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint
                WHERE conname = 'fk_students_class_id'
            ) THEN
                ALTER TABLE students
                ADD CONSTRAINT fk_students_class_id
                FOREIGN KEY (class_id)
                REFERENCES classrooms(id);
            END IF;
        END $$;
    """))

    # -------------------------
    # Teacher ↔ Class ↔ Subject
    # -------------------------
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS teaching_assignments (
            id SERIAL PRIMARY KEY,
            teacher_id INTEGER NOT NULL REFERENCES users(id),
            class_id INTEGER NOT NULL REFERENCES classrooms(id),
            subject_name VARCHAR(160) NOT NULL,
            subject_code VARCHAR(60) NOT NULL,
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            CONSTRAINT uq_teacher_class_subject
                UNIQUE (teacher_id, class_id, subject_code)
        );
    """))

    conn.execute(text("""
        CREATE INDEX IF NOT EXISTS ix_teaching_assignments_teacher_id
        ON teaching_assignments(teacher_id);
    """))

    conn.execute(text("""
        CREATE INDEX IF NOT EXISTS ix_teaching_assignments_class_id
        ON teaching_assignments(class_id);
    """))

print("Shared college/class foundation migration complete.")
print("Existing students and attendance were preserved.")
print("Teachers with the same college name are now linked to the same college.")
