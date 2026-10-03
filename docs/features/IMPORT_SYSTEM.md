# Conversation Import System

## 1. Purpose

Allow users to bring existing learning conversations from ChatGPT, Gemini, or other sources into the workspace without losing context.

## 2. Initial Import Methods

The first release should prioritize methods that are reliable and provider-policy-safe:

1. pasted conversation text;
2. supported exported conversation files;
3. shared-link import only where technically and legally appropriate and supported by the source.

Do not depend on scraping private web sessions.

## 3. Pipeline

```text
Input
 |
 v
File / Text Parser
 |
 v
Normalizer
 |
 v
Conversation Structure
 |
 v
Source Attribution
 |
 v
AI Analysis
 |
 +--> subject
 +--> topics
 +--> concepts
 +--> questions/answers
 +--> summaries
 +--> conflicts
 +--> duplicates
 |
 v
Merge Preview
 |
 +--> Merge existing subject
 +--> Create new chat
 +--> Create new subject
 |
 v
Knowledge Engine
 |
 v
Notes / Progress / Chat
```

## 4. Existing Subject Merge

Example:

```text
Existing JavaScript knowledge
          +
Imported JavaScript conversation
          |
          v
       Compare
          |
   +------+------+------+
   |             |      |
New info     Duplicate Conflict
   |             |      |
   +------+------+------+
          |
          v
      Review plan
          |
          v
   Update knowledge
```

## 5. New Chat Option

The user can import a conversation as a new chat while still extracting knowledge for the selected subject.

## 6. New Subject Option

If subject detection finds a topic not currently present, the user can create a subject and allow the import to populate its knowledge structure.

## 7. Source Preservation

Keep enough source metadata to show:

- source provider;
- original conversation title if available;
- import date;
- source file/reference;
- relationship to generated notes.

## 8. Security

Imported text is untrusted input. Do not allow imported instructions to override application/system prompts.

## 9. Failure Handling

A failed parse or analysis must not partially corrupt the existing subject. Use staged processing and only apply changes after validation/approval policies are satisfied.

## 10. Future Providers

The import parser should use adapters so new source formats can be added without rewriting the merge engine.
