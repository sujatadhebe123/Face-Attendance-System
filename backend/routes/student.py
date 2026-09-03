from fastapi import APIRouter, File, Form, UploadFile, HTTPException, Depends

from database.db import SessionLocal
from models.student import Student
from models.classroom import Classroom
from models.user import User
from services.face_service import generate_face_embedding
from services.auth_service import get_current_user

import os
import shutil
import json


router = APIRouter()


def get_teacher_class(db, class_id, current_user):
    classroom = db.query(Classroom).filter(
        Classroom.id == class_id,
        Classroom.college_id == current_user.college_id,
        Classroom.is_active == True
    ).first()

    if not classroom:
        raise HTTPException(
            status_code=404,
            detail="Class not found in your college"
        )
    return classroom


def student_json(student):
    return {
        "id": student.id,
        "class_id": student.class_id,
        "roll_number": student.roll_number,
        "name": student.name,
        "email": student.email,
        "department": student.department,
        "division": student.division,
        "year": student.year,
        "academic_year": student.academic_year,
        "status": "Active" if student.is_active else "Inactive",
        "image_path": student.image_path
    }


@router.post("/register")
async def register_student(
    class_id: int = Form(...),
    roll_number: str = Form(...),
    name: str = Form(...),
    email: str = Form(...),
    image: UploadFile = File(...),
    current_user: User = Depends(get_current_user)
):
    db = SessionLocal()
    file_path = None

    try:
        classroom = get_teacher_class(db, class_id, current_user)

        roll_number = roll_number.strip()
        email = email.strip().lower()
        name = name.strip()

        existing_roll = db.query(Student).filter(
            Student.class_id == class_id,
            Student.roll_number == roll_number
        ).first()

        if existing_roll:
            raise HTTPException(
                status_code=400,
                detail="Roll number already registered in this class"
            )

        existing_email = db.query(Student).filter(
            Student.class_id == class_id,
            Student.email == email
        ).first()

        if existing_email:
            raise HTTPException(
                status_code=400,
                detail="Student already registered in this class"
            )

        extension = os.path.splitext(image.filename)[1].lower()
        if extension not in [".jpg", ".jpeg", ".png"]:
            raise HTTPException(
                status_code=400,
                detail="Only JPG, JPEG and PNG images are allowed"
            )

        # Shared class folder, not teacher folder.
        upload_dir = os.path.join("uploads", f"class_{class_id}")
        os.makedirs(upload_dir, exist_ok=True)

        filename = f"{roll_number}{extension}"
        file_path = os.path.join(upload_dir, filename)

        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(image.file, buffer)

        try:
            embedding = generate_face_embedding(file_path)
        except ValueError as exc:
            if os.path.exists(file_path):
                os.remove(file_path)
            raise HTTPException(status_code=400, detail=str(exc))

        new_student = Student(
            user_id=current_user.id,  # registrar only
            class_id=classroom.id,
            roll_number=roll_number,
            name=name,
            email=email,
            department=classroom.department,
            division=classroom.division,
            year=classroom.year,
            academic_year=classroom.academic_year,
            image_path=file_path,
            face_embedding=json.dumps(embedding),
            is_active=True
        )

        db.add(new_student)
        db.commit()
        db.refresh(new_student)

        result = student_json(new_student)
        result.update({
            "message": "Student registered successfully in shared class",
            "student_id": new_student.id,
            "face_embedding": "Generated successfully"
        })
        return result

    except HTTPException:
        raise
    except Exception as exc:
        db.rollback()
        if file_path and os.path.exists(file_path):
            try:
                os.remove(file_path)
            except OSError:
                pass
        raise HTTPException(status_code=500, detail=str(exc))
    finally:
        db.close()


@router.get("/")
def get_students(
    class_id: int | None = None,
    current_user: User = Depends(get_current_user)
):
    db = SessionLocal()
    try:
        query = db.query(Student).join(
            Classroom, Classroom.id == Student.class_id
        ).filter(
            Classroom.college_id == current_user.college_id
        )

        if class_id is not None:
            get_teacher_class(db, class_id, current_user)
            query = query.filter(Student.class_id == class_id)

        students = query.order_by(
            Student.class_id,
            Student.roll_number
        ).all()

        return {
            "total_students": len(students),
            "students": [student_json(student) for student in students]
        }
    finally:
        db.close()


@router.get("/{student_id}")
def get_student(
    student_id: int,
    current_user: User = Depends(get_current_user)
):
    db = SessionLocal()
    try:
        student = db.query(Student).join(
            Classroom, Classroom.id == Student.class_id
        ).filter(
            Student.id == student_id,
            Classroom.college_id == current_user.college_id
        ).first()

        if not student:
            raise HTTPException(status_code=404, detail="Student not found")

        return student_json(student)
    finally:
        db.close()


@router.patch("/{student_id}/status")
def update_student_status(
    student_id: int,
    is_active: bool,
    current_user: User = Depends(get_current_user)
):
    db = SessionLocal()
    try:
        student = db.query(Student).join(
            Classroom, Classroom.id == Student.class_id
        ).filter(
            Student.id == student_id,
            Classroom.college_id == current_user.college_id
        ).first()

        if not student:
            raise HTTPException(status_code=404, detail="Student not found")

        student.is_active = is_active
        db.commit()
        db.refresh(student)

        return {
            "message": "Student activated" if is_active else "Student deactivated",
            "student_id": student.id,
            "name": student.name,
            "status": "Active" if student.is_active else "Inactive"
        }
    finally:
        db.close()


@router.put("/{student_id}")
def update_student(
    student_id: int,
    name: str = Form(...),
    email: str = Form(...),
    current_user: User = Depends(get_current_user)
):
    db = SessionLocal()
    try:
        student = db.query(Student).join(
            Classroom, Classroom.id == Student.class_id
        ).filter(
            Student.id == student_id,
            Classroom.college_id == current_user.college_id
        ).first()

        if not student:
            raise HTTPException(status_code=404, detail="Student not found")

        email = email.strip().lower()

        existing_email = db.query(Student).filter(
            Student.class_id == student.class_id,
            Student.email == email,
            Student.id != student_id
        ).first()

        if existing_email:
            raise HTTPException(
                status_code=400,
                detail="Email already registered in this class"
            )

        student.name = name.strip()
        student.email = email

        db.commit()
        db.refresh(student)

        result = student_json(student)
        result["message"] = "Student updated successfully"
        return result
    finally:
        db.close()
