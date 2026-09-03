from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from database.db import SessionLocal
from models.classroom import Classroom
from models.teaching_assignment import TeachingAssignment
from models.user import User
from services.auth_service import get_current_user


router = APIRouter()


class ClassroomRequest(BaseModel):
    department: str
    year: int
    division: str
    academic_year: str


class AssignmentRequest(BaseModel):
    class_id: int
    subject_name: str
    subject_code: str


def classroom_response(item: Classroom):
    return {
        "id": item.id,
        "college_id": item.college_id,
        "department": item.department,
        "year": item.year,
        "division": item.division,
        "academic_year": item.academic_year,
        "status": "Active" if item.is_active else "Inactive",
        "label": f"{item.department} - Year {item.year} - Div {item.division} ({item.academic_year})",
    }


@router.get("/classes")
def get_classes(current_user: User = Depends(get_current_user)):
    if not current_user.college_id:
        raise HTTPException(
            status_code=400,
            detail="Your teacher account is not linked to a college yet"
        )

    db = SessionLocal()
    try:
        classes = db.query(Classroom).filter(
            Classroom.college_id == current_user.college_id,
            Classroom.is_active == True
        ).order_by(
            Classroom.department,
            Classroom.year,
            Classroom.division
        ).all()

        return {
            "total_classes": len(classes),
            "classes": [classroom_response(item) for item in classes],
        }
    finally:
        db.close()


@router.post("/classes")
def create_or_get_class(
    data: ClassroomRequest,
    current_user: User = Depends(get_current_user)
):
    if not current_user.college_id:
        raise HTTPException(status_code=400, detail="Teacher has no college")

    department = data.department.strip()
    division = data.division.strip().upper()
    academic_year = data.academic_year.strip()

    if not department or not division or not academic_year:
        raise HTTPException(status_code=400, detail="All class fields are required")

    db = SessionLocal()
    try:
        existing = db.query(Classroom).filter(
            Classroom.college_id == current_user.college_id,
            Classroom.department == department,
            Classroom.year == data.year,
            Classroom.division == division,
            Classroom.academic_year == academic_year,
        ).first()

        if existing:
            return {
                "message": "Class already exists",
                "created": False,
                "classroom": classroom_response(existing),
            }

        item = Classroom(
            college_id=current_user.college_id,
            department=department,
            year=data.year,
            division=division,
            academic_year=academic_year,
            is_active=True,
        )
        db.add(item)
        db.commit()
        db.refresh(item)

        return {
            "message": "Class created successfully",
            "created": True,
            "classroom": classroom_response(item),
        }
    finally:
        db.close()


@router.get("/assignments")
def get_assignments(current_user: User = Depends(get_current_user)):
    db = SessionLocal()
    try:
        rows = (
            db.query(TeachingAssignment, Classroom)
            .join(Classroom, Classroom.id == TeachingAssignment.class_id)
            .filter(
                TeachingAssignment.teacher_id == current_user.id,
                TeachingAssignment.is_active == True,
                Classroom.college_id == current_user.college_id,
            )
            .order_by(
                Classroom.department,
                Classroom.year,
                Classroom.division,
                TeachingAssignment.subject_name,
            )
            .all()
        )

        assignments = []
        for assignment, classroom in rows:
            assignments.append({
                "id": assignment.id,
                "teacher_id": assignment.teacher_id,
                "class_id": assignment.class_id,
                "subject_name": assignment.subject_name,
                "subject_code": assignment.subject_code,
                "classroom": classroom_response(classroom),
                "label": (
                    f"{assignment.subject_name} ({assignment.subject_code}) · "
                    f"{classroom.department} Y{classroom.year} Div {classroom.division}"
                ),
            })

        return {
            "total_assignments": len(assignments),
            "assignments": assignments,
        }
    finally:
        db.close()


@router.post("/assignments")
def create_assignment(
    data: AssignmentRequest,
    current_user: User = Depends(get_current_user)
):
    db = SessionLocal()
    try:
        classroom = db.query(Classroom).filter(
            Classroom.id == data.class_id,
            Classroom.college_id == current_user.college_id,
            Classroom.is_active == True,
        ).first()

        if not classroom:
            raise HTTPException(
                status_code=404,
                detail="Class not found in your college"
            )

        subject_name = data.subject_name.strip()
        subject_code = data.subject_code.strip().upper()

        if not subject_name or not subject_code:
            raise HTTPException(
                status_code=400,
                detail="Subject name and subject code are required"
            )

        existing = db.query(TeachingAssignment).filter(
            TeachingAssignment.teacher_id == current_user.id,
            TeachingAssignment.class_id == classroom.id,
            TeachingAssignment.subject_code == subject_code,
        ).first()

        if existing:
            existing.subject_name = subject_name
            existing.is_active = True
            db.commit()
            db.refresh(existing)
            assignment = existing
            created = False
        else:
            assignment = TeachingAssignment(
                teacher_id=current_user.id,
                class_id=classroom.id,
                subject_name=subject_name,
                subject_code=subject_code,
                is_active=True,
            )
            db.add(assignment)
            db.commit()
            db.refresh(assignment)
            created = True

        return {
            "message": (
                "Teaching assignment created successfully"
                if created
                else "Teaching assignment already exists"
            ),
            "created": created,
            "assignment": {
                "id": assignment.id,
                "class_id": assignment.class_id,
                "subject_name": assignment.subject_name,
                "subject_code": assignment.subject_code,
                "classroom": classroom_response(classroom),
            },
        }
    finally:
        db.close()
