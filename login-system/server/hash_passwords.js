const mysql = require("mysql2/promise"); // MySQL client with promise support
const bcrypt = require("bcryptjs"); // For hashing passwords

// Async function to hash all plain-text passwords in the DB
async function hashAll() {
  // Connect to the database
  const conn = await mysql.createConnection({
    host: "database-web.c3kq4isqkxwl.eu-north-1.rds.amazonaws.com",
    user: "admin",
    password: "bPCd^sL12$1x7cm61&fV",
    database: "thesis_support_system",
    port: 3306
  });

  // Hash student passwords
  let [students] = await conn.execute("SELECT id, password_hash FROM students"); // Get all students
  for (const s of students) {
    if (!s.password_hash.startsWith("$2")) { // If not already hashed (bcrypt hashes start with $2)
      const hash = bcrypt.hashSync(s.password_hash, 10); // Hash the plain password
      await conn.execute("UPDATE students SET password_hash = ? WHERE id = ?", [hash, s.id]); // Update DB
    }
  }

  // Hash professor passwords
  let [profs] = await conn.execute("SELECT id, password_hash FROM professors"); // Get all professors
  for (const p of profs) {
    if (!p.password_hash.startsWith("$2")) { // If not already hashed
      const hash = bcrypt.hashSync(p.password_hash, 10); // Hash the plain password
      await conn.execute("UPDATE professors SET password_hash = ? WHERE id = ?", [hash, p.id]); // Update DB
    }
  }

  // Hash admin_secretariat passwords
  let [admins] = await conn.execute("SELECT id, password_hash FROM admin_secretariat"); // Get all admins
  for (const a of admins) {
    if (!a.password_hash.startsWith("$2")) { // If not already hashed
      const hash = bcrypt.hashSync(a.password_hash, 10); // Hash the plain password
      await conn.execute("UPDATE admin_secretariat SET password_hash = ? WHERE id = ?", [hash, a.id]); // Update DB
    }
  }

  console.log("All passwords hashed."); // Log completion
  await conn.end(); // Close DB connection
}

// Run the hashAll function
hashAll();
