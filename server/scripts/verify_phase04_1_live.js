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

    // Invariant Check 1: Syllabus status must be no_syllabus
    const statusRes = await apiRequest(`/subjects/${subjectId}/syllabus`, { method: 'GET' }, cookieA);
    if (!statusRes.ok || statusRes.body.data?.syllabusStatus !== 'no_syllabus') {
      throw new Error(`Expected syllabusStatus 'no_syllabus', got ${statusRes.body.data?.syllabusStatus}`);
    }
    console.log('✓ Invariant 1: Subject starts in no_syllabus state without blocking creation or requiring a syllabus upfront.');

    // 3. Create Syllabus Draft v1 via Express API (POST /api/v1/subjects/:id/syllabus/versions)
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

    // Invariant Check 2: Canonical topics must remain 0 while draft is unapproved
    const topicsDuringDraft = await Topic.countDocuments({ subjectId, userId: userA._id });
    if (topicsDuringDraft !== 0) {
      throw new Error(`Invariant failed: Canonical topics created prematurely during draft (${topicsDuringDraft})`);
    }
    console.log('✓ Invariant 2: Draft syllabus creation does NOT create canonical Topic documents.');

    // 4. Update Syllabus Draft v1 via Express API (PUT /api/v1/subjects/:id/syllabus/versions/:versionId)
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

    // 5. Explicitly Approve Syllabus v1 via Express API (POST /api/v1/subjects/:id/syllabus/versions/:versionId/approve)
    const approveV1Res = await apiRequest(
      `/subjects/${subjectId}/syllabus/versions/${draftV1._id}/approve`,
      { method: 'POST' },
      cookieA
    );

    if (!approveV1Res.ok || approveV1Res.body.data?.version?.status !== 'approved') {
      throw new Error(`Failed to approve syllabus v1 via API: ${JSON.stringify(approveV1Res.body)}`);
    }
    console.log('6. Approved Syllabus v1 via API.');

    // Invariant Check 3: Check canonical Topics in Atlas directly
    const canonicalTopicsV1 = await Topic.find({ subjectId, userId: userA._id });
    if (canonicalTopicsV1.length !== 3) {
      throw new Error(`Expected 3 canonical topics in Atlas, found ${canonicalTopicsV1.length}`);
    }
    const vectorClockTopic = canonicalTopicsV1.find((t) => t.normalizedTitle === 'vector clocks');
    const paxosTopic = canonicalTopicsV1.find((t) => t.normalizedTitle === 'paxos consensus');
    const raftTopic = canonicalTopicsV1.find((t) => t.normalizedTitle === 'raft consensus');

    if (!vectorClockTopic || !paxosTopic || !raftTopic) {
      throw new Error('Canonical topics missing expected records!');
    }
    const vectorClockId = vectorClockTopic._id.toString();
    const paxosId = paxosTopic._id.toString();

    // Attach mock learning state to Paxos Topic to verify preservation
    paxosTopic.knowledgeState = { masteryScore: 90, keyConcepts: ['ballot_numbers', 'proposer_acceptor'] };
    paxosTopic.chatsCount = 5;
    paxosTopic.notesCount = 2;
    await paxosTopic.save();

    // Verify Subject topicsCount updated in Atlas to 3
    const subjectInAtlas = await Subject.findById(subjectId);
    if (subjectInAtlas.topicsCount !== 3 || subjectInAtlas.syllabusStatus !== 'approved') {
      throw new Error(`Subject topicsCount expected 3, got ${subjectInAtlas.topicsCount}`);
    }
    console.log('✓ Invariant 3: Syllabus approval reconciled 3 canonical active topics and updated Subject topicsCount to 3.');

    // 6. Create Revision Draft v2 via Express API removing Paxos (simulating curriculum change)
    const draftV2Res = await apiRequest(
      `/subjects/${subjectId}/syllabus/versions`,
      {
        method: 'POST',
        body: JSON.stringify({
          baseVersionId: draftV1._id,
          title: 'Distributed Systems Curriculum v2',
          changeSummary: 'Removed Paxos in favor of Raft and Byzantine Agreement',
          sections: [
            {
              title: 'Modern Consensus',
              description: 'Pragmatic consensus',
              topics: [
                { title: 'Vector Clocks', description: 'Updated Vector Clocks description' },
                { title: 'Raft Consensus', description: 'Leader election and log replication' },
                { title: 'Byzantine Fault Tolerance', description: 'PBFT and 3f+1 resilience' },
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
    console.log(`7. Created Revision Draft v2 via API (${draftV2._id}).`);

    // Invariant Check 4: v1 must remain 'approved' while v2 is 'draft'
    const v1DocInAtlas = await SyllabusVersion.findById(draftV1._id);
    if (v1DocInAtlas.status !== 'approved') {
      throw new Error(`v1 status prematurely altered: ${v1DocInAtlas.status}`);
    }
    console.log('✓ Invariant 4: Historical approved version remains immutable during draft editing.');

    // 7. Approve Syllabus v2 via Express API
    const approveV2Res = await apiRequest(
      `/subjects/${subjectId}/syllabus/versions/${draftV2._id}/approve`,
      { method: 'POST' },
      cookieA
    );

    if (!approveV2Res.ok) {
      throw new Error(`Failed to approve syllabus v2 via API: ${JSON.stringify(approveV2Res.body)}`);
    }
    console.log('8. Approved Syllabus v2 via API.');

    // Invariant Check 5: v1 superseded, v2 approved, exactly ONE active approved version
    const approvedVersionsCount = await SyllabusVersion.countDocuments({ subjectId, userId: userA._id, status: 'approved' });
    if (approvedVersionsCount !== 1) {
      throw new Error(`Expected exactly 1 active approved version, found ${approvedVersionsCount}`);
    }
    const v1After = await SyllabusVersion.findById(draftV1._id);
    if (v1After.status !== 'superseded' || !v1After.supersededAt) {
      throw new Error('v1 was not properly marked as superseded!');
    }
    console.log('✓ Invariant 5: Concurrency invariant held — exactly one approved version active, previous version marked superseded.');

    // Invariant Check 6: Removed topic (Paxos) preserved with historical status and retained learning data
    const paxosInAtlas = await Topic.findById(paxosId);
    if (paxosInAtlas.isActiveInSyllabus !== false) {
      throw new Error(`Expected Paxos topic to be marked isActiveInSyllabus=false, got ${paxosInAtlas.isActiveInSyllabus}`);
    }
    if (paxosInAtlas.knowledgeState.masteryScore !== 90 || paxosInAtlas.chatsCount !== 5) {
      throw new Error('Learning history/knowledgeState was lost during topic retirement!');
    }

    // Invariant Check 7: Stable Topic ID preserved for Vector Clocks
    const vectorClockInAtlas = await Topic.findOne({ subjectId, normalizedTitle: 'vector clocks' });
    if (vectorClockInAtlas._id.toString() !== vectorClockId) {
      throw new Error('Vector Clocks topic ID changed!');
    }

    // Invariant Check 8: Subject.topicsCount reflects ONLY active syllabus topics (3: Vector Clocks, Raft, BFT)
    const subjectAfterV2 = await Subject.findById(subjectId);
    if (subjectAfterV2.topicsCount !== 3) {
      throw new Error(`Subject.topicsCount expected 3 active topics, got ${subjectAfterV2.topicsCount}`);
    }
    console.log(`✓ Invariant 6: Topic Lifecycle Verified — Stable ID preserved (${vectorClockId}), retired topic (${paxosId}) marked historical with learning state preserved, and Subject.topicsCount (${subjectAfterV2.topicsCount}) counts active topics.`);

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

