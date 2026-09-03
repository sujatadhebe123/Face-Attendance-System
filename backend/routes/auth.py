from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from database.db import SessionLocal
from models.college import College
from models.user import User
from services.auth_service import (
    create_access_token,
    get_current_user,
    hash_password,
    verify_password,
)


router = APIRouter()


class RegisterRequest(BaseModel):
    name: str
    email: str
    password: str
    college_name: str
    department: str | None = None


class LoginRequest(BaseModel):
    email: str
    password: str


def normalize_college_name(value: str):
    return " ".join(value.strip().lower().split())


def user_response(user: User):
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "college_id": user.college_id,
        "college_name": user.college_name,
        "department": user.department,
        "role": user.role,
    }


@router.post("/register")
def register_teacher(data: RegisterRequest):
    db = SessionLocal()

    try:
        email = data.email.strip().lower()
        name = data.name.strip()
        college_name = " ".join(data.college_name.strip().split())
        department = data.department.strip() if data.department else None

        if not name:
            raise HTTPException(status_code=400, detail="Name is required")

        if not college_name:
            raise HTTPException(status_code=400, detail="College name is required")

        existing_user = db.query(User).filter(User.email == email).first()
        if existing_user:
            raise HTTPException(
                status_code=400,
                detail="An account with this email already exists"
            )

        normalized = normalize_college_name(college_name)

        college = db.query(College).filter(
            College.normalized_name == normalized
        ).first()

        if not college:
            college = College(
                name=college_name,
                normalized_name=normalized
            )
            db.add(college)
            db.flush()

        try:
            password_hash = hash_password(data.password)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))

        user = User(
            name=name,
            email=email,
            password_hash=password_hash,
            college_name=college.name,
            college_id=college.id,
            department=department,
            role="Teacher",
        )

        db.add(user)
        db.commit()
        db.refresh(user)

        token = create_access_token(user.id)

        return {
            "message": "Teacher account created successfully",
            "access_token": token,
            "token_type": "bearer",
            "user": user_response(user),
        }

    except HTTPException:
        raise
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(exc))
    finally:
        db.close()


@router.post("/login")
def login_teacher(data: LoginRequest):
    db = SessionLocal()
    try:
        email = data.email.strip().lower()
        user = db.query(User).filter(User.email == email).first()

        if not user or not verify_password(data.password, user.password_hash):
            raise HTTPException(status_code=401, detail="Invalid email or password")

        token = create_access_token(user.id)

        return {
            "message": "Login successful",
            "access_token": token,
            "token_type": "bearer",
            "user": user_response(user),
        }
    finally:
        db.close()


@router.get("/me")
def get_my_profile(current_user: User = Depends(get_current_user)):
    return {"user": user_response(current_user)}
