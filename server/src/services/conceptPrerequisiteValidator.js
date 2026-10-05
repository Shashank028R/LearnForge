import mongoose from 'mongoose';

/**
 * Validates canonical concept prerequisites graph:
 * 1. Self-reference check (P_i !== conceptId)
 * 2. Tenant isolation (all P_i belong to the same userId)
 * 3. Subject isolation (all P_i belong to the same subjectId as the target concept)
 * 4. Acyclicity check (no transitive cycles where conceptId is reachable from any P_i)
 */
export async function validatePrerequisitesGraph(userId, conceptId, prerequisiteIds = [], ConceptModel, targetSubjectId = null) {
  if (!prerequisiteIds || prerequisiteIds.length === 0) {
    return { valid: true, sanitizedIds: [] };
  }

  const strConceptId = conceptId ? conceptId.toString() : null;
  const uId = new mongoose.Types.ObjectId(userId);
  const sanitizedIds = prerequisiteIds.map((id) => (id instanceof mongoose.Types.ObjectId ? id : new mongoose.Types.ObjectId(id)));
  const strPrereqIds = sanitizedIds.map((id) => id.toString());

  // 1. Self-reference check
  if (strConceptId && strPrereqIds.includes(strConceptId)) {
    throw new Error('Self-reference violation: A concept cannot be its own prerequisite.');
  }

  // 2. Resolve target subjectId if not provided directly
  let resolvedSubjectId = targetSubjectId ? targetSubjectId.toString() : null;
  if (!resolvedSubjectId && strConceptId) {
    const targetQuery = ConceptModel.findOne({ _id: conceptId, userId: uId }, { subjectId: 1 });
    const targetDoc = targetQuery && typeof targetQuery.lean === 'function' ? await targetQuery.lean() : await targetQuery;
    if (targetDoc && targetDoc.subjectId) {
      resolvedSubjectId = targetDoc.subjectId.toString();
    }
  }

  // 3. Tenant isolation & existence check
  const findQuery = ConceptModel.find(
    {
      _id: { $in: sanitizedIds },
      userId: uId,
    },
    { _id: 1, subjectId: 1, prerequisites: 1 }
  );
  const existingPrereqs = findQuery && typeof findQuery.lean === 'function' ? await findQuery.lean() : await findQuery;

  if (!existingPrereqs || existingPrereqs.length !== sanitizedIds.length) {
    throw new Error('Tenant isolation / missing prerequisite violation: One or more prerequisite concepts do not exist or belong to another user.');
  }

  // 4. Subject isolation check
  if (resolvedSubjectId) {
    const hasCrossSubjectPrereq = existingPrereqs.some(
      (p) => !p.subjectId || p.subjectId.toString() !== resolvedSubjectId
    );
    if (hasCrossSubjectPrereq) {
      throw new Error('Subject isolation violation: Prerequisite concepts must belong to the same subject.');
    }
  }

  // 5. Acyclicity check (DFS transitive dependency graph traversal)
  if (strConceptId) {
    const visited = new Set();
    const queue = [...sanitizedIds];

    while (queue.length > 0) {
      const currentId = queue.shift().toString();
      if (currentId === strConceptId) {
        throw new Error('Cycle violation: Prerequisite graph contains a cycle (concept cannot transitively depend on itself).');
      }

      if (!visited.has(currentId)) {
        visited.add(currentId);
        const nodeQuery = ConceptModel.findOne(
          { _id: currentId, userId: uId },
          { prerequisites: 1 }
        );
        const node = nodeQuery && typeof nodeQuery.lean === 'function' ? await nodeQuery.lean() : await nodeQuery;

        if (node && Array.isArray(node.prerequisites)) {
          for (const nextId of node.prerequisites) {
            const strNext = nextId.toString();
            if (strNext === strConceptId) {
              throw new Error('Cycle violation: Prerequisite graph contains a cycle (concept cannot transitively depend on itself).');
            }
            if (!visited.has(strNext)) {
              queue.push(nextId);
            }
          }
        }
      }
    }
  }

  return { valid: true, sanitizedIds };
}

/**
 * Pure evaluation of prerequisite satisfaction against current learning states.
 * Prerequisite is satisfied iff:
 * - prerequisite learning state exists
 * - masteryStatus in ['UNDERSTOOD', 'MASTERED']
 * - decayedScore >= 50
 * - activeMisconceptions.length === 0
 */
export function checkPrerequisitesSatisfied(prerequisiteIds = [], prerequisiteStatesMap = new Map()) {
  if (!prerequisiteIds || prerequisiteIds.length === 0) {
    return { satisfied: true, unmetPrerequisiteIds: [] };
  }

  const unmetPrerequisiteIds = [];

  for (const prereqId of prerequisiteIds) {
    const strId = prereqId.toString();
    const state = prerequisiteStatesMap.get ? prerequisiteStatesMap.get(strId) : prerequisiteStatesMap[strId];

    if (!state) {
      unmetPrerequisiteIds.push(prereqId);
      continue;
    }

    const isStatusOk = ['UNDERSTOOD', 'MASTERED'].includes(state.masteryStatus);
    const isScoreOk = (typeof state.decayedScore === 'number' ? state.decayedScore : 0) >= 50;
    const hasNoActiveMisconceptions = !state.activeMisconceptions || state.activeMisconceptions.length === 0;

    if (!isStatusOk || !isScoreOk || !hasNoActiveMisconceptions) {
      unmetPrerequisiteIds.push(prereqId);
    }
  }

  return {
    satisfied: unmetPrerequisiteIds.length === 0,
    unmetPrerequisiteIds,
  };
}
