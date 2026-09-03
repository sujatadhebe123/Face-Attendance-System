import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowRight,
  Bell,
  CalendarDays,
  Camera,
  CheckCircle2,
  ChevronDown,
  Clock3,
  FileBarChart2,
  LayoutDashboard,
  Menu,
  MoreHorizontal,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  UserPlus,
  Users,
  UserRound,
  X,
  XCircle,
} from "lucide-react";
import "./App.css";

const API_BASE =
  import.meta.env.VITE_API_BASE_URL ||
  "https://face-attendance-system-1-zn1k.onrender.com";

function apiFetch(url, options = {}) {
  const token = localStorage.getItem("faceattend_token");

  const headers = new Headers(options.headers || {});

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  return fetch(url, {
    ...options,
    headers,
  });
}

const menuItems = [
  { name: "Dashboard", icon: LayoutDashboard },
  { name: "Live Attendance", icon: Camera },
  { name: "Students", icon: Users },
  { name: "Attendance", icon: CheckCircle2 },
  { name: "Reports", icon: FileBarChart2 },
  { name: "Analytics", icon: Activity },
];

function getToday() {
  const d = new Date();
  const offset = d.getTimezoneOffset();
  return new Date(d.getTime() - offset * 60000).toISOString().slice(0, 10);
}

function formatDate(value) {
  if (!value) return "—";
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-IN", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function formatTime(value) {
  if (!value) return "—";
  return value.split(".")[0].slice(0, 5);
}

function formatSessionTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function App() {
  const [activePage, setActivePage] = useState("Dashboard");
  const [reportDate, setReportDate] = useState(getToday());
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sessionActive, setSessionActive] = useState(false);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [showRegister, setShowRegister] = useState(false);
  const [search, setSearch] = useState("");
  const [studentsRefreshKey, setStudentsRefreshKey] = useState(0);
  const [classes, setClasses] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [selectedAssignmentId, setSelectedAssignmentId] = useState("");
  const [reportMode, setReportMode] = useState("subject");
  const [workspaceError, setWorkspaceError] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const saved = localStorage.getItem("faceattend_user");
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [authToken, setAuthToken] = useState(
    () => localStorage.getItem("faceattend_token") || ""
  );

  function handleAuthenticated(user, token) {
    localStorage.setItem("faceattend_token", token);
    localStorage.setItem("faceattend_user", JSON.stringify(user));

    // Clear any data left in memory from the previously logged-in teacher.
    setReport(null);
    setError("");
    setSessionActive(false);
    setShowRegister(false);
    setSearch("");
    setReportDate(getToday());

    setAuthToken(token);
    setCurrentUser(user);
    setActivePage("Dashboard");
    setMobileMenuOpen(false);
  }

  function handleLogout() {
    localStorage.removeItem("faceattend_token");
    localStorage.removeItem("faceattend_user");

    // Remove previous teacher data immediately before showing login page.
    setReport(null);
    setError("");
    setSessionActive(false);
    setShowRegister(false);
    setSearch("");
    setReportDate(getToday());

    setAuthToken("");
    setCurrentUser(null);
    setActivePage("Dashboard");
    setMobileMenuOpen(false);
  }

  async function loadWorkspace() {
    setWorkspaceError("");

    try {
      const [classesResponse, assignmentsResponse] = await Promise.all([
        apiFetch(`${API_BASE}/workspace/classes`),
        apiFetch(`${API_BASE}/workspace/assignments`),
      ]);

      const classesData = await classesResponse.json();
      const assignmentsData = await assignmentsResponse.json();

      if (!classesResponse.ok) {
        throw new Error(classesData.detail || "Could not load classes.");
      }

      if (!assignmentsResponse.ok) {
        throw new Error(assignmentsData.detail || "Could not load subjects.");
      }

      const nextClasses = Array.isArray(classesData)
        ? classesData
        : classesData.classes || [];
      const nextAssignments = Array.isArray(assignmentsData)
        ? assignmentsData
        : assignmentsData.assignments || [];

      setClasses(nextClasses);
      setAssignments(nextAssignments);

      setSelectedAssignmentId((current) => {
        if (
          current &&
          nextAssignments.some((item) => String(item.id) === String(current))
        ) {
          return current;
        }

        return nextAssignments.length ? String(nextAssignments[0].id) : "";
      });
    } catch (err) {
      setWorkspaceError(err.message || "Could not load class and subject workspace.");
    }
  }

  async function loadReport(date = reportDate) {
    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams({ report_date: date });

      if (reportMode === "subject" && selectedAssignmentId) {
        params.set("assignment_id", selectedAssignmentId);
      }

      const response = await apiFetch(
        `${API_BASE}/attendance/report?${params.toString()}`
      );

      if (!response.ok) {
        throw new Error(`Report request failed (${response.status})`);
      }

      const data = await response.json();
      setReport(data);
    } catch (err) {
      setError(
        "Cannot connect to FastAPI. Make sure uvicorn is running on port 8000."
      );
    } finally {
      setLoading(false);
    }
  }

  async function loadSessionStatus() {
    try {
      const response = await apiFetch(`${API_BASE}/attendance/session-status`);
      if (response.ok) {
        const data = await response.json();
        setSessionActive(Boolean(data.active));
      }
    } catch {
      // The report error already explains the API connection problem.
    }
  }

  useEffect(() => {
    // Reload dashboard/session whenever the date OR logged-in teacher changes.
    // This prevents Teacher B from temporarily seeing Teacher A's old data.
    if (!currentUser || !authToken) {
      setReport(null);
      setSessionActive(false);
      setLoading(false);
      return;
    }

    loadWorkspace();
    loadSessionStatus();
  }, [currentUser?.id, authToken]);

  useEffect(() => {
    if (!currentUser || !authToken) return;
    loadReport(reportDate);
  }, [reportDate, currentUser?.id, authToken, selectedAssignmentId, reportMode]);

  async function toggleAttendance() {
    setSessionLoading(true);
    setError("");

    try {
      if (!sessionActive && reportMode === "historical") {
        throw new Error(
          "Historical Attendance is view-only. Switch to Subject Report to start a new session."
        );
      }

      if (!sessionActive && !selectedAssignmentId) {
        throw new Error("Select a class and subject before starting attendance.");
      }

      const endpoint = sessionActive
        ? `${API_BASE}/attendance/end`
        : `${API_BASE}/attendance/start?assignment_id=${selectedAssignmentId}`;

      const response = await apiFetch(endpoint, { method: "POST" });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || data.message || "Request failed");
      }

      setSessionActive(Boolean(!sessionActive));
      await loadReport(reportDate);
    } catch (err) {
      setError(err.message || "Could not update attendance session.");
    } finally {
      setSessionLoading(false);
    }
  }

  function navigateTo(page) {
    setActivePage(page);
    setMobileMenuOpen(false);
  }

  const students = report?.students ?? [];

  const filteredStudents = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return students;

    return students.filter((student) =>
      [
        student.name,
        student.roll_number,
        student.department,
        student.division,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    );
  }, [students, search]);

  const presentStudents = useMemo(
    () => students.filter((student) => student.status === "Present"),
    [students]
  );

  if (!currentUser || !authToken) {
    return <AuthPage onAuthenticated={handleAuthenticated} />;
  }

  const userInitial = currentUser.name?.charAt(0)?.toUpperCase() || "T";

  return (
    <div className="app-shell">
      {mobileMenuOpen && (
        <button
          type="button"
          className="mobile-nav-backdrop"
          aria-label="Close navigation menu"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      <aside className={`sidebar ${mobileMenuOpen ? "mobile-open" : ""}`}>
        <div className="brand">
          <button
            type="button"
            className="mobile-sidebar-close"
            aria-label="Close navigation menu"
            onClick={() => setMobileMenuOpen(false)}
          >
            <X size={20} />
          </button>
          <div className="brand-mark">
            <Sparkles size={19} strokeWidth={2.4} />
          </div>
          <div>
            <h1>FaceAttend</h1>
            <p>AI Attendance System</p>
          </div>
        </div>

        <div className="menu-title">WORKSPACE</div>

        <nav className="side-nav">
          {menuItems.map(({ name, icon: Icon }) => (
            <button
              key={name}
              className={`side-link ${activePage === name ? "active" : ""}`}
              onClick={() => navigateTo(name)}
            >
              <Icon size={18} />
              <span>{name}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-spacer" />

        <button
          className={`side-link ${activePage === "Settings" ? "active" : ""}`}
          onClick={() => navigateTo("Settings")}
        >
          <Settings size={18} />
          <span>Settings</span>
        </button>

        <div className="admin-card">
          <div className="admin-avatar">{userInitial}</div>
          <div>
            <strong>{currentUser.name}</strong>
            <span>{currentUser.role || "Teacher"}</span>
          </div>
          <button
            onClick={handleLogout}
            title="Logout"
            style={{
              marginLeft: "auto",
              border: "none",
              background: "transparent",
              cursor: "pointer",
              fontWeight: 700,
              fontSize: "12px",
            }}
          >
            Logout
          </button>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <button
            type="button"
            className="mobile-menu-btn"
            aria-label="Open navigation menu"
            aria-expanded={mobileMenuOpen}
            onClick={() => setMobileMenuOpen(true)}
          >
            <Menu size={21} />
          </button>

          <div className="breadcrumb">
            <span>Workspace</span>
            <ChevronDown size={13} />
            <strong>{activePage}</strong>
          </div>

          <div className="topbar-actions">
            <button className="icon-btn" title="Notifications">
              <Bell size={18} />
              <i />
            </button>

            <div className="top-profile">
              <div className="profile-avatar">{userInitial}</div>
              <div>
                <strong>{currentUser.name}</strong>
                <span>{currentUser.college_name}</span>
              </div>
              <ChevronDown size={15} />
            </div>
          </div>
        </header>

        <section className="page">
          {error && (
            <div className="api-alert">
              <XCircle size={18} />
              <span>{error}</span>
              <button onClick={() => loadReport(reportDate)}>Retry</button>
            </div>
          )}

          {workspaceError && (
            <div className="api-alert" style={{ marginBottom: "16px" }}>
              <XCircle size={18} />
              <span>{workspaceError}</span>
              <button onClick={loadWorkspace}>Retry</button>
            </div>
          )}

          <WorkspaceSelector
            classes={classes}
            assignments={assignments}
            selectedAssignmentId={selectedAssignmentId}
            setSelectedAssignmentId={setSelectedAssignmentId}
            reportMode={reportMode}
            setReportMode={setReportMode}
            sessionActive={sessionActive}
            onWorkspaceChanged={loadWorkspace}
          />

          {activePage === "Dashboard" && (
            <>
            <div className="hero">
              <div>
                <div className="eyebrow">
                  <span className="status-dot" />
                  ATTENDANCE WORKSPACE
                </div>
                <h2>Welcome, {currentUser.name}.</h2>
                <p>
                  Manage students, run face recognition attendance and review
                  daily reports from one place.
                </p>
              </div>
  
              <button
                className="primary-btn"
                onClick={() => setShowRegister(true)}
              >
                <UserPlus size={18} />
                Register Student
                <ArrowRight size={16} />
              </button>
            </div>
  
            <div className="date-toolbar">
              <div className="date-heading">
                <CalendarDays size={18} />
                <div>
                  <strong>{formatDate(reportDate)}</strong>
                  <span>Daily attendance report</span>
                </div>
              </div>
  
              <div className="date-control">
                <CalendarDays size={16} />
                <input
                  type="date"
                  value={reportDate}
                  onChange={(e) => setReportDate(e.target.value)}
                />
              </div>
            </div>
  
            {loading ? (
              <LoadingState />
            ) : (
              <>
                <div className="stats-grid">
                  <StatCard
                    icon={<Users size={20} />}
                    label="Registered Students"
                    value={report?.total_students ?? 0}
                    note="Active student records"
                  />
                  <StatCard
                    icon={<CheckCircle2 size={20} />}
                    label="Present Today"
                    value={report?.present ?? 0}
                    note="Marked by recognition"
                    tone="success"
                  />
                  <StatCard
                    icon={<XCircle size={20} />}
                    label="Absent Today"
                    value={report?.absent ?? 0}
                    note="No attendance recorded"
                    tone="danger"
                  />
                  <StatCard
                    icon={<Activity size={20} />}
                    label="Attendance Rate"
                    value={`${report?.attendance_percentage ?? 0}%`}
                    note="For selected date"
                    tone="purple"
                  />
                </div>
  
                <div className="main-grid">
                  <section className="panel attendance-summary">
                    <div className="panel-heading">
                      <div>
                        <div className="section-kicker">DAILY SUMMARY</div>
                        <h3>Attendance overview</h3>
                        <p>Real data from the selected report date.</p>
                      </div>
                      <span className="date-chip">
                        <CalendarDays size={14} />
                        {reportDate}
                      </span>
                    </div>
  
                    <div className="summary-body">
                      <div className="donut-wrap">
                        <div
                          className="donut"
                          style={{
                            "--progress": `${
                              report?.attendance_percentage ?? 0
                            }%`,
                          }}
                        >
                          <div>
                            <strong>
                              {report?.attendance_percentage ?? 0}%
                            </strong>
                            <span>present</span>
                          </div>
                        </div>
                      </div>
  
                      <div className="summary-details">
                        <SummaryRow
                          label="Present"
                          value={report?.present ?? 0}
                          className="present"
                        />
                        <SummaryRow
                          label="Absent"
                          value={report?.absent ?? 0}
                          className="absent"
                        />
                        <SummaryRow
                          label="Total students"
                          value={report?.total_students ?? 0}
                          className="total"
                        />
  
                        <div className="summary-note">
                          <ShieldCheck size={17} />
                          <span>
                            Every registered student is included in the daily
                            report, even when they were absent.
                          </span>
                        </div>
                      </div>
                    </div>
                  </section>
  
                  <section className="panel live-card">
                    <div className="panel-heading">
                      <div>
                        <div className="section-kicker">FACE RECOGNITION</div>
                        <h3>Live attendance</h3>
                        <p>Start the attendance session before students enter.</p>
                      </div>
                      <span className={`live-pill ${sessionActive ? "on" : ""}`}>
                        <i />
                        {sessionActive ? "SESSION ACTIVE" : "READY"}
                      </span>
                    </div>
  
                    <div className="live-box">
                      <div className="camera-orbit">
                        <Camera size={31} />
                      </div>
                      <h4>
                        {sessionActive
                          ? "Attendance session is active"
                          : "Ready to take attendance"}
                      </h4>
                      <p>
                        Students can come one by one in front of the camera.
                        Your Python recognition process sends the result to
                        FastAPI.
                      </p>
  
                      <button
                        className={`session-btn ${
                          sessionActive ? "stop" : ""
                        }`}
                        onClick={toggleAttendance}
                        disabled={sessionLoading}
                      >
                        {sessionLoading
                          ? "Updating..."
                          : sessionActive
                          ? "End Attendance Session"
                          : "Start Attendance Session"}
                        <ArrowRight size={16} />
                      </button>
  
                      <span className="session-help">
                        Camera recognition runs from <b>live_attendance.py</b>.
                      </span>
                    </div>
                  </section>
                </div>
  
                <section className="panel student-panel">
                  <div className="panel-heading table-heading">
                    <div>
                      <div className="section-kicker">STUDENT RECORDS</div>
                      <h3>Daily attendance</h3>
                      <p>
                        {presentStudents.length} student
                        {presentStudents.length === 1 ? "" : "s"} present on{" "}
                        {reportDate}.
                      </p>
                    </div>
  
                    <div className="table-actions">
                      <div className="search-box">
                        <Search size={17} />
                        <input
                          placeholder="Search student..."
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                        />
                      </div>
                      <button className="filter-btn">
                        <SlidersHorizontal size={16} />
                        Filter
                      </button>
                    </div>
                  </div>
  
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>STUDENT</th>
                          <th>ROLL NO.</th>
                          <th>DEPARTMENT</th>
                          <th>DIVISION</th>
                          <th>YEAR</th>
                          <th>TIME</th>
                          <th>CONFIDENCE</th>
                          <th>STATUS</th>
                        </tr>
                      </thead>
  
                      <tbody>
                        {filteredStudents.length === 0 ? (
                          <tr>
                            <td colSpan="8">
                              <div className="empty-row">
                                No student records found for this date.
                              </div>
                            </td>
                          </tr>
                        ) : (
                          filteredStudents.map((student) => (
                            <StudentRow key={student.student_id} student={student} />
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>
              </>
            )}
            </>
          )}

          {activePage === "Live Attendance" && (
            <LiveAttendancePage
              sessionActive={sessionActive}
              sessionLoading={sessionLoading}
              toggleAttendance={toggleAttendance}
              loadReport={loadReport}
              reportDate={reportDate}
              selectedAssignmentId={selectedAssignmentId}
            />
          )}

          {activePage === "Students" && (
            <StudentsPage
              search={search}
              setSearch={setSearch}
              onRegister={() => setShowRegister(true)}
              refreshKey={studentsRefreshKey}
              selectedClassId={
                assignments.find(
                  (item) => String(item.id) === String(selectedAssignmentId)
                )?.class_id || ""
              }
            />
          )}

          {activePage === "Attendance" && (
            <AttendancePage
              report={report}
              loading={loading}
              reportDate={reportDate}
              setReportDate={setReportDate}
              sessionActive={sessionActive}
              setActivePage={setActivePage}
            />
          )}

          {activePage === "Reports" && (
            <ReportsPage
              report={report}
              loading={loading}
              reportDate={reportDate}
              setReportDate={setReportDate}
              selectedAssignmentId={selectedAssignmentId}
              assignments={assignments}
            />
          )}

          {activePage === "Analytics" && (
            <AnalyticsPage
              report={report}
              loading={loading}
              reportDate={reportDate}
              setReportDate={setReportDate}
            />
          )}
        </section>
      </main>

      {showRegister && (
        <RegisterModal
          onClose={() => setShowRegister(false)}
          classes={classes}
          defaultClassId={
            assignments.find(
              (item) => String(item.id) === String(selectedAssignmentId)
            )?.class_id || ""
          }
          onRegistered={() => {
            setShowRegister(false);
            setStudentsRefreshKey((value) => value + 1);
            loadReport(reportDate);
          }}
        />
      )}
    </div>
  );
}


function WorkspaceSelector({
  classes,
  assignments,
  selectedAssignmentId,
  setSelectedAssignmentId,
  reportMode,
  setReportMode,
  sessionActive,
  onWorkspaceChanged,
}) {
  const [showSetup, setShowSetup] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [classForm, setClassForm] = useState({
    department: "",
    year: "4",
    division: "C",
    academic_year: "2026-27",
  });
  const [subjectForm, setSubjectForm] = useState({
    class_id: "",
    subject_name: "",
    subject_code: "",
  });

  async function createClass(e) {
    e.preventDefault();
    setSaving(true);
    setMessage("");

    try {
      const response = await apiFetch(`${API_BASE}/workspace/classes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          department: classForm.department,
          year: Number(classForm.year),
          division: classForm.division,
          academic_year: classForm.academic_year,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        const detail = Array.isArray(data.detail)
          ? data.detail.map((item) => item.msg || JSON.stringify(item)).join(", ")
          : data.detail;
        throw new Error(detail || "Could not create class.");
      }

      setMessage(data.message || "Class is ready. Now add a subject for this class.");
      await onWorkspaceChanged();
    } catch (err) {
      setMessage(err.message || "Could not create class.");
    } finally {
      setSaving(false);
    }
  }

  async function createAssignment(e) {
    e.preventDefault();
    setSaving(true);
    setMessage("");

    try {
      if (!subjectForm.class_id) throw new Error("Select a class.");

      const response = await apiFetch(`${API_BASE}/workspace/assignments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          class_id: Number(subjectForm.class_id),
          subject_name: subjectForm.subject_name,
          subject_code: subjectForm.subject_code,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        const detail = Array.isArray(data.detail)
          ? data.detail.map((item) => item.msg || JSON.stringify(item)).join(", ")
          : data.detail;
        throw new Error(detail || "Could not add subject.");
      }

      setMessage(data.message || "Subject assignment added successfully.");
      await onWorkspaceChanged();
    } catch (err) {
      setMessage(err.message || "Could not add subject.");
    } finally {
      setSaving(false);
    }
  }

  const selected = assignments.find(
    (item) => String(item.id) === String(selectedAssignmentId)
  );

  return (
    <section className="panel workspace-panel" style={{ marginBottom: "18px", padding: "18px" }}>
      <div
        style={{
          display: "flex",
          gap: "14px",
          alignItems: "end",
          justifyContent: "space-between",
          flexWrap: "wrap",
        }}
      >
        <div className="workspace-main">
          <div className="section-kicker">CLASS & SUBJECT</div>
          <h3 style={{ margin: "5px 0 10px" }}>
            {selected
              ? `${selected.classroom?.department || ""} • Year ${
                  selected.classroom?.year || ""
                } • Div ${selected.classroom?.division || ""} • ${
                  selected.subject_name
                }`
              : "Select attendance workspace"}
          </h3>
          <select
            value={selectedAssignmentId}
            disabled={sessionActive}
            onChange={(e) => {
              setSelectedAssignmentId(e.target.value);
              setReportMode("subject");
            }}
            style={{
              width: "100%",
              minHeight: "44px",
              border: "1px solid #dbe2ea",
              borderRadius: "10px",
              padding: "0 12px",
              background: "#fff",
            }}
          >
            <option value="">Select Class + Subject</option>
            {assignments.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label ||
                  `${item.classroom?.department || ""} • Year ${
                    item.classroom?.year || ""
                  } • Div ${item.classroom?.division || ""} • ${
                    item.subject_name
                  } (${item.subject_code})`}
              </option>
            ))}
          </select>

          <div
            style={{
              display: "flex",
              gap: "8px",
              flexWrap: "wrap",
              marginTop: "10px",
            }}
          >
            <button
              type="button"
              className={reportMode === "subject" ? "primary-btn" : "secondary-btn"}
              onClick={() => setReportMode("subject")}
              disabled={sessionActive}
              style={{ minHeight: "38px", padding: "8px 12px" }}
            >
              Subject Report
            </button>

            <button
              type="button"
              className={reportMode === "historical" ? "primary-btn" : "secondary-btn"}
              onClick={() => setReportMode("historical")}
              disabled={sessionActive}
              style={{ minHeight: "38px", padding: "8px 12px" }}
            >
              Historical Attendance
            </button>
          </div>

          {reportMode === "historical" && (
            <span className="session-help">
              Showing preserved attendance from before subject-wise sessions were introduced.
            </span>
          )}

          {sessionActive && (
            <span className="session-help">
              End the current attendance session before changing subject.
            </span>
          )}
        </div>

        <button
          type="button"
          className="secondary-btn"
          onClick={() => setShowSetup((value) => !value)}
          disabled={sessionActive}
        >
          <Plus size={17} />
          {showSetup ? "Close Setup" : "Class & Subject Setup"}
        </button>
      </div>

      {showSetup && (
        <div
          className="workspace-setup-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: "16px",
            marginTop: "18px",
          }}
        >
          <form onSubmit={createClass} className="panel" style={{ padding: "16px" }}>
            <div className="section-kicker">1. CLASS</div>
            <h3>Create / find class</h3>
            <div className="form-grid">
              <label>
                Department
                <input
                  value={classForm.department}
                  onChange={(e) =>
                    setClassForm((v) => ({ ...v, department: e.target.value }))
                  }
                  placeholder="Information Technology"
                  required
                />
              </label>
              <label>
                Year
                <input
                  type="number"
                  min="1"
                  max="6"
                  value={classForm.year}
                  onChange={(e) =>
                    setClassForm((v) => ({ ...v, year: e.target.value }))
                  }
                  required
                />
              </label>
              <label>
                Division
                <input
                  value={classForm.division}
                  onChange={(e) =>
                    setClassForm((v) => ({ ...v, division: e.target.value }))
                  }
                  required
                />
              </label>
              <label>
                Academic year
                <input
                  value={classForm.academic_year}
                  onChange={(e) =>
                    setClassForm((v) => ({ ...v, academic_year: e.target.value }))
                  }
                  required
                />
              </label>
            </div>
            <button className="primary-btn" disabled={saving}>
              {saving ? "Saving..." : "Save Class"}
            </button>
          </form>

          <form
            onSubmit={createAssignment}
            className="panel"
            style={{ padding: "16px" }}
          >
            <div className="section-kicker">2. SUBJECT</div>
            <h3>Assign subject to me</h3>
            <div className="form-grid">
              <label>
                Class
                <select
                  value={subjectForm.class_id}
                  onChange={(e) =>
                    setSubjectForm((v) => ({ ...v, class_id: e.target.value }))
                  }
                  required
                >
                  <option value="">Select class</option>
                  {classes.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.department} • Year {item.year} • Div {item.division} •{" "}
                      {item.academic_year}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Subject name
                <input
                  value={subjectForm.subject_name}
                  onChange={(e) =>
                    setSubjectForm((v) => ({ ...v, subject_name: e.target.value }))
                  }
                  placeholder="DevOps"
                  required
                />
              </label>
              <label>
                Subject code
                <input
                  value={subjectForm.subject_code}
                  onChange={(e) =>
                    setSubjectForm((v) => ({ ...v, subject_code: e.target.value }))
                  }
                  placeholder="IT401"
                  required
                />
              </label>
            </div>
            <button className="primary-btn" disabled={saving || classes.length === 0}>
              {saving ? "Saving..." : "Add Subject"}
            </button>
          </form>
        </div>
      )}

      {message && (
        <div className="form-message" style={{ marginTop: "12px" }}>
          {message}
        </div>
      )}
    </section>
  );
}

function StatCard({ icon, label, value, note, tone = "" }) {
  return (
    <div className={`stat-card ${tone}`}>
      <div className="stat-icon">{icon}</div>
      <div className="stat-value">{value}</div>
      <strong>{label}</strong>
      <span>{note}</span>
    </div>
  );
}

function SummaryRow({ label, value, className }) {
  return (
    <div className="summary-row">
      <span>
        <i className={`legend ${className}`} />
        {label}
      </span>
      <strong>{value}</strong>
    </div>
  );
}

function StudentRow({ student }) {
  const initial = student.name?.charAt(0)?.toUpperCase() || "?";
  const isPresent = student.status === "Present";

  return (
    <tr>
      <td>
        <div className="student-name">
          <div className="student-avatar">{initial}</div>
          <div>
            <strong>{student.name}</strong>
            <span>{student.email || "Registered student"}</span>
          </div>
        </div>
      </td>
      <td className="mono">{student.roll_number}</td>
      <td>{student.department}</td>
      <td>{student.division}</td>
      <td>{student.year}</td>
      <td>
        <span className="time-cell">
          <Clock3 size={14} />
          {formatTime(student.time)}
        </span>
      </td>
      <td>
        {student.confidence != null ? (
          <span className="confidence">
            {(Number(student.confidence) * 100).toFixed(1)}%
          </span>
        ) : (
          "—"
        )}
      </td>
      <td>
        <span className={`status-badge ${isPresent ? "present" : "absent"}`}>
          {isPresent ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
          {student.status}
        </span>
      </td>
    </tr>
  );
}

function LiveAttendancePage({
  sessionActive,
  sessionLoading,
  toggleAttendance,
  loadReport,
  reportDate,
  selectedAssignmentId,
}) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const recognitionBusyRef = useRef(false);

  const [cameraActive, setCameraActive] = useState(false);
  const [recognitionResult, setRecognitionResult] = useState(null);
  const [recognizing, setRecognizing] = useState(false);
  const [cameraError, setCameraError] = useState("");

  async function startCamera() {
    setCameraError("");
    setRecognitionResult(null);

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error(
          "Camera access is not available in this browser. On a phone, open the deployed app over HTTPS and allow camera permission."
        );
      }

      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      streamRef.current = mediaStream;
      setCameraActive(true);
    } catch (err) {
      setCameraError(
        err?.message ||
          "Camera access failed. Please allow camera permission in your browser."
      );
    }
  }

  useEffect(() => {
    if (!cameraActive || !streamRef.current || !videoRef.current) {
      return;
    }

    const video = videoRef.current;
    video.srcObject = streamRef.current;

    const playVideo = async () => {
      try {
        await video.play();
      } catch (err) {
        console.error("Could not start camera preview:", err);
        setCameraError("Camera opened, but the video preview could not start.");
      }
    };

    playVideo();
  }, [cameraActive]);

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    recognitionBusyRef.current = false;
    setRecognizing(false);
    setCameraActive(false);
  }

  async function handleSession() {
    if (sessionActive) {
      stopCamera();
      await toggleAttendance();
      setRecognitionResult(null);
      return;
    }

    await toggleAttendance();
  }

  async function recognizeFrame() {
    if (
      !videoRef.current ||
      !canvasRef.current ||
      !cameraActive ||
      !sessionActive ||
      recognitionBusyRef.current
    ) {
      return;
    }

    const video = videoRef.current;

    if (!video.videoWidth || !video.videoHeight) {
      return;
    }

    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const context = canvas.getContext("2d");

    if (!context) {
      return;
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    recognitionBusyRef.current = true;
    setRecognizing(true);

    try {
      const blob = await new Promise((resolve) => {
        canvas.toBlob(resolve, "image/jpeg", 0.9);
      });

      if (!blob) {
        throw new Error("Could not capture camera frame.");
      }

      const formData = new FormData();
      formData.append("image", blob, "camera-frame.jpg");

      const response = await apiFetch(
        `${API_BASE}/attendance/recognize-frame`,
        {
          method: "POST",
          body: formData,
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Face recognition failed.");
      }

      setRecognitionResult(data);

      if (data.recognized) {
        await loadReport(reportDate);
      }
    } catch (err) {
      setRecognitionResult({
        recognized: false,
        message: err.message || "Could not recognize face.",
      });
    } finally {
      recognitionBusyRef.current = false;
      setRecognizing(false);
    }
  }

  useEffect(() => {
    if (!cameraActive || !sessionActive) {
      return undefined;
    }

    const interval = window.setInterval(() => {
      recognizeFrame();
    }, 2500);

    return () => window.clearInterval(interval);
  }, [cameraActive, sessionActive, reportDate]);

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    };
  }, []);

  return (
    <>
      <div className="hero">
        <div>
          <div className="eyebrow">
            <span className="status-dot" />
            LIVE FACE RECOGNITION
          </div>
          <h2>Live Attendance</h2>
          <p>
            Start an attendance session and use this device camera to recognize
            registered active students automatically.
          </p>
        </div>

        <span className={`live-pill ${sessionActive ? "on" : ""}`}>
          <i />
          {sessionActive ? "SESSION ACTIVE" : "SESSION INACTIVE"}
        </span>
      </div>

      <section className="panel live-card">
        <div className="panel-heading">
          <div>
            <div className="section-kicker">CAMERA</div>
            <h3>Face recognition camera</h3>
            <p>
              Camera frames are sent to FastAPI and checked using your existing
              YuNet and SFace recognition system.
            </p>
          </div>
        </div>

        <div className="live-box">
          {!cameraActive ? (
            <>
              <div className="camera-orbit">
                <Camera size={31} />
              </div>

              <h4>
                {sessionActive
                  ? "Attendance session is active"
                  : "Ready to take attendance"}
              </h4>

              <p>
                {sessionActive
                  ? "Open the camera and ask students to come one by one in front of it."
                  : "Start the attendance session before opening the camera."}
              </p>

              <button
                className={`session-btn ${sessionActive ? "stop" : ""}`}
                onClick={handleSession}
                disabled={sessionLoading}
              >
                {sessionLoading
                  ? "Updating..."
                  : sessionActive
                  ? "End Attendance Session"
                  : "Start Attendance Session"}
                <ArrowRight size={16} />
              </button>

              {sessionActive && (
                <button
                  className="primary-btn"
                  onClick={startCamera}
                  style={{ marginTop: "12px" }}
                >
                  <Camera size={17} />
                  Open Camera
                </button>
              )}
            </>
          ) : (
            <>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="live-camera-video"
              />

              <canvas ref={canvasRef} style={{ display: "none" }} />

              <div
                style={{
                  marginTop: "16px",
                  display: "flex",
                  gap: "10px",
                  flexWrap: "wrap",
                  justifyContent: "center",
                }}
              >
                <button className="secondary-btn" onClick={stopCamera}>
                  Stop Camera
                </button>

                <button
                  className="session-btn stop"
                  onClick={handleSession}
                  disabled={sessionLoading}
                >
                  {sessionLoading ? "Updating..." : "End Attendance Session"}
                </button>
              </div>
            </>
          )}

          {cameraError && (
            <div className="form-error" style={{ marginTop: "16px" }}>
              {cameraError}
            </div>
          )}

          {cameraActive && recognizing && (
            <span className="session-help">Scanning face...</span>
          )}

          {recognitionResult && (
            <div style={{ marginTop: "18px", textAlign: "center" }}>
              {recognitionResult.recognized ? (
                <>
                  <CheckCircle2 size={28} />
                  <h4>{recognitionResult.name}</h4>
                  <p>Roll Number: {recognitionResult.roll_number}</p>
                  <p>
                    {recognitionResult.already_marked
                      ? "Attendance was already marked today."
                      : "Attendance marked successfully."}
                  </p>
                  {recognitionResult.confidence != null && (
                    <p>
                      Confidence:{" "}
                      {(Number(recognitionResult.confidence) * 100).toFixed(1)}%
                    </p>
                  )}
                </>
              ) : (
                <>
                  <Camera size={24} />
                  <h4>Scanning...</h4>
                  <p>
                    {recognitionResult.message || "Face not recognized yet."}
                  </p>
                </>
              )}
            </div>
          )}
        </div>
      </section>
    </>
  );
}


function StudentsPage({
  search,
  setSearch,
  onRegister,
  refreshKey,
  selectedClassId,
}) {
  const [studentRecords, setStudentRecords] = useState([]);
  const [studentsLoading, setStudentsLoading] = useState(true);
  const [studentsError, setStudentsError] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [editingStudent, setEditingStudent] = useState(null);
  const [actionStudentId, setActionStudentId] = useState(null);

  async function loadStudents() {
    setStudentsLoading(true);
    setStudentsError("");

    try {
      const url = selectedClassId
        ? `${API_BASE}/students/?class_id=${selectedClassId}`
        : `${API_BASE}/students/`;
      const response = await apiFetch(url);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Could not load students.");
      }

      setStudentRecords(data.students || []);
    } catch (err) {
      setStudentsError(err.message || "Could not load students.");
    } finally {
      setStudentsLoading(false);
    }
  }

  useEffect(() => {
    loadStudents();
  }, [refreshKey, selectedClassId]);

  async function changeStudentStatus(student) {
    const nextActive = student.status !== "Active";
    setActionStudentId(student.id);
    setStudentsError("");

    try {
      const response = await apiFetch(
        `${API_BASE}/students/${student.id}/status?is_active=${nextActive}`,
        { method: "PATCH" }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Could not update student status.");
      }

      await loadStudents();
    } catch (err) {
      setStudentsError(err.message || "Could not update student status.");
    } finally {
      setActionStudentId(null);
    }
  }

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();

    return studentRecords.filter((student) => {
      const matchesSearch =
        !query ||
        [
          student.name,
          student.email,
          student.roll_number,
          student.department,
          student.division,
          student.year,
          student.academic_year,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(query));

      const matchesStatus =
        statusFilter === "All" || student.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [studentRecords, search, statusFilter]);

  const activeCount = studentRecords.filter(
    (student) => student.status === "Active"
  ).length;
  const inactiveCount = studentRecords.length - activeCount;

  return (
    <>
      <div className="hero">
        <div>
          <div className="eyebrow">
            <span className="status-dot" />
            STUDENT MANAGEMENT
          </div>
          <h2>Students</h2>
          <p>
            Add, edit, search and activate or deactivate students in your own
            teacher workspace.
          </p>
        </div>

        <button className="primary-btn" onClick={onRegister}>
          <UserPlus size={18} />
          Add Student
          <ArrowRight size={16} />
        </button>
      </div>

      <div className="stats-grid">
        <StatCard
          icon={<Users size={20} />}
          label="Total Students"
          value={studentRecords.length}
          note="Registered in your workspace"
        />
        <StatCard
          icon={<CheckCircle2 size={20} />}
          label="Active Students"
          value={activeCount}
          note="Included in face recognition"
          tone="success"
        />
        <StatCard
          icon={<XCircle size={20} />}
          label="Inactive Students"
          value={inactiveCount}
          note="Excluded from recognition"
          tone="danger"
        />
        <StatCard
          icon={<Activity size={20} />}
          label="Active Rate"
          value={
            studentRecords.length
              ? `${Math.round((activeCount / studentRecords.length) * 100)}%`
              : "0%"
          }
          note="Current student status"
          tone="purple"
        />
      </div>

      {studentsError && (
        <div className="api-alert" style={{ marginBottom: "18px" }}>
          <XCircle size={18} />
          <span>{studentsError}</span>
          <button onClick={loadStudents}>Retry</button>
        </div>
      )}

      <section className="panel student-panel">
        <div className="panel-heading table-heading">
          <div>
            <div className="section-kicker">REGISTERED STUDENTS</div>
            <h3>Student records</h3>
            <p>
              Showing {filtered.length} of {studentRecords.length} student
              {studentRecords.length === 1 ? "" : "s"}.
            </p>
          </div>

          <div
            className="table-actions"
            style={{
              display: "flex",
              gap: "10px",
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{
                height: "42px",
                border: "1px solid #dbe2ea",
                borderRadius: "10px",
                padding: "0 12px",
                background: "#ffffff",
                color: "#334155",
                fontWeight: 600,
              }}
            >
              <option value="All">All Students</option>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>

            <div className="search-box">
              <Search size={17} />
              <input
                placeholder="Search name, roll no, email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </div>

        {studentsLoading ? (
          <LoadingState />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>STUDENT</th>
                  <th>ROLL NO.</th>
                  <th>DEPARTMENT</th>
                  <th>DIVISION</th>
                  <th>YEAR</th>
                  <th>ACADEMIC YEAR</th>
                  <th>STATUS</th>
                  <th>ACTIONS</th>
                </tr>
              </thead>

              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan="8">
                      <div className="empty-row">
                        {studentRecords.length === 0
                          ? "No students registered yet. Click Add Student to register your first student."
                          : "No students match your search or filter."}
                      </div>
                    </td>
                  </tr>
                ) : (
                  filtered.map((student) => {
                    const initial =
                      student.name?.charAt(0)?.toUpperCase() || "?";
                    const isActive = student.status === "Active";

                    return (
                      <tr key={student.id}>
                        <td>
                          <div className="student-name">
                            <div className="student-avatar">{initial}</div>
                            <div>
                              <strong>{student.name}</strong>
                              <span>{student.email || "—"}</span>
                            </div>
                          </div>
                        </td>

                        <td className="mono">{student.roll_number}</td>
                        <td>{student.department || "—"}</td>
                        <td>{student.division || "—"}</td>
                        <td>{student.year || "—"}</td>
                        <td>{student.academic_year || "—"}</td>

                        <td>
                          <span
                            className={`status-badge ${
                              isActive ? "present" : "absent"
                            }`}
                          >
                            {isActive ? (
                              <CheckCircle2 size={14} />
                            ) : (
                              <XCircle size={14} />
                            )}
                            {student.status}
                          </span>
                        </td>

                        <td>
                          <div
                            style={{
                              display: "flex",
                              gap: "8px",
                              alignItems: "center",
                              whiteSpace: "nowrap",
                            }}
                          >
                            <button
                              type="button"
                              onClick={() => setEditingStudent(student)}
                              style={{
                                border: "1px solid #dbe2ea",
                                background: "#ffffff",
                                color: "#334155",
                                borderRadius: "9px",
                                padding: "8px 11px",
                                fontSize: "12px",
                                fontWeight: 700,
                                cursor: "pointer",
                              }}
                            >
                              Edit
                            </button>

                            <button
                              type="button"
                              disabled={actionStudentId === student.id}
                              onClick={() => changeStudentStatus(student)}
                              style={{
                                border: "none",
                                background: isActive ? "#fff1f2" : "#ecfdf5",
                                color: isActive ? "#be123c" : "#047857",
                                borderRadius: "9px",
                                padding: "8px 11px",
                                fontSize: "12px",
                                fontWeight: 700,
                                cursor:
                                  actionStudentId === student.id
                                    ? "not-allowed"
                                    : "pointer",
                                opacity:
                                  actionStudentId === student.id ? 0.6 : 1,
                              }}
                            >
                              {actionStudentId === student.id
                                ? "Saving..."
                                : isActive
                                ? "Deactivate"
                                : "Activate"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {editingStudent && (
        <EditStudentModal
          student={editingStudent}
          onClose={() => setEditingStudent(null)}
          onUpdated={async () => {
            setEditingStudent(null);
            await loadStudents();
          }}
        />
      )}
    </>
  );
}

function EditStudentModal({ student, onClose, onUpdated }) {
  const [form, setForm] = useState({
    name: student.name || "",
    email: student.email || "",
    department: student.department || "",
    division: student.division || "",
    year: student.year || "",
    academic_year: student.academic_year || "",
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  function updateField(e) {
    setForm((current) => ({
      ...current,
      [e.target.name]: e.target.value,
    }));
  }

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setMessage("");

    try {
      const body = new FormData();
      body.append("name", form.name);
      body.append("email", form.email);

      const response = await apiFetch(
        `${API_BASE}/students/${student.id}`,
        {
          method: "PUT",
          body,
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Could not update student.");
      }

      await onUpdated();
    } catch (err) {
      setMessage(err.message || "Could not update student.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div className="section-kicker">STUDENT MANAGEMENT</div>
            <h3>Edit student</h3>
            <p>
              Update student details. Roll number and face image stay unchanged.
            </p>
          </div>

          <button className="close-btn" onClick={onClose}>
            <X size={19} />
          </button>
        </div>

        <form onSubmit={submit}>
          <div className="form-grid">
            <label>
              Student name
              <input
                name="name"
                value={form.name}
                onChange={updateField}
                required
              />
            </label>

            <label>
              Email
              <input
                type="email"
                name="email"
                value={form.email}
                onChange={updateField}
                required
              />
            </label>

            <label>
              Department
              <input
                name="department"
                value={form.department}
                onChange={updateField}
                disabled
              />
            </label>

            <label>
              Division
              <input
                name="division"
                value={form.division}
                onChange={updateField}
                disabled
              />
            </label>

            <label>
              Year
              <input
                type="number"
                min="1"
                max="6"
                name="year"
                value={form.year}
                onChange={updateField}
                disabled
              />
            </label>

            <label>
              Academic year
              <input
                name="academic_year"
                value={form.academic_year}
                onChange={updateField}
                placeholder="2026-27"
                disabled
              />
            </label>
          </div>

          {message && <div className="form-message error">{message}</div>}

          <div className="modal-actions">
            <button type="button" className="secondary-btn" onClick={onClose}>
              Cancel
            </button>

            <button className="primary-btn" type="submit" disabled={saving}>
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}


function AttendancePage({
  report,
  loading,
  reportDate,
  setReportDate,
  sessionActive,
  setActivePage,
}) {
  const [attendanceSearch, setAttendanceSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");

  const attendanceStudents = report?.students ?? [];

  const filteredAttendance = useMemo(() => {
    const query = attendanceSearch.trim().toLowerCase();

    return attendanceStudents.filter((student) => {
      const matchesSearch =
        !query ||
        [
          student.name,
          student.roll_number,
          student.department,
          student.division,
          student.year,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(query));

      const matchesStatus =
        statusFilter === "All" || student.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [attendanceStudents, attendanceSearch, statusFilter]);

  return (
    <>
      <div className="hero">
        <div>
          <div className="eyebrow">
            <span className="status-dot" />
            DAILY ATTENDANCE
          </div>
          <h2>Attendance</h2>
          <p>
            View present and absent students for any date using your real
            attendance records.
          </p>
        </div>

        <button
          className="primary-btn"
          onClick={() => setActivePage("Live Attendance")}
        >
          <Camera size={18} />
          Open Live Attendance
          <ArrowRight size={16} />
        </button>
      </div>

      <div className="date-toolbar">
        <div className="date-heading">
          <CalendarDays size={18} />
          <div>
            <strong>{formatDate(reportDate)}</strong>
            <span>Attendance register</span>
          </div>
        </div>

        <div className="date-control">
          <CalendarDays size={16} />
          <input
            type="date"
            value={reportDate}
            onChange={(e) => setReportDate(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <LoadingState />
      ) : (
        <>
          <div className="stats-grid">
            <StatCard
              icon={<Users size={20} />}
              label="Total Students"
              value={report?.total_students ?? 0}
              note="Included in daily report"
            />
            <StatCard
              icon={<CheckCircle2 size={20} />}
              label="Present"
              value={report?.present ?? 0}
              note="Attendance marked"
              tone="success"
            />
            <StatCard
              icon={<XCircle size={20} />}
              label="Absent"
              value={report?.absent ?? 0}
              note="No attendance marked"
              tone="danger"
            />
            <StatCard
              icon={<Activity size={20} />}
              label="Attendance Rate"
              value={`${report?.attendance_percentage ?? 0}%`}
              note={sessionActive ? "Session currently active" : "Daily percentage"}
              tone="purple"
            />
          </div>

          <section className="panel student-panel">
            <div className="panel-heading table-heading">
              <div>
                <div className="section-kicker">ATTENDANCE REGISTER</div>
                <h3>{formatDate(reportDate)}</h3>
                <p>
                  Showing {filteredAttendance.length} of{" "}
                  {attendanceStudents.length} student records.
                </p>
              </div>

              <div className="table-actions">
                <div className="search-box">
                  <Search size={17} />
                  <input
                    placeholder="Search student..."
                    value={attendanceSearch}
                    onChange={(e) => setAttendanceSearch(e.target.value)}
                  />
                </div>

                <div className="date-control">
                  <SlidersHorizontal size={16} />
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    style={{
                      border: "none",
                      outline: "none",
                      background: "transparent",
                      font: "inherit",
                    }}
                  >
                    <option value="All">All Status</option>
                    <option value="Present">Present</option>
                    <option value="Absent">Absent</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>STUDENT</th>
                    <th>ROLL NO.</th>
                    <th>DEPARTMENT</th>
                    <th>DIVISION</th>
                    <th>YEAR</th>
                    <th>TIME</th>
                    <th>CONFIDENCE</th>
                    <th>STATUS</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredAttendance.length === 0 ? (
                    <tr>
                      <td colSpan="8">
                        <div className="empty-row">
                          No attendance records match this search or filter.
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredAttendance.map((student) => (
                      <StudentRow
                        key={
                          student.student_id ??
                          student.id ??
                          student.roll_number
                        }
                        student={student}
                      />
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </>
  );
}


function ReportsPage({
  report,
  loading,
  reportDate,
  setReportDate,
  selectedAssignmentId,
  assignments,
}) {
  const today = getToday();
  const defaultMonth = today.slice(0, 7);

  const [viewMode, setViewMode] = useState("daily");
  const [reportSearch, setReportSearch] = useState("");
  const [reportStatus, setReportStatus] = useState("All");
  const [monthValue, setMonthValue] = useState(defaultMonth);
  const [monthlyData, setMonthlyData] = useState(null);
  const [monthlyLoading, setMonthlyLoading] = useState(false);
  const [monthlyError, setMonthlyError] = useState("");
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [studentHistory, setStudentHistory] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [sessionHistory, setSessionHistory] = useState(null);
  const [sessionHistoryLoading, setSessionHistoryLoading] = useState(false);
  const [sessionHistoryError, setSessionHistoryError] = useState("");

  const selectedAssignment = assignments.find(
    (item) => String(item.id) === String(selectedAssignmentId)
  );

  const reportStudents = report?.students ?? [];

  const filteredReportStudents = useMemo(() => {
    const query = reportSearch.trim().toLowerCase();

    return reportStudents.filter((student) => {
      const matchesSearch =
        !query ||
        [
          student.name,
          student.roll_number,
          student.department,
          student.division,
          student.year,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(query));

      const matchesStatus =
        reportStatus === "All" || student.status === reportStatus;

      return matchesSearch && matchesStatus;
    });
  }, [reportStudents, reportSearch, reportStatus]);

  const monthlyStudents = monthlyData?.students ?? [];

  const filteredMonthlyStudents = useMemo(() => {
    const query = reportSearch.trim().toLowerCase();

    return monthlyStudents.filter((student) => {
      if (!query) return true;

      return [student.name, student.roll_number, student.email]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });
  }, [monthlyStudents, reportSearch]);

  async function loadMonthlyReport() {
    if (!selectedAssignmentId) {
      setMonthlyData(null);
      setMonthlyError("Select a Class + Subject first.");
      return;
    }

    const [yearText, monthText] = monthValue.split("-");
    if (!yearText || !monthText) {
      setMonthlyError("Select a valid month.");
      return;
    }

    setMonthlyLoading(true);
    setMonthlyError("");

    try {
      const params = new URLSearchParams({
        assignment_id: selectedAssignmentId,
        year: yearText,
        month: String(Number(monthText)),
      });

      const response = await apiFetch(
        `${API_BASE}/attendance/monthly-report?${params.toString()}`
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Could not load monthly report.");
      }

      setMonthlyData(data);

      setSelectedStudentId((current) => {
        if (
          current &&
          (data.students || []).some(
            (student) => String(student.student_id) === String(current)
          )
        ) {
          return current;
        }

        return data.students?.length ? String(data.students[0].student_id) : "";
      });
    } catch (err) {
      setMonthlyData(null);
      setMonthlyError(err.message || "Could not load monthly report.");
    } finally {
      setMonthlyLoading(false);
    }
  }

  async function loadStudentHistory(studentId = selectedStudentId) {
    if (!selectedAssignmentId) {
      setStudentHistory(null);
      setHistoryError("Select a Class + Subject first.");
      return;
    }

    if (!studentId) {
      setStudentHistory(null);
      setHistoryError("Select a student first.");
      return;
    }

    const [yearText, monthText] = monthValue.split("-");
    if (!yearText || !monthText) {
      setHistoryError("Select a valid month.");
      return;
    }

    setHistoryLoading(true);
    setHistoryError("");

    try {
      const params = new URLSearchParams({
        assignment_id: selectedAssignmentId,
        year: yearText,
        month: String(Number(monthText)),
      });

      const response = await apiFetch(
        `${API_BASE}/attendance/student-history/${studentId}?${params.toString()}`
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Could not load student history.");
      }

      setStudentHistory(data);
    } catch (err) {
      setStudentHistory(null);
      setHistoryError(err.message || "Could not load student history.");
    } finally {
      setHistoryLoading(false);
    }
  }

  async function loadSessionHistory() {
    if (!selectedAssignmentId) {
      setSessionHistory(null);
      setSessionHistoryError("Select a Class + Subject first.");
      return;
    }

    const [yearText, monthText] = monthValue.split("-");
    if (!yearText || !monthText) {
      setSessionHistoryError("Select a valid month.");
      return;
    }

    setSessionHistoryLoading(true);
    setSessionHistoryError("");

    try {
      const params = new URLSearchParams({
        assignment_id: selectedAssignmentId,
        year: yearText,
        month: String(Number(monthText)),
      });

      const response = await apiFetch(
        `${API_BASE}/attendance/session-history?${params.toString()}`
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Could not load lecture history.");
      }

      setSessionHistory(data);
    } catch (err) {
      setSessionHistory(null);
      setSessionHistoryError(err.message || "Could not load lecture history.");
    } finally {
      setSessionHistoryLoading(false);
    }
  }

  useEffect(() => {
    setMonthlyData(null);
    setStudentHistory(null);
    setSessionHistory(null);
    setSelectedStudentId("");
    setMonthlyError("");
    setHistoryError("");
    setSessionHistoryError("");

    if (viewMode === "monthly" || viewMode === "student") {
      loadMonthlyReport();
    }

    if (viewMode === "lectures") {
      loadSessionHistory();
    }
  }, [selectedAssignmentId, monthValue, viewMode]);

  useEffect(() => {
    if (
      viewMode === "student" &&
      selectedStudentId &&
      monthlyData
    ) {
      loadStudentHistory(selectedStudentId);
    } else if (viewMode === "student") {
      setStudentHistory(null);
    }
  }, [selectedStudentId, viewMode, monthlyData?.assignment_id]);

  function downloadCsv() {
    let rows = [];
    let filename = "attendance-report.csv";

    if (viewMode === "daily") {
      rows = [
        [
          "Student",
          "Roll Number",
          "Department",
          "Division",
          "Year",
          "Status",
          "Time",
          "Confidence",
        ],
        ...filteredReportStudents.map((student) => [
          student.name ?? "",
          student.roll_number ?? "",
          student.department ?? "",
          student.division ?? "",
          student.year ?? "",
          student.status ?? "",
          formatTime(student.time),
          student.confidence != null
            ? `${(Number(student.confidence) * 100).toFixed(1)}%`
            : "",
        ]),
      ];
      filename = `daily-attendance-${reportDate}.csv`;
    } else if (viewMode === "monthly") {
      rows = [
        [
          "Student",
          "Roll Number",
          "Present",
          "Absent",
          "Total Lectures",
          "Attendance Percentage",
        ],
        ...filteredMonthlyStudents.map((student) => [
          student.name ?? "",
          student.roll_number ?? "",
          student.present ?? 0,
          student.absent ?? 0,
          student.total_sessions ?? 0,
          `${student.attendance_percentage ?? 0}%`,
        ]),
      ];
      filename = `monthly-attendance-${monthValue}.csv`;
    } else if (viewMode === "lectures") {
      const sessions = sessionHistory?.sessions ?? [];
      rows = [
        [
          "Lecture ID",
          "Date",
          "Start Time",
          "End Time",
          "Present",
          "Absent",
          "Total Students",
          "Attendance Percentage",
        ],
        ...sessions.map((session) => [
          session.session_id ?? "",
          session.date ?? "",
          formatSessionTime(session.started_at),
          formatSessionTime(session.ended_at),
          session.present ?? 0,
          session.absent ?? 0,
          session.total_students ?? 0,
          `${session.attendance_percentage ?? 0}%`,
        ]),
      ];
      filename = `lecture-history-${monthValue}.csv`;
    } else {
      const history = studentHistory?.history ?? [];
      rows = [
        [
          "Student",
          "Roll Number",
          "Date",
          "Status",
          "Attendance Time",
          "Confidence",
        ],
        ...history.map((item) => [
          studentHistory?.student?.name ?? "",
          studentHistory?.student?.roll_number ?? "",
          item.date ?? "",
          item.status ?? "",
          formatTime(item.time),
          item.confidence != null
            ? `${(Number(item.confidence) * 100).toFixed(1)}%`
            : "",
        ]),
      ];
      filename = `student-attendance-${studentHistory?.student?.roll_number || "report"}-${monthValue}.csv`;
    }

    if (rows.length <= 1) return;

    const csv = rows
      .map((row) =>
        row
          .map((value) => `"${String(value).replaceAll('"', '""')}"`)
          .join(",")
      )
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function printReport() {
    window.print();
  }

  const canExport =
    viewMode === "daily"
      ? filteredReportStudents.length > 0
      : viewMode === "monthly"
      ? filteredMonthlyStudents.length > 0
      : viewMode === "lectures"
      ? Boolean(sessionHistory?.sessions?.length)
      : Boolean(studentHistory?.history?.length);

  return (
    <>
      <div className="hero">
        <div>
          <div className="eyebrow">
            <span className="status-dot" />
            ATTENDANCE REPORTS
          </div>
          <h2>Reports</h2>
          <p>
            Review daily attendance, monthly percentages, lecture sessions and
            individual student history for the selected Class + Subject.
          </p>
        </div>

        <div
          style={{
            display: "flex",
            gap: "10px",
            flexWrap: "wrap",
          }}
        >
          <button className="secondary-btn" onClick={printReport}>
            <FileBarChart2 size={17} />
            Print Report
          </button>
          <button
            className="primary-btn"
            onClick={downloadCsv}
            disabled={!canExport}
          >
            <ArrowRight size={16} />
            Export CSV
          </button>
        </div>
      </div>

      <section
        className="panel"
        style={{ padding: "16px", marginBottom: "18px" }}
      >
        <div
          style={{
            display: "flex",
            gap: "10px",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <div className="section-kicker">REPORT TYPE</div>
            <h3 style={{ margin: "4px 0" }}>
              {selectedAssignment
                ? selectedAssignment.label ||
                  `${selectedAssignment.subject_name} (${selectedAssignment.subject_code})`
                : "Select Class + Subject above"}
            </h3>
          </div>

          <div
            style={{
              display: "flex",
              gap: "8px",
              flexWrap: "wrap",
            }}
          >
            <button
              type="button"
              className={viewMode === "daily" ? "primary-btn" : "secondary-btn"}
              onClick={() => setViewMode("daily")}
            >
              Daily
            </button>
            <button
              type="button"
              className={viewMode === "monthly" ? "primary-btn" : "secondary-btn"}
              onClick={() => setViewMode("monthly")}
            >
              Monthly
            </button>
            <button
              type="button"
              className={viewMode === "lectures" ? "primary-btn" : "secondary-btn"}
              onClick={() => setViewMode("lectures")}
            >
              Lecture History
            </button>
            <button
              type="button"
              className={viewMode === "student" ? "primary-btn" : "secondary-btn"}
              onClick={() => setViewMode("student")}
            >
              Student-wise
            </button>
          </div>
        </div>
      </section>

      {viewMode === "daily" && (
        <>
          <div className="date-toolbar">
            <div className="date-heading">
              <CalendarDays size={18} />
              <div>
                <strong>{formatDate(reportDate)}</strong>
                <span>Daily subject attendance</span>
              </div>
            </div>

            <div className="date-control">
              <CalendarDays size={16} />
              <input
                type="date"
                value={reportDate}
                onChange={(e) => setReportDate(e.target.value)}
              />
            </div>
          </div>

          {loading ? (
            <LoadingState />
          ) : (
            <>
              <div className="stats-grid">
                <StatCard
                  icon={<Users size={20} />}
                  label="Total Students"
                  value={report?.total_students ?? 0}
                  note="Students in selected class"
                />
                <StatCard
                  icon={<CheckCircle2 size={20} />}
                  label="Present"
                  value={report?.present ?? 0}
                  note="Attendance recorded"
                  tone="success"
                />
                <StatCard
                  icon={<XCircle size={20} />}
                  label="Absent"
                  value={report?.absent ?? 0}
                  note="Not marked in this session"
                  tone="danger"
                />
                <StatCard
                  icon={<Activity size={20} />}
                  label="Attendance Rate"
                  value={`${report?.attendance_percentage ?? 0}%`}
                  note="For selected date"
                  tone="purple"
                />
              </div>

              <section className="panel attendance-summary">
                <div className="panel-heading">
                  <div>
                    <div className="section-kicker">DAILY SUMMARY</div>
                    <h3>Daily attendance summary</h3>
                    <p>
                      Subject-wise attendance for {formatDate(reportDate)}.
                    </p>
                  </div>

                  <span className="date-chip">
                    <CalendarDays size={14} />
                    {reportDate}
                  </span>
                </div>

                <div className="summary-body">
                  <div className="donut-wrap">
                    <div
                      className="donut"
                      style={{
                        "--progress": `${report?.attendance_percentage ?? 0}%`,
                      }}
                    >
                      <div>
                        <strong>{report?.attendance_percentage ?? 0}%</strong>
                        <span>present</span>
                      </div>
                    </div>
                  </div>

                  <div className="summary-details">
                    <SummaryRow
                      label="Present"
                      value={report?.present ?? 0}
                      className="present"
                    />
                    <SummaryRow
                      label="Absent"
                      value={report?.absent ?? 0}
                      className="absent"
                    />
                    <SummaryRow
                      label="Total students"
                      value={report?.total_students ?? 0}
                      className="total"
                    />

                    <div className="summary-note">
                      <ShieldCheck size={17} />
                      <span>
                        Daily data comes from the selected subject attendance
                        session.
                      </span>
                    </div>
                  </div>
                </div>
              </section>

              <section
                className="panel student-panel"
                style={{ marginTop: "20px" }}
              >
                <div className="panel-heading table-heading">
                  <div>
                    <div className="section-kicker">DAILY DETAILS</div>
                    <h3>Student attendance records</h3>
                    <p>
                      Showing {filteredReportStudents.length} of{" "}
                      {reportStudents.length} students.
                    </p>
                  </div>

                  <div className="table-actions">
                    <div className="search-box">
                      <Search size={17} />
                      <input
                        placeholder="Search student..."
                        value={reportSearch}
                        onChange={(e) => setReportSearch(e.target.value)}
                      />
                    </div>

                    <div className="date-control">
                      <SlidersHorizontal size={16} />
                      <select
                        value={reportStatus}
                        onChange={(e) => setReportStatus(e.target.value)}
                        style={{
                          border: "none",
                          outline: "none",
                          background: "transparent",
                          font: "inherit",
                        }}
                      >
                        <option value="All">All Status</option>
                        <option value="Present">Present</option>
                        <option value="Absent">Absent</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>STUDENT</th>
                        <th>ROLL NO.</th>
                        <th>DEPARTMENT</th>
                        <th>DIVISION</th>
                        <th>YEAR</th>
                        <th>TIME</th>
                        <th>CONFIDENCE</th>
                        <th>STATUS</th>
                      </tr>
                    </thead>

                    <tbody>
                      {filteredReportStudents.length === 0 ? (
                        <tr>
                          <td colSpan="8">
                            <div className="empty-row">
                              No report records found for this filter.
                            </div>
                          </td>
                        </tr>
                      ) : (
                        filteredReportStudents.map((student) => (
                          <StudentRow
                            key={
                              student.student_id ??
                              student.id ??
                              student.roll_number
                            }
                            student={student}
                          />
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
        </>
      )}

      {(viewMode === "monthly" || viewMode === "student" || viewMode === "lectures") && (
        <div className="date-toolbar">
          <div className="date-heading">
            <CalendarDays size={18} />
            <div>
              <strong>
                {new Date(`${monthValue}-01T00:00:00`).toLocaleDateString(
                  "en-IN",
                  { month: "long", year: "numeric" }
                )}
              </strong>
              <span>
                {viewMode === "monthly"
                  ? "Monthly attendance report"
                  : viewMode === "lectures"
                  ? "Completed lecture session history"
                  : "Student attendance history"}
              </span>
            </div>
          </div>

          <div className="date-control">
            <CalendarDays size={16} />
            <input
              type="month"
              value={monthValue}
              onChange={(e) => setMonthValue(e.target.value)}
            />
          </div>
        </div>
      )}

      {viewMode === "monthly" && (
        <>
          {monthlyError && (
            <div className="api-alert" style={{ marginBottom: "18px" }}>
              <XCircle size={18} />
              <span>{monthlyError}</span>
              <button onClick={loadMonthlyReport}>Retry</button>
            </div>
          )}

          {monthlyLoading ? (
            <LoadingState />
          ) : (
            <>
              <div className="stats-grid">
                <StatCard
                  icon={<Users size={20} />}
                  label="Students"
                  value={monthlyStudents.length}
                  note="Students in selected class"
                />
                <StatCard
                  icon={<CalendarDays size={20} />}
                  label="Lectures Conducted"
                  value={monthlyData?.total_sessions ?? 0}
                  note="Completed attendance sessions"
                  tone="success"
                />
                <StatCard
                  icon={<FileBarChart2 size={20} />}
                  label="Subject"
                  value={monthlyData?.subject_code || "—"}
                  note={monthlyData?.subject_name || "Select a subject"}
                  tone="purple"
                />
                <StatCard
                  icon={<Activity size={20} />}
                  label="Class Average"
                  value={
                    monthlyStudents.length
                      ? `${(
                          monthlyStudents.reduce(
                            (sum, student) =>
                              sum + Number(student.attendance_percentage || 0),
                            0
                          ) / monthlyStudents.length
                        ).toFixed(1)}%`
                      : "0%"
                  }
                  note="Average student attendance"
                />
              </div>

              <section className="panel student-panel">
                <div className="panel-heading table-heading">
                  <div>
                    <div className="section-kicker">MONTHLY REPORT</div>
                    <h3>Student attendance percentage</h3>
                    <p>
                      Total lectures are based only on completed attendance
                      sessions.
                    </p>
                  </div>

                  <div className="search-box">
                    <Search size={17} />
                    <input
                      placeholder="Search student..."
                      value={reportSearch}
                      onChange={(e) => setReportSearch(e.target.value)}
                    />
                  </div>
                </div>

                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>STUDENT</th>
                        <th>ROLL NO.</th>
                        <th>PRESENT</th>
                        <th>ABSENT</th>
                        <th>TOTAL LECTURES</th>
                        <th>ATTENDANCE %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredMonthlyStudents.length === 0 ? (
                        <tr>
                          <td colSpan="6">
                            <div className="empty-row">
                              {monthlyData?.total_sessions === 0
                                ? "No completed attendance sessions found for this month."
                                : "No students found for this report."}
                            </div>
                          </td>
                        </tr>
                      ) : (
                        filteredMonthlyStudents.map((student) => (
                          <tr key={student.student_id}>
                            <td>
                              <div className="student-name">
                                <div className="student-avatar">
                                  {student.name?.charAt(0)?.toUpperCase() || "?"}
                                </div>
                                <div>
                                  <strong>{student.name}</strong>
                                  <span>{student.email || "Registered student"}</span>
                                </div>
                              </div>
                            </td>
                            <td className="mono">{student.roll_number}</td>
                            <td>{student.present}</td>
                            <td>{student.absent}</td>
                            <td>{student.total_sessions}</td>
                            <td>
                              <span
                                className={`status-badge ${
                                  Number(student.attendance_percentage) >= 75
                                    ? "present"
                                    : "absent"
                                }`}
                              >
                                {student.attendance_percentage}%
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
        </>
      )}

      {viewMode === "lectures" && (
        <>
          {sessionHistoryError && (
            <div className="api-alert" style={{ marginBottom: "18px" }}>
              <XCircle size={18} />
              <span>{sessionHistoryError}</span>
              <button onClick={loadSessionHistory}>Retry</button>
            </div>
          )}

          {sessionHistoryLoading ? (
            <LoadingState />
          ) : (
            <>
              <div className="stats-grid">
                <StatCard
                  icon={<CalendarDays size={20} />}
                  label="Lectures Conducted"
                  value={sessionHistory?.total_lectures ?? 0}
                  note="Completed attendance sessions"
                  tone="success"
                />
                <StatCard
                  icon={<FileBarChart2 size={20} />}
                  label="Subject"
                  value={sessionHistory?.subject_code || "—"}
                  note={sessionHistory?.subject_name || "Selected subject"}
                  tone="purple"
                />
                <StatCard
                  icon={<Users size={20} />}
                  label="Class"
                  value={
                    sessionHistory?.classroom
                      ? `Y${sessionHistory.classroom.year} Div ${sessionHistory.classroom.division}`
                      : "—"
                  }
                  note={sessionHistory?.classroom?.department || "Selected class"}
                />
                <StatCard
                  icon={<Activity size={20} />}
                  label="Academic Year"
                  value={sessionHistory?.classroom?.academic_year || "—"}
                  note="Lecture session history"
                />
              </div>

              <section className="panel student-panel">
                <div className="panel-heading">
                  <div>
                    <div className="section-kicker">LECTURE HISTORY</div>
                    <h3>Completed attendance sessions</h3>
                    <p>
                      Each Start Attendance → End Attendance cycle appears as a
                      separate lecture, including multiple lectures on the same day.
                    </p>
                  </div>
                </div>

                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>LECTURE</th>
                        <th>DATE</th>
                        <th>START</th>
                        <th>END</th>
                        <th>PRESENT</th>
                        <th>ABSENT</th>
                        <th>TOTAL</th>
                        <th>ATTENDANCE %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(sessionHistory?.sessions || []).length === 0 ? (
                        <tr>
                          <td colSpan="8">
                            <div className="empty-row">
                              No completed lecture sessions found for this month.
                              Start attendance and end the session to create a lecture entry.
                            </div>
                          </td>
                        </tr>
                      ) : (
                        sessionHistory.sessions.map((session, index) => (
                          <tr key={session.session_id}>
                            <td className="mono">
                              #{session.session_id ?? index + 1}
                            </td>
                            <td>{formatDate(session.date)}</td>
                            <td>{formatSessionTime(session.started_at)}</td>
                            <td>{formatSessionTime(session.ended_at)}</td>
                            <td>{session.present ?? 0}</td>
                            <td>{session.absent ?? 0}</td>
                            <td>{session.total_students ?? 0}</td>
                            <td>
                              <span
                                className={`status-badge ${
                                  Number(session.attendance_percentage) >= 75
                                    ? "present"
                                    : "absent"
                                }`}
                              >
                                {session.attendance_percentage ?? 0}%
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
        </>
      )}

      {viewMode === "student" && (
        <>
          {monthlyError && (
            <div className="api-alert" style={{ marginBottom: "18px" }}>
              <XCircle size={18} />
              <span>{monthlyError}</span>
              <button onClick={loadMonthlyReport}>Retry</button>
            </div>
          )}

          <section
            className="panel"
            style={{ padding: "18px", marginBottom: "18px" }}
          >
            <div className="section-kicker">SELECT STUDENT</div>
            <div
              style={{
                display: "flex",
                gap: "12px",
                flexWrap: "wrap",
                alignItems: "end",
                marginTop: "8px",
              }}
            >
              <label style={{ minWidth: "280px", flex: 1 }}>
                Student
                <select
                  value={selectedStudentId}
                  onChange={(e) => setSelectedStudentId(e.target.value)}
                  disabled={monthlyLoading || monthlyStudents.length === 0}
                  style={{
                    width: "100%",
                    minHeight: "44px",
                    marginTop: "6px",
                    border: "1px solid #dbe2ea",
                    borderRadius: "10px",
                    padding: "0 12px",
                    background: "#fff",
                  }}
                >
                  <option value="">Select student</option>
                  {monthlyStudents.map((student) => (
                    <option key={student.student_id} value={student.student_id}>
                      {student.roll_number} • {student.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>

          {historyError && (
            <div className="api-alert" style={{ marginBottom: "18px" }}>
              <XCircle size={18} />
              <span>{historyError}</span>
              <button onClick={() => loadStudentHistory()}>Retry</button>
            </div>
          )}

          {monthlyLoading || historyLoading ? (
            <LoadingState />
          ) : studentHistory ? (
            <>
              <div className="stats-grid">
                <StatCard
                  icon={<CalendarDays size={20} />}
                  label="Total Lectures"
                  value={studentHistory.total_sessions ?? 0}
                  note="Completed subject sessions"
                />
                <StatCard
                  icon={<CheckCircle2 size={20} />}
                  label="Present"
                  value={studentHistory.present ?? 0}
                  note="Lectures attended"
                  tone="success"
                />
                <StatCard
                  icon={<XCircle size={20} />}
                  label="Absent"
                  value={studentHistory.absent ?? 0}
                  note="Lectures missed"
                  tone="danger"
                />
                <StatCard
                  icon={<Activity size={20} />}
                  label="Attendance"
                  value={`${studentHistory.attendance_percentage ?? 0}%`}
                  note={studentHistory.student?.name || "Selected student"}
                  tone="purple"
                />
              </div>

              <section className="panel student-panel">
                <div className="panel-heading">
                  <div>
                    <div className="section-kicker">STUDENT HISTORY</div>
                    <h3>
                      {studentHistory.student?.name} •{" "}
                      {studentHistory.student?.roll_number}
                    </h3>
                    <p>
                      {studentHistory.subject_name} (
                      {studentHistory.subject_code}) attendance history.
                    </p>
                  </div>
                </div>

                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>DATE</th>
                        <th>STATUS</th>
                        <th>TIME</th>
                        <th>CONFIDENCE</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(studentHistory.history || []).length === 0 ? (
                        <tr>
                          <td colSpan="4">
                            <div className="empty-row">
                              No completed attendance sessions found for this
                              student in the selected month.
                            </div>
                          </td>
                        </tr>
                      ) : (
                        studentHistory.history.map((item) => (
                          <tr key={item.session_id}>
                            <td>{formatDate(item.date)}</td>
                            <td>
                              <span
                                className={`status-badge ${
                                  item.status === "Present"
                                    ? "present"
                                    : "absent"
                                }`}
                              >
                                {item.status === "Present" ? (
                                  <CheckCircle2 size={14} />
                                ) : (
                                  <XCircle size={14} />
                                )}
                                {item.status}
                              </span>
                            </td>
                            <td>{formatTime(item.time)}</td>
                            <td>
                              {item.confidence != null
                                ? `${(
                                    Number(item.confidence) * 100
                                  ).toFixed(1)}%`
                                : "—"}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          ) : (
            <section className="panel" style={{ padding: "24px" }}>
              <div className="empty-row">
                {monthlyStudents.length === 0
                  ? "No students are available for the selected class."
                  : "Select a student to view attendance history."}
              </div>
            </section>
          )}
        </>
      )}
    </>
  );
}

function AnalyticsPage({
  report,
  loading,
  reportDate,
  setReportDate,
}) {
  const analyticsStudents = report?.students ?? [];
  const total = Number(report?.total_students ?? 0);
  const present = Number(report?.present ?? 0);
  const absent = Number(report?.absent ?? 0);
  const rate = Number(report?.attendance_percentage ?? 0);

  const presentPercent = total > 0 ? Math.round((present / total) * 100) : 0;
  const absentPercent = total > 0 ? Math.round((absent / total) * 100) : 0;

  const confidenceValues = analyticsStudents
    .filter(
      (student) =>
        student.status === "Present" &&
        student.confidence != null &&
        !Number.isNaN(Number(student.confidence))
    )
    .map((student) => Number(student.confidence));

  const averageConfidence =
    confidenceValues.length > 0
      ? confidenceValues.reduce((sum, value) => sum + value, 0) /
        confidenceValues.length
      : 0;

  const highestConfidence =
    confidenceValues.length > 0 ? Math.max(...confidenceValues) : 0;

  return (
    <>
      <div className="hero">
        <div>
          <div className="eyebrow">
            <span className="status-dot" />
            ATTENDANCE ANALYTICS
          </div>
          <h2>Analytics</h2>
          <p>
            Understand attendance performance and face-recognition quality
            using the selected day's real attendance data.
          </p>
        </div>

        <div className="date-control">
          <CalendarDays size={16} />
          <input
            type="date"
            value={reportDate}
            onChange={(e) => setReportDate(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <LoadingState />
      ) : (
        <>
          <div className="stats-grid">
            <StatCard
              icon={<Users size={20} />}
              label="Total Students"
              value={total}
              note="Included in analytics"
            />
            <StatCard
              icon={<CheckCircle2 size={20} />}
              label="Present Rate"
              value={`${presentPercent}%`}
              note={`${present} students present`}
              tone="success"
            />
            <StatCard
              icon={<XCircle size={20} />}
              label="Absent Rate"
              value={`${absentPercent}%`}
              note={`${absent} students absent`}
              tone="danger"
            />
            <StatCard
              icon={<Activity size={20} />}
              label="Average Confidence"
              value={
                confidenceValues.length > 0
                  ? `${(averageConfidence * 100).toFixed(1)}%`
                  : "—"
              }
              note="Recognized students only"
              tone="purple"
            />
          </div>

          <div className="main-grid">
            <section className="panel attendance-summary">
              <div className="panel-heading">
                <div>
                  <div className="section-kicker">ATTENDANCE DISTRIBUTION</div>
                  <h3>Present vs absent</h3>
                  <p>{formatDate(reportDate)}</p>
                </div>
                <span className="date-chip">
                  <CalendarDays size={14} />
                  {reportDate}
                </span>
              </div>

              <div className="summary-body">
                <div className="donut-wrap">
                  <div
                    className="donut"
                    style={{
                      "--progress": `${rate}%`,
                    }}
                  >
                    <div>
                      <strong>{rate}%</strong>
                      <span>attendance</span>
                    </div>
                  </div>
                </div>

                <div className="summary-details">
                  <SummaryRow
                    label="Present"
                    value={present}
                    className="present"
                  />
                  <SummaryRow
                    label="Absent"
                    value={absent}
                    className="absent"
                  />
                  <SummaryRow
                    label="Total students"
                    value={total}
                    className="total"
                  />

                  <div className="summary-note">
                    <Activity size={17} />
                    <span>
                      Attendance rate is calculated directly from the selected
                      day's FastAPI report.
                    </span>
                  </div>
                </div>
              </div>
            </section>

            <section className="panel live-card">
              <div className="panel-heading">
                <div>
                  <div className="section-kicker">RECOGNITION QUALITY</div>
                  <h3>Face recognition confidence</h3>
                  <p>
                    Confidence statistics for students recognized as present.
                  </p>
                </div>
              </div>

              <div className="live-box">
                <div className="camera-orbit">
                  <ShieldCheck size={31} />
                </div>

                <h4>
                  {confidenceValues.length > 0
                    ? `${confidenceValues.length} recognized student${
                        confidenceValues.length === 1 ? "" : "s"
                      }`
                    : "No recognition data"}
                </h4>

                <p>
                  Average confidence:{" "}
                  <b>
                    {confidenceValues.length > 0
                      ? `${(averageConfidence * 100).toFixed(1)}%`
                      : "—"}
                  </b>
                </p>

                <p>
                  Highest confidence:{" "}
                  <b>
                    {confidenceValues.length > 0
                      ? `${(highestConfidence * 100).toFixed(1)}%`
                      : "—"}
                  </b>
                </p>

                <span className="session-help">
                  Values come from recognition confidence stored with attendance
                  records.
                </span>
              </div>
            </section>
          </div>

          <section className="panel student-panel" style={{ marginTop: "20px" }}>
            <div className="panel-heading table-heading">
              <div>
                <div className="section-kicker">STUDENT PERFORMANCE</div>
                <h3>Recognition details</h3>
                <p>
                  Present students and their recorded face-recognition
                  confidence.
                </p>
              </div>
            </div>

            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>STUDENT</th>
                    <th>ROLL NO.</th>
                    <th>DEPARTMENT</th>
                    <th>TIME</th>
                    <th>CONFIDENCE</th>
                    <th>STATUS</th>
                  </tr>
                </thead>

                <tbody>
                  {analyticsStudents.length === 0 ? (
                    <tr>
                      <td colSpan="6">
                        <div className="empty-row">
                          No analytics data is available for this date.
                        </div>
                      </td>
                    </tr>
                  ) : (
                    analyticsStudents.map((student) => {
                      const initial =
                        student.name?.charAt(0)?.toUpperCase() || "?";
                      const isPresent = student.status === "Present";

                      return (
                        <tr
                          key={
                            student.student_id ??
                            student.id ??
                            student.roll_number
                          }
                        >
                          <td>
                            <div className="student-name">
                              <div className="student-avatar">{initial}</div>
                              <div>
                                <strong>{student.name}</strong>
                                <span>{student.email || "Registered student"}</span>
                              </div>
                            </div>
                          </td>
                          <td className="mono">{student.roll_number}</td>
                          <td>{student.department || "—"}</td>
                          <td>
                            <span className="time-cell">
                              <Clock3 size={14} />
                              {formatTime(student.time)}
                            </span>
                          </td>
                          <td>
                            {student.confidence != null ? (
                              <span className="confidence">
                                {(Number(student.confidence) * 100).toFixed(1)}%
                              </span>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td>
                            <span
                              className={`status-badge ${
                                isPresent ? "present" : "absent"
                              }`}
                            >
                              {isPresent ? (
                                <CheckCircle2 size={14} />
                              ) : (
                                <XCircle size={14} />
                              )}
                              {student.status}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </>
  );
}



function AuthPage({ onAuthenticated }) {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    college_name: "",
    department: "",
  });
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");

  function updateField(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  function switchMode(nextMode) {
    setMode(nextMode);
    setAuthError("");
  }

  async function submitAuth(event) {
    event.preventDefault();
    setAuthLoading(true);
    setAuthError("");

    try {
      const endpoint = mode === "login" ? "/auth/login" : "/auth/register";

      const body =
        mode === "login"
          ? {
              email: form.email.trim(),
              password: form.password,
            }
          : {
              name: form.name.trim(),
              email: form.email.trim(),
              password: form.password,
              college_name: form.college_name.trim(),
              department: form.department.trim() || null,
            };

      const response = await fetch(`${API_BASE}${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail || data.message || "Authentication failed"
        );
      }

      if (!data.access_token || !data.user) {
        throw new Error("Invalid authentication response from server");
      }

      onAuthenticated(data.user, data.access_token);
    } catch (err) {
      setAuthError(
        err.message || "Could not connect to the authentication server."
      );
    } finally {
      setAuthLoading(false);
    }
  }

  const pageStyle = {
    minHeight: "100vh",
    display: "grid",
    gridTemplateColumns: "minmax(360px, 0.95fr) minmax(520px, 1.05fr)",
    background:
      "radial-gradient(circle at top right, rgba(99,102,241,0.10), transparent 34%), linear-gradient(135deg, #f8fafc 0%, #ffffff 52%, #f1f5f9 100%)",
  };

  const brandSideStyle = {
    position: "relative",
    overflow: "hidden",
    padding: "56px",
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    background:
      "linear-gradient(160deg, #0f172a 0%, #111827 46%, #1e1b4b 100%)",
    color: "#ffffff",
  };

  const glowOne = {
    position: "absolute",
    width: "280px",
    height: "280px",
    borderRadius: "50%",
    background: "rgba(99,102,241,0.20)",
    filter: "blur(20px)",
    top: "-80px",
    right: "-90px",
  };

  const glowTwo = {
    position: "absolute",
    width: "220px",
    height: "220px",
    borderRadius: "50%",
    background: "rgba(56,189,248,0.10)",
    filter: "blur(28px)",
    bottom: "80px",
    left: "-90px",
  };

  const formSideStyle = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "48px 28px",
  };

  const cardStyle = {
    width: "100%",
    maxWidth: "560px",
    background: "rgba(255,255,255,0.96)",
    border: "1px solid #e2e8f0",
    borderRadius: "28px",
    padding: "38px",
    boxShadow: "0 24px 80px rgba(15, 23, 42, 0.10)",
    backdropFilter: "blur(12px)",
  };

  const fieldStyle = {
    width: "100%",
    padding: "14px 15px",
    border: "1px solid #cbd5e1",
    borderRadius: "13px",
    outline: "none",
    fontSize: "14px",
    boxSizing: "border-box",
    background: "#f8fafc",
    color: "#0f172a",
  };

  const labelStyle = {
    display: "grid",
    gap: "8px",
    fontSize: "13px",
    fontWeight: 700,
    color: "#334155",
  };

  return (
    <div style={pageStyle}>
      <section style={brandSideStyle}>
        <div style={glowOne} />
        <div style={glowTwo} />

        <div style={{ position: "relative", zIndex: 1 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              marginBottom: "88px",
            }}
          >
            <div
              style={{
                width: "46px",
                height: "46px",
                borderRadius: "14px",
                display: "grid",
                placeItems: "center",
                background: "rgba(255,255,255,0.12)",
                border: "1px solid rgba(255,255,255,0.10)",
              }}
            >
              <Sparkles size={22} color="#ffffff" />
            </div>
            <div>
              <h1
                style={{
                  margin: 0,
                  fontSize: "22px",
                  fontWeight: 800,
                  color: "#ffffff",
                  letterSpacing: "-0.02em",
                }}
              >
                FaceAttend
              </h1>
              <p
                style={{
                  margin: "4px 0 0",
                  color: "#cbd5e1",
                  fontSize: "12px",
                }}
              >
                AI Attendance System
              </p>
            </div>
          </div>

          <div style={{ maxWidth: "500px" }}>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                padding: "8px 12px",
                borderRadius: "999px",
                background: "rgba(129,140,248,0.12)",
                border: "1px solid rgba(165,180,252,0.18)",
                color: "#c7d2fe",
                fontSize: "11px",
                fontWeight: 800,
                letterSpacing: "0.10em",
                marginBottom: "22px",
              }}
            >
              <ShieldCheck size={15} />
              SMART COLLEGE ATTENDANCE
            </div>

            <h2
              style={{
                margin: 0,
                fontSize: "48px",
                lineHeight: 1.08,
                letterSpacing: "-0.04em",
                color: "#ffffff",
                fontWeight: 800,
              }}
            >
              Attendance powered by face recognition.
            </h2>

            <p
              style={{
                marginTop: "22px",
                marginBottom: 0,
                lineHeight: 1.8,
                color: "#cbd5e1",
                fontSize: "15px",
                maxWidth: "460px",
              }}
            >
              Create your teacher workspace, register students, start live
              attendance and review reports and analytics from one secure
              application.
            </p>

            <div
              style={{
                display: "grid",
                gap: "12px",
                marginTop: "34px",
                maxWidth: "410px",
              }}
            >
              {[
                "Teacher-based secure workspace",
                "Face recognition attendance",
                "Daily reports and analytics",
              ].map((item) => (
                <div
                  key={item}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    color: "#e2e8f0",
                    fontSize: "13px",
                  }}
                >
                  <div
                    style={{
                      width: "26px",
                      height: "26px",
                      borderRadius: "8px",
                      display: "grid",
                      placeItems: "center",
                      background: "rgba(255,255,255,0.08)",
                    }}
                  >
                    <CheckCircle2 size={15} color="#a5b4fc" />
                  </div>
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div
          style={{
            position: "relative",
            zIndex: 1,
            display: "flex",
            alignItems: "center",
            gap: "8px",
            color: "#94a3b8",
            fontSize: "12px",
          }}
        >
          <ShieldCheck size={15} />
          Secure teacher workspace
        </div>
      </section>

      <section style={formSideStyle}>
        <form style={cardStyle} onSubmit={submitAuth}>
          <div
            style={{
              display: "flex",
              gap: "8px",
              padding: "5px",
              background: "#f1f5f9",
              borderRadius: "13px",
              marginBottom: "28px",
            }}
          >
            <button
              type="button"
              onClick={() => switchMode("login")}
              style={{
                flex: 1,
                border: "none",
                borderRadius: "10px",
                padding: "10px 12px",
                background: mode === "login" ? "#ffffff" : "transparent",
                boxShadow:
                  mode === "login"
                    ? "0 2px 8px rgba(15,23,42,0.06)"
                    : "none",
                color: mode === "login" ? "#111827" : "#64748b",
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              Login
            </button>

            <button
              type="button"
              onClick={() => switchMode("register")}
              style={{
                flex: 1,
                border: "none",
                borderRadius: "10px",
                padding: "10px 12px",
                background: mode === "register" ? "#ffffff" : "transparent",
                boxShadow:
                  mode === "register"
                    ? "0 2px 8px rgba(15,23,42,0.06)"
                    : "none",
                color: mode === "register" ? "#111827" : "#64748b",
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              Create Account
            </button>
          </div>

          <div style={{ marginBottom: "26px" }}>
            <div
              style={{
                fontSize: "11px",
                fontWeight: 800,
                letterSpacing: "0.10em",
                color: "#4f46e5",
                marginBottom: "10px",
              }}
            >
              {mode === "login" ? "TEACHER LOGIN" : "NEW TEACHER WORKSPACE"}
            </div>

            <h2
              style={{
                margin: "0 0 8px",
                fontSize: "30px",
                lineHeight: 1.2,
                color: "#0f172a",
                letterSpacing: "-0.03em",
              }}
            >
              {mode === "login" ? "Welcome back" : "Create your account"}
            </h2>

            <p
              style={{
                margin: 0,
                color: "#64748b",
                fontSize: "14px",
                lineHeight: 1.7,
              }}
            >
              {mode === "login"
                ? "Sign in to continue to your FaceAttend dashboard."
                : "Set up a secure attendance workspace for your college."}
            </p>
          </div>

          {authError && (
            <div
              style={{
                padding: "12px 14px",
                marginBottom: "18px",
                borderRadius: "11px",
                border: "1px solid #fecaca",
                background: "#fff1f2",
                color: "#b91c1c",
                fontSize: "13px",
              }}
            >
              {authError}
            </div>
          )}

          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                mode === "register" ? "1fr 1fr" : "1fr",
              gap: "16px",
            }}
          >
            {mode === "register" && (
              <label style={labelStyle}>
                Teacher Name
                <input
                  style={fieldStyle}
                  name="name"
                  value={form.name}
                  onChange={updateField}
                  placeholder="Enter full name"
                  required
                />
              </label>
            )}

            <label style={labelStyle}>
              Email Address
              <input
                style={fieldStyle}
                type="email"
                name="email"
                value={form.email}
                onChange={updateField}
                placeholder="teacher@college.edu"
                required
              />
            </label>

            <label style={labelStyle}>
              Password
              <input
                style={fieldStyle}
                type="password"
                name="password"
                value={form.password}
                onChange={updateField}
                placeholder="Minimum 6 characters"
                minLength={6}
                required
              />
            </label>

            {mode === "register" && (
              <>
                <label style={labelStyle}>
                  College Name
                  <input
                    style={fieldStyle}
                    name="college_name"
                    value={form.college_name}
                    onChange={updateField}
                    placeholder="Enter college name"
                    required
                  />
                </label>

                <label style={labelStyle}>
                  Department
                  <input
                    style={fieldStyle}
                    name="department"
                    value={form.department}
                    onChange={updateField}
                    placeholder="e.g. Information Technology"
                  />
                </label>
              </>
            )}
          </div>

          <button
            type="submit"
            disabled={authLoading}
            style={{
              width: "100%",
              border: "none",
              borderRadius: "13px",
              padding: "15px 18px",
              marginTop: "24px",
              background:
                "linear-gradient(135deg, #111827 0%, #312e81 100%)",
              color: "#ffffff",
              fontSize: "14px",
              fontWeight: 800,
              cursor: authLoading ? "not-allowed" : "pointer",
              opacity: authLoading ? 0.7 : 1,
              boxShadow: "0 10px 24px rgba(49,46,129,0.18)",
            }}
          >
            {authLoading
              ? "Please wait..."
              : mode === "login"
              ? "Login to Dashboard"
              : "Create Teacher Account"}
          </button>

          <div
            style={{
              marginTop: "20px",
              paddingTop: "18px",
              borderTop: "1px solid #e2e8f0",
              textAlign: "center",
              fontSize: "13px",
              color: "#64748b",
            }}
          >
            {mode === "login"
              ? "Don't have a teacher account? "
              : "Already have an account? "}

            <button
              type="button"
              onClick={() =>
                switchMode(mode === "login" ? "register" : "login")
              }
              style={{
                border: "none",
                background: "transparent",
                padding: 0,
                color: "#4f46e5",
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              {mode === "login" ? "Create account" : "Login"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="loading-grid">
      <div className="skeleton hero-skeleton" />
      <div className="skeleton" />
      <div className="skeleton" />
      <div className="skeleton" />
      <div className="skeleton" />
    </div>
  );
}

function RegisterModal({ onClose, onRegistered, classes, defaultClassId }) {
  const [form, setForm] = useState({
    class_id: defaultClassId ? String(defaultClassId) : "",
    roll_number: "",
    name: "",
    email: "",
  });
  const [image, setImage] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!form.class_id && classes.length) {
      setForm((current) => ({
        ...current,
        class_id: String(defaultClassId || classes[0].id),
      }));
    }
  }, [classes, defaultClassId]);

  function updateField(e) {
    setForm((current) => ({
      ...current,
      [e.target.name]: e.target.value,
    }));
  }

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setMessage("");

    try {
      if (!form.class_id) {
        throw new Error("Select a class first.");
      }

      if (!image) {
        throw new Error("Select a student face image.");
      }

      const body = new FormData();
      body.append("class_id", form.class_id);
      body.append("roll_number", form.roll_number);
      body.append("name", form.name);
      body.append("email", form.email);
      body.append("image", image);

      const response = await apiFetch(`${API_BASE}/students/register`, {
        method: "POST",
        body,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Could not register student.");
      }

      await onRegistered();
    } catch (err) {
      setMessage(err.message || "Could not register student.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div className="section-kicker">SHARED CLASS STUDENT</div>
            <h3>Register student</h3>
            <p>
              Register the face once in a shared class. Teachers using that class
              will use the same student record.
            </p>
          </div>
          <button className="close-btn" onClick={onClose}>
            <X size={19} />
          </button>
        </div>

        <form onSubmit={submit}>
          <div className="form-grid">
            <label>
              Class
              <select
                name="class_id"
                value={form.class_id}
                onChange={updateField}
                required
              >
                <option value="">Select class</option>
                {classes.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.department} • Year {item.year} • Div {item.division} •{" "}
                    {item.academic_year}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Roll number
              <input
                name="roll_number"
                value={form.roll_number}
                onChange={updateField}
                required
              />
            </label>

            <label>
              Student name
              <input name="name" value={form.name} onChange={updateField} required />
            </label>

            <label>
              Email
              <input
                type="email"
                name="email"
                value={form.email}
                onChange={updateField}
                required
              />
            </label>

            <label style={{ gridColumn: "1 / -1" }}>
              Face image
              <input
                type="file"
                accept="image/png,image/jpeg"
                onChange={(e) => setImage(e.target.files?.[0] || null)}
                required
              />
            </label>
          </div>

          {classes.length === 0 && (
            <div className="form-message error">
              No class exists yet. Create a class from the Class & Subject setup
              above first.
            </div>
          )}

          {message && <div className="form-message error">{message}</div>}

          <div className="modal-actions">
            <button type="button" className="secondary-btn" onClick={onClose}>
              Cancel
            </button>
            <button
              className="primary-btn"
              type="submit"
              disabled={saving || classes.length === 0}
            >
              {saving ? "Registering..." : "Register Student"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}


export default App;