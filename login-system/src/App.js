import { useState, useEffect } from "react"; // React hooks for state and lifecycle
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from "react-router-dom"; // Routing components
import { saveAs } from "file-saver"; // For file downloads (CSV/JSON)
import './App.css';

// Helper function for secure file download with Authorization header
async function downloadFileWithAuth(url, filename, token) {
  try {
    const response = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined
    });
    if (!response.ok) {
      alert("Το αρχείο δεν βρέθηκε στον server.");
      return;
    }
    const blob = await response.blob();
    const downloadUrl = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = downloadUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(downloadUrl);
  } catch {
    alert("Αποτυχία λήψης αρχείου από τον server.");
  }
}
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
        <Route path="/admin" element={<PrivateRoute user={user} role="Γραμματεία"><Admin user={user} /></PrivateRoute>} />
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
  
  // --- Add state for grades modal ---
  const [showGradesModal, setShowGradesModal] = useState(false);
  const [selectedThesisForGrades, setSelectedThesisForGrades] = useState(null);
  const [grades, setGrades] = useState([]);
  const [gradesLoading, setGradesLoading] = useState(false);
  const [gradesError, setGradesError] = useState("");
  const [myGrade, setMyGrade] = useState({
    quality: 0,
    timeline: 0,
    completeness: 0,
    presentation: 0
  });
  const [totalGrade, setTotalGrade] = useState(0);

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

  // Handle grades modal
  const handleShowGradesModal = async (thesis) => {
    console.log('Opening grades modal for thesis:', thesis);
    console.log('Current user object:', user);
    console.log('User ID type:', typeof user.id, 'User ID value:', user.id);
    console.log('Thesis ID type:', typeof thesis.id, 'Thesis ID value:', thesis.id);
    console.log('Full thesis object:', JSON.stringify(thesis, null, 2));
    
    setSelectedThesisForGrades(thesis);
    setShowGradesModal(true);
    setGradesLoading(true);
    setGradesError("");
    setGrades([]);
    setMyGrade({
      quality: 0,
      timeline: 0,
      completeness: 0,
      presentation: 0
    });
    setTotalGrade(0);
    
    try {
      console.log('Fetching grades for thesis:', thesis.id, 'User ID:', user.id);
      const res = await fetch(`/api/grades/${thesis.id}`, {
        headers: { Authorization: `Bearer ${user.token}` }
      });
      
      console.log('Grades response status:', res.status);
      
      if (res.ok) {
        const data = await res.json();
        console.log('Grades data received:', data);
        setGrades(data);
        
        // Find my grade if exists
        const myGradeData = data.find(g => g.professor_id === user.id);
        console.log('My grade data:', myGradeData);
        if (myGradeData) {
          setMyGrade(myGradeData.criteria);
          setTotalGrade(myGradeData.grade);
        }
      } else {
        const err = await res.json().catch(() => ({}));
        console.error('Grades fetch error:', err);
        setGradesError(err.error || err.details || "Αποτυχία φόρτωσης βαθμών.");
      }
    } catch (error) {
      console.error('Grades fetch exception:', error);
      setGradesError("Αποτυχία φόρτωσης βαθμών.");
    }
    
    setGradesLoading(false);
  };

  // Calculate total grade based on criteria
  const calculateTotalGrade = (criteria) => {
    const quality = parseFloat(criteria.quality) || 0;
    const timeline = parseFloat(criteria.timeline) || 0;
    const completeness = parseFloat(criteria.completeness) || 0;
    const presentation = parseFloat(criteria.presentation) || 0;
    
    // Apply weights according to regulations
    const weightedGrade = (quality * 0.60) + (timeline * 0.15) + (completeness * 0.15) + (presentation * 0.10);
    return Math.round(weightedGrade * 100) / 100; // Round to 2 decimal places
  };

  // Handle criteria change
  const handleCriteriaChange = (criterion, value) => {
    const newCriteria = { ...myGrade, [criterion]: parseFloat(value) || 0 };
    setMyGrade(newCriteria);
    setTotalGrade(calculateTotalGrade(newCriteria));
  };

  // Save grade
  const handleSaveGrade = async () => {
    if (!selectedThesisForGrades) return;
    
    setGradesLoading(true);
    setGradesError("");
    
    try {
      console.log('Saving grade for thesis:', selectedThesisForGrades.id, 'User ID:', user.id);
      console.log('Grade data:', { grade: totalGrade, criteria: myGrade });
      
      const res = await fetch(`/api/grades/${selectedThesisForGrades.id}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${user.token}`
        },
        body: JSON.stringify({ 
          grade: totalGrade,
          criteria: myGrade
        })
      });
      
      console.log('Save grade response status:', res.status);
      
      if (res.ok) {
        // Refresh grades
        const refreshRes = await fetch(`/api/grades/${selectedThesisForGrades.id}`, {
          headers: { Authorization: `Bearer ${user.token}` }
        });
        
        if (refreshRes.ok) {
          const data = await refreshRes.json();
          setGrades(data);
        }
      } else {
        const err = await res.json().catch(() => ({}));
        console.error('Save grade error:', err);
        setGradesError(err.error || err.details || "Αποτυχία αποθήκευσης βαθμού.");
      }
    } catch (error) {
      console.error('Save grade exception:', error);
      setGradesError("Αποτυχία αποθήκευσης βαθμού.");
    }
    
    setGradesLoading(false);
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
          <div className="bg-white rounded shadow-lg p-6 max-w-2xl w-full relative modal-content" style={{ maxHeight: '90vh', overflowY: 'auto' }}>
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
                                  className="text-blue-600 underline"
  style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "white" }}
  onClick={async (e) => {
    e.preventDefault();
    e.stopPropagation();
    await downloadFileWithAuth(
      `/draft_uploads/${draftsByThesis[thesis.id].file_path}`,
      draftsByThesis[thesis.id].file_path.endsWith('.pdf') ? draftsByThesis[thesis.id].file_path : "draft.pdf",
      user.token
    );
  }}
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
                      {/* Grades Button */}
                      <button
                        className="bg-[#0ef] text-[#1f293a] px-3 py-1 rounded mt-2 ml-2"
                        onClick={() => handleShowGradesModal(thesis)}
                      >
                        Βαθμολόγηση
                      </button>
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
      
      {/* Grades Modal */}
      {showGradesModal && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white rounded shadow-lg p-6 max-w-4xl w-full relative modal-content" style={{ maxHeight: '90vh', overflowY: 'auto' }}>
            <button className="absolute top-2 right-2 text-gray-500" onClick={() => setShowGradesModal(false)}>&times;</button>
            <h3 className="text-xl font-bold mb-4">Βαθμολόγηση Διπλωματικής</h3>
            {selectedThesisForGrades && (
              <div className="mb-4">
                <p className="text-white"><strong>Διπλωματική:</strong> {selectedThesisForGrades.title}</p>
                <p className="text-white"><strong>Φοιτητής:</strong> {selectedThesisForGrades.student_name} {selectedThesisForGrades.student_surname}</p>
              </div>
            )}
            {gradesLoading && <div>Φόρτωση...</div>}
            {gradesError && <div className="text-red-500 mb-4">{gradesError}</div>}
            {!gradesLoading && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* My Grade Form */}
                <div>
                  <h4 className="font-semibold mb-4" style={{ color: "#0ef" }}>Η Βαθμολόγησή μου</h4>
                  <div className="space-y-4">
                    <div>
                      <label className="block mb-2 text-white">
                        Ποιότητα Δ.Ε. και βαθμός εκπλήρωσης στόχων (60%):
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="10"
                        step="0.1"
                        value={myGrade.quality}
                        onChange={e => handleCriteriaChange('quality', e.target.value)}
                        className="w-full p-2 border rounded bg-[#1f293a] text-white"
                      />
                    </div>
                    <div>
                      <label className="block mb-2 text-white">
                        Χρονικό διάστημα εκπόνησης (15%):
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="10"
                        step="0.1"
                        value={myGrade.timeline}
                        onChange={e => handleCriteriaChange('timeline', e.target.value)}
                        className="w-full p-2 border rounded bg-[#1f293a] text-white"
                      />
                    </div>
                    <div>
                      <label className="block mb-2 text-white">
                        Ποιότητα και πληρότητα κειμένου (15%):
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="10"
                        step="0.1"
                        value={myGrade.completeness}
                        onChange={e => handleCriteriaChange('completeness', e.target.value)}
                        className="w-full p-2 border rounded bg-[#1f293a] text-white"
                      />
                    </div>
                    <div>
                      <label className="block mb-2 text-white">
                        Συνολική εικόνα παρουσίασης (10%):
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="10"
                        step="0.1"
                        value={myGrade.presentation}
                        onChange={e => handleCriteriaChange('presentation', e.target.value)}
                        className="w-full p-2 border rounded bg-[#1f293a] text-white"
                      />
                    </div>
                    <div className="p-3 bg-gray-800 rounded">
                      <p className="text-white"><strong>Συνολικός Βαθμός:</strong> {totalGrade}/10</p>
                    </div>
                    <button
                      className="bg-[#0ef] text-[#1f293a] px-4 py-2 rounded w-full"
                      onClick={handleSaveGrade}
                      disabled={gradesLoading}
                    >
                      {gradesLoading ? "Αποθήκευση..." : "Αποθήκευση Βαθμού"}
                    </button>
                  </div>
                </div>
                
                {/* All Grades Display */}
                <div>
                  <h4 className="font-semibold mb-4" style={{ color: "#0ef" }}>Όλοι οι Βαθμοί</h4>
                  {grades.length === 0 ? (
                    <p className="text-white">Δεν έχουν καταχωρηθεί βαθμοί ακόμα.</p>
                  ) : (
                    <div className="space-y-3">
                      {grades.map(grade => (
                        <div key={grade.id} className="border p-3 rounded bg-gray-800">
                          <p className="text-white font-semibold">
                            {grade.name} {grade.surname}
                          </p>
                          <p className="text-white"><strong>Συνολικός Βαθμός:</strong> {grade.grade}/10</p>
                          <div className="text-sm text-gray-300 mt-2">
                            <p><strong>Ποιότητα:</strong> {grade.criteria.quality}/10 (60%)</p>
                            <p><strong>Χρονικό Διάστημα:</strong> {grade.criteria.timeline}/10 (15%)</p>
                            <p><strong>Πληρότητα:</strong> {grade.criteria.completeness}/10 (15%)</p>
                            <p><strong>Παρουσίαση:</strong> {grade.criteria.presentation}/10 (10%)</p>
                          </div>
                          <p className="text-xs text-gray-400 mt-2">
                            Καταχωρήθηκε: {new Date(grade.created_at).toLocaleString("el-GR")}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
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


  function getUserRole(topic) {
  if (topic.professor === user.name) return "Επιβλέπων";
  if (topic.committee && Array.isArray(topic.committee)) {
    const found = topic.committee.find(
      m => (m.name + " " + m.surname).trim() === user.name && m.role && m.role.toLowerCase().includes("μέλος")
    );
    if (found) return "Μέλος";
  }
  return null;
}

const filtered = (topics || []).filter(t => {
  const statusMatch = !statusFilter || ((t.status || "").trim().toLowerCase() === statusFilter.trim().toLowerCase());
  const userRole = getUserRole(t);
  let roleMatch = true;
  if (roleFilter === "Επιβλέπων") roleMatch = userRole === "Επιβλέπων";
  else if (roleFilter === "Μέλος") roleMatch = userRole === "Μέλος";
  return statusMatch && roleMatch;
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
    try {
      const res = await fetch(`/api/topics/${topicId}/assign`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${user.token}`
        },
        body: JSON.stringify({ studentId: student.id })
      });

      if (res.ok) {
        const newThesis = await res.json(); // Get the complete new thesis data
        setTopics(topics.map(t =>
          t.id === topicId 
            ? { 
                ...t, 
                assignedTo: newThesis.student_number, 
                assignedStudentName: newThesis.assignedStudentName,
                status: newThesis.status, // <-- Correctly update status
                thesis_id: newThesis.id,  // <-- Correctly add the new thesis_id
              } 
            : t
        ));
      } else {
        const err = await res.json().catch(() => ({}));
        alert(`Αποτυχία ανάθεσης: ${err.error || 'Άγνωστο σφάλμα'}`);
      }
    } catch (error) {
      alert('Προέκυψε ένα σφάλμα. Παρακαλώ δοκιμάστε ξανά.');
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

  // State for library submission modal
  const [showLibraryModal, setShowLibraryModal] = useState(false);
  const [libraryLink, setLibraryLink] = useState("");
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryError, setLibraryError] = useState("");
  
  // State for examination minutes modal
  const [showMinutesModal, setShowMinutesModal] = useState(false);
  const [minutesContent, setMinutesContent] = useState("");
  const [minutesLoading, setMinutesLoading] = useState(false);

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
    if (!assignedTopic) return;
    setShowManage(true);
    setManageLoading(true);
    setManageError("");
    try {
      // Use the new endpoint that works with topicId for students
      const res = await fetch(`/api/thesis-invitations-by-topic/${assignedTopic.id}`, {
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
      // Use the new endpoint that works with topicId for students
      const res = await fetch(`/api/thesis-invitations-by-topic/${assignedTopic.id}/invite`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${user.token}`
        },
        body: JSON.stringify({ professorId })
      });
      if (res.ok) {
        // Ενημέρωσε τις προσκλήσεις
        const updated = await fetch(`/api/thesis-invitations-by-topic/${assignedTopic.id}`, {
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
    if (!assignedTopic) return;
    setShowDraftModal(true);
    setDraftLoading(true);
    setDraftError("");
    setDraftInfo(null);
    try {
      // First get the thesis details to find the thesis_id
      const thesisRes = await fetch(`/api/thesis-details/${assignedTopic.id}`, {
        headers: { Authorization: `Bearer ${user.token}` }
      });
      if (thesisRes.ok) {
        const thesisData = await thesisRes.json();
        const actualThesisId = thesisData.debug?.thesis_id;
        
        if (actualThesisId) {
          const res = await fetch(`/api/draft-submission/${actualThesisId}`, {
            headers: { Authorization: `Bearer ${user.token}` }
          });
          if (res.ok) {
            setDraftInfo(await res.json());
          } else {
            setDraftInfo(null);
          }
        } else {
          setDraftInfo(null);
        }
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
    if (!assignedTopic) return;
    setDraftLoading(true);
    setDraftError("");
    try {
      // First get the thesis details to find the thesis_id
      const thesisRes = await fetch(`/api/thesis-details/${assignedTopic.id}`, {
        headers: { Authorization: `Bearer ${user.token}` }
      });
      if (thesisRes.ok) {
        const thesisData = await thesisRes.json();
        const actualThesisId = thesisData.debug?.thesis_id;
        
        if (actualThesisId) {
          const formData = new FormData();
          formData.append("thesisId", actualThesisId);
          if (draftFile) formData.append("file", draftFile);
          formData.append("externalLinks", draftLinks);
          const res = await fetch("/api/draft-submission", {
            method: "POST",
            headers: { Authorization: `Bearer ${user.token}` },
            body: formData
          });
          if (res.ok) {
            // Refresh info
            const infoRes = await fetch(`/api/draft-submission/${actualThesisId}`, {
              headers: { Authorization: `Bearer ${user.token}` }
            });
            setDraftInfo(await infoRes.json());
            setDraftFile(null);
            setDraftLinks("");
          } else {
            const err = await res.json().catch(() => ({}));
            setDraftError((err.error || "Αποτυχία ανάρτησης.") + (err.details ? `: ${err.details}` : ""));
          }
        } else {
          setDraftError("Δεν βρέθηκε διπλωματική που να σας ανήκει.");
        }
      } else {
        setDraftError("Δεν βρέθηκε διπλωματική που να σας ανήκει.");
      }
    } catch {
      setDraftError("Αποτυχία ανάρτησης.");
    }
    setDraftLoading(false);
  };

  // Fetch presentation details when modal opens
  const handleShowPresentationModal = async () => {
    if (!assignedTopic) return;
    setShowPresentationModal(true);
    setPresentationLoading(true);
    setPresentationError("");
    setPresentationInfo(null);
    setPresentationDate("");
    setPresentationTime("");
    setPresentationMode("");
    setPresentationLocation("");
    try {
      // First get the thesis details to find the thesis_id
      const thesisRes = await fetch(`/api/thesis-details/${assignedTopic.id}`, {
        headers: { Authorization: `Bearer ${user.token}` }
      });
      if (thesisRes.ok) {
        const thesisData = await thesisRes.json();
        const actualThesisId = thesisData.debug?.thesis_id;
        
        if (actualThesisId) {
          const res = await fetch(`/api/presentation-details/${actualThesisId}`, {
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
        } else {
          setPresentationInfo(null);
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
    if (!assignedTopic) return;
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
      // First get the thesis details to find the thesis_id
      const thesisRes = await fetch(`/api/thesis-details/${assignedTopic.id}`, {
        headers: { Authorization: `Bearer ${user.token}` }
      });
      if (thesisRes.ok) {
        const thesisData = await thesisRes.json();
        const actualThesisId = thesisData.debug?.thesis_id;
        
        if (actualThesisId) {
          // Create proper ISO datetime string for backend
          const presentationDateTimeString = `${presentationDate}T${presentationTime}:00`;
          
          const res = await fetch("/api/presentation-details", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${user.token}`
            },
            body: JSON.stringify({
              thesisId: actualThesisId,
              presentationDate: presentationDateTimeString,
              mode: presentationMode,
              locationOrLink: presentationLocation
            })
          });
          
          if (res.ok) {
            // Refresh info
            const infoRes = await fetch(`/api/presentation-details/${actualThesisId}`, {
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
        } else {
          setPresentationError("Δεν βρέθηκε διπλωματική που να σας ανήκει.");
        }
      } else {
        setPresentationError("Δεν βρέθηκε διπλωματική που να σας ανήκει.");
      }
    } catch (err) {
      console.error('Presentation save error:', err);
      setPresentationError("Αποτυχία αποθήκευσης.");
    }
    setPresentationLoading(false);
  };

  const handleShowLibraryModal = async () => {
    if (!assignedTopic) return;
    setShowLibraryModal(true);
    setLibraryError('');
    setLibraryLoading(true);
    try {
      // First get the thesis details to find the thesis_id
      const thesisRes = await fetch(`/api/thesis-details/${assignedTopic.id}`, {
        headers: { Authorization: `Bearer ${user.token}` }
      });
      if (thesisRes.ok) {
        const thesisData = await thesisRes.json();
        const actualThesisId = thesisData.debug?.thesis_id;
        
        if (actualThesisId) {
          const res = await fetch(`/api/library-submission/${actualThesisId}`, {
            headers: { Authorization: `Bearer ${user.token}` },
          });
          const data = await res.json();
          if (data && data.repository_link) {
            setLibraryLink(data.repository_link);
          } else {
            setLibraryLink('');
          }
        } else {
          setLibraryLink('');
        }
      } else {
        setLibraryLink('');
      }
    } catch (e) {
      setLibraryError('Αποτυχία φόρτωσης συνδέσμου.');
    }
    setLibraryLoading(false);
  };

  const handleSaveLibraryLink = async () => {
    if (!assignedTopic) return;
    setLibraryLoading(true);
    setLibraryError('');
    try {
      // First get the thesis details to find the thesis_id
      const thesisRes = await fetch(`/api/thesis-details/${assignedTopic.id}`, {
        headers: { Authorization: `Bearer ${user.token}` }
      });
      if (thesisRes.ok) {
        const thesisData = await thesisRes.json();
        const actualThesisId = thesisData.debug?.thesis_id;
        
        if (actualThesisId) {
          const res = await fetch('/api/library-submission', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${user.token}`,
            },
            body: JSON.stringify({ thesisId: actualThesisId, repositoryLink: libraryLink }),
          });
          if (!res.ok) throw new Error('Αποτυχία αποθήκευσης.');
          setShowLibraryModal(false);
        } else {
          throw new Error('Δεν βρέθηκε διπλωματική που να σας ανήκει.');
        }
      } else {
        throw new Error('Δεν βρέθηκε διπλωματική που να σας ανήκει.');
      }
    } catch (e) {
      setLibraryError(e.message);
    }
    setLibraryLoading(false);
  };

  const handleShowMinutesModal = async () => {
    if (!assignedTopic) return;
    setShowMinutesModal(true);
    setMinutesLoading(true);
    try {
      // First get the thesis details to find the thesis_id
      const thesisRes = await fetch(`/api/thesis-details/${assignedTopic.id}`, {
        headers: { Authorization: `Bearer ${user.token}` }
      });
      if (thesisRes.ok) {
        const thesisData = await thesisRes.json();
        const actualThesisId = thesisData.debug?.thesis_id;
        
        if (actualThesisId) {
          const res = await fetch(`/api/examination-minutes/${actualThesisId}`, {
            headers: { Authorization: `Bearer ${user.token}` },
          });
          const html = await res.text();
          if (!res.ok) throw new Error('Αποτυχία φόρτωσης πρακτικού.');
          setMinutesContent(html);
        } else {
          setMinutesContent(`<p style="color:red;">Δεν βρέθηκε διπλωματική που να σας ανήκει.</p>`);
        }
      } else {
        setMinutesContent(`<p style="color:red;">Δεν βρέθηκε διπλωματική που να σας ανήκει.</p>`);
      }
    } catch (e) {
      setMinutesContent(`<p style="color:red;">${e.message}</p>`);
    }
    setMinutesLoading(false);
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
            disabled={!assignedTopic || (assignedTopic.status && assignedTopic.status.trim().toLowerCase() !== "υπό ανάθεση")}
          >
            Διαχείριση διπλωματικής εργασίας
          </button>
          <button
            className="bg-[#0ef] text-white px-3 py-1 mb-4 ml-2"
            onClick={handleShowDraftModal}
            disabled={!assignedTopic}
          >
            Πρόχειρη Ανάρτηση
          </button>
          <button
            className="bg-[#0ef] text-white px-3 py-1 mb-4 ml-2"
            onClick={handleShowPresentationModal}
            disabled={!assignedTopic}
          >
            Λεπτομέρειες Παρουσίασης
          </button>
          <button
            className="bg-[#0ef] text-white px-3 py-1 mb-4 ml-2"
            onClick={handleShowLibraryModal}
            disabled={!assignedTopic}
          >
            Συνδέσμος Βιβλιοθήκης
          </button>
          <button
            className="bg-[#0ef] text-white px-3 py-1 mb-4 ml-2"
            onClick={handleShowMinutesModal}
            disabled={!assignedTopic}
          >
            Εξεταστικά Εγγράφα
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
                        className="text-blue-600 underline"
  style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "white" }}
  onClick={async (e) => {
    e.preventDefault();
    e.stopPropagation();
    await downloadFileWithAuth(
      `/draft_uploads/${draftInfo.file_path}`,
      draftInfo.file_path.endsWith('.pdf') ? draftInfo.file_path : "draft.pdf",
      user.token
    );
  }}
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
      {/* Library Submission Modal */}
      {showLibraryModal && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50" style={{ zIndex: 1000 }}>
          <div className="bg-white rounded shadow-lg p-6 max-w-lg w-full relative modal-content">
            <button className="absolute top-2 right-2 text-gray-500" onClick={() => setShowLibraryModal(false)}>&times;</button>
            <h3 className="text-xl font-bold mb-4">Συνδέσμος Βιβλιοθήκης</h3>
            {libraryLoading && <div>Φόρτωση...</div>}
            {libraryError && <div className="text-red-500">{libraryError}</div>}
            {!libraryLoading && (
              <form onSubmit={handleSaveLibraryLink}>
                <div className="mb-4">
                  <label className="block mb-2 font-semibold">Συνδέσμος Βιβλιοθήκης:</label>
                  <input
                    type="text"
                    value={libraryLink}
                    onChange={e => setLibraryLink(e.target.value)}
                    className="w-full p-2 border rounded"
                    required
                  />
                </div>
                <button 
                  className="bg-[#0ef] text-[#1f293a] px-4 py-2 rounded w-full" 
                  type="submit" 
                  disabled={libraryLoading}
                >
                  {libraryLoading ? "Αποθήκευση..." : "Αποθήκευση"}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
      {/* Examination Minutes Modal */}
      {showMinutesModal && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50" style={{ zIndex: 1000 }}>
          <div className="bg-white rounded shadow-lg p-6 max-w-4xl w-full relative modal-content" style={{ maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
            <button className="absolute top-2 right-2 text-gray-500" onClick={() => setShowMinutesModal(false)}>&times;</button>
            <h3 className="text-xl font-bold mb-4" style={{ color: "#0ef" }}>Πρακτικό Εξέτασης</h3>
            {minutesLoading && <div>Φόρτωση...</div>}
            {!minutesLoading && (
              <>
                <iframe
                  srcDoc={minutesContent}
                  title="Πρακτικό Εξέτασης"
                  style={{ width: '100%', flexGrow: 1, border: 'none', backgroundColor: '#fff' }}
                />
                <div className="flex space-x-2 mt-4">
                  <button
                    className="bg-[#0ef] text-[#1f293a] px-4 py-2 rounded"
                    onClick={() => {
                      const newWindow = window.open();
                      newWindow.document.write(minutesContent);
                      newWindow.document.close();
                      newWindow.print();
                    }}
                  >
                    Εκτύπωση
                  </button>
                  <button
                    className="bg-gray-500 text-white px-4 py-2 rounded"
                    onClick={() => setShowMinutesModal(false)}
                  >
                    Κλείσιμο
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Admin/secretary dashboard
function Admin({ user }) {
  const [theses, setTheses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedThesis, setSelectedThesis] = useState(null);
  const [showDetails, setShowDetails] = useState(false);
  const [showThesesList, setShowThesesList] = useState(false);

  // State for JSON import functionality
  const [showImportModal, setShowImportModal] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importData, setImportData] = useState(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState("");
  const [importSuccess, setImportSuccess] = useState("");
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [templateData, setTemplateData] = useState(null);
  const [templateLoading, setTemplateLoading] = useState(false);
  const [templateError, setTemplateError] = useState("");

  // State for thesis management modals
  const [showThesisManagementModal, setShowThesisManagementModal] = useState(false);
  const [selectedThesisForManagement, setSelectedThesisForManagement] = useState(null);
  const [gsNumber, setGsNumber] = useState("");
  const [gsYear, setGsYear] = useState("");
  const [cancellationReason, setCancellationReason] = useState("");
  const [managementLoading, setManagementLoading] = useState(false);
  const [managementError, setManagementError] = useState("");
  const [managementSuccess, setManagementSuccess] = useState("");

  // Load theses on component mount
  useEffect(() => {
    if (user) {
      handleLoadTheses();
    }
  }, [user]);

  const handleLoadTheses = async () => {
    setLoading(true);
    setError("");
    try {
      console.log('Loading theses for admin, user:', user);
      const res = await fetch("/api/admin/theses", {
        headers: { Authorization: `Bearer ${user.token}` }
      });
      console.log('Response status:', res.status);
      if (res.ok) {
        const data = await res.json();
        console.log('Theses data:', data);
        setTheses(data);
      } else {
        const errorData = await res.json().catch(() => ({}));
        console.error('Error response:', errorData);
        setError("Αποτυχία φόρτωσης διπλωματικών.");
      }
    } catch (err) {
      console.error('Exception loading theses:', err);
      setError("Αποτυχία φόρτωσης διπλωματικών.");
    }
    setLoading(false);
  };

  const handleShowThesisDetails = async (thesis) => {
    setSelectedThesis(thesis);
    setShowDetails(true);
  };

  const handleCloseDetails = () => {
    setShowDetails(false);
    setSelectedThesis(null);
  };

  const toggleThesesList = () => {
    setShowThesesList(!showThesesList);
  };

  // Calculate time since assignment
  const timeSince = (dateString) => {
    if (!dateString) return "--";
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
  };

  // Handle JSON file selection
  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    if (!file.name.endsWith('.json')) {
      setImportError("Παρακαλώ επιλέξτε ένα αρχείο JSON.");
      return;
    }
    
    setImportFile(file);
    setImportError("");
    setImportSuccess("");
    
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target.result);
        setImportData(data);
      } catch (err) {
        setImportError("Το αρχείο δεν είναι έγκυρο JSON.");
        setImportData(null);
      }
    };
    reader.readAsText(file);
  };

  // Download template
  const handleDownloadTemplate = async () => {
    setTemplateLoading(true);
    setTemplateError("");
    try {
      const res = await fetch("/api/admin/export-template", {
        headers: { Authorization: `Bearer ${user.token}` }
      });
      if (res.ok) {
        const template = await res.json();
        const blob = new Blob([JSON.stringify(template, null, 2)], { 
          type: "application/json;charset=utf-8;" 
        });
        saveAs(blob, "import_template.json");
      } else {
        setTemplateError("Αποτυχία λήψης προτύπου.");
      }
    } catch {
      setTemplateError("Αποτυχία λήψης προτύπου.");
    }
    setTemplateLoading(false);
  };

  // Import data
  const handleImportData = async () => {
    if (!importData) {
      setImportError("Δεν υπάρχουν δεδομένα για εισαγωγή.");
      return;
    }
    
    setImportLoading(true);
    setImportError("");
    setImportSuccess("");
    
    try {
      const res = await fetch("/api/admin/import-data", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${user.token}`
        },
        body: JSON.stringify(importData)
      });
      
      if (res.ok) {
        const result = await res.json();
        setImportSuccess(`Η εισαγωγή ολοκληρώθηκε επιτυχώς! Εισήχθησαν ${result.results.students.imported} φοιτητές και ${result.results.professors.imported} διδάσκοντες.`);
        
        // Show errors if any
        const errors = [];
        if (result.results.students.errors.length > 0) {
          errors.push(`Σφάλματα φοιτητών: ${result.results.students.errors.join(', ')}`);
        }
        if (result.results.professors.errors.length > 0) {
          errors.push(`Σφάλματα διδασκόντων: ${result.results.professors.errors.join(', ')}`);
        }
        
        if (errors.length > 0) {
          setImportError(errors.join('\n'));
        }
        
        // Reset form
        setImportFile(null);
        setImportData(null);
      } else {
        const err = await res.json().catch(() => ({}));
        setImportError(err.error || "Αποτυχία εισαγωγής δεδομένων.");
      }
    } catch {
      setImportError("Αποτυχία εισαγωγής δεδομένων.");
    }
    
    setImportLoading(false);
  };

  // Handle thesis management modal
  const handleShowThesisManagement = async (thesis) => {
    setSelectedThesisForManagement(thesis);
    setShowThesisManagementModal(true);
    setGsNumber("");
    setGsYear("");
    setCancellationReason("");
    setManagementError("");
    setManagementSuccess("");
  };

  // Set thesis as active
  const handleSetActive = async () => {
    if (!gsNumber || !gsYear) {
      setManagementError("Συμπληρώστε αριθμό και έτος ΓΣ.");
      return;
    }

    setManagementLoading(true);
    setManagementError("");
    setManagementSuccess("");

    try {
      const res = await fetch(`/api/admin/theses/${selectedThesisForManagement.id}/set-active`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${user.token}`
        },
        body: JSON.stringify({ gsNumber, gsYear })
      });

      if (res.ok) {
        setManagementSuccess("Η διπλωματική έγινε ενεργή.");
        // Refresh theses list
        handleLoadTheses();
      } else {
        const err = await res.json().catch(() => ({}));
        setManagementError(err.error || "Αποτυχία ενεργοποίησης.");
      }
    } catch {
      setManagementError("Αποτυχία ενεργοποίησης.");
    }

    setManagementLoading(false);
  };

  // Cancel thesis
  const handleCancelThesis = async () => {
    if (!gsNumber || !gsYear) {
      setManagementError("Συμπληρώστε αριθμό και έτος ΓΣ.");
      return;
    }

    setManagementLoading(true);
    setManagementError("");
    setManagementSuccess("");

    try {
      const res = await fetch(`/api/admin/theses/${selectedThesisForManagement.id}/cancel`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${user.token}`
        },
        body: JSON.stringify({ 
          gsNumber, 
          gsYear, 
          reason: cancellationReason || "από Γραμματεία" 
        })
      });

      if (res.ok) {
        setManagementSuccess("Η διπλωματική ακυρώθηκε.");
        // Refresh theses list
        handleLoadTheses();
      } else {
        const err = await res.json().catch(() => ({}));
        setManagementError(err.error || "Αποτυχία ακύρωσης.");
      }
    } catch {
      setManagementError("Αποτυχία ακύρωσης.");
    }

    setManagementLoading(false);
  };

  // Handler for the new update GS action
  const handleUpdateGs = async () => {
    if (!gsNumber || !gsYear) {
      setManagementError("Συμπληρώστε αριθμό και έτος ΓΣ.");
      return;
    }

    setManagementLoading(true);
    setManagementError("");
    setManagementSuccess("");

    try {
      const res = await fetch(`/api/admin/theses/${selectedThesisForManagement.id}/update-gs`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${user.token}`
        },
        body: JSON.stringify({ gsNumber, gsYear })
      });

      if (res.ok) {
        setManagementSuccess("Τα στοιχεία ΓΣ ενημερώθηκαν επιτυχώς.");
        handleLoadTheses(); // Refresh data
        setTimeout(() => {
          setShowThesisManagementModal(false);
        }, 1500);
      } else {
        const err = await res.json().catch(() => ({}));
        setManagementError(err.error || "Αποτυχία ενημέρωσης στοιχείων ΓΣ.");
      }
    } catch {
      setManagementError("Αποτυχία ενημέρωσης στοιχείων ΓΣ.");
    }
    setManagementLoading(false);
  };

  // Set thesis as completed
  const handleSetCompleted = async () => {
    if (!selectedThesisForManagement) return;

    setManagementLoading(true);
    setManagementError("");
    setManagementSuccess("");

    try {
      const res = await fetch(`/api/admin/theses/${selectedThesisForManagement.id}/set-completed`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${user.token}`
        }
      });

      if (res.ok) {
        setManagementSuccess("Η διπλωματική τέθηκε επιτυχώς ως 'Περατωμένη'.");
        handleLoadTheses(); // Refresh data
        setTimeout(() => {
          setShowThesisManagementModal(false);
        }, 2000);
      } else {
        const err = await res.json().catch(() => ({}));
        setManagementError(err.error || "Αποτυχία αλλαγής κατάστασης.");
      }
    } catch {
      setManagementError("Αποτυχία αλλαγής κατάστασης.");
    }
    setManagementLoading(false);
  };

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-xl font-bold mb-4" style={{ color: "#0ef" }}>Καλωσορίσατε Γραμματεία</h2>
      
      {/* Προβολή Διπλωματικης Εργασιας */}
      <div className="border p-4 rounded bg-[#1f293a]">
        <div 
          className="flex justify-between items-center cursor-pointer"
          onClick={toggleThesesList}
          style={{ cursor: 'pointer' }}
        >
          <h3 className="text-lg font-bold" style={{ color: "#0ef" }}>Προβολή Διπλωματικών Εργασιών</h3>
          <span 
            className="text-[#0ef] text-xl transition-transform duration-300 cursor-pointer"
            style={{ 
              transform: showThesesList ? 'rotate(180deg)' : 'rotate(0deg)',
              cursor: 'pointer'
            }}
          >
            ▼
          </span>
        </div>
        
        {showThesesList && (
          <div className="mt-4">
            <p className="text-white mb-4">Προβάλλονται όλες οι Διπλωματικες Εργασιες.</p>
            
            {loading && <div className="text-white">Φόρτωση...</div>}
            {error && <div className="text-red-500 mb-4">{error}</div>}
            
            {!loading && theses.length === 0 && (
              <div className="text-white">Δεν βρέθηκαν διπλωματικές εργασίες.</div>
            )}
            
            {!loading && theses.length > 0 && (
              <div className="space-y-3">
                {theses.map(thesis => (
                  <div key={thesis.id} className="border p-3 rounded bg-gray-800">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <h4 className="font-bold text-white mb-2">{thesis.title}</h4>
                        <p className="text-white text-sm mb-2">{thesis.summary}</p>
                        <div className="text-sm text-gray-300">
                          <p><strong>Φοιτητής:</strong> {thesis.student_name} {thesis.student_surname} ({thesis.student_number})</p>
                          <p><strong>Επιβλέπων:</strong> {thesis.supervisor_name} {thesis.supervisor_surname}</p>
                          <p><strong>Κατάσταση:</strong> <span style={{ color: "#0ef", fontWeight: "bold" }}>{thesis.status}</span></p>
                          {thesis.official_assignment_date && (
                            <p><strong>Χρόνος από ανάθεση:</strong> {timeSince(thesis.official_assignment_date)}</p>
                          )}
                        </div>
                      </div>
                      <button
                        className="bg-[#0ef] text-[#1f293a] px-3 py-1 rounded ml-4"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleShowThesisDetails(thesis);
                        }}
                      >
                        Λεπτομέρειες
                      </button>
                      <button
                        className="bg-[#0ef] text-[#1f293a] px-3 py-1 rounded ml-2"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleShowThesisManagement(thesis);
                        }}
                      >
                        Διαχείριση
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal με λεπτομέρειες διπλωματικής */}
      {showDetails && selectedThesis && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white rounded shadow-lg p-6 max-w-4xl w-full relative modal-content" style={{ maxHeight: '90vh', overflowY: 'auto' }}>
            <button className="absolute top-2 right-2 text-gray-500" onClick={handleCloseDetails}>&times;</button>
            <h3 className="text-xl font-bold mb-4" style={{ color: "#0ef" }}>Λεπτομέρειες Διπλωματικής Εργασίας</h3>
            
            <div className="space-y-4">
              {/* Βασικές πληροφορίες */}
              <div className="border p-4 rounded bg-gray-800">
                <h4 className="font-bold text-white mb-3">Βασικές Πληροφορίες</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-white">
                  <div>
                    <p><strong>Τίτλος:</strong> {selectedThesis.title}</p>
                    <p><strong>Φοιτητής:</strong> {selectedThesis.student_name} {selectedThesis.student_surname}</p>
                    <p><strong>Αριθμός Μητρώου:</strong> {selectedThesis.student_number}</p>
                    <p><strong>Επιβλέπων:</strong> {selectedThesis.supervisor_name} {selectedThesis.supervisor_surname}</p>
                  </div>
                  <div>
                    <p><strong>Κατάσταση:</strong> {selectedThesis.status}</p>
                    <p><strong>Ημ/νία Δημιουργίας:</strong> {selectedThesis.created_at ? new Date(selectedThesis.created_at).toLocaleDateString("el-GR") : "--"}</p>
                    <p><strong>Επίσημη Ανάθεση:</strong> {selectedThesis.official_assignment_date ? new Date(selectedThesis.official_assignment_date).toLocaleDateString("el-GR") : "--"}</p>
                    {selectedThesis.official_assignment_date && (
                      <p><strong>Χρόνος από ανάθεση:</strong> {timeSince(selectedThesis.official_assignment_date)}</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Περιγραφή */}
              <div className="border p-4 rounded bg-gray-800">
                <h4 className="font-bold text-white mb-3">Περιγραφή</h4>
                <p className="text-white">{selectedThesis.summary}</p>
              </div>

              {/* Μέλη Επιτροπής */}
              <div className="border p-4 rounded bg-gray-800">
                <h4 className="font-bold text-white mb-3">Μέλη Τριμελούς Επιτροπής</h4>
                {selectedThesis.committee && selectedThesis.committee.length > 0 ? (
                  <div className="space-y-2">
                    {selectedThesis.committee.map((member, index) => (
                      <div key={index} className="text-white p-2 bg-gray-700 rounded">
                        <p><strong>{member.name} {member.surname}</strong> ({member.role})</p>
                        {member.response_date && (
                          <p className="text-sm text-gray-300">
                            Απάντηση: {new Date(member.response_date).toLocaleDateString("el-GR")}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-white">Δεν έχουν οριστεί μέλη επιτροπής ακόμα.</p>
                )}
              </div>

              {/* Πρόχειρη Ανάρτηση */}
              {selectedThesis.draft_submission && (
                <div className="border p-4 rounded bg-gray-800">
                  <h4 className="font-bold text-white mb-3">Πρόχειρη Ανάρτηση</h4>
                  <div className="text-white">
                    {selectedThesis.draft_submission.file_path && (
                      <p><strong>Αρχείο:</strong> {selectedThesis.draft_submission.file_path}</p>
                    )}
                    {selectedThesis.draft_submission.external_links && (
                      <div>
                        <p><strong>Σύνδεσμοι:</strong></p>
                        <ul className="list-disc ml-6">
                          {selectedThesis.draft_submission.external_links.split(/\r?\n/).map((link, i) => link.trim() && (
                            <li key={i}>
                              <a href={link} target="_blank" rel="noopener noreferrer" className="text-blue-400 underline">{link}</a>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <p className="text-sm text-gray-300 mt-2">
                      Ανέβηκε: {selectedThesis.draft_submission.uploaded_at ? new Date(selectedThesis.draft_submission.uploaded_at).toLocaleString("el-GR") : "--"}
                    </p>
                  </div>
                </div>
              )}

              {/* Λεπτομέρειες Παρουσίασης */}
              {selectedThesis.presentation_details && (
                <div className="border p-4 rounded bg-gray-800">
                  <h4 className="font-bold text-white mb-3">Λεπτομέρειες Παρουσίασης</h4>
                  <div className="text-white">
                    <p><strong>Ημερομηνία & Ώρα:</strong> {new Date(selectedThesis.presentation_details.presentation_date).toLocaleString("el-GR")}</p>
                    <p><strong>Τρόπος:</strong> {selectedThesis.presentation_details.mode}</p>
                    <p><strong>Τόπος/Σύνδεσμος:</strong> {selectedThesis.presentation_details.location_or_link}</p>
                    {selectedThesis.presentation_details.announcement_text && (
                      <div className="mt-3">
                        <p><strong>Κείμενο Ανακοίνωσης:</strong></p>
                        <div className="p-3 bg-gray-700 rounded mt-2" style={{ color: "#fff" }}>
                          {selectedThesis.presentation_details.announcement_text}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Βαθμοί */}
              {selectedThesis.grades && selectedThesis.grades.length > 0 && (
                <div className="border p-4 rounded bg-gray-800">
                  <h4 className="font-bold text-white mb-3">Βαθμοί</h4>
                  <div className="space-y-2">
                    {selectedThesis.grades.map((grade, index) => (
                      <div key={index} className="text-white p-2 bg-gray-700 rounded">
                        <p><strong>{grade.name} {grade.surname}:</strong> {grade.grade}/10</p>
                        <div className="text-sm text-gray-300 mt-1">
                          <p>Ποιότητα: {grade.criteria.quality}/10 (60%)</p>
                          <p>Χρονικό Διάστημα: {grade.criteria.timeline}/10 (15%)</p>
                          <p>Πληρότητα: {grade.criteria.completeness}/10 (15%)</p>
                          <p>Παρουσίαση: {grade.criteria.presentation}/10 (10%)</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Εισαγωγή Δεδομένων JSON */}
      <div className="border p-4 rounded bg-[#1f293a] mt-4">
        <h3 className="text-lg font-bold mb-4" style={{ color: "#0ef" }}>Εισαγωγή Δεδομένων JSON</h3>
        <p className="text-white mb-4">Εισάγετε προσωπικές πληροφορίες φοιτητών και διδασκόντων από αρχείο JSON.</p>
        
        <div className="space-y-4">
          <button
            className="bg-[#0ef] text-[#1f293a] px-4 py-2 rounded"
            onClick={handleDownloadTemplate}
            disabled={templateLoading}
          >
            {templateLoading ? "Λήψη..." : "Λήψη Προτύπου JSON"}
          </button>
          
          <button
            className="bg-[#0ef] text-[#1f293a] px-4 py-2 rounded ml-2"
            onClick={() => setShowImportModal(true)}
          >
            Εισαγωγή Αρχείου JSON
          </button>
        </div>
        
        {templateError && (
          <div className="text-red-500 mt-2">{templateError}</div>
        )}
      </div>

      {/* Import JSON Modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white rounded shadow-lg p-6 max-w-2xl w-full relative modal-content">
            <button 
              className="absolute top-2 right-2 text-gray-500" 
              onClick={() => {
                setShowImportModal(false);
                setImportFile(null);
                setImportData(null);
                setImportError("");
                setImportSuccess("");
              }}
            >
              &times;
            </button>
            <h3 className="text-xl font-bold mb-4" style={{ color: "#0ef" }}>Εισαγωγή Δεδομένων JSON</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block mb-2 font-semibold text-white">Επιλέξτε αρχείο JSON:</label>
                <input
                  type="file"
                  accept=".json"
                  onChange={handleFileSelect}
                  className="w-full p-2 border rounded bg-[#1f293a] text-white"
                />
              </div>
              
              {importData && (
                <div className="border p-4 rounded bg-gray-800">
                  <h4 className="font-semibold mb-2 text-white">Προεπισκόπηση Δεδομένων:</h4>
                  <div className="text-sm text-gray-300">
                    {importData.students && (
                      <p>Φοιτητές: {importData.students.length} εγγραφές</p>
                    )}
                    {importData.professors && (
                      <p>Διδάσκοντες: {importData.professors.length} εγγραφές</p>
                    )}
                  </div>
                </div>
              )}
              
              {importError && (
                <div className="text-red-500 p-3 bg-red-100 rounded">
                  {importError}
                </div>
              )}
              
              {importSuccess && (
                <div className="text-green-500 p-3 bg-green-100 rounded">
                  {importSuccess}
                </div>
              )}
              
              <div className="flex space-x-2">
                <button
                  className="bg-[#0ef] text-[#1f293a] px-4 py-2 rounded"
                  onClick={handleImportData}
                  disabled={importLoading || !importData}
                >
                  {importLoading ? "Εισαγωγή..." : "Εισαγωγή Δεδομένων"}
                </button>
                <button
                  className="bg-gray-500 text-white px-4 py-2 rounded"
                  onClick={() => {
                    setShowImportModal(false);
                    setImportFile(null);
                    setImportData(null);
                    setImportError("");
                    setImportSuccess("");
                  }}
                  disabled={importLoading}
                >
                  Ακύρωση
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Thesis Management Modal */}
      {showThesisManagementModal && selectedThesisForManagement && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white rounded shadow-lg p-6 max-w-lg w-full relative modal-content">
            <button className="absolute top-2 right-2 text-gray-500" onClick={() => setShowThesisManagementModal(false)}>&times;</button>
            <h3 className="text-xl font-bold mb-4" style={{ color: "#0ef" }}>Διαχείριση Διπλωματικής</h3>
            
            <div className="mb-4 p-3 bg-gray-800 rounded">
              <p className="text-white"><strong>Τίτλος:</strong> {selectedThesisForManagement.title}</p>
              <p className="text-white"><strong>Φοιτητής:</strong> {selectedThesisForManagement.student_name} {selectedThesisForManagement.student_surname}</p>
              <p className="text-white"><strong>Κατάσταση:</strong> <span className="font-bold">{selectedThesisForManagement.status}</span></p>
              {selectedThesisForManagement.gs_number && (
                <p className="text-white"><strong>Τρέχον ΓΣ:</strong> {selectedThesisForManagement.gs_number}/{selectedThesisForManagement.gs_year}</p>
              )}
            </div>
            
            {managementLoading && <div className="text-white">Φόρτωση...</div>}
            {managementError && <div className="text-red-500 mb-4 p-2 bg-red-100 rounded">{managementError}</div>}
            {managementSuccess && <div className="text-green-500 mb-4 p-2 bg-green-100 rounded">{managementSuccess}</div>}
            
            {!managementLoading && !managementSuccess && (
              <div>
                {/* --- Shared GS Fields --- */}
                {((selectedThesisForManagement.status || '').toLowerCase() === 'υπό ανάθεση' || (selectedThesisForManagement.status || '').toLowerCase() === 'ενεργή') && (
                  <>
                    <div className="mb-4">
                      <label className="block mb-2 font-semibold text-white">Αριθμός ΓΣ:</label>
                      <input type="text" value={gsNumber} onChange={e => setGsNumber(e.target.value)} className="w-full p-2 border rounded bg-[#1f293a] text-white" placeholder="π.χ. 123" required />
                    </div>
                    <div className="mb-4">
                      <label className="block mb-2 font-semibold text-white">Έτος ΓΣ:</label>
                      <input type="text" value={gsYear} onChange={e => setGsYear(e.target.value)} className="w-full p-2 border rounded bg-[#1f293a] text-white" placeholder="π.χ. 2024" required />
                    </div>
                  </>
                )}

                {/* --- ACTION FOR 'υπό ανάθεση' --- */}
                {(selectedThesisForManagement.status || '').toLowerCase() === 'υπό ανάθεση' && (
                  <button className="bg-green-600 text-white px-4 py-2 rounded w-full" onClick={handleSetActive} disabled={managementLoading}>Θέσε ως Ενεργή</button>
                )}

                {/* --- ACTIONS FOR 'ενεργή' --- */}
                {(selectedThesisForManagement.status || '').toLowerCase() === 'ενεργή' && (
                  <div className="space-y-4">
                    <button className="bg-blue-600 text-white px-4 py-2 rounded w-full" onClick={handleUpdateGs} disabled={managementLoading}>Ενημέρωση Στοιχείων ΓΣ</button>
                    
                    <label>Λόγος Ακύρωσης (Απαιτείται):</label>
                    <div className="border-t border-gray-600 my-4"></div>
                    
                    <div className="input-box">
                      <textarea 
                        value={cancellationReason} 
                        onChange={e => setCancellationReason(e.target.value)} 
                        rows={3}
                        required
                      />
                    </div>
                    <button className="bg-red-600 text-white px-4 py-2 rounded w-full" onClick={handleCancelThesis} disabled={managementLoading || !cancellationReason.trim()}>Ακύρωση Διπλωματικής</button>
                  </div>
                )}
                
                {/* --- ACTION FOR 'υπό εξέταση' --- */}
                {(selectedThesisForManagement.status || '').toLowerCase() === 'υπό εξέταση' && (
                  <div className="mt-4">
                    <button 
                      className="bg-green-600 text-white px-4 py-2 rounded w-full" 
                      onClick={handleSetCompleted} 
                      disabled={managementLoading}
                    >
                      Θέσε ως Περατωμένη
                    </button>
                  </div>
                )}
              </div>
            )}
            
            <button className="bg-gray-500 text-white px-4 py-2 rounded w-full mt-4" onClick={() => setShowThesisManagementModal(false)} disabled={managementLoading}>Κλείσιμο</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;

