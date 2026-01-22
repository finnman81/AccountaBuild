/**
 * Debug join code issue - check if join code exists and why a user can't join
 *
 * Usage:
 *   node scripts/debug-join-code.js <projectId> <serviceAccountKeyPath> <joinCode> <userId>
 */

let admin;
try {
  admin = require('firebase-admin');
} catch {
  console.error('❌ firebase-admin not installed. Run: npm install --save-dev firebase-admin');
  process.exit(1);
}

const args = process.argv.slice(2);
if (args.length < 4) {
  console.error('Usage: node scripts/debug-join-code.js <projectId> <serviceAccountKeyPath> <joinCode> <userId>');
  process.exit(1);
}

const [projectId, serviceAccountPath, joinCode, userId] = args;

if (!admin.apps.length) {
  try {
    const serviceAccount = require(require('path').resolve(serviceAccountPath));
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId,
    });
    console.log('✅ Firebase Admin initialized');
  } catch (e) {
    console.error('❌ Failed to init admin:', e);
    process.exit(1);
  }
}

const db = admin.firestore();

function normalizeJoinCode(code) {
  return code.trim().toUpperCase();
}

async function run() {
  const normalizedCode = normalizeJoinCode(joinCode);
  console.log('=== Debugging Join Code ===');
  console.log('Join Code (raw):', joinCode);
  console.log('Join Code (normalized):', normalizedCode);
  console.log('User ID:', userId);
  console.log('');

  // Step 1: Check if join code exists
  console.log('1. Checking join code document...');
  const joinCodeRef = db.collection('joinCodes').doc(normalizedCode);
  const joinCodeSnap = await joinCodeRef.get();
  
  if (!joinCodeSnap.exists) {
    console.log('❌ Join code document does NOT exist!');
    console.log('   This means the join code mapping was never created or was deleted.');
    console.log('   Solution: Group admin should regenerate the join code or backfill the mapping.');
    return;
  }

  const joinData = joinCodeSnap.data();
  console.log('✅ Join code document exists');
  console.log('   Data:', JSON.stringify(joinData, null, 2));
  const groupId = joinData?.groupId;
  
  if (!groupId) {
    console.log('❌ Join code document exists but has no groupId!');
    return;
  }

  console.log('   Group ID:', groupId);
  console.log('');

  // Step 2: Check if group exists
  console.log('2. Checking if group exists...');
  const groupRef = db.collection('groups').doc(groupId);
  const groupSnap = await groupRef.get();
  
  if (!groupSnap.exists) {
    console.log('❌ Group does NOT exist!');
    console.log('   The join code points to a deleted group.');
    console.log('   Solution: Delete the stale join code document.');
    return;
  }

  const groupData = groupSnap.data();
  console.log('✅ Group exists');
  console.log('   Name:', groupData?.name);
  console.log('   Join Code (in group doc):', groupData?.joinCode);
  console.log('   Created By:', groupData?.createdBy);
  console.log('   Member Count:', groupData?.memberCount);
  console.log('');

  // Step 3: Check if user is already a member
  console.log('3. Checking if user is already a member...');
  const memberRef = db.collection('groups').doc(groupId).collection('members').doc(userId);
  const memberSnap = await memberRef.get();
  
  if (memberSnap.exists) {
    const memberData = memberSnap.data();
    console.log('✅ User IS already a member');
    console.log('   Role:', memberData?.role);
    console.log('   Joined At:', memberData?.joinedAt?.toDate?.() || memberData?.joinedAt);
    console.log('');
    console.log('   This should not prevent joining - the code should handle this case.');
  } else {
    console.log('ℹ️  User is NOT a member yet');
    console.log('');
  }

  // Step 4: Check user's groups reference
  console.log('4. Checking user groups reference...');
  const userGroupRef = db.collection('users').doc(userId).collection('groups').doc(groupId);
  const userGroupSnap = await userGroupRef.get();
  
  if (userGroupSnap.exists) {
    const userGroupData = userGroupSnap.data();
    console.log('✅ User groups reference exists');
    console.log('   Data:', JSON.stringify(userGroupData, null, 2));
  } else {
    console.log('ℹ️  User groups reference does NOT exist');
    console.log('   This is normal if the user has never joined.');
  }
  console.log('');

  // Step 5: Check Firestore rules (we can't test directly, but we can check the structure)
  console.log('5. Firestore Rules Check (manual review needed):');
  console.log('   - joinCodes/{code}: allow read if signedIn() ✅ (should work)');
  console.log('   - groups/{groupId}: allow read if isGroupMember(groupId)');
  console.log('     ⚠️  This requires membership to read, but join code lookup should work');
  console.log('   - groups/{groupId}/members/{uid}: allow create if signedIn() && request.auth.uid == uid && groupExists(groupId)');
  console.log('     ✅ Should work for joining');
  console.log('');

  // Summary
  console.log('=== Summary ===');
  if (!joinCodeSnap.exists) {
    console.log('❌ Join code does not exist - this is the problem');
  } else if (!groupSnap.exists) {
    console.log('❌ Group does not exist - join code is stale');
  } else if (memberSnap.exists) {
    console.log('ℹ️  User is already a member - join should succeed (updates reference)');
  } else {
    console.log('✅ Everything looks correct - join should work');
    console.log('   If it still fails, check:');
    console.log('   1. User is properly authenticated');
    console.log('   2. Firestore rules are deployed correctly');
    console.log('   3. Network/permission errors in client logs');
  }
}

run().catch((err) => {
  console.error('❌ Error:', err);
  process.exit(1);
});
