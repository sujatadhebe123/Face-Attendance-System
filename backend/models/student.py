from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, UniqueConstraint
from database.db import Base


class Student(Base):
    __tablename__ = "students"

    __table_args__ = (
        UniqueConstraint(
            "class_id",
            "roll_number",
            name="uq_students_class_roll_number"
        ),
        UniqueConstraint(
            "class_id",
            "email",
            name="uq_students_class_email"
        ),
    )

    id = Column(Integer, primary_key=True, index=True)

    # Kept only as the teacher who originally registered the record.
    # Student visibility is NO LONGER based on this field.
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    class_id = Column(Integer, ForeignKey("classrooms.id"), nullable=False, index=True)

    roll_number = Column(String, nullable=False)
    name = Column(String, nullable=False)
    email = Column(String, nullable=False)
    department = Column(String)
    division = Column(String)
    year = Column(Integer)
    academic_year = Column(String(20))
    image_path = Column(String)
    face_embedding = Column(String)
    is_active = Column(Boolean, default=True, nullable=False)
