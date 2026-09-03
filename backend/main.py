from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database.db import Base, engine

from models.college import College
from models.classroom import Classroom
from models.teaching_assignment import TeachingAssignment
from models.attendance_session import AttendanceSession
from models.user import User
from models.student import Student
from models.attendance import Attendance

from routes.auth import router as auth_router
from routes.student import router as student_router
from routes.attendance import router as attendance_router
from routes.workspace import router as workspace_router


app = FastAPI(
    title="Face Attendance System API",
    description="Professional Face Recognition Attendance System",
    version="1.3.0"
)

# ---------------------------------------------------------
# Create database tables
# ---------------------------------------------------------
Base.metadata.create_all(bind=engine)


# ---------------------------------------------------------
# CORS Configuration
# ---------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        # Local frontend
        "http://localhost:5173",
        "http://127.0.0.1:5173",

        # Mobile testing on same Wi-Fi
        "http://10.39.102.109:5173",

        # Deployed Vercel frontend
        "https://face-attendance-system-203qe5fd0-sujata-dhebe.vercel.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------
# API Routes
# ---------------------------------------------------------
app.include_router(
    auth_router,
    prefix="/auth",
    tags=["Authentication"]
)

app.include_router(
    workspace_router,
    prefix="/workspace",
    tags=["College Workspace"]
)

app.include_router(
    student_router,
    prefix="/students",
    tags=["Students"]
)

app.include_router(
    attendance_router,
    prefix="/attendance",
    tags=["Attendance"]
)


# ---------------------------------------------------------
# Home Route
# ---------------------------------------------------------
@app.get("/")
def home():
    return {
        "message": "Face Attendance API is running",
        "version": "1.3.0"
    }