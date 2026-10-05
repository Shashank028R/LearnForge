# ADR-019: Deterministic Concept Mastery State Machine, Prerequisite Gating & Retention Decay Model

## Status
Accepted

## Context
Educational platforms often rely on arbitrary "AI mastery percentages" or simplistic single-answer flags (e.g., 1 correct answer = permanently mastered). In LearnForge, student mastery must be deterministic, explainable, bounded, reproducible, strictly derived from historical evaluative evidence, and reflective of human forgetting curves.

## Decision

1. **Discrete Mastery States**:
   - `NOT_STARTED`: Concept has 0 evaluated study turns.
   - `INTRODUCED`: 1 evaluated turn recorded.
   - `LEARNING`: Actively practiced with partial understanding or scores $< 85\%$.
   - `NEEDS_REVIEW`: Active misconception detected or $\ge 2$ consecutive failures.
   - `UNDERSTOOD`: Demonstrates solid conceptual understanding (`correctness >= 85%`, `completeness >= 80%`).
   - `MASTERED`: High-stability understanding meeting strict multi-attempt criteria and prerequisite gates.

   *Note*: `ConceptLearningState.masteryStatus` is strictly distinct from `Concept.status` (which tracks knowledge graph status).

2. **Complete State Transition Matrix**:

   | Previous State | Evidence / Condition | New State | Score Delta ($\Delta S$) | Conf. Delta ($\Delta C$) | Consecutive Streaks | Misconception Ledger | Prerequisite Check |
   | :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: |
   | `NOT_STARTED` | Turn evaluated: `CORRECT` ($\ge 85\%$) | `UNDERSTOOD` | $+70$ | $+40$ | `successes = 1`, `failures = 0` | No change | Not required for `UNDERSTOOD` |
   | `NOT_STARTED` | Turn evaluated: `CORRECT` ($< 85\%$) | `LEARNING` | $+50$ | $+30$ | `successes = 1`, `failures = 0` | No change | Not required |
   | `NOT_STARTED` | Turn evaluated: `PARTIALLY_CORRECT` | `LEARNING` | $+35$ | $+20$ | `successes = 0`, `failures = 0` | No change | Not required |
   | `NOT_STARTED` | Turn evaluated: `INCORRECT` / `UNCERTAIN` | `NEEDS_REVIEW` | $+10$ | $+10$ | `successes = 0`, `failures = 1` | Summary logged if present | Not required |
   | `LEARNING` | `CORRECT` ($\ge 85\%$), `attempts >= 2` | `UNDERSTOOD` | Bounded $+25$ | Bounded $+20$ | `successes += 1`, `failures = 0` | No change | Not required |
   | `LEARNING` | `PARTIALLY_CORRECT` | `LEARNING` | Bounded $+10$ | Bounded $+5$ | `successes = 0`, `failures = 0` | No change | Not required |
   | `LEARNING` | `INCORRECT` (first failure) | `LEARNING` | Bounded $-15$ | Bounded $-10$ | `successes = 0`, `failures = 1` | Logged if detected | Not required |
   | `LEARNING` | `INCORRECT` (`failures >= 2` OR `misconceptionDetected`) | `NEEDS_REVIEW` | Bounded $-25$ | Bounded $-15$ | `successes = 0`, `failures += 1` | Added to `activeMisconceptions` | Not required |
   | `UNDERSTOOD` | `CORRECT` + `MASTERED Criteria Met` + `Prerequisites Satisfied` | `MASTERED` | Bounded $+15$ | Bounded $+15$ | `successes += 1`, `failures = 0` | Must have 0 active | All prerequisites $\ge 50$ decayed |
   | `UNDERSTOOD` | `CORRECT` + `Prerequisites Unmet` | `UNDERSTOOD` | Bounded $+10$ | Bounded $+10$ | `successes += 1`, `failures = 0` | No change | Gated; `prerequisiteWarning: true` |
   | `UNDERSTOOD` | `INCORRECT` OR `misconceptionDetected` | `NEEDS_REVIEW` | Bounded $-25$ | Bounded $-20$ | `successes = 0`, `failures = 1` | Added to `activeMisconceptions` | Not required |
   | `MASTERED` | `CORRECT` | `MASTERED` | Bounded $+5$ | Bounded $+5$ | `successes += 1`, `failures = 0` | No change | `lastDemonstratedAt = now` |
   | `MASTERED` | `INCORRECT` OR `misconceptionDetected` | `NEEDS_REVIEW` | Bounded $-30$ | Bounded $-25$ | `successes = 0`, `failures = 1` | Added to `activeMisconceptions` | Re-evaluation demotion |
   | `NEEDS_REVIEW` | Socratic `FOLLOW_UP` = `CORRECT` | `LEARNING` (or `UNDERSTOOD` if $S \ge 75$) | Bounded $+30$ | Bounded $+20$ | `successes = 1`, `failures = 0` | Moved to `resolvedMisconceptions` | Misconception cleared |
   | `NEEDS_REVIEW` | Socratic `FOLLOW_UP` = `INCORRECT` | `NEEDS_REVIEW` | Bounded $-15$ | Bounded $-10$ | `successes = 0`, `failures += 1` | Retained in `activeMisconceptions` | Remediation needed |

3. **Formal Criteria for `MASTERED` Status**:
   `MASTERED` status cannot be granted by a single correct answer (`CORRECT != AUTOMATIC MASTERED`). It is computable strictly from historical evidence:
   - `consecutiveSuccesses >= 2`
   - `attemptsCount >= 3`
   - `masteryScore >= 85`
   - `confidenceScore >= 75`
   - `activeMisconceptions.length === 0`
   - All canonical prerequisites (`Concept.prerequisites`) have `masteryStatus` in `['UNDERSTOOD', 'MASTERED']` and `decayedScore >= 50`.

4. **Authoritative Prerequisite Model**:
   - Canonical prerequisites are sourced strictly from `Concept.prerequisites: [ObjectId]`.
   - AI-generated question metadata (`question.prerequisiteConceptIds`) in `StudyTurn` is transient and **never** mutates canonical prerequisites.
   - If canonical prerequisites are unmet or decaying below threshold, concept progression is capped at `UNDERSTOOD` with `prerequisiteWarning: true`. When prerequisites are subsequently brought to $\ge 50$, the dependent concept can advance to `MASTERED` on its next demonstration.

5. **Bounded Score Adjustment Formulas**:
   $$\Delta_{\text{gain}} = \text{round}\left( \text{baseGain} \times \max\left(0.10, 1 - \frac{S_{\text{current}}}{120}\right) \right)$$
   $$\Delta_{\text{penalty}} = \text{round}\left( \text{basePenalty} \times \max\left(0.40, \frac{S_{\text{current}}}{100}\right) \right)$$
   - Scores are strictly clamped within $[0, 100]$.

6. **Retention & Recency Decay Model (Option A: Daily Exponential Decay)**:
   - **Time Unit**: Days ($d$).
   - **Grace Period ($T_{\text{grace}}$)**: 7 days after `lastDemonstratedAt`. No decay occurs during days $0 \le d \le 7$.
   - **Elapsed Days beyond Grace Period ($\Delta d$)**:
     $$\Delta d = \max\left(0, \frac{\text{now} - \text{lastDemonstratedAt}}{86,400,000} - 7\right)$$
   - **Daily Decay Constant ($\lambda$)**:
     $$\lambda = 0.005 \text{ day}^{-1}$$
     - Weekly decay rate: $1 - e^{-0.005 \times 7} \approx 3.44\%$ per week beyond grace.
     - Half-life beyond grace: $T_{1/2} = \frac{\ln(2)}{0.005} \approx 138.6 \text{ days}$ (~$4.5$ months).
   - **Formula**:
     $$S_{\text{decayed}} = \text{round}\left( S_{\text{mastery}} \times \max\left(0.35, e^{-0.005 \times \Delta d}\right) \right)$$
   - **Decay Floor**: $35\%$ of $S_{\text{mastery}}$ ($0.35 \times S_{\text{mastery}}$).
   - **Never Demonstrated**: If `lastDemonstratedAt === null`, $S_{\text{decayed}} = 0$.

   ### Mathematical Boundary Examples (Base Mastery Score $S_{\text{mastery}} = 90$)
   - **0 days beyond grace (Elapsed $\le 7$ days)**: $\Delta d = 0 \implies S_{\text{decayed}} = 90$ (100%)
   - **1 day beyond grace (Elapsed 8 days)**: $\Delta d = 1 \implies S_{\text{decayed}} = 90$ ($e^{-0.005} = 0.9950 \implies 89.55 \approx 90$)
   - **7 days beyond grace (Elapsed 14 days)**: $\Delta d = 7 \implies S_{\text{decayed}} = 87$ ($e^{-0.035} = 0.9656 \implies 86.9 \approx 87$)
   - **30 days beyond grace (Elapsed 37 days)**: $\Delta d = 30 \implies S_{\text{decayed}} = 77$ ($e^{-0.150} = 0.8607 \implies 77.46 \approx 77$)
   - **138 days beyond grace (Elapsed 145 days - Half-Life)**: $\Delta d = 138 \implies S_{\text{decayed}} = 45$ ($e^{-0.690} = 0.5016 \implies 45.14 \approx 45$)
   - **Very large elapsed time (e.g. 365 days)**: $\Delta d = 358 \implies e^{-1.79} = 0.1669 < 0.35 \implies S_{\text{decayed}} = \text{round}(90 \times 0.35) = 32$ (Floor)
   - **Never demonstrated**: $S_{\text{decayed}} = 0$.

7. **Decayed Score Generation Lifecycle**:
   - `decayedScore` is computed dynamically on read in API endpoints based on the current timestamp.
   - A snapshot `decayedScore` is persisted during turn projection for fast indexed sorting in database queries.

## Consequences
- Transparent, mathematically sound, audit-proof grading.
- Zero ambiguity on decay rates, half-life, grace period, and boundary values.
- Students cannot game mastery through lucky single guesses.
- Spaced repetition is encouraged through realistic temporal retention without punitive resets.
