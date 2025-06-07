import { useState, useEffect } from "react"; // React hooks for state and lifecycle
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from "react-router-dom"; // Routing components
import { saveAs } from "file-saver"; // For file downloads (CSV/JSON)
import './Login.css';

// Main App component
function App() {
  const [user, setUser] = useState(null); // Holds the logged-in user object
  const [topics, setTopics] = useState([]); // Holds the list of thesis topics

  // Fetch topics from backend when user logs in
  useEffect(() => {
    if (user) {
      fetch("/api/topics", {
        headers: { Authorization: `Bearer ${user.token}` } // Send JWT token for auth
      })
        .then(res => res.json()) // Parse JSON response
        .then(setTopics) // Set topics state
        .catch(() => setTopics([])); // On error, clear topics
    }
  }, [user]); // Runs when user changes

  return (
    <Router>
      <Routes>
        {/* Route for login page */}
        <Route path="/login" element={<Login setUser={setUser} />} />
        {/* Route for logout */}
        <Route path="/logout" element={<Logout setUser={setUser} />} />
        {/* Protected routes for each role */}
        <Route path="/teacher" element={<PrivateRoute user={user} role="Διδάσκων"><Teacher user={user} topics={topics} setTopics={setTopics} /></PrivateRoute>} />
        <Route path="/teacher/topics" element={<PrivateRoute user={user} role="Διδάσκων"><TopicManagement user={user} topics={topics} setTopics={setTopics} /></PrivateRoute>} />
        <Route path="/teacher/assign" element={<PrivateRoute user={user} role="Διδάσκων"><InitialAssignment user={user} topics={topics} setTopics={setTopics} /></PrivateRoute>} />
        <Route path="/student" element={<PrivateRoute user={user} role="Φοιτητής"><Student user={user} topics={topics} /></PrivateRoute>} />
        <Route path="/admin" element={<PrivateRoute user={user} role="Γραμματεία"><Admin /></PrivateRoute>} />
        {/* Redirect all other routes to login */}
        <Route path="*" element={<Navigate to="/login" />} />
      </Routes>
    </Router>
  );
}

// Login component for all users
function Login({ setUser }) {
  const [username, setUsername] = useState(""); // Username input (student_number or email)
  const [password, setPassword] = useState(""); // Password input
  const navigate = useNavigate(); // Router navigation

  // Handles login button click
  const handleLogin = async (e) => {
    e.preventDefault();
    // Send login request to backend
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" }, // JSON body
      body: JSON.stringify({ username, password })
    });
    if (res.ok) {
      const data = await res.json(); // Get user and token
      setUser(data); // Save user in state
      // Redirect based on role
      if (data.role === "Διδάσκων") navigate("/teacher");
      else if (data.role === "Φοιτητής") navigate("/student");
      else if (data.role === "Γραμματεία") navigate("/admin");
    } else {
      alert("Λάθος στοιχεία σύνδεσης"); // Show error
    }
  };

  return (
    <div className="container">
      <div className="login-box">
        <h2>Login</h2>
        <form onSubmit={handleLogin}>
          <div className="input-box">
            <input
              type="text"
              required
              value={username}
              onChange={e => setUsername(e.target.value)}
            />
            <label>Username</label>
          </div>
          <div className="input-box">
            <input
              type="password"
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
            />
            <label>Password</label>
          </div>
          <button type="submit" className="btn">Login</button>
        </form>
      </div>
      {[...Array(50)].map((_, i) => (
        <span key={i} style={{ "--i": i }}></span>
      ))}
    </div>
  );
}

// Logout component
function Logout({ setUser }) {
  const navigate = useNavigate();

  useEffect(() => {
    setUser(null); // Clear user state
    navigate("/login"); // Redirect to login
  }, []);

  return null; // No UI
}

// Protects routes by role
function PrivateRoute({ user, role, children }) {
  if (!user) return <Navigate to="/login" />; // Not logged in
  if (user.role !== role) return <Navigate to="/login" />; // Wrong role
  return children; // Allowed
}

// Teacher dashboard
function Teacher({ user, topics, setTopics }) {
  const navigate = useNavigate();
  return (
    <div className="p-4 space-y-4">
      <h2 className="text-xl font-bold mb-4">Καλωσορίσατε Διδάσκων: {user.name}</h2>
      {/* Navigation buttons */}
      <button className="bg-blue-500 text-white px-4 py-2 rounded w-full" onClick={() => navigate("/teacher/topics")}>Προβολή και Δημιουργία θεμάτων προς ανάθεση</button>
      <button className="bg-blue-500 text-white px-4 py-2 rounded w-full" onClick={() => navigate("/teacher/assign")}>Αρχική Ανάθεση Θέματος σε Φοιτητή</button>
      {/* List of theses */}
      <ThesisList user={user} topics={topics} setTopics={setTopics} />
    </div>
  );
}

// List of theses for teacher
function ThesisList({ user, topics = [], setTopics }) {
  const [statusFilter, setStatusFilter] = useState(""); // Filter by status
  const [roleFilter, setRoleFilter] = useState(""); // Filter by role

  // Filter topics by status and role
  const filtered = (topics || []).filter(t => {
    const roleMatch = !roleFilter || t.professor === user.name;
    const statusMatch = !statusFilter || t.status === statusFilter;
    return roleMatch && statusMatch;
  });

  // Export filtered topics to CSV
  const exportToCSV = () => {
    const headers = ["Title", "Summary", "Status", "Student", "Role"];
    const rows = filtered.map(t => [t.title, t.summary, t.status || "-", t.assignedStudentName || "-", t.professor === user.name ? "Επιβλέπων" : "Μέλος"]);
    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    saveAs(blob, "thesis_list.csv");
  };

  // Export filtered topics to JSON
  const exportToJSON = () => {
    const json = JSON.stringify(filtered, null, 2);
    const blob = new Blob([json], { type: "application/json;charset=utf-8;" });
    saveAs(blob, "thesis_list.json");
  };

  return (
    <div className="p-4 border rounded mt-6">
      <h3 className="text-lg font-bold mb-2">Προβολή Λίστας Διπλωματικών</h3>
      {/* Filters and export buttons */}
      <div className="flex space-x-4 mb-4">
        <select className="border p-2" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">Όλες οι καταστάσεις</option>
          <option value="υπό ανάθεση">Υπό Ανάθεση</option>
          <option value="ενεργή">Ενεργή</option>
          <option value="περατωμένη">Περατωμένη</option>
          <option value="ακυρωμένη">Ακυρωμένη</option>
        </select>
        <select className="border p-2" value={roleFilter} onChange={e => setRoleFilter(e.target.value)}>
          <option value="">Όλοι οι ρόλοι</option>
          <option value="Επιβλέπων">Ως Επιβλέπων</option>
          <option value="Μέλος">Ως Μέλος Τριμελούς</option>
        </select>
        <button className="bg-green-500 text-white px-3 py-1" onClick={exportToCSV}>Εξαγωγή CSV</button>
        <button className="bg-green-500 text-white px-3 py-1" onClick={exportToJSON}>Εξαγωγή JSON</button>
      </div>
      {/* Render filtered topics */}
      {filtered.map(topic => (
        <div key={topic.id} className="border p-3 mb-2">
          <h4 className="font-bold">{topic.title}</h4>
          <p>{topic.summary}</p>
          <p>Κατάσταση: {topic.status || "--"}</p>
          <p>Φοιτητής: {topic.assignedStudentName || "--"}</p>
          <p>Ρόλος: {topic.professor === user.name ? "Επιβλέπων" : "Μέλος"}</p>
        </div>
      ))}
    </div>
  );
}

// Topic management for professors
function TopicManagement({ user, topics = [], setTopics }) {
  const [title, setTitle] = useState(""); // New topic title
  const [summary, setSummary] = useState(""); // New topic summary
  const [file, setFile] = useState(null); // New topic file

  // Add a new topic
  const handleAddTopic = async () => {
    if (!title || !summary) return alert("Συμπληρώστε όλα τα πεδία");
    const formData = new FormData();
    formData.append("title", title);
    formData.append("summary", summary);
    if (file) formData.append("file", file);

    // Send POST request to backend
    const res = await fetch("/api/topics", {
      method: "POST",
      headers: { Authorization: `Bearer ${user.token}` },
      body: formData
    });
    if (res.ok) {
      const newTopic = await res.json();
      setTopics([...topics, newTopic]); // Add new topic to state
      setTitle("");
      setSummary("");
      setFile(null);
    }
  };

  // Edit an existing topic
  const handleEdit = async (id, field, value) => {
    const res = await fetch(`/api/topics/${id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${user.token}`
      },
      body: JSON.stringify({ [field]: value })
    });
    if (res.ok) {
      setTopics(topics.map(topic => topic.id === id ? { ...topic, [field]: value } : topic));
    }
  };

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-4">
      <h2 className="text-xl font-bold">Δημιουργία Νέου Θέματος</h2>
      {/* New topic form */}
      <input className="border p-2 w-full" placeholder="Τίτλος" value={title} onChange={e => setTitle(e.target.value)} />
      <textarea className="border p-2 w-full" placeholder="Σύνοψη" value={summary} onChange={e => setSummary(e.target.value)} />
      <input type="file" accept="application/pdf" onChange={e => setFile(e.target.files[0])} />
      <button className="bg-green-500 text-white px-4 py-2" onClick={handleAddTopic}>Προσθήκη</button>

      <h2 className="text-xl font-bold mt-6">Τα Θέματά Μου</h2>
      {/* List of topics owned by professor */}
      {topics.filter(t => t.professor === user.name).map(topic => (
        <div key={topic.id} className="border p-4 mb-2">
          <input className="border p-2 w-full mb-2" value={topic.title} onChange={e => handleEdit(topic.id, "title", e.target.value)} />
          <textarea className="border p-2 w-full mb-2" value={topic.summary} onChange={e => handleEdit(topic.id, "summary", e.target.value)} />
          {topic.fileName && <p className="text-sm text-gray-600">Αρχείο: {topic.fileName}</p>}
        </div>
      ))}
    </div>
  );
}

// Initial assignment of topics to students (professor)
function InitialAssignment({ user, topics = [], setTopics }) {
  const [searchTerm, setSearchTerm] = useState(""); // Search input
  const [filteredStudents, setFilteredStudents] = useState([]); // Search results

  // Search for students
  const handleSearch = async () => {
    const res = await fetch(`/api/students?search=${encodeURIComponent(searchTerm)}`, {
      headers: { Authorization: `Bearer ${user.token}` }
    });
    if (res.ok) {
      setFilteredStudents(await res.json());
    }
  };

  // Topics available for assignment
  const availableTopics = topics.filter(
    t => t.professor === user.name && !t.assignedTo
  );

  // Assign topic to student
  const assignTopic = async (topicId, student) => {
    const res = await fetch(`/api/topics/${topicId}/assign`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${user.token}`
      },
      body: JSON.stringify({ studentId: student.id })
    });
    if (res.ok) {
      setTopics(topics.map(t =>
        t.id === topicId ? { ...t, assignedTo: student.student_number, assignedStudentName: student.name } : t
      ));
    }
  };

  // Unassign topic from student
  const unassignTopic = async (topicId) => {
    const res = await fetch(`/api/topics/${topicId}/unassign`, {
      method: "POST",
      headers: { Authorization: `Bearer ${user.token}` }
    });
    if (res.ok) {
      setTopics(topics.map(t =>
        t.id === topicId ? { ...t, assignedTo: null, assignedStudentName: null } : t
      ));
    }
  };

  return (
    <div className="p-4 max-w-4xl mx-auto space-y-6">
      <h2 className="text-xl font-bold">Αρχική Ανάθεση Θέματος σε Φοιτητή</h2>
      {/* Search form */}
      <div className="flex space-x-2">
        <input className="border p-2 flex-1" placeholder="Αναζήτηση με ΑΜ ή Όνομα" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
        <button className="bg-blue-500 text-white px-4 py-2" onClick={handleSearch}>Αναζήτηση</button>
      </div>
      {/* Search results */}
      {filteredStudents.length > 0 && (
        <div>
          <h3 className="font-semibold mt-4">Αποτελέσματα:</h3>
          {filteredStudents.map(student => (
            <div key={student.username} className="border p-4 my-2 rounded">
              <p>Όνομα: {student.name} | ΑΜ: {student.username}</p>
              <div className="mt-2 space-y-2">
                {availableTopics.map(topic => (
                  <div key={topic.id} className="border p-2">
                    <p><strong>{topic.title}</strong></p>
                    <p className="text-sm text-gray-600">{topic.summary}</p>
                    <button className="bg-green-500 text-white px-3 py-1 mt-2" onClick={() => assignTopic(topic.id, student)}>Ανάθεση Θέματος</button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      {/* List of assigned topics */}
      <div>
        <h3 className="font-semibold mt-8">Προσωρινές Αναθέσεις</h3>
        {topics.filter(t => t.professor === user.name && t.assignedTo).map(t => (
          <div key={t.id} className="border p-3 my-2">
            <p><strong>{t.title}</strong> - Ανατέθηκε στον {t.assignedStudentName} ({t.assignedTo})</p>
            <button className="bg-red-500 text-white px-3 py-1 mt-2" onClick={() => unassignTopic(t.id)}>Ανάκληση Ανάθεσης</button>
          </div>
        ))}
      </div>
    </div>
  );
}

// Υπολογισμός χρόνου από ανάθεση (π.χ. "2 μήνες, 3 μέρες")
function timeSince(dateString) {
  const now = new Date();
  const then = new Date(dateString);
  const diff = now - then;
  if (isNaN(diff) || diff < 0) return "--";
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const months = Math.floor(days / 30);
  const years = Math.floor(months / 12);
  if (years > 0) return `${years} έτη, ${months % 12} μήνες`;
  if (months > 0) return `${months} μήνες, ${days % 30} μέρες`;
  if (days > 0) return `${days} μέρες`;
  return "Λιγότερο από μέρα";
}

// Student dashboard
function Student({ user, topics = [] }) {
  // Show only topics assigned to this student
  const assignedTopics = (topics || []).filter(
    t => t.assignedTo === user.username
  );

  // State for modal and thesis details
  const [showDetails, setShowDetails] = useState(false);
  const [details, setDetails] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // State for profile modal
  const [showProfile, setShowProfile] = useState(false);
  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);

  // Fetch thesis details when modal opens
  const handleShowDetails = async (topic) => {
    setLoadingDetails(true);
    setShowDetails(true);
    try {
      const res = await fetch(`/api/thesis-details/${topic.id}`, {
        headers: { Authorization: `Bearer ${user.token}` }
      });
      if (res.ok) {
        setDetails(await res.json());
      } else {
        setDetails({ error: "Αποτυχία φόρτωσης λεπτομερειών." });
      }
    } catch {
      setDetails({ error: "Αποτυχία φόρτωσης λεπτομερειών." });
    }
    setLoadingDetails(false);
  };

  // Close thesis modal
  const handleCloseDetails = () => {
    setShowDetails(false);
    setDetails(null);
  };

  // Προβολή/Επεξεργασία προφίλ
  const handleShowProfile = async () => {
    setProfileLoading(true);
    setShowProfile(true);
    try {
      const res = await fetch("/api/student-profile", {
        headers: { Authorization: `Bearer ${user.token}` }
      });
      if (res.ok) {
        const data = await res.json();
        // Αν το data είναι undefined ή κενό αντικείμενο, εμφάνισε μήνυμα
        if (!data || Object.keys(data).length === 0) {
          setProfile({ error: "Δεν βρέθηκαν στοιχεία προφίλ." });
        } else {
          setProfile(data);
        }
      } else {
        setProfile({ error: "Αποτυχία φόρτωσης προφίλ." });
      }
    } catch {
      setProfile({ error: "Αποτυχία φόρτωσης προφίλ." });
    }
    setProfileLoading(false);
  };

  // Υποβολή φόρμας προφίλ
  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setProfileSaving(true);
    try {
      const res = await fetch("/api/student-profile", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${user.token}`
        },
        body: JSON.stringify(profile)
      });
      if (res.ok) {
        setShowProfile(false);
      } else {
        alert("Αποτυχία αποθήκευσης προφίλ.");
      }
    } catch {
      alert("Αποτυχία αποθήκευσης προφίλ.");
    }
    setProfileSaving(false);
  };

  // Ενημέρωση πεδίων προφίλ
  const handleProfileChange = (e) => {
    setProfile({ ...profile, [e.target.name]: e.target.value });
  };

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-4">
      <h2 className="text-xl font-bold">Η Διπλωματική μου</h2>
      {/* Κουμπί επεξεργασίας προφίλ */}
      <button
        className="bg-green-600 text-white px-3 py-1 mb-4"
        onClick={handleShowProfile}
      >
        Επεξεργασία Προφίλ
      </button>
      {assignedTopics.length === 0 && (
        <div className="text-gray-500">Δεν σας έχει ανατεθεί διπλωματική εργασία.</div>
      )}
      {assignedTopics.map(topic => (
        <div key={topic.id} className="border p-4 mb-2">
          <h4 className="font-bold">{topic.title}</h4>
          <p className="text-sm">Εισηγητής: {topic.professor}</p>
          <button
            className="bg-blue-500 text-white px-3 py-1 mt-2"
            onClick={() => handleShowDetails(topic)}
          >
            Προβολή θέματος
          </button>
        </div>
      ))}

      {/* Modal με λεπτομέρειες διπλωματικής */}
      {showDetails && (
        <div
          className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50"
          style={{ zIndex: 1000 }}
        >
          <div className="bg-white rounded shadow-lg p-6 max-w-lg w-full relative">
            <button
              className="absolute top-2 right-2 text-gray-500"
              onClick={handleCloseDetails}
            >
              &times;
            </button>
            {loadingDetails && <div>Φόρτωση...</div>}
            {!loadingDetails && details && (
              details.error ? (
                <div className="text-red-500">{details.error}</div>
              ) : (
                <div>
                  <h3 className="text-xl font-bold mb-2">{details.title}</h3>
                  <p className="mb-2">{details.summary}</p>
                  {details.fileName && (
                    <div className="mb-2">
                      <button
                        className="text-blue-600 underline"
                        style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}
                        onClick={async (e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          try {
                            const response = await fetch(`/uploads/${details.fileName}`);
                            if (!response.ok) {
                              alert("Το αρχείο δεν βρέθηκε στον server.");
                              return;
                            }
                            const blob = await response.blob();
                            // Επιτρέπουμε λήψη ανεξαρτήτως mime type (μερικοί browsers/servers δεν στέλνουν σωστό type)
                            const url = window.URL.createObjectURL(blob);
                            const a = document.createElement("a");
                            a.href = url;
                            a.download = details.fileName.endsWith('.pdf') ? details.fileName : "file.pdf";
                            document.body.appendChild(a);
                            a.click();
                            a.remove();
                            window.URL.revokeObjectURL(url);
                          } catch {
                            alert("Αποτυχία λήψης αρχείου από τον server.");
                          }
                        }}
                      >
                        Συνημμένο αρχείο περιγραφής
                      </button>
                    </div>
                  )}
                  <p className="mb-2">
                    <strong>Κατάσταση:</strong> {details.status || "--"}
                  </p>
                  <p className="mb-2">
                    <strong>Επίσημη ανάθεση:</strong>{" "}
                    {details.official_assignment_date
                      ? new Date(details.official_assignment_date).toLocaleString("el-GR")
                      : "--"}
                  </p>
                  {details.official_assignment_date && (
                    <p className="mb-2">
                      <strong>Χρόνος από ανάθεση:</strong>{" "}
                      {timeSince(details.official_assignment_date)}
                    </p>
                  )}
                  <div className="mb-2">
                    <strong>Επιτροπή:</strong>
                    {details.committee && details.committee.length > 0 ? (
                      <ul className="list-disc ml-6">
                        {details.committee.map((m, i) => (
                          <li key={i}>
                            {m.name} {m.surname} ({m.role})
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <span> Δεν έχουν οριστεί μέλη.</span>
                    )}
                  </div>
                </div>
              )
            )}
          </div>
        </div>
      )}

      {/* Modal επεξεργασίας προφίλ */}
      {showProfile && (
        <div
          className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50"
          style={{ zIndex: 1000 }}
        >
          <div className="bg-white rounded shadow-lg p-6 max-w-lg w-full relative">
            <button
              className="absolute top-2 right-2 text-gray-500"
              onClick={() => setShowProfile(false)}
            >
              &times;
            </button>
            {profileLoading && <div>Φόρτωση...</div>}
            {!profileLoading && profile && (
              profile.error ? (
                <div className="text-red-500">{profile.error}</div>
              ) : (
                <form onSubmit={handleSaveProfile} className="space-y-3">
                  <h3 className="text-xl font-bold mb-2">Επεξεργασία Προφίλ</h3>
                  <input
                    className="border p-2 w-full"
                    name="email"
                    placeholder="Email"
                    value={profile.email || ""}
                    onChange={handleProfileChange}
                  />
                  <input
                    className="border p-2 w-full"
                    name="mobile_telephone"
                    placeholder="Κινητό Τηλέφωνο"
                    value={profile.mobile_telephone || ""}
                    onChange={handleProfileChange}
                  />
                  <input
                    className="border p-2 w-full"
                    name="landline_telephone"
                    placeholder="Σταθερό Τηλέφωνο"
                    value={profile.landline_telephone || ""}
                    onChange={handleProfileChange}
                  />
                  <input
                    className="border p-2 w-full"
                    name="number"
                    placeholder="Αριθμός"
                    value={profile.number || ""}
                    onChange={handleProfileChange}
                  />
                  <input
                    className="border p-2 w-full"
                    name="city"
                    placeholder="Πόλη"
                    value={profile.city || ""}
                    onChange={handleProfileChange}
                  />
                  <input
                    className="border p-2 w-full"
                    name="postcode"
                    placeholder="Τ.Κ."
                    value={profile.postcode || ""}
                    onChange={handleProfileChange}
                  />
                  <button
                    className="bg-green-600 text-white px-4 py-2"
                    type="submit"
                    disabled={profileSaving}
                  >
                    Αποθήκευση
                  </button>
                </form>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Admin/secretary dashboard
function Admin() {
  return <div className="p-4">Καλωσορίσατε Γραμματεία</div>;
}

export default App;
