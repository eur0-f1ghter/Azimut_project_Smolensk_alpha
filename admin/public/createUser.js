import bcrypt from 'bcrypt';
import Database from 'better-sqlite3';

const db = new Database('./users.db');
const email = process.argv[2];
const password = process.argv[3];
const displayName = process.argv[4] || null;

if (!email || !password) {
  console.log('Usage: node createUser.js email@example.com password [displayName]');
  process.exit(1);
}

(async () => {
  const hash = await bcrypt.hash(password, 10);
  try {
    const stmt = db.prepare('INSERT INTO users(email, password_hash, display_name) VALUES(?,?,?)');
    stmt.run(email.toLowerCase(), hash, displayName);
    console.log('User created:', email);
  } catch (e) {
    console.error('Failed to create user:', e.message);
  } finally {
    db.close();
  }
})();