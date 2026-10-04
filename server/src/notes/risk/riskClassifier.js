/**
 * Risk-Based Note Proposal Classifier & Block Differ (Phase 07)
 * Evaluates candidate note updates against the current version, enforces user-authored block protection,
 * and classifies proposals into deterministic risk tiers (LOW, MEDIUM, HIGH).
 */

/**
 * Computes structured diff between existing version blocks and proposed blocks
 */
export function computeBlockDiff(currentBlocks = [], proposedBlocks = []) {
  const currentMap = new Map();
  currentBlocks.forEach((b) => currentMap.set(b.id, b));

  const proposedMap = new Map();
  proposedBlocks.forEach((b) => proposedMap.set(b.id, b));

  const addedBlockIds = [];
  const removedBlockIds = [];
  const modifiedBlocks = [];
  const unchangedBlockIds = [];

  // Check proposed blocks
  for (const pBlock of proposedBlocks) {
    if (!currentMap.has(pBlock.id)) {
      addedBlockIds.push(pBlock.id);
    } else {
      const cBlock = currentMap.get(pBlock.id);
      const isContentEqual = JSON.stringify(cBlock.content) === JSON.stringify(pBlock.content);
      const isTypeEqual = cBlock.type === pBlock.type;
      const isOrderEqual = cBlock.order === pBlock.order;

      if (isContentEqual && isTypeEqual && isOrderEqual) {
        unchangedBlockIds.push(pBlock.id);
      } else {
        modifiedBlocks.push({
          id: pBlock.id,
          type: pBlock.type,
          before: {
            type: cBlock.type,
            content: cBlock.content,
            order: cBlock.order,
            origin: cBlock.origin,
          },
          after: {
            type: pBlock.type,
            content: pBlock.content,
            order: pBlock.order,
            origin: pBlock.origin,
          },
        });
      }
    }
  }

  // Check removed blocks
  for (const cBlock of currentBlocks) {
    if (!proposedMap.has(cBlock.id)) {
      removedBlockIds.push(cBlock.id);
    }
  }

  return {
    added: addedBlockIds,
    addedBlockIds,
    deleted: removedBlockIds,
    removedBlockIds,
    modified: modifiedBlocks,
    modifiedBlocks,
    unchanged: unchangedBlockIds,
    unchangedBlockIds,
  };
}

/**
 * Evaluates the deterministic risk level of a note change proposal
 * @param {Object} params
 * @param {Array} params.currentBlocks - Blocks of the current NoteVersion
 * @param {Array} params.proposedBlocks - Proposed new blocks
 * @param {Array} params.conflictedConcepts - Concepts for this topic with active conflicts
 * @returns {Object} { riskLevel: 'LOW'|'MEDIUM'|'HIGH', reasons: string[], hasUserAuthoredConflicts: boolean, protectedBlockIds: string[], requiresApproval: boolean, diff: Object }
 */
export function classifyProposalRisk(params) {
  const { currentBlocks = [], proposedBlocks = [], conflictedConcepts = [] } = params;
  const diff = computeBlockDiff(currentBlocks, proposedBlocks);

  const currentMap = new Map();
  currentBlocks.forEach((b) => currentMap.set(b.id, b));

  const reasons = [];
  const protectedBlockIds = [];
  let hasUserAuthoredConflicts = false;
  let hasCodeModification = false;
  let hasConflictTouch = false;

  // 1. Protection Rule: Detect modifications or deletions of user-authored blocks (origin === 'user')
  for (const mod of diff.modifiedBlocks) {
    const orig = currentMap.get(mod.id);
    if (orig && (orig.origin === 'user' || orig.isUserAuthored)) {
      hasUserAuthoredConflicts = true;
      protectedBlockIds.push(mod.id);
      reasons.push(`Modifies user-authored block (${mod.type}: "${mod.id}")`);
    }
  }

  for (const remId of diff.removedBlockIds) {
    const orig = currentMap.get(remId);
    if (orig && (orig.origin === 'user' || orig.isUserAuthored)) {
      hasUserAuthoredConflicts = true;
      protectedBlockIds.push(remId);
      reasons.push(`Deletes user-authored block (${orig.type}: "${remId}")`);
    }
  }

  // 2. Code Invariant Rule: Detect code block modifications
  for (const mod of diff.modifiedBlocks) {
    if (mod.type === 'code' || mod.before?.type === 'code') {
      hasCodeModification = true;
      reasons.push(`Code block modification detected ("${mod.id}")`);
    }
  }

  // 3. Conflict Invariant Rule: Detect if note touches concepts with active conflicts
  if (conflictedConcepts && conflictedConcepts.length > 0) {
    hasConflictTouch = true;
    const names = conflictedConcepts.map((c) => c.name).join(', ');
    reasons.push(`Active concept conflict detected: topic contains active unresolved conflicts (${names})`);
  }

  // 4. Determine overall risk level
  if (hasUserAuthoredConflicts || hasCodeModification || hasConflictTouch) {
    return {
      riskLevel: 'HIGH',
      reasons,
      hasUserAuthoredConflicts,
      protectedBlockIds,
      requiresApproval: true,
      diff,
    };
  }

  // If there are modifications or deletions to existing AI-generated blocks
  if (diff.modifiedBlocks.length > 0 || diff.removedBlockIds.length > 0) {
    if (diff.removedBlockIds.length > 0) {
      reasons.push(`Removes ${diff.removedBlockIds.length} existing explanation block(s)`);
    }
    if (diff.modifiedBlocks.length > 0) {
      reasons.push(`Restructures or rewords ${diff.modifiedBlocks.length} existing block(s)`);
    }
    return {
      riskLevel: 'MEDIUM',
      reasons,
      hasUserAuthoredConflicts: false,
      protectedBlockIds: [],
      requiresApproval: true,
      diff,
    };
  }

  // Purely additive additions to note (e.g. brand new section for a newly introduced concept)
  if (diff.addedBlockIds.length > 0) {
    reasons.push(`Pure additive insertion of ${diff.addedBlockIds.length} new knowledge block(s)`);
    return {
      riskLevel: 'LOW',
      reasons,
      hasUserAuthoredConflicts: false,
      protectedBlockIds: [],
      requiresApproval: false,
      diff,
    };
  }

  // Empty diff (no changes)
  reasons.push('No functional block changes detected');
  return {
    riskLevel: 'LOW',
    reasons,
    hasUserAuthoredConflicts: false,
    protectedBlockIds: [],
    requiresApproval: false,
    diff,
  };
}
