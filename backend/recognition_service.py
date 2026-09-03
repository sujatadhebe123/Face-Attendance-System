import cv2
import json
import numpy as np

from database.db import SessionLocal
from models.student import Student


YUNET_MODEL = "face_models/face_detection_yunet_2023mar.onnx"
SFACE_MODEL = "face_models/face_recognition_sface_2021dec.onnx"


def load_models():
    detector = cv2.FaceDetectorYN.create(
        YUNET_MODEL, "", (320, 320)
    )
    recognizer = cv2.FaceRecognizerSF.create(
        SFACE_MODEL, ""
    )
    return detector, recognizer


def load_student_embeddings(class_id: int):
    """Load active students from the selected shared class."""
    db = SessionLocal()
    try:
        students = db.query(Student).filter(
            Student.class_id == class_id,
            Student.face_embedding.isnot(None),
            Student.is_active == True
        ).all()

        registered_students = []

        for student in students:
            try:
                embedding = np.array(
                    json.loads(student.face_embedding),
                    dtype=np.float32
                )

                registered_students.append({
                    "id": student.id,
                    "roll_number": student.roll_number,
                    "name": student.name,
                    "embedding": embedding
                })
            except Exception:
                print(f"Skipping {student.name}: invalid embedding")

        return registered_students
    finally:
        db.close()


def recognize_face(face_image, detector, recognizer, students):
    height, width = face_image.shape[:2]
    detector.setInputSize((width, height))
    _, faces = detector.detect(face_image)

    if faces is None:
        return None

    best_match = None
    best_score = -1

    for face in faces:
        aligned_face = recognizer.alignCrop(face_image, face)
        feature = recognizer.feature(aligned_face)

        for student in students:
            score = recognizer.match(
                feature,
                student["embedding"],
                cv2.FaceRecognizerSF_FR_COSINE
            )

            if score > best_score:
                best_score = score
                best_match = {
                    "id": student["id"],
                    "roll_number": student["roll_number"],
                    "name": student["name"],
                    "confidence": float(score)
                }

    return best_match
