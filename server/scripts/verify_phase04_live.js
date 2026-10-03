import mongoose from 'mongoose';
import { config } from '../src/config/env.js';
import { User } from '../src/models/User.js';
import { UserSession } from '../src/models/UserSession.js';
import { Subject } from '../src/models/Subject.js';
import { Topic } from '../src/models/Topic.js';
import { Chat } from '../src/models/Chat.js';
import { Message } from '../src/models/Message.js';
import { generateSessionToken, hashSessionToken } from '../src/utils/authCrypto.js';

const API_BASE = 'http://localhost:5000/api/v1';

async function runLiveVerification() {
  console.log('=== Starting Phase 04 Live Verification against local server ===\n');

  // Connect to live MongoDB
  await mongoose.connect(config.mongoUri);
  console.log('✓ Connected to MongoDB for test fixture provisioning');

  // Create User A and User B
  const timestamp = Date.now();
  const userA = await User.create({
    email: `phase04.userA.${timestamp}@learnforge.local`,
    normalizedEmail: `phase04.usera.${timestamp}@learnforge.local`,
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
    email: `phase04.userB.${timestamp}@learnforge.local`,
    normalizedEmail: `phase04.userb.${timestamp}@learnforge.local`,
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
    Authorization: `Bearer ${tokenA}`,
  };

  const headersB = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${tokenB}`,
  };

  try {
    // 1. User A creates Subject & Topic
    console.log('\n[1] Provisioning Subject & Topic for User A...');
    const subjectRes = await fetch(`${API_BASE}/subjects`, {
      method: 'POST',
      headers: headersA,
      body: JSON.stringify({
        name: `Distributed Computing ${timestamp}`,
        description: 'Consensus algorithms and fault tolerance',
        targetMasteryLevel: 'comprehensive',
      }),
    });
    const subjectData = await subjectRes.json();
    if (!subjectRes.ok) throw new Error(`Create Subject failed: ${JSON.stringify(subjectData)}`);
    const subjectId = subjectData.data.subject.id;
    console.log(`✓ Created Subject: ${subjectId}`);

    const topicRes = await fetch(`${API_BASE}/subjects/${subjectId}/topics`, {
      method: 'POST',
      headers: headersA,
      body: JSON.stringify({
        title: 'Paxos & Raft Protocols',
        description: 'Leader election, log replication, and safety invariants',
      }),
    });
    const topicData = await topicRes.json();
    if (!topicRes.ok) throw new Error(`Create Topic failed: ${JSON.stringify(topicData)}`);
    const topicId = topicData.data.topic.id;
    console.log(`✓ Created Topic: ${topicId}`);

    // 2. User A creates a topic-linked Chat with initialMessage
    console.log('\n[2] User A creates topic-linked conversation with initial message...');
    const chatRes = await fetch(`${API_BASE}/chats`, {
      method: 'POST',
      headers: headersA,
      body: JSON.stringify({
        topicId,
        initialMessage: 'How does Raft ensure that committed log entries are never overwritten?',
      }),
    });
    const chatData = await chatRes.json();
    if (!chatRes.ok) throw new Error(`Create Chat failed: ${JSON.stringify(chatData)}`);
    const chatId = chatData.data.chat.id;
    console.log(`✓ Chat created: ${chatId} - "${chatData.data.chat.title}"`);
    console.log(`✓ Initial messages count: ${chatData.data.messages.length}`);
    if (chatData.data.messages.length !== 2) {
      throw new Error(`Expected 2 initial messages (user + assistant), got ${chatData.data.messages.length}`);
    }

    // Verify Topic.chatsCount incremented
    const topicCheckRes = await fetch(`${API_BASE}/topics/${topicId}`, { headers: headersA });
    const topicCheckData = await topicCheckRes.json();
    console.log(`✓ Topic chatsCount is: ${topicCheckData.data.topic.chatsCount}`);
    if (topicCheckData.data.topic.chatsCount !== 1) {
      throw new Error(`Expected topic.chatsCount = 1, got ${topicCheckData.data.topic.chatsCount}`);
    }

    // 3. User A sends another message in Chat
    console.log('\n[3] User A sends a follow-up message in conversation...');
    const sendRes = await fetch(`${API_BASE}/chats/${chatId}/messages`, {
      method: 'POST',
      headers: headersA,
      body: JSON.stringify({
        content: 'Explain the Leader Completeness property in Raft.',
      }),
    });
    const sendData = await sendRes.json();
    if (!sendRes.ok) throw new Error(`Send Message failed: ${JSON.stringify(sendData)}`);
    console.log(`✓ Sent message. Returned ${sendData.data.messages.length} messages in exchange.`);
    console.log(`  User message sequenceIndex: ${sendData.data.userMessage.sequenceIndex}`);
    console.log(`  Assistant message sequenceIndex: ${sendData.data.assistantMessage.sequenceIndex}`);

    // 4. User A lists messages for Chat
    console.log('\n[4] User A retrieves chronological message list...');
    const listMsgRes = await fetch(`${API_BASE}/chats/${chatId}/messages`, { headers: headersA });
    const listMsgData = await listMsgRes.json();
    if (!listMsgRes.ok) throw new Error(`List Messages failed: ${JSON.stringify(listMsgData)}`);
    console.log(`✓ Retrieved ${listMsgData.data.messages.length} chronological messages.`);
    if (listMsgData.data.messages.length !== 4) {
      throw new Error(`Expected 4 messages, got ${listMsgData.data.messages.length}`);
    }

    // 5. User A gets single chat and verifies populated metadata
    console.log('\n[5] User A gets single chat details...');
    const getChatRes = await fetch(`${API_BASE}/chats/${chatId}`, { headers: headersA });
    const getChatData = await getChatRes.json();
    if (!getChatRes.ok) throw new Error(`Get Chat failed: ${JSON.stringify(getChatData)}`);
    console.log(`✓ Subject linked: ${getChatData.data.chat.subject?.name}`);
    console.log(`✓ Topic linked: ${getChatData.data.chat.topic?.title}`);
    console.log(`✓ Reconciled messagesCount: ${getChatData.data.chat.messagesCount}`);

    // 6. User A updates chat status to archived
    console.log('\n[6] User A archives conversation...');
    const updateRes = await fetch(`${API_BASE}/chats/${chatId}`, {
      method: 'PUT',
      headers: headersA,
      body: JSON.stringify({ status: 'archived' }),
    });
    const updateData = await updateRes.json();
    if (!updateRes.ok) throw new Error(`Update Chat failed: ${JSON.stringify(updateData)}`);
    console.log(`✓ Chat status updated to: ${updateData.data.chat.status}`);

    // 7. Cross-tenant Security Verification (User B accessing User A resources)
    console.log('\n[7] Cross-tenant Isolation Verification (User B accessing User A)...');

    const checks = [
      { name: 'User B GET Chat A', url: `${API_BASE}/chats/${chatId}`, method: 'GET' },
      { name: 'User B PUT Chat A', url: `${API_BASE}/chats/${chatId}`, method: 'PUT', body: { title: 'Hacked' } },
      { name: 'User B DELETE Chat A', url: `${API_BASE}/chats/${chatId}`, method: 'DELETE' },
      { name: 'User B GET Messages of Chat A', url: `${API_BASE}/chats/${chatId}/messages`, method: 'GET' },
      { name: 'User B POST Message in Chat A', url: `${API_BASE}/chats/${chatId}/messages`, method: 'POST', body: { content: 'Hack' } },
      { name: 'User B POST Chat with Topic A', url: `${API_BASE}/chats`, method: 'POST', body: { topicId, title: 'Injected' } },
    ];

    for (const check of checks) {
      const opts = { method: check.method, headers: headersB };
      if (check.body) opts.body = JSON.stringify(check.body);
      const res = await fetch(check.url, opts);
      if (res.status === 404) {
        console.log(`✓ ${check.name} -> 404 Not Found (Passed)`);
      } else {
        throw new Error(`${check.name} returned status ${res.status}, expected 404!`);
      }
    }

    // 8. Cascading Deletion Verification
    console.log('\n[8] Cascading Deletion Verification (Subject -> Topic -> Chat -> Messages)...');
    const deleteSubRes = await fetch(`${API_BASE}/subjects/${subjectId}`, {
      method: 'DELETE',
      headers: headersA,
    });
    if (!deleteSubRes.ok) throw new Error(`Delete Subject failed: ${deleteSubRes.status}`);
    console.log('✓ User A deleted Subject A');

    // Confirm that Topic, Chat, and Messages are deleted directly in DB
    const remainingTopics = await Topic.countDocuments({ subjectId });
    const remainingChats = await Chat.countDocuments({ subjectId });
    const remainingMessages = await Message.countDocuments({ chatId });

    console.log(`  Remaining topics in DB: ${remainingTopics}`);
    console.log(`  Remaining chats in DB: ${remainingChats}`);
    console.log(`  Remaining messages in DB: ${remainingMessages}`);

    if (remainingTopics !== 0 || remainingChats !== 0 || remainingMessages !== 0) {
      throw new Error('Cascade deletion failed! Orphaned records detected.');
    }
    console.log('✓ Cascade deletion verified completely clean');

    console.log('\n=== ALL PHASE 04 LIVE VERIFICATION CHECKS PASSED SUCCESSFULLY ===');
  } finally {
    // Cleanup test fixtures
    await Message.deleteMany({ userId: { $in: [userA._id, userB._id] } });
    await Chat.deleteMany({ userId: { $in: [userA._id, userB._id] } });
    await Topic.deleteMany({ userId: { $in: [userA._id, userB._id] } });
    await Subject.deleteMany({ userId: { $in: [userA._id, userB._id] } });
    await UserSession.deleteMany({ userId: { $in: [userA._id, userB._id] } });
    await User.deleteMany({ _id: { $in: [userA._id, userB._id] } });
    await mongoose.disconnect();
    console.log('✓ Cleaned up test fixtures and disconnected from DB\n');
  }
}

runLiveVerification().catch((err) => {
  console.error('\n❌ Live Verification Failed:', err);
  process.exit(1);
});
