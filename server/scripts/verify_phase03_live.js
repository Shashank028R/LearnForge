import mongoose from 'mongoose';
import { config } from '../src/config/env.js';
import { User } from '../src/models/User.js';
import { UserSession } from '../src/models/UserSession.js';
import { Subject } from '../src/models/Subject.js';
import { Topic } from '../src/models/Topic.js';
import { generateSessionToken, hashSessionToken } from '../src/utils/authCrypto.js';

const API_BASE = 'http://localhost:5000/api/v1';

async function runLiveVerification() {
  console.log('=== Starting Phase 03 Live Verification against local server ===\n');

  // Connect to live MongoDB
  await mongoose.connect(config.mongoUri);
  console.log('✓ Connected to MongoDB for test fixture provisioning');

  // Create two distinct users: User A and User B
  const timestamp = Date.now();
  const userA = await User.create({
    email: `verification.userA.${timestamp}@learnforge.local`,
    normalizedEmail: `verification.usera.${timestamp}@learnforge.local`,
    displayName: 'User A (Owner)',
    authProvider: 'email_otp',
    isEmailVerified: true,
  });

  const tokenA = generateSessionToken();
  await UserSession.create({
    userId: userA._id,
    sessionTokenHash: hashSessionToken(tokenA),
    authMethod: 'otp',
    expiresAt: new Date(Date.now() + 3600000),
  });

  const userB = await User.create({
    email: `verification.userB.${timestamp}@learnforge.local`,
    normalizedEmail: `verification.userb.${timestamp}@learnforge.local`,
    displayName: 'User B (Attacker)',
    authProvider: 'email_otp',
    isEmailVerified: true,
  });

  const tokenB = generateSessionToken();
  await UserSession.create({
    userId: userB._id,
    sessionTokenHash: hashSessionToken(tokenB),
    authMethod: 'otp',
    expiresAt: new Date(Date.now() + 3600000),
  });

  console.log(`✓ Provisioned User A (${userA._id}) and User B (${userB._id})`);

  const headersA = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${tokenA}`,
  };

  const headersB = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${tokenB}`,
  };

  try {
    // 1. User A creates Subject with targetMasteryLevel: 'comprehensive'
    console.log('\n[1] User A creates Subject with targetMasteryLevel: "comprehensive"...');
    const createSubjRes = await fetch(`${API_BASE}/subjects`, {
      method: 'POST',
      headers: headersA,
      body: JSON.stringify({
        name: 'Computational Complexity',
        description: 'P vs NP, Turing machines, and reductions',
        color: '#3b82f6',
        targetMasteryLevel: 'comprehensive',
      }),
    });
    const createSubjData = await createSubjRes.json();
    if (createSubjRes.status !== 201) throw new Error(`Subject creation failed: ${JSON.stringify(createSubjData)}`);
    const subjectId = createSubjData.data.subject._id || createSubjData.data.subject.id;
    if (createSubjData.data.subject.targetMasteryLevel !== 'comprehensive') {
      throw new Error(`Expected comprehensive targetMasteryLevel, got: ${createSubjData.data.subject.targetMasteryLevel}`);
    }
    console.log(`✓ Subject created: ${subjectId} - "${createSubjData.data.subject.name}" with targetMasteryLevel: "${createSubjData.data.subject.targetMasteryLevel}"`);

    // 2. User A gets owned subject (re-fetch/persistence check)
    console.log('\n[2] User A re-fetches Subject to confirm "comprehensive" persistence...');
    const getSubjRes = await fetch(`${API_BASE}/subjects/${subjectId}`, { headers: headersA });
    const getSubjData = await getSubjRes.json();
    if (getSubjRes.status !== 200) throw new Error(`Subject fetch failed: ${JSON.stringify(getSubjData)}`);
    if (getSubjData.data.subject.targetMasteryLevel !== 'comprehensive') {
      throw new Error(`Expected persisted comprehensive mastery, got: ${getSubjData.data.subject.targetMasteryLevel}`);
    }
    console.log(`✓ Confirmed persisted subject: "${getSubjData.data.subject.name}" (mastery: "${getSubjData.data.subject.targetMasteryLevel}")`);

    // 3. User A edits subject: changes mastery level from comprehensive to advanced and back
    console.log('\n[3] User A edits subject mastery: comprehensive -> advanced -> comprehensive...');
    const updateToAdvRes = await fetch(`${API_BASE}/subjects/${subjectId}`, {
      method: 'PUT',
      headers: headersA,
      body: JSON.stringify({ targetMasteryLevel: 'advanced' }),
    });
    const updateToAdvData = await updateToAdvRes.json();
    if (updateToAdvRes.status !== 200 || updateToAdvData.data.subject.targetMasteryLevel !== 'advanced') {
      throw new Error(`Failed to update mastery to advanced: ${JSON.stringify(updateToAdvData)}`);
    }
    console.log('✓ Successfully updated mastery to "advanced"');

    const updateBackRes = await fetch(`${API_BASE}/subjects/${subjectId}`, {
      method: 'PUT',
      headers: headersA,
      body: JSON.stringify({ targetMasteryLevel: 'comprehensive' }),
    });
    const updateBackData = await updateBackRes.json();
    if (updateBackRes.status !== 200 || updateBackData.data.subject.targetMasteryLevel !== 'comprehensive') {
      throw new Error(`Failed to update mastery back to comprehensive: ${JSON.stringify(updateBackData)}`);
    }
    console.log('✓ Successfully updated mastery back to "comprehensive"');

    // 4. Validate all other mastery levels (beginner, intermediate) and invalid value rejection
    console.log('\n[4] Validating other mastery levels and invalid rejection...');
    for (const level of ['beginner', 'intermediate']) {
      const res = await fetch(`${API_BASE}/subjects`, {
        method: 'POST',
        headers: headersA,
        body: JSON.stringify({ name: `Subject ${level}`, targetMasteryLevel: level }),
      });
      const data = await res.json();
      if (res.status !== 201 || data.data.subject.targetMasteryLevel !== level) {
        throw new Error(`Failed for mastery level: ${level}`);
      }
      console.log(`✓ Creation succeeded for targetMasteryLevel: "${level}"`);
    }

    const invalidRes = await fetch(`${API_BASE}/subjects`, {
      method: 'POST',
      headers: headersA,
      body: JSON.stringify({ name: 'Subject Invalid Mastery', targetMasteryLevel: 'super_master' }),
    });
    if (invalidRes.status !== 400) {
      throw new Error(`Expected 400 for invalid mastery, got: ${invalidRes.status}`);
    }
    console.log('✓ Invalid targetMasteryLevel rejected with 400 (Passed)');

    // 5. User A creates Topic inside Subject
    console.log('\n[5] User A creates Topic...');
    const createTopRes = await fetch(`${API_BASE}/topics`, {
      method: 'POST',
      headers: headersA,
      body: JSON.stringify({
        subjectId,
        title: 'Polynomial Time Reductions',
        description: 'Karp reductions from 3-SAT to CLIQUE',
        orderIndex: 0,
        status: 'in_progress',
      }),
    });
    const createTopData = await createTopRes.json();
    if (createTopRes.status !== 201) throw new Error(`Topic creation failed: ${JSON.stringify(createTopData)}`);
    const topicId = createTopData.data.topic._id || createTopData.data.topic.id;
    console.log(`✓ Topic created: ${topicId} - "${createTopData.data.topic.title}"`);

    // 6. User A lists topics for Subject
    console.log('\n[6] User A lists topics for Subject...');
    const listTopRes = await fetch(`${API_BASE}/topics?subjectId=${subjectId}`, { headers: headersA });
    const listTopData = await listTopRes.json();
    if (listTopData.data.topics.length !== 1) throw new Error('Expected 1 topic');
    console.log(`✓ Listed ${listTopData.data.topics.length} topic(s)`);

    // 7. User A updates Topic status
    console.log('\n[7] User A updates Topic status...');
    const updateTopRes = await fetch(`${API_BASE}/topics/${topicId}`, {
      method: 'PUT',
      headers: headersA,
      body: JSON.stringify({
        status: 'mastered',
      }),
    });
    const updateTopData = await updateTopRes.json();
    if (updateTopData.data.topic.status !== 'mastered') throw new Error('Expected status to be mastered');
    console.log(`✓ Updated topic status to "${updateTopData.data.topic.status}"`);

    // 8. Cross-Tenant Security Verification (User B attacks User A's resources)
    console.log('\n[8] Cross-tenant Isolation Verification (User B accessing User A)...');

    const bGetSubj = await fetch(`${API_BASE}/subjects/${subjectId}`, { headers: headersB });
    if (bGetSubj.status !== 404) throw new Error(`Expected 404 for User B reading Subject A, got ${bGetSubj.status}`);
    console.log('✓ User B GET Subject A -> 404 Not Found (Passed)');

    const bPutSubj = await fetch(`${API_BASE}/subjects/${subjectId}`, {
      method: 'PUT',
      headers: headersB,
      body: JSON.stringify({ name: 'Hacked Subject' }),
    });
    if (bPutSubj.status !== 404) throw new Error(`Expected 404 for User B modifying Subject A, got ${bPutSubj.status}`);
    console.log('✓ User B PUT Subject A -> 404 Not Found (Passed)');

    const bDelSubj = await fetch(`${API_BASE}/subjects/${subjectId}`, {
      method: 'DELETE',
      headers: headersB,
    });
    if (bDelSubj.status !== 404) throw new Error(`Expected 404 for User B deleting Subject A, got ${bDelSubj.status}`);
    console.log('✓ User B DELETE Subject A -> 404 Not Found (Passed)');

    const bListTop = await fetch(`${API_BASE}/topics?subjectId=${subjectId}`, { headers: headersB });
    if (bListTop.status !== 404) throw new Error(`Expected 404 for User B listing topics of Subject A, got ${bListTop.status}`);
    console.log('✓ User B GET Topics of Subject A -> 404 Not Found (Passed)');

    const bCreateTopInA = await fetch(`${API_BASE}/topics`, {
      method: 'POST',
      headers: headersB,
      body: JSON.stringify({
        subjectId,
        title: 'Unauthorized Topic Insertion',
      }),
    });
    if (bCreateTopInA.status !== 404) throw new Error(`Expected 404 for User B creating topic in Subject A, got ${bCreateTopInA.status}`);
    console.log('✓ User B POST Topic in Subject A -> 404 Not Found (Passed)');

    const bGetTop = await fetch(`${API_BASE}/topics/${topicId}`, { headers: headersB });
    if (bGetTop.status !== 404) throw new Error(`Expected 404 for User B reading Topic A, got ${bGetTop.status}`);
    console.log('✓ User B GET Topic A -> 404 Not Found (Passed)');

    const bPutTop = await fetch(`${API_BASE}/topics/${topicId}`, {
      method: 'PUT',
      headers: headersB,
      body: JSON.stringify({ title: 'Hacked Topic' }),
    });
    if (bPutTop.status !== 404) throw new Error(`Expected 404 for User B modifying Topic A, got ${bPutTop.status}`);
    console.log('✓ User B PUT Topic A -> 404 Not Found (Passed)');

    const bDelTop = await fetch(`${API_BASE}/topics/${topicId}`, {
      method: 'DELETE',
      headers: headersB,
    });
    if (bDelTop.status !== 404) throw new Error(`Expected 404 for User B deleting Topic A, got ${bDelTop.status}`);
    console.log('✓ User B DELETE Topic A -> 404 Not Found (Passed)');

    // 9. Cascading Deletion Verification
    console.log('\n[9] Cascading Deletion Verification...');
    await fetch(`${API_BASE}/topics`, {
      method: 'POST',
      headers: headersA,
      body: JSON.stringify({
        subjectId,
        title: 'Cook-Levin Theorem',
        orderIndex: 1,
      }),
    });

    const delSubjRes = await fetch(`${API_BASE}/subjects/${subjectId}`, {
      method: 'DELETE',
      headers: headersA,
    });
    if (delSubjRes.status !== 200) throw new Error('Failed to delete subject');
    console.log('✓ User A deleted Subject A');

    const remainingTopics = await Topic.find({ subjectId });
    if (remainingTopics.length !== 0) throw new Error(`Expected 0 topics after cascade, found ${remainingTopics.length}`);
    console.log(`✓ Confirmed 0 remaining topics in DB (Cascade succeeded)`);

    console.log('\n=== ALL LIVE VERIFICATION CHECKS PASSED SUCCESSFULLY ===');
  } finally {
    // Cleanup fixture users and sessions
    await UserSession.deleteMany({ userId: { $in: [userA._id, userB._id] } });
    await Subject.deleteMany({ userId: { $in: [userA._id, userB._id] } });
    await Topic.deleteMany({ userId: { $in: [userA._id, userB._id] } });
    await User.deleteMany({ _id: { $in: [userA._id, userB._id] } });
    await mongoose.disconnect();
    console.log('✓ Cleaned up test fixtures and disconnected from DB\n');
  }
}

runLiveVerification().catch((err) => {
  console.error('\n❌ Live Verification Failed:', err);
  process.exit(1);
});
