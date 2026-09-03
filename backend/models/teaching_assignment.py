from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, UniqueConstraint
from database.db import Base


class TeachingAssignment(Base):
    __tablename__ = "teaching_assignments"

    __table_args__ = (
        UniqueConstraint(
            "teacher_id",
            "class_id",
            "subject_code",
            name="uq_teacher_class_subject"
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    teacher_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    class_id = Column(Integer, ForeignKey("classrooms.id"), nullable=False, index=True)
    subject_name = Column(String(160), nullable=False)
    subject_code = Column(String(60), nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
