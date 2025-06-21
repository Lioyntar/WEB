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
      student_number: rows[0].student_number,
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

// Get all thesis topics (professor view) or student's assigned theses (student view)
app.get("/api/topics", authenticate, async (req, res) => {
  try {
    console.log("[DEBUG] /api/topics called by user:", req.user);
    const conn = await mysql.createConnection(dbConfig);
    
    if (req.user.role === "Φοιτητής") {
      // For students, get their assigned theses (exclude cancelled)
      const [studentTheses] = await conn.execute(`
        SELECT 
          tt.id, 
          tt.title, 
          tt.summary, 
          tt.pdf_file_path AS fileName, 
          p.name AS professor,
          s.student_number AS assignedTo,
          CONCAT(s.name, ' ', s.surname) AS assignedStudentName,
          t.status,
          t.id AS thesis_id
        FROM theses t
        INNER JOIN thesis_topics tt ON t.topic_id = tt.id
        INNER JOIN professors p ON tt.professor_id = p.id
        INNER JOIN students s ON t.student_id = s.id
        WHERE t.student_id = ? AND t.status != 'ακυρωμένη'
        ORDER BY t.created_at DESC
      `, [req.user.id]);
      
      console.log(`[DEBUG] studentTheses for student ${req.user.id}:`, studentTheses.length);
      
      // Get committee members for each thesis
      const thesesWithCommittee = await Promise.all(studentTheses.map(async (thesis) => {
        if (thesis.thesis_id) {
          // Get committee members
          const [committeeRows] = await conn.execute(`
            SELECT 
              cm.professor_id,
              p.name,
              p.surname,
              'Μέλος' as role
            FROM committee_members cm
            JOIN professors p ON cm.professor_id = p.id
            WHERE cm.thesis_id = ?
          `, [thesis.thesis_id]);
          
          // Get supervisor info
          const [supervisorRows] = await conn.execute(`
            SELECT 
              t.supervisor_id as professor_id,
              p.name,
              p.surname,
              'Επιβλέπων' as role
            FROM theses t
            JOIN professors p ON t.supervisor_id = p.id
            WHERE t.id = ?
          `, [thesis.thesis_id]);
          
          // Combine supervisor and committee members, avoiding duplicates
          const supervisor = supervisorRows[0];
          const committeeMembers = committeeRows.filter(cm => cm.professor_id !== supervisor?.professor_id);
          const allMembers = supervisor ? [supervisor, ...committeeMembers] : committeeMembers;
          
          return {
            ...thesis,
            committee: allMembers
          };
        } else {
          return {
            ...thesis,
            committee: []
          };
        }
      }));
      
      await conn.end();
      console.log(`[DEBUG] thesesWithCommittee for student ${req.user.id}:`, thesesWithCommittee.length);
      res.json(thesesWithCommittee);
    } else {
      // For professors, get topics where they are creator, supervisor, or committee member
      // Get topics where professor is the creator
      const [creatorTopics] = await conn.execute(`
        SELECT 
          tt.id, 
          tt.title, 
          tt.summary, 
          tt.pdf_file_path AS fileName, 
          p.name AS professor,
          s.student_number AS assignedTo,
          CONCAT(s.name, ' ', s.surname) AS assignedStudentName,
          t.status,
          t.id AS thesis_id
        FROM thesis_topics tt
        INNER JOIN professors p ON tt.professor_id = p.id
        LEFT JOIN theses t ON t.topic_id = tt.id
        LEFT JOIN students s ON t.student_id = s.id
        WHERE tt.professor_id = ?
      `, [req.user.id]);
      console.log(`[DEBUG] creatorTopics for user ${req.user.id}:`, creatorTopics.length);
      
      // Get topics where professor is the supervisor
      const [supervisorTopics] = await conn.execute(`
        SELECT 
          tt.id, 
          tt.title, 
          tt.summary, 
          tt.pdf_file_path AS fileName, 
          p.name AS professor,
          s.student_number AS assignedTo,
          CONCAT(s.name, ' ', s.surname) AS assignedStudentName,
          t.status,
          t.id AS thesis_id
        FROM thesis_topics tt
        INNER JOIN professors p ON tt.professor_id = p.id
        INNER JOIN theses t ON t.topic_id = tt.id
        LEFT JOIN students s ON t.student_id = s.id
        WHERE t.supervisor_id = ? AND tt.professor_id != ?
      `, [req.user.id, req.user.id]);
      console.log(`[DEBUG] supervisorTopics for user ${req.user.id}:`, supervisorTopics.length);
      
      // Get topics where professor is a committee member
      const [committeeTopics] = await conn.execute(`
        SELECT 
          tt.id, 
          tt.title, 
          tt.summary, 
          tt.pdf_file_path AS fileName, 
          p.name AS professor,
          s.student_number AS assignedTo,
          CONCAT(s.name, ' ', s.surname) AS assignedStudentName,
          t.status,
          t.id AS thesis_id
        FROM thesis_topics tt
        INNER JOIN professors p ON tt.professor_id = p.id
        INNER JOIN theses t ON t.topic_id = tt.id
        LEFT JOIN students s ON t.student_id = s.id
        INNER JOIN committee_members cm ON t.id = cm.thesis_id
        WHERE cm.professor_id = ? AND tt.professor_id != ? AND t.supervisor_id != ?
      `, [req.user.id, req.user.id, req.user.id]);
      console.log(`[DEBUG] committeeTopics for user ${req.user.id}:`, committeeTopics.length);
      
      // Combine all topics and remove duplicates
      const allTopics = [...creatorTopics, ...supervisorTopics, ...committeeTopics];
      const uniqueTopics = allTopics.filter((topic, index, self) => 
        index === self.findIndex(t => t.id === topic.id)
      );
      console.log(`[DEBUG] uniqueTopics for user ${req.user.id}:`, uniqueTopics.length);
      
      // Then get committee members for each thesis
      const topicsWithCommittee = await Promise.all(uniqueTopics.map(async (topic) => {
        if (topic.thesis_id) {
          // Get committee members
          const [committeeRows] = await conn.execute(`
            SELECT 
              cm.professor_id,
              p.name,
              p.surname,
              'Μέλος' as role
            FROM committee_members cm
            JOIN professors p ON cm.professor_id = p.id
            WHERE cm.thesis_id = ?
          `, [topic.thesis_id]);
          
          console.log(`[DEBUG] Committee members for thesis ${topic.thesis_id}:`, committeeRows);
          
          // Get supervisor info
          const [supervisorRows] = await conn.execute(`
            SELECT 
              t.supervisor_id as professor_id,
              p.name,
              p.surname,
              'Επιβλέπων' as role
            FROM theses t
            JOIN professors p ON t.supervisor_id = p.id
            WHERE t.id = ?
          `, [topic.thesis_id]);
          
          console.log(`[DEBUG] Supervisor for thesis ${topic.thesis_id}:`, supervisorRows);
          
          // Combine supervisor and committee members, avoiding duplicates
          const supervisor = supervisorRows[0];
          const committeeMembers = committeeRows.filter(cm => cm.professor_id !== supervisor?.professor_id);
          const allMembers = supervisor ? [supervisor, ...committeeMembers] : committeeMembers;
          
          console.log(`[DEBUG] All members for thesis ${topic.thesis_id}:`, allMembers);
          
          return {
            ...topic,
            committee: allMembers
          };
        } else {
          return {
            ...topic,
            committee: []
          };
        }
      }));
      
      await conn.end();
      console.log(`[DEBUG] topicsWithCommittee for user ${req.user.id}:`, topicsWithCommittee.length);
      res.json(topicsWithCommittee);
    }
  } catch (err) {
    console.error("Error fetching topics:", err);
    res.status(500).json({ error: "Σφάλμα ανάκτησης θεμάτων." });
  }
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
  
  try {
    // Check if student already has an active thesis (not cancelled)
    const [existingTheses] = await conn.execute(
      "SELECT id, status FROM theses WHERE student_id = ? AND status != 'ακυρωμένη'",
      [studentId]
    );
    
    if (existingTheses.length > 0) {
      await conn.end();
      return res.status(400).json({ 
        error: "Ο φοιτητής έχει ήδη μια ενεργή διπλωματική εργασία. Δεν μπορεί να λάβει νέα ανάθεση." 
      });
    }
    
    // Insert assignment into theses table with status 'υπό ανάθεση'
    await conn.execute(
      "INSERT INTO theses (student_id, topic_id, supervisor_id, status, created_at) VALUES (?, ?, ?, 'υπό ανάθεση', NOW())",
      [studentId, id, req.user.id]
    );
    
    await conn.end();
    // Return success
    res.json({ success: true });
  } catch (err) {
    await conn.end();
    console.error("Error assigning topic:", err);
    res.status(500).json({ error: "Σφάλμα κατά την ανάθεση του θέματος.", details: err.message });
  }
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
       WHERE th.topic_id = ? AND th.student_id = ? AND th.status != 'ακυρωμένη'
       ORDER BY th.created_at DESC LIMIT 1`,
      [topicId, req.user.id]
    );
    if (thesisRows.length > 0) {
      thesis = thesisRows[0];
      debug.thesis_id = thesis.id; // Add thesis_id to debug info
    } else {
      // Debug: log if not found
      console.log("No active thesis found for student_id", req.user.id, "and topic_id", topicId);
    }
  } else {
    // Για άλλους ρόλους, φέρε απλά την πρώτη ενεργή διπλωματική με αυτό το θέμα
    const [thesisRows] = await conn.execute(
      `SELECT th.id, th.status, th.official_assignment_date, th.supervisor_id
       FROM theses th
       WHERE th.topic_id = ? AND th.status != 'ακυρωμένη'
       ORDER BY th.created_at DESC LIMIT 1`,
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

// Επιστροφή προσκλήσεων για διπλωματική (και αποδεκτών μελών) - για φοιτητές με topicId
app.get("/api/thesis-invitations-by-topic/:topicId", authenticate, async (req, res) => {
  if (req.user.role !== "Φοιτητής") return res.status(403).json({ error: "Forbidden" });
  
  const topicId = req.params.topicId;
  const conn = await mysql.createConnection(dbConfig);

  // Βρες τη διπλωματική του φοιτητή για αυτό το θέμα
  const [thesisRows] = await conn.execute(
    "SELECT id FROM theses WHERE topic_id = ? AND student_id = ? AND status != 'ακυρωμένη' ORDER BY created_at DESC LIMIT 1",
    [topicId, req.user.id]
  );

  if (!thesisRows.length) {
    await conn.end();
    return res.status(404).json({ error: "Δεν βρέθηκε ενεργή διπλωματική που να σας ανήκει." });
  }

  const thesisId = thesisRows[0].id;

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

// Αποστολή πρόσκλησης σε διδάσκοντα - για φοιτητές με topicId
app.post("/api/thesis-invitations-by-topic/:topicId/invite", authenticate, async (req, res) => {
  if (req.user.role !== "Φοιτητής") return res.status(403).json({ error: "Forbidden" });
  
  const topicId = req.params.topicId;
  const { professorId } = req.body;
  if (!professorId) return res.status(400).json({ error: "Missing professorId" });
  const conn = await mysql.createConnection(dbConfig);

  try {
    // Βρες τη διπλωματική του φοιτητή για αυτό το θέμα (exclude cancelled)
    const [thesisRows] = await conn.execute(
      "SELECT id FROM theses WHERE topic_id = ? AND student_id = ? AND status != 'ακυρωμένη' ORDER BY created_at DESC LIMIT 1",
      [topicId, req.user.id]
    );
    
    if (thesisRows.length === 0) {
      await conn.end();
      return res.status(404).json({ error: "Δεν βρέθηκε ενεργή διπλωματική που να σας ανήκει." });
    }
    
    const thesisId = thesisRows[0].id;

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
      [thesisId]
    );
    if (accepted[0].cnt >= 2) {
      await conn.end();
      return res.status(400).json({ error: "Έχουν ήδη αποδεχθεί 2 μέλη." });
    }

    // Μην επιτρέπεις διπλή πρόσκληση στον ίδιο
    const [exists] = await conn.execute(
      "SELECT id FROM invitations WHERE thesis_id = ? AND invited_professor_id = ?",
      [thesisId, professorId]
    );
    if (exists.length > 0) {
      await conn.end();
      return res.status(400).json({ error: "Έχει ήδη σταλεί πρόσκληση σε αυτόν τον διδάσκοντα." });
    }

    // Εισαγωγή πρόσκλησης με status = 'Αναμένεται' by default
    await conn.execute(
      `INSERT INTO invitations (thesis_id, invited_professor_id, invited_by_student_id, status, invitation_date)
       VALUES (?, ?, ?, 'Αναμένεται', NOW())`,
      [thesisId, professorId, req.user.id]
    );

    await conn.end();
    res.json({ success: true });
  } catch (err) {
    await conn.end();
    res.status(500).json({ error: "Σφάλμα βάσης κατά την αποστολή πρόσκλησης.", details: err.message });
  }
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
        "SELECT id FROM theses WHERE topic_id = ? AND student_id = ? AND status != 'ακυρωμένη' ORDER BY created_at DESC LIMIT 1",
        [thesisId, req.user.id]
      );
      if (rows.length === 0) {
        await conn.end();
        return res.status(404).json({ error: "Δεν βρέθηκε ενεργή διπλωματική που να σας ανήκει." });
      }
      thesisRow = rows[0];
    } else {
      // Για άλλους ρόλους (π.χ. admin), απλά έλεγξε αν υπάρχει η διπλωματική με id = thesisId
      const [rows] = await conn.execute(
        "SELECT id FROM theses WHERE id = ? AND status != 'ακυρωμένη'",
        [thesisId]
      );
      if (rows.length === 0) {
        await conn.end();
        return res.status(404).json({ error: "Η διπλωματική δεν βρέθηκε ή είναι ακυρωμένη." });
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
      'SELECT id FROM theses WHERE id = ? AND student_id = ? AND status != "ακυρωμένη"',
      [thesisId, req.user.id]
    );
    if (!thesisRows.length) {
      // Ίσως το thesisId είναι topicId, βρες το thesisId με βάση το topicId και τον φοιτητή
      const [byTopic] = await conn.execute(
        'SELECT id FROM theses WHERE topic_id = ? AND student_id = ? AND status != "ακυρωμένη" ORDER BY created_at DESC LIMIT 1',
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
      const [rows] = await conn.execute('SELECT id FROM theses WHERE id = ? AND student_id = ? AND status != "ακυρωμένη"', [thesisId, req.user.id]);
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
      const [rows] = await conn.execute('SELECT id FROM theses WHERE id = ? AND student_id = ? AND status != "ακυρωμένη"', [thesisId, req.user.id]);
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
      'SELECT id FROM theses WHERE id = ? AND student_id = ? AND status != "ακυρωμένη"',
      [actualThesisId, req.user.id]
    );
    if (!thesisRows.length) {
      // Maybe thesisId is topicId, find thesisId based on topicId and student
      const [byTopic] = await conn.execute(
        'SELECT id FROM theses WHERE topic_id = ? AND student_id = ? AND status != "ακυρωμένη" ORDER BY created_at DESC LIMIT 1',
        [actualThesisId, req.user.id]
      );
      if (byTopic.length) {
        actualThesisId = byTopic[0].id;
        console.log('Found thesis by topic_id:', actualThesisId);
      } else {
        await conn.end();
        return res.status(404).json({ error: 'Δεν βρέθηκε ενεργή διπλωματική που να σας ανήκει.' });
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
    
    // NEW: Check if supervisor has graded first (only for committee members)
    if (isCommitteeMember && !isSupervisor) {
      const [supervisorGrade] = await conn.execute(
        'SELECT id FROM grades WHERE thesis_id = ? AND professor_id = ?',
        [thesisId, thesisRows[0].supervisor_id]
      );
      
      if (supervisorGrade.length === 0) {
        await conn.end();
        return res.status(400).json({ error: 'Πρέπει πρώτα να βαθμολογήσει ο επιβλέπων καθηγητής πριν μπορέσετε να βαθμολογήσετε.' });
      }
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
      `SELECT 
         th.id, th.status, th.official_assignment_date, th.final_grade, th.gs_number,
         th.supervisor_id,
         s.name as student_name, s.surname as student_surname, s.student_number,
         t.title as thesis_title,
         p.name as supervisor_name, p.surname as supervisor_surname,
         pd.presentation_date, pd.location_or_link
       FROM theses th
       LEFT JOIN students s ON th.student_id = s.id
       LEFT JOIN thesis_topics t ON th.topic_id = t.id
       LEFT JOIN professors p ON th.supervisor_id = p.id
       LEFT JOIN presentation_details pd ON th.id = pd.thesis_id
       WHERE th.id = ?`,
      [thesisId]
    );
    
    if (!thesisRows.length) {
      await conn.end();
      return res.status(404).json({ error: 'Δεν βρέθηκε η διπλωματική.' });
    }
    
    const thesis = thesisRows[0];
    
    // Get all grades and committee members
    const [gradeRows] = await conn.execute(
      `SELECT 
         g.grade,
         p.id as professor_id, p.name, p.surname,
         (CASE WHEN p.id = ? THEN 'Επιβλέπων' ELSE 'Μέλος' END) as role
       FROM grades g
       JOIN professors p ON g.professor_id = p.id
       WHERE g.thesis_id = ?
       ORDER BY role ASC, p.id`,
      [thesis.supervisor_id, thesisId]
    );
    
    const committee = gradeRows;
    const supervisor = committee.find(c => c.role === 'Επιβλέπων') || { name: thesis.supervisor_name, surname: thesis.supervisor_surname };
    const presentationDate = new Date(thesis.presentation_date);
    
    const html = `
<!DOCTYPE html>
<html lang="el">
<head>
    <meta charset="UTF-8">
    <title>Πρακτικό Εξέτασης Δ.Ε.</title>
    <style>
        body { font-family: 'Times New Roman', serif; line-height: 1.6; margin: 40px; color: #333; }
        .container { max-width: 800px; margin: auto; padding: 20px; border: 1px solid #ccc; }
        .header, .title { text-align: center; font-weight: bold; }
        h1, h2, h3 { text-align: center; margin: 5px 0; }
        p { margin: 10px 0; }
        .dotted { border-bottom: 1px dotted #333; }
        .signature-list { padding-left: 20px; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th, td { border: 1px solid #000; padding: 8px; text-align: left; }
        th { background-color: #f2f2f2; font-weight: bold; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <p>ΠΑΡΑΡΤΗΜΑ 1 (υπόδειγμα πρακτικού εξέτασης Δ.Ε.)</p>
            <h3>ΠΡΟΓΡΑΜΜΑ ΣΠΟΥΔΩΝ</h3>
            <h3>"ΤΜΗΜΑΤΟΣ ΜΗΧΑΝΙΚΩΝ, ΗΛΕΚΤΡΟΝΙΚΩΝ ΥΠΟΛΟΓΙΣΤΩΝ ΚΑΙ ΠΛΗΡΟΦΟΡΙΚΗΣ"</h3>
        </div>
        
        <div class="title">
            <h2>ΠΡΑΚΤΙΚΟ ΣΥΝΕΔΡΙΑΣΗΣ</h2>
            <h2>ΤΗΣ ΤΡΙΜΕΛΟΥΣ ΕΠΙΤΡΟΠΗΣ</h2>
            <h2>ΓΙΑ ΤΗΝ ΠΑΡΟΥΣΙΑΣΗ ΚΑΙ ΚΡΙΣΗ ΤΗΣ ΔΙΠΛΩΜΑΤΙΚΗΣ ΕΡΓΑΣΙΑΣ</h2>
        </div>
        
        <p>του/της φοιτητή/φοτήτρια κ. <span class="dotted">${thesis.student_name} ${thesis.student_surname}</span></p>

        <p>Η συνεδρίαση πραγματοποιήθηκε στην αίθουσα <span class="dotted">${thesis.location_or_link || '................'}</span>, στις <span class="dotted">${presentationDate.toLocaleDateString('el-GR') || '................'}</span>, ημέρα <span class="dotted">${presentationDate.toLocaleDateString('el-GR', { weekday: 'long' }) || '................'}</span> και ώρα <span class="dotted">${presentationDate.toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit' }) || '................'}</span>.</p>
        
        <p>Στην συνεδρίαση είναι παρόντα τα μέλη της Τριμελούς Επιτροπής, κ.κ.:</p>
        <ol class="signature-list">
            ${committee.map(m => `<li>${m.name} ${m.surname}</li>`).join('')}
        </ol>
        
        <p>οι οποίοι ορίσθηκαν από την Συνέλευση του ΤΜΗΥΠ, στην συνεδρίαση της με αριθμό <span class="dotted">${thesis.gs_number || '................'}</span>.</p>
        
        <p>Ο/Η φοιτητής/φοιτήτρια κ. <span class="dotted">${thesis.student_name} ${thesis.student_surname}</span> ανέπτυξε το θέμα της Διπλωματικής του/της Εργασίας, με τίτλο "<span class="dotted">${thesis.thesis_title}</span>".</p>
        
        <p>Στην συνέχεια υποβλήθηκαν ερωτήσεις στον υποψήφιο από τα μέλη της Τριμελούς Επιτροπής και τους άλλους παρευρισκόμενους, προκειμένου να διαμορφώσουν σαφή άποψη για το περιεχόμενο της εργασίας, για την επιστημονική συγκρότηση του μεταπτυχιακού φοιτητή.</p>
        
        <p>Μετά το τέλος της ανάπτυξης της εργασίας του και των ερωτήσεων, ο υποψήφιος αποχωρεί.</p>
        
        <p>Ο Επιβλέπων καθηγητής κ. <span class="dotted">${supervisor.name} ${supervisor.surname}</span>, προτείνει στα μέλη της Τριμελούς Επιτροπής, να ψηφίσουν για το αν εγκρίνεται η διπλωματική εργασία του <span class="dotted">${thesis.student_name} ${thesis.student_surname}</span>.</p>
        
        <p>Τα μέλη της Τριμελούς Επιτροπής, ψηφίζουν κατ' αλφαβητική σειρά:</p>
        <ol class="signature-list">
           ${committee.map(m => `<li>${m.name} ${m.surname}</li>`).join('')}
        </ol>
        
        <p>υπέρ της εγκρίσεως της Διπλωματικής Εργασίας του φοιτητή <span class="dotted">${thesis.student_name} ${thesis.student_surname}</span>, επειδή θεωρούν επιστημονικά επαρκή και το περιεχόμενό της ανταποκρίνεται στο θέμα που του δόθηκε.</p>
        
        <p>Μετά της έγκριση, ο εισηγητής κ. <span class="dotted">${supervisor.name} ${supervisor.surname}</span>, προτείνει στα μέλη της Τριμελούς Επιτροπής, να απονεμηθεί στο/στη φοιτητή/τρια κ. <span class="dotted">${thesis.student_name} ${thesis.student_surname}</span> ο βαθμός <span class="dotted">${thesis.final_grade}</span>.</p>

        <p>Τα μέλη της Τριμελούς Επιτροπής, απονέμουν την παρακάτω βαθμολογία:</p>
        <table>
            <thead>
                <tr>
                    <th>ΟΝΟΜΑΤΕΠΩΝΥΜΟ</th>
                    <th>ΙΔΙΟΤΗΤΑ</th>
                    <th>ΒΑΘΜΟΣ</th>
                </tr>
            </thead>
            <tbody>
                ${committee.map(m => `
                <tr>
                    <td>${m.name} ${m.surname}</td>
                    <td>${m.role}</td>
                    <td>${m.grade}</td>
                </tr>
                `).join('')}
            </tbody>
        </table>

        <p>Μετά την έγκριση και την απονομή του βαθμού <span class="dotted">${thesis.final_grade}</span>, η Τριμελής Επιτροπή, προτείνει να προχωρήσει στην διαδικασία για να ανακηρύξει τον κ. <span class="dotted">${thesis.student_name} ${thesis.student_surname}</span>, σε διπλωματούχο του Προγράμματος Σπουδών του «ΤΜΗΜΑΤΟΣ ΜΗΧΑΝΙΚΩΝ, ΗΛΕΚΤΡΟΝΙΚΩΝ ΥΠΟΛΟΓΙΣΤΩΝ ΚΑΙ ΠΛΗΡΟΦΟΡΙΚΗΣ ΠΑΝΕΠΙΣΤΗΜΙΟΥ ΠΑΤΡΩΝ» και να του απονέμει το Δίπλωμα Μηχανικού Η/Υ το οποίο αναγνωρίζεται ως Ενιαίος Τίτλος Σπουδών Μεταπτυχιακού Επιπέδου.</p>
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
    // Get only theses with status 'ενεργή' or 'υπό εξέταση'
    const [thesisRows] = await conn.execute(
      `SELECT th.id, th.status, th.official_assignment_date, th.created_at, th.supervisor_id,
              s.name as student_name, s.surname as student_surname, s.student_number,
              t.title, t.summary,
              p.name as supervisor_name, p.surname as supervisor_surname
       FROM theses th
       JOIN students s ON th.student_id = s.id
       JOIN thesis_topics t ON th.topic_id = t.id
       JOIN professors p ON th.supervisor_id = p.id
       WHERE th.status IN ('ενεργή', 'υπό εξέταση')
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

// POST: Secretariat sets thesis as active with GS number
app.post('/api/admin/theses/:thesisId/set-active', authenticate, async (req, res) => {
  if (req.user.role !== 'Γραμματεία') {
    return res.status(403).json({ error: 'Μόνο η Γραμματεία μπορεί να εκτελέσει αυτή την ενέργεια.' });
  }

  const { thesisId } = req.params;
  const { gsNumber, gsYear } = req.body;

  if (!gsNumber || !gsYear) {
    return res.status(400).json({ error: 'Απαιτούνται αριθμός και έτος ΓΣ.' });
  }

  try {
    const conn = await mysql.createConnection(dbConfig);
    
    // Check if thesis exists and is in "υπό ανάθεση" status
    const [theses] = await conn.execute(
      'SELECT * FROM theses WHERE id = ? AND status = "υπό ανάθεση"',
      [thesisId]
    );

    if (theses.length === 0) {
      await conn.end();
      return res.status(404).json({ error: 'Η διπλωματική δεν βρέθηκε ή δεν είναι υπό ανάθεση.' });
    }

    // Update thesis status to active and add GS info
    await conn.execute(
      `UPDATE theses SET 
       status = 'ενεργή', 
       gs_number = ?, 
       gs_year = ?,
       official_assignment_date = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [gsNumber, gsYear, thesisId]
    );

    await conn.end();
    res.json({ success: true, message: 'Η διπλωματική έγινε ενεργή.' });
  } catch (err) {
    res.status(500).json({ error: 'Σφάλμα κατά την ενεργοποίηση της διπλωματικής', details: err.message });
  }
});

// POST: Secretariat cancels thesis
app.post('/api/admin/theses/:thesisId/cancel', authenticate, async (req, res) => {
  if (req.user.role !== 'Γραμματεία') {
    return res.status(403).json({ error: 'Μόνο η Γραμματεία μπορεί να εκτελέσει αυτή την ενέργεια.' });
  }

  const { thesisId } = req.params;
  const { gsNumber, gsYear, reason } = req.body;

  if (!gsNumber || !gsYear || !reason) {
    return res.status(400).json({ error: 'Απαιτούνται αριθμός, έτος ΓΣ και λόγος ακύρωσης.' });
  }

  try {
    const conn = await mysql.createConnection(dbConfig);
    
    // Check if thesis exists and is in "ενεργή" status
    const [theses] = await conn.execute(
      'SELECT * FROM theses WHERE id = ? AND status = "ενεργή"',
      [thesisId]
    );

    if (theses.length === 0) {
      await conn.end();
      return res.status(404).json({ error: 'Η διπλωματική δεν βρέθηκε ή δεν είναι σε ενεργή κατάσταση.' });
    }

    // Update thesis status to cancelled
    await conn.execute(
      `UPDATE theses SET 
       status = 'ακυρωμένη', 
       cancellation_reason = ?
       WHERE id = ?`,
      [reason, thesisId]
    );

    // Add cancellation record
    await conn.execute(
      `INSERT INTO cancellations 
       (thesis_id, cancelled_by, reason, gs_number, gs_year) 
       VALUES (?, 'secretariat', ?, ?, ?)`,
      [thesisId, reason, gsNumber, gsYear]
    );

    await conn.end();
    res.json({ success: true, message: 'Η διπλωματική ακυρώθηκε.' });
  } catch (err) {
    res.status(500).json({ error: 'Σφάλμα κατά την ακύρωση της διπλωματικής', details: err.message });
  }
});

// GET: Get thesis details with GS info for Secretariat
app.get('/api/admin/theses/:thesisId/details', authenticate, async (req, res) => {
  if (req.user.role !== 'Γραμματεία') {
    return res.status(403).json({ error: 'Μόνο η Γραμματεία μπορεί να εκτελέσει αυτή την ενέργεια.' });
  }

  const { thesisId } = req.params;

  try {
    const conn = await mysql.createConnection(dbConfig);
    
    const [theses] = await conn.execute(
      `SELECT t.*, 
              tt.title, tt.summary,
              s.name as student_name, s.surname as student_surname, s.student_number,
              p.name as supervisor_name, p.surname as supervisor_surname,
              t.gs_number, t.gs_year, t.cancellation_reason
       FROM theses t
       LEFT JOIN thesis_topics tt ON t.topic_id = tt.id
       LEFT JOIN students s ON t.student_id = s.id
       LEFT JOIN professors p ON t.supervisor_id = p.id
       WHERE t.id = ?`,
      [thesisId]
    );

    if (theses.length === 0) {
      await conn.end();
      return res.status(404).json({ error: 'Η διπλωματική δεν βρέθηκε.' });
    }

    const thesis = theses[0];

    // Get cancellation history
    const [cancellations] = await conn.execute(
      'SELECT * FROM cancellations WHERE thesis_id = ? ORDER BY cancelled_at DESC',
      [thesisId]
    );

    thesis.cancellations = cancellations;

    await conn.end();
    res.json(thesis);
  } catch (err) {
    res.status(500).json({ error: 'Σφάλμα κατά την ανάκτηση λεπτομερειών', details: err.message });
  }
});

// POST: Secretariat updates GS info for an active thesis
app.post('/api/admin/theses/:thesisId/update-gs', authenticate, async (req, res) => {
  if (req.user.role !== 'Γραμματεία') {
    return res.status(403).json({ error: 'Μόνο η Γραμματεία μπορεί να εκτελέσει αυτή την ενέργεια.' });
  }

  const { thesisId } = req.params;
  const { gsNumber, gsYear } = req.body;

  if (!gsNumber || !gsYear) {
    return res.status(400).json({ error: 'Απαιτούνται αριθμός και έτος ΓΣ.' });
  }

  try {
    const conn = await mysql.createConnection(dbConfig);
    
    // Check if thesis exists and is in "ενεργή" status
    const [theses] = await conn.execute(
      'SELECT * FROM theses WHERE id = ? AND status = "ενεργή"',
      [thesisId]
    );

    if (theses.length === 0) {
      await conn.end();
      return res.status(404).json({ error: 'Η διπλωματική δεν βρέθηκε ή δεν είναι ενεργή.' });
    }

    // Update thesis with new GS info
    await conn.execute(
      `UPDATE theses SET 
       gs_number = ?, 
       gs_year = ?
       WHERE id = ?`,
      [gsNumber, gsYear, thesisId]
    );

    await conn.end();
    res.json({ success: true, message: 'Τα στοιχεία ΓΣ ενημερώθηκαν επιτυχώς.' });
  } catch (err) {
    res.status(500).json({ error: 'Σφάλμα κατά την ενημέρωση των στοιχείων ΓΣ', details: err.message });
  }
});

// POST: Set a thesis as 'completed' (secretariat only)
app.post('/api/admin/theses/:thesisId/set-completed', authenticate, async (req, res) => {
  if (req.user.role !== 'Γραμματεία') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { thesisId } = req.params;
  const conn = await mysql.createConnection(dbConfig);

  try {
    await conn.beginTransaction();

    // 1. Check thesis status and if link exists
    const [thesisRows] = await conn.execute(
      'SELECT status, library_repository_link FROM theses WHERE id = ?',
      [thesisId]
    );

    if (thesisRows.length === 0) {
      await conn.rollback();
      await conn.end();
      return res.status(404).json({ error: 'Η διπλωματική εργασία δεν βρέθηκε.' });
    }

    const thesis = thesisRows[0];
    if ((thesis.status || '').toLowerCase() !== 'υπό εξέταση') {
      await conn.rollback();
      await conn.end();
      return res.status(400).json({ error: `Η διπλωματική εργασία δεν είναι σε κατάσταση "Υπό Εξέταση".` });
    }
    
    // 2. Check for library submission link
    if (!thesis.library_repository_link) {
      await conn.rollback();
      await conn.end();
      return res.status(400).json({ error: 'Δεν έχει καταχωρηθεί ο σύνδεσμος προς το Νημερτή από το φοιτητή/τρια.' });
    }

    // 3. Check for at least one grade
    const [gradeRows] = await conn.execute(
      'SELECT grade FROM grades WHERE thesis_id = ?',
      [thesisId]
    );

    if (gradeRows.length === 0) {
      await conn.rollback();
      await conn.end();
      return res.status(400).json({ error: 'Δεν έχει καταχωρηθεί βαθμός για αυτήν τη διπλωματική.' });
    }
    
    // 4. Calculate final grade
    const totalGrade = gradeRows.reduce((sum, grade) => sum + parseFloat(grade.grade), 0);
    const finalGrade = (totalGrade / gradeRows.length).toFixed(2);


    // 5. If all checks pass, update status and final_grade
    await conn.execute(
      'UPDATE theses SET status = "περατωμένη", final_grade = ? WHERE id = ?',
      [finalGrade, thesisId]
    );

    await conn.commit();
    await conn.end();

    res.json({ success: true, message: 'Η κατάσταση της διπλωματικής άλλαξε σε "Περατωμένη".' });

  } catch (err) {
    await conn.rollback();
    await conn.end();
    console.error('Set-completed error:', err);
    res.status(500).json({ error: 'Σφάλμα διακομιστή κατά την αλλαγή κατάστασης.', details: err.message });
  }
});

// Helper to hash passwords (for development/setup purposes)
const plainPasswords = {
  // ... (add username: password pairs here)
};

// GET: Teacher statistics (professors only)
app.get('/api/teacher/statistics', authenticate, async (req, res) => {
  if (req.user.role !== 'Διδάσκων') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const conn = await mysql.createConnection(dbConfig);

  try {
    const professorId = req.user.id;
    
    // Get supervised theses (completed)
    const [supervisedRows] = await conn.execute(`
      SELECT 
        t.id,
        t.official_assignment_date,
        t.final_grade,
        t.status
      FROM theses t
      WHERE t.supervisor_id = ? AND t.status = 'περατωμένη'
    `, [professorId]);

    // Get committee member theses (completed)
    const [committeeRows] = await conn.execute(`
      SELECT 
        t.id,
        t.official_assignment_date,
        t.final_grade,
        t.status
      FROM theses t
      JOIN committee_members cm ON t.id = cm.thesis_id
      WHERE cm.professor_id = ? AND t.status = 'περατωμένη'
    `, [professorId]);

    // Calculate supervised statistics
    let supervisedStats = {
      count: supervisedRows.length,
      avgCompletionTime: 0,
      avgGrade: 0
    };

    if (supervisedRows.length > 0) {
      // Calculate average completion time (in months)
      const completionTimes = supervisedRows
        .filter(t => t.official_assignment_date)
        .map(t => {
          const assignmentDate = new Date(t.official_assignment_date);
          const completionDate = new Date(); // Assuming completion is now
          const diffTime = Math.abs(completionDate - assignmentDate);
          const diffMonths = Math.ceil(diffTime / (1000 * 60 * 60 * 24 * 30));
          return diffMonths;
        });

      if (completionTimes.length > 0) {
        supervisedStats.avgCompletionTime = (completionTimes.reduce((a, b) => a + b, 0) / completionTimes.length).toFixed(1);
      }

      // Calculate average grade
      const grades = supervisedRows
        .filter(t => t.final_grade)
        .map(t => parseFloat(t.final_grade));

      if (grades.length > 0) {
        supervisedStats.avgGrade = (grades.reduce((a, b) => a + b, 0) / grades.length).toFixed(2);
      }
    }

    // Calculate committee statistics
    let committeeStats = {
      count: committeeRows.length,
      avgCompletionTime: 0,
      avgGrade: 0
    };

    if (committeeRows.length > 0) {
      // Calculate average completion time (in months)
      const completionTimes = committeeRows
        .filter(t => t.official_assignment_date)
        .map(t => {
          const assignmentDate = new Date(t.official_assignment_date);
          const completionDate = new Date(); // Assuming completion is now
          const diffTime = Math.abs(completionDate - assignmentDate);
          const diffMonths = Math.ceil(diffTime / (1000 * 60 * 60 * 24 * 30));
          return diffMonths;
        });

      if (completionTimes.length > 0) {
        committeeStats.avgCompletionTime = (completionTimes.reduce((a, b) => a + b, 0) / completionTimes.length).toFixed(1);
      }

      // Calculate average grade
      const grades = committeeRows
        .filter(t => t.final_grade)
        .map(t => parseFloat(t.final_grade));

      if (grades.length > 0) {
        committeeStats.avgGrade = (grades.reduce((a, b) => a + b, 0) / grades.length).toFixed(2);
      }
    }

    // Combined statistics
    const combinedStats = {
      count: supervisedStats.count + committeeStats.count,
      avgCompletionTime: 0,
      avgGrade: 0
    };

    if (combinedStats.count > 0) {
      const allCompletionTimes = [...supervisedRows, ...committeeRows]
        .filter(t => t.official_assignment_date)
        .map(t => {
          const assignmentDate = new Date(t.official_assignment_date);
          const completionDate = new Date();
          const diffTime = Math.abs(completionDate - assignmentDate);
          const diffMonths = Math.ceil(diffTime / (1000 * 60 * 60 * 24 * 30));
          return diffMonths;
        });

      if (allCompletionTimes.length > 0) {
        combinedStats.avgCompletionTime = (allCompletionTimes.reduce((a, b) => a + b, 0) / allCompletionTimes.length).toFixed(1);
      }

      const allGrades = [...supervisedRows, ...committeeRows]
        .filter(t => t.final_grade)
        .map(t => parseFloat(t.final_grade));

      if (allGrades.length > 0) {
        combinedStats.avgGrade = (allGrades.reduce((a, b) => a + b, 0) / allGrades.length).toFixed(2);
      }
    }

    await conn.end();

    res.json({
      supervised: supervisedStats,
      committee: committeeStats,
      combined: combinedStats
    });

  } catch (err) {
    await conn.end();
    console.error('Statistics error:', err);
    res.status(500).json({ error: 'Σφάλμα διακομιστή κατά την ανάκτηση στατιστικών.', details: err.message });
  }
});

// Public endpoint for thesis presentation announcements (no authentication required)
app.get('/api/public/announcements', async (req, res) => {
  const conn = await mysql.createConnection(dbConfig);
  
  try {
    const { 
      start_date, 
      end_date, 
      format = 'json' 
    } = req.query;
    
    // Step 1: Get the list of completed theses within the date range
    let initialQuery = `
      SELECT t.id as thesis_id
      FROM theses t
      JOIN presentation_details pd ON t.id = pd.thesis_id
      WHERE t.status = 'περατωμένη' AND pd.presentation_date IS NOT NULL
    `;
    
    const params = [];
    if (start_date) {
      initialQuery += ' AND DATE(pd.presentation_date) >= ?';
      params.push(start_date);
    }
    if (end_date) {
      initialQuery += ' AND DATE(pd.presentation_date) <= ?';
      params.push(end_date);
    }
    initialQuery += ' ORDER BY pd.presentation_date ASC';
    
    const [thesesList] = await conn.execute(initialQuery, params);

    // Step 2: For each thesis, fetch details and generate the document
    const results = [];
    for (const thesisEntry of thesesList) {
        const thesisId = thesisEntry.thesis_id;

        // Fetch main thesis data
        const [thesisRows] = await conn.execute(
          `SELECT 
             th.id, th.status, th.final_grade, th.gs_number, th.supervisor_id,
             s.name as student_name, s.surname as student_surname,
             t.title as thesis_title,
             p.name as supervisor_name, p.surname as supervisor_surname,
             pd.presentation_date, pd.location_or_link
           FROM theses th
           LEFT JOIN students s ON th.student_id = s.id
           LEFT JOIN thesis_topics t ON th.topic_id = t.id
           LEFT JOIN professors p ON th.supervisor_id = p.id
           LEFT JOIN presentation_details pd ON th.id = pd.thesis_id
           WHERE th.id = ?`,
          [thesisId]
        );

        if (!thesisRows.length) continue;
        const thesis = thesisRows[0];
        const supervisorId = thesis.supervisor_id;

        // Fetch committee members and their grades
        const [committeeAndGrades] = await conn.execute(
            `SELECT g.grade, p.id as professor_id, p.name, p.surname
             FROM grades g
             JOIN professors p ON g.professor_id = p.id
             WHERE g.thesis_id = ?`,
            [thesisId]
        );
        
        const presentationDate = new Date(thesis.presentation_date);
        
        const fullCommittee = committeeAndGrades.map(p => ({
            name: p.name,
            surname: p.surname,
            role: p.professor_id === supervisorId ? 'Επιβλέπων' : 'Μέλος',
            grade: parseFloat(p.grade).toFixed(2)
        }));

        const committeeListText = fullCommittee.map((m, i) => `${i + 1}. ${m.name} ${m.surname}`).join('\n');
        
        const tableHeader = `ΟΝΟΜΑΤΕΠΩΝΥΜΟ\t\t\tΙΔΙΟΤΗΤΑ\n`;
        const tableRows = fullCommittee.map(m => `${(m.name + ' ' + m.surname).padEnd(30, ' ')}\t${m.role}`).join('\n');

        const documentText = `ΠΡΟΓΡΑΜΜΑ ΣΠΟΥΔΩΝ
«ΤΜΗΜΑΤΟΣ ΜΗΧΑΝΙΚΩΝ, ΗΛΕΚΤΡΟΝΙΚΩΝ ΥΠΟΛΟΓΙΣΤΩΝ ΚΑΙ ΠΛΗΡΟΦΟΡΙΚΗΣ»

ΠΡΑΚΤΙΚΟ ΣΥΝΕΔΡΙΑΣΗΣ
ΤΗΣ ΤΡΙΜΕΛΟΥΣ ΕΠΙΤΡΟΠΗΣ
ΓΙΑ ΤΗΝ ΠΑΡΟΥΣΙΑΣΗ ΚΑΙ ΚΡΙΣΗ ΤΗΣ ΔΙΠΛΩΜΑΤΙΚΗΣ ΕΡΓΑΣΙΑΣ

του/της φοιτητή/φοτήτρια κ. ${thesis.student_name || '................'} ${thesis.student_surname || ''}

Η συνεδρίαση πραγματοποιήθηκε στην αίθουσα ${thesis.location_or_link || '................'}, στις ${presentationDate.toLocaleDateString('el-GR') || '................'}, ημέρα ${presentationDate.toLocaleDateString('el-GR', { weekday: 'long' }) || '................'} και ώρα ${presentationDate.toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit' }) || '................'}.

Στην συνεδρίαση είναι παρόντα τα μέλη της Τριμελούς Επιτροπής, κ.κ.:
${committeeListText || '1................\n2................\n3................'}

οι οποίοι ορίσθηκαν από την Συνέλευση του ΤΜΗΥΠ, στην συνεδρίαση της με αριθμό ${thesis.gs_number || '..........'}.

Ο/Η φοιτητής/φοιτήτρια κ. ${thesis.student_name || '................'} ${thesis.student_surname || ''} ανέπτυξε το θέμα της Διπλωματικής του/της Εργασίας, με τίτλο «${thesis.thesis_title || '................'}».

Στην συνέχεια υποβλήθηκαν ερωτήσεις στον υποψήφιο από τα μέλη της Τριμελούς Επιτροπής και τους άλλους παρευρισκόμενους, προκειμένου να διαμορφώσουν σαφή άποψη για το περιεχόμενο της εργασίας, για την επιστημονική συγκρότηση του μεταπτυχιακού φοιτητή.
        
Μετά το τέλος της ανάπτυξης της εργασίας του και των ερωτήσεων, ο υποψήφιος αποχωρεί.
        
Ο Επιβλέπων καθηγητής κ. ${thesis.supervisor_name || ''} ${thesis.supervisor_surname || ''}, προτείνει στα μέλη της Τριμελούς Επιτροπής, να ψηφίσουν για το αν εγκρίνεται η διπλωματική εργασία του ${thesis.student_name} ${thesis.student_surname}.
        
Τα μέλη της Τριμελούς Επιτροπής, ψηφίζουν κατ' αλφαβητική σειρά:
${committeeListText}
        
υπέρ της εγκρίσεως της Διπλωματικής Εργασίας του φοιτητή ${thesis.student_name} ${thesis.student_surname}, επειδή θεωρούν επιστημονικά επαρκή και το περιεχόμενό της ανταποκρίνεται στο θέμα που του δόθηκε.
        
Μετά της έγκριση, ο εισηγητής κ. ${thesis.supervisor_name || ''} ${thesis.supervisor_surname || ''}, προτείνει στα μέλη της Τριμελούς Επιτροπής, να απονεμηθεί στο/στη φοιτητή/τρια κ. ${thesis.student_name} ${thesis.student_surname} ο βαθμός ${thesis.final_grade}.

Τα μέλη της Τριμελούς Επιτροπής, απονέμουν την παρακάτω βαθμολογία:</p>
        <table>
            <thead>
                <tr>
                    <th>ΟΝΟΜΑΤΕΠΩΝΥΜΟ</th>
                    <th>ΙΔΙΟΤΗΤΑ</th>
                    <th>ΒΑΘΜΟΣ</th>
                </tr>
            </thead>
            <tbody>
                ${committee.map(m => `
                <tr>
                    <td>${m.name} ${m.surname}</td>
                    <td>${m.role}</td>
                    <td>${m.grade}</td>
                </tr>
                `).join('')}
            </tbody>
        </table>

        <p>Μετά την έγκριση και την απονομή του βαθμού <span class="dotted">${thesis.final_grade}</span>, η Τριμελής Επιτροπή, προτείνει να προχωρήσει στην διαδικασία για να ανακηρύξει τον κ. <span class="dotted">${thesis.student_name} ${thesis.student_surname}</span>, σε διπλωματούχο του Προγράμματος Σπουδών του «ΤΜΗΜΑΤΟΣ ΜΗΧΑΝΙΚΩΝ, ΗΛΕΚΤΡΟΝΙΚΩΝ ΥΠΟΛΟΓΙΣΤΩΝ ΚΑΙ ΠΛΗΡΟΦΟΡΙΚΗΣ ΠΑΝΕΠΙΣΤΗΜΙΟΥ ΠΑΤΡΩΝ» και να του απονέμει το Δίπλωμα Μηχανικού Η/Υ το οποίο αναγνωρίζεται ως Ενιαίος Τίτλος Σπουδών Μεταπτυχιακού Επιπέδου.`;
        
        // Construct the final ratings table separately for better formatting control
        const ratingsHeader = `ΟΝΟΜΑΤΕΠΩΝΥΜΟ`.padEnd(35) + `ΙΔΙΟΤΗΤΑ`.padEnd(20) + `ΒΑΘΜΟΣ\n`;
        const ratingsBody = fullCommittee.map(m => 
            `${(m.name + ' ' + m.surname).padEnd(35, ' ')}${m.role.padEnd(20, ' ')}${m.grade}`
        ).join('\n');
        
        const finalDocument = documentText.replace(/<RATING_TABLE>[\s\S]*<\/RATING_TABLE>/, ratingsHeader + ratingsBody);

        results.push({
            thesis_id: thesisId,
            document_text: finalDocument.trim()
        });
    }

    // Step 3: Return in requested format
    // ... same as before
    if (format.toLowerCase() === 'xml') {
      res.setHeader('Content-Type', 'application/xml; charset=utf-8');
      let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
      xml += '<announcements>\n';
      results.forEach(result => {
        xml += '  <announcement>\n';
        xml += `    <thesis_id>${result.thesis_id}</thesis_id>\n`;
        xml += `    <examination_minutes><![CDATA[${result.document_text}]]></examination_minutes>\n`;
        xml += '  </announcement>\n';
      });
      xml += '</announcements>';
      res.send(xml);
    } else {
      // Default JSON format
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.json({
        total: results.length,
        announcements: results
      });
    }
    await conn.end();
  } catch (err) {
    await conn.end();
    console.error('Public announcements error:', err);
    res.status(500).json({ error: 'Σφάλμα διακομιστή κατά την ανάκτηση ανακοινώσεων.', details: err.message });
  }
});

// THIS ENDPOINT IS NO LONGER NEEDED AND WILL BE REMOVED.
/*
app.get('/api/public/topics', async (req, res) => {
  const conn = await mysql.createConnection(dbConfig);
  try {
    const [rows] = await conn.execute(`
      SELECT 
        tt.id as topic_id,
        tt.title,
        tt.summary,
        tt.created_at,
        p.name as professor_name,
        p.surname as professor_surname
      FROM thesis_topics tt
      JOIN professors p ON tt.professor_id = p.id
      ORDER BY tt.created_at DESC
    `);
    res.json({ total: rows.length, topics: rows });
    await conn.end();
  } catch (err) {
    await conn.end();
    res.status(500).json({ error: 'Σφάλμα διακομιστή κατά την ανάκτηση θεμάτων.' });
  }
});
*/
