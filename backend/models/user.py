from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.sql import func

from database.db import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(120), nullable=False)
    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String, nullable=False)

    # Kept for display/backward compatibility.
    college_name = Column(String(255), nullable=False)

    # New shared-college identity.
    college_id = Column(
        Integer,
        ForeignKey("colleges.id"),
        nullable=True,
        index=True
    )

    department = Column(String(120), nullable=True)
    role = Column(String(30), nullable=False, default="Teacher")

    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False
    )
