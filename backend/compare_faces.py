import cv2
import os


YUNET_MODEL = "face_models/face_detection_yunet_2023mar.onnx"
SFACE_MODEL = "face_models/face_recognition_sface_2021dec.onnx"

IMAGE_1 = "uploads/25.jpg"
IMAGE_2 = "uploads/test.jpg"


# Load models

detector = cv2.FaceDetectorYN.create(
    YUNET_MODEL,
    "",
    (320, 320),
    0.9,
    0.3,
    5000
)

recognizer = cv2.FaceRecognizerSF.create(
    SFACE_MODEL,
    ""
)


def get_face_feature(image_path):

    if not os.path.exists(image_path):
        print("Image not found:", image_path)
        return None

    image = cv2.imread(image_path)

    if image is None:
        print("Could not read:", image_path)
        return None

    height, width = image.shape[:2]

    detector.setInputSize((width, height))

    _, faces = detector.detect(image)

    if faces is None or len(faces) == 0:
        print("No face detected:", image_path)
        return None

    face = faces[0]

    aligned_face = recognizer.alignCrop(
        image,
        face
    )

    feature = recognizer.feature(
        aligned_face
    )

    return feature


print("Processing registered student image...")

feature1 = get_face_feature(IMAGE_1)


print("Processing test image...")

feature2 = get_face_feature(IMAGE_2)


if feature1 is None or feature2 is None:
    print("Face comparison could not be performed.")
    exit()


# Compare faces

similarity = recognizer.match(
    feature1,
    feature2,
    cv2.FaceRecognizerSF_FR_COSINE
)


print()
print("Similarity Score:", similarity)


if similarity >= 0.363:

    print("MATCH")
    print("Same person detected.")

else:

    print("NO MATCH")
    print("Different person detected.")