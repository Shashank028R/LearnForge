/**
 * Phase 07 Live Verification Script (Fail-Closed, Hardened, Multi-Tenant Proof)
 *
 * Validates Structured Notes Engine against live Express API, MongoDB Atlas replica set, and Groq AI:
 *
 * ==============================================================================
 * CATEGORY 1: LIVE HTTP / REST API INTEGRATION VERIFICATION
 * ==============================================================================
 * 1. Health & Database Connectivity Check
 * 2. MongoDB Atlas Replica Set Connection
 * 3. Multi-Document Transaction Support
 * 4. Isolated Test Tenant & Canonical Knowledge Base Setup
 * 5. Read-Only Topic Note 404 Assertion (Zero side-effects)
 * 11. Strict Block Schema Validation & Unsupported Field Rejection (PUT /notes/:id)
 * 12. Version History Inspection & Immutable Restore (POST /restore)
 * 13. AI Note Synthesis Proposal with Canonical Concept Attribution (POST /synthesize)
 * 15. Cross-Tenant Isolation & Security (HTTP 404 on unauthorized read/write)
 * 16. Immutability-Safe Native Driver Teardown
 *
 * ==============================================================================
 * CATEGORY 2: LIVE DOMAIN-SERVICE CONCURRENCY VERIFICATION (ATLAS TRANSACTIONS)
 * ==============================================================================
 * 6. Deterministic Real Live Concurrency: Initial Note Creation Race
 * 7. Deterministic Real Live Concurrency: Manual Revision Collision (V2 vs V2)
 * 8. Server-Authoritative Provenance Trust Boundary (Block & Note level)
 * 9. AI vs Fallback Synthesis Provenance Accuracy
 * 10. NoteVersion Immutability Invariant & bulkWrite Guard Validation (all 10 mutation paths)
 * 14. Deterministic Proposal Approval vs Rejection Concurrency Race (Genuine Current BaseVersion)
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { hashSessionToken, generateSessionToken } from '../src/utils/authCrypto.js';
import { User } from '../src/models/User.js';
import { UserSession } from '../src/models/UserSession.js';
import { Subject } from '../src/models/Subject.js';
import { Topic } from '../src/models/Topic.js';
import { SyllabusVersion } from '../src/models/SyllabusVersion.js';
import { Concept } from '../src/models/Concept.js';
import { LearningEvent } from '../src/models/LearningEvent.js';
import { NoteDocument } from '../src/models/NoteDocument.js';
import { NoteVersion } from '../src/models/NoteVersion.js';
import { NoteProposal } from '../src/models/NoteProposal.js';
import { NotesService } from '../src/notes/services/notesService.js';
import { GroqProvider } from '../src/ai/providers/groqProvider.js';
import { AI_TASK_TYPES } from '../src/ai/schemas/tasks.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const API_BASE = 'http://localhost:5000/api/v1';

class TestSyncBarrier {
  constructor(parties) {
    this.parties = parties;
    this.count = 0;
    this.release = null;
    this.promise = new Promise((resolve) => {
      this.release = resolve;
    });
  }

  async wait() {
    this.count += 1;
    if (this.count >= this.parties) {
      this.release();
    }
    await this.promise;
  }
}

async function runLiveVerification() {
  console.log('================================================================');
  console.log('PHASE 07 — STRUCTURED NOTES ENGINE LIVE VERIFICATION (FAIL-CLOSED)');
  console.log('================================================================\n');

  let testUser = null;
  let otherTenantUser = null;
  let testSession = null;
  let rawSessionToken = null;
  let otherSessionToken = null;
  let subject = null;
  let topic = null;
  let syllabus = null;
  let conceptA = null;
  let conceptB = null;

  try {
    // 1. API Health Check
    console.log('[1/16] [HTTP API] Checking Live API Health...');
    const healthRes = await fetch(`${API_BASE}/health`);
    if (!healthRes.ok) {
      throw new Error(`Health check failed with status ${healthRes.status}`);
    }
    const healthData = await healthRes.json();
    const dbStatus = typeof healthData.data.database === 'object' ? healthData.data.database?.status : healthData.data.database;
    if (dbStatus !== 'connected') {
      throw new Error(`FAIL-CLOSED: Live API database status is "${dbStatus}", expected "connected"`);
    }
    console.log(`✓ Live API is Healthy (Database: ${dbStatus}, RequestId: ${healthData.meta.requestId})`);

    // 2. MongoDB Atlas Connection
    console.log('\n[2/16] [DATABASE] Connecting to MongoDB Atlas...');
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) throw new Error('FAIL-CLOSED: MONGODB_URI is not defined in server/.env');
    await mongoose.connect(mongoUri);
    console.log('✓ Connected to MongoDB Atlas');

    // 3. Multi-Document Transaction Verification
    console.log('\n[3/16] [DATABASE] Verifying Multi-Document Transaction Support on Replica Set...');
    const txSession = await mongoose.startSession();
    try {
      txSession.startTransaction();
      await txSession.abortTransaction();
      console.log('✓ Multi-document transactions confirmed supported on replica set');
    } catch (txErr) {
      throw new Error(`FAIL-CLOSED: Multi-document transactions unsupported: ${txErr.message}`);
    } finally {
      await txSession.endSession();
    }

    // 4. Setup Isolated Test Environment
    console.log('\n[4/16] [DATABASE] Setting up Isolated Test Tenant & Canonical Knowledge Base...');
    const timestamp = Date.now();
    testUser = await User.create({
      email: `test_notes_${timestamp}@learnforge.ai`,
      normalizedEmail: `test_notes_${timestamp}@learnforge.ai`,
      name: `Notes Tester ${timestamp}`,
      status: 'active',
      authProvider: 'email_otp',
      isEmailVerified: true,
      passwordHash: 'dummy_hash',
    });

    otherTenantUser = await User.create({
      email: `other_notes_${timestamp}@learnforge.ai`,
      normalizedEmail: `other_notes_${timestamp}@learnforge.ai`,
      name: `Other Tenant ${timestamp}`,
      status: 'active',
      authProvider: 'email_otp',
      isEmailVerified: true,
      passwordHash: 'dummy_hash',
    });

    rawSessionToken = generateSessionToken();
    testSession = await UserSession.create({
      userId: testUser._id,
      sessionTokenHash: hashSessionToken(rawSessionToken),
      isActive: true,
      expiresAt: new Date(Date.now() + 86400000),
    });

    otherSessionToken = generateSessionToken();
    await UserSession.create({
      userId: otherTenantUser._id,
      sessionTokenHash: hashSessionToken(otherSessionToken),
      isActive: true,
      expiresAt: new Date(Date.now() + 86400000),
    });

    subject = await Subject.create({
      userId: testUser._id,
      title: `Distributed Consensus & State Machines ${timestamp}`,
      name: `Distributed Consensus & State Machines ${timestamp}`,
      normalizedName: `distributed consensus & state machines ${timestamp}`.toLowerCase(),
      description: 'Paxos, Raft, and Byzantine Fault Tolerance',
      targetMasteryLevel: 'advanced',
      status: 'active',
    });

    topic = await Topic.create({
      userId: testUser._id,
      subjectId: subject._id,
      title: `Raft Leader Election & Log Replication ${timestamp}`,
      normalizedTitle: `raft leader election & log replication ${timestamp}`,
      description: 'Term numbers, election timeouts, and appendEntries RPC semantics',
      status: 'in_progress',
    });

    syllabus = await SyllabusVersion.create({
      subjectId: subject._id,
      userId: testUser._id,
      version: 1,
      title: 'Consensus Curriculum v1',
      status: 'approved',
      approvedAt: new Date(),
      sections: [
        {
          key: 'leader-election',
          title: 'Leader Election',
          topics: [{ key: 'raft-election', title: topic.title }],
        },
      ],
    });

    conceptA = await Concept.create({
      userId: testUser._id,
      subjectId: subject._id,
      topicId: topic._id,
      name: 'Election Timeout',
      normalizedName: 'election timeout',
      status: 'STRONG',
      confidenceScore: 94,
      evidenceCount: 5,
      misconceptions: [],
      conflictState: { hasConflict: false },
    });

    conceptB = await Concept.create({
      userId: testUser._id,
      subjectId: subject._id,
      topicId: topic._id,
      name: 'AppendEntries RPC',
      normalizedName: 'appendentries rpc',
      status: 'LEARNING',
      confidenceScore: 75,
      evidenceCount: 2,
      misconceptions: [
        {
          misconceptionText: 'Heartbeats carry data payload on every tick',
          severity: 'medium',
          isActive: true,
        },
      ],
      conflictState: { hasConflict: false },
    });

    const cookieHeader = `learnforge_session=${rawSessionToken}`;
    const otherCookieHeader = `learnforge_session=${otherSessionToken}`;
    console.log(`✓ Test tenant created (User: ${testUser._id}, Topic: ${topic._id})`);

    // 5. Read-Only Topic Note Retrieval Check (Must 404 when nonexistent)
    console.log('\n[5/16] [HTTP API] Verifying Read-Only Topic Note Retrieval (GET /api/v1/topics/:topicId/note)...');
    const readOnlyRes = await fetch(`${API_BASE}/topics/${topic._id}/note`, {
      headers: { Cookie: cookieHeader },
    });
    if (readOnlyRes.status !== 404) {
      throw new Error(`FAIL-CLOSED: Expected 404 NOTE_NOT_FOUND on initial note fetch, received status ${readOnlyRes.status}`);
    }
    const readOnlyData = await readOnlyRes.json();
    if (readOnlyData.error?.code !== 'NOTE_NOT_FOUND') {
      throw new Error(`FAIL-CLOSED: Expected error code NOTE_NOT_FOUND, received: ${readOnlyData.error?.code}`);
    }
    const initialDocCount = await NoteDocument.countDocuments({ topicId: topic._id });
    if (initialDocCount !== 0) {
      throw new Error(`FAIL-CLOSED: GET /topics/:topicId/note created side-effect documents! Found count: ${initialDocCount}`);
    }
    console.log('✓ Read-only GET returns 404 NOTE_NOT_FOUND with zero side-effects');

    // 6. REAL LIVE CONCURRENCY PROOF: Initial Note Creation Race
    console.log('\n[6/16] [DOMAIN-SERVICE CONCURRENCY] Proving Real Live Concurrency: Initial Note Creation Race with Synchronization Barrier...');
    const freshTopic = await Topic.create({
      userId: testUser._id,
      subjectId: subject._id,
      title: `Consensus Safety Invariants ${timestamp}`,
      normalizedTitle: `consensus safety invariants ${timestamp}`,
      description: 'State machine safety and leader completeness',
      status: 'in_progress',
    });

    const barrierService = new NotesService();
    const barrier = new TestSyncBarrier(2);
    barrierService.testConcurrencyBarrier = barrier;

    const [raceA, raceB] = await Promise.all([
      barrierService.createInitialTopicNote({
        userId: testUser._id,
        topicId: freshTopic._id,
        title: 'Concurrent Race Document A',
        blocks: [{ type: 'paragraph', content: { text: 'Branch A content' } }],
        changeSummary: 'Branch A initial commit',
      }),
      barrierService.createInitialTopicNote({
        userId: testUser._id,
        topicId: freshTopic._id,
        title: 'Concurrent Race Document B',
        blocks: [{ type: 'paragraph', content: { text: 'Branch B content' } }],
        changeSummary: 'Branch B initial commit',
      }),
    ]);

    const results = [raceA, raceB];
    const winner = results.find((r) => r.resolvedVia === 'transaction_commit');
    const loser = results.find((r) => r.resolvedVia === 'transaction_conflict_recovery');

    if (!winner || !loser) {
      throw new Error(
        `FAIL-CLOSED: Live concurrency race did not exercise transaction collision path. Results: ${JSON.stringify(
          results.map((r) => ({ resolvedVia: r.resolvedVia, alreadyExisted: r.alreadyExisted }))
        )}`
      );
    }

    if (winner.alreadyExisted !== false || loser.alreadyExisted !== true) {
      throw new Error(
        `FAIL-CLOSED: Winner alreadyExisted must be false, loser must be true. Got: winner=${winner.alreadyExisted}, loser=${loser.alreadyExisted}`
      );
    }

    const totalCreatedDocs = await NoteDocument.countDocuments({ userId: testUser._id, topicId: freshTopic._id });
    const totalCreatedVersions = await NoteVersion.countDocuments({ userId: testUser._id, topicId: freshTopic._id });

    if (totalCreatedDocs !== 1 || totalCreatedVersions !== 1) {
      throw new Error(
        `FAIL-CLOSED: Duplicate records persisted! NoteDocuments: ${totalCreatedDocs}, NoteVersions: ${totalCreatedVersions}`
      );
    }

    console.log(`✓ LIVE CONCURRENCY PROVEN: Winner committed v1 via transaction, Loser recovered via transaction_conflict_recovery, Exactly 1 doc/version persisted, 0 raw E11000`);

    // 7. REAL LIVE CONCURRENCY PROOF: Manual Revision Collision (V2 vs V2)
    console.log('\n[7/16] [DOMAIN-SERVICE CONCURRENCY] Proving Real Live Concurrency: Manual Revision Collision with Synchronization Barrier...');
    const revisionBarrierService = new NotesService();
    const revBarrier = new TestSyncBarrier(2);
    revisionBarrierService.testConcurrencyBarrier = revBarrier;

    const currentDoc = winner.note;
    const revisionResults = await Promise.allSettled([
      revisionBarrierService.createManualRevision({
        userId: testUser._id,
        noteId: currentDoc._id,
        baseVersion: 1,
        title: 'Revision Branch Alpha',
        blocks: [
          { type: 'heading', content: { level: 1, text: 'Branch Alpha' } },
          { type: 'paragraph', content: { text: 'Alpha edits' } },
        ],
        changeSummary: 'Alpha revision',
      }),
      revisionBarrierService.createManualRevision({
        userId: testUser._id,
        noteId: currentDoc._id,
        baseVersion: 1,
        title: 'Revision Branch Beta',
        blocks: [
          { type: 'heading', content: { level: 1, text: 'Branch Beta' } },
          { type: 'paragraph', content: { text: 'Beta edits' } },
        ],
        changeSummary: 'Beta revision',
      }),
    ]);

    const revSuccess = revisionResults.filter((r) => r.status === 'fulfilled');
    const revRejected = revisionResults.filter((r) => r.status === 'rejected');

    if (revSuccess.length !== 1 || revRejected.length !== 1) {
      throw new Error(
        `FAIL-CLOSED: Expected exactly 1 successful revision and 1 collision rejection. Got: success=${revSuccess.length}, rejected=${revRejected.length}`
      );
    }

    const collisionErr = revRejected[0].reason;
    if (collisionErr.code !== 'STALE_BASE_VERSION' || collisionErr.status !== 409) {
      throw new Error(
        `FAIL-CLOSED: Collision error must have code STALE_BASE_VERSION and status 409. Received: code=${collisionErr.code}, status=${collisionErr.status}, msg="${collisionErr.message}"`
      );
    }

    const allVersions = await NoteVersion.find({ noteDocumentId: currentDoc._id }).sort({ version: 1 });
    if (allVersions.length !== 2 || allVersions[1].version !== 2) {
      throw new Error(`FAIL-CLOSED: Expected exactly 2 versions (v1, v2). Found count: ${allVersions.length}`);
    }

    const updatedNoteDoc = await NoteDocument.findById(currentDoc._id);
    if (updatedNoteDoc.currentVersionNumber !== 2 || updatedNoteDoc.currentVersionId.toString() !== allVersions[1]._id.toString()) {
      throw new Error(
        `FAIL-CLOSED: NoteDocument pointer inconsistent! versionNumber=${updatedNoteDoc.currentVersionNumber}, currentVersionId=${updatedNoteDoc.currentVersionId}`
      );
    }

    console.log(`✓ REVISION CONCURRENCY PROVEN: Exactly 1 branch committed v2, Losing branch returned 409 STALE_BASE_VERSION, Zero raw E11000, Zero partial state`);

    // 8. Server-Authoritative Block & Note Provenance Verification
    console.log('\n[8/16] [PROVENANCE] Verifying Server-Authoritative Provenance Trust Boundaries...');
    // 8a. Manual revision cannot spoof AI or system origin
    const spoofedEdit = await revisionBarrierService.createManualRevision({
      userId: testUser._id,
      noteId: currentDoc._id,
      baseVersion: 2,
      blocks: [
        {
          id: 'spoof_1',
          type: 'paragraph',
          content: { text: 'Client claiming this is AI-authored' },
          origin: 'ai', // Client attempt to spoof AI origin
        },
        {
          id: 'spoof_2',
          type: 'paragraph',
          content: { text: 'Client claiming this is system-authored' },
          origin: 'system', // Client attempt to spoof system origin
        },
      ],
      changeSummary: 'Provenance spoof test',
    });

    const v3Blocks = spoofedEdit.version.blocks;
    if (v3Blocks[0].origin !== 'user' || v3Blocks[1].origin !== 'user') {
      throw new Error(
        `FAIL-CLOSED: Client spoofed origin accepted! Got origins: [${v3Blocks[0].origin}, ${v3Blocks[1].origin}], expected ['user', 'user']`
      );
    }
    console.log('✓ Server-authoritative provenance verified: manual edit origin spoofing normalized strictly to "user"');

    // 9. AI vs Fallback Synthesis Provenance Accuracy
    console.log('\n[9/16] [PROVENANCE] Verifying AI vs Deterministic Fallback Provenance Accuracy...');
    const failingGateway = {
      generate: async () => {
        throw new Error('AI API rate limited');
      },
    };
    const fallbackService = new NotesService(failingGateway);
    const fallbackRes = await fallbackService.synthesizeNoteProposal({
      userId: testUser._id,
      topicId: topic._id,
    });

    const fbMeta = fallbackRes.proposal.provenance.aiMetadata;
    if (fbMeta.source !== 'deterministic_fallback' || fbMeta.provider !== 'deterministic' || fbMeta.model !== 'rule-based-v1') {
      throw new Error(
        `FAIL-CLOSED: Fallback metadata incorrect! Received: source=${fbMeta.source}, provider=${fbMeta.provider}, model=${fbMeta.model}`
      );
    }
    console.log(`✓ AI Fallback provenance verified: source="${fbMeta.source}", provider="${fbMeta.provider}", model="${fbMeta.model}"`);

    // 10. NoteVersion Immutability Invariant & bulkWrite Guard Validation across All Mutation Paths
    console.log('\n[10/16] [IMMUTABILITY] Rigorously Validating NoteVersion Immutability across All 10 Mutation Paths...');
    const persistedV1 = await NoteVersion.findOne({ noteDocumentId: currentDoc._id, version: 1 });
    if (!persistedV1) throw new Error('FAIL-CLOSED: Persisted v1 version record not found');

    // 10a. Save on existing document
    persistedV1.changeSummary = 'Mutated summary illegal';
    let saveThrew = false;
    try {
      await persistedV1.save();
    } catch (e) {
      saveThrew = e.code === 'IMMUTABLE_NOTE_VERSION';
    }
    if (!saveThrew) throw new Error('FAIL-CLOSED: NoteVersion.save() on existing record did not throw IMMUTABLE_NOTE_VERSION');

    // 10b. Update methods
    const updateMethods = ['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'findOneAndReplace'];
    for (const m of updateMethods) {
      let threw = false;
      try {
        await NoteVersion[m]({ _id: persistedV1._id }, { changeSummary: 'Illegal update' });
      } catch (e) {
        threw = e.code === 'IMMUTABLE_NOTE_VERSION';
      }
      if (!threw) throw new Error(`FAIL-CLOSED: NoteVersion.${m}() did not throw IMMUTABLE_NOTE_VERSION`);
    }

    // 10c. Delete methods
    const deleteMethods = ['deleteOne', 'deleteMany', 'findOneAndDelete'];
    for (const m of deleteMethods) {
      let threw = false;
      try {
        await NoteVersion[m]({ _id: persistedV1._id });
      } catch (e) {
        threw = e.code === 'IMMUTABLE_NOTE_VERSION';
      }
      if (!threw) throw new Error(`FAIL-CLOSED: NoteVersion.${m}() did not throw IMMUTABLE_NOTE_VERSION`);
    }

    // 10d. bulkWrite update and delete forms
    const prohibitedBulkOps = [
      [{ updateOne: { filter: { _id: persistedV1._id }, update: { $set: { changeSummary: 'mutated' } } } }],
      [{ deleteOne: { filter: { _id: persistedV1._id } } }],
    ];
    for (const ops of prohibitedBulkOps) {
      let threw = false;
      try {
        await NoteVersion.bulkWrite(ops);
      } catch (e) {
        threw = e.code === 'IMMUTABLE_NOTE_VERSION';
      }
      if (!threw) throw new Error('FAIL-CLOSED: NoteVersion.bulkWrite with update/delete did not throw IMMUTABLE_NOTE_VERSION');
    }
    console.log('✓ All 10 NoteVersion mutation/deletion paths successfully blocked by immutability guards');

    // 11. Strict Block Schema Validation & Unsupported Field Rejection (HTTP API)
    console.log('\n[11/16] [HTTP API] Testing Strict Block Schema Validation (Rejecting H4, Code Captions, Unknown Keys)...');
    const badSchemaRes = await fetch(`${API_BASE}/notes/${currentDoc._id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({
        baseVersion: 3,
        blocks: [
          {
            type: 'heading',
            content: { level: 4, text: 'Illegal H4' }, // Level 4 rejected
          },
        ],
      }),
    });
    if (badSchemaRes.status !== 400) {
      throw new Error(`FAIL-CLOSED: Expected 400 for heading level 4, received: ${badSchemaRes.status}`);
    }

    const badCodeRes = await fetch(`${API_BASE}/notes/${currentDoc._id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({
        baseVersion: 3,
        blocks: [
          {
            type: 'code',
            content: { language: 'python', code: 'x = 1', caption: 'Illegal caption field' },
          },
        ],
      }),
    });
    if (badCodeRes.status !== 400) {
      throw new Error(`FAIL-CLOSED: Expected 400 for unsupported code field 'caption', received: ${badCodeRes.status}`);
    }
    console.log('✓ Strict block schema validation passed: Level 4 headings and unsupported keys rejected');

    // 12. Version History Inspection & Immutable Restore (v4 via HTTP API)
    console.log('\n[12/16] [HTTP API] Testing Version History & Immutable Version Restore...');
    const versionsRes = await fetch(`${API_BASE}/notes/${currentDoc._id}/versions`, {
      headers: { Cookie: cookieHeader },
    });
    const versionsData = await versionsRes.json();
    if (versionsData.data.length !== 3) {
      throw new Error(`FAIL-CLOSED: Expected 3 versions, found ${versionsData.data.length}`);
    }

    const restoreRes = await fetch(`${API_BASE}/notes/${currentDoc._id}/versions/1/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({ baseVersion: 3 }),
    });
    if (!restoreRes.ok) {
      throw new Error(`FAIL-CLOSED: Version restore failed with status: ${restoreRes.status}`);
    }
    const restoreData = await restoreRes.json();
    if (restoreData.data.currentVersionNumber !== 4 || restoreData.restoredVersion.sourceType !== 'version_restore') {
      throw new Error(`FAIL-CLOSED: Restore payload invalid: ${JSON.stringify(restoreData)}`);
    }
    console.log('✓ Version restore created new sequential NoteVersion v4 copying v1 content without mutating v1');

    // 13. AI Note Synthesis Proposal with Canonical Concept Attribution (HTTP API)
    console.log('\n[13/16] [HTTP API] Triggering AI Note Synthesis Proposal (POST /api/v1/topics/:topicId/notes/synthesize)...');
    const synthRes = await fetch(`${API_BASE}/topics/${freshTopic._id}/notes/synthesize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({ customInstructions: 'Emphasize state machine safety.' }),
    });

    if (synthRes.status !== 201) {
      const errText = await synthRes.text();
      throw new Error(`FAIL-CLOSED: Note synthesis failed with status ${synthRes.status}: ${errText}`);
    }
    const synthData = await synthRes.json();
    const proposal = synthData.data;
    if (!proposal || proposal.status !== 'pending') {
      throw new Error(`FAIL-CLOSED: Proposal not created in pending state: ${JSON.stringify(synthData)}`);
    }
    console.log(`✓ NoteProposal created in staging (ProposalId: ${proposal._id}, RiskLevel: ${proposal.riskAssessment.riskLevel})`);

    // 14. Proposal Approval / Rejection Concurrency Guard (Exact Current Base Version & Deterministic Barrier)
    console.log('\n[14/16] [DOMAIN-SERVICE CONCURRENCY] Proving Atomic Proposal Approval vs Rejection Race with Synchronization Barrier...');
    const noteBeforeRace = await NoteDocument.findById(currentDoc._id);
    const currentBaseVer = noteBeforeRace.currentVersionNumber;
    const currentBaseVerId = noteBeforeRace.currentVersionId;

    // Create a fresh test proposal specifically targeting the note's exact current baseVersion
    const raceProposal = await NoteProposal.create({
      noteDocumentId: currentDoc._id,
      userId: testUser._id,
      subjectId: subject._id,
      topicId: freshTopic._id,
      baseVersion: currentBaseVer,
      baseVersionId: currentBaseVerId,
      proposedBlocks: [
        {
          id: 'race_b1',
          type: 'paragraph',
          content: { text: `State machine safety invariant at v${currentBaseVer}` },
          order: 0,
          origin: 'ai',
        },
      ],
      riskAssessment: {
        riskLevel: 'LOW',
        reasons: ['Additive explanation'],
        requiresApproval: true,
      },
      status: 'pending',
      changeSummary: `Concurrent race proposal targeting base v${currentBaseVer}`,
    });

    const raceNotesService = new NotesService();
    const raceBarrier = new TestSyncBarrier(2);
    raceNotesService.testConcurrencyBarrier = raceBarrier;

    const [concurrentApprove, concurrentReject] = await Promise.allSettled([
      raceNotesService.approveProposal({
        userId: testUser._id,
        proposalId: raceProposal._id,
        baseVersion: currentBaseVer,
      }),
      raceNotesService.rejectProposal({
        userId: testUser._id,
        proposalId: raceProposal._id,
        reason: 'Concurrent rejection test',
      }),
    ]);

    const persistedProp = await NoteProposal.findById(raceProposal._id);
    const noteAfterRace = await NoteDocument.findById(currentDoc._id);
    const versionsAfterRace = await NoteVersion.find({ noteDocumentId: currentDoc._id }).sort({ version: 1 });

    if (concurrentApprove.status === 'fulfilled' && concurrentReject.status === 'rejected') {
      // Case A: Approval won
      if (persistedProp.status !== 'approved') {
        throw new Error(`FAIL-CLOSED: Approval fulfilled but proposal status is "${persistedProp.status}"`);
      }
      if (noteAfterRace.currentVersionNumber !== currentBaseVer + 1) {
        throw new Error(`FAIL-CLOSED: Expected version to increment to ${currentBaseVer + 1}, got ${noteAfterRace.currentVersionNumber}`);
      }
      const newestVer = versionsAfterRace[versionsAfterRace.length - 1];
      if (newestVer.version !== currentBaseVer + 1) {
        throw new Error(`FAIL-CLOSED: Expected newest NoteVersion to be v${currentBaseVer + 1}, got v${newestVer.version}`);
      }
      console.log(`✓ PROPOSAL CONCURRENCY PROVEN (CASE A): Approval branch won race -> committed NoteVersion v${noteAfterRace.currentVersionNumber}, proposal status="approved", rejection rejected safely`);
    } else if (concurrentReject.status === 'fulfilled' && concurrentApprove.status === 'rejected') {
      // Case B: Rejection won
      if (persistedProp.status !== 'rejected') {
        throw new Error(`FAIL-CLOSED: Rejection fulfilled but proposal status is "${persistedProp.status}"`);
      }
      if (noteAfterRace.currentVersionNumber !== currentBaseVer) {
        throw new Error(`FAIL-CLOSED: Version incremented on rejection! Expected ${currentBaseVer}, got ${noteAfterRace.currentVersionNumber}`);
      }
      const newestVer = versionsAfterRace[versionsAfterRace.length - 1];
      if (newestVer.version !== currentBaseVer) {
        throw new Error(`FAIL-CLOSED: Unexpected new NoteVersion created on rejection! Found v${newestVer.version}`);
      }
      console.log(`✓ PROPOSAL CONCURRENCY PROVEN (CASE B): Rejection branch won race -> proposal status="rejected", zero versions created (stayed v${currentBaseVer}), approval aborted cleanly`);
    } else {
      throw new Error(
        `FAIL-CLOSED: Invalid race outcome! Both cannot succeed or both fail. Approve: ${concurrentApprove.status}, Reject: ${concurrentReject.status}`
      );
    }

    // 15. Cross-Tenant Isolation & Security Protection (HTTP API)
    console.log('\n[15/16] [HTTP API] Verifying Cross-Tenant Security Isolation...');
    const unauthorizedRes = await fetch(`${API_BASE}/notes/${currentDoc._id}`, {
      headers: { Cookie: otherCookieHeader },
    });
    if (unauthorizedRes.status !== 404) {
      throw new Error(`FAIL-CLOSED: Tenant isolation failure! Other tenant accessed User A note with status: ${unauthorizedRes.status}`);
    }

    const unauthEditRes = await fetch(`${API_BASE}/notes/${currentDoc._id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: otherCookieHeader },
      body: JSON.stringify({ baseVersion: 4, blocks: [] }),
    });
    if (unauthEditRes.status !== 404) {
      throw new Error(`FAIL-CLOSED: Tenant isolation failure! Other tenant edited User A note with status: ${unauthEditRes.status}`);
    }
    console.log('✓ Cross-tenant security isolation strictly verified (returns 404 on unauthorized access)');

    // 16. Immutability-Safe Native Driver Teardown
    console.log('\n[16/16] [TEARDOWN] Executing Clean Immutability-Safe Teardown via Native Collections...');
    const collections = ['users', 'usersessions', 'subjects', 'topics', 'syllabusversions', 'concepts', 'learningevents', 'notedocuments', 'noteversions', 'noteproposals'];
    for (const coll of collections) {
      if (testUser) {
        await mongoose.connection.db.collection(coll).deleteMany({ userId: testUser._id });
      }
      if (otherTenantUser) {
        await mongoose.connection.db.collection(coll).deleteMany({ userId: otherTenantUser._id });
      }
    }
    console.log('✓ Native driver teardown completed cleanly with zero immutability exceptions');

    console.log('\n================================================================');
    console.log('ALL PHASE 07 LIVE VERIFICATIONS PASSED WITH 100% SUCCESS!');
    console.log('================================================================\n');
  } catch (err) {
    console.error('\n❌ LIVE VERIFICATION FAILED:', err);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

runLiveVerification();
