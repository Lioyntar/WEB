import { useState, useEffect } from "react"; // React hooks for state and lifecycle
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from "react-router-dom"; // Routing components
import { saveAs } from "file-saver"; // For file downloads (CSV/JSON)
import './App.css';

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
            <label>Email ή AM</label>
          </div>
          <div className="input-box">
            <input
              type="password"
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
            />
            <label>Κωδικός</label>
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

  // State for invitations modal
  const [showInvitations, setShowInvitations] = useState(false);
  const [invitations, setInvitations] = useState([]);
  const [loadingInvitations, setLoadingInvitations] = useState(false);
  const [inviteError, setInviteError] = useState("");

  // Load invitations
  const handleShowInvitations = async () => {
    setShowInvitations(true);
    setLoadingInvitations(true);
    setInviteError("");
    try {
      const res = await fetch("/api/invitations/received", {
        headers: { Authorization: `Bearer ${user.token}` }
      });
      if (res.ok) {
        setInvitations(await res.json());
      } else {
        setInviteError("Αποτυχία φόρτωσης προσκλήσεων.");
      }
    } catch {
      setInviteError("Αποτυχία φόρτωσης προσκλήσεων.");
    }
    setLoadingInvitations(false);
  };

  // Accept invitation
  const handleAccept = async (invitationId) => {
    setInviteError("");
    try {
      const res = await fetch(`/api/invitations/${invitationId}/accept`, {
        method: "POST",
        headers: { Authorization: `Bearer ${user.token}` }
      });
      if (res.ok) {
        setInvitations(invitations.filter(inv => inv.id !== invitationId));
      } else {
        const err = await res.json().catch(() => ({}));
        setInviteError(err.error || "Αποτυχία αποδοχής πρόσκλησης.");
      }
    } catch {
      setInviteError("Αποτυχία αποδοχής πρόσκλησης.");
    }
  };

  // Reject invitation
  const handleReject = async (invitationId) => {
    setInviteError("");
    try {
      const res = await fetch(`/api/invitations/${invitationId}/reject`, {
        method: "POST",
        headers: { Authorization: `Bearer ${user.token}` }
      });
      if (res.ok) {
        setInvitations(invitations.filter(inv => inv.id !== invitationId));
      } else {
        const err = await res.json().catch(() => ({}));
        setInviteError(err.error || "Αποτυχία απόρριψης πρόσκλησης.");
      }
    } catch {
      setInviteError("Αποτυχία απόρριψης πρόσκλησης.");
    }
  };

  // State for thesis management modal
  const [showManageTheses, setShowManageTheses] = useState(false);
  const [manageThesesLoading, setManageThesesLoading] = useState(false);
  const [manageTheses, setManageTheses] = useState([]);
  const [manageThesesError, setManageThesesError] = useState("");
  // --- Add state for cancel modal ---
  const [cancelModal, setCancelModal] = useState({ open: false, thesis: null, gsNumber: "", gsYear: "", error: "", loading: false });
  // --- Add state for active theses ---
  const [activeManageTheses, setActiveManageTheses] = useState([]);
  // --- Add state for under examination theses ---
  const [underExaminationTheses, setUnderExaminationTheses] = useState([]);
  const [underExaminationLoading, setUnderExaminationLoading] = useState(false);
  const [underExaminationError, setUnderExaminationError] = useState("");
  const [draftsByThesis, setDraftsByThesis] = useState({});
  
  // --- Add state for announcement text modal ---
  const [showAnnouncementModal, setShowAnnouncementModal] = useState(false);
  const [selectedThesisForAnnouncement, setSelectedThesisForAnnouncement] = useState(null);
  const [announcementText, setAnnouncementText] = useState("");
  const [announcementLoading, setAnnouncementLoading] = useState(false);
  const [announcementError, setAnnouncementError] = useState("");

  // Load theses under assignment for management (and active and under examination ones)
  const handleShowManageTheses = async () => {
    setShowManageTheses(true);
    setManageThesesLoading(true);
    setManageThesesError("");
    setManageTheses([]);
    setActiveManageTheses([]);
    setUnderExaminationTheses([]);
    setDraftsByThesis({});
    try {
      // Fetch all in parallel
      const [resUnder, resActive, resExamination] = await Promise.all([
        fetch("/api/teacher/theses-under-assignment", {
          headers: { Authorization: `Bearer ${user.token}` }
        }),
        fetch("/api/teacher/active-theses", {
          headers: { Authorization: `Bearer ${user.token}` }
        }),
        fetch("/api/teacher/under-examination-theses", {
          headers: { Authorization: `Bearer ${user.token}` }
        })
      ]);
      let ok = true;
      if (resUnder.ok) {
        setManageTheses(await resUnder.json());
      } else {
        setManageThesesError("Αποτυχία φόρτωσης διπλωματικών υπό ανάθεση.");
        ok = false;
      }
      if (resActive.ok) {
        setActiveManageTheses(await resActive.json());
      } else {
        setManageThesesError(prev => prev ? prev + "\n" + "Αποτυχία φόρτωσης ενεργών διπλωματικών." : "Αποτυχία φόρτωσης ενεργών διπλωματικών.");
        ok = false;
      }
      if (resExamination.ok) {
        const theses = await resExamination.json();
        setUnderExaminationTheses(theses);
        // Fetch drafts for each thesis
        const drafts = {};
        await Promise.all(
          theses.map(async (thesis) => {
            try {
              const res = await fetch(`/api/draft-submission/${thesis.id}`, {
                headers: { Authorization: `Bearer ${user.token}` }
              });
              if (res.ok) {
                drafts[thesis.id] = await res.json();
              } else {
                drafts[thesis.id] = null;
              }
            } catch {
              drafts[thesis.id] = null;
            }
          })
        );
        setDraftsByThesis(drafts);
      } else {
        setUnderExaminationError("Αποτυχία φόρτωσης διπλωματικών υπό εξέταση.");
        ok = false;
      }
      if (!ok) {
        if (!resUnder.ok && !resActive.ok && !resExamination.ok) {
          setManageTheses([]);
          setActiveManageTheses([]);
          setUnderExaminationTheses([]);
        }
      }
    } catch {
      setManageThesesError("Αποτυχία φόρτωσης διπλωματικών.");
      setManageTheses([]);
      setActiveManageTheses([]);
      setUnderExaminationTheses([]);
      setDraftsByThesis({});
    }
    setManageThesesLoading(false);
  };

  // --- Notes Modal State ---
  const [showNotesModal, setShowNotesModal] = useState(false);
  const [activeTheses, setActiveTheses] = useState([]);
  const [selectedThesisId, setSelectedThesisId] = useState(null);
  const [notes, setNotes] = useState([]);
  const [newNote, setNewNote] = useState("");
  const [notesLoading, setNotesLoading] = useState(false);
  const [notesError, setNotesError] = useState("");

  // Load active theses (status = 'ενεργή') for this professor
  const handleShowNotesModal = async () => {
    setShowNotesModal(true);
    setNotesError("");
    setNotes([]);
    setSelectedThesisId(null);
    setNewNote("");
    setNotesLoading(true);
    try {
      const res = await fetch("/api/teacher/active-theses", {
        headers: { Authorization: `Bearer ${user.token}` }
      });
      if (res.ok) {
        setActiveTheses(await res.json());
      } else {
        setActiveTheses([]);
        setNotesError("Αποτυχία φόρτωσης ενεργών διπλωματικών.");
      }
    } catch {
      setActiveTheses([]);
      setNotesError("Αποτυχία φόρτωσης ενεργών διπλωματικών.");
    }
    setNotesLoading(false);
  };

  // Load notes for selected thesis
  const handleSelectThesis = async (thesisId) => {
    setSelectedThesisId(thesisId);
    setNotes([]);
    setNotesError("");
    setNotesLoading(true);
    try {
      const res = await fetch(`/api/notes/${thesisId}`, {
        headers: { Authorization: `Bearer ${user.token}` }
      });
      if (res.ok) {
        setNotes(await res.json());
      } else {
        setNotes([]);
        setNotesError("Αποτυχία φόρτωσης σημειώσεων.");
      }
    } catch {
      setNotes([]);
      setNotesError("Αποτυχία φόρτωσης σημειώσεων.");
    }
    setNotesLoading(false);
  };

  // Add a new note
  const handleAddNote = async () => {
    if (!newNote.trim()) return;
    if (newNote.length > 300) {
      setNotesError("Το μέγιστο μήκος σημείωσης είναι 300 χαρακτήρες.");
      return;
    }
    setNotesError("");
    setNotesLoading(true);
    try {
      const res = await fetch(`/api/notes/${selectedThesisId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${user.token}`
        },
        body: JSON.stringify({ content: newNote })
      });
      if (res.ok) {
        const note = await res.json();
        setNotes([note, ...notes]);
        setNewNote("");
      } else {
        setNotesError("Αποτυχία αποθήκευσης σημείωσης.");
      }
    } catch {
      setNotesError("Αποτυχία αποθήκευσης σημείωσης.");
    }
    setNotesLoading(false);
  };

  // Helper: check if 2 years have passed since official_assignment_date
  function canCancelThesis(thesis) {
    if (!thesis.official_assignment_date || (thesis.status || '').trim().toLowerCase() !== "ενεργή") return false;
    // Parse as local date only (ignore time)
    const assignmentDate = new Date(thesis.official_assignment_date);
    const now = new Date();
    // Normalize both dates to YYYY-MM-DD (ignore time)
    const assignmentDateOnly = new Date(assignmentDate.getFullYear(), assignmentDate.getMonth(), assignmentDate.getDate());
    const nowDateOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const diff = nowDateOnly - assignmentDateOnly;
    const diffYears = diff / (1000 * 60 * 60 * 24 * 365.25);
    return diffYears >= 2;
  }

  // Cancel thesis handler
  const handleCancelThesis = async () => {
    if (!cancelModal.gsNumber || !cancelModal.gsYear) {
      setCancelModal(modal => ({ ...modal, error: "Συμπληρώστε αριθμό και έτος ΓΣ." }));
      return;
    }
    setCancelModal(modal => ({ ...modal, loading: true, error: "" }));
    try {
      const res = await fetch(`/api/theses/${cancelModal.thesis.id}/cancel-by-supervisor`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${user.token}`
        },
        body: JSON.stringify({
          cancel_gs_number: cancelModal.gsNumber,
          cancel_gs_year: cancelModal.gsYear
        })
      });
      if (res.ok) {
        // Update the thesis in manageTheses
        setManageTheses(theses =>
          theses.map(t =>
            t.id === cancelModal.thesis.id
              ? { ...t, status: "ακυρωμένη", cancellation_reason: "από Διδάσκοντα", cancel_gs_number: cancelModal.gsNumber, cancel_gs_year: cancelModal.gsYear }
              : t
          )
        );
        setCancelModal({ open: false, thesis: null, gsNumber: "", gsYear: "", error: "", loading: false });
      } else {
        const err = await res.json().catch(() => ({}));
        setCancelModal(modal => ({ ...modal, error: err.error || "Αποτυχία ακύρωσης." }));
      }
    } catch {
      setCancelModal(modal => ({ ...modal, error: "Αποτυχία ακύρωσης." }));
    }
    setCancelModal(modal => ({ ...modal, loading: false }));
  };

  // Handle announcement text modal
  const handleShowAnnouncementModal = async (thesis) => {
    setSelectedThesisForAnnouncement(thesis);
    setShowAnnouncementModal(true);
    setAnnouncementLoading(true);
    setAnnouncementError("");
    setAnnouncementText("");
    
    try {
      const res = await fetch(`/api/announcement-text/${thesis.id}`, {
        headers: { Authorization: `Bearer ${user.token}` }
      });
      
      if (res.ok) {
        const data = await res.json();
        setAnnouncementText(data.announcement_text || "");
      } else {
        const err = await res.json().catch(() => ({}));
        setAnnouncementError(err.error || "Αποτυχία φόρτωσης κειμένου ανακοίνωσης.");
      }
    } catch {
      setAnnouncementError("Αποτυχία φόρτωσης κειμένου ανακοίνωσης.");
    }
    
    setAnnouncementLoading(false);
  };

  // Save announcement text
  const handleSaveAnnouncement = async () => {
    if (!selectedThesisForAnnouncement) return;
    
    setAnnouncementLoading(true);
    setAnnouncementError("");
    
    try {
      const res = await fetch(`/api/announcement-text/${selectedThesisForAnnouncement.id}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${user.token}`
        },
        body: JSON.stringify({ announcement_text: announcementText })
      });
      
      if (res.ok) {
        setShowAnnouncementModal(false);
        // Refresh the theses data to show updated announcement text
        handleShowManageTheses();
      } else {
        const err = await res.json().catch(() => ({}));
        setAnnouncementError(err.error || "Αποτυχία αποθήκευσης κειμένου ανακοίνωσης.");
      }
    } catch {
      setAnnouncementError("Αποτυχία αποθήκευσης κειμένου ανακοίνωσης.");
    }
    
    setAnnouncementLoading(false);
  };

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-xl font-bold mb-4">Καλωσορίσατε Διδάσκων: {user.name}</h2>
      {/* Navigation buttons */}
      <button className="bg-blue-500 text-white px-4 py-2 rounded w-full" onClick={() => navigate("/teacher/topics")}>Προβολή και Δημιουργία θεμάτων προς ανάθεση</button>
      <button className="bg-blue-500 text-white px-4 py-2 rounded w-full" onClick={() => navigate("/teacher/assign")}>Αρχική Ανάθεση Θέματος σε Φοιτητή</button>
      <button className="bg-green-600 text-white px-4 py-2 rounded w-full" onClick={handleShowInvitations}>Προβολή προσκλήσεων συμμετοχής σε τριμελή</button>
      <button className="bg-purple-600 text-white px-4 py-2 rounded w-full" onClick={handleShowManageTheses}>Διαχείριση διπλωματικών εργασιών</button>
      <button className="bg-yellow-500 text-white px-4 py-2 rounded w-full" onClick={handleShowNotesModal}>
        Σημειώσεις διπλωματικών
      </button>
      {/* List of theses */}
      <ThesisList user={user} topics={topics} setTopics={setTopics} />

      {/* Modal for invitations */}
      {showInvitations && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white rounded shadow-lg p-6 max-w-lg w-full relative modal-content">
            <button className="absolute top-2 right-2 text-gray-500" onClick={() => setShowInvitations(false)}>&times;</button>
            {loadingInvitations ? (
              <div>Φόρτωση...</div>
            ) : (
              <div className="fade-in-content">
                <h3 className="text-xl font-bold mb-4">Προσκλήσεις για τριμελείς επιτροπές</h3>
                {inviteError && <div className="text-red-500">{inviteError}</div>}
                {invitations.length === 0 ? (
                  <div className="text-gray-500"><span className="text-white">Δεν υπάρχουν ενεργές προσκλήσεις.</span></div>
                ) : (
                  <ul>
                    {invitations.map(inv => (
                      <li key={inv.id} className="border p-3 mb-2 rounded bg-[#1f293a]">
                        <div>
                          <strong className="text-white">Μήνυμα:</strong> <span className="text-white">Πρόσκληση για την συμμετοχή σας στην τριμελή επιτροπή για την εξέταση της προπτυχιακής διπλωματικής μου εργασίας από τον φοιτητή {inv.student_name} {inv.student_surname} ({inv.student_number})</span>
                        </div>
                        <div>
                          <strong className="text-white">Θέμα:</strong> <span className="text-white">{inv.topic_title}</span>
                        </div>
                        <div>
                          <strong className="text-white">Κατάσταση:</strong> <span className="text-white">
                            {inv.status ? (
                              inv.status === "Αναμένεται" ? "Αναμένεται" :
                              inv.status === "Αποδεκτή" ? "Αποδεκτή" :
                              inv.status === "Απορρίφθηκε" ? "Απορρίφθηκε" :
                              inv.status
                            ) : "Αναμένεται"}
                          </span>
                        </div>
                        {(!inv.status || inv.status === "Αναμένεται") && (
                          <div className="mt-2 space-x-2">
                            <button className="bg-green-500 text-white px-3 py-1 rounded" onClick={() => handleAccept(inv.id)}>Αποδοχή</button>
                            <button className="bg-red-500 text-white px-3 py-1 rounded" onClick={() => handleReject(inv.id)}>Απόρριψη</button>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal for thesis management */}
      {showManageTheses && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white rounded shadow-lg p-6 max-w-2xl w-full relative modal-content">
            <button className="absolute top-2 right-2 text-gray-500" onClick={() => setShowManageTheses(false)}>&times;</button>
            <h3 className="text-xl font-bold mb-4">Διαχείριση διπλωματικών</h3>
            {manageThesesLoading ? (
              <div>Φόρτωση...</div>
            ) : manageThesesError ? (
              <div className="text-red-500">{manageThesesError}</div>
            ) : (
              <div>
                {/* Υπό ανάθεση */}
                <h4 className="text-lg font-semibold mb-2">Διαχείριση διπλωματικών υπό ανάθεση</h4>
                {manageTheses.length === 0 ? (
                  <div className="text-gray-500"><span className="text-white">Δεν υπάρχουν διπλωματικές υπό ανάθεση.</span></div>
                ) : (
                  manageTheses.map(thesis => (
                    <div key={thesis.id} className="border p-4 mb-4 rounded bg-[#1f293a]">
                      <div className="mb-2">
                        <strong className="text-white">Θέμα:</strong> <span className="text-white">{thesis.title}</span>
                      </div>
                      <div className="mb-2">
                        <strong className="text-white">Φοιτητής:</strong> <span className="text-white">{thesis.student_name} {thesis.student_surname} ({thesis.student_number})</span>
                      </div>
                      <div className="mb-2">
                        <strong className="text-white">Κατάσταση:</strong> <span className="text-white">{thesis.status}</span>
                        {thesis.status === "ακυρωμένη" && (
                          <div className="text-red-400 text-sm mt-1">
                            Ακυρώθηκε ({thesis.cancellation_reason || "από Διδάσκοντα"})
                            {thesis.cancel_gs_number && thesis.cancel_gs_year && (
                              <> - ΓΣ: {thesis.cancel_gs_number}/{thesis.cancel_gs_year}</>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="mb-2">
                        <strong className="text-white">Ημ/νία Οριστικής Ανάθεσης:</strong>{" "}
                        <span className="text-white">
                          {(() => {
                            if (!thesis.official_assignment_date) return "--";
                            let d = new Date(thesis.official_assignment_date);
                            if (isNaN(d.getTime())) {
                              d = new Date(thesis.official_assignment_date.replace(/-/g, "/"));
                            }
                            if (isNaN(d.getTime())) return "Μη έγκυρη ημερομηνία";
                            // DEBUG: diffYears
                            const assignmentDateOnly = new Date(d.getFullYear(), d.getMonth(), d.getDate());
                            const now = new Date();
                            const nowDateOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                            const diff = nowDateOnly - assignmentDateOnly;
                            const diffYears = diff / (1000 * 60 * 60 * 24 * 365.25);
                            return d.toLocaleDateString("el-GR") + ` (diffYears: ${diffYears.toFixed(3)})`;
                          })()}
                        </span>
                      </div>
                      {/* Cancel button if allowed */}
                      {canCancelThesis(thesis) && (
                        <button
                          className="bg-red-600 text-white px-3 py-1 rounded mt-2"
                          onClick={() =>
                            setCancelModal({
                              open: true,
                              thesis,
                              gsNumber: "",
                              gsYear: "",
                              error: "",
                              loading: false
                            })
                          }
                        >
                          Ακύρωση διπλωματικής (μόνο αν έχει παρέλθει 2ετία)
                        </button>
                      )}
                      <div className="mb-2">
                        <strong className="text-white">Μέλη/Προσκλήσεις:</strong>
                        {thesis.invitations && thesis.invitations.length === 0 ? (
                          <span className="text-white ml-2">Δεν υπάρχουν προσκλήσεις.</span>
                        ) : (
                          <table
                            className="w-full mt-2 text-white text-sm"
                            style={{ color: "#fff", minWidth: 0, width: "100%" }}
                          >
                            <thead>
                              <tr>
                                <th className="border px-1 py-1" style={{ color: "#fff", minWidth: "60px", width: "90px" }}>Όνομα</th>
                                <th className="border px-1 py-1" style={{ color: "#fff", minWidth: "60px", width: "110px" }}>Email</th>
                                <th className="border px-1 py-1" style={{ color: "#fff", minWidth: "60px", width: "70px" }}>Κατάσταση</th>
                                <th className="border px-1 py-1" style={{ color: "#fff", minWidth: "60px", width: "100px" }}>Ημ/νία Πρόσκλησης</th>
                                <th className="border px-1 py-1" style={{ color: "#fff", minWidth: "60px", width: "100px" }}>Ημ/νία Απάντησης</th>
                              </tr>
                            </thead>
                            <tbody>
                              {thesis.invitations && thesis.invitations.map(inv => (
                                <tr key={inv.id}>
                                  <td className="border px-1 py-1" style={{ color: "#fff", minWidth: "60px", width: "90px" }}>{inv.professor_name} {inv.professor_surname}</td>
                                  <td className="border px-1 py-1" style={{ color: "#fff", minWidth: "60px", width: "110px" }}>{inv.professor_email}</td>
                                  <td className="border px-1 py-1" style={{ color: "#fff", minWidth: "60px", width: "70px" }}>{inv.status}</td>
                                  <td className="border px-1 py-1" style={{ color: "#fff", minWidth: "60px", width: "100px" }}>{inv.invitation_date ? new Date(inv.invitation_date).toLocaleString("el-GR") : "--"}</td>
                                  <td className="border px-1 py-1" style={{ color: "#fff", minWidth: "60px", width: "100px" }}>{inv.response_date ? new Date(inv.response_date).toLocaleString("el-GR") : "--"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    </div>
                  ))
                )}
                {/* Ενεργές */}
                <h4 className="text-lg font-semibold mb-2 mt-6">Διαχείριση ενεργών διπλωματικών</h4>
                {activeManageTheses.length === 0 ? (
                  <div className="text-gray-500"><span className="text-white">Δεν υπάρχουν ενεργές διπλωματικές</span></div>
                ) : (
                  activeManageTheses.map(thesis => (
                    <div key={thesis.id} className="border p-4 mb-4 rounded bg-[#1f293a]">
                      <div className="mb-2">
                        <strong className="text-white">Θέμα:</strong> <span className="text-white">{thesis.title}</span>
                      </div>
                      <div className="mb-2">
                        <strong className="text-white">Φοιτητής:</strong> <span className="text-white">{thesis.student_name} {thesis.student_surname} ({thesis.student_number})</span>
                      </div>
                      <div className="mb-2">
                        <strong className="text-white">Κατάσταση:</strong> <span className="text-white">{thesis.status}</span>
                      </div>
                      <div className="mb-2">
                        <strong className="text-white">Ημ/νία Οριστικής Ανάθεσης:</strong>{" "}
                        <span className="text-white">
                          {(() => {
                            if (!thesis.official_assignment_date) return "--";
                            let d = new Date(thesis.official_assignment_date);
                            if (isNaN(d.getTime())) {
                              d = new Date(thesis.official_assignment_date.replace(/-/g, "/"));
                            }
                            if (isNaN(d.getTime())) return "Μη έγκυρη ημερομηνία";
                            // DEBUG: diffYears
                            const assignmentDateOnly = new Date(d.getFullYear(), d.getMonth(), d.getDate());
                            const now = new Date();
                            const nowDateOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                            const diff = nowDateOnly - assignmentDateOnly;
                            const diffYears = diff / (1000 * 60 * 60 * 24 * 365.25);
                            return d.toLocaleDateString("el-GR") + ` (diffYears: ${diffYears.toFixed(3)})`;
                          })()}
                        </span>
                      </div>
                      {/* Cancel button if allowed */}
                      {canCancelThesis(thesis) && (
                        <button
                          className="bg-red-600 text-white px-3 py-1 rounded mt-2"
                          onClick={() =>
                            setCancelModal({
                              open: true,
                              thesis,
                              gsNumber: "",
                              gsYear: "",
                              error: "",
                              loading: false
                            })
                          }
                        >
                          Διαγραφή διπλωματικής
                        </button>
                      )}
                      {/* ΝΕΟ: Κουμπί Θέσε ως υπό εξέταση */}
                      {(thesis.status || '').trim().toLowerCase() === "ενεργή" && (
                        <button
                          className="bg-blue-600 text-white px-3 py-1 rounded mt-2 ml-2"
                          onClick={async () => {
                            if (!window.confirm("Θέλετε να θέσετε τη διπλωματική ως 'Υπό Εξέταση';")) return;
                            try {
                              const res = await fetch(`/api/theses/${thesis.id}/set-under-examination`, {
                                method: "POST",
                                headers: { Authorization: `Bearer ${user.token}` }
                              });
                              if (res.ok) {
                                setActiveManageTheses(theses =>
                                  theses.map(t => t.id === thesis.id ? { ...t, status: "υπό εξέταση" } : t)
                                );
                              } else {
                                alert("Αποτυχία αλλαγής κατάστασης.");
                              }
                            } catch {
                              alert("Αποτυχία αλλαγής κατάστασης.");
                            }
                          }}
                        >
                          Θέσε ως υπό εξέταση
                        </button>
                      )}
                    </div>
                  ))
                )}
                {/* Υπό εξέταση */}
                <h4 className="text-lg font-semibold mb-2 mt-6">Διαχείριση διπλωματικών υπό εξέταση</h4>
                {underExaminationLoading ? (
                  <div>Φόρτωση...</div>
                ) : underExaminationError ? (
                  <div className="text-red-500">{underExaminationError}</div>
                ) : underExaminationTheses.length === 0 ? (
                  <div className="text-gray-500"><span className="text-white">Δεν υπάρχουν διπλωματικές υπό εξέταση</span></div>
                ) : (
                  underExaminationTheses.map(thesis => (
                    <div key={thesis.id} className="border p-4 mb-4 rounded bg-[#1f293a]">
                      <div className="mb-2">
                        <strong className="text-white">Θέμα:</strong> <span className="text-white">{thesis.title}</span>
                      </div>
                      <div className="mb-2">
                        <strong className="text-white">Φοιτητής:</strong> <span className="text-white">{thesis.student_name} {thesis.student_surname} ({thesis.student_number})</span>
                      </div>
                      <div className="mb-2">
                        <strong className="text-white">Κατάσταση:</strong> <span className="text-white">{thesis.status}</span>
                      </div>
                      <div className="mb-2">
                        <strong className="text-white">Ημ/νία Οριστικής Ανάθεσης:</strong>{" "}
                        <span className="text-white">
                          {thesis.official_assignment_date ? new Date(thesis.official_assignment_date).toLocaleDateString("el-GR") : "--"}
                        </span>
                      </div>
                      {/* Draft info */}
                      <div className="mb-2">
                        <strong style={{ color: "#0ef" }}>Πρόχειρη ανάρτηση:</strong>
                        {draftsByThesis[thesis.id] ? (
                          <div className="mt-2">
                            {draftsByThesis[thesis.id].file_path && (
                              <div>
                                <a
                                  href={`/draft_uploads/${draftsByThesis[thesis.id].file_path}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-blue-600 underline"
                                >
                                  Λήψη αρχείου
                                </a>
                              </div>
                            )}
                            {draftsByThesis[thesis.id].external_links && (
                              <div className="mt-2">
                                <strong style={{ color: "#0ef" }}>Σύνδεσμοι:</strong>
                                <ul className="list-disc ml-6">
                                  {draftsByThesis[thesis.id].external_links.split(/\r?\n/).map((link, i) => link.trim() && (
                                    <li key={i}>
                                      <a href={link} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">{link}</a>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            <div className="text-xs mt-2" style={{ color: "#fff" }}>Ανέβηκε: {draftsByThesis[thesis.id].uploaded_at && new Date(draftsByThesis[thesis.id].uploaded_at).toLocaleString("el-GR")}</div>
                          </div>
                        ) : (
                          <span className="text-white ml-2">Δεν έχει αναρτηθεί πρόχειρο αρχείο.</span>
                        )}
                      </div>
                      {/* Presentation Details */}
                      <div className="mb-2">
                        <strong style={{ color: "#0ef" }}>Λεπτομέρειες Παρουσίασης:</strong>
                        {thesis.presentation_details ? (
                          <div className="mt-2 p-3 bg-gray-800 rounded">
                            <p className="text-white"><strong>Ημερομηνία & Ώρα:</strong> {new Date(thesis.presentation_details.presentation_date).toLocaleString("el-GR")}</p>
                            <p className="text-white"><strong>Τρόπος:</strong> {thesis.presentation_details.mode}</p>
                            <p className="text-white"><strong>Τόπος/Σύνδεσμος:</strong> {thesis.presentation_details.location_or_link}</p>
                          </div>
                        ) : (
                          <span className="text-white ml-2">Δεν έχουν καταχωρηθεί λεπτομέρειες παρουσίασης.</span>
                        )}
                      </div>
                      {/* Announcement Text Button - only show if presentation details exist */}
                      {thesis.presentation_details && (
                        <button
                          className="bg-[#0ef] text-[#1f293a] px-3 py-1 rounded mt-2"
                          onClick={() => handleShowAnnouncementModal(thesis)}
                        >
                          Κείμενο Ανακοίνωσης Παρουσίασης
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      )}
      {/* Cancel modal (moved outside to be sibling, not child, of manage modal) */}
      {cancelModal.open && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-60">
          <div className="cancel-modal max-w-sm w-full relative">
            <button className="absolute top-2 right-2 text-gray-500" onClick={() => setCancelModal({ open: false, thesis: null, gsNumber: "", gsYear: "", error: "", loading: false })}>&times;</button>
            <h4 className="text-lg font-bold mb-2">Ακύρωση διπλωματικής</h4>
            <div className="mb-2">Συμπληρώστε αριθμό και έτος ΓΣ:</div>
            <div className="mb-2">
              <input
                type="text"
                placeholder="Αριθμός ΓΣ"
                value={cancelModal.gsNumber}
                onChange={e => setCancelModal(modal => ({ ...modal, gsNumber: e.target.value }))}
                className="border px-2 py-1 mr-2"
              />
              <input
                type="text"
                placeholder="Έτος ΓΣ"
                value={cancelModal.gsYear}
                onChange={e => setCancelModal(modal => ({ ...modal, gsYear: e.target.value }))}
                className="border px-2 py-1"
              />
            </div>
            {cancelModal.error && <div className="text-red-500 mb-2">{cancelModal.error}</div>}
            <button
              className="bg-red-600 text-white px-4 py-2 rounded"
              onClick={handleCancelThesis}
              disabled={cancelModal.loading}
            >
              Επιβεβαίωση Ακύρωσης
            </button>
          </div>
        </div>
      )}

      {/* Notes Modal */}
      {showNotesModal && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white rounded shadow-lg p-6 max-w-lg w-full relative modal-content">
            <button className="absolute top-2 right-2 text-gray-500" onClick={() => setShowNotesModal(false)}>&times;</button>
            <h3 className="text-xl font-bold mb-4">Σημειώσεις διπλωματικών</h3>
            {notesLoading && <div>Φόρτωση...</div>}
            {notesError && <div className="text-red-500">{notesError}</div>}
            {!notesLoading && (
              <>
                <div className="mb-4">
                  <label
                    className="block mb-2 font-semibold"
                    style={{ fontWeight: "bold", fontSize: "1em", marginLeft: 4 }}
                  >
                    Επιλέξτε διπλωματική:
                  </label>
                  <div className="input-box">
                    <select
                      value={selectedThesisId || ""}
                      onChange={e => handleSelectThesis(e.target.value)}
                    >
                      <option value="">-- Επιλογή --</option>
                      {activeTheses.map(th => (
                        <option key={th.id} value={th.id}>
                          {th.title} - {th.student_name} {th.student_surname} ({th.student_number})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                {selectedThesisId && (
                  <div>
                    <label style={{ fontWeight: "bold", fontSize: "1em", marginLeft: 4 }}>Νέα σημείωση</label>
                    <div className="mb-2 input-box">
                      <textarea
                        required
                        maxLength={300}
                        rows={5}
                        placeholder="Γράψτε νέα σημείωση (μέχρι 300 χαρακτήρες)"
                        value={newNote}
                        onChange={e => setNewNote(e.target.value)}
                      />
                      <div className="text-right text-xs" style={{ color: "#fff" }}>{newNote.length}/300</div>
                      <button
                        className="bg-blue-600 text-white px-3 py-1 mt-2 rounded"
                        onClick={handleAddNote}
                        disabled={notesLoading || !newNote.trim()}
                      >
                        Αποθήκευση σημείωσης
                      </button>
                    </div>
                    <div>
                      <h4 className="font-semibold mb-2">Οι σημειώσεις μου:</h4>
                      {notes.length === 0 && <div className="text-white">Δεν υπάρχουν σημειώσεις.</div>}
                      <ul className="space-y-2 max-h-48 overflow-y-auto">
                        {notes.map(note => (
                          <li key={note.id} className="border p-2 rounded bg-gray-100">
                            <div className="text-sm" style={{ color: "#fff" }}>{note.content}</div>
                            <div className="text-xs text-right" style={{ color: "#fff" }}>{new Date(note.created_at).toLocaleString("el-GR")}</div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
      
      {/* Announcement Text Modal */}
      {showAnnouncementModal && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white rounded shadow-lg p-6 max-w-2xl w-full relative modal-content">
            <button className="absolute top-2 right-2 text-gray-500" onClick={() => setShowAnnouncementModal(false)}>&times;</button>
            <h3 className="text-xl font-bold mb-4">Κείμενο Ανακοίνωσης Παρουσίασης</h3>
            {selectedThesisForAnnouncement && (
              <div className="mb-4">
                <p className="text-white"><strong>Διπλωματική:</strong> {selectedThesisForAnnouncement.title}</p>
                <p className="text-white"><strong>Φοιτητής:</strong> {selectedThesisForAnnouncement.student_name} {selectedThesisForAnnouncement.student_surname}</p>
              </div>
            )}
            {announcementLoading && <div>Φόρτωση...</div>}
            {announcementError && <div className="text-red-500 mb-4">{announcementError}</div>}
            {!announcementLoading && (
              <div>
                <div className="mb-4">
                  <label className="block mb-2 font-semibold" style={{ color: "#0ef" }}>Κείμενο Ανακοίνωσης:</label>
                  <div className="input-box">
                    <textarea
                      value={announcementText}
                      onChange={e => setAnnouncementText(e.target.value)}
                      rows={10}
                      placeholder="Γράψτε το κείμενο της ανακοίνωσης για την παρουσίαση της διπλωματικής..."
                    />
                  </div>
                </div>
                <div className="flex space-x-2">
                  <button
                    className="bg-[#0ef] text-[#1f293a] px-4 py-2 rounded"
                    onClick={handleSaveAnnouncement}
                    disabled={announcementLoading}
                  >
                    {announcementLoading ? "Αποθήκευση..." : "Αποθήκευση"}
                  </button>
                  <button
                    className="bg-gray-500 text-white px-4 py-2 rounded"
                    onClick={() => setShowAnnouncementModal(false)}
                    disabled={announcementLoading}
                  >
                    Ακύρωση
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
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
        <div className="input-box">
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="">Όλες οι καταστάσεις</option>
            <option value="υπό ανάθεση">Υπό Ανάθεση</option>
            <option value="ενεργή">Ενεργή</option>
            <option value="υπό εξέταση">Υπό Εξέταση</option>
            <option value="περατωμένη">Περατωμένη</option>
            <option value="ακυρωμένη">Ακυρωμένη</option>
          </select>
        </div>
        <div className="input-box">
          <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)}>
            <option value="">Όλοι οι ρόλοι</option>
            <option value="Επιβλέπων">Ως Επιβλέπων</option>
            <option value="Μέλος">Ως Μέλος Τριμελούς</option>
          </select>
        </div>
        <button className="bg-[#0ef] text-[#1f293a] px-3 py-1" onClick={exportToCSV}>Εξαγωγή CSV</button>
        <button className="bg-[#0ef] text-[#1f293a] px-3 py-1" onClick={exportToJSON}>Εξαγωγή JSON</button>
      </div>
      {/* Render filtered topics */}
      {filtered.map((topic, idx) => (
        <div key={topic.id} className="border p-3 mb-2 thesis-list-item">
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
      setTopics(topics => topics.map(topic => topic.id === id ? { ...topic, [field]: value } : topic));
    }
  };

  // Διαγραφή θέματος
  const handleDelete = async (id) => {
    if (!window.confirm("Θέλετε σίγουρα να διαγράψετε το θέμα;")) return;
    const res = await fetch(`/api/topics/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${user.token}` }
    });
    if (res.ok) {
      setTopics(topics => topics.filter(topic => topic.id !== id));
    }
  };

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-4">
      <h2 className="text-xl font-bold">Δημιουργία Νέου Θέματος</h2>
      {/* New topic form */}
      <div className="input-box">
        <input
          type="text"
          required
          value={title}
          onChange={e => setTitle(e.target.value)}
        />
        <label>Όνομα θέματος</label>
      </div>
      <div className="input-box">
        <textarea
          required
          value={summary}
          onChange={e => setSummary(e.target.value)}
        />
        <label>Σύνοψη</label>
      </div>
      <input type="file" accept="application/pdf" onChange={e => setFile(e.target.files[0])} />
      <button className="bg-[#0ef] text-[#1f293a] px-4 py-2 add-button" onClick={handleAddTopic}>Προσθήκη</button>

      <h2 className="text-xl font-bold mt-6">Τα Θέματά Μου</h2>
      {/* List of topics owned by professor */}
      {topics.filter(t => t.professor === user.name).map(topic => (
        <div key={topic.id} className="border p-4 mb-2 flex items-center">
          <div className="flex-1">
            <div className="input-box">
              <input
                type="text"
                value={topic.title}
                onChange={e => handleEdit(topic.id, "title", e.target.value)}
              />
              <label>Όνομα θέματος</label>
            </div>
            <div className="input-box">
              <textarea
                value={topic.summary}
                onChange={e => handleEdit(topic.id, "summary", e.target.value)}
              />
              <label>Σύνοψη</label>
            </div>
            {topic.fileName && <p className="text-sm text-white">Αρχείο: {topic.fileName}</p>}
          </div>
          <button
            className="ml-4 bg-red-600 text-white px-3 py-1 rounded"
            onClick={() => handleDelete(topic.id)}
            title="Διαγραφή θέματος"
          >
            Διαγραφή
          </button>
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
        <div className="input-box flex-1">
          <input
            type="text"
            required
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
          <label>Πληκτρολογίστε ΑΜ</label>
        </div>
        <button className="bg-[#0ef] text-[#1f293a] px-4 py-2" onClick={handleSearch}>Αναζήτηση</button>
      </div>
      {/* Search results */}
      {filteredStudents.length > 0 && (
        <div>
          <h3 className="font-semibold mt-4">Αποτελέσματα:</h3>
          {filteredStudents.map(student => (
            <div key={student.username} className="border p-4 my-2 rounded">
              <p>Όνομα: {student.name} | ΑΜ: {student.student_number}</p>
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

  // State for thesis management modal
  const [showManage, setShowManage] = useState(false);
  const [manageLoading, setManageLoading] = useState(false);
  const [committeeInvitations, setCommitteeInvitations] = useState([]);
  const [profSearch, setProfSearch] = useState("");
  const [profResults, setProfResults] = useState([]);
  const [manageError, setManageError] = useState("");

  // State for draft modal
  const [showDraftModal, setShowDraftModal] = useState(false);
  const [draftFile, setDraftFile] = useState(null);
  const [draftLinks, setDraftLinks] = useState("");
  const [draftLoading, setDraftLoading] = useState(false);
  const [draftError, setDraftError] = useState("");
  const [draftInfo, setDraftInfo] = useState(null);

  // State for presentation details modal
  const [showPresentationModal, setShowPresentationModal] = useState(false);
  const [presentationDate, setPresentationDate] = useState("");
  const [presentationTime, setPresentationTime] = useState("");
  const [presentationMode, setPresentationMode] = useState("");
  const [presentationLocation, setPresentationLocation] = useState("");
  const [presentationLoading, setPresentationLoading] = useState(false);
  const [presentationError, setPresentationError] = useState("");
  const [presentationInfo, setPresentationInfo] = useState(null);

  // Fetch thesis details when modal opens
  const handleShowDetails = async (topic) => {
    setLoadingDetails(true);
    setShowDetails(true);
    try {
      const res = await fetch(`/api/thesis-details/${topic.id}`, {
        headers: { Authorization: `Bearer ${user.token}` }
      });
      if (res.ok) {
        const data = await res.json();
        // Αν υπάρχει thesis, πρόσθεσε το thesis_id στο αντικείμενο details
        if (data && data.debug && data.debug.thesis_id) {
          data.thesis_id = data.debug.thesis_id;
        }
        setDetails(data);
        
        // Also fetch presentation details if we have a thesis_id
        const thesisId = data.thesis_id || data.id;
        if (thesisId) {
          try {
            const presRes = await fetch(`/api/presentation-details/${thesisId}`, {
              headers: { Authorization: `Bearer ${user.token}` }
            });
            if (presRes.ok) {
              const presData = await presRes.json();
              setPresentationInfo(presData);
            }
          } catch {
            // Ignore presentation details errors
          }
        }
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

  // Βρες τη διπλωματική του φοιτητή που είναι "υπό ανάθεση"
  const thesisUnderAssignment = details && details.status === "υπό ανάθεση" ? details : null;

  // Βρες το θέμα που έχει ανατεθεί στον φοιτητή (αν υπάρχει)
  const assignedTopic = (topics || []).find(t => t.assignedTo === user.username);

  // Βρες το id της διπλωματικής (thesis) με ασφαλή τρόπο
  let thesisId = null;
  if (details && details.debug && details.debug.thesis_id) {
    thesisId = details.debug.thesis_id;
  } else if (details && details.thesis_id) {
    thesisId = details.thesis_id;
  } else if (details && details.id) {
    thesisId = details.id;
  } else if (assignedTopic && assignedTopic.thesis_id) {
    thesisId = assignedTopic.thesis_id;
  } else if (assignedTopic && assignedTopic.id) {
    thesisId = assignedTopic.id;
  }
  const thesisStatus = details?.status || assignedTopic?.status;

  // Άνοιγμα modal διαχείρισης
  const handleShowManage = async () => {
    if (!thesisId) return;
    setShowManage(true);
    setManageLoading(true);
    setManageError("");
    try {
      const res = await fetch(`/api/thesis-invitations/${thesisId}`, {
        headers: { Authorization: `Bearer ${user.token}` }
      });
      if (res.ok) {
        setCommitteeInvitations(await res.json());
      } else {
        setCommitteeInvitations([]);
      }
    } catch {
      setCommitteeInvitations([]);
    }
    setManageLoading(false);
  };
  // Αναζήτηση διδάσκοντα με email
  const handleProfSearch = async () => {
    setManageError("");
    setProfResults([]);
    if (!profSearch) return;
    try {
      const res = await fetch(`/api/professors?search=${encodeURIComponent(profSearch)}`, {
        headers: { Authorization: `Bearer ${user.token}` }
      });
      if (res.ok) {
        setProfResults(await res.json());
      } else {
        setManageError("Δεν βρέθηκαν διδάσκοντες.");
      }
    } catch {
      setManageError("Σφάλμα αναζήτησης.");
    }
  };

  // Αποστολή πρόσκλησης
  const handleInvite = async (professorId) => {
    setManageError("");
    try {
      // Χρησιμοποίησε thesisId αντί για details.id για να δουλεύει πάντα
      const idToUse = thesisId;
      const res = await fetch(`/api/thesis-invitations/${idToUse}/invite`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${user.token}`
        },
        body: JSON.stringify({ professorId })
      });
      if (res.ok) {
        // Ενημέρωσε τις προσκλήσεις
        const updated = await fetch(`/api/thesis-invitations/${idToUse}`, {
          headers: { Authorization: `Bearer ${user.token}` }
        });
        setCommitteeInvitations(await updated.json());
      } else {
        // Διάβασε το error message από το backend
        const err = await res.json().catch(() => ({}));
        setManageError(err.error || "Αποτυχία αποστολής πρόσκλησης.");
      }
    } catch {
      setManageError("Αποτυχία αποστολής πρόσκλησης.");
    }
  };

  // Υπολογισμός αποδεκτών προσκλήσεων
  const acceptedCount = committeeInvitations.filter(inv => inv.status === "Αποδεκτή").length;

  // Fetch draft info when modal opens
  const handleShowDraftModal = async () => {
    setShowDraftModal(true);
    setDraftLoading(true);
    setDraftError("");
    setDraftInfo(null);
    try {
      const res = await fetch(`/api/draft-submission/${thesisId}`, {
        headers: { Authorization: `Bearer ${user.token}` }
      });
      if (res.ok) {
        setDraftInfo(await res.json());
      } else {
        setDraftInfo(null);
      }
    } catch {
      setDraftInfo(null);
    }
    setDraftLoading(false);
  };

  // Upload draft
  const handleDraftUpload = async (e) => {
    e.preventDefault();
    if (!thesisId) return;
    setDraftLoading(true);
    setDraftError("");
    try {
      const formData = new FormData();
      formData.append("thesisId", thesisId);
      if (draftFile) formData.append("file", draftFile);
      formData.append("externalLinks", draftLinks);
      const res = await fetch("/api/draft-submission", {
        method: "POST",
        headers: { Authorization: `Bearer ${user.token}` },
        body: formData
      });
      if (res.ok) {
        // Refresh info
        const infoRes = await fetch(`/api/draft-submission/${thesisId}`, {
          headers: { Authorization: `Bearer ${user.token}` }
        });
        setDraftInfo(await infoRes.json());
        setDraftFile(null);
        setDraftLinks("");
      } else {
        const err = await res.json().catch(() => ({}));
        setDraftError((err.error || "Αποτυχία ανάρτησης.") + (err.details ? `: ${err.details}` : ""));
      }
    } catch {
      setDraftError("Αποτυχία ανάρτησης.");
    }
    setDraftLoading(false);
  };

  // Fetch presentation details when modal opens
  const handleShowPresentationModal = async () => {
    setShowPresentationModal(true);
    setPresentationLoading(true);
    setPresentationError("");
    setPresentationInfo(null);
    setPresentationDate("");
    setPresentationTime("");
    setPresentationMode("");
    setPresentationLocation("");
    try {
      const res = await fetch(`/api/presentation-details/${thesisId}`, {
        headers: { Authorization: `Bearer ${user.token}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (data) {
          setPresentationInfo(data);
          // Parse the presentation date and time
          const dateTime = new Date(data.presentation_date);
          setPresentationDate(dateTime.toISOString().split('T')[0]);
          setPresentationTime(dateTime.toTimeString().slice(0, 5));
          setPresentationMode(data.mode);
          setPresentationLocation(data.location_or_link);
        }
      } else {
        setPresentationInfo(null);
      }
    } catch {
      setPresentationInfo(null);
    }
    setPresentationLoading(false);
  };

  // Save presentation details
  const handleSavePresentation = async (e) => {
    e.preventDefault();
    if (!thesisId) return;
    if (!presentationDate || !presentationTime || !presentationMode || !presentationLocation) {
      setPresentationError("Συμπληρώστε όλα τα πεδία.");
      return;
    }
    
    // Validate that the presentation date is in the future
    const presentationDateTime = new Date(`${presentationDate}T${presentationTime}:00`);
    const now = new Date();
    if (presentationDateTime <= now) {
      setPresentationError("Η ημερομηνία και ώρα παρουσίασης πρέπει να είναι στο μέλλον.");
      return;
    }
    
    setPresentationLoading(true);
    setPresentationError("");
    try {
      // Create proper ISO datetime string for backend
      const presentationDateTimeString = `${presentationDate}T${presentationTime}:00`;
      
      const res = await fetch("/api/presentation-details", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${user.token}`
        },
        body: JSON.stringify({
          thesisId,
          presentationDate: presentationDateTimeString,
          mode: presentationMode,
          locationOrLink: presentationLocation
        })
      });
      
      if (res.ok) {
        // Refresh info
        const infoRes = await fetch(`/api/presentation-details/${thesisId}`, {
          headers: { Authorization: `Bearer ${user.token}` }
        });
        const data = await infoRes.json();
        if (data) {
          setPresentationInfo(data);
          const dateTime = new Date(data.presentation_date);
          setPresentationDate(dateTime.toISOString().split('T')[0]);
          setPresentationTime(dateTime.toTimeString().slice(0, 5));
          setPresentationMode(data.mode);
          setPresentationLocation(data.location_or_link);
        }
        // Close modal on success
        setShowPresentationModal(false);
      } else {
        const err = await res.json().catch(() => ({}));
        setPresentationError(err.error || err.details || "Αποτυχία αποθήκευσης.");
      }
    } catch (err) {
      console.error('Presentation save error:', err);
      setPresentationError("Αποτυχία αποθήκευσης.");
    }
    setPresentationLoading(false);
  };

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-4">
      <h2 className="text-xl font-bold">Η Διπλωματική μου</h2>
      {/* Κουμπί επεξεργασίας προφίλ */}
      <button
        className="bg-[#0ef] text-white px-3 py-1 mb-4"
        onClick={handleShowProfile}
      >
        Επεξεργασία Προφίλ
      </button>
      {/* Κουμπί διαχείρισης διπλωματικής */}
      {assignedTopic && (
        <>
          <button
            className="bg-[#0ef] text-white px-3 py-1 mb-4 ml-2"
            onClick={handleShowManage}
            disabled={!thesisStatus || thesisStatus.trim().toLowerCase() !== "υπό ανάθεση"}
          >
            Διαχείριση διπλωματικής εργασίας
          </button>
          <button
            className="bg-[#0ef] text-white px-3 py-1 mb-4 ml-2"
            onClick={handleShowDraftModal}
            disabled={!assignedTopic || !thesisId}
          >
            Πρόχειρη Ανάρτηση
          </button>
          <button
            className="bg-[#0ef] text-white px-3 py-1 mb-4 ml-2"
            onClick={handleShowPresentationModal}
            disabled={!assignedTopic || !thesisId}
          >
            Λεπτομέρειες Παρουσίασης
          </button>
        </>
      )}
      {assignedTopics.length === 0 && (
        <div className="text-white">Δεν σας έχει ανατεθεί διπλωματική εργασία.</div>
      )}
      {assignedTopics.map(topic => (
        <div key={topic.id} className="border p-4 mb-2">
          <h4 className="font-bold">{topic.title}</h4>
          <p className="text-sm">Εισηγητής: {topic.professor}</p>
          <button
            className="bg-[#0ef] text-white px-3 py-1 mt-2"
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
          <div className="bg-white rounded shadow-lg p-6 max-w-lg w-full relative modal-content">
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
                        style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "white" }}
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
                  <div className="mb-2 fade-in-committee">
                    <strong>Επιτροπή:</strong>
                    {details.committee && details.committee.length > 0 ? (
                      <ul className="list-disc ml-6 fade-in-committee">
                        {details.committee.map((m, i) => (
                          <li key={i} className="fade-in-committee">
                            <span style={{ color: "#0ef" }}>{m.name} {m.surname} ({m.role})</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <span className="fade-in-committee"> Δεν έχουν οριστεί μέλη.</span>
                    )}
                  </div>
                  {/* Presentation Details */}
                  <div className="mb-2">
                    <strong style={{ color: "#0ef" }}>Λεπτομέρειες Παρουσίασης:</strong>
                    {presentationInfo ? (
                      <div className="mt-2 p-3 bg-gray-100 rounded">
                        <p><strong>Ημερομηνία & Ώρα:</strong> {new Date(presentationInfo.presentation_date).toLocaleString("el-GR")}</p>
                        <p><strong>Τρόπος:</strong> {presentationInfo.mode}</p>
                        <p><strong>Τόπος/Σύνδεσμος:</strong> {presentationInfo.location_or_link}</p>
                      </div>
                    ) : (
                      <span className="ml-2">Δεν έχουν καταχωρηθεί λεπτομέρειες παρουσίασης.</span>
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
          <div className="modal-content">
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
                <form onSubmit={handleSaveProfile} className="space-y-3 profile-form">
                  <h3 className="text-xl font-bold mb-2">Επεξεργασία Προφίλ</h3>
                  <div className="input-box">
                    <input
                      type="email"
                      required
                      value={profile.email || ""}
                      onChange={handleProfileChange}
                      name="email"
                    />
                    <label>Email</label>
                  </div>
                  <div className="input-box">
                    <input
                      type="tel"
                      required
                      value={profile.mobile_telephone || ""}
                      onChange={handleProfileChange}
                      name="mobile_telephone"
                    />
                    <label>Κινητό Τηλέφωνο</label>
                  </div>
                  <div className="input-box">
                    <input
                      type="tel"
                      required
                      value={profile.landline_telephone || ""}
                      onChange={handleProfileChange}
                      name="landline_telephone"
                    />
                    <label>Σταθερό Τηλέφωνο</label>
                  </div>
                  <div className="input-box">
                    <input
                      type="text"
                      required
                      value={profile.number || ""}
                      onChange={handleProfileChange}
                      name="number"
                    />
                    <label>Αριθμός</label>
                  </div>
                  <div className="input-box">
                    <input
                      type="text"
                      required
                      value={profile.city || ""}
                      onChange={handleProfileChange}
                      name="city"
                    />
                    <label>Πόλη</label>
                  </div>
                  <div className="input-box">
                    <input
                      type="text"
                      required
                      value={profile.postcode || ""}
                      onChange={handleProfileChange}
                      name="postcode"
                    />
                    <label>Τ.Κ.</label>
                  </div>
                  <button
                    className="bg-[#0ef] text-[#1f293a] px-4 py-2"
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

      {/* Modal διαχείρισης διπλωματικής */}
      {showManage && (
    <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50" style={{ zIndex: 1000 }}>
        <div className="bg-white rounded shadow-lg p-6 max-w-lg w-full relative modal-content">
            <button className="absolute top-2 right-2 text-gray-500" onClick={() => setShowManage(false)}>&times;</button>
            {manageLoading ? (
                <div>Φόρτωση...</div>
            ) : (
                <div className="fade-in-content">
                    <h3 className="text-xl font-bold mb-4">Διαχείριση Τριμελούς Επιτροπής</h3>
                    <div className="mb-4">
                        <strong className="text-lg">Προσκληθέντες:</strong>
                        <ul className="mt-2 space-y-2">
                            {committeeInvitations.map(inv => (
                                <li key={inv.id} className="border p-3 rounded">
                                    <span className="text-white">{inv.professor_name} ({inv.professor_email})</span> - 
                                    <span className="text-white ml-2">
                                        {inv.status === "Αποδεκτή" ? "Αποδέχθηκε" : inv.status === "Αναμένεται" ? "Εκκρεμεί" : "Απορρίφθηκε"}
                                    </span>
                                </li>
                            ))}
                        </ul>
                        {acceptedCount >= 2 && (
                            <div className="text-white font-bold mt-2">Η εργασία έγινε ενεργή. Οι υπόλοιπες προσκλήσεις ακυρώθηκαν.</div>
                        )}
                    </div>
                    {acceptedCount < 2 && (
                        <>
                            <div className="mb-4">
                                <div className="input-box">
                                    <input
                                        type="text"
                                        required
                                        value={profSearch}
                                        onChange={e => setProfSearch(e.target.value)}
                                    />
                                    <label>Αναζήτηση διδάσκοντα με email</label>
                                </div>
                                <button className="bg-[#0ef] text-[#1f293a] px-4 py-2 mt-4 w-full" onClick={handleProfSearch}>Αναζήτηση</button>
                            </div>
                            {manageError && <div style={{ color: '#0ef' }}>{manageError}</div>}
                            {profResults.length > 0 && (
                                <div className="mb-4">
                                    <ul className="space-y-2">
                                        {profResults.map(prof => (
                                            <li key={prof.id} className="border p-3 rounded">
                                                <span className="text-white">{prof.name} ({prof.email})</span>
                                                <button
                                                    className="ml-2 bg-[#0ef] text-[#1f293a] px-3 py-1 rounded"
                                                    onClick={() => handleInvite(prof.id)}
                                                    disabled={committeeInvitations.some(inv => inv.professor_id === prof.id)}
                                                >
                                                    Πρόσκληση
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}
        </div>
    </div>
)}
      {/* Modal πρόχειρης ανάρτησης */}
      {showDraftModal && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50" style={{ zIndex: 1000 }}>
          <div className="bg-white rounded shadow-lg p-6 max-w-lg w-full relative modal-content">
            <button className="absolute top-2 right-2 text-gray-500" onClick={() => setShowDraftModal(false)}>&times;</button>
            <h3 className="text-xl font-bold mb-4">Πρόχειρη Ανάρτηση Διπλωματικής</h3>
            {draftLoading && <div>Φόρτωση...</div>}
            {draftError && <div className="text-red-500">{draftError}</div>}
            {!draftLoading && (
              <form onSubmit={handleDraftUpload}>
                <div className="mb-4">
                  <label className="block mb-2 font-semibold">Ανέβασμα αρχείου (PDF):</label>
                  <input type="file" accept="application/pdf" onChange={e => setDraftFile(e.target.files[0])} />
                </div>
                <label>Σύνδεσμοι προς υλικό (π.χ. Google Drive, YouTube):</label>
                <div className="mb-4 input-box">
                  <textarea
                    rows={3}
                    value={draftLinks}
                    onChange={e => setDraftLinks(e.target.value)}
                    placeholder="Ένας ή περισσότεροι σύνδεσμοι, διαχωρισμένοι με enter"
                  />
                </div>
                <button className="bg-[#0ef] text-[#1f293a] px-4 py-2" type="submit" disabled={draftLoading}>Ανάρτηση</button>
              </form>
            )}
            {/* Εμφάνιση υπάρχουσας ανάρτησης */}
            {draftInfo && (
              <div className="mt-6">
                <h4 className="font-semibold mb-2">Τελευταία ανάρτηση:</h4>
                {draftInfo.file_path && (
                  <div>
                    <a
                      href={`/draft_uploads/${draftInfo.file_path}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 underline"
                    >
                      Λήψη αρχείου
                    </a>
                  </div>
                )}
                {draftInfo.external_links && (
                  <div className="mt-2">
                    <strong style={{ color: "#0ef" }}>Σύνδεσμοι:</strong>
                    <ul className="list-disc ml-6">
                      {draftInfo.external_links.split(/\r?\n/).map((link, i) => link.trim() && (
                        <li key={i}>
                          <a href={link} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">{link}</a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="text-xs mt-2" style={{ color: "#fff" }}>Ανέβηκε: {draftInfo.uploaded_at && new Date(draftInfo.uploaded_at).toLocaleString("el-GR")}</div>
              </div>
            )}
          </div>
        </div>
      )}
      {/* Presentation Details Modal */}
      {showPresentationModal && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50" style={{ zIndex: 1000 }}>
          <div className="bg-white rounded shadow-lg p-6 max-w-lg w-full relative modal-content">
            <button className="absolute top-2 right-2 text-gray-500" onClick={() => setShowPresentationModal(false)}>&times;</button>
            <h3 className="text-xl font-bold mb-4">Λεπτομέρειες Παρουσίασης</h3>
            {presentationLoading && <div>Φόρτωση...</div>}
            {presentationError && <div className="text-red-500">{presentationError}</div>}
            {!presentationLoading && (
              <form onSubmit={handleSavePresentation}>
                <div className="mb-4">
                  <label className="block mb-2 font-semibold">Ημερομηνία Παρουσίασης:</label>
                  <input
                    type="date"
                    value={presentationDate}
                    onChange={e => setPresentationDate(e.target.value)}
                    className="w-full p-2 border rounded"
                    required
                  />
                </div>
                <div className="mb-4">
                  <label className="block mb-2 font-semibold">Ώρα Παρουσίασης:</label>
                  <input
                    type="time"
                    value={presentationTime}
                    onChange={e => setPresentationTime(e.target.value)}
                    className="w-full p-2 border rounded"
                    required
                  />
                </div>
                <div className="mb-4">
                  <label className="block mb-2 font-semibold">Τρόπος Παρουσίασης:</label>
                  <select
                    value={presentationMode}
                    onChange={e => setPresentationMode(e.target.value)}
                    className="w-full p-2 border rounded"
                    required
                  >
                    <option value="">-- Επιλογή --</option>
                    <option value="δια ζώσης">Δια ζώσης</option>
                    <option value="διαδικτυακά">Διαδικτυακά</option>
                  </select>
                </div>
                <div className="mb-4">
                  <label className="block mb-2 font-semibold">
                    {presentationMode === "δια ζώσης" ? "Αίθουσα Εξέτασης:" : 
                     presentationMode === "διαδικτυακά" ? "Σύνδεσμος Σύνδεσης:" : 
                     "Αίθουσα/Σύνδεσμος:"}
                  </label>
                  <input
                    type="text"
                    value={presentationLocation}
                    onChange={e => setPresentationLocation(e.target.value)}
                    className="w-full p-2 border rounded"
                    placeholder={presentationMode === "δια ζώσης" ? "π.χ. Αίθουσα 101" : 
                                 presentationMode === "διαδικτυακά" ? "π.χ. https://meet.google.com/..." : 
                                 "Εισάγετε αίθουσα ή σύνδεσμο"}
                    required
                  />
                </div>
                <button 
                  className="bg-[#0ef] text-[#1f293a] px-4 py-2 rounded w-full" 
                  type="submit" 
                  disabled={presentationLoading}
                >
                  {presentationLoading ? "Αποθήκευση..." : "Αποθήκευση"}
                </button>
              </form>
            )}
            {/* Εμφάνιση υπάρχουσας παρουσίασης */}
            {presentationInfo && (
              <div className="mt-6 p-4 bg-gray-100 rounded">
                <h4 className="font-semibold mb-2">Τελευταία καταχώρηση:</h4>
                <p><strong>Ημερομηνία & Ώρα:</strong> {new Date(presentationInfo.presentation_date).toLocaleString("el-GR")}</p>
                <p><strong>Τρόπος:</strong> {presentationInfo.mode}</p>
                <p><strong>Τόπος/Σύνδεσμος:</strong> {presentationInfo.location_or_link}</p>
                <p className="text-xs mt-2">Ενημερώθηκε: {new Date(presentationInfo.created_at).toLocaleString("el-GR")}</p>
              </div>
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

