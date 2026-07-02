/**
 * Set a new password for a Firebase Auth user (admin only).
 * Use this to regain access to your own account without a reset email.
 *
 * Usage:
 *   node scripts/set-password.js <projectId> <serviceAccountKeyPath> <uid> <newPassword>
 *
 * Example (your account):
 *   node scripts/set-password.js accountabuild ./admin-key.json dJXX3v6nHDgxoId89S06dBwkgxG3 "MyNewPass123"
 */

let admin;
try {
  admin = require('firebase-admin');
} catch {
  console.error('firebase-admin not installed. Run: npm install --save-dev firebase-admin');
  process.exit(1);
}

const args = process.argv.slice(2);
if (args.length < 4) {
  console.error('Usage: node scripts/set-password.js <projectId> <serviceAccountKeyPath> <uid> <newPassword>');
  process.exit(1);
}

const [projectId, serviceAccountPath, uid, newPassword] = args;

if (String(newPassword).length < 6) {
  console.error('Firebase requires passwords of at least 6 characters.');
  process.exit(1);
}

try {
  const serviceAccount = require(require('path').resolve(serviceAccountPath));
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount), projectId });
} catch (e) {
  console.error('Failed to init admin SDK:', e.message);
  process.exit(1);
}

admin
  .auth()
  .updateUser(uid, { password: String(newPassword) })
  .then((u) => {
    console.log('Password updated for', u.email, '(uid ' + u.uid + ')');
    process.exit(0);
  })
  .catch((e) => {
    console.error('Failed to update password:', e.message);
    process.exit(1);
  });
