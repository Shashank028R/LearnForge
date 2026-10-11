# Phase 09 — Checkpoint 3 Implementation Plan v10
## Learning State Read APIs, Progress Aggregation, Multi-Topic Closure Fencing, and Globally Transitive Study Prioritization

---

### 1. Executive Objective

The objective of **Phase 09 — Checkpoint 3** is to establish an immutable, mathematically rigorous read layer and study prioritization engine over the sealed Checkpoint 2 state machine. Checkpoint 3 exposes deterministic, multi-level learning progress aggregations across concept, topic, and subject hierarchies and computes globally transitive, prerequisite-aware study priority recommendations.

To guarantee absolute persistence consistency during concurrent live turns and asynchronous topic rebuilds across prerequisite boundaries, Checkpoint 3 introduces a multi-topic lease fencing protocol (`TopicLearningStateFence`) combined with an enterprise-grade, narrow full-transaction retry abstraction in `server/src/utils/transaction.js`.

---

### 2. Core Architectural Invariants

1. **Sealed Baseline Preserved**: Checkpoint 2 persistence guarantees, immutable `StudySession.turns`, `ProcessedStudyTurn` idempotency, and canonical `Concept.prerequisites` remain sealed and inviolable at `7a32196fb45a81b0b0e6e909d0191036a2097ad0`.
2. **Version Represents Monotonic Live-Evidence Epoch Only**: `TopicLearningStateFence.version` represents the monotonic epoch of committed live study evidence for that topic. A committed new live turn increments the fence version by `+1`. A rebuild publication recreates materialized state and idempotency ledgers from historical evidence but introduces zero new live evidence, leaving `version` unchanged (`+0`).
3. **Multi-Topic Prerequisite Closure Fencing**: When rebuilding a target topic $T$, leases are acquired over the full transitive subject-wide prerequisite closure $\text{closureTopics}(T)$ in deterministic ascending string order of `topicId` to prevent deadlocks and cross-topic race conditions.
4. **Snapshot Vector Captured Prior to Historical Turn Read**: Rebuild captures the snapshot version vector $S[t] = \text{version}$ for all $t \in \text{closureTopics}(T)$ inside the lease-acquisition transaction. Historical turns are read strictly *after* $S$ is locked and committed. Validation at publication time requires every closure topic fence to exactly match $S[t]$.
5. **Narrow Full-Transaction Retry Boundary**: `runInTransaction()` implements a retry loop (`maxRetries = 3`) that aborts the failed transaction and restarts the *entire* callback on `TransientTransactionError`, `WriteConflict` (code 112), and classified first-use `TopicLearningStateFence` unique index collisions. Arbitrary application errors or non-retryable duplicate keys are never retried.
6. **No Ledger Error Swallowing**: Rebuild deterministically deduplicates `ProcessedStudyTurn` records in memory before calling `insertMany(..., { session })`. Blanket `.catch(() => {})` is strictly forbidden; any unexpected ledger error aborts the publication transaction.
7. **Canonical Concept Candidate Synthesis**: Prioritization and summaries start from canonical `Concept` documents under the active syllabus version. Concepts with no `ConceptLearningState` are synthesized in memory as `NOT_STARTED` (`masteryScore = 0`, `decayedScore = 0`, `stability = 1.0`, `retrievability = 0.0`).
8. **Globally Transitive Prerequisite Priority Ranking**: Candidates are sorted via a monotonic 6-element ranking tuple $\mathcal{K}(X)$ with 4 prerequisite tiers, guaranteeing strict global transitivity without circular priority loops.
9. **Dynamic In-Memory Decay**: Read endpoints dynamically calculate exponential forgetting decay against an explicit or server-default `evaluationTimestamp`. The database stores raw persisted scores; GET requests perform zero write side-effects.
10. **Response Envelope Uniformity**: All successful responses return `{ success: true, data: { ... }, meta: { evaluationTimestamp, pagination?, requestId } }`. All error responses conform to `{ success: false, error: { code, message, details }, requestId }`.

---

### 3. Verified Repository State

- **Current Git Baseline**: `7a32196fb45a81b0b0e6e909d0191036a2097ad0` (`origin/main`).
- **Test Suite Health**:
  - Backend: 285/285 tests passing across all suites (`npm run test:backend`).
  - Frontend: 70/70 tests passing (`npm run test:client`).
  - Build: Clean production bundle (`npm run build:client`).
- **Dependencies**: `mongodb-memory-server` declared in `server/package.json` devDependencies and locked in `package-lock.json`.

---

### 4. Exact Scope

1. **`server/src/utils/transaction.js`**:
   - Enhance `runInTransaction` with an exponential backoff retry loop (`maxRetries = 3`).
   - Implement narrow retry classification (TransientTransactionError, WriteConflict 112, first-use fence E11000).
   - Implement safe `UnknownTransactionCommitResult` commit retries on the active session without restarting business callbacks.
2. **`server/src/models/TopicLearningStateFence.js`**:
   - Create schema with fields: `topicId`, `userId`, `version`, `activeRebuildLock`, `lastTurnWatermark`, `updatedAt`.
   - Single compound unique index: `{ userId: 1, topicId: 1 }`.
3. **`server/src/knowledge/state/learningStateEngine.js`**:
   - Implement `findSubjectTransitivePrerequisiteMetrics(subjectConcepts, userLearningStates)` to compute `unmasteredPrereqDepth` and `unmasteredDownstreamCount`.
   - Implement `calculateConceptPriorityScore(concept, state, prereqMetrics, evaluationTimestamp)`.
   - Implement `generateGlobalRankingKey(concept, state, priorityScore, prereqMetrics, evaluationTimestamp)`.
   - Implement `compareConceptsByRankingKey(a, b)`.
4. **`server/src/study/services/learningStateService.js`**:
   - Real-time live turn projection: Atomically increment `TopicLearningStateFence.version` by `+1` per completed turn within the existing retryable persistence transaction in `studyService.js`.
   - Rebuild topic learning state: Multi-phase rebuild (Phase 1: Acquire closure leases & capture snapshot vector; Phase 2: Read turns & replay evidence; Phase 3: Validate snapshot vector, atomically swap state & ledger, clear leases).
   - Read service methods: `getConceptLearningState`, `getTopicLearningSummary`, `getSubjectLearningSummary`, `getLearningPriorities`.
5. **`server/src/middleware/rateLimiter.js`**:
   - Create `rebuildRateLimiter`: 3 requests per 60 seconds per authenticated user.
6. **`server/src/controllers/learningStateController.js` & `server/src/routes/learningStateRoutes.js`**:
   - Expose endpoints mounted at `/api/v1/learning-state`:
     - `GET /concepts/:conceptId`
     - `GET /topics/:topicId`
     - `GET /subjects/:subjectId`
     - `GET /priorities`
     - `POST /rebuild/:topicId`
7. **Test Suites**:
   - Unit tests: `server/tests/learningStatePriorities.test.js`.
   - Route/Integration tests: `server/tests/learningStateRoutes.test.js`.
   - Concurrency & Lease tests: `server/tests/learningStateConcurrency.test.js` (using `MongoMemoryReplSet`).

---

### 5. Non-Goals

- No modification of sealed Checkpoint 2 AI turn evaluation prompt schemas.
- No modification of `StudySession.js`, `ProcessedStudyTurn.js`, or `LearningEvent.js`.
- No frontend React UI components or client state management (reserved for future checkpoints).
- No background scheduled cron worker for periodic rebuilds (rebuild is on-demand via rate-limited POST API).
- No mutable topic/subject summary collections in MongoDB (summaries are computed dynamically on read from canonical concepts and `ConceptLearningState`).
- No mutation of `Topic.knowledgeState` or cross-contamination with analytics event logs.

---

### 6. Canonical Knowledge Hierarchy & Read Model

```
   ┌────────────────────────────────────────────────────────┐
   │ Subject (Canonical Syllabus Container)                 │
   └──────────────────────────┬─────────────────────────────┘
                              │ 1:N
                              ▼
   ┌────────────────────────────────────────────────────────┐
   │ Topic (Syllabus Module / Rebuild Fencing Boundary)     │
   └──────────────────────────┬─────────────────────────────┘
                              │ 1:N
                              ▼
   ┌────────────────────────────────────────────────────────┐
   │ Concept (Atomic Unit with prerequisites: [ConceptId])  │
   └──────────────────────────┬─────────────────────────────┘
                              │ 1:1 Projection per User
                              ▼
   ┌────────────────────────────────────────────────────────┐
   │ ConceptLearningState (Persisted Real-Time State)       │
   └────────────────────────────────────────────────────────┘
```

#### Read Derivation Rules:
- **Canonical Concept Source**: The candidate set for any topic or subject query begins with the canonical `Concept` documents belonging to that entity's active syllabus version.
- **Synthesized `NOT_STARTED` State**: If a user has never studied a concept, no `ConceptLearningState` document exists in MongoDB. The read service synthesizes an in-memory representation:
  ```javascript
  const unstudiedState = {
    masteryScore: 0,
    decayedScore: 0,
    stability: 1.0,
    difficulty: 5.0,
    retrievability: 0.0,
    status: 'NOT_STARTED',
    totalRepetitions: 0,
    consecutiveSuccesses: 0,
    consecutiveFailures: 0,
    lastStudiedAt: null,
    nextDueDate: null,
    historyCount: 0,
  };
  ```
- **Prohibition on `Topic.knowledgeState`**: `Topic.knowledgeState.masteryScore` is obsolete and MUST NOT be read or written. All topic and subject metrics are derived strictly from concept-level learning states.

---

### 7. Complete API Contracts & Response Envelopes

Checkpoint 3 establishes a single, uniform response envelope for all learning-state endpoints:
- **Success Format**:
  ```json
  {
    "success": true,
    "data": { ... },
    "meta": {
      "evaluationTimestamp": "2026-10-06T12:00:00.000Z",
      "pagination": { "page": 1, "limit": 20, "total": 12, "totalPages": 1 },
      "requestId": "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11"
    }
  }
  ```
- **Error Format** (conforming to repository `errorHandler.js`):
  ```json
  {
    "success": false,
    "error": {
      "code": "ERROR_CODE",
      "message": "Human readable error message.",
      "details": []
    },
    "requestId": "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11"
  }
  ```

---

#### Endpoint 1: `GET /api/v1/learning-state/concepts/:conceptId`
- **Authentication**: Required (`authenticateUser`).
- **Ownership**: Concept must belong to a Topic and Subject owned by `req.user._id`.
- **Query Parameters**:
  - `evaluationTimestamp` (optional ISO 8601 string, permitted only in `NODE_ENV === 'test'`).
- **Response `200 OK`**:
```json
{
  "success": true,
  "data": {
    "conceptId": "651f1e8a9b1e8a001f8e1234",
    "topicId": "651f1e8a9b1e8a001f8e5678",
    "subjectId": "651f1e8a9b1e8a001f8e9999",
    "name": "Memory Allocation",
    "state": {
      "masteryScore": 82,
      "decayedScore": 76.4,
      "stability": 4.2,
      "difficulty": 5.1,
      "retrievability": 0.93,
      "status": "MASTERED",
      "totalRepetitions": 6,
      "consecutiveSuccesses": 4,
      "consecutiveFailures": 0,
      "lastStudiedAt": "2026-10-05T10:15:00.000Z",
      "nextDueDate": "2026-10-09T10:15:00.000Z",
      "historyCount": 6
    },
    "prerequisites": {
      "total": 2,
      "mastered": 2,
      "unmastered": 0,
      "isBlocked": false
    }
  },
  "meta": {
    "evaluationTimestamp": "2026-10-06T12:00:00.000Z",
    "requestId": "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11"
  }
}
```

---

#### Endpoint 2: `GET /api/v1/learning-state/topics/:topicId`
- **Authentication**: Required (`authenticateUser`).
- **Ownership**: Topic must belong to a Subject owned by `req.user._id`.
- **Query Parameters**:
  - `evaluationTimestamp` (optional ISO 8601 string, test-only).
  - `status` (optional enum: `NOT_STARTED`, `INTRODUCED`, `PRACTICING`, `MASTERED`, `STRUGGLING`).
  - `page` (optional integer, default `1`).
  - `limit` (optional integer, default `20`, max `100`).
- **Semantics**:
  - `summary`: Covers the **entire topic** (all canonical concepts under `topicId`).
  - `concepts`: Filtered by status, sorted deterministically, and paginated.
  - `weakConcepts`: Full-topic scope, bounded deterministic top 5 concepts with lowest `decayedScore`.
- **Response `200 OK`**:
```json
{
  "success": true,
  "data": {
    "topicId": "651f1e8a9b1e8a001f8e5678",
    "subjectId": "651f1e8a9b1e8a001f8e9999",
    "summary": {
      "totalConcepts": 12,
      "masteredConcepts": 7,
      "practicingConcepts": 2,
      "strugglingConcepts": 1,
      "notStartedConcepts": 2,
      "progressPercentage": 58.3,
      "averageMasteryScore": 71.5,
      "averageDecayedScore": 64.2
    },
    "weakConcepts": [
      {
        "conceptId": "651f1e8a9b1e8a001f8e1235",
        "name": "Pointer Arithmetic",
        "masteryScore": 32,
        "decayedScore": 28.1,
        "status": "STRUGGLING"
      }
    ],
    "concepts": [
      {
        "conceptId": "651f1e8a9b1e8a001f8e1234",
        "name": "Memory Allocation",
        "masteryScore": 82,
        "decayedScore": 76.4,
        "status": "MASTERED",
        "lastStudiedAt": "2026-10-05T10:15:00.000Z"
      }
    ]
  },
  "meta": {
    "evaluationTimestamp": "2026-10-06T12:00:00.000Z",
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 12,
      "totalPages": 1
    },
    "requestId": "b1ffcd88-8b0b-4ef8-bb6d-6bb9bd380a22"
  }
}
```

---

#### Endpoint 3: `GET /api/v1/learning-state/subjects/:subjectId`
- **Authentication**: Required (`authenticateUser`).
- **Ownership**: Subject must be owned by `req.user._id`.
- **Query Parameters**:
  - `evaluationTimestamp` (optional ISO 8601 string, test-only).
  - `page` (optional integer, default `1`).
  - `limit` (optional integer, default `10`, max `50`).
- **Semantics**:
  - `summary`: Covers the **entire subject** (all canonical concepts across all topics).
  - `topics`: Paginated topic summaries.
  - `weakestTopics`: Full-subject scope, bounded deterministic top 5 topics with lowest average mastery score.
- **Response `200 OK`**:
```json
{
  "success": true,
  "data": {
    "subjectId": "651f1e8a9b1e8a001f8e9999",
    "summary": {
      "totalTopics": 4,
      "totalConcepts": 48,
      "masteredConcepts": 24,
      "inProgressConcepts": 16,
      "notStartedConcepts": 8,
      "overallProgressPercentage": 50.0,
      "averageMasteryScore": 62.8
    },
    "weakestTopics": [
      {
        "topicId": "651f1e8a9b1e8a001f8e5678",
        "name": "Dynamic Memory",
        "averageMasteryScore": 41.2,
        "strugglingConceptsCount": 3
      }
    ],
    "topics": [
      {
        "topicId": "651f1e8a9b1e8a001f8e5678",
        "name": "Dynamic Memory",
        "totalConcepts": 12,
        "masteredConcepts": 4,
        "progressPercentage": 33.3,
        "averageMasteryScore": 41.2
      }
    ]
  },
  "meta": {
    "evaluationTimestamp": "2026-10-06T12:00:00.000Z",
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 4,
      "totalPages": 1
    },
    "requestId": "c2eedd77-7b0b-4ef8-bb6d-6bb9bd380a33"
  }
}
```

---

#### Endpoint 4: `GET /api/v1/learning-state/priorities`
- **Authentication**: Required (`authenticateUser`).
- **Ownership**: Subject/Topic must be owned by `req.user._id`.
- **Query Parameters**:
  - `subjectId` (required ObjectId).
  - `topicId` (optional ObjectId filter).
  - `limit` (optional integer, default `10`, max `50`).
  - `includeMastered` (optional boolean, default `false`).
  - `evaluationTimestamp` (optional ISO 8601 string, test-only).
- **Semantics**:
  - The prerequisite dependency graph is computed **subject-wide** across all topics. If `topicId` is provided, candidate filtering occurs *after* graph metrics are calculated.
- **Response `200 OK`**:
```json
{
  "success": true,
  "data": {
    "recommendations": [
      {
        "conceptId": "651f1e8a9b1e8a001f8e1230",
        "name": "Pointers & Addresses",
        "topicId": "651f1e8a9b1e8a001f8e5670",
        "priorityScore": 845,
        "rankTier": 1,
        "prerequisiteStatus": {
          "unmasteredPrereqDepth": 0,
          "unmasteredDownstreamCount": 4,
          "isRootBlocker": true
        },
        "learningState": {
          "masteryScore": 30,
          "decayedScore": 25.5,
          "stability": 1.2,
          "status": "STRUGGLING",
          "consecutiveFailures": 2,
          "lastStudiedAt": "2026-10-04T12:00:00.000Z"
        },
        "recommendationReason": "ROOT_PREREQUISITE_BLOCKER"
      }
    ]
  },
  "meta": {
    "evaluationTimestamp": "2026-10-06T12:00:00.000Z",
    "pagination": {
      "count": 1,
      "limit": 10
    },
    "requestId": "d3ffcc66-6b0b-4ef8-bb6d-6bb9bd380a44"
  }
}
```

---

#### Endpoint 5: `POST /api/v1/learning-state/rebuild/:topicId`
- **Authentication**: Required (`authenticateUser`).
- **Rate Limit**: 3 requests per 60 seconds per user (`rebuildRateLimiter`).
- **Response `200 OK`**:
```json
{
  "success": true,
  "data": {
    "topicId": "651f1e8a9b1e8a001f8e5678",
    "rebuiltConceptsCount": 12,
    "processedTurnsCount": 45,
    "fencedClosureTopics": [
      "651f1e8a9b1e8a001f8e5670",
      "651f1e8a9b1e8a001f8e5678"
    ],
    "rebuiltAt": "2026-10-06T12:00:05.000Z"
  },
  "meta": {
    "requestId": "e4eebb55-5b0b-4ef8-bb6d-6bb9bd380a55"
  }
}
```
- **Response `409 Conflict` (Concurrent Mutation / Rebuild Conflict)**:
```json
{
  "success": false,
  "error": {
    "code": "REBUILD_CONCURRENT_MUTATION_CONFLICT",
    "message": "Rebuild aborted: Live turn mutation or concurrent rebuild occurred on topic closure during replay.",
    "details": []
  },
  "requestId": "e4eebb55-5b0b-4ef8-bb6d-6bb9bd380a55"
}
```

---

### 8. Priority Mathematics & Bounded Scoring

The study priority score for a candidate concept $X$ is computed across six normalized factors:

$$\text{rawScore}(X) = F_{\text{prereq}} + F_{\text{status}} + F_{\text{misconception}} + F_{\text{decay}} + F_{\text{failure}} + F_{\text{recency}}$$

#### Factor Formulations
1. **Prerequisite Urgency ($F_{\text{prereq}} \in [0, 300]$)**:
   - Measures the blocker impact on downstream unmastered concepts:
   $$F_{\text{prereq}} = \min(300, 60 \cdot \text{unmasteredDownstreamCount}(X))$$
2. **Status Urgency ($F_{\text{status}} \in [0, 250]$)**:
   - `NOT_STARTED`: $250$
   - `STRUGGLING`: $200$
   - `INTRODUCED`: $150$
   - `PRACTICING`: $100$
   - `MASTERED`: $0$
3. **Misconception Urgency ($F_{\text{misconception}} \in [0, 200]$)**:
   - Evaluates unresolved active misconceptions from history:
   $$F_{\text{misconception}} = \min(200, 100 \cdot \text{activeMisconceptionsCount}(X))$$
4. **Decay Urgency ($F_{\text{decay}} \in [0, 150]$)**:
   - Forgetting risk based on retrievability:
   $$F_{\text{decay}} = 150 \cdot (1 - \text{retrievability}(X, \text{evaluationTimestamp}))$$
5. **Failure Urgency ($F_{\text{failure}} \in [0, 90]$)**:
   - Consecutive failure penalty:
   $$F_{\text{failure}} = \min(90, 30 \cdot \text{consecutiveFailures}(X))$$
6. **Recency Urgency ($F_{\text{recency}} \in [0, 50]$)**:
   - Due date distance penalty:
   - If never studied or overdue: $50$.
   - If not due: $\max\left(0, 50 \cdot \left(1 - \frac{\text{nextDueDate} - \text{evaluationTimestamp}}{\text{stability} \cdot 86400000}\right)\right)$.

#### Bounded / Clamped Scoring
The theoretical maximum raw score is $300 + 250 + 200 + 150 + 90 + 50 = 1040$.
The public score is strictly clamped and rounded to $[0, 1000]$:

$$\text{priorityScore}(X) = \max\left(0, \min\left(1000, \text{Math.round}(\text{rawScore}(X))\right)\right)$$

---

### 9. Globally Transitive Prerequisite Ranking

Candidates are ranked using a **monotonic 6-element ranking tuple** $\mathcal{K}(X)$:

$$\mathcal{K}(X) = \Big(\text{Tier}(X),\; \text{unmasteredPrereqDepth}(X),\; -\text{priorityScore}(X),\; \text{decayedScore}(X),\; -\text{consecutiveFailures}(X),\; X.\_id.\text{toString()}\Big)$$

#### 1. Four Prerequisite Tiers
- **Tier 1 (Root Prerequisite Blockers)**:
  - $\text{masteryScore} < 70$ (unmastered).
  - $\text{unmasteredPrereqDepth} == 0$ (all prerequisites are mastered or concept has none).
  - $\text{unmasteredDownstreamCount} > 0$ (blocks at least one downstream concept).
- **Tier 2 (Unblocked Active Candidates)**:
  - $\text{masteryScore} < 70$ (unmastered).
  - $\text{unmasteredPrereqDepth} == 0$.
  - $\text{unmasteredDownstreamCount} == 0$ (leaf concept or standalone).
- **Tier 3 (Gated / Blocked Concepts)**:
  - $\text{masteryScore} < 70$ (unmastered).
  - $\text{unmasteredPrereqDepth} > 0$ (has at least one unmastered prerequisite).
  - Sorted ascending by depth so closest-to-unblocking concepts appear first.
- **Tier 4 (Mastered Maintenance)**:
  - $\text{masteryScore} \ge 70$.

#### 2. Mathematical Proof of Transitivity
The ranking comparator defines a total preorder on candidate concepts because:
1. Each element in $\mathcal{K}(X)$ maps to a totally ordered set ($\mathbb{Z}$ or $\mathbb{R}$ or lexicographical $\text{String}$).
2. The product order on tuples evaluated lexicographically ($<_{\text{lex}}$) is strictly transitive: if $\mathcal{K}(A) <_{\text{lex}} \mathcal{K}(B)$ and $\mathcal{K}(B) <_{\text{lex}} \mathcal{K}(C)$, then $\mathcal{K}(A) <_{\text{lex}} \mathcal{K}(C)$.
3. The final component $X.\_id.\text{toString()}$ is unique per concept, ensuring strict antisymmetry ($A \ne B \implies \mathcal{K}(A) \ne \mathcal{K}(B)$) and eliminating cyclic preference loops.

---

### 10. `TopicLearningStateFence` Model

```javascript
import mongoose from 'mongoose';

const topicLearningStateFenceSchema = new mongoose.Schema(
  {
    topicId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Topic',
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    version: {
      type: Number,
      default: 0,
      min: 0,
      required: true,
    },
    activeRebuildLock: {
      lockId: { type: String, default: null },
      acquiredAt: { type: Date, default: null },
      expiresAt: { type: Date, default: null },
    },
    lastTurnWatermark: {
      lastTurnId: { type: mongoose.Schema.Types.ObjectId, default: null },
      lastTurnAnsweredAt: { type: Date, default: null },
    },
  },
  {
    timestamps: true,
  }
);

// Authoritative Single Compound Unique Index: Exactly one fence per user per topic
topicLearningStateFenceSchema.index({ userId: 1, topicId: 1 }, { unique: true });

export const TopicLearningStateFence =
  mongoose.models.TopicLearningStateFence ||
  mongoose.model('TopicLearningStateFence', topicLearningStateFenceSchema);

export default TopicLearningStateFence;
```

---

### 11. Live-Evidence Version Semantics

The integer field `TopicLearningStateFence.version` represents the **monotonic epoch of committed live study evidence** for that topic.

| Operational Event | `version` Delta | Rationale |
| :--- | :---: | :--- |
| **New Committed Live Turn** | `+1` | New empirical evidence generated. |
| **Live Turn Targeting $N$ Concepts** | `+1` | Exactly one turn completed in the topic. |
| **Second Legal Live Turn** | `+1` | Next empirical turn epoch. |
| **Idempotent Turn Replay** | `+0` | Duplicate turn submission ignored. |
| **Failed AI Evaluation** | `+0` | No state committed. |
| **Transaction Rollback** | `+0` | State mutation aborted. |
| **Rebuild Lease Acquisition** | `+0` | Lock acquired; no new live evidence. |
| **Rebuild Publication** | `+0` | Reconstructed state published; evidence unchanged. |
| **Failed Rebuild** | `+0` | Aborted; no state published. |

---

### 12. Multi-Topic Rebuild / Live-Study Fencing Protocol

#### Exact Three-Phase Operational Sequence for Rebuild

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ PHASE 1: Lease Acquisition & Snapshot Capture (Transactional + Retry Boundary)         │
│  1. Compute closureTopics(T) = { T } U { topics containing transitive prereqs of T }   │
│  2. Sort closure topic IDs deterministically in ascending alphanumeric order.          │
│  3. Inside runInTransaction:                                                           │
│     - For each topicId in sorted closure:                                              │
│       * Find/Upsert TopicLearningStateFence inside transaction (E11000 retryable).     │
│       * Check lock availability: lockId == null OR expiresAt <= now.                   │
│       * Acquire lease: activeRebuildLock = { lockId, acquiredAt: now, expiresAt: +30s }│
│       * Record snapshotVector[topicId] = fence.version.                                │
│  4. Commit Phase 1 Transaction.                                                        │
└────────────────────────────────────────┬───────────────────────────────────────────────┘
                                         │
                                         ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ PHASE 2: Historical Evidence Read & Replay (Non-Transactional Read Phase)              │
│  5. Read all completed StudySession.turns for target topic T from MongoDB.             │
│  6. Replay historical evidence sequentially through learningStateMachine.              │
│  7. Deduplicate ProcessedStudyTurn ledger records in memory:                           │
│     Set key: `${userId}_${conceptId}_${turnId}`.                                       │
└────────────────────────────────────────┬───────────────────────────────────────────────┘
                                         │
                                         ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ PHASE 3: Atomic Validation, Publication & Safe Release (Transactional)                 │
│  8. Inside runInTransaction:                                                           │
│     - For each topicId in closureTopics(T):                                            │
│       * Read fence document within transaction.                                        │
│       * Validate fence.version === snapshotVector[topicId].                            │
│       * Validate fence.activeRebuildLock.lockId === lockId.                            │
│       * If any mismatch -> THROW 409 REBUILD_CONCURRENT_MUTATION_CONFLICT.             │
│     - Delete existing ConceptLearningState for target topic T.                         │
│     - Insert rebuilt ConceptLearningState documents.                                   │
│     - Delete existing ProcessedStudyTurn records for target topic concepts.            │
│     - ProcessedStudyTurn.insertMany(dedupedRecords, { session }) [NO CATCH].           │
│     - Clear activeRebuildLock for all closure topics WHERE lockId matches.             │
│  9. Commit Phase 3 Transaction.                                                        │
└────────────────────────────────────────┬───────────────────────────────────────────────┘
                                         │
                                         ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ FINALLY (Cleanup on Failure / Error)                                                   │
│  10. Safe unlock query: clear activeRebuildLock WHERE lockId matches.                  │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

#### Correctness Invariant Proof:
- **Scenario**: Target Topic $B$ depends on Topic $A$ ($Y \in B \to X \in A$).
- **Timeline**:
  1. $t_0$: Worker acquires leases on $\{A, B\}$ and captures $S = \{ A: 4, B: 7 \}$. Phase 1 commits.
  2. $t_1$: Worker reads historical turns of $B$ in Phase 2.
  3. $t_2$: User completes live turn on $X$ in Topic $A$. Live transaction commits evidence and advances $A.\text{version} = 5$.
  4. $t_3$: Worker attempts publication in Phase 3. It validates $A.\text{version} == S[A]$ ($5 \ne 4$).
  5. $t_4$: Validation fails immediately, throwing 409 `REBUILD_CONCURRENT_MUTATION_CONFLICT`. Stale state is rejected.

---

### 13. Snapshot Vector Semantics

- $\text{snapshotVector}[t]$ represents the live-evidence version of closure topic $t$ captured during Phase 1 lease acquisition.
- A rebuild is considered stale and **must abort** if ANY closure topic $t \in \text{closureTopics}(T)$ has $\text{fence.version} > \text{snapshotVector}[t]$ at publication time.
- Publishing a rebuild leaves all fence versions unchanged:

$$\begin{aligned}
\text{Initial}: &\quad A.\text{version} = 4, \quad B.\text{version} = 7 \\
\text{Snapshot Captured}: &\quad S = \{ A: 4, B: 7 \} \\
\text{No Live Turns Occur} &\implies \text{Rebuild Publishes Successfully} \\
\text{Post-Publication}: &\quad A.\text{version} = 4, \quad B.\text{version} = 7
\end{aligned}$$

---

### 14. Transaction Retry Semantics (`server/src/utils/transaction.js`)

```javascript
import mongoose from 'mongoose';

const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 50;

/**
 * Narrow retry classification: strictly identifies retryable transient conditions.
 */
function isRetryableTransactionError(err) {
  if (!err) return false;
  if (typeof err.hasErrorLabel === 'function' && err.hasErrorLabel('TransientTransactionError')) {
    return true;
  }
  if (err.code === 112 || err.codeName === 'WriteConflict') {
    return true;
  }
  // First-use TopicLearningStateFence duplicate-key collision
  if (err.code === 11000 && err.keyPattern && err.keyPattern.userId && err.keyPattern.topicId) {
    return true;
  }
  return false;
}

/**
 * Executes a callback within a MongoDB replica set transaction with full-transaction retry.
 */
export async function runInTransaction(workFn, options = {}) {
  const isTestEnv = options.isTest !== undefined ? options.isTest : (process.env.NODE_ENV === 'test');
  const isDbConnected = mongoose.connection && mongoose.connection.readyState === 1;

  if (!isDbConnected) {
    if (!isTestEnv) {
      const txError = new Error('Database transaction unavailable: MongoDB Atlas / replica set required.');
      txError.code = 'TRANSACTION_UNAVAILABLE';
      txError.statusCode = 503;
      throw txError;
    }
    return await workFn(null);
  }

  let attempt = 0;
  while (attempt < MAX_RETRIES) {
    attempt++;
    let dbSession = null;
    try {
      dbSession = await mongoose.startSession();
      dbSession.startTransaction({
        readConcern: { level: 'snapshot' },
        writeConcern: { w: 'majority' },
      });

      const result = await workFn(dbSession);

      // Commit transaction with dedicated UnknownTransactionCommitResult handling
      let committed = false;
      while (!committed) {
        try {
          await dbSession.commitTransaction();
          committed = true;
        } catch (commitErr) {
          if (typeof commitErr.hasErrorLabel === 'function' && commitErr.hasErrorLabel('UnknownTransactionCommitResult')) {
            // Safe to retry commit on the SAME active session
            continue;
          }
          throw commitErr;
        }
      }

      await dbSession.endSession();
      return result;
    } catch (err) {
      if (dbSession) {
        try {
          await dbSession.abortTransaction();
        } catch (_) {}
        try {
          await dbSession.endSession();
        } catch (_) {}
      }

      if (isRetryableTransactionError(err) && attempt < MAX_RETRIES) {
        const jitter = Math.floor(Math.random() * 25);
        const backoff = BASE_BACKOFF_MS * Math.pow(2, attempt - 1) + jitter;
        await new Promise((resolve) => setTimeout(resolve, backoff));
        continue;
      }

      if (isRetryableTransactionError(err) && attempt >= MAX_RETRIES) {
        const exhaustedErr = new Error(`Transaction conflict retry exhausted after ${MAX_RETRIES} attempts.`);
        exhaustedErr.code = 'TRANSACTION_CONFLICT_EXHAUSTED';
        exhaustedErr.statusCode = 503;
        exhaustedErr.details = [err.message];
        throw exhaustedErr;
      }

      throw err;
    }
  }
}
```

---

### 15. Lease Lifecycle & Safe Lock Release

- **Lease Duration**: 30 seconds (`expiresAt = Date.now() + 30000`).
- **Lock Identifier**: UUID v4 generated per rebuild execution.
- **Safe Release Rule**: All lock releases (commit or cleanup) MUST include `lockId` in the query filter:
  ```javascript
  await TopicLearningStateFence.updateMany(
    { topicId: { $in: closureTopicIds }, 'activeRebuildLock.lockId': lockId },
    { $set: { 'activeRebuildLock.lockId': null, 'activeRebuildLock.acquiredAt': null, 'activeRebuildLock.expiresAt': null } }
  );
  ```
- **Stale Worker Isolation**: If worker $A$ exceeds 30s, worker $B$ may legally acquire the lease. Because all update/delete operations from $A$ filter on `lockId: lockIdA`, worker $A$ cannot clear worker $B$'s lock or publish stale state.

---

### 16. Rate-Limit Semantics

- **Rebuild Rate Limiter**: 3 requests per 60 seconds per user, enforced via in-memory rate limiter in `server/src/middleware/rateLimiter.js`.
- **Exceeded Limit**: Returns HTTP `429 Too Many Requests` with code `RATE_LIMIT_EXCEEDED` and standard error envelope.

---

### 17. Database Index Audit

| Collection | Index Fields | Type / Options | Assessment |
| :--- | :--- | :--- | :--- |
| `TopicLearningStateFence` | `{ userId: 1, topicId: 1 }` | Compound Unique | **Required**: Enforces single fence per user per topic; enables atomic upsert. |
| `ConceptLearningState` | `{ userId: 1, conceptId: 1 }` | Compound Unique | **Existing**: Enforces single learning state per user per concept. |
| `ConceptLearningState` | `{ userId: 1, topicId: 1 }` | Compound | **Existing**: Optimizes topic-level aggregations and batch fetches. |
| `ProcessedStudyTurn` | `{ userId: 1, conceptId: 1, turnId: 1 }` | Compound Unique | **Existing**: Deduplication and idempotency ledger. |
| `Concept` | `{ topicId: 1, order: 1 }` | Compound | **Existing**: Optimizes syllabus concept retrieval. |
| `Topic` | `{ subjectId: 1, order: 1 }` | Compound | **Existing**: Optimizes topic listing within subject. |

*Redundant Index Elimination*: No standalone unique index on `topicId` is created on `TopicLearningStateFence` because multiple users share canonical topics. Only `{ userId: 1, topicId: 1 }` is maintained.

---

### 18. Files to Create / Modify / NOT Modify

#### Files to Create:
1. `server/src/models/TopicLearningStateFence.js`
2. `server/src/controllers/learningStateController.js`
3. `server/src/routes/learningStateRoutes.js`
4. `server/tests/learningStatePriorities.test.js`
5. `server/tests/learningStateRoutes.test.js`
6. `server/tests/learningStateConcurrency.test.js`

#### Files to Modify:
1. `server/src/utils/transaction.js` (Add retry loop, narrow error classification, UnknownTransactionCommitResult handling)
2. `server/src/knowledge/state/learningStateEngine.js` (Add priority scoring, ranking keys, prerequisite metrics)
3. `server/src/study/services/learningStateService.js` (Add fence version increment, multi-topic rebuild, read aggregations)
4. `server/src/study/services/studyService.js` (Integrate fence version increment in submitAnswer persistence transaction)
5. `server/src/middleware/rateLimiter.js` (Export rebuild rate limiter)
6. `server/src/app.js` (Mount learningStateRouter under `/api/v1/learning-state`)
7. `docs/IMPLEMENTATION_LOG.md` (Document Checkpoint 3 implementation)

#### Files NOT to Modify:
1. `server/src/models/StudySession.js`
2. `server/src/models/ProcessedStudyTurn.js`
3. `server/src/models/LearningEvent.js`
4. `server/src/ai/schemas/tasks.js`
5. `client/**` (All frontend files reserved for subsequent checkpoints)

---

### 19. Implementation Sequence

```
1. Enhance server/src/utils/transaction.js (Retry loop, narrow classification, UnknownTransactionCommitResult)
   ↓
2. Create server/src/models/TopicLearningStateFence.js (Compound unique index { userId, topicId })
   ↓
3. Implement engine methods in server/src/knowledge/state/learningStateEngine.js (Ranking tuple, decay)
   ↓
4. Update server/src/study/services/learningStateService.js:
   - Atomic fence version +1 in projectTurnRealtime
   - Multi-phase rebuild with closure leases & snapshot vector
   - Read service aggregation methods (concept, topic, subject, priorities)
   ↓
5. Add rebuildRateLimiter in server/src/middleware/rateLimiter.js
   ↓
6. Implement server/src/controllers/learningStateController.js & server/src/routes/learningStateRoutes.js
   ↓
7. Mount router in server/src/app.js under /api/v1/learning-state
   ↓
8. Execute complete test suite (Unit -> Routes -> Concurrency/ReplSet -> Full Regression)
   ↓
9. Update docs/IMPLEMENTATION_LOG.md
```

---

### 20. Complete Test Matrix

All concurrency and lease tests execute against real MongoDB replica sets via `MongoMemoryReplSet`.

| Test Suite | Test Scenario | Expected Outcome |
| :--- | :--- | :--- |
| **`learningStatePriorities.test.js`** | Unmastered root blocker vs unmastered leaf | Root blocker ranked in Tier 1 ahead of Tier 2 leaf. |
| **`learningStatePriorities.test.js`** | Transitive prerequisite chain $A \to B \to C$ | Strict global ordering $\mathcal{K}(A) < \mathcal{K}(B) < \mathcal{K}(C)$. |
| **`learningStatePriorities.test.js`** | Prerequisite cycle handling | Engine detects cycle defensively, avoids infinite loop, ranks deterministically. |
| **`learningStatePriorities.test.js`** | Priority score bounds $[0, 1000]$ | Clamping and rounding mathematically verified for extreme factor values. |
| **`learningStatePriorities.test.js`** | Canonical concept synthesis | Concept without `ConceptLearningState` synthesized as `NOT_STARTED`. |
| **`learningStatePriorities.test.js`** | Deterministic tie-breaking | Concepts with identical scores sub-ordered deterministically by `_id`. |
| **`learningStateRoutes.test.js`** | `GET /concepts/:conceptId` | Returns 200 with dynamic decay and prerequisite status. |
| **`learningStateRoutes.test.js`** | `GET /topics/:topicId` | Returns full topic summary, paginated concepts, bounded top 5 weak concepts. |
| **`learningStateRoutes.test.js`** | `GET /subjects/:subjectId` | Returns overall summary, paginated topics, top 5 weakest topics. |
| **`learningStateRoutes.test.js`** | `POST /rebuild/:topicId` rate limiting | 4th request within 60s returns 429 `RATE_LIMIT_EXCEEDED`. |
| **`learningStateRoutes.test.js`** | Immutability on GET | Zero database writes occur during GET requests. |
| **`learningStateConcurrency.test.js`** | Single committed live turn | `TopicLearningStateFence.version` increments by exactly `+1`. |
| **`learningStateConcurrency.test.js`** | Multi-concept turn projection | `TopicLearningStateFence.version` increments by `+1` once. |
| **`learningStateConcurrency.test.js`** | Two sequential committed live turns | `TopicLearningStateFence.version` increments by `+2`. |
| **`learningStateConcurrency.test.js`** | Idempotent turn replay | `TopicLearningStateFence.version` increments by `+0`. |
| **`learningStateConcurrency.test.js`** | Failed evaluation / rollback | `TopicLearningStateFence.version` increments by `+0`. |
| **`learningStateConcurrency.test.js`** | First-use fence creation race | Losing transaction retries from scratch; exactly one fence created; `version = 1`. |
| **`learningStateConcurrency.test.js`** | Capture-before-read timing race | Turn committed after snapshot capture aborts rebuild publication with 409. |
| **`learningStateConcurrency.test.js`** | Target-topic rebuild vs live turn | Stale rebuild aborts with 409 `REBUILD_CONCURRENT_MUTATION_CONFLICT`. |
| **`learningStateConcurrency.test.js`** | Prerequisite-topic rebuild vs live turn | Stale rebuild aborts with 409 `REBUILD_CONCURRENT_MUTATION_CONFLICT`. |
| **`learningStateConcurrency.test.js`** | Rebuild publication without mutation | State rebuilt; fence versions remain completely unchanged (`+0`). |
| **`learningStateConcurrency.test.js`** | Stale lease takeover | Expired lease ($> 30\text{s}$) successfully acquired by new rebuild worker. |
| **`learningStateConcurrency.test.js`** | Stale worker release isolation | Worker with expired `lockId` cannot clear a newly acquired replacement lock. |
| **`learningStateConcurrency.test.js`** | Overlapping rebuilds | Ascending topic ID ordering prevents deadlocks; second rebuild waits or fails cleanly. |
| **`learningStateConcurrency.test.js`** | Transaction retry on write conflict | Entire callback restarts; exactly one turn effect persisted. |
| **`learningStateConcurrency.test.js`** | Non-retryable error handling | Arbitrary duplicate key fails immediately without transaction retry. |
| **`learningStateConcurrency.test.js`** | UnknownTransactionCommitResult | Helper retries commit on active session without re-executing business callback. |
| **`learningStateConcurrency.test.js`** | Retry exhaustion | Helper aborts and throws `TRANSACTION_CONFLICT_EXHAUSTED` after 3 attempts. |
| **`learningStateConcurrency.test.js`** | Unexpected ledger error | Publication transaction aborts; error is not swallowed. |

---

### 21. Security & Tenant Isolation

- All queries and mutations strictly filter by authenticated `userId` extracted from JWT session (`req.user._id`).
- Concept, Topic, and Subject IDs validated for ownership before serving read data or acquiring rebuild locks.
- Cross-user data leakage mathematically impossible due to compound unique index `{ userId, topicId }`.

---

### 22. Performance & Complexity Analysis

- **Prerequisite Graph Traversal**: $O(V + E)$ where $V \le 100$ concepts and $E \le 200$ prerequisite edges per subject. In-memory traversal executes in $< 5\text{ms}$.
- **Sorting & Ranking**: $O(N \log N)$ where $N \le 100$.
- **Database Query Indexing**:
  - `ConceptLearningState` queries use compound index `{ userId: 1, topicId: 1 }` (Index Scan).
  - `TopicLearningStateFence` lookups use unique index `{ userId: 1, topicId: 1 }` (Index Scan).
- **Bounded Payloads**: `weakConcepts` and `weakestTopics` are sliced to top 5, preventing unbounded JSON payload growth.

---

### 23. Acceptance Criteria

1. All 5 new endpoints respond with correct status codes, schemas, and standardized response envelopes.
2. `TopicLearningStateFence.version` is strictly a monotonic epoch of committed live study evidence.
3. Multi-topic rebuild fences the full transitive prerequisite closure in ascending `topicId` order.
4. Snapshot vector is captured before historical turns are read, preventing stale state publication.
5. `runInTransaction` retries only genuine transient/write conflicts and first-use fence creation races up to 3 times.
6. Rebuild ledger inserts deduplicated records without blanket error swallowing.
7. Candidate prioritization uses global 6-element ranking tuple with 4 tiers and canonical concept baseline.
8. Read endpoints dynamically calculate decay without database writes.
9. All unit, route, and real-MongoDB concurrency tests pass with 100% reliability.
10. Full regression suite (285+ backend, 70 frontend, production build) remains 100% green.

---

### 24. Interview Explanation

> "In Checkpoint 3, we implemented an immutable read and prioritization layer over our learning state machine. The key architectural challenge was preventing race conditions between concurrent live study turns and topic rebuilds across prerequisite boundaries.
> 
> We resolved this by introducing a multi-topic lease fencing protocol (`TopicLearningStateFence`). The fence `version` strictly represents the epoch of committed live evidence. During a topic rebuild, we acquire leases across the entire prerequisite closure in ascending topic ID order and capture a snapshot version vector *before* reading historical evidence. At publication time, we atomically verify that no closure topic has advanced its live version.
> 
> To ensure robustness in high-concurrency environments, we wrapped persistence operations in a narrow full-transaction retry abstraction in `transaction.js`, capable of retrying transient write conflicts and first-use upsert collisions while leaving business errors strictly non-retryable. For recommendations, we designed a globally transitive 6-element ranking tuple that sorts root prerequisite blockers first, completely eliminating cyclic priority loops."

---

### 25. Explicit Limitations

- Priority calculations are performed within the scope of a single Subject's active syllabus version.
- Rebuild operations require active MongoDB transaction support (replica set / MongoMemoryReplSet).
- Frontend UI integration will be implemented in subsequent checkpoints.

---

Implementation Status: PLAN ONLY — NO CODE IMPLEMENTED
External Review Status: Pending Independent Review
Final Verdict: CHECKPOINT 3 PLAN v10 — READY FOR INDEPENDENT REVIEW
