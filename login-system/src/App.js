import { useState, useEffect } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { saveAs } from "file-saver"; 

const students = [
  { username: "10433999", password: "10433999", role: "Φοιτητής", name: "Makis" },
  { username: "10434000", password: "10434000", role: "Φοιτητής", name: "John" },
  { username: "10434001", password: "10434001", role: "Φοιτητής", name: "Petros" },
  { username: "10434002", password: "10434002", role: "Φοιτητής", name: "test" },
  { username: "10434003", password: "10434003", role: "Φοιτητής", name: "Robert" },
  { username: "10434004", password: "10434004", role: "Φοιτητής", name: "Rex" },
  { username: "10434005", password: "10434005", role: "Φοιτητής", name: "Paul" },
  { username: "10434006", password: "10434006", role: "Φοιτητής", name: "Pedro" },
  { username: "10434007", password: "10434007", role: "Φοιτητής", name: "David" },
  { username: "10434008", password: "10434008", role: "Φοιτητής", name: "Lana" },
];

const professors = [
  { username: "akomninos@ceid.upatras.gr", password: "akomninos", role: "Διδάσκων", name: "Andreas" },
  { username: "vasfou@ceid.upatras.gr", password: "vasfou", role: "Διδάσκων", name: "Vasilis" },
  { username: "karras@nterti.com", password: "karras", role: "Διδάσκων", name: "Basilis" },
  { username: "eleni@ceid.gr", password: "eleni", role: "Διδάσκων", name: "Eleni" },
  { username: "hozier@ceid.upatras.gr", password: "hozier", role: "Διδάσκων", name: "Andrew" },
];

const users = [...students, ...professors];

function App() {
  const [user, setUser] = useState(null);
  const [topics, setTopics] = useState([]);

  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login setUser={setUser} />} />
        <Route path="/logout" element={<Logout setUser={setUser} />} />
        <Route path="/teacher" element={<PrivateRoute user={user} role="Διδάσκων"><Teacher user={user} /></PrivateRoute>} />
        <Route path="/teacher/topics" element={<PrivateRoute user={user} role="Διδάσκων"><TopicManagement user={user} topics={topics} setTopics={setTopics} /></PrivateRoute>} />
        <Route path="/teacher/assign" element={<PrivateRoute user={user} role="Διδάσκων"><InitialAssignment user={user} topics={topics} setTopics={setTopics} /></PrivateRoute>} />
        <Route path="/student" element={<PrivateRoute user={user} role="Φοιτητής"><Student user={user} topics={topics} /></PrivateRoute>} />
        <Route path="/admin" element={<PrivateRoute user={user} role="Γραμματεία"><Admin /></PrivateRoute>} />
        <Route path="*" element={<Navigate to="/login" />} />
      </Routes>
    </Router>
  );
}

function Login({ setUser }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const navigate = useNavigate();

  const handleLogin = () => {
    const foundUser = users.find(u => u.username === username && u.password === password);
    if (foundUser) {
      setUser(foundUser);
      if (foundUser.role === "Διδάσκων") navigate("/teacher");
      else if (foundUser.role === "Φοιτητής") navigate("/student");
      else if (foundUser.role === "Γραμματεία") navigate("/admin");
    } else {
      alert("Λάθος στοιχεία σύνδεσης");
    }
  };

  return (
    <div className="p-4 max-w-md mx-auto">
      <h2 className="text-xl font-bold mb-4">Σύνδεση</h2>
      <input className="border p-2 w-full mb-2" placeholder="Όνομα Χρήστη" value={username} onChange={e => setUsername(e.target.value)} />
      <input className="border p-2 w-full mb-2" placeholder="Κωδικός" type="password" value={password} onChange={e => setPassword(e.target.value)} />
      <button className="bg-blue-500 text-white px-4 py-2" onClick={handleLogin}>Σύνδεση</button>
    </div>
  );
}

function Logout({ setUser }) {
  const navigate = useNavigate();

  useEffect(() => {
    setUser(null);
    navigate("/login");
  }, []);

  return null;
}

function PrivateRoute({ user, role, children }) {
  if (!user) return <Navigate to="/login" />;
  if (user.role !== role) return <Navigate to="/login" />;
  return children;
}

function Teacher({ user, topics, setTopics }) {
  const navigate = useNavigate();
  return (
    <div className="p-4 space-y-4">
      <h2 className="text-xl font-bold mb-4">Καλωσορίσατε Διδάσκων: {user.name}</h2>
      <button className="bg-blue-500 text-white px-4 py-2 rounded w-full" onClick={() => navigate("/teacher/topics")}>Προβολή και Δημιουργία θεμάτων προς ανάθεση</button>
      <button className="bg-blue-500 text-white px-4 py-2 rounded w-full" onClick={() => navigate("/teacher/assign")}>Αρχική Ανάθεση Θέματος σε Φοιτητή</button>
      <ThesisList user={user} topics={topics} setTopics={setTopics} />
    </div>
  );
}

function ThesisList({ user, topics = [], setTopics }) {
  const [statusFilter, setStatusFilter] = useState("");
  const [roleFilter, setRoleFilter] = useState("");

  const filtered = (topics || []).filter(t => {
    const roleMatch = !roleFilter || t.professor === user.name;
    const statusMatch = !statusFilter || t.status === statusFilter;
    return roleMatch && statusMatch;
  });

  const exportToCSV = () => {
    const headers = ["Title", "Summary", "Status", "Student", "Role"];
    const rows = filtered.map(t => [t.title, t.summary, t.status || "-", t.assignedStudentName || "-", t.professor === user.name ? "Επιβλέπων" : "Μέλος"]);
    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    saveAs(blob, "thesis_list.csv");
  };

  const exportToJSON = () => {
    const json = JSON.stringify(filtered, null, 2);
    const blob = new Blob([json], { type: "application/json;charset=utf-8;" });
    saveAs(blob, "thesis_list.json");
  };

  return (
    <div className="p-4 border rounded mt-6">
      <h3 className="text-lg font-bold mb-2">Προβολή Λίστας Διπλωματικών</h3>
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


function TopicManagement({ user, topics = [], setTopics }) {
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [file, setFile] = useState(null);

  const handleAddTopic = () => {
    if (!title || !summary) return alert("Συμπληρώστε όλα τα πεδία");
    const newTopic = {
      id: Date.now(),
      title,
      summary,
      fileName: file ? file.name : null,
      professor: user.name
    };
    setTopics([...topics, newTopic]);
    setTitle("");
    setSummary("");
    setFile(null);
  };

  const handleEdit = (id, field, value) => {
    setTopics(topics.map(topic => topic.id === id ? { ...topic, [field]: value } : topic));
  };

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-4">
      <h2 className="text-xl font-bold">Δημιουργία Νέου Θέματος</h2>
      <input className="border p-2 w-full" placeholder="Τίτλος" value={title} onChange={e => setTitle(e.target.value)} />
      <textarea className="border p-2 w-full" placeholder="Σύνοψη" value={summary} onChange={e => setSummary(e.target.value)} />
      <input type="file" accept="application/pdf" onChange={e => setFile(e.target.files[0])} />
      <button className="bg-green-500 text-white px-4 py-2" onClick={handleAddTopic}>Προσθήκη</button>

      <h2 className="text-xl font-bold mt-6">Τα Θέματά Μου</h2>
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

function InitialAssignment({ user, topics = [], setTopics }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [filteredStudents, setFilteredStudents] = useState([]);

  const handleSearch = () => {
    const term = searchTerm.toLowerCase();
    const matches = students.filter(
      s => s.username.includes(term) || s.name.toLowerCase().includes(term)
    );
    setFilteredStudents(matches);
  };

  const availableTopics = topics.filter(
    t => t.professor === user.name && !t.assignedTo
  );

  const assignTopic = (topicId, student) => {
    setTopics(topics.map(t =>
      t.id === topicId ? { ...t, assignedTo: student.username, assignedStudentName: student.name } : t
    ));
  };

  const unassignTopic = (topicId) => {
    setTopics(topics.map(t =>
      t.id === topicId ? { ...t, assignedTo: null, assignedStudentName: null } : t
    ));
  };

  return (
    <div className="p-4 max-w-4xl mx-auto space-y-6">
      <h2 className="text-xl font-bold">Αρχική Ανάθεση Θέματος σε Φοιτητή</h2>

      <div className="flex space-x-2">
        <input className="border p-2 flex-1" placeholder="Αναζήτηση με ΑΜ ή Όνομα" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
        <button className="bg-blue-500 text-white px-4 py-2" onClick={handleSearch}>Αναζήτηση</button>
      </div>

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

function Student({ user, topics = [] }) {
  const professorTopics = (topics || []).filter(t => t.professor);
  return (
    <div className="p-4 max-w-2xl mx-auto space-y-4">
      <h2 className="text-xl font-bold">Καλωσορίσατε Φοιτητή: {user.name}</h2>
      <h3 className="text-lg font-semibold mt-4">Διαθέσιμα Θέματα</h3>
      {professorTopics.map(topic => (
        <div key={topic.id} className="border p-4 mb-2">
          <h4 className="font-bold">{topic.title}</h4>
          <p className="text-sm text-gray-600">{topic.summary}</p>
          <p className="text-sm">Εισηγητής: {topic.professor}</p>
          {topic.fileName && <p className="text-sm text-blue-600">Αρχείο: {topic.fileName}</p>}
        </div>
      ))}
    </div>
  );
}

function Admin() {
  return <div className="p-4">Καλωσορίσατε Γραμματεία</div>;
}

export default App;
