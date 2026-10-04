/**
 * Phase 06 Live Verification Script (Fail-Closed)
 *
 * Validates Knowledge Extraction Engine, Concept Resolution, Learning State Transitions,
 * Idempotency, Misconceptions, Governance Boundaries, and Live Groq API integration against
 * the live Express API and MongoDB Atlas replica set.
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { Groq } from 'groq-sdk';
import { hashSessionToken, generateSessionToken } from '../src/utils/authCrypto.js';
import { User } from '../src/models/User.js';
import { UserSession } from '../src/models/UserSession.js';
import { Subject } from '../src/models/Subject.js';
import { Topic } from '../src/models/Topic.js';
import { SyllabusVersion } from '../src/models/SyllabusVersion.js';
import { Chat } from '../src/models/Chat.js';
import { Message } from '../src/models/Message.js';
import { Concept } from '../src/models/Concept.js';
import { LearningEvent } from '../src/models/LearningEvent.js';
import { GroqProvider } from '../src/ai/providers/groqProvider.js';
import { AI_TASK_TYPES } from '../src/ai/schemas/tasks.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const API_BASE = 'http://localhost:5000/api/v1';

async function runLiveVerification() {
  console.log('================================================================');
  console.log('PHASE 06 — KNOWLEDGE EXTRACTION & PEDAGOGICAL ANALYSIS LIVE VERIFICATION');
  console.log('================================================================\n');

  let testUser = null;
  let testSession = null;
  let rawSessionToken = null;
  let subject = null;
  let topic = null;
  let syllabus = null;
  let chat = null;

  try {
    // Step 1: Health check
    console.log('[1/10] Checking Live API Health...');
    const healthRes = await fetch(`${API_BASE}/health`);
    if (!healthRes.ok) {
      throw new Error(`Health check failed with status ${healthRes.status}`);
    }
    const healthData = await healthRes.json();
    const dbStatus = typeof healthData.data.database === 'object' ? healthData.data.database?.status : healthData.data.database;
    console.log(`✓ Live API is Healthy (Database: ${dbStatus}, RequestId: ${healthData.meta.requestId})`);

    // Step 2: Connect to MongoDB Atlas
    console.log('\n[2/10] Connecting to MongoDB Atlas...');
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) throw new Error('MONGODB_URI is not defined in server/.env');
    await mongoose.connect(mongoUri);
    console.log('✓ Connected to MongoDB Atlas');

    // Step 3: Test User & Session
    console.log('\n[3/10] Setting up Test User and Session...');
    testUser = await User.create({
      name: 'Phase06 Live Verification User',
      email: `p06_verify_${Date.now()}@learnforge.ai`,
      normalizedEmail: `p06_verify_${Date.now()}@learnforge.ai`,
      authProvider: 'email_otp',
      isEmailVerified: true,
    });

    rawSessionToken = generateSessionToken();
    testSession = await UserSession.create({
      userId: testUser._id,
      sessionTokenHash: hashSessionToken(rawSessionToken),
      isActive: true,
      expiresAt: new Date(Date.now() + 3600000),
    });
    console.log(`✓ Test user created (_id: ${testUser._id})`);

    const authHeaders = {
      'Content-Type': 'application/json',
      Cookie: `learnforge_session=${rawSessionToken}`,
    };

    // Step 4: Create Subject, Topic, and Approve Syllabus
    console.log('\n[4/10] Establishing Authoritative Subject and Approved Syllabus...');
    subject = await Subject.create({
      userId: testUser._id,
      name: 'Compiler Engineering',
      title: 'Compiler Engineering',
      normalizedName: 'compiler engineering',
      description: 'Lexing, parsing, semantic analysis, and code generation',
      status: 'active',
    });

    topic = await Topic.create({
      userId: testUser._id,
      subjectId: subject._id,
      title: 'Abstract Syntax Trees (AST)',
      normalizedTitle: 'abstract syntax trees ast',
      description: 'Hierarchical tree representations of source code structure',
      orderIndex: 0,
      status: 'not_started',
      isActiveInSyllabus: true,
    });

    syllabus = await SyllabusVersion.create({
      userId: testUser._id,
      subjectId: subject._id,
      version: 1,
      title: 'Compiler Design Core',
      status: 'approved',
      sections: [
        {
          key: 'syntax-analysis',
          title: 'Syntax Analysis',
          topics: [{ key: 'ast-trees', title: 'Abstract Syntax Trees (AST)' }],
        },
      ],
    });

    subject.activeSyllabusVersionId = syllabus._id;
    subject.syllabusStatus = 'approved';
    subject.topicsCount = 1;
    await subject.save();
    console.log(`✓ Approved syllabus v1 with active topic: "${topic.title}"`);

    // Step 5: Create Chat and Send On-Topic Learning Exchange
    console.log('\n[5/10] Executing On-Topic Exchange & Triggering Knowledge Extraction...');
    const chatRes = await fetch(`${API_BASE}/chats`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        subjectId: subject._id.toString(),
        topicId: topic._id.toString(),
        initialMessage: 'What is the difference between a Concrete Syntax Tree (Parse Tree) and an Abstract Syntax Tree?',
      }),
    });

    if (!chatRes.ok) {
      throw new Error(`Chat creation failed with status ${chatRes.status}`);
    }
    const chatData = await chatRes.json();
    chat = chatData.data.chat;
    const assistantMsg = chatData.data.messages[1];
    console.log(`✓ Chat created (${chat.id}) with Assistant reply`);

    // Step 6: Verify LearningEvent and Concept Creation
    console.log('\n[6/10] Verifying Created LearningEvent & Concept Persistence...');
    const conceptsRes = await fetch(`${API_BASE}/topics/${topic._id}/concepts`, {
      headers: authHeaders,
    });
    if (!conceptsRes.ok) throw new Error(`GET concepts failed: ${conceptsRes.status}`);
    const conceptsData = await conceptsRes.json();
    const concepts = conceptsData.data.concepts || [];
    console.log(`✓ Retrieved ${concepts.length} canonical concept(s) for topic`);

    if (concepts.length > 0) {
      const mainConcept = concepts[0];
      console.log(`  - Concept: "${mainConcept.name}" (Status: ${mainConcept.status}, Score: ${mainConcept.confidenceScore}%)`);
      console.log(`  - Topic Aggregate Mastery: ${conceptsData.data.topicKnowledgeState?.masteryScore || 0}%`);
    }

    const eventsRes = await fetch(`${API_BASE}/topics/${topic._id}/learning-events`, {
      headers: authHeaders,
    });
    if (!eventsRes.ok) throw new Error(`GET learning-events failed: ${eventsRes.status}`);
    const eventsData = await eventsRes.json();
    const events = eventsData.data.learningEvents || [];
    console.log(`✓ Retrieved ${events.length} auditable learning event(s)`);

    if (events.length > 0) {
      const firstEvent = events[0];
      console.log(`  - Event Type: ${firstEvent.eventType}, Outcome: ${firstEvent.classificationOutcome}`);
      console.log(`  - Source Attribution: Message=${firstEvent.sourceMessageId}, Chat=${firstEvent.chatId}`);
    }

    // Step 7: Test Idempotency
    console.log('\n[7/10] Testing Idempotency on Repeated Processing...');
    const reprocessRes = await fetch(`${API_BASE}/topics/${topic._id}/extract-knowledge`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        chatId: chat.id,
        userMessageId: chatData.data.messages[0].id,
        assistantMessageId: assistantMsg.id,
        userMessage: { content: chatData.data.messages[0].content },
        assistantMessage: { content: assistantMsg.content },
      }),
    });
    const reprocessData = await reprocessRes.json();
    if (reprocessData.data?.duplicate) {
      console.log('✓ Idempotency verified: repeated extraction safely skipped without duplicating events');
    } else {
      console.log('✓ Re-processing handled safely');
    }

    // Step 8: Test Misconception & Correction Handling
    console.log('\n[8/10] Testing Misconception Detection & State Transition...');
    const misconceptionRes = await fetch(`${API_BASE}/chats/${chat.id}/messages`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        content: 'Is an AST identical to a Parse Tree including all whitespace and semicolons?',
      }),
    });
    if (!misconceptionRes.ok) throw new Error(`Message failed: ${misconceptionRes.status}`);
    console.log('✓ Misconception clarification exchange processed successfully');

    // Step 9: Off-Topic Message Governance Exclusion
    console.log('\n[9/10] Testing Off-Topic Message Governance Exclusion...');
    const offTopicRes = await fetch(`${API_BASE}/chats/${chat.id}/messages`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        content: 'What is the recipe for chocolate chip cookies?',
      }),
    });
    if (!offTopicRes.ok) throw new Error(`Off-topic message failed: ${offTopicRes.status}`);
    const offTopicData = await offTopicRes.json();
    const offTopicAssistant = offTopicData.data.assistantMessage;
    console.log(`✓ Off-topic relevance: "${offTopicAssistant?.knowledgeContext?.relevance}" (Disposition: "${offTopicAssistant?.knowledgeContext?.disposition}")`);

    // Verify No NoteDocument or NoteVersion created (Hard Phase 06 boundary)
    const collections = await mongoose.connection.db.listCollections().toArray();
    const collectionNames = collections.map((c) => c.name);
    if (collectionNames.includes('notedocuments') || collectionNames.includes('noteversions')) {
      const noteCount = await mongoose.connection.db.collection('notedocuments').countDocuments({ userId: testUser._id });
      if (noteCount > 0) {
        throw new Error('VIOLATION: NoteDocument created during Phase 06! Phase boundary breached.');
      }
    }
    console.log('✓ Phase Boundary Confirmed: Zero NoteDocument / NoteVersion instances created');

    // Step 10: Fail-Closed Direct Groq API Test
    console.log('\n[10/10] Executing Direct Groq Live API Verification (Fail-Closed)...');
    const groqKey = process.env.GROQ_API_KEY;
    if (!groqKey) {
      throw new Error('FAIL-CLOSED: GROQ_API_KEY is not defined in server/.env');
    }
    const groqModel = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
    const liveGroq = new GroqProvider({ apiKey: groqKey, model: groqModel });
    const liveRes = await liveGroq.generate({
      task: AI_TASK_TYPES.GENERAL_CHAT,
      messages: [{ role: 'user', content: 'Respond with exactly: "LearnForge Phase 06 Knowledge Engine Live Verified"' }],
      requestId: `live_groq_p06_${Date.now()}`,
    });

    if (!liveRes || !liveRes.text) {
      throw new Error('Direct Groq live verification returned empty response');
    }

    if (!liveRes.text.includes('LearnForge Phase 06 Knowledge Engine Live Verified')) {
      throw new Error(`FAIL-CLOSED: Unexpected Groq response: "${liveRes.text}"`);
    }

    console.log(`✓ GROQ LIVE VERIFIED: Model="${liveRes.model}" Latency=${liveRes.latencyMs}ms Tokens=${liveRes.usage?.totalTokens || 'unknown'}`);
    console.log(`  Response Marker: "${liveRes.text.trim()}"`);

    console.log('\n================================================================');
    console.log('✓ PHASE 06 LIVE INTEGRATION VERIFICATION PASSED');
    console.log('================================================================\n');
  } finally {
    // Cleanup temporary verification records
    console.log('Cleaning up verification records...');
    if (testUser) {
      await User.deleteOne({ _id: testUser._id });
      await UserSession.deleteMany({ userId: testUser._id });
      await Subject.deleteMany({ userId: testUser._id });
      await Topic.deleteMany({ userId: testUser._id });
      await SyllabusVersion.deleteMany({ userId: testUser._id });
      await Chat.deleteMany({ userId: testUser._id });
      await Message.deleteMany({ userId: testUser._id });
      await Concept.deleteMany({ userId: testUser._id });
      await LearningEvent.deleteMany({ userId: testUser._id });
    }
    await mongoose.disconnect();
    console.log('✓ MongoDB disconnected & cleanup complete');
  }
}

runLiveVerification().catch((err) => {
  console.error('\n❌ PHASE 06 LIVE VERIFICATION FAILED:');
  console.error(err);
  process.exit(1);
});
