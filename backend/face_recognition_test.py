import cv2
import os


# -----------------------------
# Model paths
# -----------------------------

YUNET_MODEL = "face_models/face_detection_yunet_2023mar.onnx"
SFACE_MODEL = "face_models/face_recognition_sface_2021dec.onnx"

# Registered student's image
STUDENT_IMAGE = "uploads/25.jpg"


# -----------------------------
# Load models
# -----------------------------

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


# -----------------------------
# Check student image
# -----------------------------

if not os.path.exists(STUDENT_IMAGE):

    print("Student image not found!")
    print(STUDENT_IMAGE)
    exit()


image = cv2.imread(STUDENT_IMAGE)

if image is None:

    print("Could not read student image!")
    exit()


# -----------------------------
# Detect face
# -----------------------------

height, width = image.shape[:2]

detector.setInputSize((width, height))

_, faces = detector.detect(image)


if faces is None or len(faces) == 0:

    print("No face detected in student image!")
    exit()


print("Face detected in student image!")


# -----------------------------
# Get first detected face
# -----------------------------

face = faces[0]

# Align face
aligned_face = recognizer.alignCrop(
    image,
    face
)


# Extract face feature
feature = recognizer.feature(
    aligned_face
)


print("Face feature generated successfully!")

print("Feature shape:", feature.shape)

print("Face recognition test completed!")