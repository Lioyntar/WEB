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

// Serve uploaded files as static with correct Content-Type for PDF
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.pdf')) {
      res.setHeader('Content-Type', 'application/pdf');
    }
  }
}));

// Serve draft uploads as static (for draft_submissions)
app.use('/draft_uploads', express.static(path.join(__dirname, 'draft_uploads'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.pdf')) {
      res.setHeader('Content-Type', 'application/pdf');
    }
  }
}));

// Enable CORS for all routes (allows frontend to call backend)
app.use(cors());

// Parse incoming JSON requests
app.use(express.json());

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
    console.log('Authenticated user:', user); // Log user data
    console.log('User ID type:', typeof user.id, 'User ID value:', user.id);
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
  if (
    rows.length > 0 &&
    (bcrypt.compareSync(password, rows[0].password_hash) ||
      password === rows[0].password_hash) // Allow plain text for dev
  ) {
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
            th.student_id, s.student_number, s.name as student_name, th.status, th.id as th_id
     FROM thesis_topics t
     JOIN professors p ON t.professor_id = p.id
     LEFT JOIN theses th ON th.topic_id = t.id AND (th.status = 'ενεργή' OR th.status = 'υπό ανάθεση' OR th.status = 'υπό εξέταση')
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
    status: r.status || null,
    thesis_id: r.th_id || null
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
    // Ενημέρωσε official_assignment_date ΜΟΝΟ αν είναι NULL
    await conn.execute(
      "UPDATE theses SET status = 'ενεργή', official_assignment_date = IFNULL(official_assignment_date, NOW()) WHERE id = ?",
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

  try {
    await conn.beginTransaction();

    // 1. First delete any theses using this topic
    await conn.execute(
      "DELETE FROM theses WHERE topic_id = ? AND supervisor_id = ?",
      [id, req.user.id]
    );

    // 2. Then delete the topic
    const [result] = await conn.execute(
      "DELETE FROM thesis_topics WHERE id = ? AND professor_id = ?",
      [id, req.user.id]
    );

    await conn.commit();
    
    if (result.affectedRows > 0) {
      res.json({ success: true });
    } else {
      res.status(404).json({ error: "Θέμα δεν βρέθηκε ή δεν έχετε δικαίωμα διαγραφής." });
    }
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: "Σφάλμα κατά τη διαγραφή", details: err.message });
  } finally {
    await conn.end();
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
            th.official_assignment_date,
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
app.listen(5000, () => {
  console.log('Server running on port 5000');
});

// Ακύρωση διπλωματικής από επιβλέποντα
app.post("/api/theses/:id/cancel-by-supervisor", authenticate, async (req, res) => {
  if (req.user.role !== "Διδάσκων") return res.status(403).json({ error: "Forbidden" });
  
  const thesisId = req.params.id;
  const { cancel_gs_number, cancel_gs_year } = req.body;
  const conn = await mysql.createConnection(dbConfig);

  try {
    // Validate input
    if (!cancel_gs_number || !cancel_gs_year) {
      throw new Error("Απαιτείται αριθμός και έτος ΓΣ");
    }

    // Verify thesis exists and belongs to professor
    const [thesis] = await conn.execute(
      `SELECT id, official_assignment_date, status 
       FROM theses 
       WHERE id = ? AND supervisor_id = ?`,
      [thesisId, req.user.id]
    );
    
    if (!thesis.length) {
      throw new Error("Η διπλωματική δεν βρέθηκε ή δεν έχετε δικαίωμα ακύρωσης");
    }

    // Verify 2 years have passed
    const assignmentDate = new Date(thesis[0].official_assignment_date);
    const twoYearsAgo = new Date();
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
    
    if (assignmentDate > twoYearsAgo) {
      throw new Error("Δεν έχουν περάσει 2 χρόνια από την οριστική ανάθεση");
    }

    await conn.beginTransaction();

    // Insert cancellation record
    await conn.execute(
      `INSERT INTO cancellations 
       (thesis_id, cancelled_by, reason, gs_number, gs_year, cancelled_at)
       VALUES (?, ?, ?, ?, ?, NOW())`,
      [thesisId, 'Καθηγητής', 'από Διδάσκοντα', cancel_gs_number, cancel_gs_year]
    );

    // Delete related records (invitations, committee_members, notes) in parallel for speed
    await Promise.all([
      conn.execute("DELETE FROM notes WHERE thesis_id = ?", [thesisId]),
      conn.execute("DELETE FROM committee_members WHERE thesis_id = ?", [thesisId]),
      conn.execute("DELETE FROM invitations WHERE thesis_id = ?", [thesisId])
    ]);

    // Update thesis status
    const [result] = await conn.execute(
      `UPDATE theses 
       SET status = 'ακυρωμένη'
       WHERE id = ?`,
      [thesisId]
    );

    if (result.affectedRows === 0) {
      throw new Error("Αποτυχία ενημέρωσης κατάστασης διπλωματικής");
    }

    await conn.commit();
    res.json({ success: true });
  } catch (err) {
    await conn.rollback();
    console.error("Cancellation error:", err);
    res.status(500).json({ 
      error: "Σφάλμα βάσης κατά την ακύρωση",
      details: err.message 
    });
  } finally {
    await conn.end();
  }
});

// Αλλαγή κατάστασης διπλωματικής σε "υπό εξέταση" από επιβλέποντα
app.post("/api/theses/:id/set-under-examination", authenticate, async (req, res) => {
  if (req.user.role !== "Διδάσκων") return res.status(403).json({ error: "Forbidden" });
  const thesisId = req.params.id;
  const conn = await mysql.createConnection(dbConfig);
  try {
    // Ενημέρωσε μόνο αν ο καθηγητής είναι επιβλέπων και η διπλωματική είναι ενεργή
    const [rows] = await conn.execute(
      `SELECT id, status FROM theses WHERE id = ? AND supervisor_id = ? AND status = 'ενεργή'`,
      [thesisId, req.user.id]
    );
    if (!rows.length) {
      await conn.end();
      return res.status(404).json({ error: "Δεν βρέθηκε ενεργή διπλωματική για αλλαγή κατάστασης." });
    }
    await conn.execute(
      `UPDATE theses SET status = 'υπό εξέταση' WHERE id = ?`,
      [thesisId]
    );
    await conn.end();
    res.json({ success: true });
  } catch (err) {
    await conn.end();
    res.status(500).json({ error: "Σφάλμα κατά την αλλαγή κατάστασης.", details: err.message });
  }
});

// --- DRAFT SUBMISSION ENDPOINTS ---
const draftUpload = multer({ dest: 'draft_uploads/' });

// POST: Upload or update draft submission (student only)
app.post('/api/draft-submission', authenticate, draftUpload.single('file'), async (req, res) => {
  if (req.user.role !== 'Φοιτητής') return res.status(403).json({ error: 'Forbidden' });
  const { externalLinks } = req.body;
  let thesisId = Number(req.body.thesisId || req.params.thesisId);
  const conn = await mysql.createConnection(dbConfig);
  try {
    const file = req.file;
    // Αν το thesisId δεν αντιστοιχεί σε διπλωματική του φοιτητή, δοκίμασε ως topicId
    let [thesisRows] = await conn.execute(
      'SELECT id FROM theses WHERE id = ? AND student_id = ?',
      [thesisId, req.user.id]
    );
    if (!thesisRows.length) {
      // Ίσως το thesisId είναι topicId, βρες το thesisId με βάση το topicId και τον φοιτητή
      const [byTopic] = await conn.execute(
        'SELECT id FROM theses WHERE topic_id = ? AND student_id = ?',
        [thesisId, req.user.id]
      );
      if (byTopic.length) {
        thesisId = byTopic[0].id;
        thesisRows = byTopic;
      }
    }
    if (!thesisRows.length) {
      await conn.end();
      return res.status(404).json({ error: 'Δεν βρέθηκε διπλωματική που να σας ανήκει.' });
    }
    // Check if already exists
    const [existing] = await conn.execute(
      'SELECT id FROM draft_submissions WHERE thesis_id = ? AND student_id = ?',
      [thesisId, req.user.id]
    );
    let filePath = file ? file.filename : null;
    let links = externalLinks || null;
    if (existing.length) {
      // Update
      let updateSql = 'UPDATE draft_submissions SET ';
      let params = [];
      if (filePath) {
        updateSql += 'file_path = ?, ';
        params.push(filePath);
      }
      updateSql += 'external_links = ?, uploaded_at = NOW() WHERE id = ?';
      params.push(links, existing[0].id);
      await conn.execute(updateSql, params);
    } else {
      // Insert
      await conn.execute(
        'INSERT INTO draft_submissions (thesis_id, student_id, file_path, external_links, uploaded_at) VALUES (?, ?, ?, ?, NOW())',
        [thesisId, req.user.id, filePath, links]
      );
    }
    await conn.end();
    res.json({ success: true });
  } catch (err) {
    await conn.end();
    res.status(500).json({ error: 'Σφάλμα κατά την αποθήκευση πρόχειρης ανάρτησης', details: err.message });
  }
});

// GET: Fetch draft submission for a thesis (student or committee member)
app.get('/api/draft-submission/:thesisId', authenticate, async (req, res) => {
  const thesisId = req.params.thesisId;
  const conn = await mysql.createConnection(dbConfig);
  try {
    // Επιτρέπεται αν ο χρήστης είναι φοιτητής που ανήκει η διπλωματική ή μέλος επιτροπής
    let allowed = false;
    if (req.user.role === 'Φοιτητής') {
      const [rows] = await conn.execute('SELECT id FROM theses WHERE id = ? AND student_id = ?', [thesisId, req.user.id]);
      allowed = rows.length > 0;
    } else if (req.user.role === 'Διδάσκων') {
      // Είναι μέλος επιτροπής ή επιβλέπων;
      const [rows] = await conn.execute(
        `SELECT th.id FROM theses th
         LEFT JOIN committee_members cm ON cm.thesis_id = th.id AND cm.professor_id = ?
         WHERE th.id = ? AND (th.supervisor_id = ? OR cm.professor_id = ?)`,
        [req.user.id, thesisId, req.user.id, req.user.id]
      );
      allowed = rows.length > 0;
    } else if (req.user.role === 'Γραμματεία') {
      allowed = true;
    }
    if (!allowed) {
      await conn.end();
      return res.status(403).json({ error: 'Δεν έχετε δικαίωμα προβολής.' });
    }
    const [rows] = await conn.execute(
      'SELECT id, file_path, external_links, uploaded_at FROM draft_submissions WHERE thesis_id = ? ORDER BY uploaded_at DESC LIMIT 1',
      [thesisId]
    );
    await conn.end();
    if (!rows.length) return res.json(null);
    res.json(rows[0]);
  } catch (err) {
    await conn.end();
    res.status(500).json({ error: 'Σφάλμα κατά την ανάκτηση πρόχειρης ανάρτησης', details: err.message });
  }
});

// Get all under examination (υπό εξέταση) theses for a professor (as supervisor or committee member)
app.get("/api/teacher/under-examination-theses", authenticate, async (req, res) => {
  if (req.user.role !== "Διδάσκων") return res.status(403).json({ error: "Forbidden" });
  const conn = await mysql.createConnection(dbConfig);
  try {
    // Ως επιβλέπων
    const [asSupervisor] = await conn.execute(
      `SELECT th.id, th.status, th.topic_id, th.student_id, th.created_at,
              th.official_assignment_date,
              s.name as student_name, s.surname as student_surname, s.student_number,
              t.title
       FROM theses th
       JOIN students s ON th.student_id = s.id
       JOIN thesis_topics t ON th.topic_id = t.id
       WHERE th.supervisor_id = ? AND th.status = 'υπό εξέταση'`,
      [req.user.id]
    );
    // Ως μέλος επιτροπής
    const [asMember] = await conn.execute(
      `SELECT th.id, th.status, th.topic_id, th.student_id, th.created_at,
              th.official_assignment_date,
              s.name as student_name, s.surname as student_surname, s.student_number,
              t.title
       FROM theses th
       JOIN students s ON th.student_id = s.id
       JOIN thesis_topics t ON th.topic_id = t.id
       JOIN committee_members cm ON cm.thesis_id = th.id AND cm.professor_id = ?
       WHERE th.status = 'υπό εξέταση'`,
      [req.user.id]
    );
    // Ενώνω και αφαιρώ διπλότυπα (αν κάποιος είναι και επιβλέπων και μέλος)
    const map = new Map();
    [...asSupervisor, ...asMember].forEach(th => map.set(th.id, th));
    
    // Fetch presentation details for each thesis
    const results = [];
    for (const thesis of map.values()) {
      let presentationDetails = null;
      try {
        const [presRows] = await conn.execute(
          'SELECT presentation_date, mode, location_or_link, announcement_text FROM presentation_details WHERE thesis_id = ? ORDER BY created_at DESC LIMIT 1',
          [thesis.id]
        );
        presentationDetails = presRows.length > 0 ? presRows[0] : null;
      } catch (tableErr) {
        // Table doesn't exist, presentationDetails remains null
        console.log('presentation_details table not found, skipping...');
      }
      results.push({
        ...thesis,
        presentation_details: presentationDetails
      });
    }
    
    await conn.end();
    res.json(results);
  } catch (err) {
    await conn.end();
    res.status(500).json({ error: "Σφάλμα κατά την ανάκτηση διπλωματικών υπό εξέταση", details: err.message });
  }
});

// --- PRESENTATION DETAILS ENDPOINTS ---

// GET: Fetch presentation details for a thesis (student or committee member)
app.get('/api/presentation-details/:thesisId', authenticate, async (req, res) => {
  const thesisId = req.params.thesisId;
  const conn = await mysql.createConnection(dbConfig);
  try {
    // Επιτρέπεται αν ο χρήστης είναι φοιτητής που ανήκει η διπλωματική ή μέλος επιτροπής
    let allowed = false;
    if (req.user.role === 'Φοιτητής') {
      const [rows] = await conn.execute('SELECT id FROM theses WHERE id = ? AND student_id = ?', [thesisId, req.user.id]);
      allowed = rows.length > 0;
    } else if (req.user.role === 'Διδάσκων') {
      // Είναι μέλος επιτροπής ή επιβλέπων
      const [rows] = await conn.execute(
        `SELECT th.id FROM theses th
         LEFT JOIN committee_members cm ON cm.thesis_id = th.id AND cm.professor_id = ?
         WHERE th.id = ? AND (th.supervisor_id = ? OR cm.professor_id = ?)`,
        [req.user.id, thesisId, req.user.id, req.user.id]
      );
      allowed = rows.length > 0;
    } else if (req.user.role === 'Γραμματεία') {
      allowed = true;
    }
    if (!allowed) {
      await conn.end();
      return res.status(403).json({ error: 'Δεν έχετε δικαίωμα προβολής.' });
    }
    
    // Check if presentation_details table exists
    try {
      await conn.execute('SELECT 1 FROM presentation_details LIMIT 1');
    } catch (tableErr) {
      await conn.end();
      return res.json(null); // Table doesn't exist, return null
    }
    
    const [rows] = await conn.execute(
      'SELECT id, presentation_date, mode, location_or_link, created_at FROM presentation_details WHERE thesis_id = ? ORDER BY created_at DESC LIMIT 1',
      [thesisId]
    );
    await conn.end();
    if (!rows.length) return res.json(null);
    res.json(rows[0]);
  } catch (err) {
    await conn.end();
    res.status(500).json({ error: 'Σφάλμα κατά την ανάκτηση λεπτομερειών παρουσίασης', details: err.message });
  }
});

// POST: Create or update presentation details (student only)
app.post('/api/presentation-details', authenticate, async (req, res) => {
  if (req.user.role !== 'Φοιτητής') return res.status(403).json({ error: 'Forbidden' });
  const { thesisId, presentationDate, mode, locationOrLink } = req.body;
  const conn = await mysql.createConnection(dbConfig);
  try {
    console.log('Presentation details request:', { thesisId, presentationDate, mode, locationOrLink });
    
    // Validate input
    if (!thesisId || !presentationDate || !mode || !locationOrLink) {
      return res.status(400).json({ error: 'Όλα τα πεδία είναι υποχρεωτικά.' });
    }
    
    // Validate mode
    if (!['δια ζώσης', 'διαδικτυακά'].includes(mode)) {
      return res.status(400).json({ error: 'Μη έγκυρος τρόπος παρουσίασης.' });
    }

    // Check if presentation_details table exists, create if not
    try {
      await conn.execute('SELECT 1 FROM presentation_details LIMIT 1');
    } catch (tableErr) {
      console.log('Creating presentation_details table...');
      await conn.execute(`
        CREATE TABLE presentation_details (
          id INT AUTO_INCREMENT PRIMARY KEY,
          thesis_id INT NOT NULL,
          presentation_date DATETIME NOT NULL,
          mode VARCHAR(20) NOT NULL,
          location_or_link TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (thesis_id) REFERENCES theses(id) ON DELETE CASCADE
        )
      `);
    }

    // Convert ISO date format to MySQL datetime format
    let mysqlDateTime;
    try {
      const date = new Date(presentationDate);
      if (isNaN(date.getTime())) {
        return res.status(400).json({ error: 'Μη έγκυρη ημερομηνία.' });
      }
      // Format as YYYY-MM-DD HH:MM:SS for MySQL
      mysqlDateTime = date.toISOString().slice(0, 19).replace('T', ' ');
      console.log('Converted datetime:', mysqlDateTime);
    } catch (err) {
      console.error('Date conversion error:', err);
      return res.status(400).json({ error: 'Μη έγκυρη μορφή ημερομηνίας.' });
    }

    // Check if thesis belongs to student
    let actualThesisId = Number(thesisId);
    const [thesisRows] = await conn.execute(
      'SELECT id FROM theses WHERE id = ? AND student_id = ?',
      [actualThesisId, req.user.id]
    );
    if (!thesisRows.length) {
      // Maybe thesisId is topicId, find thesisId based on topicId and student
      const [byTopic] = await conn.execute(
        'SELECT id FROM theses WHERE topic_id = ? AND student_id = ?',
        [actualThesisId, req.user.id]
      );
      if (byTopic.length) {
        actualThesisId = byTopic[0].id;
        console.log('Found thesis by topic_id:', actualThesisId);
      } else {
        await conn.end();
        return res.status(404).json({ error: 'Δεν βρέθηκε διπλωματική που να σας ανήκει.' });
      }
    }

    console.log('Using thesis_id:', actualThesisId);

    // Check if already exists
    const [existing] = await conn.execute(
      'SELECT id FROM presentation_details WHERE thesis_id = ?',
      [actualThesisId]
    );

    if (existing.length) {
      // Update
      console.log('Updating existing presentation details');
      await conn.execute(
        'UPDATE presentation_details SET presentation_date = ?, mode = ?, location_or_link = ?, created_at = NOW() WHERE thesis_id = ?',
        [mysqlDateTime, mode, locationOrLink, actualThesisId]
      );
    } else {
      // Insert
      console.log('Inserting new presentation details');
      await conn.execute(
        'INSERT INTO presentation_details (thesis_id, presentation_date, mode, location_or_link, created_at) VALUES (?, ?, ?, ?, NOW())',
        [actualThesisId, mysqlDateTime, mode, locationOrLink]
      );
    }
    await conn.end();
    res.json({ success: true });
  } catch (err) {
    await conn.end();
    console.error('Presentation details error:', err);
    res.status(500).json({ error: 'Σφάλμα κατά την αποθήκευση λεπτομερειών παρουσίασης', details: err.message });
  }
});

// GET: Fetch announcement text for a thesis (supervisor only)
app.get('/api/announcement-text/:thesisId', authenticate, async (req, res) => {
  if (req.user.role !== 'Διδάσκων') return res.status(403).json({ error: 'Forbidden' });
  
  const thesisId = req.params.thesisId;
  const conn = await mysql.createConnection(dbConfig);
  
  try {
    // Check if professor is supervisor of this thesis
    const [thesisRows] = await conn.execute(
      'SELECT id FROM theses WHERE id = ? AND supervisor_id = ?',
      [thesisId, req.user.id]
    );
    
    console.log('Thesis check result:', thesisRows);
    
    if (!thesisRows.length) {
      await conn.end();
      return res.status(403).json({ error: 'Δεν έχετε δικαίωμα πρόσβασης.' });
    }
    
    // Check if announcement_text column exists, add if not
    try {
      await conn.execute('SELECT announcement_text FROM presentation_details LIMIT 1');
    } catch (colErr) {
      console.log('Adding announcement_text column...');
      await conn.execute('ALTER TABLE presentation_details ADD COLUMN announcement_text TEXT');
    }
    
    // Check if presentation details exist
    const [presRows] = await conn.execute(
      'SELECT announcement_text FROM presentation_details WHERE thesis_id = ? ORDER BY created_at DESC LIMIT 1',
      [thesisId]
    );
    
    console.log('Presentation details check result:', presRows);
    
    if (!presRows.length) {
      await conn.end();
      return res.status(404).json({ error: 'Δεν βρέθηκαν λεπτομέρειες παρουσίασης.' });
    }
    
    res.json({ announcement_text: presRows[0].announcement_text || '' });
  } catch (err) {
    await conn.end();
    res.status(500).json({ error: 'Σφάλμα κατά την ανάκτηση κειμένου ανακοίνωσης', details: err.message });
  }
});

// POST: Update announcement text for a thesis (supervisor only)
app.post('/api/announcement-text/:thesisId', authenticate, async (req, res) => {
  if (req.user.role !== 'Διδάσκων') return res.status(403).json({ error: 'Forbidden' });
  
  const thesisId = req.params.thesisId;
  const { announcement_text } = req.body;
  const conn = await mysql.createConnection(dbConfig);
  
  try {
    console.log('Announcement text request:', { thesisId, announcement_text, userId: req.user.id });
    
    // Check if professor is supervisor of this thesis
    const [thesisRows] = await conn.execute(
      'SELECT id FROM theses WHERE id = ? AND supervisor_id = ?',
      [thesisId, req.user.id]
    );
    
    console.log('Thesis check result:', thesisRows);
    
    if (!thesisRows.length) {
      await conn.end();
      return res.status(403).json({ error: 'Δεν έχετε δικαίωμα πρόσβασης.' });
    }
    
    // Check if presentation details exist
    const [presRows] = await conn.execute(
      'SELECT id FROM presentation_details WHERE thesis_id = ? ORDER BY created_at DESC LIMIT 1',
      [thesisId]
    );
    
    console.log('Presentation details check result:', presRows);
    
    if (!presRows.length) {
      await conn.end();
      return res.status(404).json({ error: 'Δεν βρέθηκαν λεπτομέρειες παρουσίασης.' });
    }
    
    // Check if announcement_text column exists, add if not
    try {
      await conn.execute('SELECT announcement_text FROM presentation_details LIMIT 1');
    } catch (colErr) {
      console.log('Adding announcement_text column...');
      await conn.execute('ALTER TABLE presentation_details ADD COLUMN announcement_text TEXT');
    }
    
    // Update announcement text
    const [updateResult] = await conn.execute(
      'UPDATE presentation_details SET announcement_text = ? WHERE thesis_id = ?',
      [announcement_text || '', thesisId]
    );
    
    console.log('Update result:', updateResult);
    
    await conn.end();
    res.json({ success: true });
  } catch (err) {
    console.error('Announcement text error:', err);
    await conn.end();
    res.status(500).json({ error: 'Σφάλμα κατά την αποθήκευση κειμένου ανακοίνωσης', details: err.message });
  }
});

// GET: Fetch grades for a thesis (committee members only)
app.get('/api/grades/:thesisId', authenticate, async (req, res) => {
  if (req.user.role !== 'Διδάσκων') return res.status(403).json({ error: 'Forbidden' });
  
  const thesisId = req.params.thesisId;
  const conn = await mysql.createConnection(dbConfig);
  
  try {
    console.log('Grades request:', { thesisId, userId: req.user.id, userRole: req.user.role });
    console.log('Thesis ID type:', typeof thesisId, 'Thesis ID value:', thesisId);
    
    // Check if professor is committee member or supervisor of this thesis
    const [thesisRows] = await conn.execute(
      `SELECT th.id, th.supervisor_id, cm.professor_id as committee_member_id
       FROM theses th
       LEFT JOIN committee_members cm ON cm.thesis_id = th.id AND cm.professor_id = ?
       WHERE th.id = ?`,
      [req.user.id, thesisId]
    );
    
    console.log('Thesis check result:', thesisRows);
    
    // Check if user is supervisor or committee member
    const isSupervisor = thesisRows.some(row => row.supervisor_id === req.user.id);
    const isCommitteeMember = thesisRows.some(row => row.committee_member_id === req.user.id);
    
    console.log('Access check:', { isSupervisor, isCommitteeMember, thesisId, userId: req.user.id });
    
    if (!isSupervisor && !isCommitteeMember) {
      await conn.end();
      return res.status(403).json({ error: 'Δεν έχετε δικαίωμα πρόσβασης.' });
    }
    
    // Check if grades table exists, create if not
    try {
      await conn.execute('SELECT 1 FROM grades LIMIT 1');
    } catch (tableErr) {
      console.log('Creating grades table...');
      await conn.execute(`
        CREATE TABLE grades (
          id INT AUTO_INCREMENT PRIMARY KEY,
          thesis_id INT NOT NULL,
          professor_id INT NOT NULL,
          grade DECIMAL(5,2) NOT NULL,
          criteria JSON NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (thesis_id) REFERENCES theses(id) ON DELETE CASCADE,
          FOREIGN KEY (professor_id) REFERENCES professors(id) ON DELETE CASCADE,
          UNIQUE KEY unique_grade (thesis_id, professor_id)
        )
      `);
    }
    
    // Get all grades for this thesis
    console.log('Fetching grades for thesis ID:', thesisId);
    const [gradeRows] = await conn.execute(
      `SELECT g.id, g.grade, g.criteria, g.created_at, p.name, p.surname, g.professor_id
       FROM grades g
       JOIN professors p ON g.professor_id = p.id
       WHERE g.thesis_id = ?
       ORDER BY g.created_at DESC`,
      [thesisId]
    );
    
    console.log('Grades found:', gradeRows.length);
    console.log('Grade rows:', gradeRows);
    
    // Also check what grades exist in the table for debugging
    const [allGrades] = await conn.execute('SELECT * FROM grades');
    console.log('All grades in table:', allGrades);
    
    await conn.end();
    
    // Parse criteria JSON
    const grades = gradeRows.map(row => ({
      ...row,
      criteria: typeof row.criteria === 'string' ? JSON.parse(row.criteria) : row.criteria
    }));
    
    res.json(grades);
  } catch (err) {
    console.error('Grades fetch error:', err);
    await conn.end();
    res.status(500).json({ error: 'Σφάλμα κατά την ανάκτηση βαθμών', details: err.message });
  }
});

// POST: Submit grade for a thesis (committee members only)
app.post('/api/grades/:thesisId', authenticate, async (req, res) => {
  if (req.user.role !== 'Διδάσκων') return res.status(403).json({ error: 'Forbidden' });
  
  const thesisId = req.params.thesisId;
  const { grade, criteria } = req.body;
  const conn = await mysql.createConnection(dbConfig);
  
  try {
    console.log('Grade submission request:', { thesisId, grade, criteria, userId: req.user.id, userRole: req.user.role });
    console.log('Thesis ID type:', typeof thesisId, 'Thesis ID value:', thesisId);
    
    // Validate input
    if (!grade || !criteria) {
      return res.status(400).json({ error: 'Ο βαθμός και τα κριτήρια είναι υποχρεωτικά.' });
    }
    
    if (grade < 0 || grade > 10) {
      return res.status(400).json({ error: 'Ο βαθμός πρέπει να είναι μεταξύ 0 και 10.' });
    }
    
    // Check if professor is committee member or supervisor of this thesis
    const [thesisRows] = await conn.execute(
      `SELECT th.id, th.supervisor_id, cm.professor_id as committee_member_id
       FROM theses th
       LEFT JOIN committee_members cm ON cm.thesis_id = th.id AND cm.professor_id = ?
       WHERE th.id = ?`,
      [req.user.id, thesisId]
    );
    
    console.log('Thesis check result for POST:', thesisRows);
    
    // Check if user is supervisor or committee member
    const isSupervisor = thesisRows.some(row => row.supervisor_id === req.user.id);
    const isCommitteeMember = thesisRows.some(row => row.committee_member_id === req.user.id);
    
    console.log('Access check for POST:', { isSupervisor, isCommitteeMember, thesisId, userId: req.user.id });
    
    if (!isSupervisor && !isCommitteeMember) {
      await conn.end();
      return res.status(403).json({ error: 'Δεν έχετε δικαίωμα πρόσβασης.' });
    }
    
    // Check if grades table exists, create if not
    try {
      await conn.execute('SELECT 1 FROM grades LIMIT 1');
    } catch (tableErr) {
      console.log('Creating grades table...');
      await conn.execute(`
        CREATE TABLE grades (
          id INT AUTO_INCREMENT PRIMARY KEY,
          thesis_id INT NOT NULL,
          professor_id INT NOT NULL,
          grade DECIMAL(5,2) NOT NULL,
          criteria JSON NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (thesis_id) REFERENCES theses(id) ON DELETE CASCADE,
          FOREIGN KEY (professor_id) REFERENCES professors(id) ON DELETE CASCADE,
          UNIQUE KEY unique_grade (thesis_id, professor_id)
        )
      `);
    }
    
    // Check if grade already exists for this professor
    const [existingGrade] = await conn.execute(
      'SELECT id FROM grades WHERE thesis_id = ? AND professor_id = ?',
      [thesisId, req.user.id]
    );
    
    console.log('Existing grade check:', { thesisId, professorId: req.user.id, existingGrade });
    
    if (existingGrade.length) {
      // Update existing grade
      console.log('Updating existing grade');
      await conn.execute(
        'UPDATE grades SET grade = ?, criteria = ?, created_at = NOW() WHERE thesis_id = ? AND professor_id = ?',
        [grade, JSON.stringify(criteria), thesisId, req.user.id]
      );
    } else {
      // Insert new grade
      console.log('Inserting new grade with thesis_id:', thesisId);
      await conn.execute(
        'INSERT INTO grades (thesis_id, professor_id, grade, criteria, created_at) VALUES (?, ?, ?, ?, NOW())',
        [thesisId, req.user.id, grade, JSON.stringify(criteria)]
      );
    }
    
    // Verify the grade was saved
    const [savedGrade] = await conn.execute(
      'SELECT * FROM grades WHERE thesis_id = ? AND professor_id = ?',
      [thesisId, req.user.id]
    );
    console.log('Saved grade verification:', savedGrade);
    
    await conn.end();
    res.json({ success: true });
  } catch (err) {
    console.error('Grade submission error:', err);
    await conn.end();
    res.status(500).json({ error: 'Σφάλμα κατά την αποθήκευση βαθμού', details: err.message });
  }
});

// GET: Generate examination minutes (πρακτικό εξέτασης) in HTML format
app.get('/api/examination-minutes/:thesisId', authenticate, async (req, res) => {
  const thesisId = req.params.thesisId;
  const conn = await mysql.createConnection(dbConfig);
  
  try {
    // Check if user has access to this thesis
    let allowed = false;
    if (req.user.role === 'Φοιτητής') {
      const [rows] = await conn.execute('SELECT id FROM theses WHERE id = ? AND student_id = ?', [thesisId, req.user.id]);
      allowed = rows.length > 0;
    } else if (req.user.role === 'Διδάσκων') {
      const [rows] = await conn.execute(
        `SELECT th.id FROM theses th
         LEFT JOIN committee_members cm ON cm.thesis_id = th.id AND cm.professor_id = ?
         WHERE th.id = ? AND (th.supervisor_id = ? OR cm.professor_id = ?)`,
        [req.user.id, thesisId, req.user.id, req.user.id]
      );
      allowed = rows.length > 0;
    } else if (req.user.role === 'Γραμματεία') {
      allowed = true;
    }
    
    if (!allowed) {
      await conn.end();
      return res.status(403).json({ error: 'Δεν έχετε δικαίωμα πρόσβασης.' });
    }
    
    // Get thesis details
    const [thesisRows] = await conn.execute(
      `SELECT th.id, th.status, th.official_assignment_date, th.final_grade,
              s.name as student_name, s.surname as student_surname, s.student_number,
              t.title as thesis_title,
              p.name as supervisor_name, p.surname as supervisor_surname
       FROM theses th
       JOIN students s ON th.student_id = s.id
       JOIN thesis_topics t ON th.topic_id = t.id
       JOIN professors p ON th.supervisor_id = p.id
       WHERE th.id = ?`,
      [thesisId]
    );
    
    if (!thesisRows.length) {
      await conn.end();
      return res.status(404).json({ error: 'Δεν βρέθηκε η διπλωματική.' });
    }
    
    const thesis = thesisRows[0];
    
    // Get all grades for this thesis
    const [gradeRows] = await conn.execute(
      `SELECT g.grade, g.criteria, g.created_at, p.name, p.surname, p.department
       FROM grades g
       JOIN professors p ON g.professor_id = p.id
       WHERE g.thesis_id = ?
       ORDER BY p.id`,
      [thesisId]
    );
    
    const grades = gradeRows.map(row => ({
      ...row,
      criteria: typeof row.criteria === 'string' ? JSON.parse(row.criteria) : row.criteria
    }));
    
    const totalGrade = grades.reduce((sum, grade) => sum + parseFloat(grade.grade), 0);
    const averageGrade = grades.length > 0 ? (totalGrade / grades.length).toFixed(2) : 0;
    
    const html = `
<!DOCTYPE html>
<html lang="el">
<head>
    <meta charset="UTF-8">
    <title>Πρακτικό Εξέτασης</title>
    <style>
        body { font-family: 'Times New Roman', serif; line-height: 1.6; margin: 40px; color: #333; }
        .container { max-width: 800px; margin: auto; padding: 20px; border: 1px solid #ccc; }
        .header { text-align: center; margin-bottom: 40px; }
        h1, h2 { text-align: center; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f2f2f2; }
        .info-table td:first-child { font-weight: bold; width: 200px; }
        .signatures { margin-top: 60px; }
        .signature { display: inline-block; width: 30%; text-align: center; margin-top: 40px; }
        .signature p { border-top: 1px solid #333; padding-top: 5px; }
        .final-grade { text-align: right; font-size: 1.2em; font-weight: bold; margin-top: 20px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h2>ΕΘΝΙΚΟ ΚΑΙ ΚΑΠΟΔΙΣΤΡΙΑΚΟ ΠΑΝΕΠΙΣΤΗΜΙΟ ΑΘΗΝΩΝ</h2>
            <h3>ΤΜΗΜΑ ΠΛΗΡΟΦΟΡΙΚΗΣ ΚΑΙ ΤΗΛΕΠΙΚΟΙΝΩΝΙΩΝ</h3>
        </div>
        <h1>ΠΡΑΚΤΙΚΟ ΕΞΕΤΑΣΗΣ ΔΙΠΛΩΜΑΤΙΚΗΣ ΕΡΓΑΣΙΑΣ</h1>
        <table class="info-table">
            <tr><td>Ημερομηνία Εξέτασης:</td><td>${new Date().toLocaleDateString('el-GR')}</td></tr>
            <tr><td>Ονοματεπώνυμο Φοιτητή/τριας:</td><td>${thesis.student_name} ${thesis.student_surname}</td></tr>
            <tr><td>Αριθμός Μητρώου:</td><td>${thesis.student_number}</td></tr>
            <tr><td>Τίτλος Διπλωματικής Εργασίας:</td><td>${thesis.thesis_title}</td></tr>
            <tr><td>Επιβλέπων Καθηγητής:</td><td>${thesis.supervisor_name} ${thesis.supervisor_surname}</td></tr>
        </table>
        <h2>ΒΑΘΜΟΛΟΓΙΑ</h2>
        <table>
            <thead>
                <tr>
                    <th>Μέλος Εξεταστικής Επιτροπής</th>
                    <th>Βαθμός (0-10)</th>
                </tr>
            </thead>
            <tbody>
                ${grades.map(g => `
                <tr>
                    <td>${g.name} ${g.surname}</td>
                    <td>${g.grade}</td>
                </tr>
                `).join('')}
            </tbody>
        </table>
        <div class="final-grade">
            Τελικός Βαθμός: ${averageGrade}
        </div>
        <div class="signatures">
            <p>Η Εξεταστική Επιτροπή</p>
            ${grades.map(g => `
            <div class="signature">
                <p>${g.name} ${g.surname}</p>
            </div>
            `).join('')}
        </div>
    </div>
</body>
</html>`;
    
    await conn.end();
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
    
  } catch (err) {
    console.error('Examination minutes error:', err);
    await conn.end();
    res.status(500).json({ error: 'Σφάλμα κατά τη δημιουργία πρακτικού', details: err.message });
  }
});

// POST: Submit library repository link
app.post('/api/library-submission', authenticate, async (req, res) => {
  const { thesisId, repositoryLink } = req.body;
  
  if (req.user.role !== 'Φοιτητής') {
    return res.status(403).json({ error: 'Μόνο οι φοιτητές μπορούν να εκτελέσουν αυτή την ενέργεια.' });
  }
  if (!thesisId || !repositoryLink) {
    return res.status(400).json({ error: 'Λείπουν δεδομένα.' });
  }

  const conn = await mysql.createConnection(dbConfig);
  try {
    const [thesisRows] = await conn.execute(
      'SELECT id FROM theses WHERE id = ? AND student_id = ?',
      [thesisId, req.user.id]
    );

    if (thesisRows.length === 0) {
      await conn.end();
      return res.status(403).json({ error: 'Δεν επιτρέπεται η πρόσβαση.' });
    }

    await conn.execute(
      'INSERT INTO library_submissions (thesis_id, repository_link) VALUES (?, ?) ON DUPLICATE KEY UPDATE repository_link = VALUES(repository_link)',
      [thesisId, repositoryLink]
    );

    await conn.execute(
      'UPDATE theses SET library_repository_link = ? WHERE id = ?',
      [repositoryLink, thesisId]
    );
    
    await conn.end();
    res.status(200).json({ message: 'Ο σύνδεσμος αποθηκεύτηκε.' });
  } catch (err) {
    await conn.end();
    res.status(500).json({ error: 'Σφάλμα διακομιστή.', details: err.message });
  }
});

// GET: Get library submission for a thesis
app.get('/api/library-submission/:thesisId', authenticate, async (req, res) => {
  const { thesisId } = req.params;
  const conn = await mysql.createConnection(dbConfig);
  try {
    const [rows] = await conn.execute(
      'SELECT repository_link, submitted_at FROM library_submissions WHERE thesis_id = ?',
      [thesisId]
    );

    if (rows.length > 0) {
      res.json(rows[0]);
    } else {
      res.json(null);
    }
    await conn.end();
  } catch (err) {
    await conn.end();
    res.status(500).json({ error: 'Σφάλμα διακομιστή.', details: err.message });
  }
});

// GET: Admin/secretariat view of all active and under examination theses
app.get('/api/admin/theses', authenticate, async (req, res) => {
  if (req.user.role !== 'Γραμματεία') return res.status(403).json({ error: 'Forbidden' });
  
  const conn = await mysql.createConnection(dbConfig);
  
  try {
    // Get all theses with status 'ενεργή' or 'υπό εξέταση'
    const [thesisRows] = await conn.execute(
      `SELECT th.id, th.status, th.official_assignment_date, th.created_at, th.supervisor_id,
              s.name as student_name, s.surname as student_surname, s.student_number,
              t.title, t.summary,
              p.name as supervisor_name, p.surname as supervisor_surname
       FROM theses th
       JOIN students s ON th.student_id = s.id
       JOIN thesis_topics t ON th.topic_id = t.id
       JOIN professors p ON th.supervisor_id = p.id
       ORDER BY th.created_at DESC`
    );
    
    console.log('Found theses:', thesisRows.length);
    
    // For each thesis, fetch additional details
    const results = [];
    for (const thesis of thesisRows) {
      let committeeRows = [];
      let draftRows = [];
      let presRows = [];
      let gradeRows = [];
      
      // Get committee members
      try {
        console.log('Fetching committee members for thesis', thesis.id, 'with supervisor_id', thesis.supervisor_id);
        [committeeRows] = await conn.execute(
          `SELECT cm.professor_id, cm.response, cm.response_date, cm.invitation_date,
                  p.name, p.surname,
                  CASE
                    WHEN cm.professor_id = ? THEN 'Επιβλέπων'
                    ELSE 'Μέλος'
                  END as role
           FROM committee_members cm
           JOIN professors p ON cm.professor_id = p.id
           WHERE cm.thesis_id = ?`,
          [thesis.supervisor_id, thesis.id]
        );
        console.log('Committee members for thesis', thesis.id, ':', committeeRows.length);
      } catch (err) {
        console.log('Error fetching committee members for thesis', thesis.id, ':', err.message);
      }
      
      // Get draft submission
      try {
        [draftRows] = await conn.execute(
          'SELECT file_path, external_links, uploaded_at FROM draft_submissions WHERE thesis_id = ? ORDER BY uploaded_at DESC LIMIT 1',
          [thesis.id]
        );
      } catch (err) {
        console.log('Error fetching draft submission for thesis', thesis.id, ':', err.message);
      }
      
      // Get presentation details
      try {
        [presRows] = await conn.execute(
          'SELECT presentation_date, mode, location_or_link, announcement_text FROM presentation_details WHERE thesis_id = ? ORDER BY created_at DESC LIMIT 1',
          [thesis.id]
        );
      } catch (err) {
        console.log('Error fetching presentation details for thesis', thesis.id, ':', err.message);
      }
      
      // Get grades
      try {
        [gradeRows] = await conn.execute(
          `SELECT g.grade, g.criteria, g.created_at, p.name, p.surname
           FROM grades g
           JOIN professors p ON g.professor_id = p.id
           WHERE g.thesis_id = ?
           ORDER BY g.created_at DESC`,
          [thesis.id]
        );
      } catch (err) {
        console.log('Error fetching grades for thesis', thesis.id, ':', err.message);
      }
      
      // Parse criteria JSON for grades
      const grades = gradeRows.map(row => ({
        ...row,
        criteria: typeof row.criteria === 'string' ? JSON.parse(row.criteria) : row.criteria
      }));
      
      results.push({
        ...thesis,
        committee: committeeRows,
        draft_submission: draftRows.length > 0 ? draftRows[0] : null,
        presentation_details: presRows.length > 0 ? presRows[0] : null,
        grades: grades
      });
    }
    
    console.log('Returning', results.length, 'theses');
    await conn.end();
    res.json(results);
  } catch (err) {
    console.error('Admin theses error:', err);
    await conn.end();
    res.status(500).json({ error: 'Σφάλμα κατά την ανάκτηση διπλωματικών', details: err.message });
  }
});

// POST: Import JSON data for students and professors (admin/secretariat only)
app.post('/api/admin/import-data', authenticate, async (req, res) => {
  if (req.user.role !== 'Γραμματεία') {
    return res.status(403).json({ error: 'Μόνο η Γραμματεία μπορεί να εκτελέσει αυτή την ενέργεια.' });
  }

  const { students, professors } = req.body;
  
  if (!students && !professors) {
    return res.status(400).json({ error: 'Δεν παρέχονται δεδομένα για εισαγωγή.' });
  }

  const conn = await mysql.createConnection(dbConfig);
  
  try {
    const results = {
      students: { imported: 0, errors: [] },
      professors: { imported: 0, errors: [] }
    };

    // Import students if provided
    if (students && Array.isArray(students)) {
      for (let i = 0; i < students.length; i++) {
        const student = students[i];
        try {
          // Validate required fields
          if (!student.name || !student.surname || !student.student_number || !student.password) {
            results.students.errors.push(`Γραμμή ${i + 1}: Λείπουν υποχρεωτικά πεδία (name, surname, student_number, password)`);
            continue;
          }

          // Check if student already exists
          const [existing] = await conn.execute(
            'SELECT id FROM students WHERE student_number = ?',
            [student.student_number]
          );

          if (existing.length > 0) {
            // Update existing student
            await conn.execute(
              `UPDATE students SET 
               name = ?, surname = ?, password_hash = ?, 
               email = ?, mobile_telephone = ?, landline_telephone = ?,
               number = ?, city = ?, postcode = ?, street = ?, father_name = ?
               WHERE student_number = ?`,
              [
                student.name,
                student.surname,
                bcrypt.hashSync(student.password, 10),
                student.email || null,
                student.mobile_telephone || null,
                student.landline_telephone || null,
                student.number || null,
                student.city || null,
                student.postcode || null,
                student.street || null,
                student.father_name || null,
                student.student_number
              ]
            );
          } else {
            // Insert new student
            await conn.execute(
              `INSERT INTO students 
               (name, surname, student_number, password_hash, email, mobile_telephone, landline_telephone, number, city, postcode, street, father_name) 
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                student.name,
                student.surname,
                student.student_number,
                bcrypt.hashSync(student.password, 10),
                student.email || null,
                student.mobile_telephone || null,
                student.landline_telephone || null,
                student.number || null,
                student.city || null,
                student.postcode || null,
                student.street || null,
                student.father_name || null
              ]
            );
          }
          results.students.imported++;
        } catch (err) {
          results.students.errors.push(`Γραμμή ${i + 1}: ${err.message}`);
        }
      }
    }

    // Import professors if provided
    if (professors && Array.isArray(professors)) {
      for (let i = 0; i < professors.length; i++) {
        const professor = professors[i];
        try {
          // Validate required fields
          if (!professor.name || !professor.surname || !professor.email || !professor.password) {
            results.professors.errors.push(`Γραμμή ${i + 1}: Λείπουν υποχρεωτικά πεδία (name, surname, email, password)`);
            continue;
          }

          // Check if professor already exists
          const [existing] = await conn.execute(
            'SELECT id FROM professors WHERE email = ?',
            [professor.email]
          );

          if (existing.length > 0) {
            // Update existing professor
            await conn.execute(
              `UPDATE professors SET 
               name = ?, surname = ?, password_hash = ?, 
               department = ?, topic = ?, landline = ?, mobile = ?, university = ?
               WHERE email = ?`,
              [
                professor.name,
                professor.surname,
                bcrypt.hashSync(professor.password, 10),
                professor.department || null,
                professor.topic || null,
                professor.landline || null,
                professor.mobile || null,
                professor.university || null,
                professor.email
              ]
            );
          } else {
            // Insert new professor
            await conn.execute(
              `INSERT INTO professors 
               (name, surname, email, password_hash, department, topic, landline, mobile, university) 
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                professor.name,
                professor.surname,
                professor.email,
                bcrypt.hashSync(professor.password, 10),
                professor.department || null,
                professor.topic || null,
                professor.landline || null,
                professor.mobile || null,
                professor.university || null
              ]
            );
          }
          results.professors.imported++;
        } catch (err) {
          results.professors.errors.push(`Γραμμή ${i + 1}: ${err.message}`);
        }
      }
    }

    await conn.end();
    res.json({
      success: true,
      message: 'Η εισαγωγή ολοκληρώθηκε',
      results
    });
  } catch (err) {
    await conn.end();
    res.status(500).json({ 
      error: 'Σφάλμα κατά την εισαγωγή δεδομένων', 
      details: err.message 
    });
  }
});

// GET: Export current data as JSON template (admin/secretariat only)
app.get('/api/admin/export-template', authenticate, async (req, res) => {
  if (req.user.role !== 'Γραμματεία') {
    return res.status(403).json({ error: 'Μόνο η Γραμματεία μπορεί να εκτελέσει αυτή την ενέργεια.' });
  }

  const template = {
    students: [
      {
        name: "Όνομα Φοιτητή",
        surname: "Επώνυμο Φοιτητή",
        student_number: "ΑΜ123456",
        password: "κωδικός123",
        email: "student@example.com",
        mobile_telephone: "6970123456",
        landline_telephone: "2101234567",
        street: "Οδός Παπαδόπουλου",
        number: "123",
        city: "Αθήνα",
        postcode: "12345",
        father_name: "Όνομα Πατέρα"
      }
    ],
    professors: [
      {
        name: "Όνομα Διδάσκοντα",
        surname: "Επώνυμο Διδάσκοντα",
        email: "professor@example.com",
        password: "κωδικός123",
        department: "Τμήμα Πληροφορικής",
        topic: "Ειδικότητα Διδάσκοντα",
        landline: "2101234567",
        mobile: "6970123456",
        university: "Εθνικό και Καποδιστριακό Πανεπιστήμιο Αθηνών"
      }
    ]
  };

  res.json(template);
});
