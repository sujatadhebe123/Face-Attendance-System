import cv2
import numpy as np


YUNET_MODEL = "face_models/face_detection_yunet_2023mar.onnx"
SFACE_MODEL = "face_models/face_recognition_sface_2021dec.onnx"


def load_face_models():

    detector = cv2.FaceDetectorYN.create(
        YUNET_MODEL,
        "",
        (320, 320)
    )

    recognizer = cv2.FaceRecognizerSF.create(
        SFACE_MODEL,
        ""
    )

    return detector, recognizer


def generate_face_embedding(image_path):

    detector, recognizer = load_face_models()

    image = cv2.imread(image_path)

    if image is None:
        raise ValueError("Unable to read image")


    height, width = image.shape[:2]

    detector.setInputSize((width, height))


    _, faces = detector.detect(image)


    if faces is None:
        raise ValueError("No face detected in image")


    if len(faces) != 1:
        raise ValueError(
            "Image must contain exactly one face"
        )


    face = faces[0]


    aligned_face = recognizer.alignCrop(
        image,
        face
    )


    feature = recognizer.feature(
        aligned_face
    )


    feature = feature.flatten()


    return feature.tolist()