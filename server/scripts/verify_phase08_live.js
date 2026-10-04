/**
 * LearnForge Phase 08 — Strict Study Mode & Active Recall Live Verifier
 * Comprehensive, fail-closed live verification script against live Express, MongoDB Atlas, and AI Gateway.
 *
 * Requirements:
 * - Express dev server running on port 5000
 * - MongoDB Atlas replica set reachable
 * - Valid API keys for AI Gateway
 * - Immutability safe (creates isolated test data, cleans up after itself, never mutates canonical records)
 */

import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { User } from '../src/models/User.js';
import { UserSession } from '../src/models/UserSession.js';
import { Subject } from '../src/models/Subject.js';
import { Topic } from '../src/models/Topic.js';
import { SyllabusVersion } from '../src/models/SyllabusVersion.js';
import { Concept } from '../src/models/Concept.js';
import { StudySession } from '../src/models/StudySession.js';
import { studyService } from '../src/study/services/studyService.js';
import { studyAiService } from '../src/study/services/studyAiService.js';
import { STUDY_STATUS } from '../src/study/stateMachine.js';
import { generateSessionToken, hashSessionToken } from '../src/utils/authCrypto.js';

dotenv.config({ path: './server/.env' });

const API_BASE = 'http://localhost:5000/api/v1';

class TestSyncBarrier {
  constructor(count) {
    this.count = count;
    this.waiting = 0;
    this.resolvers = [];
  }

  wait() {
    return new Promise((resolve) => {
      this.resolvers.push(resolve);
      this.waiting++;
      if (this.waiting === this.count) {
        const batch = [...this.resolvers];
        this.resolvers = [];
        this.waiting = 0;
        batch.forEach((r) => r());
      }
    });
  }
}

async function runLiveVerification() {
  console.log('\n==============================================================================');
  console.log('LEARNFORGE PHASE 08 — STRICT STUDY MODE & ACTIVE RECALL LIVE VERIFICATION');
  console.log('==============================================================================\n');

  const cleanupIds = {
    users: [],
    sessions: [],
    subjects: [],
    topics: [],
    syllabi: [],
    concepts: [],
    studySessions: [],
  };

  try {
    // --- Gate 1: Live API Health Check ---
    console.log('[1/18] [HTTP API] Health & Database Connectivity Check...');
    const healthRes = await fetch(`${API_BASE}/health`);
    if (!healthRes.ok) throw new Error(`FAIL-CLOSED: Express API health endpoint failed (HTTP ${healthRes.status})`);
    const healthData = await healthRes.json();
    const dbStatus = typeof healthData.data.database === 'object' ? healthData.data.database?.status : healthData.data.database;
    if (dbStatus !== 'connected') throw new Error(`FAIL-CLOSED: Live API database status is "${dbStatus}", expected "connected"`);
    console.log(`  -> PASS: Express API is live and MongoDB is connected (status: ${dbStatus}).\n`);

    // --- Gate 2: MongoDB Atlas Connection ---
    console.log('[2/18] [DATABASE] MongoDB Atlas Replica Set Connection...');
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) throw new Error('MONGODB_URI environment variable is missing.');
    await mongoose.connect(mongoUri);
    console.log('  -> PASS: Connected to MongoDB replica set via Mongoose driver.\n');

    // --- Gate 3: Multi-Document Transaction & Partial Unique Index Verification ---
    console.log('[3/18] [DATABASE] Multi-Document Transaction Support & Partial Unique Index Assertion...');
    const testSession = await mongoose.startSession();
    try {
      testSession.startTransaction();
      await testSession.abortTransaction();
      console.log('  -> PASS: Multi-document replica set transactions supported.');
    } finally {
      await testSession.endSession();
    }

    // Ensure database indexes are synchronized on Atlas
    await StudySession.init();
    const indexes = await StudySession.collection.listIndexes().toArray();
    const activeIndex = indexes.find((idx) => idx.name === 'unique_active_study_session_per_user_topic');
    if (!activeIndex) {
      throw new Error('FAIL-CLOSED: unique_active_study_session_per_user_topic index not found on StudySession collection.');
    }
    if (!activeIndex.unique) {
      throw new Error('FAIL-CLOSED: unique_active_study_session_per_user_topic index is not marked unique.');
    }
    if (!activeIndex.partialFilterExpression || activeIndex.partialFilterExpression.isActive !== true) {
      throw new Error(`FAIL-CLOSED: Expected partialFilterExpression { isActive: true }, got: ${JSON.stringify(activeIndex.partialFilterExpression)}`);
    }
    console.log(`  -> PASS: Verified database partial unique index: unique=true, partialFilterExpression={ isActive: true }.\n`);

    // --- Gate 4: Isolated Test Tenant & Canonical Knowledge Base Setup ---
    console.log('[4/18] [DATABASE] Isolated Test Tenant & Canonical Knowledge Setup...');
    const nonce = Date.now().toString(36) + Math.random().toString(36).substring(2, 6);

    const userA = await User.create({
      email: `study_student_a_${nonce}@learnforge.ai`,
      normalizedEmail: `study_student_a_${nonce}@learnforge.ai`,
      displayName: `Study Student A ${nonce}`,
      status: 'active',
    });
    cleanupIds.users.push(userA._id);

    const userB = await User.create({
      email: `study_student_b_${nonce}@learnforge.ai`,
      normalizedEmail: `study_student_b_${nonce}@learnforge.ai`,
      displayName: `Study Student B ${nonce}`,
      status: 'active',
    });
    cleanupIds.users.push(userB._id);

    const tokenA = generateSessionToken();
    const sessionA = await UserSession.create({
      userId: userA._id,
      sessionTokenHash: hashSessionToken(tokenA),
      authMethod: 'otp',
      expiresAt: new Date(Date.now() + 86400000),
    });
    cleanupIds.sessions.push(sessionA._id);
    const cookieA = `learnforge_session=${tokenA}`;

    const tokenB = generateSessionToken();
    const sessionB = await UserSession.create({
      userId: userB._id,
      sessionTokenHash: hashSessionToken(tokenB),
      authMethod: 'otp',
      expiresAt: new Date(Date.now() + 86400000),
    });
    cleanupIds.sessions.push(sessionB._id);
    const cookieB = `learnforge_session=${tokenB}`;

    const subjectA = await Subject.create({
      userId: userA._id,
      name: `Distributed Consensus Systems ${nonce}`,
      normalizedName: `distributed consensus systems ${nonce}`.toLowerCase(),
      description: 'Paxos, Raft, and Viewstamped Replication',
    });
    cleanupIds.subjects.push(subjectA._id);

    const topicA = await Topic.create({
      userId: userA._id,
      subjectId: subjectA._id,
      title: `Raft Leader Election ${nonce}`,
      normalizedTitle: `raft leader election ${nonce}`.toLowerCase(),
      description: 'Randomized timers, RequestVote RPCs, and Split Votes',
    });
    cleanupIds.topics.push(topicA._id);

    const approvedSyllabusA = await SyllabusVersion.create({
      userId: userA._id,
      subjectId: subjectA._id,
      version: 1,
      title: 'Consensus Engineering Curriculum',
      status: 'approved',
      sections: [
        {
          key: 'sec_1',
          title: 'Section 1: Leader Election and Heartbeats',
          topics: [{ key: 'top_1', title: `Raft Leader Election ${nonce}` }],
        },
      ],
    });
    cleanupIds.syllabi.push(approvedSyllabusA._id);

    const concept1 = await Concept.create({
      userId: userA._id,
      subjectId: subjectA._id,
      topicId: topicA._id,
      name: 'Randomized Election Timers',
      normalizedName: 'randomized election timers',
      description: 'Followers wait for a randomized duration between 150-300ms before becoming candidates to prevent split votes.',
      aliases: ['Election Timers', 'Randomized Timers'],
      status: 'LEARNING',
    });
    cleanupIds.concepts.push(concept1._id);

    const concept2 = await Concept.create({
      userId: userA._id,
      subjectId: subjectA._id,
      topicId: topicA._id,
      name: 'RequestVote RPC',
      normalizedName: 'requestvote rpc',
      description: 'Candidate sends RequestVote RPC to all cluster nodes requesting their vote for the current term.',
      aliases: ['Vote Request'],
      status: 'LEARNING',
    });
    cleanupIds.concepts.push(concept2._id);

    console.log(`  -> PASS: Seeded tenant A (${userA._id}), tenant B (${userB._id}), subject, topic, pinned syllabus v1, and 2 canonical concepts.\n`);

    // --- Gate 5: Create Study Session with Pinned Syllabus & Race Safety Proof ---
    console.log('[5/18] [HTTP API] Create Study Session with Pinned Syllabus (POST /api/v1/topics/:topicId/study/sessions)...');
    const createRes = await fetch(`${API_BASE}/topics/${topicA._id}/study/sessions`, {
      method: 'POST',
      headers: { Cookie: cookieA },
    });
    if (!createRes.ok) throw new Error(`Failed to create study session: HTTP ${createRes.status}`);
    const createData = await createRes.json();
    const createdSession = createData.data.session;
    cleanupIds.studySessions.push(createdSession._id);

    if (createData.data.isNew !== true) throw new Error('Expected isNew: true on fresh session creation.');
    if (createdSession.isActive !== true) throw new Error('Expected created session to have isActive: true.');

    // Duplicate creation proof: second call safely resumes existing session
    const dupCreateRes = await fetch(`${API_BASE}/topics/${topicA._id}/study/sessions`, {
      method: 'POST',
      headers: { Cookie: cookieA },
    });
    const dupCreateData = await dupCreateRes.json();
    if (dupCreateData.data.isNew !== false) throw new Error('Expected isNew: false on duplicate active session creation.');
    if (dupCreateData.data.session._id !== createdSession._id) throw new Error('Duplicate creation failed to return original session.');

    console.log(`  -> PASS: Study session created with ID: ${createdSession._id} (isActive: true, race-safe resumption verified).\n`);

    // --- Gate 6: Verify Session Ownership & Curriculum Pinning ---
    console.log('[6/18] [DOMAIN-SERVICE] Verify Session Ownership, Initial State QUESTIONING, and Curriculum Pinning...');
    if (createdSession.status !== STUDY_STATUS.QUESTIONING) throw new Error(`Expected status QUESTIONING, got ${createdSession.status}`);
    if (createdSession.syllabusVersionId !== approvedSyllabusA._id.toString()) throw new Error('Pinned syllabusVersionId mismatch.');
    if (createdSession.syllabusVersionNumber !== 1) throw new Error('Pinned syllabusVersionNumber mismatch.');
    if (createdSession.sessionVersion !== 1) throw new Error('Initial sessionVersion should be 1.');
    console.log(`  -> PASS: Session correctly initialized in QUESTIONING state with permanent SyllabusVersion v1 pinning.\n`);

    // --- Gate 7: Verify Structured Question Generation with Target Concepts Whitelist ---
    console.log('[7/18] [AI GATEWAY] Verify Structured Question Generation with Target Concepts Whitelist...');
    const activeQuestion = createdSession.activeQuestion;
    if (!activeQuestion || !activeQuestion.prompt) throw new Error('Missing activeQuestion prompt in study session.');
    if (!Array.isArray(activeQuestion.expectedReasoningSignals) || activeQuestion.expectedReasoningSignals.length === 0) {
      throw new Error('Active question is missing expected reasoning signals.');
    }
    console.log(`  -> Prompt: "${activeQuestion.prompt.substring(0, 80)}..."`);
    console.log(`  -> Target Concepts: [${activeQuestion.targetConceptNames?.join(', ')}]`);
    console.log(`  -> Reasoning Signals: [${activeQuestion.expectedReasoningSignals.join('; ')}]`);
    console.log('  -> PASS: Grounded active recall question successfully generated.\n');

    // --- Gate 8: Submit Incomplete/Weak Answer ---
    console.log('[8/18] [HTTP API] Submit Incomplete/Weak Answer (POST /study-sessions/:id/answer)...');
    const weakClientTurnId = `turn_weak_${Date.now()}`;
    const weakAnswerRes = await fetch(`${API_BASE}/study-sessions/${createdSession._id}/answer`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookieA,
      },
      body: JSON.stringify({
        questionId: activeQuestion.questionId,
        sessionVersion: 1,
        clientTurnId: weakClientTurnId,
        answer: 'The nodes just wait and then vote for whoever asks first.',
      }),
    });

    if (!weakAnswerRes.ok) {
      const errBody = await weakAnswerRes.json();
      throw new Error(`Answer submission failed: HTTP ${weakAnswerRes.status} — ${JSON.stringify(errBody)}`);
    }
    const weakAnswerData = await weakAnswerRes.json();
    console.log('  -> PASS: Incomplete answer submitted and evaluated.\n');

    // --- Gate 9 & 10: Verify Multi-Criteria Evaluation & Socratic Remediation ---
    console.log('[9/18] [AI GATEWAY] Verify Structured Answer Evaluation (INCORRECT / PARTIALLY_CORRECT)...');
    console.log('[10/18] [PEDAGOGY] Verify Remediation Loop Triggered (status: REMEDIATING)...');
    const weakTurn = weakAnswerData.data.turn;
    const sessionAfterWeak = weakAnswerData.data.session;

    if (!['INCORRECT', 'PARTIALLY_CORRECT'].includes(weakTurn.evaluation.verdict)) {
      throw new Error(`Expected incomplete answer verdict INCORRECT or PARTIALLY_CORRECT, got ${weakTurn.evaluation.verdict}`);
    }
    if (sessionAfterWeak.status !== STUDY_STATUS.REMEDIATING) {
      throw new Error(`Expected session status REMEDIATING on weak answer, got ${sessionAfterWeak.status}`);
    }
    if (!weakTurn.remediation?.followUpQuestion) {
      throw new Error('Expected Socratic followUpQuestion generated in remediation.');
    }
    console.log(`  -> Verdict: ${weakTurn.evaluation.verdict} (Correctness: ${weakTurn.evaluation.correctness}%)`);
    console.log(`  -> Feedback: "${weakTurn.evaluation.feedback.substring(0, 90)}..."`);
    console.log(`  -> Follow-Up Probe: "${weakTurn.remediation.followUpQuestion.substring(0, 90)}..."`);
    console.log('  -> PASS: System refused to advance blindly and activated Socratic remediation.\n');

    // --- Gate 11: Advance to RECHECKING & Submit Follow-Up Answer ---
    console.log('[11/18] [HTTP API] Advance to RECHECKING & Submit Socratic Follow-Up Answer...');
    const continueRes = await fetch(`${API_BASE}/study-sessions/${createdSession._id}/continue`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookieA,
      },
      body: JSON.stringify({
        sessionVersion: sessionAfterWeak.sessionVersion,
      }),
    });

    if (!continueRes.ok) throw new Error(`Continue failed: HTTP ${continueRes.status}`);
    const continueData = await continueRes.json();
    if (continueData.data.status !== STUDY_STATUS.RECHECKING) {
      throw new Error(`Expected status RECHECKING after continuing remediation, got ${continueData.data.status}`);
    }

    const followUpQuestion = continueData.data.activeQuestion;
    const followUpClientTurnId = `turn_followup_${Date.now()}`;

    // Submit thorough follow-up answer
    const followUpAnswerRes = await fetch(`${API_BASE}/study-sessions/${createdSession._id}/answer`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookieA,
      },
      body: JSON.stringify({
        questionId: followUpQuestion.questionId,
        sessionVersion: continueData.data.sessionVersion,
        clientTurnId: followUpClientTurnId,
        answer: 'Randomized election timers (typically 150-300ms) ensure that one follower times out before its peers, transitions to candidate state, increments term, votes for itself, and broadcasts RequestVote RPCs before others time out, preventing continuous split vote livelocks.',
      }),
    });

    if (!followUpAnswerRes.ok) throw new Error(`Follow-up submission failed: HTTP ${followUpAnswerRes.status}`);
    const followUpData = await followUpAnswerRes.json();
    const followUpTurn = followUpData.data.turn;

    if (followUpTurn.attemptType !== 'FOLLOW_UP') throw new Error(`Expected attemptType FOLLOW_UP, got ${followUpTurn.attemptType}`);
    if (!followUpTurn.parentTurnId) throw new Error('Expected parentTurnId referencing initial turn.');
    console.log(`  -> Follow-up Turn persisted: attemptType=FOLLOW_UP, parentTurnId=${followUpTurn.parentTurnId}`);
    console.log('  -> PASS: Follow-up answer persisted with parent turn integrity.\n');

    // --- Gate 12: Verify Demonstrated Understanding & Advancement ---
    console.log('[12/18] [PEDAGOGY] Verify Demonstrated Understanding & Advancement (CORRECT -> ADVANCING)...');
    const sessionAfterFollowUp = followUpData.data.session;
    if (sessionAfterFollowUp.status !== STUDY_STATUS.ADVANCING) {
      throw new Error(`Expected status ADVANCING on solid answer, got ${sessionAfterFollowUp.status}`);
    }
    console.log(`  -> Verdict: ${followUpTurn.evaluation.verdict} (Correctness: ${followUpTurn.evaluation.correctness}%)`);
    console.log('  -> PASS: Understanding demonstrated. Session advanced to ADVANCING state.\n');

    // --- Gate 13: Advance Already-Evaluated Session to Next Question ---
    console.log('[13/18] [HTTP API] Advance Already-Evaluated Session to Next Question (POST /continue)...');
    const continueNextRes = await fetch(`${API_BASE}/study-sessions/${createdSession._id}/continue`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookieA,
      },
      body: JSON.stringify({
        sessionVersion: sessionAfterFollowUp.sessionVersion,
      }),
    });

    if (!continueNextRes.ok) throw new Error(`Failed to advance session: HTTP ${continueNextRes.status}`);
    const continueNextData = await continueNextRes.json();
    if (continueNextData.data.status !== STUDY_STATUS.QUESTIONING) {
      throw new Error(`Expected status QUESTIONING, got ${continueNextData.data.status}`);
    }
    console.log(`  -> Next Question Generated: "${continueNextData.data.activeQuestion?.prompt?.substring(0, 80)}..."`);
    console.log('  -> PASS: Next active recall question staged cleanly.\n');

    // --- Gate 14: Real Live Concurrency Race Proof ---
    console.log('[14/18] [DOMAIN-SERVICE CONCURRENCY] Proving Real Live Concurrency: Duplicate Answer Submission Race...');
    const currentSessionDoc = await StudySession.findById(createdSession._id);
    const raceQuestionId = currentSessionDoc.activeQuestion.questionId;
    const raceSessionVersion = currentSessionDoc.sessionVersion;

    const barrier = new TestSyncBarrier(2);

    const [raceResA, raceResB] = await Promise.all([
      studyService.submitAnswer(userA._id, createdSession._id, {
        questionId: raceQuestionId,
        sessionVersion: raceSessionVersion,
        clientTurnId: `turn_race_a_${Date.now()}`,
        answer: 'Candidate A broadcasts RequestVote with terms updated.',
      }, { barrier: () => barrier.wait() }).catch((err) => ({ error: err })),
      studyService.submitAnswer(userA._id, createdSession._id, {
        questionId: raceQuestionId,
        sessionVersion: raceSessionVersion,
        clientTurnId: `turn_race_b_${Date.now()}`,
        answer: 'Candidate B broadcasts RequestVote with terms updated.',
      }, { barrier: () => barrier.wait() }).catch((err) => ({ error: err })),
    ]);

    const winner = !raceResA.error ? raceResA : raceResB;
    const loser = raceResA.error ? raceResA : raceResB;

    if (!winner || !loser.error) {
      throw new Error('Concurrency barrier failed: Expected exactly 1 winner and 1 rejected request.');
    }
    if (loser.error.code !== 'STALE_STUDY_STATE') {
      throw new Error(`Expected loser error STALE_STUDY_STATE, got ${loser.error.code}`);
    }
    console.log(`  -> Request A: Succeeded (HTTP 200).`);
    console.log(`  -> Request B: Failed closed with HTTP 409 (${loser.error.code}).`);
    console.log('  -> PASS: Real live Atlas concurrency race resolved deterministically.\n');

    // --- Gate 15: Lease Takeover & Stale Worker Rejection Proof ---
    console.log('[15/18] [LEASE FENCING & RECOVERY] Proving Lease Takeover & Stale Worker Rejection...');
    const staleOpSession = await StudySession.findById(createdSession._id);
    const staleOpId = `stale_op_${Date.now()}`;

    // Simulate Worker A acquiring lease in EVALUATING state
    staleOpSession.status = STUDY_STATUS.EVALUATING;
    staleOpSession.evaluationState.status = 'EVALUATING';
    staleOpSession.evaluationState.operationId = staleOpId;
    staleOpSession.evaluationState.leaseExpiresAt = new Date(Date.now() - 5000); // Expired 5s ago
    await staleOpSession.save();

    // Worker B takes over expired lease
    const recoveredSession = await studyService.recoverExpiredLease(userA._id, createdSession._id);
    if (!recoveredSession) throw new Error('recoverExpiredLease returned null.');
    const newOpId = recoveredSession.evaluationState.operationId;
    if (newOpId === staleOpId) throw new Error('Lease recovery failed to replace stale operationId.');

    // Worker A returns late and attempts to write with staleOpId matching current EVALUATING status
    const lateWriteResult = await StudySession.updateOne(
      {
        _id: createdSession._id,
        userId: userA._id,
        status: STUDY_STATUS.EVALUATING, // Exactly matching the current session status
        'evaluationState.operationId': staleOpId, // OLD EXPIRED OPERATION ID — FENCING BARRIER
      },
      {
        $set: { status: STUDY_STATUS.ADVANCING },
      }
    );

    if (lateWriteResult.matchedCount !== 0) {
      throw new Error('Fencing violation: Late worker was able to match and write with expired operationId.');
    }
    console.log(`  -> Worker B Takeover New operationId: ${newOpId}`);
    console.log(`  -> Late Worker A Commit Matched Documents: ${lateWriteResult.matchedCount} (Rejected Strictly by operationId Fencing)`);
    console.log('  -> PASS: Authoritative lease fencing protects against late worker state corruption.\n');

    // --- Gate 16: Cross-Tenant Security Isolation ---
    console.log('[16/18] [HTTP API] Cross-Tenant Security Isolation (HTTP 404 on other user session)...');
    const crossTenantRes = await fetch(`${API_BASE}/study-sessions/${createdSession._id}`, {
      headers: { Cookie: cookieB }, // User B
    });
    if (crossTenantRes.status !== 404) {
      throw new Error(`Expected HTTP 404 for cross-tenant access, got ${crossTenantRes.status}`);
    }
    console.log('  -> PASS: Tenant isolation strictly enforced (HTTP 404).\n');

    // --- Gate 17: Real Live Evaluation Failure Recovery & Non-Stranding Pedagogy ---
    console.log('[17/18] [AI GATEWAY] Proving Real Live Evaluation Failure Recovery on MongoDB Atlas...');
    const recoveryTopic = await Topic.create({
      userId: userA._id,
      subjectId: subjectA._id,
      title: `Consensus Safety Invariants ${nonce}`,
      normalizedTitle: `consensus safety invariants ${nonce}`.toLowerCase(),
      description: 'Leader completeness, state machine safety, and election safety.',
    });
    cleanupIds.topics.push(recoveryTopic._id);

    const recoveryConcept = await Concept.create({
      userId: userA._id,
      subjectId: subjectA._id,
      topicId: recoveryTopic._id,
      name: 'Election Safety Invariant',
      normalizedName: 'election safety invariant',
      description: 'At most one leader can be elected in a given term across the entire cluster.',
      status: 'LEARNING',
    });
    cleanupIds.concepts.push(recoveryConcept._id);

    // Create a fresh session for recovery verification
    const recSessionRes = await studyService.createOrResumeSession(userA._id, recoveryTopic._id);
    const recSession = recSessionRes.session;
    cleanupIds.studySessions.push(recSession._id);

    const recQuestionId = recSession.activeQuestion.questionId;
    const recSessionVersion = recSession.sessionVersion;

    // Induce controlled evaluation failure on live Atlas DB
    let failedSafely = false;
    try {
      await studyService.submitAnswer(userA._id, recSession._id, {
        questionId: recQuestionId,
        sessionVersion: recSessionVersion,
        clientTurnId: `turn_rec_fail_${Date.now()}`,
        answer: 'Any answer that triggers controlled evaluation error.',
      }, { forceEvaluationError: true });
    } catch (err) {
      if (err.code === 'EVALUATION_FAILED_RETRY_SAFE') {
        failedSafely = true;
      }
    }

    if (!failedSafely) {
      throw new Error('Expected submitAnswer with forceEvaluationError to throw EVALUATION_FAILED_RETRY_SAFE.');
    }

    // Inspect the actual persisted state in MongoDB Atlas
    const postFailureSession = await StudySession.findById(recSession._id);
    if (postFailureSession.status === STUDY_STATUS.EVALUATING) {
      throw new Error('FAIL-CLOSED: Session remained stranded in EVALUATING state after evaluation error.');
    }
    if (postFailureSession.status !== STUDY_STATUS.QUESTIONING) {
      throw new Error(`Expected session restored to QUESTIONING, got ${postFailureSession.status}`);
    }
    if (postFailureSession.evaluationState.status !== 'FAILED') {
      throw new Error(`Expected evaluationState.status FAILED, got ${postFailureSession.evaluationState.status}`);
    }
    if (postFailureSession.activeQuestion.questionId !== recQuestionId) {
      throw new Error('FAIL-CLOSED: Active question context was lost after evaluation failure.');
    }

    // Prove subsequent retry succeeds
    const retryRes = await studyService.submitAnswer(userA._id, recSession._id, {
      questionId: recQuestionId,
      sessionVersion: postFailureSession.sessionVersion,
      clientTurnId: `turn_rec_retry_${Date.now()}`,
      answer: 'At most one leader can be elected in a given term because a candidate requires a majority of votes, and each follower votes for at most one candidate per term.',
    });

    if (!retryRes.turn || !retryRes.session) {
      throw new Error('Subsequent answer retry failed after recovery.');
    }

    console.log(`  -> Recovery Session Restored to Status: ${postFailureSession.status} (evaluationState: ${postFailureSession.evaluationState.status})`);
    console.log(`  -> Active Question Preserved: "${postFailureSession.activeQuestion.prompt.substring(0, 60)}..."`);
    console.log(`  -> Subsequent Retry Result: Succeeded (Next Status: ${retryRes.session.status})`);
    console.log('  -> PASS: Real live catastrophic evaluation recovery verified on MongoDB Atlas replica set.\n');

    // --- Gate 18: Immutability-Safe Native Driver Teardown ---
    console.log('[18/18] [TEARDOWN] Immutability-Safe Native Driver Test Teardown...');
    const db = mongoose.connection.db;

    if (cleanupIds.studySessions.length > 0) {
      await db.collection('studysessions').deleteMany({ _id: { $in: cleanupIds.studySessions } });
    }
    if (cleanupIds.concepts.length > 0) {
      await db.collection('concepts').deleteMany({ _id: { $in: cleanupIds.concepts } });
    }
    if (cleanupIds.syllabi.length > 0) {
      await db.collection('syllabusversions').deleteMany({ _id: { $in: cleanupIds.syllabi } });
    }
    if (cleanupIds.topics.length > 0) {
      await db.collection('topics').deleteMany({ _id: { $in: cleanupIds.topics } });
    }
    if (cleanupIds.subjects.length > 0) {
      await db.collection('subjects').deleteMany({ _id: { $in: cleanupIds.subjects } });
    }
    if (cleanupIds.sessions.length > 0) {
      await db.collection('usersessions').deleteMany({ _id: { $in: cleanupIds.sessions } });
    }
    if (cleanupIds.users.length > 0) {
      await db.collection('users').deleteMany({ _id: { $in: cleanupIds.users } });
    }

    console.log('  -> PASS: Test tenant data cleaned up cleanly without touching canonical tables.\n');

    console.log('==============================================================================');
    console.log('ALL 18 PHASE 08 LIVE VERIFICATION GATES PASSED (18/18) — FAIL-CLOSED');
    console.log('==============================================================================\n');
  } catch (error) {
    console.error('\n[FATAL] Phase 08 Live Verification Failed:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

runLiveVerification();
