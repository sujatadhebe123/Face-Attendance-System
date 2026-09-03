from fastapi import APIRouter, HTTPException, UploadFile, File, Depends
from database.db import SessionLocal
from models.attendance import Attendance
from models.attendance_session import AttendanceSession
from models.student import Student
from models.classroom import Classroom
from models.teaching_assignment import TeachingAssignment
from models.user import User
from services.auth_service import get_current_user

from datetime import date, datetime
from calendar import monthrange
from zoneinfo import ZoneInfo

import cv2
import numpy as np

from services.recognition_service import (
    load_models,
    load_student_embeddings,
    recognize_face
)


router = APIRouter()
RECOGNITION_THRESHOLD = 0.50

# India timezone
INDIA_TZ = ZoneInfo("Asia/Kolkata")

_detector = None
_recognizer = None


# ============================================================
# TIMEZONE HELPERS
# ============================================================

def india_now():
    """
    Return current India date and time.
    This avoids Render/server UTC timezone problems.
    """
    return datetime.now(INDIA_TZ)


def india_today():
    """
    Return today's date according to India timezone.
    """
    return india_now().date()


# ============================================================
# FACE MODELS
# ============================================================

def get_face_models():
    global _detector, _recognizer

    if _detector is None or _recognizer is None:
        _detector, _recognizer = load_models()

    return _detector, _recognizer


# ============================================================
# ASSIGNMENT HELPER
# ============================================================

def get_assignment(db, assignment_id, current_user):
    row = (
        db.query(TeachingAssignment, Classroom)
        .join(Classroom, Classroom.id == TeachingAssignment.class_id)
        .filter(
            TeachingAssignment.id == assignment_id,
            TeachingAssignment.teacher_id == current_user.id,
            TeachingAssignment.is_active == True,
            Classroom.college_id == current_user.college_id,
            Classroom.is_active == True,
        )
        .first()
    )

    if not row:
        raise HTTPException(
            status_code=404,
            detail="Teaching assignment not found"
        )

    return row


# ============================================================
# ACTIVE SESSION HELPER
# ============================================================

def get_active_session(db, current_user):
    return (
        db.query(AttendanceSession)
        .filter(
            AttendanceSession.teacher_id == current_user.id,
            AttendanceSession.status == "Active"
        )
        .order_by(AttendanceSession.id.desc())
        .first()
    )


# ============================================================
# SESSION JSON HELPER
# ============================================================

def session_json(session, assignment=None, classroom=None):

    result = {
        "session_id": session.id,
        "active": session.status == "Active",
        "status": session.status,
        "teacher_id": session.teacher_id,
        "class_id": session.class_id,
        "assignment_id": session.assignment_id,
        "date": str(session.session_date),
        "started_at": str(session.started_at) if session.started_at else None,
        "ended_at": str(session.ended_at) if session.ended_at else None,
    }

    if assignment:
        result["subject_name"] = assignment.subject_name
        result["subject_code"] = assignment.subject_code

    if classroom:
        result["classroom"] = {
            "id": classroom.id,
            "department": classroom.department,
            "year": classroom.year,
            "division": classroom.division,
            "academic_year": classroom.academic_year,
        }

    return result


# ============================================================
# START ATTENDANCE SESSION
# ============================================================

@router.post("/start")
def start_attendance(
    assignment_id: int,
    current_user: User = Depends(get_current_user)
):

    db = SessionLocal()

    try:

        active = get_active_session(db, current_user)

        if active:
            return {
                "message": "Attendance session is already active",
                **session_json(active)
            }

        assignment, classroom = get_assignment(
            db,
            assignment_id,
            current_user
        )

        now = india_now()

        session = AttendanceSession(
            teacher_id=current_user.id,
            class_id=classroom.id,
            assignment_id=assignment.id,

            # India date
            session_date=now.date(),

            # India date + time
            started_at=now,

            status="Active",
        )

        db.add(session)
        db.commit()
        db.refresh(session)

        return {
            "message": "Attendance session started",
            **session_json(
                session,
                assignment,
                classroom
            )
        }

    finally:
        db.close()


# ============================================================
# SESSION STATUS
# ============================================================

@router.get("/session-status")
def session_status(
    current_user: User = Depends(get_current_user)
):

    db = SessionLocal()

    try:

        session = get_active_session(
            db,
            current_user
        )

        if not session:
            return {
                "active": False,
                "date": str(india_today()),
                "session_id": None
            }

        assignment, classroom = get_assignment(
            db,
            session.assignment_id,
            current_user
        )

        return session_json(
            session,
            assignment,
            classroom
        )

    finally:
        db.close()


# ============================================================
# END ATTENDANCE SESSION
# ============================================================

@router.post("/end")
def end_attendance(
    current_user: User = Depends(get_current_user)
):

    db = SessionLocal()

    try:

        session = get_active_session(
            db,
            current_user
        )

        if not session:
            return {
                "message": "No attendance session is currently active",
                "active": False
            }

        session.status = "Completed"

        # India date/time
        session.ended_at = india_now()

        db.commit()
        db.refresh(session)

        return {
            "message": "Attendance session ended",
            **session_json(session)
        }

    finally:
        db.close()


# ============================================================
# MANUAL ATTENDANCE
# ============================================================

@router.post("/mark")
def mark_attendance(
    student_id: int,
    confidence: float,
    current_user: User = Depends(get_current_user)
):

    db = SessionLocal()

    try:

        session = get_active_session(
            db,
            current_user
        )

        if not session:
            raise HTTPException(
                status_code=400,
                detail="Attendance session is not active"
            )

        student = (
            db.query(Student)
            .filter(
                Student.id == student_id,
                Student.class_id == session.class_id,
                Student.is_active == True
            )
            .first()
        )

        if not student:
            raise HTTPException(
                status_code=404,
                detail="Student not found in the active class"
            )

        existing = (
            db.query(Attendance)
            .filter(
                Attendance.session_id == session.id,
                Attendance.student_id == student.id
            )
            .first()
        )

        if existing:
            return {
                "message": "Attendance already marked in this session",
                "student": student.name,
                "roll_number": student.roll_number,
                "session_id": session.id,
                "date": str(existing.attendance_date),
                "time": str(existing.attendance_time)
            }

        # India time
        current_time = india_now().time()

        attendance = Attendance(
            session_id=session.id,
            student_id=student.id,
            attendance_date=session.session_date,
            attendance_time=current_time,
            status="Present",
            confidence=confidence
        )

        db.add(attendance)
        db.commit()
        db.refresh(attendance)

        return {
            "message": "Attendance marked successfully",
            "student": student.name,
            "roll_number": student.roll_number,
            "session_id": session.id,
            "date": str(session.session_date),
            "time": str(current_time),
            "confidence": confidence
        }

    finally:
        db.close()


# ============================================================
# FACE RECOGNITION ATTENDANCE
# ============================================================

@router.post("/recognize-frame")
async def recognize_frame(
    image: UploadFile = File(...),
    current_user: User = Depends(get_current_user)
):

    db = SessionLocal()

    try:

        session = get_active_session(
            db,
            current_user
        )

        if not session:
            raise HTTPException(
                status_code=400,
                detail=(
                    "Attendance session is not active. "
                    "Start the session first."
                )
            )

        class_id = session.class_id
        session_id = session.id
        session_date = session.session_date

    finally:
        db.close()

    # --------------------------------------------------------
    # Decode uploaded camera frame
    # --------------------------------------------------------

    contents = await image.read()

    np_array = np.frombuffer(
        contents,
        np.uint8
    )

    frame = cv2.imdecode(
        np_array,
        cv2.IMREAD_COLOR
    )

    if frame is None:
        raise HTTPException(
            status_code=400,
            detail="Could not decode image frame"
        )

    # --------------------------------------------------------
    # Load recognition models
    # --------------------------------------------------------

    detector, recognizer = get_face_models()

    students = load_student_embeddings(
        class_id
    )

    if not students:
        return {
            "recognized": False,
            "message": (
                "No active students registered "
                "in the selected class"
            )
        }

    # --------------------------------------------------------
    # Recognize face
    # --------------------------------------------------------

    result = recognize_face(
        frame,
        detector,
        recognizer,
        students
    )

    if result is None:
        return {
            "recognized": False,
            "message": "No face detected"
        }

    if result["confidence"] < RECOGNITION_THRESHOLD:
        return {
            "recognized": False,
            "message": "Face not recognized",
            "confidence": result["confidence"]
        }

    # --------------------------------------------------------
    # Save attendance
    # --------------------------------------------------------

    db = SessionLocal()

    try:

        student = (
            db.query(Student)
            .filter(
                Student.id == result["id"],
                Student.class_id == class_id,
                Student.is_active == True
            )
            .first()
        )

        if not student:
            raise HTTPException(
                status_code=404,
                detail="Student not found in the active class"
            )

        # Prevent duplicate attendance
        # only inside the same lecture/session
        existing = (
            db.query(Attendance)
            .filter(
                Attendance.session_id == session_id,
                Attendance.student_id == student.id
            )
            .first()
        )

        if existing:
            return {
                "recognized": True,
                "already_marked": True,
                "student_id": student.id,
                "name": student.name,
                "roll_number": student.roll_number,
                "confidence": result["confidence"],
                "session_id": session_id,
                "time": str(existing.attendance_time)
            }

        # India time
        current_time = india_now().time()

        attendance = Attendance(
            session_id=session_id,
            student_id=student.id,
            attendance_date=session_date,
            attendance_time=current_time,
            status="Present",
            confidence=result["confidence"]
        )

        db.add(attendance)
        db.commit()
        db.refresh(attendance)

        return {
            "recognized": True,
            "already_marked": False,
            "student_id": student.id,
            "name": student.name,
            "roll_number": student.roll_number,
            "confidence": result["confidence"],
            "session_id": session_id,
            "time": str(current_time)
        }

    finally:
        db.close()


# ============================================================
# DAILY ATTENDANCE REPORT
# ============================================================

@router.get("/report")
def attendance_report(
    report_date: date | None = None,
    assignment_id: int | None = None,
    current_user: User = Depends(get_current_user)
):

    db = SessionLocal()

    try:

        # Use India date when date not supplied
        if report_date is None:
            report_date = india_today()

        if assignment_id is None:

            assignments = (
                db.query(TeachingAssignment)
                .filter(
                    TeachingAssignment.teacher_id == current_user.id,
                    TeachingAssignment.is_active == True
                )
                .all()
            )

            if len(assignments) != 1:
                return {
                    "date": str(report_date),
                    "total_students": 0,
                    "present": 0,
                    "absent": 0,
                    "attendance_percentage": 0,
                    "students": [],
                    "requires_assignment": True,
                    "message": (
                        "Select a class and subject "
                        "to view attendance."
                    )
                }

            assignment_id = assignments[0].id

        assignment, classroom = get_assignment(
            db,
            assignment_id,
            current_user
        )

        # ----------------------------------------------------
        # Students
        # ----------------------------------------------------

        students = (
            db.query(Student)
            .filter(
                Student.class_id == classroom.id
            )
            .order_by(Student.roll_number)
            .all()
        )

        # ----------------------------------------------------
        # Sessions for selected subject/date
        # ----------------------------------------------------

        sessions = (
            db.query(AttendanceSession)
            .filter(
                AttendanceSession.assignment_id == assignment.id,
                AttendanceSession.teacher_id == current_user.id,
                AttendanceSession.session_date == report_date
            )
            .order_by(AttendanceSession.id)
            .all()
        )

        session_ids = [
            item.id
            for item in sessions
        ]

        # ----------------------------------------------------
        # Attendance records
        # ----------------------------------------------------

        records = []

        if session_ids:
            records = (
                db.query(Attendance)
                .filter(
                    Attendance.session_id.in_(session_ids)
                )
                .all()
            )

        # ----------------------------------------------------
        # Student -> attendance mapping
        # ----------------------------------------------------

        attendance_map = {}

        for record in records:
            attendance_map.setdefault(
                record.student_id,
                record
            )

        report = []
        present_count = 0

        for student in students:

            attendance = attendance_map.get(
                student.id
            )

            status = (
                "Present"
                if attendance
                else "Absent"
            )

            if attendance:
                present_count += 1

            report.append({
                "student_id": student.id,
                "class_id": student.class_id,
                "roll_number": student.roll_number,
                "name": student.name,
                "department": classroom.department,
                "division": classroom.division,
                "year": classroom.year,
                "academic_year": classroom.academic_year,
                "status": status,
                "time": (
                    str(attendance.attendance_time)
                    if attendance
                    else None
                ),
                "confidence": (
                    attendance.confidence
                    if attendance
                    else None
                )
            })

        total_students = len(students)

        absent_count = (
            total_students - present_count
        )

        percentage = (
            present_count / total_students * 100
            if total_students
            else 0
        )

        return {
            "date": str(report_date),
            "assignment_id": assignment.id,
            "subject_name": assignment.subject_name,
            "subject_code": assignment.subject_code,
            "classroom": {
                "id": classroom.id,
                "department": classroom.department,
                "division": classroom.division,
                "year": classroom.year,
                "academic_year": classroom.academic_year,
            },
            "sessions_conducted": len(sessions),
            "total_students": total_students,
            "present": present_count,
            "absent": absent_count,
            "attendance_percentage": round(
                percentage,
                2
            ),
            "students": report
        }

    finally:
        db.close()


# ============================================================
# SESSION / LECTURE HISTORY
# ============================================================

@router.get("/session-history")
def attendance_session_history(
    assignment_id: int,
    year: int | None = None,
    month: int | None = None,
    current_user: User = Depends(get_current_user)
):

    if month is not None and (
        month < 1 or month > 12
    ):
        raise HTTPException(
            status_code=400,
            detail="Month must be between 1 and 12"
        )

    if month is not None and year is None:
        raise HTTPException(
            status_code=400,
            detail="Year is required when month is provided"
        )

    db = SessionLocal()

    try:

        assignment, classroom = get_assignment(
            db,
            assignment_id,
            current_user
        )

        query = (
            db.query(AttendanceSession)
            .filter(
                AttendanceSession.assignment_id == assignment.id,
                AttendanceSession.teacher_id == current_user.id,
                AttendanceSession.status == "Completed"
            )
        )

        if year is not None and month is not None:

            start_date = date(
                year,
                month,
                1
            )

            end_date = date(
                year,
                month,
                monthrange(year, month)[1]
            )

            query = query.filter(
                AttendanceSession.session_date >= start_date,
                AttendanceSession.session_date <= end_date
            )

        elif year is not None:

            start_date = date(
                year,
                1,
                1
            )

            end_date = date(
                year,
                12,
                31
            )

            query = query.filter(
                AttendanceSession.session_date >= start_date,
                AttendanceSession.session_date <= end_date
            )

        sessions = (
            query
            .order_by(
                AttendanceSession.session_date.desc(),
                AttendanceSession.started_at.desc(),
                AttendanceSession.id.desc()
            )
            .all()
        )

        total_students = (
            db.query(Student)
            .filter(
                Student.class_id == classroom.id
            )
            .count()
        )

        session_ids = [
            session.id
            for session in sessions
        ]

        present_counts = {}

        if session_ids:

            records = (
                db.query(Attendance)
                .filter(
                    Attendance.session_id.in_(
                        session_ids
                    )
                )
                .all()
            )

            present_sets = {}

            for record in records:
                present_sets.setdefault(
                    record.session_id,
                    set()
                ).add(
                    record.student_id
                )

            present_counts = {
                session_id: len(student_ids)
                for session_id, student_ids
                in present_sets.items()
            }

        rows = []

        for session in sessions:

            present = present_counts.get(
                session.id,
                0
            )

            absent = max(
                total_students - present,
                0
            )

            percentage = (
                present / total_students * 100
                if total_students
                else 0
            )

            rows.append({
                "session_id": session.id,
                "date": str(
                    session.session_date
                ),
                "started_at": (
                    str(session.started_at)
                    if session.started_at
                    else None
                ),
                "ended_at": (
                    str(session.ended_at)
                    if session.ended_at
                    else None
                ),
                "status": session.status,
                "present": present,
                "absent": absent,
                "total_students": total_students,
                "attendance_percentage": round(
                    percentage,
                    2
                ),
            })

        return {
            "assignment_id": assignment.id,
            "subject_name": assignment.subject_name,
            "subject_code": assignment.subject_code,
            "classroom": {
                "id": classroom.id,
                "department": classroom.department,
                "division": classroom.division,
                "year": classroom.year,
                "academic_year": classroom.academic_year,
            },
            "year": year,
            "month": month,
            "total_lectures": len(sessions),
            "sessions": rows,
        }

    finally:
        db.close()


# ============================================================
# MONTHLY ATTENDANCE REPORT
# ============================================================

@router.get("/monthly-report")
def monthly_attendance_report(
    assignment_id: int,
    year: int,
    month: int,
    current_user: User = Depends(get_current_user)
):

    if month < 1 or month > 12:
        raise HTTPException(
            status_code=400,
            detail="Month must be between 1 and 12"
        )

    db = SessionLocal()

    try:

        assignment, classroom = get_assignment(
            db,
            assignment_id,
            current_user
        )

        start_date = date(
            year,
            month,
            1
        )

        end_date = date(
            year,
            month,
            monthrange(year, month)[1]
        )

        students = (
            db.query(Student)
            .filter(
                Student.class_id == classroom.id
            )
            .order_by(Student.roll_number)
            .all()
        )

        sessions = (
            db.query(AttendanceSession)
            .filter(
                AttendanceSession.assignment_id == assignment.id,
                AttendanceSession.teacher_id == current_user.id,
                AttendanceSession.session_date >= start_date,
                AttendanceSession.session_date <= end_date,
                AttendanceSession.status == "Completed"
            )
            .order_by(
                AttendanceSession.session_date,
                AttendanceSession.id
            )
            .all()
        )

        session_ids = [
            item.id
            for item in sessions
        ]

        records = []

        if session_ids:

            records = (
                db.query(Attendance)
                .filter(
                    Attendance.session_id.in_(
                        session_ids
                    )
                )
                .all()
            )

        present_by_student = {}

        for record in records:

            present_by_student.setdefault(
                record.student_id,
                set()
            ).add(
                record.session_id
            )

        total_sessions = len(sessions)

        rows = []

        for student in students:

            present_count = len(
                present_by_student.get(
                    student.id,
                    set()
                )
            )

            absent_count = max(
                total_sessions - present_count,
                0
            )

            percentage = (
                present_count / total_sessions * 100
                if total_sessions
                else 0
            )

            rows.append({
                "student_id": student.id,
                "roll_number": student.roll_number,
                "name": student.name,
                "email": student.email,
                "present": present_count,
                "absent": absent_count,
                "total_sessions": total_sessions,
                "attendance_percentage": round(
                    percentage,
                    2
                ),
            })

        return {
            "year": year,
            "month": month,
            "assignment_id": assignment.id,
            "subject_name": assignment.subject_name,
            "subject_code": assignment.subject_code,
            "classroom": {
                "id": classroom.id,
                "department": classroom.department,
                "division": classroom.division,
                "year": classroom.year,
                "academic_year": classroom.academic_year,
            },
            "total_sessions": total_sessions,
            "students": rows,
        }

    finally:
        db.close()


# ============================================================
# STUDENT ATTENDANCE HISTORY
# ============================================================

@router.get("/student-history/{student_id}")
def student_attendance_history(
    student_id: int,
    assignment_id: int,
    year: int,
    month: int,
    current_user: User = Depends(get_current_user)
):

    if month < 1 or month > 12:
        raise HTTPException(
            status_code=400,
            detail="Month must be between 1 and 12"
        )

    db = SessionLocal()

    try:

        assignment, classroom = get_assignment(
            db,
            assignment_id,
            current_user
        )

        student = (
            db.query(Student)
            .filter(
                Student.id == student_id,
                Student.class_id == classroom.id
            )
            .first()
        )

        if not student:
            raise HTTPException(
                status_code=404,
                detail=(
                    "Student not found "
                    "in the selected class"
                )
            )

        start_date = date(
            year,
            month,
            1
        )

        end_date = date(
            year,
            month,
            monthrange(year, month)[1]
        )

        sessions = (
            db.query(AttendanceSession)
            .filter(
                AttendanceSession.assignment_id == assignment.id,
                AttendanceSession.teacher_id == current_user.id,
                AttendanceSession.session_date >= start_date,
                AttendanceSession.session_date <= end_date,
                AttendanceSession.status == "Completed"
            )
            .order_by(
                AttendanceSession.session_date,
                AttendanceSession.id
            )
            .all()
        )

        session_ids = [
            item.id
            for item in sessions
        ]

        attendance_by_session = {}

        if session_ids:

            records = (
                db.query(Attendance)
                .filter(
                    Attendance.student_id == student.id,
                    Attendance.session_id.in_(
                        session_ids
                    )
                )
                .all()
            )

            attendance_by_session = {
                item.session_id: item
                for item in records
            }

        history = []
        present_count = 0

        for session in sessions:

            record = attendance_by_session.get(
                session.id
            )

            if record:
                present_count += 1

            history.append({
                "session_id": session.id,
                "date": str(
                    session.session_date
                ),
                "started_at": (
                    str(session.started_at)
                    if session.started_at
                    else None
                ),
                "ended_at": (
                    str(session.ended_at)
                    if session.ended_at
                    else None
                ),
                "status": (
                    "Present"
                    if record
                    else "Absent"
                ),
                "time": (
                    str(record.attendance_time)
                    if record
                    else None
                ),
                "confidence": (
                    record.confidence
                    if record
                    else None
                ),
            })

        total_sessions = len(sessions)

        absent_count = (
            total_sessions - present_count
        )

        percentage = (
            present_count / total_sessions * 100
            if total_sessions
            else 0
        )

        return {
            "student": {
                "id": student.id,
                "roll_number": student.roll_number,
                "name": student.name,
                "email": student.email,
            },
            "assignment_id": assignment.id,
            "subject_name": assignment.subject_name,
            "subject_code": assignment.subject_code,
            "classroom": {
                "id": classroom.id,
                "department": classroom.department,
                "division": classroom.division,
                "year": classroom.year,
                "academic_year": classroom.academic_year,
            },
            "year": year,
            "month": month,
            "total_sessions": total_sessions,
            "present": present_count,
            "absent": absent_count,
            "attendance_percentage": round(
                percentage,
                2
            ),
            "history": history,
        }

    finally:
        db.close()