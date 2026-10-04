# ADR-015: Knowledge Extraction Engine, Concept Identity Resolution & Pedagogical Learning State

## 1. Context & Problem Statement
In LearnForge, our core architectural axiom is:
> **"Chat is the interaction layer. Knowledge is the product. Notes are the structured representation of that knowledge. AI is the pedagogical engine that evaluates and organizes it."**

Prior to Phase 06, conversational exchanges were reliably persisted (Phase 04), bound to authoritative approved syllabus versions (Phase 04.1), and processed via task-routed multi-provider AI Gateway abstractions (Phase 05). However, conversation transcripts themselves remained raw text. To transform dialogue into durable learning progress without conflating conversational transcripts with canonical knowledge, LearnForge requires an authoritative, auditable, and deterministic Knowledge Extraction Engine.

The engine must solve five core architectural challenges:
1. **Auditable Evidence Ledger**: Every automated knowledge mutation must trace back to a specific conversation message without duplicating raw chat transcripts.
2. **Durable Concept Identity**: Prevent duplicate concept creation when terms vary ("BST" vs. "Binary Search Tree") while distinguishing genuinely distinct concepts.
3. **Deterministic State Transitions & Bounded Confidence**: Prevent arbitrary AI confidence percentages from corrupting mastery scores.
4. **Pedagogical Misconception & Conflict Governance**: Flag misconceptions and contradictory statements without silently destroying historical evidence.
5. **Strict Hard Boundaries**: Update `Topic.knowledgeState` while strictly prohibiting canonical note generation (`NoteDocument` / `NoteVersion`), quiz automation, or Study Mode enforcement until their authorized phases.

---

## 2. Decision & Architecture

### A. Dedicated Persistence Models: `LearningEvent` and `Concept`
1. **`Concept` (`server/src/models/Concept.js`)**:
   - Primary canonical knowledge entity owned by `userId` and scoped to `subjectId` and `topicId`.
   - Indexed via compound unique index `{ userId: 1, topicId: 1, normalizedName: 1 }`.
   - Stores `name`, `normalizedName`, `aliases`, `normalizedAliases`, `status` (`NOT_STARTED`, `INTRODUCED`, `LEARNING`, `UNDERSTOOD`, `STRONG`, `NEEDS_REVIEW`), `confidenceScore` (0–100), `evidenceCount`, `misconceptions`, `conflictState`, and `lastStudiedAt`.

2. **`LearningEvent` (`server/src/models/LearningEvent.js`)**:
   - Immutable, tenant-scoped ledger entry recording each discrete learning observation.
   - Indexed via compound unique index `{ userId: 1, idempotencyKey: 1 }` where `idempotencyKey = \`${userId}:${sourceMessageId}:${extractionVersion}\``.
   - Stores `sourceMessageId`, `chatId`, `topicId`, `subjectId`, `conceptId`, `conceptName`, `eventType` (`concept_introduced`, `concept_explained`, `concept_recalled`, `concept_misunderstood`, `misconception_detected`, `concept_corrected`, `concept_reinforced`, `concept_conflict`, `learning_signal`), `classificationOutcome` (`NEW`, `EXISTING`, `DUPLICATE`, `COMPLEMENTARY`, `CORRECTION`, `CONFLICT`), `evidenceText`, and `confidenceScore`.

### B. Deterministic Hierarchy Matching & Concept Identity Resolution
When a candidate concept is extracted from an exchange:
1. **Exact Normalized Name Match**: Matches `{ userId, topicId, normalizedName: normalize(candidateName) }`.
2. **Normalized Alias Match**: Matches candidate name against existing concepts' `normalizedAliases`.
3. **Alias Merging**: If an existing concept matches, any new aliases in the candidate are deterministically appended to the concept's alias set.
4. **Classification Assignment**:
   - `NEW`: Concept not previously found in topic.
   - `EXISTING` / `COMPLEMENTARY`: Continuation or nuance added to existing concept.
   - `DUPLICATE`: Repeated semantic fact; attached to concept with minimal confidence increment (+2) to prevent score inflation.
   - `CORRECTION`: Resolves previous active misconception.
   - `CONFLICT`: Evidence contradicts established canonical definition; flags `concept.conflictState` without overwriting existing data.

### C. State Machine & Bounded Confidence Rules
State transitions are governed by deterministic domain rules in `LearningStateMachine`:
- **First Encounter (`concept_introduced`)**: `NOT_STARTED` → `INTRODUCED` (`confidenceScore = 20`).
- **Explanation / Nuance (`concept_explained`, `COMPLEMENTARY`)**: `INTRODUCED` → `LEARNING` (`confidenceScore` increases via bounded diminishing formula).
- **Active Recall (`concept_recalled`)**: `LEARNING` → `UNDERSTOOD` (requires `evidenceCount >= 2` and `confidenceScore >= 60`).
- **Repeated Reinforcement (`concept_reinforced`)**: `UNDERSTOOD` → `STRONG` (requires `evidenceCount >= 4` and `confidenceScore >= 80`).
- **Misconception (`misconception_detected`, `concept_misunderstood`)**: Immediate regression to `NEEDS_REVIEW` with score penalty (-20 to -35).
- **Correction (`concept_corrected`)**: Recovers from `NEEDS_REVIEW` to `LEARNING` (+15 points).
- **Diminishing Returns Formula**: `newScore = Math.min(100, Math.round(currentScore + delta * (1 - currentScore / 125)))`.
- **Topic Aggregate**: `Topic.knowledgeState.masteryScore` is the average confidence of active concepts; `Topic.status` is `mastered` only when all concepts are `UNDERSTOOD` or `STRONG` and `masteryScore >= 80`.

### D. Multi-Document Transaction Boundary
When supported on MongoDB replica sets / Atlas clusters, `LearningEvent` creation, `Concept` insertion/update, and `Topic.knowledgeState` aggregation execute inside an atomic multi-document transaction (`session.startTransaction({ readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } })`).

---

## 3. Consequences

### Positive
- **Traceability**: Every concept state change points directly to a verifiable `Message` and `Chat` record.
- **Deduplication**: Semantically identical concepts collapse into a single canonical identity.
- **Fail-Safe Resilience**: AI Gateway failures or malformed outputs fall back to deterministic heuristic extraction without corrupting the chat stream.
- **Hard Phase Isolation**: Guarantees zero `NoteDocument` or `NoteVersion` records are created before Phase 07.

### Negative / Trade-offs
- Requires maintaining two related collections (`Concept` and `LearningEvent`) alongside `Topic.knowledgeState`.
- AI extraction adds a small post-chat processing step, handled asynchronously/non-blockingly.

---

## 4. References
- [docs/features/KNOWLEDGE_ENGINE.md](file:///c:/Users/shash/OneDrive/Desktop/LearnForge/docs/features/KNOWLEDGE_ENGINE.md)
- [ADR-001: Product Architecture](file:///c:/Users/shash/OneDrive/Desktop/LearnForge/docs/decisions/ADR-001-product-architecture.md)
- [ADR-004: Knowledge Separation](file:///c:/Users/shash/OneDrive/Desktop/LearnForge/docs/decisions/ADR-004-knowledge-separation.md)
- [ADR-014: AI Gateway & Model Routing](file:///c:/Users/shash/OneDrive/Desktop/LearnForge/docs/decisions/ADR-014-ai-gateway-and-model-routing.md)
