# ADR-019: Deterministic Concept Mastery State Machine & Retention Decay Model

## Status
Accepted

## Context
Educational platforms often rely on arbitrary "AI mastery percentages" or simplistic single-answer flags (e.g. 1 correct answer = permanently mastered). In LearnForge, student mastery must be deterministic, explainable, bounded, reproducible, and reflective of human forgetting curves.

## Decision

1. **Discrete Mastery States**:
   - `NOT_STARTED`: Concept has zero evaluated study turns.
   - `INTRODUCED`: First evaluated attempt recorded.
   - `LEARNING`: Actively practiced with partial understanding or mixed verdicts.
   - `NEEDS_REVIEW`: Active misconception detected or $\ge 2$ consecutive failures.
   - `UNDERSTOOD`: Demonstrates solid understanding (`correctness >= 85%`, `completeness >= 80%`).
   - `MASTERED`: High-stability understanding meeting strict criteria:
     - `consecutiveSuccesses >= 2`
     - `attemptsCount >= 3`
     - `masteryScore >= 85`
     - `confidenceScore >= 75`
     - `activeMisconceptions.length === 0`
     - All prerequisites in `UNDERSTOOD` or `MASTERED` state.

2. **Core Pedagogical Invariants**:
   - `CORRECT != AUTOMATIC MASTERED`: A single correct answer cannot produce `MASTERED`.
   - `INCORRECT != CONCEPT LOST`: An incorrect answer resets consecutive streak and applies a bounded score penalty ($-20$ pts), but historical attempts and demonstrations are preserved.
   - Socratic Follow-Up Resolution: A correct follow-up answer moves active misconceptions to `resolvedMisconceptions` and restores status from `NEEDS_REVIEW` to `LEARNING` or `UNDERSTOOD`.

3. **Bounded Score Adjustments**:
   - Gain formula: $\Delta_{\text{gain}} = \text{round}\left( \text{baseDelta} \times \max\left(0.1, 1 - \frac{S_{\text{current}}}{120}\right) \right)$
   - Penalty formula: $\Delta_{\text{penalty}} = \text{round}\left( \text{basePenalty} \times \max\left(0.5, \frac{S_{\text{current}}}{100}\right) \right)$
   - Bounded strictly within $[0, 100]$.

4. **Retention & Recency Decay Formula**:
   - Grace period: 7 days after `lastDemonstratedAt`.
   - Elapsed days: $\Delta t = \max\left(0, \frac{\text{now} - \text{lastDemonstratedAt}}{86400000} - 7\right)$
   - Decay constant: $\lambda = 0.025$.
   - Decayed score: $S_{\text{decayed}} = \text{round}\left( S_{\text{mastery}} \times \max\left(0.35, e^{-\lambda \times \Delta t}\right) \right)$
   - Floor: $35\%$ of $S_{\text{mastery}}$ (demonstrated knowledge is never completely forgotten).

## Consequences
- Transparent, audit-proof grading and mastery calculations.
- Students cannot game mastery with a single guess.
- Temporal retention encourages timely spaced review without punitive score resets.
