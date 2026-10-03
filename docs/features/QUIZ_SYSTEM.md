# Quiz & Assessment System

## 1. Purpose

Provide assessments based on topics the user has actually studied and feed the results back into the knowledge model.

## 2. Quiz Sources

Questions should be generated from:

- covered concepts;
- note content;
- study interactions;
- prior weaknesses;
- recent quiz performance.

## 3. Modes

### Manual Quiz

User chooses topic(s) and difficulty.

### Adaptive Quiz

System selects questions based on knowledge state and performance.

### Review Quiz

Focuses on weak or due-for-review concepts.

## 4. Question Types

Initial set may include:

- multiple choice;
- multiple select;
- true/false where useful;
- short answer;
- explanation/teach-back.

Coding questions can be added later with a dedicated evaluation strategy.

## 5. Generation Pipeline

```text
User selects scope
      |
      v
Eligible Concepts
      |
      v
Difficulty / weakness filtering
      |
      v
AI question generation
      |
      v
Schema validation
      |
      v
Quiz created
```

## 6. Evaluation

Objective questions can be deterministically scored.

Open-ended questions should use structured AI evaluation with criteria, not a single unstructured verdict.

## 7. Knowledge Impact

Each answer should map back to a concept where possible.

Example:

```text
Wrong answer
   -> concept confidence reduced/held
   -> weak area recorded
   -> review signal created
```

Repeated correct performance may move a concept toward `STRONG`.

## 8. Integrity

Quiz generation must not assume that every note statement is automatically correct. Conflict-aware source selection should be used where relevant.

## 9. Progress Metrics

Track:

- quizzes completed;
- score;
- subject/topic performance;
- concept-level outcomes;
- improvement over time.

## 10. Future

- timed quizzes;
- exam simulation;
- coding assessments;
- spaced repetition;
- personalized mock interviews.
