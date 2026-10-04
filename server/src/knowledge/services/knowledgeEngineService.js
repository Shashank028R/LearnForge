import mongoose from 'mongoose';
import { Subject } from '../../models/Subject.js';
import { Topic } from '../../models/Topic.js';
import { SyllabusVersion } from '../../models/SyllabusVersion.js';
import { Concept, normalizeConceptName } from '../../models/Concept.js';
import { LearningEvent } from '../../models/LearningEvent.js';
import { EventExtractor } from '../extraction/eventExtractor.js';
import { ConceptResolver } from '../resolution/conceptResolver.js';
import { LearningStateMachine } from '../state/learningStateMachine.js';

/**
 * Knowledge Engine Service (Phase 06)
 * Authoritative service coordinating extraction, concept identity resolution,
 * learning state transitions, and transactional persistence.
 */
export class KnowledgeEngineService {
  constructor(aiGateway = null) {
    this.aiGateway = aiGateway;
    this.extractor = new EventExtractor(aiGateway);
    this.resolver = new ConceptResolver();
    this.stateMachine = new LearningStateMachine();
    this.version = 'v1.0';
  }

  /**
   * Processes a verified chat exchange and extracts canonical learning events
   */
  async processExchangeEvidence(params) {
    const {
      userId,
      subjectId,
      topicId,
      chatId,
      sourceMessageId,
      userMessage,
      assistantMessage,
      requestId = 'unknown',
    } = params;

    // 1. Governance Check: Exclude off-topic messages from canonical knowledge mutation
    const relevance = assistantMessage?.knowledgeContext?.relevance || userMessage?.knowledgeContext?.relevance;
    if (relevance === 'off_topic') {
      return {
        skipped: true,
        reason: 'off_topic_exclusion',
        message: 'Off-topic exchange excluded from canonical knowledge extraction',
      };
    }

    // 2. Idempotency Check: Prevent duplicate event processing from same message
    const idempotencyKey = `${userId}:${sourceMessageId}:${this.version}`;
    const existingEvent = await LearningEvent.findOne({ userId, idempotencyKey });
    if (existingEvent) {
      return {
        skipped: true,
        duplicate: true,
        reason: 'already_processed',
        idempotencyKey,
      };
    }

    // 3. Domain Ownership & Authoritative Context Validation
    const subject = await Subject.findOne({ _id: subjectId, userId });
    if (!subject) {
      throw new Error(`Subject ${subjectId} not found or unauthorized for user ${userId}`);
    }

    const topic = await Topic.findOne({ _id: topicId, subjectId, userId });
    if (!topic) {
      throw new Error(`Topic ${topicId} not found or unauthorized for user ${userId}`);
    }

    // Query ONLY approved syllabus version as authoritative context
    const approvedSyllabus = await SyllabusVersion.findOne({
      subjectId,
      userId,
      status: 'approved',
    });

    const subjectContext = {
      name: subject.title || subject.name,
      description: subject.description,
      targetMasteryLevel: subject.targetMasteryLevel,
    };

    const syllabusContext = approvedSyllabus
      ? {
          version: approvedSyllabus.version,
          title: approvedSyllabus.title,
          sections: approvedSyllabus.sections,
        }
      : null;

    const topicContext = {
      title: topic.title,
      description: topic.description,
    };

    // 4. Extract Structured Learning Events
    const extractionResult = await this.extractor.extractExchangeEvents({
      userMessage,
      assistantMessage,
      subjectContext,
      syllabusContext,
      topicContext,
      userId,
      requestId,
    });

    const rawEvents = extractionResult.events || [];
    if (rawEvents.length === 0) {
      return {
        skipped: true,
        reason: 'no_concepts_extracted',
      };
    }

    // 5. Mandatory Multi-Document Transaction Boundary
    let session = null;
    try {
      session = await mongoose.startSession();
      session.startTransaction({
        readConcern: { level: 'snapshot' },
        writeConcern: { w: 'majority' },
      });
    } catch (sessionErr) {
      if (session) {
        try {
          await session.endSession();
        } catch (_) {}
      }
      const txError = new Error(
        'Knowledge state mutations require MongoDB multi-document transaction support (MongoDB Atlas or replica set). Sequential non-transactional mutation is prohibited.'
      );
      txError.code = 'TRANSACTION_UNAVAILABLE';
      txError.status = 503;
      throw txError;
    }

    try {
      const result = await this._processEventsAndPersist({
        userId,
        subjectId,
        topicId,
        chatId,
        sourceMessageId,
        idempotencyKey,
        topic,
        rawEvents,
        extractionResult,
        session,
      });

      await session.commitTransaction();
      return result;
    } catch (err) {
      try {
        await session.abortTransaction();
      } catch (_) {}
      throw err;
    } finally {
      await session.endSession();
    }
  }

  async _processEventsAndPersist({
    userId,
    subjectId,
    topicId,
    chatId,
    sourceMessageId,
    idempotencyKey,
    topic,
    rawEvents,
    extractionResult,
    session,
  }) {
    const createdEvents = [];
    const updatedConcepts = [];

    for (let i = 0; i < rawEvents.length; i++) {
      const eventData = rawEvents[i];
      const eventIdempotencyKey = rawEvents.length > 1 ? `${idempotencyKey}:e${i}` : idempotencyKey;

      // A. Concept Resolution
      const resolution = await this.resolver.resolveConcept({
        userId,
        subjectId,
        topicId,
        candidateName: eventData.conceptName,
        aliases: eventData.aliases,
        proposedOutcome: eventData.classificationOutcome,
        session,
      });

      let conceptDoc = resolution.concept;

      // B. State Transition Evaluation
      const transition = this.stateMachine.evaluateTransition({
        currentConcept: conceptDoc,
        eventData,
      });

      // C. Concept Persistence
      if (!conceptDoc) {
        // Create New Concept
        const newConcept = new Concept({
          userId,
          subjectId,
          topicId,
          name: eventData.conceptName,
          normalizedName: normalizeConceptName(eventData.conceptName),
          aliases: eventData.aliases || [],
          normalizedAliases: (eventData.aliases || []).map(normalizeConceptName).filter(Boolean),
          description: eventData.evidenceText || '',
          status: transition.newStatus,
          confidenceScore: transition.confidenceScore,
          evidenceCount: 1,
          misconceptions: eventData.misconception?.misconceptionText
            ? [
                {
                  misconceptionText: eventData.misconception.misconceptionText,
                  correctionText: eventData.misconception.correctionText,
                  detectedAt: new Date(),
                  isActive: true,
                },
              ]
            : [],
          conflictState: {
            hasConflict: eventData.classificationOutcome === 'CONFLICT',
            description: eventData.classificationOutcome === 'CONFLICT' ? eventData.evidenceText : '',
            flaggedAt: eventData.classificationOutcome === 'CONFLICT' ? new Date() : null,
          },
          lastStudiedAt: new Date(),
        });

        await newConcept.save({ session });
        conceptDoc = newConcept;
      } else {
        // Update Existing Concept
        conceptDoc.status = transition.newStatus;
        conceptDoc.confidenceScore = transition.confidenceScore;
        conceptDoc.evidenceCount = (conceptDoc.evidenceCount || 0) + 1;
        conceptDoc.lastStudiedAt = new Date();

        if (eventData.misconception?.misconceptionText) {
          conceptDoc.misconceptions.push({
            misconceptionText: eventData.misconception.misconceptionText,
            correctionText: eventData.misconception.correctionText,
            detectedAt: new Date(),
            isActive: true,
          });
        } else if (eventData.classificationOutcome === 'CORRECTION') {
          // Resolve any active misconceptions
          for (const m of conceptDoc.misconceptions) {
            if (m.isActive) {
              m.isActive = false;
              m.resolvedAt = new Date();
            }
          }
        }

        if (eventData.classificationOutcome === 'CONFLICT') {
          conceptDoc.conflictState = {
            hasConflict: true,
            description: eventData.evidenceText,
            flaggedAt: new Date(),
            resolvedAt: null,
          };
        }

        await conceptDoc.save({ session });
      }

      updatedConcepts.push(conceptDoc);

      // D. Learning Event Creation
      const learningEvent = new LearningEvent({
        userId,
        subjectId,
        topicId,
        chatId,
        sourceMessageId,
        conceptId: conceptDoc._id,
        conceptName: conceptDoc.name,
        eventType: eventData.eventType,
        classificationOutcome: resolution.classificationOutcome,
        evidenceText: eventData.evidenceText,
        confidenceScore: transition.confidenceScore,
        previousStatus: transition.previousStatus,
        newStatus: transition.newStatus,
        misconception: eventData.misconception || {},
        idempotencyKey: eventIdempotencyKey,
        metadata: {
          extractionVersion: this.version,
          provider: extractionResult.metadata?.provider || 'deterministic',
          model: extractionResult.metadata?.model || 'none',
          latencyMs: extractionResult.metadata?.latencyMs || 0,
        },
      });

      await learningEvent.save({ session });
      createdEvents.push(learningEvent);
    }

    // E. Topic KnowledgeState & Status Aggregation
    const allTopicConcepts = await Concept.find({ userId, topicId }).session(session);
    const topicAggregate = this.stateMachine.evaluateTopicAggregate(allTopicConcepts);

    topic.knowledgeState = {
      masteryScore: topicAggregate.masteryScore,
      keyConcepts: topicAggregate.keyConcepts,
      summary: extractionResult.topicSummaryUpdate || topic.knowledgeState?.summary || '',
      lastStudiedAt: new Date(),
    };
    topic.status = topicAggregate.status;

    await topic.save({ session });

    return {
      success: true,
      learningEvents: createdEvents,
      conceptsUpdated: updatedConcepts,
      topicKnowledgeState: topic.knowledgeState,
      topicStatus: topic.status,
    };
  }
}
