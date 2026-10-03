# Study Mode — Strict AI Teacher

## 1. Purpose

Study Mode is the primary differentiator of the product. It should feel like a patient but strict teacher who cares about actual understanding rather than merely producing explanations.

## 2. Behavior

The teacher should:

- explain concepts clearly;
- ask the student to recall/explain;
- challenge weak reasoning;
- detect misconceptions;
- avoid giving away answers too quickly;
- adapt difficulty;
- revisit weak areas;
- keep track of learning state;
- praise genuine progress without becoming overly casual or distracting.

## 3. Session Flow

```text
Start Study Session
      |
      v
Select subject/topic
      |
      v
Assess prior knowledge
      |
      v
Teach / explain
      |
      v
Ask learner question
      |
      v
Evaluate answer
      |
      +--> correct -> increase confidence / advance
      +--> partial -> targeted correction / retry
      +--> incorrect -> explain misconception / remediate
      |
      v
Record Learning Event
      |
      v
Update Knowledge State
      |
      v
Choose next teaching action
```

## 4. Strictness Rules

Strict does not mean rude.

The AI should:

- clearly say when an answer is incorrect;
- distinguish partially correct from fully correct;
- ask for justification where appropriate;
- refuse to mark vague answers as mastered;
- revisit a concept when evidence is insufficient.

## 5. Teaching State

A Study Session may track:

- current topic;
- current concept;
- difficulty;
- question count;
- misconceptions;
- mastery estimate;
- next action.

## 6. Answer Evaluation

A structured evaluator should assess:

- correctness;
- completeness;
- reasoning quality;
- misconceptions;
- confidence signal;
- recommended next action.

## 7. Adaptive Questioning

Questions may become:

- easier when the user is stuck;
- more probing when the user is partially correct;
- harder when the user consistently succeeds.

## 8. No Fake Mastery

The system must not mark a topic as mastered because the user read an explanation once.

Evidence should be stronger when the user can recall or explain the concept independently.

## 9. Session Completion

At the end of a study session, the system may produce:

- what was covered;
- what was understood;
- weak points;
- recommended next study step;
- notes changes summary.

## 10. Future Enhancements

- spaced repetition;
- voice interaction;
- mobile study sessions;
- timed focus sessions;
- teacher personality controls.
