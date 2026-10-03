# Knowledge Engine

## 1. Purpose

The Knowledge Engine converts study interactions into a structured representation of what the user has encountered, understood, misunderstood, or needs to review.

## 2. Core Principle

A chat transcript is evidence. It is not itself the knowledge model.

## 3. Learning Event Pipeline

```text
Chat / Study / Quiz / Import
          |
          v
Learning Event Extraction
          |
          v
Topic + Concept Resolution
          |
          v
Existing Knowledge Lookup
          |
          +--> New concept
          +--> Existing concept
          +--> Duplicate
          +--> Correction
          +--> Conflict
          |
          v
Knowledge State Evaluation
          |
          +--> update state
          +--> update confidence
          +--> record weak areas
          +--> schedule review signal
          |
          v
Notes / Progress / Quiz Signals
```

## 4. Concept Resolution

When new content appears, the engine should attempt to resolve it to an existing concept using:

1. exact/canonical name match;
2. normalized aliases;
3. topic context;
4. semantic similarity if later introduced;
5. AI-assisted resolution for ambiguous cases.

The final decision must be deterministic enough to audit.

## 5. Learning States

Suggested states:

- NOT_STARTED
- INTRODUCED
- LEARNING
- UNDERSTOOD
- STRONG
- NEEDS_REVIEW

State transitions must be based on explicit evidence and documented rules.

## 6. Confidence

Confidence is a product signal, not a claim of objective knowledge.

A simple initial model can combine:

- successful explanations;
- correct quiz answers;
- repeated successful recall;
- explicit user difficulty;
- detected misconceptions.

The score should be bounded and deterministic.

## 7. Misconception Handling

If a user gives an incorrect answer:

```text
Incorrect response
      |
      v
Identify misconception
      |
      v
Explain correction
      |
      v
Record weak area
      |
      v
Reduce/hold confidence
      |
      v
Create future review signal
```

## 8. Duplicate Knowledge

New information should not create duplicate concepts simply because wording differs.

Merge analysis should determine:

- exact duplicate;
- complementary information;
- broader/narrower concept;
- conflicting information.

## 9. Conflict Handling

If existing and new content disagree:

1. preserve both evidence sources;
2. flag the conflict;
3. generate a user-reviewable resolution;
4. never silently overwrite trusted user-edited content.

## 10. Source Attribution

Knowledge evidence should record sources such as:

- chat message;
- study session;
- quiz attempt;
- imported conversation;
- user-edited note.

## 11. Progress

Subject progress is derived from topic/concept states.

Avoid updating one `progressPercent` field from multiple places as the primary source of truth.

## 12. Review Scheduling

The first release can use simple review signals. A future release can evolve to spaced repetition.

Possible signal:

- `nextReviewAt` based on confidence/state and recent assessment.

## 13. Knowledge Consistency Rules

- one canonical knowledge state per user/concept;
- no orphan concepts;
- no unauthorized cross-user knowledge access;
- every automated change must be traceable to evidence;
- note changes and knowledge-state changes should be independently auditable.

## 14. Interview Questions to Support

- How does the system know the user learned something?
- How do you avoid duplicate concepts?
- How do you handle conflicting imported knowledge?
- How is progress computed?
- How does a quiz result affect knowledge?
- Why is the knowledge engine separated from chat?
