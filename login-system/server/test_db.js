const mysql = require('mysql2/promise');

const dbConfig = {
  host: 'database-web.c3kq4isqkxwl.eu-north-1.rds.amazonaws.com',
  user: 'admin',
  password: 'bPCd^sL12$1x7cm61&fV',
  database: 'thesis_support_system',
  port: 3306
};

async function checkData() {
  const conn = await mysql.createConnection(dbConfig);
  
  try {
    console.log('=== Checking Database Data ===\n');
    
    // Check thesis topics
    const [topics] = await conn.execute('SELECT id, title, professor_id FROM thesis_topics LIMIT 5');
    console.log('Thesis Topics:', topics);
    
    // Check theses and their status
    const [theses] = await conn.execute('SELECT id, status, topic_id, student_id FROM theses LIMIT 5');
    console.log('Theses:', theses);
    
    // Check presentation details
    const [presentations] = await conn.execute('SELECT thesis_id, presentation_date FROM presentation_details LIMIT 5');
    console.log('Presentation Details:', presentations);
    
    // Check the specific query that should work
    const [announcements] = await conn.execute(`
      SELECT 
        t.id as thesis_id,
        tt.title as thesis_title,
        tt.summary as thesis_summary,
        s.name as student_name,
        s.surname as student_surname,
        s.student_number,
        p.name as supervisor_name,
        p.surname as supervisor_surname,
        pd.presentation_date,
        pd.mode,
        pd.location_or_link,
        pd.announcement_text,
        pd.created_at
      FROM theses t
      JOIN thesis_topics tt ON t.topic_id = tt.id
      JOIN students s ON t.student_id = s.id
      JOIN professors p ON t.supervisor_id = p.id
      JOIN presentation_details pd ON t.id = pd.thesis_id
      WHERE t.status = 'υπό εξέταση' AND pd.presentation_date IS NOT NULL
      ORDER BY pd.presentation_date ASC
    `);
    console.log('Announcements Query Result:', announcements);
    
    // Check all thesis statuses
    const [statuses] = await conn.execute('SELECT DISTINCT status FROM theses');
    console.log('All thesis statuses:', statuses);
    
    // Check if there are any theses with presentation details
    const [thesesWithPresentations] = await conn.execute(`
      SELECT t.id, t.status, tt.title, pd.presentation_date
      FROM theses t
      JOIN thesis_topics tt ON t.topic_id = tt.id
      LEFT JOIN presentation_details pd ON t.id = pd.thesis_id
      WHERE pd.thesis_id IS NOT NULL
    `);
    console.log('Theses with presentation details:', thesesWithPresentations);
    
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await conn.end();
  }
}

checkData(); 