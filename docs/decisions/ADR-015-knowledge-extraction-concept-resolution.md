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
   - Indexed via compound unique index `{ userId: 1, idempotencyKey: 1 }` where base `idempotencyKey = \`${userId}:${sourceMessageId}:${extractionVersion}\`` (with `:e${i}` suffixes for multi-event exchanges), ensuring strict exchange-level idempotency.
   - Stores `sourceMessageId`, `chatId`, `topicId`, `subjectId`, `conceptId`, `conceptName`, `eventType` (`concept_introduced`, `concept_explained`, `concept_recalled`, `concept_misunderstood`, `misconception_detected`, `concept_corrected`, `concept_reinforced`, `concept_conflict`, `learning_signal`), `classificationOutcome` (`NEW`, `EXISTING`, `DUPLICATE`, `COMPLEMENTARY`, `CORRECTION`, `CONFLICT`), `evidenceText`, and `confidenceScore`.

### B. Deterministic Hierarchy Matching & Concept Identity Resolution
When a candidate concept is extracted from an exchange:
1. **Exact Normalized Name Match**: Matches `{ userId, topicId, normalizedName: normalize(candidateName) }`.
2. **Normalized Alias Match**: Matches candidate name against existing concepts' `normalizedAliases`.
3. **Alias Merging**: If an existing concept matches, any new aliases in the candidate are deterministically appended to the concept's alias set.
4. **Classification Assignment**:
   - `NEW`: Concept not previously found in topic.
   - `EXISTING` / `COMPLEMENTARY`: Continuation or nuance added to existing concept.
   - `DUPLICATE`: Repeated semantic fact; attached to concept with bounded confidence increment (+1% to +5%, formula $\Delta = \text{round}\left(5 \times \max\left(0.1, 1 - \frac{S_{\text{current}}}{125}\right)\right)$) to prevent score inflation.
   - `CORRECTION`: Resolves previous active misconception and recovers state from `NEEDS_REVIEW` to `LEARNING` / `UNDERSTOOD`.
   - `CONFLICT`: Evidence contradicts established canonical definition; flags `concept.conflictState` without overwriting existing data.

### C. State Machine & Bounded Confidence Rules
State transitions are governed by deterministic domain rules in `LearningStateMachine`:
- **Correction Precedence (`concept_corrected`, `CORRECTION`)**: Evaluated first; recovers from `NEEDS_REVIEW` to `LEARNING` (+15 points, or `UNDERSTOOD` if `evidenceCount >= 3` and `confidenceScore >= 70`).
- **First Encounter (`concept_introduced`)**: `NOT_STARTED` → `INTRODUCED` (`confidenceScore = 25`, `evidenceCount = 1`).
- **Explanation / Nuance (`concept_explained`, `COMPLEMENTARY`)**: `INTRODUCED` → `LEARNING` (requires `evidenceCount >= 2` and `confidenceScore >= 40`).
- **Active Recall (`concept_recalled`)**: `LEARNING` → `UNDERSTOOD` (requires `evidenceCount >= 3` and `confidenceScore >= 70`).
- **Repeated Reinforcement (`concept_reinforced`)**: `UNDERSTOOD` → `STRONG` (requires `evidenceCount >= 5` and `confidenceScore >= 90`).
- **Misconception / Conflict (`misconception_detected`, `concept_misunderstood`, `CONFLICT`)**: Immediate regression to `NEEDS_REVIEW` with deterministic score penalty (-15 to -30).
- **Diminishing Returns Formula**: $\Delta = \text{round}\left(\text{delta} \times \max\left(0.1, 1 - \frac{S_{\text{current}}}{125}\right)\right)$.
- **Ledger Immutability**: `LearningEvent` is an append-only audit ledger with `{ createdAt: true, updatedAt: false }` and pre-hook guards preventing mutations, updates, replacements, or deletions (`save` if !isNew, `updateOne`, `updateMany`, `findOneAndUpdate`, `replaceOne`, `findOneAndReplace`, `deleteOne`, `deleteMany`, `findOneAndDelete`).
- **Topic Aggregate**: `Topic.knowledgeState.masteryScore` is the average confidence of active concepts; `Topic.status` is `mastered` only when all concepts are `UNDERSTOOD` or `STRONG` and `masteryScore >= 80`.

### D. Multi-Document Transaction Boundary
Multi-document operations across `LearningEvent` creation, `Concept` insertion/update, and `Topic.knowledgeState` aggregation must execute inside an atomic multi-document transaction (`session.startTransaction({ readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } })`) on MongoDB Atlas or replica sets. Sequential uncommitted execution is prohibited.

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
