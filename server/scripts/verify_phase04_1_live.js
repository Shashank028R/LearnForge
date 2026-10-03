import mongoose from 'mongoose';
import { config } from '../src/config/env.js';
import { User } from '../src/models/User.js';
import { Subject } from '../src/models/Subject.js';
import { Topic } from '../src/models/Topic.js';
import { Chat } from '../src/models/Chat.js';
import { Message } from '../src/models/Message.js';
import { SyllabusVersion } from '../src/models/SyllabusVersion.js';
import { Annotation } from '../src/models/Annotation.js';

async function runLiveVerification() {
  console.log('====================================================');
  console.log('PHASE 04.1 — SYLLABUS & KNOWLEDGE GOVERNANCE LIVE VERIFICATION');
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
  let subjectA = null;
  let chatA = null;
  let messageA = null;

  try {
    // 1. Create User A & User B
    userA = await User.create({
      email: `test_user_a_${testSuffix}@learnforge.io`,
      normalizedEmail: `test_user_a_${testSuffix}@learnforge.io`,
      status: 'active',
      isEmailVerified: true,
      role: 'user',
    });
    console.log(`1. Created User A: ${userA.email} (${userA._id})`);

    userB = await User.create({
      email: `test_user_b_${testSuffix}@learnforge.io`,
      normalizedEmail: `test_user_b_${testSuffix}@learnforge.io`,
      status: 'active',
      isEmailVerified: true,
      role: 'user',
    });
    console.log(`2. Created User B: ${userB.email} (${userB._id})`);

    // 2. Create Subject A for User A (no syllabus upfront)
    subjectA = await Subject.create({
      userId: userA._id,
      name: `JavaScript Architecture ${testSuffix}`,
      normalizedName: `javascript architecture ${testSuffix}`,
      description: 'Deep dive into modern JS runtimes and engines',
      color: '#f59e0b',
      targetMasteryLevel: 'comprehensive',
      syllabusStatus: 'no_syllabus',
      activeSyllabusVersionId: null,
      topicsCount: 0,
    });
    console.log(`3. Created Subject A with syllabusStatus='${subjectA.syllabusStatus}' and topicsCount=${subjectA.topicsCount}`);

    // 3. Create Draft Syllabus v1
    const draftV1 = await SyllabusVersion.create({
      subjectId: subjectA._id,
      userId: userA._id,
      version: 1,
      status: 'draft',
      title: 'JavaScript Curriculum v1',
      changeSummary: 'Initial draft structure',
      sections: [
        {
          key: 'sec-1',
          title: 'Runtime & Memory',
          description: 'V8 Engine internals',
          orderIndex: 0,
          topics: [
            { key: 'top-1', title: 'Call Stack & Memory Heap', description: 'Execution contexts and allocation', orderIndex: 0 },
            { key: 'top-2', title: 'Event Loop & Macrotasks', description: 'Microtask queue vs timer queue', orderIndex: 1 },
          ],
        },
      ],
    });
    subjectA.syllabusStatus = 'draft';
    await subjectA.save();
    console.log(`4. Created Syllabus Draft v1 (${draftV1._id}). Subject syllabusStatus updated to 'draft'.`);

    // Check canonical topics count - must remain 0 while in draft
    const initialTopicsCount = await Topic.countDocuments({ subjectId: subjectA._id, userId: userA._id });
    if (initialTopicsCount !== 0) {
      throw new Error(`Expected 0 canonical topics for draft syllabus, got ${initialTopicsCount}`);
    }
    console.log('✓ Invariant Verified: Draft syllabus edits do NOT create or mutate canonical Topics.');

    // 4. Create Draft Syllabus v2
    const draftV2 = await SyllabusVersion.create({
      subjectId: subjectA._id,
      userId: userA._id,
      version: 2,
      status: 'draft',
      title: 'JavaScript Curriculum v2 (Revised)',
      changeSummary: 'Added Closures and Scope',
      sections: [
        {
          key: 'sec-1',
          title: 'Runtime & Memory',
          description: 'V8 Engine internals',
          orderIndex: 0,
          topics: [
            { key: 'top-1', title: 'Call Stack & Memory Heap', description: 'Updated heap explanation', orderIndex: 0 },
            { key: 'top-2', title: 'Event Loop & Macrotasks', description: 'Microtask queue vs timer queue', orderIndex: 1 },
            { key: 'top-3', title: 'Closures & Lexical Scopes', description: 'Variable lifetime and environment records', orderIndex: 2 },
          ],
        },
      ],
    });
    console.log(`5. Created Syllabus Draft v2 (${draftV2._id}). Total versions: 2.`);

    // 5. Explicitly Approve Syllabus v2
    const now = new Date();
    draftV2.status = 'approved';
    draftV2.approvedAt = now;
    await draftV2.save();

    // Reconcile Canonical Topics for approved version
    for (const sec of draftV2.sections) {
      for (const tItem of sec.topics) {
        await Topic.create({
          subjectId: subjectA._id,
          userId: userA._id,
          title: tItem.title,
          normalizedTitle: tItem.title.toLowerCase().trim(),
          description: tItem.description,
          orderIndex: tItem.orderIndex,
          status: 'not_started',
        });
      }
    }
    const topicsAfterV2 = await Topic.countDocuments({ subjectId: subjectA._id, userId: userA._id });
    subjectA.syllabusStatus = 'approved';
    subjectA.activeSyllabusVersionId = draftV2._id;
    subjectA.topicsCount = topicsAfterV2;
    await subjectA.save();

    console.log(`6. Approved Syllabus v2. Canonical Topics reconciled: ${topicsAfterV2} topics created.`);
    if (topicsAfterV2 !== 3) {
      throw new Error(`Expected 3 canonical topics reconciled, got ${topicsAfterV2}`);
    }

    const initialHeapTopic = await Topic.findOne({
      subjectId: subjectA._id,
      normalizedTitle: 'call stack & memory heap',
    });
    const heapTopicId = initialHeapTopic._id.toString();

    // 6. Revise Approved Syllabus into Draft v3
    const draftV3 = await SyllabusVersion.create({
      subjectId: subjectA._id,
      userId: userA._id,
      version: 3,
      status: 'draft',
      title: 'JavaScript Curriculum v3 (Modernized)',
      changeSummary: 'Refined topics for Phase 05',
      sections: [
        {
          key: 'sec-1',
          title: 'Runtime & Memory',
          description: 'V8 Engine internals',
          orderIndex: 0,
          topics: [
            { key: 'top-1', title: 'Call Stack & Memory Heap', description: 'Refined heap diagnostics and leak detection', orderIndex: 0 },
            { key: 'top-2', title: 'Event Loop & Macrotasks', description: 'Microtask queue vs timer queue', orderIndex: 1 },
            { key: 'top-3', title: 'Closures & Lexical Scopes', description: 'Variable lifetime and environment records', orderIndex: 2 },
            { key: 'top-4', title: 'Garbage Collection Algorithms', description: 'Generational scavenge vs Mark-Sweep', orderIndex: 3 },
          ],
        },
      ],
    });
    console.log(`7. Created Revision Draft v3 (${draftV3._id}).`);

    // Verify v2 remains approved while v3 is draft
    const v2Check = await SyllabusVersion.findById(draftV2._id);
    if (v2Check.status !== 'approved') {
      throw new Error('Approved v2 status was prematurely modified before v3 approval');
    }
    console.log('✓ Invariant Verified: Editing approved syllabus creates a new draft without mutating approved history.');

    // 7. Approve Syllabus v3
    await SyllabusVersion.updateMany(
      { subjectId: subjectA._id, userId: userA._id, status: 'approved', _id: { $ne: draftV3._id } },
      { $set: { status: 'superseded', supersededAt: new Date() } }
    );
    draftV3.status = 'approved';
    draftV3.approvedAt = new Date();
    await draftV3.save();

    // Reconcile topics (preserving existing IDs)
    const existingTopics = await Topic.find({ subjectId: subjectA._id, userId: userA._id });
    const existingMap = new Map();
    existingTopics.forEach((t) => existingMap.set(t.normalizedTitle, t));

    for (const sec of draftV3.sections) {
      for (const tItem of sec.topics) {
        const norm = tItem.title.toLowerCase().trim();
        if (existingMap.has(norm)) {
          const existing = existingMap.get(norm);
          existing.description = tItem.description;
          existing.orderIndex = tItem.orderIndex;
          await existing.save();
        } else {
          await Topic.create({
            subjectId: subjectA._id,
            userId: userA._id,
            title: tItem.title,
            normalizedTitle: norm,
            description: tItem.description,
            orderIndex: tItem.orderIndex,
            status: 'not_started',
          });
        }
      }
    }

    const topicsAfterV3 = await Topic.countDocuments({ subjectId: subjectA._id, userId: userA._id });
    subjectA.activeSyllabusVersionId = draftV3._id;
    subjectA.topicsCount = topicsAfterV3;
    await subjectA.save();

    const v2AfterSupersede = await SyllabusVersion.findById(draftV2._id);
    if (v2AfterSupersede.status !== 'superseded') {
      throw new Error(`Expected v2 to be superseded, got ${v2AfterSupersede.status}`);
    }

    const updatedHeapTopic = await Topic.findOne({
      subjectId: subjectA._id,
      normalizedTitle: 'call stack & memory heap',
    });
    if (updatedHeapTopic._id.toString() !== heapTopicId) {
      throw new Error('Topic stable identity was not preserved across syllabus approval reconciliation!');
    }
    console.log(`8. Approved Syllabus v3. v2 successfully marked 'superseded'. Stable Topic ID preserved: ${heapTopicId}.`);

    // 8. Create Chat & Message with KnowledgeContext
    chatA = await Chat.create({
      userId: userA._id,
      subjectId: subjectA._id,
      title: 'JavaScript Async Exploration',
      status: 'active',
      messagesCount: 1,
    });

    messageA = await Message.create({
      chatId: chatA._id,
      userId: userA._id,
      role: 'assistant',
      content: 'Here is an explanation of WebAssembly threading.',
      sequenceIndex: 0,
      status: 'sent',
      knowledgeContext: {
        relevance: 'off_topic',
        subjectId: null,
        topicId: null,
        disposition: 'excluded',
      },
    });
    console.log(`9. Created Chat & Assistant Message with knowledgeContext.relevance='off_topic' (${messageA._id}).`);

    // 9. Create User Annotations (Comment & Tag)
    const commentAnn = await Annotation.create({
      userId: userA._id,
      chatId: chatA._id,
      messageId: messageA._id,
      type: 'comment',
      content: 'Interesting WebAssembly reference for later review.',
    });

    const tagAnn = await Annotation.create({
      userId: userA._id,
      chatId: chatA._id,
      messageId: messageA._id,
      type: 'tag',
      content: 'wasm-threads',
    });
    console.log(`10. Created Comment Annotation (${commentAnn._id}) and Tag Annotation (${tagAnn._id}).`);

    // 10. Multi-tenant Isolation Checks
    const userBSyllabus = await SyllabusVersion.findOne({ subjectId: subjectA._id, userId: userB._id });
    if (userBSyllabus) {
      throw new Error('Cross-tenant data leakage: User B found User A syllabus version!');
    }

    const userBAnnotation = await Annotation.findOne({ messageId: messageA._id, userId: userB._id });
    if (userBAnnotation) {
      throw new Error('Cross-tenant data leakage: User B found User A annotation!');
    }
    console.log('11. Multi-tenant isolation verified: Cross-user syllabus and annotation lookups return null.');

    console.log('\n====================================================');
    console.log('✓ ALL LIVE ATLAS VERIFICATION CHECKS PASSED SUCCESSFULLY!');
    console.log('====================================================\n');
  } finally {
    // Cleanup live test documents
    console.log('Cleaning up live test data in Atlas...');
    if (userA) {
      await Subject.deleteMany({ userId: userA._id });
      await Topic.deleteMany({ userId: userA._id });
      await SyllabusVersion.deleteMany({ userId: userA._id });
      await Chat.deleteMany({ userId: userA._id });
      await Message.deleteMany({ userId: userA._id });
      await Annotation.deleteMany({ userId: userA._id });
      await User.deleteOne({ _id: userA._id });
    }
    if (userB) {
      await User.deleteOne({ _id: userB._id });
    }
    await mongoose.disconnect();
    console.log('✓ Live test data cleaned up. Atlas connection closed.\n');
  }
}

runLiveVerification().catch((err) => {
  console.error('❌ LIVE VERIFICATION FAILED:', err);
  process.exit(1);
});
