// Import required modules
const express = require("express"); // Express framework for HTTP server
const mysql = require("mysql2/promise"); // MySQL client with promise support
const cors = require("cors"); // Middleware to enable Cross-Origin Resource Sharing
const multer = require("multer"); // Middleware for handling file uploads
const jwt = require("jsonwebtoken"); // For creating and verifying JWT tokens
const bcrypt = require("bcryptjs"); // For hashing and comparing passwords
const path = require("path"); // For handling file paths

// Create an Express application
const app = express();

// Configure multer for file uploads, files will be stored in 'uploads/' directory
const upload = multer({ dest: "uploads/" });

// Enable CORS for all routes (allows frontend to call backend)
app.use(cors());

// Parse incoming JSON requests
app.use(express.json());

// Serve uploaded files as static with correct Content-Type for PDF
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.pdf')) {
      res.setHeader('Content-Type', 'application/pdf');
    }
  }
}));

// Database connection configuration
const dbConfig = {
  host: "database-web.c3kq4isqkxwl.eu-north-1.rds.amazonaws.com", // DB host
  user: "admin", // DB user
  password: "bPCd^sL12$1x7cm61&fV", // DB password
  database: "thesis_support_system", // DB name
  port: 3306 // MySQL default port
};

// Secret key for signing JWT tokens (change in production)
const JWT_SECRET = "your_jwt_secret";

// Middleware to authenticate requests using JWT
function authenticate(req, res, next) {
  const auth = req.headers.authorization; // Get Authorization header
  if (!auth) return res.sendStatus(401); // If no header, unauthorized
  const token = auth.split(" ")[1]; // Extract token from "Bearer <token>"
  jwt.verify(token, JWT_SECRET, (err, user) => { // Verify token
    if (err) return res.sendStatus(403); // If invalid, forbidden
    req.user = user; // Attach user info to request
    next(); // Continue to next middleware/route
  });
}

// Login endpoint for all users (students, professors, secretary)
app.post("/api/login", async (req, res) => {
  // username = student_number (for students) or email (for professors)
  const { username, password } = req.body; // Get credentials from request body
  const conn = await mysql.createConnection(dbConfig); // Connect to DB

  // Try student (login with student_number)
  let [rows] = await conn.execute(
    "SELECT id, name, surname, student_number, password_hash FROM students WHERE student_number = ?",
    [username]
  );
  // Check if student exists and password matches (bcrypt or plain text for dev)
  if (
    rows.length > 0 &&
    (
      bcrypt.compareSync(password, rows[0].password_hash) ||
      password === rows[0].password_hash // Allow plain text for dev
    )
  ) {
    // Build user object for JWT
    const user = {
      id: rows[0].id,
      name: rows[0].name,
      surname: rows[0].surname,
      username: rows[0].student_number,
      role: "Φοιτητής"
    };
    // Sign JWT token
    const token = jwt.sign(user, JWT_SECRET);
    // Return user info and token
    return res.json({ ...user, token });
  }

  // Try professor (login with email)
  [rows] = await conn.execute(
    "SELECT id, name, surname, email, password_hash FROM professors WHERE email = ?",
    [username]
  );
  // Check if professor exists and password matches
  if (
    rows.length > 0 &&
    (
      bcrypt.compareSync(password, rows[0].password_hash) ||
      password === rows[0].password_hash // Allow plain text for dev
    )
  ) {
    // Build user object for JWT
    const user = {
      id: rows[0].id,
      name: rows[0].name,
      surname: rows[0].surname,
      username: rows[0].email,
      role: "Διδάσκων"
    };
    // Sign JWT token
    const token = jwt.sign(user, JWT_SECRET);
    // Return user info and token
    return res.json({ ...user, token });
  }

  // Try admin_secretariat (login with username)
  [rows] = await conn.execute(
    "SELECT id, username, password_hash FROM admin_secretariat WHERE username = ?",
    [username]
  );
  // Check if secretary exists and password matches
  if (rows.length > 0 && bcrypt.compareSync(password, rows[0].password_hash)) {
    // Build user object for JWT
    const user = {
      id: rows[0].id,
      name: "Γραμματεία",
      username: rows[0].username,
      role: "Γραμματεία"
    };
    // Sign JWT token
    const token = jwt.sign(user, JWT_SECRET);
    // Return user info and token
    return res.json({ ...user, token });
  }

  // If no user matched, return error
  res.status(401).json({ error: "Invalid credentials" });
});

// Get all thesis topics (professor view)
app.get("/api/topics", authenticate, async (req, res) => {
  const conn = await mysql.createConnection(dbConfig); // Connect to DB
  // Select topics, join with professor name, and left join with theses and students for assignment info
  const [rows] = await conn.execute(
    `SELECT t.id, t.title, t.summary, t.professor_id, p.name as professor, t.pdf_file_path,
            th.student_id, s.student_number, s.name as student_name, th.status
     FROM thesis_topics t
     JOIN professors p ON t.professor_id = p.id
     LEFT JOIN theses th ON th.topic_id = t.id AND (th.status = 'ενεργή' OR th.status = 'υπό ανάθεση')
     LEFT JOIN students s ON th.student_id = s.id`
  );
  // Return topics as JSON with assignment info
  res.json(rows.map(r => ({
    id: r.id,
    title: r.title,
    summary: r.summary,
    professor: r.professor,
    fileName: r.pdf_file_path,
    assignedTo: r.student_number || null,
    assignedStudentName: r.student_name || null,
    status: r.status || null
  })));
});

// Add a new thesis topic (professor only)
app.post("/api/topics", authenticate, upload.single("file"), async (req, res) => {
  const { title, summary } = req.body; // Get title and summary from request
  const fileName = req.file ? req.file.filename : null; // Get uploaded file name if present
  const professorId = req.user.id; // Get professor id from JWT
  const conn = await mysql.createConnection(dbConfig); // Connect to DB
  // Insert new topic into DB
  await conn.execute(
    "INSERT INTO thesis_topics (professor_id, title, summary, pdf_file_path, created_at) VALUES (?, ?, ?, ?, NOW())",
    [professorId, title, summary, fileName]
  );
  // Get the last inserted id
  const [rows] = await conn.execute("SELECT LAST_INSERT_ID() as id");
  // Return the new topic info
  res.json({ id: rows[0].id, title, summary, professor: req.user.name, fileName });
});

// Edit an existing thesis topic (professor only)
app.patch("/api/topics/:id", authenticate, async (req, res) => {
  const { id } = req.params; // Get topic id from URL
  const { title, summary } = req.body; // Get new title/summary from request
  const conn = await mysql.createConnection(dbConfig); // Connect to DB
  // Update topic in DB (only if professor owns it)
  await conn.execute(
    "UPDATE thesis_topics SET title = ?, summary = ? WHERE id = ? AND professor_id = ?",
    [title, summary, id, req.user.id]
  );
  // Return success
  res.json({ success: true });
});

// Search for students by student_number or name (for assignment)
app.get("/api/students", authenticate, async (req, res) => {
  const search = req.query.search || ""; // Get search term from query
  const conn = await mysql.createConnection(dbConfig); // Connect to DB
  // Search students in DB
  const [rows] = await conn.execute(
    "SELECT id, name, student_number FROM students WHERE student_number LIKE ? OR name LIKE ?",
    [`%${search}%`, `%${search}%`]
  );
  // Return matching students
  res.json(rows);
});

// Assign a topic to a student (professor only)
app.post("/api/topics/:id/assign", authenticate, async (req, res) => {
  const { id } = req.params; // Get topic id from URL
  const { studentId } = req.body; // Get student id from request
  const conn = await mysql.createConnection(dbConfig); // Connect to DB
  // Insert assignment into theses table
  await conn.execute(
    "INSERT INTO theses (student_id, topic_id, supervisor_id, status, created_at) VALUES (?, ?, ?, 'ενεργή', NOW())",
    [studentId, id, req.user.id]
  );
  // Return success
  res.json({ success: true });
});

// Unassign a topic from a student (professor only)
app.post("/api/topics/:id/unassign", authenticate, async (req, res) => {
  const { id } = req.params; // Get topic id from URL
  const conn = await mysql.createConnection(dbConfig); // Connect to DB
  // Delete assignment from theses table
  await conn.execute(
    "DELETE FROM theses WHERE topic_id = ? AND supervisor_id = ?",
    [id, req.user.id]
  );
  // Return success
  res.json({ success: true });
});

// Endpoint για λεπτομέρειες διπλωματικής (student view)
app.get("/api/thesis-details/:topicId", authenticate, async (req, res) => {
  const topicId = req.params.topicId;
  const conn = await mysql.createConnection(dbConfig);

  // Βρες το θέμα
  const [topicRows] = await conn.execute(
    `SELECT t.id, t.title, t.summary, t.pdf_file_path, p.name as professor_name, p.surname as professor_surname
     FROM thesis_topics t
     JOIN professors p ON t.professor_id = p.id
     WHERE t.id = ?`,
    [topicId]
  );

  if (!topicRows.length) {
    await conn.end();
    return res.status(404).json({ error: "Δεν βρέθηκε το θέμα." });
  }

  let thesis = null;
  let debug = {};
  // Αν ο χρήστης είναι φοιτητής, βρες τη διπλωματική που του ανήκει για το συγκεκριμένο θέμα
  if (req.user.role === "Φοιτητής") {
    // Debug: log ids
    debug.student_id = req.user.id;
    debug.topic_id = topicId;
    const [thesisRows] = await conn.execute(
      `SELECT th.id, th.status, th.official_assignment_date, th.supervisor_id
       FROM theses th
       WHERE th.topic_id = ? AND th.student_id = ? LIMIT 1`,
      [topicId, req.user.id]
    );
    if (thesisRows.length > 0) {
      thesis = thesisRows[0];
    } else {
      // Debug: log if not found
      console.log("No thesis found for student_id", req.user.id, "and topic_id", topicId);
    }
  } else {
    // Για άλλους ρόλους, φέρε απλά την πρώτη διπλωματική με αυτό το θέμα
    const [thesisRows] = await conn.execute(
      `SELECT th.id, th.status, th.official_assignment_date, th.supervisor_id
       FROM theses th
       WHERE th.topic_id = ? LIMIT 1`,
      [topicId]
    );
    if (thesisRows.length > 0) thesis = thesisRows[0];
  }

  // Βρες τα μέλη της επιτροπής (committee_members)
  let committee = [];
  if (thesis && thesis.id) {
    const [committeeRows] = await conn.execute(
      `SELECT cm.professor_id, cm.response, cm.response_date, p.name, p.surname,
        CASE
          WHEN cm.professor_id = ? THEN 'Επιβλέπων'
          ELSE 'Μέλος'
        END as role
       FROM committee_members cm
       JOIN professors p ON cm.professor_id = p.id
       WHERE cm.thesis_id = ?`,
      [thesis.supervisor_id, thesis.id]
    );
    committee = committeeRows.map(r => ({
      professor_id: r.professor_id,
      name: r.name,
      surname: r.surname,
      role: r.role
    }));
  }

  await conn.end();

  res.json({
    id: topicRows[0].id,
    title: topicRows[0].title,
    summary: topicRows[0].summary,
    fileName: topicRows[0].pdf_file_path,
    status: thesis ? thesis.status : null,
    official_assignment_date: thesis ? thesis.official_assignment_date : null,
    committee,
    debug // μπορείς να το δεις στο network tab του browser
  });
});

// Επιστροφή στοιχείων επικοινωνίας φοιτητή
app.get("/api/student-profile", authenticate, async (req, res) => {
  if (req.user.role !== "Φοιτητής") return res.status(403).json({ error: "Forbidden" });
  const conn = await mysql.createConnection(dbConfig);
  const [rows] = await conn.execute(
    `SELECT email, mobile_telephone, landline_telephone, street, number, city, postcode
     FROM students WHERE id = ?`,
    [req.user.id]
  );
  await conn.end();
  if (!rows.length) return res.status(404).json({ error: "Not found" });
  res.json(rows[0]);
});

// Ενημέρωση στοιχείων επικοινωνίας φοιτητή
app.patch("/api/student-profile", authenticate, async (req, res) => {
  if (req.user.role !== "Φοιτητής") return res.status(403).json({ error: "Forbidden" });
  const { email, mobile_telephone, landline_telephone, street, number, city, postcode } = req.body;
  const conn = await mysql.createConnection(dbConfig);
  await conn.execute(
    `UPDATE students SET email = ?, mobile_telephone = ?, landline_telephone = ?, street = ?, number = ?, city = ?, postcode = ?
     WHERE id = ?`,
    [email, mobile_telephone, landline_telephone, street, number, city, postcode, req.user.id]
  );
  await conn.end();
  res.json({ success: true });
});

// Start the server on port 5000
app.listen(5000, () => console.log("Backend running on port 5000"));
