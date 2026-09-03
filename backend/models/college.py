from sqlalchemy import Column, Integer, String
from database.db import Base


class College(Base):
    __tablename__ = "colleges"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    normalized_name = Column(String(255), unique=True, nullable=False, index=True)
