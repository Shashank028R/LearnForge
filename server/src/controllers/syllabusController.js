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

    const now = new Date();

    // Mark previous approved version as superseded
    await SyllabusVersion.updateMany(
      {
        subjectId,
        userId: req.user._id,
        status: 'approved',
        _id: { $ne: targetVersion._id },
      },
      {
        $set: {
          status: 'superseded',
          supersededAt: now,
        },
      }
    );

    // Update target version to approved
    targetVersion.status = 'approved';
    targetVersion.approvedAt = now;
    await targetVersion.save();

    // Reconcile Canonical Topics
    // Flatten topics from all sections in order
    const activeSyllabusNormalizedTitles = new Set();
    const flattenedTopics = [];
    let globalOrder = 0;
    for (const section of targetVersion.sections || []) {
      for (const topicItem of section.topics || []) {
        const normTitle = topicItem.title.trim().toLowerCase();
        activeSyllabusNormalizedTitles.add(normTitle);
        flattenedTopics.push({
          title: topicItem.title.trim(),
          normalizedTitle: normTitle,
          description: topicItem.description ? topicItem.description.trim() : '',
          orderIndex: globalOrder++,
        });
      }
    }

    // Find all existing topics for this subject
    const existingTopics = await Topic.find({ subjectId, userId: req.user._id });
    const existingByNormalized = new Map();
    existingTopics.forEach((t) => existingByNormalized.set(t.normalizedTitle, t));

    if (flattenedTopics.length > 0) {
      for (const item of flattenedTopics) {
        if (existingByNormalized.has(item.normalizedTitle)) {
          // Stable identity preservation: update title, orderIndex, isActiveInSyllabus without recreating
          const existing = existingByNormalized.get(item.normalizedTitle);
          existing.title = item.title;
          existing.orderIndex = item.orderIndex;
          existing.isActiveInSyllabus = true; // Reactivate if was previously historical
          if (item.description) {
            existing.description = item.description;
          }
          await existing.save();
        } else {
          // Create new canonical topic as active
          await Topic.create({
            subjectId,
            userId: req.user._id,
            title: item.title,
            normalizedTitle: item.normalizedTitle,
            description: item.description,
            orderIndex: item.orderIndex,
            status: 'not_started',
            isActiveInSyllabus: true,
            knowledgeState: {},
            notesCount: 0,
            chatsCount: 0,
          });
        }
      }
    }

    // Mark existing topics NOT in the new syllabus as inactive/historical
    // Retains stable _id, knowledgeState, notesCount, chatsCount, description
    for (const existing of existingTopics) {
      if (!activeSyllabusNormalizedTitles.has(existing.normalizedTitle) && existing.isActiveInSyllabus !== false) {
        existing.isActiveInSyllabus = false;
        await existing.save();
      }
    }

    // Reconcile subject topicsCount strictly to active syllabus topics
    const activeTopicsCount = await Topic.countDocuments({
      subjectId,
      userId: req.user._id,
      isActiveInSyllabus: true,
    });
    subject.topicsCount = activeTopicsCount;
    subject.syllabusStatus = 'approved';
    subject.activeSyllabusVersionId = targetVersion._id;
    await subject.save();

    return res.status(200).json({
      success: true,
      message: `Syllabus version v${targetVersion.version} approved successfully`,
      data: {
        subject,
        version: targetVersion,
        activeTopicsCount,
      },
    });
  } catch (error) {
    next(error);
  }
}
