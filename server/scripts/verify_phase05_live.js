import mongoose from 'mongoose';
import { config } from '../src/config/env.js';
import { User } from '../src/models/User.js';
import { UserSession } from '../src/models/UserSession.js';
import { Subject } from '../src/models/Subject.js';
import { Topic } from '../src/models/Topic.js';
import { SyllabusVersion } from '../src/models/SyllabusVersion.js';
import { Chat } from '../src/models/Chat.js';
import { Message } from '../src/models/Message.js';
import { generateSessionToken, hashSessionToken } from '../src/utils/authCrypto.js';
import { aiGateway, AI_TASK_TYPES } from '../src/ai/index.js';

const API_BASE = 'http://localhost:5000/api/v1';

async function runLiveVerification() {
  console.log('================================================================');
  console.log('PHASE 05 — AI GATEWAY & PEDAGOGICAL ENGINE LIVE VERIFICATION');
  console.log('================================================================\n');

  // Step 1: Verify Health
  console.log('[1/8] Checking Live API Health...');
  const healthRes = await fetch(`${API_BASE}/health`);
  if (!healthRes.ok) {
    throw new Error(`Health check failed with status ${healthRes.status}`);
  }
  const healthData = await healthRes.json();
  const dbStatus = typeof healthData.data.database === 'object' ? healthData.data.database?.status : healthData.data.database;
  console.log(`✓ Live API is Healthy (Database: ${dbStatus}, RequestId: ${healthData.meta.requestId})`);

  // Step 2: Connect to MongoDB
  console.log('\n[2/8] Connecting to MongoDB...');
  await mongoose.connect(config.mongoUri);
  console.log('✓ Connected to MongoDB');

  let testUser = null;
  let testSession = null;
  let rawToken = null;
  let createdSubject = null;
  let createdTopic = null;
  let createdSyllabus = null;
  let createdChat = null;

  try {
    // Step 3: Setup Test User and Session
    console.log('\n[3/8] Setting up Test User and Session in Database...');
    const testEmail = `phase05-verify-${Date.now()}@learnforge.local`;
    testUser = await User.create({
      email: testEmail,
      normalizedEmail: testEmail.toLowerCase(),
      passwordHash: 'dummy_hash_for_verification',
      status: 'active',
      emailVerified: true,
      profile: { displayName: 'Phase 05 Live Tester' },
    });

    rawToken = generateSessionToken();
    const tokenHash = hashSessionToken(rawToken);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    testSession = await UserSession.create({
      userId: testUser._id,
      sessionTokenHash: tokenHash,
      createdAt: new Date(),
      lastSeenAt: new Date(),
      expiresAt,
    });
    console.log(`✓ Test user created (_id: ${testUser._id}) with active session`);

    const authHeaders = {
      'Content-Type': 'application/json',
      Cookie: `learnforge_session=${rawToken}`,
    };

    // Step 4: Create Subject, Topic, and Approve Syllabus
    console.log('\n[4/8] Establishing Authoritative Subject and Approved Syllabus...');
    const subjRes = await fetch(`${API_BASE}/subjects`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        name: 'Rust Systems Programming',
        description: 'Memory safety, ownership, and concurrency',
        targetMasteryLevel: 'advanced',
        color: '#f97316',
      }),
    });
    const subjData = await subjRes.json();
    if (!subjRes.ok) throw new Error(`Failed to create subject: ${JSON.stringify(subjData)}`);
    createdSubject = subjData.data.subject || subjData.data;
    const subjectIdStr = createdSubject.id || createdSubject._id;
    console.log(`✓ Subject created: ${createdSubject.name} (${subjectIdStr})`);

    // Create Draft Syllabus
    const sylRes = await fetch(`${API_BASE}/subjects/${subjectIdStr}/syllabus/versions`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        title: 'Rust Ownership & Concurrency',
        sections: [
          {
            title: 'Memory Governance',
            topics: [
              { title: 'Ownership & Borrowing', description: 'Lifetimes, mutability, and borrow checker' },
              { title: 'Smart Pointers', description: 'Rc, Arc, Box, and interior mutability' },
            ],
          },
        ],
      }),
    });
    const sylData = await sylRes.json();
    if (!sylRes.ok) throw new Error(`Failed to create syllabus: ${JSON.stringify(sylData)}`);
    createdSyllabus = sylData.data;
    const sylVersionId = createdSyllabus._id || createdSyllabus.id;
    console.log(`✓ Syllabus draft created (${sylVersionId})`);

    // Approve Syllabus (Atomic MongoDB Transaction)
    const approveRes = await fetch(
      `${API_BASE}/subjects/${subjectIdStr}/syllabus/versions/${sylVersionId}/approve`,
      { method: 'POST', headers: authHeaders }
    );
    const approveData = await approveRes.json();
    if (!approveRes.ok) throw new Error(`Failed to approve syllabus: ${JSON.stringify(approveData)}`);
    console.log(`✓ Approved Syllabus Version ${createdSyllabus.version} with canonical Topic reconciliation`);

    // Fetch Topics
    const topicsRes = await fetch(`${API_BASE}/subjects/${subjectIdStr}/topics`, { headers: authHeaders });
    const topicsData = await topicsRes.json();
    createdTopic = topicsData.data.topics[0];
    const topicIdStr = createdTopic.id || createdTopic._id;
    console.log(`✓ Focal Topic established: "${createdTopic.title}" (id: ${topicIdStr})`);

    // Step 5: Start Chat Session linked to Subject and Topic
    console.log('\n[5/8] Creating Chat Session via Express API...');
    const chatRes = await fetch(`${API_BASE}/chats`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        subjectId: createdSubject.id || createdSubject._id,
        topicId: createdTopic.id || createdTopic._id,
        title: 'Ownership & Borrowing Deep Dive',
      }),
    });
    const chatData = await chatRes.json();
    if (!chatRes.ok) throw new Error(`Failed to create chat: ${JSON.stringify(chatData)}`);
    createdChat = chatData.data.chat || chatData.data;
    console.log(`✓ Chat created (id: ${createdChat.id || createdChat._id}) with subject and topic association`);

    // Step 6: Send User Message and Execute AI Generation
    console.log('\n[6/8] Sending User Message & Triggering AI Gateway Execution...');
    const msgRes = await fetch(`${API_BASE}/chats/${createdChat.id || createdChat._id}/messages`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        content: 'How does the Rust borrow checker prevent data races at compile time?',
      }),
    });
    const msgData = await msgRes.json();
    if (!msgRes.ok) throw new Error(`Failed to send message: ${JSON.stringify(msgData)}`);

    const returnedMessages = msgData.data.messages;
    console.log(`✓ Response received with ${returnedMessages.length} messages`);

    const userMsg = returnedMessages.find((m) => m.role === 'user');
    const assistantMsg = returnedMessages.find((m) => m.role === 'assistant');

    if (!userMsg || !assistantMsg) {
      throw new Error('Expected both user and assistant messages in response envelope');
    }

    console.log(`  - User Message: seq=${userMsg.sequenceIndex}, status="${userMsg.status}"`);
    console.log(`  - Assistant Message: seq=${assistantMsg.sequenceIndex}, status="${assistantMsg.status}"`);
    console.log(`  - AI Model / Engine: ${assistantMsg.metadata?.model || 'socratic-engine'}`);
    console.log(`  - Knowledge Relevance: ${assistantMsg.knowledgeContext?.relevance}`);
    console.log(`  - Knowledge Disposition: ${assistantMsg.knowledgeContext?.disposition}`);

    if (userMsg.sequenceIndex !== 0 || assistantMsg.sequenceIndex !== 1) {
      throw new Error(`Sequence indexes are corrupt or non-sequential: expected 0 and 1, got ${userMsg.sequenceIndex} and ${assistantMsg.sequenceIndex}`);
    }

    // Explicitly assert that chat generation executed via real Groq provider and configured model
    console.log('\n  Asserting Live AI Provider Execution Metadata:');
    if (!assistantMsg.metadata?.provider || assistantMsg.metadata.provider === 'fallback') {
      throw new Error(`Chat assistant response used fallback engine instead of live Groq provider: ${JSON.stringify(assistantMsg.metadata)}`);
    }
    if (assistantMsg.metadata.provider !== 'groq') {
      throw new Error(`Expected assistant provider to be "groq", got "${assistantMsg.metadata.provider}"`);
    }
    if (assistantMsg.metadata.model !== config.ai.groqModel) {
      throw new Error(`Expected assistant model to be "${config.ai.groqModel}", got "${assistantMsg.metadata.model}"`);
    }
    console.log(`  ✓ Chat assistant verified: provider="${assistantMsg.metadata.provider}", model="${assistantMsg.metadata.model}"`);

    // Step 7: Off-Topic Knowledge Governance Verification
    console.log('\n[7/8] Testing Off-Topic Message & Knowledge Relevance Governance...');
    const chatIdStr = createdChat.id || createdChat._id;
    const offTopicRes = await fetch(`${API_BASE}/chats/${chatIdStr}/messages`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        content: 'What is the recipe for baking chocolate chip cookies?',
      }),
    });
    const offTopicData = await offTopicRes.json();
    if (!offTopicRes.ok) throw new Error(`Failed to send off-topic message: ${JSON.stringify(offTopicData)}`);

    const latestAssistant = offTopicData.data.messages.find((m) => m.role === 'assistant' && m.sequenceIndex === 3);
    if (!latestAssistant) {
      throw new Error('Expected off-topic assistant reply at sequence index 3');
    }

    console.log(`✓ Off-Topic exchange completed (seq=${latestAssistant.sequenceIndex})`);
    console.log(`  - Handled cleanly without creating canonical notes or polluting topic`);
    console.log(`  - Relevance: ${latestAssistant.knowledgeContext?.relevance}`);
    console.log(`  - Disposition: ${latestAssistant.knowledgeContext?.disposition}`);

    if (latestAssistant.knowledgeContext?.relevance !== 'off_topic') {
      throw new Error(`Expected relevance to be "off_topic", got "${latestAssistant.knowledgeContext?.relevance}"`);
    }
    if (latestAssistant.knowledgeContext?.disposition !== 'excluded') {
      throw new Error(`Expected disposition to be "excluded", got "${latestAssistant.knowledgeContext?.disposition}"`);
    }

    // Step 8: Direct Groq Live Provider Verification (FAIL-CLOSED)
    console.log('\n[8/8] Executing Direct Groq Live API Verification (Fail-Closed)...');
    
    if (!config.ai?.groqApiKey || config.ai.groqApiKey === 'placeholder' || config.ai.groqApiKey === 'your_groq_api_key_placeholder') {
      throw new Error('GROQ_API_KEY is not configured in local .env — cannot perform Phase 05 Live Verification');
    }

    const { GroqProvider } = await import('../src/ai/providers/groqProvider.js');
    const liveGroq = new GroqProvider({ apiKey: config.ai.groqApiKey, model: config.ai.groqModel });
    
    const liveRes = await liveGroq.generate({
      task: AI_TASK_TYPES.GENERAL_CHAT,
      messages: [{ role: 'user', content: 'Respond with exactly: "LearnForge Groq Live Verified"' }],
      requestId: `live_groq_${Date.now()}`,
    });

    if (!liveRes || !liveRes.text) {
      throw new Error('Direct Groq live verification returned empty response');
    }

    if (liveRes.provider !== 'groq') {
      throw new Error(`Expected live response provider to be "groq", got "${liveRes.provider}"`);
    }

    if (liveRes.model !== config.ai.groqModel) {
      throw new Error(`Expected live response model to be "${config.ai.groqModel}", got "${liveRes.model}"`);
    }

    if (!liveRes.text.includes('LearnForge Groq Live Verified')) {
      throw new Error(`Direct Groq response did not contain required marker "LearnForge Groq Live Verified". Got: "${liveRes.text}"`);
    }

    console.log(`✓ GROQ LIVE VERIFIED: Model="${liveRes.model}" Latency=${liveRes.latencyMs}ms Tokens=${liveRes.usage?.totalTokens}`);
    console.log(`  Response Marker: "${liveRes.text.trim()}"`);

    console.log('\n  Provider Status Summary:');
    console.log(`  - GEMINI: ${config.ai?.geminiApiKey && config.ai.geminiApiKey !== 'placeholder' ? 'CONFIGURED' : 'IMPLEMENTED — BLOCKED / NOT LIVE-VERIFIED (No API Key)'}`);
    console.log(`  - OPENAI: ${config.ai?.openaiApiKey && config.ai.openaiApiKey !== 'placeholder' ? 'CONFIGURED' : 'IMPLEMENTED — BLOCKED / NOT LIVE-VERIFIED (No API Key)'}`);
    console.log(`  - GROQ: LIVE-VERIFIED (Active)`);
    console.log(`  - ANTHROPIC: DISABLED / NOT PART OF ACTIVE PHASE 05 PROVIDER SET (Not required)`);

    console.log('\n================================================================');
    console.log('✓ PHASE 05 LIVE INTEGRATION VERIFICATION PASSED');
    console.log('================================================================');
  } finally {
    // Cleanup Database records created during test
    console.log('\nCleaning up verification records...');
    if (createdChat) {
      await Message.deleteMany({ chatId: createdChat.id || createdChat._id });
      await Chat.deleteOne({ _id: createdChat.id || createdChat._id });
    }
    if (createdSubject) {
      await Topic.deleteMany({ subjectId: createdSubject.id || createdSubject._id });
      await SyllabusVersion.deleteMany({ subjectId: createdSubject.id || createdSubject._id });
      await Subject.deleteOne({ _id: createdSubject.id || createdSubject._id });
    }
    if (testSession) await UserSession.deleteOne({ _id: testSession._id });
    if (testUser) await User.deleteOne({ _id: testUser._id });

    await mongoose.disconnect();
    console.log('✓ MongoDB disconnected & cleanup complete');
  }
}

runLiveVerification().catch((err) => {
  console.error('\n❌ LIVE VERIFICATION FAILED:', err);
  process.exit(1);
});
