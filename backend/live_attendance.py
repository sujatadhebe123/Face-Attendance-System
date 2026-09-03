import cv2
import requests

from services.recognition_service import (
    load_models,
    load_student_embeddings,
    recognize_face
)


# =========================================================
# API URLs
# =========================================================

START_API = "http://127.0.0.1:8000/attendance/start"

STATUS_API = "http://127.0.0.1:8000/attendance/session-status"

END_API = "http://127.0.0.1:8000/attendance/end"

ATTENDANCE_API = "http://127.0.0.1:8000/attendance/mark"


# =========================================================
# START ATTENDANCE SESSION
# =========================================================

print("Starting attendance session...")

try:

    response = requests.post(
        START_API,
        timeout=5
    )

    if response.status_code != 200:

        print("❌ Could not start attendance session")

        print(response.text)

        exit()

    print("\nAttendance session started successfully!")

    print(response.json())

except requests.RequestException as e:

    print("\n❌ Cannot connect to FastAPI")

    print(e)

    exit()


# =========================================================
# LOAD FACE RECOGNITION MODELS
# =========================================================

print("\nLoading face recognition models...")

detector, recognizer = load_models()


# =========================================================
# LOAD REGISTERED STUDENTS
# =========================================================

print("\nLoading registered students...")

students = load_student_embeddings()


print(
    f"Registered students: {len(students)}"
)


for student in students:

    print(
        f"- {student['roll_number']} | "
        f"{student['name']}"
    )


# =========================================================
# START CAMERA
# =========================================================

print("\nStarting camera...")

print("Students can now come one by one.")

print("Press Q to end attendance.")


camera = cv2.VideoCapture(0)


if not camera.isOpened():

    print("❌ Cannot open camera")

    # End session if camera fails
    try:

        requests.post(
            END_API,
            timeout=5
        )

    except:

        pass

    exit()


# =========================================================
# VARIABLES
# =========================================================

last_marked_student = None


# =========================================================
# LIVE ATTENDANCE LOOP
# =========================================================

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


    display_text = "No face detected"


    if result:

        confidence = result["confidence"]


        # Recognition threshold
        if confidence >= 0.50:

            student_id = result["id"]

            name = result["name"]

            roll_number = result["roll_number"]


            display_text = (
                f"{name} | Roll: {roll_number} | "
                f"Score: {confidence:.2f}"
            )


            # =================================================
            # MARK ATTENDANCE
            # =================================================

            if student_id != last_marked_student:

                try:

                    response = requests.post(
                        ATTENDANCE_API,

                        params={
                            "student_id": student_id,
                            "confidence": confidence
                        },

                        timeout=5
                    )


                    if response.status_code == 200:

                        data = response.json()


                        print("\nAttendance response:")

                        print(data)


                        # Update last recognized student
                        last_marked_student = student_id


                    else:

                        print(
                            "\n❌ Attendance API error:"
                        )

                        print(
                            response.status_code,
                            response.text
                        )


                except requests.RequestException as e:

                    print(
                        "\n❌ Cannot connect to "
                        "attendance API:"
                    )

                    print(e)


        else:

            display_text = "Unknown face"


    # =========================================================
    # DISPLAY RESULT ON CAMERA
    # =========================================================

    cv2.putText(
        frame,

        display_text,

        (20, 40),

        cv2.FONT_HERSHEY_SIMPLEX,

        0.7,

        (0, 255, 0),

        2
    )


    cv2.imshow(
        "Live Face Attendance",
        frame
    )


    key = cv2.waitKey(1) & 0xFF


    # =========================================================
    # END ATTENDANCE
    # =========================================================

    if key == ord("q"):

        print("\nEnding attendance session...")

        break


# =========================================================
# CLOSE CAMERA
# =========================================================

camera.release()

cv2.destroyAllWindows()


# =========================================================
# END SESSION API
# =========================================================

try:

    response = requests.post(
        END_API,
        timeout=5
    )


    if response.status_code == 200:

        print("\nAttendance session ended successfully!")

        print(response.json())


    else:

        print("\n❌ Could not end attendance session")

        print(response.text)


except requests.RequestException as e:

    print(
        "\n❌ Cannot connect to attendance API "
        "while ending session:"
    )

    print(e)