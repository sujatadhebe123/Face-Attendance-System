import cv2
import os


YUNET_MODEL = "face_models/face_detection_yunet_2023mar.onnx"
SFACE_MODEL = "face_models/face_recognition_sface_2021dec.onnx"

STUDENT_IMAGE = "uploads/25.jpg"


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
        print("Student image not found:", image_path)
        return None

    image = cv2.imread(image_path)

    if image is None:
        print("Could not read student image!")
        return None

    height, width = image.shape[:2]

    detector.setInputSize((width, height))

    _, faces = detector.detect(image)

    if faces is None or len(faces) == 0:
        print("No face detected in student image!")
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


print("Loading registered student...")

registered_feature = get_face_feature(
    STUDENT_IMAGE
)

if registered_feature is None:
    print("Could not create registered face feature.")
    exit()


print("Registered face feature created successfully!")
print()
print("Live face recognition started.")
print("Look at the camera.")
print("Press Q to exit.")
print()


camera = cv2.VideoCapture(0)

if not camera.isOpened():
    print("Camera could not be opened!")
    exit()


while True:

    success, frame = camera.read()

    if not success:
        print("Could not read camera frame!")
        break

    height, width = frame.shape[:2]

    detector.setInputSize(
        (width, height)
    )

    _, faces = detector.detect(frame)

    if faces is not None:

        for face in faces:

            x, y, w, h = face[:4].astype(int)

            aligned_face = recognizer.alignCrop(
                frame,
                face
            )

            live_feature = recognizer.feature(
                aligned_face
            )

            similarity = recognizer.match(
                registered_feature,
                live_feature,
                cv2.FaceRecognizerSF_FR_COSINE
            )

            if similarity >= 0.363:

                cv2.rectangle(
                    frame,
                    (x, y),
                    (x + w, y + h),
                    (0, 255, 0),
                    2
                )

                cv2.putText(
                    frame,
                    "MATCH",
                    (x, y - 35),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.8,
                    (0, 255, 0),
                    2
                )

                cv2.putText(
                    frame,
                    "Snehal GLabade - Roll No: 25",
                    (x, y - 10),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.6,
                    (0, 255, 0),
                    2
                )

            else:

                cv2.rectangle(
                    frame,
                    (x, y),
                    (x + w, y + h),
                    (0, 0, 255),
                    2
                )

                cv2.putText(
                    frame,
                    "UNKNOWN",
                    (x, y - 10),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.8,
                    (0, 0, 255),
                    2
                )

    cv2.imshow(
        "Face Attendance - Live Recognition",
        frame
    )

    if cv2.waitKey(1) & 0xFF == ord("q"):
        break


camera.release()
cv2.destroyAllWindows()