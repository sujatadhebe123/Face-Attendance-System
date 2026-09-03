"""
STEP B MIGRATION — RUN ONCE AFTER STEP A.

Preserves existing data.

Changes:
- student uniqueness becomes class-wise, not teacher-wise
- creates persistent attendance_sessions
- adds attendance.session_id
- creates historical placeholder sessions for existing attendance rows
  so old attendance remains associated with the original teacher/class.
"""

from sqlalchemy import text
from database.db import engine


with engine.begin() as conn:
    # Student constraints: same shared class must not contain duplicate roll/email.
    conn.execute(text("""
        ALTER TABLE students
        DROP CONSTRAINT IF EXISTS uq_students_user_roll_number;
    """))
    conn.execute(text("""
        ALTER TABLE students
        DROP CONSTRAINT IF EXISTS uq_students_user_email;
    """))
    conn.execute(text("""
        ALTER TABLE students
        DROP CONSTRAINT IF EXISTS students_roll_number_key;
    """))
    conn.execute(text("""
        ALTER TABLE students
        DROP CONSTRAINT IF EXISTS students_email_key;
    """))

    # If Step A successfully backfilled all rows, make class_id required.
    null_count = conn.execute(text(
        "SELECT COUNT(*) FROM students WHERE class_id IS NULL"
    )).scalar()

    if null_count:
        raise RuntimeError(
            f"{null_count} student(s) have no class_id. "
            "Do not continue; Step A backfill must be fixed first."
        )

    conn.execute(text("""
        ALTER TABLE students
        ALTER COLUMN class_id SET NOT NULL;
    """))

    conn.execute(text("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint
                WHERE conname = 'uq_students_class_roll_number'
            ) THEN
                ALTER TABLE students
                ADD CONSTRAINT uq_students_class_roll_number
                UNIQUE (class_id, roll_number);
            END IF;
        END $$;
    """))

    conn.execute(text("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint
                WHERE conname = 'uq_students_class_email'
            ) THEN
                ALTER TABLE students
                ADD CONSTRAINT uq_students_class_email
                UNIQUE (class_id, email);
            END IF;
        END $$;
    """))

    # Persistent attendance sessions.
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS attendance_sessions (
            id SERIAL PRIMARY KEY,
            teacher_id INTEGER NOT NULL REFERENCES users(id),
            class_id INTEGER NOT NULL REFERENCES classrooms(id),
            assignment_id INTEGER REFERENCES teaching_assignments(id),
            session_date DATE NOT NULL,
            started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            ended_at TIMESTAMPTZ,
            status VARCHAR(20) NOT NULL DEFAULT 'Completed'
        );
    """))

    conn.execute(text("""
        CREATE INDEX IF NOT EXISTS ix_attendance_sessions_teacher_id
        ON attendance_sessions(teacher_id);
    """))
    conn.execute(text("""
        CREATE INDEX IF NOT EXISTS ix_attendance_sessions_class_id
        ON attendance_sessions(class_id);
    """))
    conn.execute(text("""
        CREATE INDEX IF NOT EXISTS ix_attendance_sessions_assignment_id
        ON attendance_sessions(assignment_id);
    """))
    conn.execute(text("""
        CREATE INDEX IF NOT EXISTS ix_attendance_sessions_session_date
        ON attendance_sessions(session_date);
    """))

    # The model requires assignment_id for NEW sessions, but historical old
    # attendance cannot truthfully be assigned to a subject. Keep DB nullable
    # for historical placeholders.
    conn.execute(text("""
        ALTER TABLE attendance
        ADD COLUMN IF NOT EXISTS session_id INTEGER;
    """))

    conn.execute(text("""
        CREATE INDEX IF NOT EXISTS ix_attendance_session_id
        ON attendance(session_id);
    """))

    conn.execute(text("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint
                WHERE conname = 'fk_attendance_session_id'
            ) THEN
                ALTER TABLE attendance
                ADD CONSTRAINT fk_attendance_session_id
                FOREIGN KEY (session_id)
                REFERENCES attendance_sessions(id);
            END IF;
        END $$;
    """))

    # Preserve old attendance by creating one historical session per
    # original registrar + class + date. Subject remains NULL because the old
    # schema never stored subject information.
    conn.execute(text("""
        INSERT INTO attendance_sessions (
            teacher_id,
            class_id,
            assignment_id,
            session_date,
            started_at,
            ended_at,
            status
        )
        SELECT DISTINCT
            s.user_id,
            s.class_id,
            NULL::INTEGER,
            a.attendance_date,
            (a.attendance_date::timestamp + TIME '09:00:00'),
            (a.attendance_date::timestamp + TIME '10:00:00'),
            'Historical'
        FROM attendance a
        JOIN students s ON s.id = a.student_id
        WHERE a.session_id IS NULL
          AND NOT EXISTS (
              SELECT 1
              FROM attendance_sessions x
              WHERE x.teacher_id = s.user_id
                AND x.class_id = s.class_id
                AND x.assignment_id IS NULL
                AND x.session_date = a.attendance_date
                AND x.status = 'Historical'
          );
    """))

    conn.execute(text("""
        UPDATE attendance a
        SET session_id = x.id
        FROM students s, attendance_sessions x
        WHERE a.student_id = s.id
          AND a.session_id IS NULL
          AND x.teacher_id = s.user_id
          AND x.class_id = s.class_id
          AND x.assignment_id IS NULL
          AND x.session_date = a.attendance_date
          AND x.status = 'Historical';
    """))

    conn.execute(text("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint
                WHERE conname = 'uq_attendance_session_student'
            ) THEN
                ALTER TABLE attendance
                ADD CONSTRAINT uq_attendance_session_student
                UNIQUE (session_id, student_id);
            END IF;
        END $$;
    """))

print("Step B migration complete.")
print("Students are now shared by class instead of owned by each teacher.")
print("Existing attendance was preserved as historical attendance.")
print("New attendance can now be stored per teacher + class + subject session.")
