import mongoose from 'mongoose';
import { Subject } from '../models/Subject.js';
import { Topic } from '../models/Topic.js';
import { SyllabusVersion } from '../models/SyllabusVersion.js';

/**
 * GET /api/v1/subjects/:subjectId/syllabus
 * Returns syllabus overview: current status, active version, latest draft
 */
export async function getSyllabusStatus(req, res, next) {
  try {
    const { subjectId } = req.params;
    if (!mongoose.isValidObjectId(subjectId)) {
      return res.status(404).json({ success: false, message: 'Subject not found' });
    }

    const subject = await Subject.findOne({ _id: subjectId, userId: req.user._id });
    if (!subject) {
      return res.status(404).json({ success: false, message: 'Subject not found' });
    }

    const [activeVersion, latestDraft, totalVersions] = await Promise.all([
      subject.activeSyllabusVersionId
        ? SyllabusVersion.findOne({ _id: subject.activeSyllabusVersionId, userId: req.user._id })
        : SyllabusVersion.findOne({ subjectId, userId: req.user._id, status: 'approved' }),
      SyllabusVersion.findOne({ subjectId, userId: req.user._id, status: 'draft' }).sort({ version: -1 }),
      SyllabusVersion.countDocuments({ subjectId, userId: req.user._id }),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        syllabusStatus: subject.syllabusStatus || 'no_syllabus',
        activeVersion: activeVersion || null,
        latestDraft: latestDraft || null,
        totalVersions,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/subjects/:subjectId/syllabus/versions
 * List all syllabus versions for the subject
 */
export async function listSyllabusVersions(req, res, next) {
  try {
    const { subjectId } = req.params;
    if (!mongoose.isValidObjectId(subjectId)) {
      return res.status(404).json({ success: false, message: 'Subject not found' });
    }

    const subject = await Subject.findOne({ _id: subjectId, userId: req.user._id });
    if (!subject) {
      return res.status(404).json({ success: false, message: 'Subject not found' });
    }

    const versions = await SyllabusVersion.find({ subjectId, userId: req.user._id })
      .sort({ version: -1 });

    return res.status(200).json({
      success: true,
      data: versions,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/v1/subjects/:subjectId/syllabus/versions
 * Create a new draft syllabus version
 */
export async function createSyllabusDraft(req, res, next) {
  try {
    const { subjectId } = req.params;
    if (!mongoose.isValidObjectId(subjectId)) {
      return res.status(404).json({ success: false, message: 'Subject not found' });
    }

    const subject = await Subject.findOne({ _id: subjectId, userId: req.user._id });
    if (!subject) {
      return res.status(404).json({ success: false, message: 'Subject not found' });
    }

    const { title, sections, source, changeSummary, baseVersionId } = req.body;

    // Determine next version number
    const highestVersionDoc = await SyllabusVersion.findOne({ subjectId, userId: req.user._id })
      .sort({ version: -1 })
      .select('version');
    const nextVersion = (highestVersionDoc?.version || 0) + 1;

    let initialSections = Array.isArray(sections) ? sections : [];

    // If baseVersionId provided, derive sections from that base version if no sections given
    if (initialSections.length === 0 && baseVersionId && mongoose.isValidObjectId(baseVersionId)) {
      const baseVersion = await SyllabusVersion.findOne({
        _id: baseVersionId,
        subjectId,
        userId: req.user._id,
      });
      if (baseVersion && Array.isArray(baseVersion.sections)) {
        initialSections = baseVersion.sections.map((sec) => ({
          key: sec.key || `section-${Date.now()}`,
          title: sec.title,
          description: sec.description || '',
          orderIndex: sec.orderIndex || 0,
          topics: (sec.topics || []).map((top) => ({
            key: top.key || `topic-${Date.now()}`,
            title: top.title,
            description: top.description || '',
            orderIndex: top.orderIndex || 0,
            estimatedMinutes: top.estimatedMinutes || 30,
          })),
        }));
      }
    }

    // Format & validate sections
    const formattedSections = initialSections.map((sec, secIdx) => ({
      key: sec.key || `sec-${secIdx + 1}`,
      title: (sec.title || `Section ${secIdx + 1}`).trim(),
      description: (sec.description || '').trim(),
      orderIndex: typeof sec.orderIndex === 'number' ? sec.orderIndex : secIdx,
      topics: Array.isArray(sec.topics)
        ? sec.topics.map((top, topIdx) => ({
            key: top.key || `top-${secIdx + 1}-${topIdx + 1}`,
            title: (top.title || `Topic ${topIdx + 1}`).trim(),
            description: (top.description || '').trim(),
            orderIndex: typeof top.orderIndex === 'number' ? top.orderIndex : topIdx,
            estimatedMinutes: top.estimatedMinutes || 30,
          }))
        : [],
    }));

    const newDraft = await SyllabusVersion.create({
      subjectId,
      userId: req.user._id,
      version: nextVersion,
      status: 'draft',
      title: title?.trim() || `${subject.name} Syllabus v${nextVersion}`,
      sections: formattedSections,
      source: ['user_created', 'ai_assisted', 'imported'].includes(source) ? source : 'user_created',
      changeSummary: changeSummary?.trim() || '',
    });

    if (subject.syllabusStatus === 'no_syllabus') {
      subject.syllabusStatus = 'draft';
      await subject.save();
    }

    return res.status(201).json({
      success: true,
      data: newDraft,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/subjects/:subjectId/syllabus/versions/:versionId
 * Get a specific syllabus version
 */
export async function getSyllabusVersion(req, res, next) {
  try {
    const { subjectId, versionId } = req.params;
    if (!mongoose.isValidObjectId(subjectId) || !mongoose.isValidObjectId(versionId)) {
      return res.status(404).json({ success: false, message: 'Syllabus version not found' });
    }

    const version = await SyllabusVersion.findOne({
      _id: versionId,
      subjectId,
      userId: req.user._id,
    });

    if (!version) {
      return res.status(404).json({ success: false, message: 'Syllabus version not found' });
    }

    return res.status(200).json({
      success: true,
      data: version,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * PUT /api/v1/subjects/:subjectId/syllabus/versions/:versionId
 * Update a draft syllabus version
 */
export async function updateSyllabusDraft(req, res, next) {
  try {
    const { subjectId, versionId } = req.params;
    if (!mongoose.isValidObjectId(subjectId) || !mongoose.isValidObjectId(versionId)) {
      return res.status(404).json({ success: false, message: 'Syllabus version not found' });
    }

    const version = await SyllabusVersion.findOne({
      _id: versionId,
      subjectId,
      userId: req.user._id,
    });

    if (!version) {
      return res.status(404).json({ success: false, message: 'Syllabus version not found' });
    }

    if (version.status !== 'draft') {
      return res.status(400).json({
        success: false,
        message: 'Cannot modify an approved or superseded syllabus version. Create a new draft instead.',
      });
    }

    const { title, sections, changeSummary, source } = req.body;

    if (title !== undefined) {
      version.title = String(title).trim();
    }

    if (changeSummary !== undefined) {
      version.changeSummary = String(changeSummary).trim();
    }

    if (source && ['user_created', 'ai_assisted', 'imported'].includes(source)) {
      version.source = source;
    }

    if (Array.isArray(sections)) {
      version.sections = sections.map((sec, secIdx) => ({
        key: sec.key || `sec-${secIdx + 1}`,
        title: (sec.title || `Section ${secIdx + 1}`).trim(),
        description: (sec.description || '').trim(),
        orderIndex: typeof sec.orderIndex === 'number' ? sec.orderIndex : secIdx,
        topics: Array.isArray(sec.topics)
          ? sec.topics.map((top, topIdx) => ({
              key: top.key || `top-${secIdx + 1}-${topIdx + 1}`,
              title: (top.title || `Topic ${topIdx + 1}`).trim(),
              description: (top.description || '').trim(),
              orderIndex: typeof top.orderIndex === 'number' ? top.orderIndex : topIdx,
              estimatedMinutes: top.estimatedMinutes || 30,
            }))
          : [],
      }));
    }

    await version.save();

    return res.status(200).json({
      success: true,
      data: version,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Reconcile canonical topics and Subject metadata for an approved syllabus version atomically
 */
export async function reconcileCanonicalTopics(subjectId, userId, syllabusVersion, session = null) {
  const activeSyllabusNormalizedTitles = [];
  let globalOrder = 0;

  for (const section of syllabusVersion.sections || []) {
    for (const topicItem of section.topics || []) {
      const normTitle = topicItem.title.trim().toLowerCase();
      activeSyllabusNormalizedTitles.push(normTitle);

      const updateQuery = {
        subjectId,
        userId,
        normalizedTitle: normTitle,
      };

      const updateDoc = {
        $set: {
          title: topicItem.title.trim(),
          orderIndex: globalOrder++,
          isActiveInSyllabus: true,
          ...(topicItem.description ? { description: topicItem.description.trim() } : {}),
        },
        $setOnInsert: {
          status: 'not_started',
          knowledgeState: { masteryScore: 0, keyConcepts: [], summary: '' },
          notesCount: 0,
          chatsCount: 0,
        },
      };

      const opts = { upsert: true };
      if (session) opts.session = session;

      await Topic.updateOne(updateQuery, updateDoc, opts);
    }
  }

  // Deactivate topics omitted from the approved syllabus
  const deactivateOpts = session ? { session } : {};
  await Topic.updateMany(
    {
      subjectId,
      userId,
      normalizedTitle: { $nin: activeSyllabusNormalizedTitles },
    },
    {
      $set: {
        isActiveInSyllabus: false,
      },
    },
    deactivateOpts
  );

  // Compute active topics count
  const countOpts = session ? { session } : {};
  const activeTopicsCount = await Topic.countDocuments(
    {
      subjectId,
      userId,
      isActiveInSyllabus: true,
    },
    countOpts
  );

  // Atomically update Subject metadata
  const subjectUpdateOpts = session ? { session } : {};
  await Subject.updateOne(
    {
      _id: subjectId,
      userId,
    },
    {
      $set: {
        topicsCount: activeTopicsCount,
        syllabusStatus: 'approved',
        activeSyllabusVersionId: syllabusVersion._id,
      },
    },
    subjectUpdateOpts
  );

  return activeTopicsCount;
}

/**
 * POST /api/v1/subjects/:subjectId/syllabus/versions/:versionId/approve
 * Explicitly approve a syllabus version as the active curriculum contract and reconcile canonical Topics
 */
export async function approveSyllabusVersion(req, res, next) {
  try {
    const { subjectId, versionId } = req.params;
    if (!mongoose.isValidObjectId(subjectId) || !mongoose.isValidObjectId(versionId)) {
      return res.status(404).json({ success: false, message: 'Syllabus version not found' });
    }

    const subject = await Subject.findOne({ _id: subjectId, userId: req.user._id });
    if (!subject) {
      return res.status(404).json({ success: false, message: 'Subject not found' });
    }

    const targetVersion = await SyllabusVersion.findOne({
      _id: versionId,
      subjectId,
      userId: req.user._id,
    });

    if (!targetVersion) {
      return res.status(404).json({ success: false, message: 'Syllabus version not found' });
    }

    if (targetVersion.status === 'superseded') {
      return res.status(400).json({
        success: false,
        message: 'Cannot approve a superseded syllabus version. Create a new draft instead.',
      });
    }

    // Determine if MongoDB transactions are supported on the active connection
    const supportsTransactions =
      mongoose.connection.readyState === 1 &&
      mongoose.connection.client &&
      typeof mongoose.connection.client.startSession === 'function' &&
      mongoose.connection.client.topology?.description?.type !== 'Single';

    const maxRetries = 6;
    let finalActiveCount = 0;
    let approvalSucceeded = false;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      let session = null;
      try {
        if (supportsTransactions) {
          session = await mongoose.startSession();
          session.startTransaction({
            readConcern: { level: 'snapshot' },
            writeConcern: { w: 'majority' },
          });
        }

        const sessionOpts = session ? { session } : {};

        // Reload target version inside session on each retry attempt
        const freshTarget = await SyllabusVersion.findOne(
          {
            _id: versionId,
            subjectId,
            userId: req.user._id,
          },
          null,
          sessionOpts
        );

        if (!freshTarget) {
          if (session) await session.abortTransaction();
          return res.status(404).json({ success: false, message: 'Syllabus version not found' });
        }

        // 1. Mark previous approved versions as superseded
        await SyllabusVersion.updateMany(
          {
            subjectId,
            userId: req.user._id,
            status: 'approved',
            _id: { $ne: freshTarget._id },
          },
          {
            $set: {
              status: 'superseded',
              supersededAt: new Date(),
            },
          },
          sessionOpts
        );

        // 2. Update fresh target version to approved
        freshTarget.status = 'approved';
        freshTarget.approvedAt = new Date();
        freshTarget.supersededAt = null;
        await freshTarget.save(sessionOpts);

        // Pre-reconciliation CAS Guard: Ensure fresh target version is still the active approved version
        const preCheck = await SyllabusVersion.findOne(
          { subjectId, userId: req.user._id, status: 'approved' },
          null,
          sessionOpts
        );
        if (preCheck && preCheck._id.toString() !== freshTarget._id.toString()) {
          // Lost race prior to topic reconciliation; abort this attempt
          if (session) {
            await session.abortTransaction();
          }
          if (attempt < maxRetries - 1) {
            const jitter = Math.floor(Math.random() * 40) + 30 * (attempt + 1);
            await new Promise((resolve) => setTimeout(resolve, jitter));
            continue;
          }
          break;
        }

        // 3. Reconcile canonical topics, active topic count, and Subject metadata
        finalActiveCount = await reconcileCanonicalTopics(
          subjectId,
          req.user._id,
          freshTarget,
          session
        );

        // Post-reconciliation CAS Guard: Verify no concurrent approval superseded this version during reconciliation
        const postCheck = await SyllabusVersion.findOne(
          { subjectId, userId: req.user._id, status: 'approved' },
          null,
          sessionOpts
        );

        if (postCheck && postCheck._id.toString() !== freshTarget._id.toString()) {
          // A concurrent request won and superseded this version during reconciliation
          // Re-sync canonical topics to the actual winning version to prevent stale state corruption
          if (session) {
            await session.abortTransaction();
          } else {
            await reconcileCanonicalTopics(subjectId, req.user._id, postCheck);
          }

          if (attempt < maxRetries - 1) {
            const jitter = Math.floor(Math.random() * 40) + 30 * (attempt + 1);
            await new Promise((resolve) => setTimeout(resolve, jitter));
            continue;
          }
          break;
        }

        if (session) {
          await session.commitTransaction();
        }
        approvalSucceeded = true;
        break;
      } catch (err) {
        if (session) {
          try {
            await session.abortTransaction();
          } catch (_) {}
        }

        const isRetryable =
          err.code === 11000 ||
          err.code === 112 ||
          err.codeName === 'WriteConflict' ||
          err.hasErrorLabel?.('TransientTransactionError') ||
          err.errorLabels?.includes?.('TransientTransactionError') ||
          err.errorLabels?.has?.('TransientTransactionError') ||
          err.message?.includes('Write conflict') ||
          err.message?.includes('WriteConflict') ||
          err.message?.includes('E11000');

        if (isRetryable && attempt < maxRetries - 1) {
          const jitter = Math.floor(Math.random() * 50) + 40 * (attempt + 1);
          await new Promise((resolve) => setTimeout(resolve, jitter));
          continue;
        }
        throw err;
      } finally {
        if (session) {
          await session.endSession();
        }
      }
    }

    // Always fetch the final authoritative database state
    const currentApprovedVersion = await SyllabusVersion.findOne({
      subjectId,
      userId: req.user._id,
      status: 'approved',
    });

    const updatedSubject = await Subject.findOne({ _id: subjectId, userId: req.user._id });

    return res.status(200).json({
      success: true,
      message: `Syllabus version v${targetVersion.version} approval processed`,
      data: {
        subject: updatedSubject,
        version: currentApprovedVersion || targetVersion,
        activeTopicsCount: updatedSubject ? updatedSubject.topicsCount : finalActiveCount,
      },
    });
  } catch (error) {
    next(error);
  }
}
