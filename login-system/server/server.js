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
  // Insert assignment into theses table with status 'υπό ανάθεση'
  await conn.execute(
    "INSERT INTO theses (student_id, topic_id, supervisor_id, status, created_at) VALUES (?, ?, ?, 'υπό ανάθεση', NOW())",
    [studentId, id, req.user.id]
  );
  // Return success
  res.json({ success: true });
});

// Unassign a topic from a student (professor only)
app.post("/api/topics/:id/unassign", authenticate, async (req, res) => {
  const { id } = req.params; // topic id
  const conn = await mysql.createConnection(dbConfig);

 // 1. Βρες το thesis.id για να ξέρεις σε ποια διπλωματική θα κάνεις cascade delete
 const [thesisRows] = await conn.execute(
   "SELECT id FROM theses WHERE topic_id = ? AND supervisor_id = ? AND status= 'υπό ανάθεση'",
   [id, req.user.id]
 );
 if(thesisRows.length) {
   const thesisId = thesisRows[0].id;

   // 2. Διέγραψε όλες τις προσκλήσεις για αυτή τη διπλωματική
   await conn.execute(
     "DELETE FROM invitations WHERE thesis_id = ?",
     [thesisId]
   );

   // 3. Διέγραψε όλα τα μέλη επιτροπής (αποδεκτά ή μη)
   await conn.execute(
     "DELETE FROM committee_members WHERE thesis_id = ?",
     [thesisId]
   );

   // 4. Τώρα διέγραψε την ίδια την ανάθεση
   await conn.execute(
     "DELETE FROM theses WHERE id = ?",
     [thesisId]
   );
 }

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

// Αναζήτηση διδασκόντων με email (για φοιτητές)
app.get("/api/professors", authenticate, async (req, res) => {
  if (req.user.role !== "Φοιτητής") return res.status(403).json({ error: "Forbidden" });
  const search = req.query.search || "";
  const conn = await mysql.createConnection(dbConfig);
  const [rows] = await conn.execute(
    "SELECT id, name, email FROM professors WHERE email LIKE ?",
    [`%${search}%`]
  );
  await conn.end();
  res.json(rows);
});

// Επιστροφή προσκλήσεων για διπλωματική (και αποδεκτών μελών)
app.get("/api/thesis-invitations/:thesisId", authenticate, async (req, res) => {
  const thesisId = req.params.thesisId;
  const conn = await mysql.createConnection(dbConfig);

  // Προσκλήσεις που είναι ακόμα ενεργές (pending)
  const [invRows] = await conn.execute(
    `SELECT i.id, i.invited_professor_id as professor_id, p.name as professor_name, p.surname as professor_surname, p.email as professor_email, i.status, i.invitation_date
     FROM invitations i
     JOIN professors p ON i.invited_professor_id = p.id
     WHERE i.thesis_id = ?`,
    [thesisId]
  );

  // Μέλη επιτροπής που έχουν αποδεχθεί (ή απορρίψει)
  const [committeeRows] = await conn.execute(
    `SELECT cm.professor_id, p.name as professor_name, p.surname as professor_surname, p.email as professor_email, cm.response as status, cm.invitation_date, cm.response_date
     FROM committee_members cm
     JOIN professors p ON cm.professor_id = p.id
     WHERE cm.thesis_id = ?`,
    [thesisId]
  );

  await conn.end();

  // Map statuses to Greek
  function mapStatus(status) {
    if (!status) return "Αναμένεται";
    if (status === "pending") return "Αναμένεται";
    if (status === "accepted") return "Αποδεκτή";
    if (status === "rejected") return "Απορρίφθηκε";
    return status;
  }

  const all = [
    ...invRows.map(inv => ({
      id: inv.id,
      professor_id: inv.professor_id,
      professor_name: inv.professor_name,
      professor_surname: inv.professor_surname,
      professor_email: inv.professor_email,
      status: mapStatus(inv.status),
      invitation_date: inv.invitation_date || null,
      response_date: null
    })),
    ...committeeRows.map(cm => ({
      id: `cm_${cm.professor_id}`,
      professor_id: cm.professor_id,
      professor_name: cm.professor_name,
      professor_surname: cm.professor_surname,
      professor_email: cm.professor_email,
      status: mapStatus(cm.status),
      invitation_date: cm.invitation_date || null,
      response_date: cm.response_date || null
    }))
  ];

  res.json(all);
});

// Αποστολή πρόσκλησης σε διδάσκοντα
app.post("/api/thesis-invitations/:thesisId/invite", authenticate, async (req, res) => {
  const thesisId = req.params.thesisId;
  const { professorId } = req.body;
  if (!professorId) return res.status(400).json({ error: "Missing professorId" });
  const conn = await mysql.createConnection(dbConfig);

  try {
    let thesisRow;
    if (req.user.role === "Φοιτητής") {
      // Βρες αν ο φοιτητής έχει διπλωματική με το συγκεκριμένο θέμα (topic_id)
      const [rows] = await conn.execute(
        "SELECT id FROM theses WHERE topic_id = ? AND student_id = ?",
        [thesisId, req.user.id]
      );
      if (rows.length === 0) {
        await conn.end();
        return res.status(404).json({ error: "Δεν βρέθηκε διπλωματική που να σας ανήκει." });
      }
      thesisRow = rows[0];
    } else {
      // Για άλλους ρόλους (π.χ. admin), απλά έλεγξε αν υπάρχει η διπλωματική με id = thesisId
      const [rows] = await conn.execute(
        "SELECT id FROM theses WHERE id = ?",
        [thesisId]
      );
      if (rows.length === 0) {
        await conn.end();
        return res.status(404).json({ error: "Η διπλωματική δεν βρέθηκε." });
      }
      thesisRow = rows[0];
    }

    // Έλεγξε αν υπάρχει ο καθηγητής
    const [profRows] = await conn.execute(
      "SELECT id FROM professors WHERE id = ?",
      [professorId]
    );
    if (!profRows.length) {
      await conn.end();
      return res.status(404).json({ error: "Ο διδάσκων δεν βρέθηκε." });
    }

    // Έλεγχος αν υπάρχουν ήδη 2 αποδεκτές προσκλήσεις
    const [accepted] = await conn.execute(
      "SELECT COUNT(*) as cnt FROM invitations WHERE thesis_id = ? AND status = 'Αποδεκτή'",
      [thesisRow.id]
    );
    if (accepted[0].cnt >= 2) {
      await conn.end();
      return res.status(400).json({ error: "Έχουν ήδη αποδεχθεί 2 μέλη." });
    }

    // Μην επιτρέπεις διπλή πρόσκληση στον ίδιο
    const [exists] = await conn.execute(
      "SELECT id FROM invitations WHERE thesis_id = ? AND invited_professor_id = ?",
      [thesisRow.id, professorId]
    );
    if (exists.length > 0) {
      await conn.end();
      return res.status(400).json({ error: "Έχει ήδη σταλεί πρόσκληση σε αυτόν τον διδάσκοντα." });
    }

    // Εισαγωγή πρόσκλησης με status = 'Αναμένεται' by default
    await conn.execute(
      `INSERT INTO invitations (thesis_id, invited_professor_id, invited_by_student_id, status, invitation_date)
       VALUES (?, ?, ?, 'Αναμένεται', NOW())`,
      [thesisRow.id, professorId,req.user.id]
    );

    await conn.end();
    res.json({ success: true });
  } catch (err) {
    await conn.end();
    res.status(500).json({ error: "Σφάλμα βάσης κατά την αποστολή πρόσκλησης.", details: err.message });
  }
});

// Διδάσκων αποδέχεται πρόσκληση για τριμελή
app.post("/api/invitations/:invitationId/accept", authenticate, async (req, res) => {
  if (req.user.role !== "Διδάσκων") return res.status(403).json({ error: "Forbidden" });
  const invitationId = req.params.invitationId;
  const conn = await mysql.createConnection(dbConfig);

  // Βρες την πρόσκληση και το thesis_id ΚΑΙ invitation_date
  const [invRows] = await conn.execute(
    "SELECT thesis_id, invitation_date FROM invitations WHERE id = ? AND invited_professor_id = ?",
    [invitationId, req.user.id]
  );
  if (!invRows.length) {
    await conn.end();
    return res.status(404).json({ error: "Invitation not found" });
  }
  const thesisId = invRows[0].thesis_id;
  const invitationDate = invRows[0].invitation_date;

  // Πρόσθεσε τον καθηγητή ως μέλος επιτροπής (committee_members) ΜΟΝΟ αν δεν υπάρχει ήδη
  const [alreadyMember] = await conn.execute(
    "SELECT * FROM committee_members WHERE thesis_id = ? AND professor_id = ?",
    [thesisId, req.user.id]
  );
  if (!alreadyMember.length) {
    await conn.execute(
      `INSERT INTO committee_members (thesis_id, professor_id, response, response_date, invitation_date)
       VALUES (?, ?, 'Αποδεκτή', NOW(), ? )`,
      [thesisId, req.user.id, invitationDate]
    );
  } else {
    // Αν υπάρχει ήδη, ενημέρωσε invitation_date ΜΟΝΟ αν είναι NULL
    await conn.execute(
      `UPDATE committee_members SET response = 'Αποδεκτή', response_date = NOW(), invitation_date = IFNULL(invitation_date, ?) WHERE thesis_id = ? AND professor_id = ?`,
      [invitationDate, thesisId, req.user.id]
    );
  }

  // Διέγραψε την πρόσκληση
  await conn.execute(
    "DELETE FROM invitations WHERE id = ?",
    [invitationId]
  );

  // Υπολόγισε πόσοι έχουν αποδεχθεί (response='Αποδεκτή')
  const [acceptedRows] = await conn.execute(
    "SELECT COUNT(*) as cnt FROM committee_members WHERE thesis_id = ? AND response = 'Αποδεκτή'",
    [thesisId]
  );
  const acceptedCount = acceptedRows[0].cnt;

  // Αν είναι 2 ή περισσότεροι, κάνε τη διπλωματική ενεργή και ακύρωσε τις υπόλοιπες προσκλήσεις
  if (acceptedCount >= 2) {
    await conn.execute(
      "UPDATE theses SET status = 'ενεργή' WHERE id = ?",
      [thesisId]
    );
    await conn.execute(
      "DELETE FROM invitations WHERE thesis_id = ?",
      [thesisId]
    );
  }

  await conn.end();
  res.json({ success: true, thesisActivated: acceptedCount >= 2 });
});

// Διδάσκων απορρίπτει πρόσκληση για τριμελή
app.post("/api/invitations/:invitationId/reject", authenticate, async (req, res) => {
  if (req.user.role !== "Διδάσκων") return res.status(403).json({ error: "Forbidden" });
  const invitationId = req.params.invitationId;
  const conn = await mysql.createConnection(dbConfig);

  // Βρες την πρόσκληση και το thesis_id ΚΑΙ invitation_date
  const [invRows] = await conn.execute(
    "SELECT thesis_id, invitation_date FROM invitations WHERE id = ? AND invited_professor_id = ?",
    [invitationId, req.user.id]
  );
  if (!invRows.length) {
    await conn.end();
    return res.status(404).json({ error: "Invitation not found" });
  }
  const thesisId = invRows[0].thesis_id;
  const invitationDate = invRows[0].invitation_date;

  // Πρόσθεσε τον καθηγητή ως μέλος επιτροπής με response 'Απορρίφθηκε' ΜΟΝΟ αν δεν υπάρχει ήδη
  const [alreadyMember] = await conn.execute(
    "SELECT * FROM committee_members WHERE thesis_id = ? AND professor_id = ?",
    [thesisId, req.user.id]
  );
  if (!alreadyMember.length) {
    await conn.execute(
      `INSERT INTO committee_members (thesis_id, professor_id, response, response_date, invitation_date)
       VALUES (?, ?, 'Απορρίφθηκε', NOW(), ? )`,
      [thesisId, req.user.id, invitationDate]
    );
  } else {
    // Αν υπάρχει ήδη, ενημέρωσε invitation_date ΠΑΝΤΑ (όχι μόνο αν είναι NULL)
    await conn.execute(
      `UPDATE committee_members SET response = 'Απορρίφθηκε', response_date = NOW(), invitation_date = ? WHERE thesis_id = ? AND professor_id = ?`,
      [invitationDate, thesisId, req.user.id]
    );
  }

  // Διέγραψε την πρόσκληση
  await conn.execute(
    "DELETE FROM invitations WHERE id = ?",
    [invitationId]
  );

  await conn.end();
  res.json({ success: true });
});

// Διαγραφή θέματος (μόνο από τον ιδιοκτήτη καθηγητή)
app.delete("/api/topics/:id", authenticate, async (req, res) => {
  if (req.user.role !== "Διδάσκων") return res.status(403).json({ error: "Forbidden" });
  const { id } = req.params;
  const conn = await mysql.createConnection(dbConfig);

  // Διαγραφή μόνο αν το θέμα ανήκει στον καθηγητή
  const [result] = await conn.execute(
    "DELETE FROM thesis_topics WHERE id = ? AND professor_id = ?",
    [id, req.user.id]
  );
  await conn.end();
  if (result.affectedRows > 0) {
    res.json({ success: true });
  } else {
    res.status(404).json({ error: "Θέμα δεν βρέθηκε ή δεν έχετε δικαίωμα διαγραφής." });
  }
});

// Προσκλήσεις που έχει λάβει ο διδάσκων για τριμελείς (pending/accepted/rejected)
app.get("/api/invitations/received", authenticate, async (req, res) => {
  if (req.user.role !== "Διδάσκων") return res.status(403).json({ error: "Forbidden" });
  const conn = await mysql.createConnection(dbConfig);
  const [rows] = await conn.execute(
    `SELECT i.id, i.status, t.title as topic_title, s.name as student_name, s.surname as student_surname, s.student_number
     FROM invitations i
     JOIN theses th ON i.thesis_id = th.id
     JOIN thesis_topics t ON th.topic_id = t.id
     JOIN students s ON th.student_id = s.id
     WHERE i.invited_professor_id = ?
     ORDER BY i.id DESC`,
    [req.user.id]
  );
  await conn.end();
  // Map status to Greek
  function mapStatus(status) {
    if (!status) return "Αναμένεται";
    if (status === "pending") return "Αναμένεται";
    if (status === "accepted") return "Αποδεκτή";
    if (status === "rejected") return "Απορρίφθηκε";
    return status;
  }
  res.json(rows.map(r => ({
    ...r,
    status: mapStatus(r.status)
  })));
});

// Get all theses under assignment for a professor, with invitations/members info
app.get("/api/teacher/theses-under-assignment", authenticate, async (req, res) => {
  if (req.user.role !== "Διδάσκων") return res.status(403).json({ error: "Forbidden" });
  const conn = await mysql.createConnection(dbConfig);

  // Βρες όλες τις διπλωματικές υπό ανάθεση όπου ο καθηγητής είναι επιβλέπων
  const [theses] = await conn.execute(
    `SELECT th.id, th.status, th.topic_id, th.student_id, th.created_at,
            s.name as student_name, s.surname as student_surname, s.student_number,
            t.title
     FROM theses th
     JOIN students s ON th.student_id = s.id
     JOIN thesis_topics t ON th.topic_id = t.id
     WHERE th.supervisor_id = ? AND th.status = 'υπό ανάθεση'
     ORDER BY th.id DESC`,
    [req.user.id]
  );

  // Για κάθε διπλωματική, φέρε τα invitations και τα μέλη επιτροπής
  const results = [];
  for (const thesis of theses) {
    // Invitations (pending)
    const [invRows] = await conn.execute(
      `SELECT i.id, i.status, i.invitation_date, NULL as response_date,
              p.name as professor_name, p.surname as professor_surname, p.email as professor_email
       FROM invitations i
       JOIN professors p ON i.invited_professor_id = p.id
       WHERE i.thesis_id = ?`,
      [thesis.id]
    );
    // Committee members (accepted/rejected)
     const [cmRows] = await conn.execute(
  `SELECT 
     CONCAT('cm_', cm.professor_id) as id,
     cm.response as status,
     cm.invitation_date,       
     cm.response_date,
     p.name as professor_name,
     p.surname as professor_surname,
     p.email as professor_email
   FROM committee_members cm
   JOIN professors p ON cm.professor_id = p.id
   WHERE cm.thesis_id = ?`,
  [thesis.id]
);
    // Map statuses to Greek
    function mapStatus(status) {
      if (!status) return "Αναμένεται";
      if (status === "pending" || status === "Αναμένεται") return "Αναμένεται";
      if (status === "accepted" || status === "Αποδεκτή") return "Αποδεκτή";
      if (status === "rejected" || status === "Απορρίφθηκε") return "Απορρίφθηκε";
      return status;
    }
    const invitations = [
      ...invRows.map(inv => ({
        ...inv,
        status: mapStatus(inv.status)
      })),
      ...cmRows.map(cm => ({
        ...cm,
        status: mapStatus(cm.status)
      }))
    ];
    results.push({
      id: thesis.id,
      title: thesis.title,
      status: thesis.status,
      student_name: thesis.student_name,
      student_surname: thesis.student_surname,
      student_number: thesis.student_number,
      invitations
    });
  }

  await conn.end();
  res.json(results);
});

// Get all active (ενεργή) theses for a professor (for notes)
app.get("/api/teacher/active-theses", authenticate, async (req, res) => {
  if (req.user.role !== "Διδάσκων") return res.status(403).json({ error: "Forbidden" });
  const conn = await mysql.createConnection(dbConfig);
  const [rows] = await conn.execute(
    `SELECT th.id, th.status, th.topic_id, th.student_id, th.created_at,
            s.name as student_name, s.surname as student_surname, s.student_number,
            t.title
     FROM theses th
     JOIN students s ON th.student_id = s.id
     JOIN thesis_topics t ON th.topic_id = t.id
     WHERE th.supervisor_id = ? AND th.status = 'ενεργή'
     ORDER BY th.id DESC`,
    [req.user.id]
  );
  await conn.end();
  res.json(rows);
});

// Get notes for a thesis (only for the professor who created them)
app.get("/api/notes/:thesisId", authenticate, async (req, res) => {
  if (req.user.role !== "Διδάσκων") return res.status(403).json({ error: "Forbidden" });
  const thesisId = req.params.thesisId;
  const conn = await mysql.createConnection(dbConfig);
  const [rows] = await conn.execute(
    `SELECT id, content, created_at
     FROM notes
     WHERE thesis_id = ? AND professor_id = ?
     ORDER BY created_at DESC`,
    [thesisId, req.user.id]
  );
  await conn.end();
  res.json(rows);
});

// Add a note for a thesis (only for the professor who owns it)
app.post("/api/notes/:thesisId", authenticate, async (req, res) => {
  if (req.user.role !== "Διδάσκων") return res.status(403).json({ error: "Forbidden" });
  const thesisId = req.params.thesisId;
  const { content } = req.body;
  if (!content || typeof content !== "string" || content.length > 300) {
    return res.status(400).json({ error: "Το περιεχόμενο της σημείωσης είναι υποχρεωτικό και μέχρι 300 χαρακτήρες." });
  }
  const conn = await mysql.createConnection(dbConfig);
  await conn.execute(
    `INSERT INTO notes (thesis_id, professor_id, content, created_at)
     VALUES (?, ?, ?, NOW())`,
    [thesisId, req.user.id, content]
  );
  // Return the new note
  const [rows] = await conn.execute(
    `SELECT id, content, created_at
     FROM notes
     WHERE thesis_id = ? AND professor_id = ?
     ORDER BY created_at DESC
     LIMIT 1`,
    [thesisId, req.user.id]
  );
  await conn.end();
  res.json(rows[0]);
});

// Start the server on port 5000
app.listen(5000, () => console.log("Backend running on port 5000"));
