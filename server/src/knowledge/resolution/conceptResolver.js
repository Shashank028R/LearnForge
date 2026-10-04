import { Concept, normalizeConceptName } from '../../models/Concept.js';

/**
 * Concept Resolver (Phase 06)
 * Resolves extracted candidate concept names against the tenant's existing
 * canonical concepts for the given topic using deterministic hierarchy rules.
 */
export class ConceptResolver {
  /**
   * Resolves a concept within a topic context
   */
  async resolveConcept({ userId, subjectId, topicId, candidateName, aliases = [], proposedOutcome = 'EXISTING', session = null }) {
    const normalizedCandidate = normalizeConceptName(candidateName);
    const normalizedCandidateAliases = aliases.map(normalizeConceptName).filter(Boolean);

    // 1. Match by Exact Normalized Name in the same Topic
    let concept = await Concept.findOne({
      userId,
      topicId,
      normalizedName: normalizedCandidate,
    }).session(session);

    // 2. Match by Normalized Alias in the same Topic
    if (!concept && normalizedCandidate) {
      concept = await Concept.findOne({
        userId,
        topicId,
        $or: [
          { normalizedAliases: normalizedCandidate },
          ...(normalizedCandidateAliases.length > 0 ? [{ normalizedName: { $in: normalizedCandidateAliases } }] : []),
        ],
      }).session(session);
    }

    if (concept) {
      // Existing Concept Matched: Reconcile aliases if new ones appeared
      const newAliases = [];
      for (const a of aliases) {
        const normA = normalizeConceptName(a);
        if (normA && normA !== concept.normalizedName && !concept.normalizedAliases.includes(normA)) {
          concept.aliases.push(a);
          concept.normalizedAliases.push(normA);
          newAliases.push(a);
        }
      }

      // Determine outcome: Preserve CONFLICT or CORRECTION if explicitly flagged, else EXISTING / COMPLEMENTARY / DUPLICATE
      let resolvedOutcome = proposedOutcome;
      if (proposedOutcome === 'NEW') {
        resolvedOutcome = 'EXISTING';
      }

      return {
        concept,
        isNew: false,
        classificationOutcome: resolvedOutcome,
        resolvedName: concept.name,
        newAliasesAdded: newAliases,
      };
    }

    // 3. No match found: Brand new concept
    // Preserve explicit authoritative classifications (CORRECTION, CONFLICT), otherwise default to NEW
    const resolvedOutcome =
      proposedOutcome === 'CORRECTION' || proposedOutcome === 'CONFLICT'
        ? proposedOutcome
        : proposedOutcome === 'EXISTING' || !proposedOutcome
        ? 'NEW'
        : proposedOutcome;

    return {
      concept: null,
      isNew: true,
      classificationOutcome: resolvedOutcome,
      resolvedName: candidateName,
      newAliasesAdded: aliases,
    };
  }
}
