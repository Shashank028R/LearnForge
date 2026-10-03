# Notes Engine

## 1. Purpose

Turn knowledge into structured, editable, versioned study material without destroying user work.

## 2. Structured Document Model

A note is composed of typed blocks rather than an arbitrary HTML string.

Potential block types:

- heading;
- paragraph;
- bulletList;
- numberedList;
- code;
- table;
- quote;
- callout;
- diagram;
- image;
- equation where supported;
- Q&A;
- checklist;
- divider.

The exact editor library must be selected during implementation and documented.

## 3. Sources

Each meaningful block or generated section should be attributable where practical:

- user;
- AI;
- import;
- quiz;
- system.

## 4. Automatic Note Update Flow

```text
Learning Event
      |
      v
Note Context Retrieval
      |
      v
AI Note Update Analysis
      |
      v
Change Proposal
      |
      +--> add block
      +--> update block
      +--> merge block
      +--> flag conflict
      |
      v
Diff Generation
      |
      v
Policy Check
      |
      +--> auto-apply low-risk change
      +--> require review for high-risk change
      |
      v
New Note Version
```

## 5. AI vs User Authority

User-authored edits have higher authority than speculative AI text.

The system must not overwrite user-authored content merely because a new AI response phrases it differently.

## 6. Versioning

Every material change creates an immutable version snapshot.

Users should be able to:

- view history;
- compare changes;
- revert;
- identify source;
- understand why a change occurred.

## 7. Change Levels

### Low-risk

Appending a new clearly attributable key point to an existing AI-generated section.

### Medium-risk

Rewording or restructuring an existing AI-generated section.

### High-risk

Deleting, replacing, or substantially changing user-authored content.

The implementation should prefer automatic low-risk updates and review workflows for higher-risk updates.

## 8. Manual Editing

User must be able to:

- add;
- edit;
- delete;
- reorder;
- highlight;
- organize blocks.

Destructive actions require confirmation.

## 9. Rendering

The web UI should render structured blocks consistently. PDF export should consume the same structured source.

## 10. Search / Navigation

Future note search should be based on subject/topic/concept metadata first, with full-text or semantic search added when needed.

## 11. Export

PDF export should:

- preserve headings;
- preserve code formatting;
- preserve tables where possible;
- preserve diagrams/images when supported;
- include subject/topic title;
- remain readable in print.

## 12. Interview Questions

- Why structured blocks instead of raw HTML?
- How do AI note updates avoid data loss?
- How do you implement note history?
- How do you generate a PDF from the note model?
