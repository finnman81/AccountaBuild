/**
 * Script to delete duplicate logs from Firestore for a specific date
 * 
 * Usage:
 *   node scripts/delete-duplicate-logs.js <projectId> <groupId> <date> [strategy] [serviceAccountKeyPath]
 * 
 * Strategies:
 *   - "all": Delete ALL logs for the date (nuclear option)
 *   - "duplicates": Keep one of each unique entry, delete duplicates (recommended)
 *   - "apple_health": Delete only apple_health logs for the date
 * 
 * Authentication (choose one):
 *   1. Provide service account key as 5th argument
 *   2. Set GOOGLE_APPLICATION_CREDENTIALS env var
 *   3. Use gcloud auth application-default login
 * 
 * Example:
 *   node scripts/delete-duplicate-logs.js my-project-id my-group-id 2026-01-19 duplicates ./service-account-key.json
 */

let admin;
try {
  admin = require('firebase-admin');
} catch (error) {
  console.error('❌ Error: firebase-admin is not installed.');
  console.error('');
  console.error('Please install it first:');
  console.error('  npm install --save-dev firebase-admin');
  console.error('');
  console.error('Or use npx:');
  console.error('  npx firebase-admin (if available)');
  process.exit(1);
}

// Parse command line arguments
const args = process.argv.slice(2);
if (args.length < 3) {
  console.error('Usage: node delete-duplicate-logs.js <projectId> <groupId> <date> [strategy]');
  console.error('  date format: YYYY-MM-DD (e.g., 2026-01-19)');
  console.error('  strategy: "all" | "duplicates" | "apple_health" (default: duplicates)');
  process.exit(1);
}

const [projectId, groupId, date, strategy = 'duplicates'] = args;

// Validate date format (should be YYYY-MM-DD)
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
  console.error('Error: Date must be in format YYYY-MM-DD');
  process.exit(1);
}

// Dates are stored in Firestore as YYYY-MM-DD (with dashes)
const dateYYYYMMDD = date;

console.log('='.repeat(60));
console.log('Firestore Duplicate Log Deletion Script');
console.log('='.repeat(60));
console.log(`Project ID: ${projectId}`);
console.log(`Group ID: ${groupId}`);
console.log(`Date: ${date} (stored as: ${dateYYYYMMDD})`);
console.log(`Strategy: ${strategy}`);
console.log('='.repeat(60));
console.log('');

// Initialize Firebase Admin
if (!admin.apps.length) {
  try {
    // Check for service account key file path as 5th argument
    const serviceAccountPath = args[4];
    
    if (serviceAccountPath) {
      // Use service account key file
      const serviceAccount = require(require('path').resolve(serviceAccountPath));
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: projectId,
      });
      console.log('✅ Firebase Admin initialized with service account key');
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      // Use service account from environment variable
      const serviceAccount = require(process.env.GOOGLE_APPLICATION_CREDENTIALS);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: projectId,
      });
      console.log('✅ Firebase Admin initialized with service account from env var');
    } else {
      // Try Application Default Credentials (requires gcloud auth)
      admin.initializeApp({
        projectId: projectId,
      });
      console.log('✅ Firebase Admin initialized with Application Default Credentials');
    }
  } catch (error) {
    console.error('❌ Failed to initialize Firebase Admin:', error.message);
    console.error('');
    console.error('Please authenticate using one of these methods:');
    console.error('  1. Provide service account key as 5th argument:');
    console.error('     node scripts/delete-duplicate-logs.js <projectId> <groupId> <date> <strategy> <path/to/key.json>');
    console.error('  2. Set GOOGLE_APPLICATION_CREDENTIALS env var:');
    console.error('     $env:GOOGLE_APPLICATION_CREDENTIALS="path/to/key.json"');
    console.error('  3. Or run: gcloud auth application-default login');
    console.error('');
    console.error('To get a service account key:');
    console.error('  1. Go to Firebase Console → Project Settings → Service Accounts');
    console.error('  2. Click "Generate New Private Key"');
    console.error('  3. Save the JSON file securely');
    process.exit(1);
  }
}

const db = admin.firestore();
const logsRef = db.collection('groups').doc(groupId).collection('logs');

async function deleteDuplicates() {
  try {
    console.log(`Fetching logs for date ${dateYYYYMMDD}...`);
    
    // Query all logs for the date
    const snapshot = await logsRef
      .where('date', '==', dateYYYYMMDD)
      .get();

    if (snapshot.empty) {
      console.log('No logs found for this date.');
      return;
    }

    console.log(`Found ${snapshot.size} logs for date ${dateYYYYMMDD}`);
    console.log('');

    let toDelete = [];

    if (strategy === 'all') {
      // Delete everything
      console.log('Strategy: DELETE ALL logs for this date');
      toDelete = snapshot.docs.map(doc => ({ id: doc.id, data: doc.data() }));
    } else if (strategy === 'apple_health') {
      // Delete only apple_health logs
      console.log('Strategy: DELETE only apple_health logs');
      toDelete = snapshot.docs
        .filter(doc => doc.data().source === 'apple_health')
        .map(doc => ({ id: doc.id, data: doc.data() }));
    } else if (strategy === 'duplicates') {
      // Smart deduplication: keep one of each unique entry
      console.log('Strategy: DELETE duplicates, keep one of each unique entry');
      
      const seen = new Map();
      const duplicates = [];

      snapshot.docs.forEach(doc => {
        const data = doc.data();
        const logType = data.type;
        const source = data.source || 'unknown';
        
        let key;
        
        if (logType === 'calories') {
          const calories = data.payload?.calories || 0;
          const meal = data.payload?.meal || 'all';
          key = `calories:${calories}:${meal}:${source}`;
        } else if (logType === 'workout') {
          const workoutType = data.payload?.workoutType || '';
          const duration = data.payload?.durationMinutes || 0;
          key = `workout:${workoutType}:${duration}:${source}`;
        } else if (logType === 'weight') {
          const weight = Math.round((data.payload?.weight || 0) * 10) / 10; // Round to 1 decimal
          key = `weight:${weight}:${source}`;
        } else {
          // For other types, use document ID as key (don't deduplicate)
          key = `other:${doc.id}`;
        }

        if (seen.has(key)) {
          duplicates.push({ id: doc.id, data, key });
        } else {
          seen.set(key, { id: doc.id, data });
        }
      });

      console.log(`Found ${seen.size} unique entries`);
      console.log(`Found ${duplicates.length} duplicate entries to delete`);
      console.log('');

      // Show what will be kept vs deleted
      console.log('Sample of entries to KEEP (first occurrence):');
      let keepCount = 0;
      for (const [key, entry] of seen.entries()) {
        if (keepCount < 5) {
          console.log(`  - ${key} (doc: ${entry.id})`);
          keepCount++;
        }
      }
      if (seen.size > 5) {
        console.log(`  ... and ${seen.size - 5} more`);
      }
      console.log('');

      console.log('Sample of entries to DELETE (duplicates):');
      let deleteCount = 0;
      for (const dup of duplicates) {
        if (deleteCount < 10) {
          console.log(`  - ${dup.key} (doc: ${dup.id})`);
          deleteCount++;
        }
      }
      if (duplicates.length > 10) {
        console.log(`  ... and ${duplicates.length - 10} more`);
      }
      console.log('');

      toDelete = duplicates;
    } else {
      console.error(`Unknown strategy: ${strategy}`);
      process.exit(1);
    }

    if (toDelete.length === 0) {
      console.log('No logs to delete.');
      return;
    }

    console.log(`\n⚠️  About to DELETE ${toDelete.length} log(s)`);
    console.log('Press Ctrl+C within 5 seconds to cancel...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Delete in batches of 500 (Firestore limit)
    const batchSize = 500;
    let deleted = 0;

    for (let i = 0; i < toDelete.length; i += batchSize) {
      const batch = db.batch();
      const batchDocs = toDelete.slice(i, i + batchSize);

      batchDocs.forEach(({ id }) => {
        batch.delete(logsRef.doc(id));
      });

      await batch.commit();
      deleted += batchDocs.length;
      console.log(`Deleted ${deleted}/${toDelete.length} logs...`);
    }

    console.log('');
    console.log('✅ Successfully deleted', deleted, 'log(s)');
    console.log('');

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

// Run the script
deleteDuplicates()
  .then(() => {
    console.log('Script completed.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
