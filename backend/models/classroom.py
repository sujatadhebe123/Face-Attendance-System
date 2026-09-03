from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, UniqueConstraint
from database.db import Base


class Classroom(Base):
    __tablename__ = "classrooms"

    __table_args__ = (
        UniqueConstraint(
            "college_id",
            "department",
            "year",
            "division",
            "academic_year",
            name="uq_classroom_identity"
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    college_id = Column(Integer, ForeignKey("colleges.id"), nullable=False, index=True)
    department = Column(String(120), nullable=False)
    year = Column(Integer, nullable=False)
    division = Column(String(30), nullable=False)
    academic_year = Column(String(20), nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
