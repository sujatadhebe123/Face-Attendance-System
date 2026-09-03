import os
import json

from database.db import SessionLocal
from models.student import Student
from services.face_service import generate_face_embedding


db = SessionLocal()


try:

    students = db.query(Student).filter(
        Student.face_embedding == None
    ).all()

    print(f"Students without embeddings: {len(students)}")


    for student in students:

        print(
            f"\nProcessing: "
            f"{student.roll_number} - {student.name}"
        )


        if not student.image_path:

            print("❌ No image path")
            continue


        if not os.path.exists(student.image_path):

            print(
                f"❌ Image not found: "
                f"{student.image_path}"
            )
            continue


        try:

            embedding = generate_face_embedding(
                student.image_path
            )


            student.face_embedding = json.dumps(
                embedding
            )


            db.commit()


            print(
                "✅ Face embedding generated "
                "and saved"
            )


        except Exception as e:

            db.rollback()

            print(
                f"❌ Failed: {e}"
            )


finally:

    db.close()


print("\nFinished.")