from sqlalchemy import Column, Integer, String, Date, Time, Float, ForeignKey, UniqueConstraint
from database.db import Base


class Attendance(Base):
    __tablename__ = "attendance"

    __table_args__ = (
        UniqueConstraint(
            "session_id",
            "student_id",
            name="uq_attendance_session_student"
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("students.id"), nullable=False, index=True)

    # New: tells us exactly which teacher/class/subject session this mark belongs to.
    session_id = Column(
        Integer,
        ForeignKey("attendance_sessions.id"),
        nullable=True,
        index=True
    )

    attendance_date = Column(Date, nullable=False)
    attendance_time = Column(Time, nullable=False)
    status = Column(String(20), default="Present")
    confidence = Column(Float)
