# Knowledge Engine & Pedagogical Analysis (Phase 06)

## 1. Purpose
The Knowledge Engine converts study interactions and conversational evidence into structured, validated, and auditable representations of what the user has encountered, understood, misunderstood, or needs to review.

## 2. Core Principle
> **"Chat is evidence. Knowledge is the product. Notes are the structured representation of that knowledge. AI is the pedagogical engine that evaluates and organizes it."**

A chat transcript is evidence. It is not itself the canonical knowledge model.

---

## 3. Learning Event Pipeline

```text
Chat Exchange (User + Assistant)
          |
          v
Knowledge Governance Boundary (Off-Topic Exclusion)
          |
          v
Learning Event Extraction (AIGateway: KNOWLEDGE_EVENT_EXTRACTION)
          |
          v
Topic + Concept Identity Resolution (Exact Match -> Alias Match -> Conflict Check)
          |
          v
Existing Knowledge Lookup
          |
          +--> NEW
          +--> EXISTING
          +--> DUPLICATE (Minimal reward, no inflation)
          +--> COMPLEMENTARY (Enriches concept nuance)
          +--> CORRECTION (Resolves active misconception)
          +--> CONFLICT (Flags concept, preserves evidence)
          |
          v
Learning State Machine Evaluation
          |
          +--> Status Transition (NOT_STARTED -> INTRODUCED -> LEARNING -> UNDERSTOOD -> STRONG / NEEDS_REVIEW)
          +--> Bounded Confidence Calculation (Diminishing returns formula)
          +--> Misconception Tracking (Severity penalties: -15 to -30)
          |
          v
Atomic Multi-Document Persistence (LearningEvent + Concept + Topic.knowledgeState)
```

---

## 4. Concept Identity & Resolution
When candidate concepts are extracted:
1. **Exact Canonical Match**: Matches `{ userId, topicId, normalizedName: normalize(candidateName) }`.
2. **Normalized Alias Match**: Matches candidate name against existing concepts' `normalizedAliases` array.
3. **Alias Reconciliation**: Appends new discovered aliases/acronyms to the existing canonical `Concept`.
4. **Relationship Classification**:
   - `NEW`: Creates a new `Concept` in `INTRODUCED` status with baseline confidence (20%).
   - `EXISTING`: Continues work on established concept.
   - `DUPLICATE`: Same semantic fact restated; awards nominal increment (+2%) to prevent score inflation.
   - `COMPLEMENTARY`: Adds new properties or edge cases to concept.
   - `CORRECTION`: Resolves active misconceptions and transitions from `NEEDS_REVIEW` to `LEARNING`.
   - `CONFLICT`: Evidence contradicts established definition; sets `conflictState.hasConflict = true` without deleting existing knowledge.

---

## 5. Learning States & Transition Rules

| State | Entry Condition | Transition Trigger |
| :--- | :--- | :--- |
| `NOT_STARTED` | Default initial state | First introduction (`concept_introduced`) → `INTRODUCED` |
| `INTRODUCED` | Concept encountered for first time (`evidenceCount = 1`, score ≥ 25) | Further study (`evidenceCount >= 2`, score ≥ 40) → `LEARNING` |
| `LEARNING` | Active study underway | Recall demonstrated (`evidenceCount >= 3`, score ≥ 70) → `UNDERSTOOD` |
| `UNDERSTOOD` | Competence demonstrated | Repeated reinforcement (`evidenceCount >= 5`, score ≥ 90) → `STRONG` |
| `STRONG` | Mastery demonstrated across multiple observations | Misconception or confusion → `NEEDS_REVIEW` |
| `NEEDS_REVIEW` | Misconception or conflict detected | Valid correction (`concept_corrected`) → `LEARNING` (or `UNDERSTOOD` if `E >= 3` and score ≥ 70) |

---

## 6. Bounded Confidence Model & Ledger Immutability
Confidence is a bounded product signal (0–100), calculated deterministically via a diminishing returns formula:
$$\Delta = \text{round}\left(\text{delta} \times \max\left(0.1, 1 - \frac{S_{\text{current}}}{125}\right)\right)$$
$$\text{newScore} = \min(100, \max(0, S_{\text{current}} + \Delta))$$
- **Penalties**: High severity misconception drops score by 30 points; medium/conflict drops by 20 points; low drops by 15 points.
- **Append-Only Immutability**: `LearningEvent` is an immutable audit ledger with `{ createdAt: true, updatedAt: false }`. Updates, replacements, or deletions are rejected at the schema and domain service layer.
- **Mandatory Transactions**: Multi-document operations across `LearningEvent`, `Concept`, and `Topic.knowledgeState` must execute within MongoDB transactions (`session.startTransaction()`); sequential uncommitted fallback is prohibited.
- **Topic Mastery**: `Topic.knowledgeState.masteryScore` is the average confidence of all active topic concepts.
- **Topic Status**: `mastered` only when all concepts are `UNDERSTOOD` or `STRONG` with `masteryScore >= 80`.

---

## 7. Hard Phase Boundaries
- **Phase 06 owns**: `Concept`, `LearningEvent`, `Topic.knowledgeState`, and `Topic.status`.
- **Phase 06 DOES NOT touch**: `NoteDocument`, `NoteVersion`, note generation, Study Mode sessions, quiz generation, or PDF exports.
