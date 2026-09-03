import cv2

from services.recognition_service import (
    load_models,
    load_student_embeddings,
    recognize_face
)


print("Loading face recognition models...")

detector, recognizer = load_models()


print("Loading registered students...")

students = load_student_embeddings()


print(
    f"Registered students with embeddings: "
    f"{len(students)}"
)


for student in students:

    print(
        f"- {student['roll_number']} "
        f"| {student['name']}"
    )


print("\nStarting camera...")


camera = cv2.VideoCapture(0)


if not camera.isOpened():

    print("❌ Cannot open camera")

    exit()


while True:

    ret, frame = camera.read()

    if not ret:

        print("❌ Cannot read camera")

        break


    result = recognize_face(
        frame,
        detector,
        recognizer,
        students
    )


    if result:

        # Recognition threshold
        if result["confidence"] >= 0.40:

            text = (
                f"{result['name']} | "
                f"Roll: {result['roll_number']} | "
                f"Score: {result['confidence']:.2f}"
            )

        else:

            text = "Unknown face"


        cv2.putText(
            frame,
            text,
            (20, 40),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.7,
            (0, 255, 0),
            2
        )


    else:

        cv2.putText(
            frame,
            "No face detected",
            (20, 40),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.7,
            (0, 0, 255),
            2
        )


    cv2.imshow(
        "Multi Student Face Recognition",
        frame
    )


    key = cv2.waitKey(1) & 0xFF


    if key == ord("q"):

        break


camera.release()

cv2.destroyAllWindows()