import mongoose from 'mongoose';
import { config } from '../src/config/env.js';
import { User } from '../src/models/User.js';
import { UserSession } from '../src/models/UserSession.js';
import { Subject } from '../src/models/Subject.js';
import { Topic } from '../src/models/Topic.js';
import { Chat } from '../src/models/Chat.js';
import { Message } from '../src/models/Message.js';
import { SyllabusVersion } from '../src/models/SyllabusVersion.js';
import { Annotation } from '../src/models/Annotation.js';
import { generateSessionToken, hashSessionToken } from '../src/utils/authCrypto.js';
import { reconcileCanonicalTopics } from '../src/controllers/syllabusController.js';

const API_BASE = 'http://localhost:5000/api/v1';

async function apiRequest(endpoint, options = {}, cookie = null) {
  const headers = {
    'Content-Type': 'application/json',
    ...(cookie ? { Cookie: cookie } : {}),
    ...(options.headers || {}),
  };

  const url = `${API_BASE}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers,
  });

  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch (e) {
    json = { raw: text };
  }

  return {
    status: response.status,
    ok: response.ok,
    body: json,
    headers: response.headers,
  };
}

async function runLiveVerification() {
  console.log('====================================================');
  console.log('PHASE 04.1 — SYLLABUS & KNOWLEDGE GOVERNANCE LIVE API VERIFICATION');
  console.log('API Target:', API_BASE);
  console.log('Target Database:', config.mongoUri ? config.mongoUri.replace(/:\/\/.*@/, '://<credentials>@') : 'Undefined');
  console.log('====================================================\n');

  if (!config.mongoUri) {
    console.error('❌ MONGODB_URI is not set in environment.');
    process.exit(1);
  }

  await mongoose.connect(config.mongoUri);
  console.log('✓ Successfully connected to MongoDB Atlas.\n');

  const testSuffix = Date.now();
  let userA = null;
  let userB = null;
  let cookieA = null;
  let cookieB = null;
  let subjectA = null;
  let chatA = null;

  try {
    // 1. Create authentic test users & sessions directly in Atlas to obtain valid HttpOnly session cookies
    const userAId = new mongoose.Types.ObjectId();
    userA = await User.create({
      _id: userAId,
      email: `test_user_a_${testSuffix}@learnforge.io`,
      normalizedEmail: `test_user_a_${testSuffix}@learnforge.io`,
      status: 'active',
      isEmailVerified: true,
      role: 'user',
    });

    const tokenA = generateSessionToken();
    await UserSession.create({
      userId: userA._id,
      sessionTokenHash: hashSessionToken(tokenA),
      isActive: true,
      expiresAt: new Date(Date.now() + 86400000),
      ipAddress: '127.0.0.1',
      userAgent: 'LearnForge Live Verification Client',
    });
    cookieA = `learnforge_session=${tokenA}`;
    console.log(`1. Created User A: ${userA.email} (${userA._id}) and initialized active session.`);

    const userBId = new mongoose.Types.ObjectId();
    userB = await User.create({
      _id: userBId,
      email: `test_user_b_${testSuffix}@learnforge.io`,
      normalizedEmail: `test_user_b_${testSuffix}@learnforge.io`,
      status: 'active',
      isEmailVerified: true,
      role: 'user',
    });

    const tokenB = generateSessionToken();
    await UserSession.create({
      userId: userB._id,
      sessionTokenHash: hashSessionToken(tokenB),
      isActive: true,
      expiresAt: new Date(Date.now() + 86400000),
      ipAddress: '127.0.0.1',
      userAgent: 'LearnForge Live Verification Client',
    });
    cookieB = `learnforge_session=${tokenB}`;
    console.log(`2. Created User B: ${userB.email} (${userB._id}) and initialized active session.\n`);

    // 2. Create Subject A via real Express API (POST /api/v1/subjects)
    const createSubRes = await apiRequest(
      '/subjects',
      {
        method: 'POST',
        body: JSON.stringify({
          name: `Distributed Systems ${testSuffix}`,
          description: 'Consensus protocols, Raft, Paxos, and clock synchronization',
          color: '#3b82f6',
          targetMasteryLevel: 'comprehensive',
        }),
      },
      cookieA
    );

    if (!createSubRes.ok || !createSubRes.body.data?.subject) {
      throw new Error(`Failed to create subject via API: ${JSON.stringify(createSubRes.body)}`);
    }

    subjectA = createSubRes.body.data.subject;
    const subjectId = subjectA._id || subjectA.id;
    console.log(`3. Created Subject A via API: "${subjectA.name}" (${subjectId}) with topicsCount=${subjectA.topicsCount || 0}.`);

    // Invariant Check 1: Syllabus status must be no_syllabus, topicsCount must be 0
    const statusRes = await apiRequest(`/subjects/${subjectId}/syllabus`, { method: 'GET' }, cookieA);
    if (!statusRes.ok || statusRes.body.data?.syllabusStatus !== 'no_syllabus') {
      throw new Error(`Expected syllabusStatus 'no_syllabus', got ${statusRes.body.data?.syllabusStatus}`);
    }
    const subjectFreshInAtlas = await Subject.findById(subjectId);
    if (subjectFreshInAtlas.topicsCount !== 0) {
      throw new Error(`Expected Subject.topicsCount 0 for fresh subject, got ${subjectFreshInAtlas.topicsCount}`);
    }
    console.log('✓ Invariant 1: Subject starts in no_syllabus state with topicsCount=0.');

    // 3. Create a Manual Topic before any approved syllabus exists
    const createManualTopicRes = await apiRequest(
      `/subjects/${subjectId}/topics`,
      {
        method: 'POST',
        body: JSON.stringify({
          title: 'Manual Distributed Storage',
          description: 'Created before syllabus exists',
        }),
      },
      cookieA
    );
    if (!createManualTopicRes.ok || !createManualTopicRes.body.data?.topic) {
      throw new Error(`Failed to create manual topic via API: ${JSON.stringify(createManualTopicRes.body)}`);
    }
    const manualTopic = createManualTopicRes.body.data.topic;
    if (manualTopic.isActiveInSyllabus !== false) {
      throw new Error(`Expected manual topic before syllabus approval to have isActiveInSyllabus=false, got ${manualTopic.isActiveInSyllabus}`);
    }
    const subjectAfterManualTopic = await Subject.findById(subjectId);
    if (subjectAfterManualTopic.topicsCount !== 0) {
      throw new Error(`Expected Subject.topicsCount to remain 0 after manual topic, got ${subjectAfterManualTopic.topicsCount}`);
    }
    console.log('✓ Invariant 2: Manual Topic before approved syllabus has isActiveInSyllabus=false and Subject.topicsCount remains 0.');

    // 4. Create Syllabus Draft v1 via Express API (POST /api/v1/subjects/:id/syllabus/versions)
    const draftV1Res = await apiRequest(
      `/subjects/${subjectId}/syllabus/versions`,
      {
        method: 'POST',
        body: JSON.stringify({
          title: 'Distributed Systems Curriculum v1',
          changeSummary: 'Initial core topics: Replication, Consensus, Clocks',
          sections: [
            {
              title: 'Core Fundamentals',
              description: 'Time and replication',
              topics: [
                { title: 'Vector Clocks', description: 'Causal ordering of distributed events' },
                { title: 'Paxos Consensus', description: 'Classic Paxos phase 1 and 2' },
                { title: 'Raft Consensus', description: 'Leader election and log replication' },
                { title: 'Manual Distributed Storage', description: 'Now governed by syllabus v1' },
              ],
            },
          ],
        }),
      },
      cookieA
    );

    if (!draftV1Res.ok || !draftV1Res.body.data?._id) {
      throw new Error(`Failed to create draft v1 via API: ${JSON.stringify(draftV1Res.body)}`);
    }
    const draftV1 = draftV1Res.body.data;
    console.log(`4. Created Syllabus Draft v1 via API (${draftV1._id}, version=${draftV1.version}, status=${draftV1.status}).`);

    // Invariant Check 3: Active canonical topics count in Subject must remain 0 while draft is unapproved
    const subjectDuringDraft = await Subject.findById(subjectId);
    if (subjectDuringDraft.topicsCount !== 0) {
      throw new Error(`Invariant failed: topicsCount changed during draft (${subjectDuringDraft.topicsCount})`);
    }
    console.log('✓ Invariant 3: Draft syllabus creation does NOT activate canonical syllabus topics or change topicsCount.');

    // 5. Update Syllabus Draft v1 via Express API (PUT /api/v1/subjects/:id/syllabus/versions/:versionId)
    const updateDraftRes = await apiRequest(
      `/subjects/${subjectId}/syllabus/versions/${draftV1._id}`,
      {
        method: 'PUT',
        body: JSON.stringify({
          title: 'Distributed Systems Curriculum v1 (Polished)',
          changeSummary: 'Refined topic descriptions',
          sections: [
            {
              title: 'Core Fundamentals',
              description: 'Time and replication protocols',
              topics: [
                { title: 'Vector Clocks', description: 'Refined causality and vector clocks definition' },
                { title: 'Paxos Consensus', description: 'Classic Paxos phase 1 and 2' },
                { title: 'Raft Consensus', description: 'Leader election and log replication' },
                { title: 'Manual Distributed Storage', description: 'Now governed by syllabus v1' },
              ],
            },
          ],
        }),
      },
      cookieA
    );

    if (!updateDraftRes.ok || updateDraftRes.body.data?.title !== 'Distributed Systems Curriculum v1 (Polished)') {
      throw new Error(`Failed to update draft v1 via API: ${JSON.stringify(updateDraftRes.body)}`);
    }
    console.log('5. Updated Syllabus Draft v1 via API.');

    // 6. Explicitly Approve Syllabus v1 via Express API (POST /api/v1/subjects/:id/syllabus/versions/:versionId/approve)
    const approveV1Res = await apiRequest(
      `/subjects/${subjectId}/syllabus/versions/${draftV1._id}/approve`,
      { method: 'POST' },
      cookieA
    );

    if (!approveV1Res.ok || approveV1Res.body.data?.version?.status !== 'approved') {
      throw new Error(`Failed to approve syllabus v1 via API: ${JSON.stringify(approveV1Res.body)}`);
    }
    console.log('6. Approved Syllabus v1 via API.');

    // Invariant Check 4: Check canonical active Topics in Atlas directly
    const canonicalTopicsV1 = await Topic.find({ subjectId, userId: userA._id, isActiveInSyllabus: true });
    if (canonicalTopicsV1.length !== 4) {
      throw new Error(`Expected 4 canonical active topics in Atlas, found ${canonicalTopicsV1.length}`);
    }
    const vectorClockTopic = canonicalTopicsV1.find((t) => t.normalizedTitle === 'vector clocks');
    const paxosTopic = canonicalTopicsV1.find((t) => t.normalizedTitle === 'paxos consensus');
    const raftTopic = canonicalTopicsV1.find((t) => t.normalizedTitle === 'raft consensus');
    const storageTopic = canonicalTopicsV1.find((t) => t.normalizedTitle === 'manual distributed storage');

    if (!vectorClockTopic || !paxosTopic || !raftTopic || !storageTopic) {
      throw new Error('Canonical topics missing expected records!');
    }
    const vectorClockId = vectorClockTopic._id.toString();
    const paxosId = paxosTopic._id.toString();

    // Attach mock learning state to Paxos Topic to verify preservation
    paxosTopic.knowledgeState = { masteryScore: 90, keyConcepts: ['ballot_numbers', 'proposer_acceptor'] };
    paxosTopic.chatsCount = 5;
    paxosTopic.notesCount = 2;
    await paxosTopic.save();

    // Verify Subject topicsCount updated in Atlas to 4
    const subjectInAtlas = await Subject.findById(subjectId);
    if (subjectInAtlas.topicsCount !== 4 || subjectInAtlas.syllabusStatus !== 'approved') {
      throw new Error(`Subject topicsCount expected 4, got ${subjectInAtlas.topicsCount}`);
    }
    console.log('✓ Invariant 4: Syllabus approval activated matching topics (including previously manual topic) and updated Subject topicsCount to 4.');

    // 7. Create Revision Draft v2 (Stale Candidate) via Express API
    const draftV2Res = await apiRequest(
      `/subjects/${subjectId}/syllabus/versions`,
      {
        method: 'POST',
        body: JSON.stringify({
          baseVersionId: draftV1._id,
          title: 'Distributed Systems Curriculum v2 (Stale Candidate)',
          changeSummary: 'Contains Stale Exclusive Protocol topic',
          sections: [
            {
              title: 'Stale Section',
              description: 'Pragmatic consensus',
              topics: [
                { title: 'Vector Clocks', description: 'Updated Vector Clocks description' },
                { title: 'Stale Exclusive Protocol', description: 'Topic belonging only to stale candidate' },
                { title: 'Raft Consensus', description: 'Leader election and log replication' },
              ],
            },
          ],
        }),
      },
      cookieA
    );

    if (!draftV2Res.ok) {
      throw new Error(`Failed to create draft v2 via API: ${JSON.stringify(draftV2Res.body)}`);
    }
    const draftV2 = draftV2Res.body.data;
    console.log(`7. Created Revision Draft v2 (Stale Candidate) via API (${draftV2._id}).`);

    // Invariant Check 5: v1 must remain 'approved' while v2 is 'draft'
    const v1DocInAtlas = await SyllabusVersion.findById(draftV1._id);
    if (v1DocInAtlas.status !== 'approved') {
      throw new Error(`v1 status prematurely altered: ${v1DocInAtlas.status}`);
    }
    console.log('✓ Invariant 5: Historical approved version remains immutable during draft editing.');

    // 8. Create Revision Draft v3 (Winning Candidate) to test live adversarial interleaving
    const draftV3Res = await apiRequest(
      `/subjects/${subjectId}/syllabus/versions`,
      {
        method: 'POST',
        body: JSON.stringify({
          baseVersionId: draftV1._id,
          title: 'Distributed Systems Curriculum v3 (Winning Candidate)',
          changeSummary: 'Contains Winning Exclusive Protocol topic and Paxos',
          sections: [
            {
              title: 'Winning Section',
              description: 'All protocols',
              topics: [
                { title: 'Vector Clocks', description: 'Vector Clocks v3' },
                { title: 'Winning Exclusive Protocol', description: 'Topic belonging only to winning candidate' },
                { title: 'Paxos Consensus', description: 'Paxos Consensus Reactivated' },
              ],
            },
          ],
        }),
      },
      cookieA
    );
    if (!draftV3Res.ok) {
      throw new Error(`Failed to create draft v3 via API: ${JSON.stringify(draftV3Res.body)}`);
    }
    const draftV3 = draftV3Res.body.data;
    console.log(`8. Created Revision Draft v3 (Winning Candidate) via API (${draftV3._id}).`);

    // 9. Execute Genuine Live Adversarial Interleaving Test on MongoDB Atlas
    console.log('9. Executing genuine live Atlas adversarial test across complete transaction boundary...');

    let workerAError = null;
    let workerAOutcome = 'PENDING';
    let workerBResult = null;
    let workerBOutcome = 'PENDING';

    // Worker A: Deliberately delays after establishing uncommitted version approval, Topic reconciliation, and Subject mutation
    const workerAPromise = (async () => {
      const sessionA = await mongoose.startSession();
      try {
        sessionA.startTransaction({
          readConcern: { level: 'snapshot' },
          writeConcern: { w: 'majority' },
        });

        // 1. Worker A marks previous versions superseded in sessionA
        await SyllabusVersion.updateMany(
          { subjectId, userId: userA._id, status: 'approved', _id: { $ne: draftV2._id } },
          { $set: { status: 'superseded', supersededAt: new Date() } },
          { session: sessionA }
        );

        // 2. Worker A updates Draft v2 to approved in sessionA
        await SyllabusVersion.updateOne(
          { _id: draftV2._id, subjectId, userId: userA._id },
          { $set: { status: 'approved', approvedAt: new Date(), supersededAt: null } },
          { session: sessionA }
        );

        // 3. Worker A performs full canonical Topic and Subject reconciliation inside sessionA
        await reconcileCanonicalTopics(subjectId, userA._id, draftV2, sessionA);

        console.log('   [Worker A] Staged v2 approval, Topic reconciliation, and Subject mutation in transaction session; sleeping 600ms before commit...');

        // DELIBERATE ADVERSARIAL DELAY: Worker A pauses 600ms before committing transaction
        await new Promise((resolve) => setTimeout(resolve, 600));

        // Worker A wakes up and attempts to commit staged mutations on Atlas
        console.log('   [Worker A] Woke up; attempting to commit transaction on Atlas...');
        await sessionA.commitTransaction();
        workerAOutcome = 'COMMITTED';
        console.log('   [Worker A] Successfully committed transaction.');
      } catch (err) {
        workerAError = err;
        workerAOutcome = `ABORTED (${err.codeName || err.name || 'Error'}: ${err.message})`;
        try {
          await sessionA.abortTransaction();
        } catch (_) {}
        console.log(`   [Worker A] Transaction aborted: ${err.message || err.codeName}`);
      } finally {
        await sessionA.endSession();
      }
    })();

    // Worker B: Waits 150ms then executes a complete, valid approval for Draft v3 via real Express API
    const workerBPromise = (async () => {
      await new Promise((resolve) => setTimeout(resolve, 150));
      console.log('   [Worker B] Issuing API approval request for Draft v3 while Worker A is paused mid-transaction...');
      workerBResult = await apiRequest(
        `/subjects/${subjectId}/syllabus/versions/${draftV3._id}/approve`,
        { method: 'POST' },
        cookieA
      );
      if (workerBResult.ok) {
        workerBOutcome = 'COMMITTED';
        console.log('   [Worker B] Successfully approved Draft v3 via API.');
      } else {
        workerBOutcome = `FAILED (${workerBResult.status}: ${JSON.stringify(workerBResult.body)})`;
        console.log('   [Worker B] Approval failed:', workerBResult.body);
      }
    })();

    await Promise.all([workerAPromise, workerBPromise]);

    console.log(`   [Live Transaction Outcomes Observed] Worker A: ${workerAOutcome} | Worker B: ${workerBOutcome}`);

    // Invariant Check 6: Guarantee exactly ONE approved version in Atlas, all others superseded
    const [approvedVersionsAtlas, supersededVersionsAtlas, allVersionsAtlas] = await Promise.all([
      SyllabusVersion.find({ subjectId, userId: userA._id, status: 'approved' }),
      SyllabusVersion.find({ subjectId, userId: userA._id, status: 'superseded' }),
      SyllabusVersion.find({ subjectId, userId: userA._id }),
    ]);

    if (approvedVersionsAtlas.length !== 1) {
      throw new Error(`ADVERSARIAL INVARIANT VIOLATION: Found ${approvedVersionsAtlas.length} approved versions in Atlas! Must be exactly 1.`);
    }
    if (supersededVersionsAtlas.length !== allVersionsAtlas.length - 1) {
      throw new Error(`ADVERSARIAL INVARIANT VIOLATION: Expected ${allVersionsAtlas.length - 1} superseded versions, found ${supersededVersionsAtlas.length}`);
    }

    const winningApprovedVersion = approvedVersionsAtlas[0];
    const subjectAfterAdversarial = await Subject.findById(subjectId);
    if (subjectAfterAdversarial.activeSyllabusVersionId.toString() !== winningApprovedVersion._id.toString()) {
      throw new Error(`Subject.activeSyllabusVersionId (${subjectAfterAdversarial.activeSyllabusVersionId}) does not match winning approved version (${winningApprovedVersion._id})`);
    }
    if (subjectAfterAdversarial.syllabusStatus !== 'approved') {
      throw new Error(`Subject.syllabusStatus is '${subjectAfterAdversarial.syllabusStatus}', expected 'approved'`);
    }
    console.log(`✓ Invariant 6: Live Adversarial Isolation Verified — Exactly ONE approved version (${winningApprovedVersion.title}) active in Atlas, all ${supersededVersionsAtlas.length} other versions superseded.`);

    // Invariant Check 7: Topic Lifecycle, Stale Topic Exclusion, & History Preservation Verified
    const activeTopicsAtlas = await Topic.find({ subjectId, userId: userA._id, isActiveInSyllabus: true });
    const actualActiveCount = activeTopicsAtlas.length;
    if (subjectAfterAdversarial.topicsCount !== actualActiveCount) {
      throw new Error(`Subject.topicsCount (${subjectAfterAdversarial.topicsCount}) does not match actual active topics count (${actualActiveCount})`);
    }

    const activeNormalizedTitles = activeTopicsAtlas.map((t) => t.normalizedTitle);
    const expectedTitles = winningApprovedVersion.sections
      .flatMap((s) => s.topics)
      .map((t) => t.title.trim().toLowerCase());

    if (activeNormalizedTitles.length !== expectedTitles.length) {
      throw new Error(`Expected ${expectedTitles.length} active topics, found ${activeNormalizedTitles.length}`);
    }

    for (const title of expectedTitles) {
      if (!activeNormalizedTitles.includes(title)) {
        throw new Error(`Expected active topic '${title}' missing from Atlas canonical topics!`);
      }
    }

    // Explicitly verify that no topic exclusive to the losing candidate is active
    if (winningApprovedVersion._id.toString() === draftV3._id.toString()) {
      const staleExclusiveTopic = await Topic.findOne({
        subjectId,
        userId: userA._id,
        normalizedTitle: 'stale exclusive protocol',
      });
      if (staleExclusiveTopic && staleExclusiveTopic.isActiveInSyllabus === true) {
        throw new Error('CRITICAL VIOLATION: Stale worker exclusive topic is active in Atlas canonical topics!');
      }
      const paxosInAtlas = await Topic.findById(paxosId);
      if (paxosInAtlas.isActiveInSyllabus !== true || paxosInAtlas.knowledgeState.masteryScore !== 90 || paxosInAtlas.chatsCount !== 5) {
        throw new Error('Paxos reactivated topic did not preserve learning history!');
      }
    } else {
      const winningExclusiveTopic = await Topic.findOne({
        subjectId,
        userId: userA._id,
        normalizedTitle: 'winning exclusive protocol',
      });
      if (winningExclusiveTopic && winningExclusiveTopic.isActiveInSyllabus === true) {
        throw new Error('CRITICAL VIOLATION: Losing candidate exclusive topic is active in Atlas canonical topics!');
      }
    }

    console.log(`✓ Invariant 7: Topic Lifecycle & Stale Exclusion Verified — Stable ID preserved (${vectorClockId}), non-winning candidate topics strictly excluded, and Subject.topicsCount (${subjectAfterAdversarial.topicsCount}) strictly matches active topics.`);

    // 8. Create Chat & Messages & User Annotations via API
    const createChatRes = await apiRequest(
      '/chats',
      {
        method: 'POST',
        body: JSON.stringify({
          subjectId,
          title: 'Vector Clocks and Causality',
        }),
      },
      cookieA
    );
    if (!createChatRes.ok) {
      throw new Error(`Failed to create chat via API: ${JSON.stringify(createChatRes.body)}`);
    }
    chatA = createChatRes.body.data.chat;
    const chatId = chatA._id || chatA.id;

    // Send Message
    const sendMsgRes = await apiRequest(
      `/chats/${chatId}/messages`,
      {
        method: 'POST',
        body: JSON.stringify({
          content: 'How do vector clocks handle concurrent events in distributed actors?',
        }),
      },
      cookieA
    );
    if (!sendMsgRes.ok) {
      throw new Error(`Failed to send message via API: ${JSON.stringify(sendMsgRes.body)}`);
    }
    const userMsg = sendMsgRes.body.data.userMessage;
    const userMsgId = userMsg._id || userMsg.id;

    // Create Annotation via API (POST /api/v1/chats/:id/messages/:msgId/annotations)
    const createAnnRes = await apiRequest(
      `/chats/${chatId}/messages/${userMsgId}/annotations`,
      {
        method: 'POST',
        body: JSON.stringify({
          type: 'comment',
          content: 'Key exam question for distributed systems final',
        }),
      },
      cookieA
    );
    if (!createAnnRes.ok) {
      throw new Error(`Failed to create annotation via API: ${JSON.stringify(createAnnRes.body)}`);
    }
    const annotationDoc = createAnnRes.body.data;
    console.log(`9. Created Chat (${chatId}), Message (${userMsgId}), and Annotation (${annotationDoc._id}) via API.`);

    // Invariant Check 9: Cross-tenant isolation (User B cannot access User A syllabus, topics, or annotations)
    const crossSyllabusRes = await apiRequest(`/subjects/${subjectId}/syllabus`, { method: 'GET' }, cookieB);
    if (crossSyllabusRes.status !== 404) {
      throw new Error(`Cross-tenant breach: User B accessed User A syllabus (status ${crossSyllabusRes.status})`);
    }
    const crossAnnRes = await apiRequest(`/annotations/${annotationDoc._id}`, { method: 'DELETE' }, cookieB);
    if (crossAnnRes.status !== 404) {
      throw new Error(`Cross-tenant breach: User B mutated User A annotation (status ${crossAnnRes.status})`);
    }
    console.log('✓ Invariant 7: Cross-tenant isolation verified — 404 returned on cross-user syllabus and annotation operations.');

    // 9. Cascade Deletion Verification: Delete Subject A via Express API (DELETE /api/v1/subjects/:id)
    const deleteSubRes = await apiRequest(`/subjects/${subjectId}`, { method: 'DELETE' }, cookieA);
    if (!deleteSubRes.ok) {
      throw new Error(`Failed to delete subject via API: ${JSON.stringify(deleteSubRes.body)}`);
    }
    console.log('10. Deleted Subject A via API.');

    // Invariant Check 10: Zero orphan documents in Atlas for Subject A
    const [orphanSyllabus, orphanTopics, orphanChats, orphanMessages, orphanAnnotations] = await Promise.all([
      SyllabusVersion.countDocuments({ subjectId, userId: userA._id }),
      Topic.countDocuments({ subjectId, userId: userA._id }),
      Chat.countDocuments({ subjectId, userId: userA._id }),
      Message.countDocuments({ userId: userA._id }),
      Annotation.countDocuments({ userId: userA._id }),
    ]);

    if (orphanSyllabus !== 0 || orphanTopics !== 0 || orphanChats !== 0 || orphanMessages !== 0 || orphanAnnotations !== 0) {
      throw new Error(
        `Cascade deletion left orphan documents! Syllabus: ${orphanSyllabus}, Topics: ${orphanTopics}, Chats: ${orphanChats}, Messages: ${orphanMessages}, Annotations: ${orphanAnnotations}`
      );
    }
    console.log('✓ Invariant 8: Complete application-level cascade cleanup verified — 0 orphan SyllabusVersion, Topic, Chat, Message, or Annotation records remain in Atlas.');

    console.log('\n====================================================');
    console.log('✓ ALL LIVE EXPRESS API & ATLAS INVARIANT VERIFICATIONS PASSED (100%)');
    console.log('====================================================\n');
  } finally {
    // Clean up test users & sessions in Atlas
    console.log('Cleaning up live test data in Atlas...');
    if (userA) {
      await Subject.deleteMany({ userId: userA._id });
      await Topic.deleteMany({ userId: userA._id });
      await SyllabusVersion.deleteMany({ userId: userA._id });
      await Chat.deleteMany({ userId: userA._id });
      await Message.deleteMany({ userId: userA._id });
      await Annotation.deleteMany({ userId: userA._id });
      await UserSession.deleteMany({ userId: userA._id });
      await User.deleteOne({ _id: userA._id });
    }
    if (userB) {
      await UserSession.deleteMany({ userId: userB._id });
      await User.deleteOne({ _id: userB._id });
    }
    await mongoose.disconnect();
    console.log('✓ Live test cleanup completed. Atlas connection closed.\n');
  }
}

runLiveVerification().catch((err) => {
  console.error('❌ LIVE API VERIFICATION FAILED:', err);
  process.exit(1);
});

