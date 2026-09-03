import cv2


MODEL_PATH = "face_models/face_detection_yunet_2023mar.onnx"


# Create YuNet face detector
detector = cv2.FaceDetectorYN.create(
    MODEL_PATH,
    "",
    (320, 320),
    0.9,
    0.3,
    5000
)


camera = cv2.VideoCapture(0)

if not camera.isOpened():
    print("Camera could not be opened!")
    exit()


print("Face detection started.")
print("Press Q to exit.")


while True:

    success, frame = camera.read()

    if not success:
        print("Could not read camera frame!")
        break

    # Get frame dimensions
    height, width = frame.shape[:2]

    # Tell detector current image size
    detector.setInputSize((width, height))

    # Detect faces
    _, faces = detector.detect(frame)

    if faces is not None:

        for face in faces:

            x, y, w, h = face[:4].astype(int)

            cv2.rectangle(
                frame,
                (x, y),
                (x + w, y + h),
                (0, 255, 0),
                2
            )

            cv2.putText(
                frame,
                "Face Detected",
                (x, y - 10),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.8,
                (0, 255, 0),
                2
            )

    cv2.imshow(
        "Face Attendance - Face Detection",
        frame
    )

    if cv2.waitKey(1) & 0xFF == ord("q"):
        break


camera.release()
cv2.destroyAllWindows()