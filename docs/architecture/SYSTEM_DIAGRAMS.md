# LearnForge — System Architecture Diagrams

This document contains canonical Mermaid architecture diagrams illustrating the structural organization, execution workflows, client-server decoupling, and engineering processes of **LearnForge**.

---

## 1. High-Level System Architecture

```mermaid
graph TB
    subgraph ClientLayer ["Client Layer (Present & Future)"]
        WebClient["LearnForge Web App<br/>(React + Vite + Tailwind)"]
        MobileClient["Future Mobile Client<br/>(React Native / Flutter)"]
    end

    subgraph APILayer ["API & Gateway Boundary (/api/v1)"]
        ReverseProxy["Reverse Proxy / CORS / Rate Limiter"]
        AuthMiddleware["Authentication & Request Context<br/>(Correlation ID, Session Validator)"]
    end

    subgraph ServiceLayer ["Domain Services Layer"]
        AuthService["Auth & Identity Service"]
        StudyService["Subject & Study Service"]
        ChatService["Conversation & Chat Service"]
        KnowledgeEngine["Knowledge Engine<br/>(Concept Extraction & Dedup)"]
        NotesEngine["Notes Engine<br/>(Diffs, Snapshots, Versions)"]
        QuizEngine["Quiz & Assessment Engine"]
        ImportEngine["Import & Normalization Engine"]
        AIGateway["AI Gateway & Task Router"]
    end

    subgraph PersistenceLayer ["Persistence & External Providers"]
        MongoDB[("MongoDB Database<br/>(Mongoose ODM)")]
        ObjectStorage[("Object Storage<br/>(Local Disk / S3 Assets)")]
        AIProviders["External AI Providers<br/>(Gemini, OpenAI, Groq)"]
        EmailProvider["Transactional Email<br/>(OTP Delivery)"]
    end

    WebClient --> ReverseProxy
    MobileClient -.-> ReverseProxy
    ReverseProxy --> AuthMiddleware
    AuthMiddleware --> AuthService
    AuthMiddleware --> StudyService
    AuthMiddleware --> ChatService
    AuthMiddleware --> KnowledgeEngine
    AuthMiddleware --> NotesEngine
    AuthMiddleware --> QuizEngine
    AuthMiddleware --> ImportEngine

    ChatService --> AIGateway
    StudyService --> AIGateway
    KnowledgeEngine --> AIGateway
    NotesEngine --> AIGateway
    QuizEngine --> AIGateway
    ImportEngine --> AIGateway

    AIGateway --> AIProviders
    AuthService --> EmailProvider

    AuthService --> MongoDB
    StudyService --> MongoDB
    ChatService --> MongoDB
    KnowledgeEngine --> MongoDB
    NotesEngine --> MongoDB
    QuizEngine --> MongoDB
    ImportEngine --> MongoDB
    ImportEngine --> ObjectStorage
```

---

## 2. Frontend / Backend Separation

```mermaid
sequenceDiagram
    autonumber
    actor User as Student
    participant Web as LearnForge Web App (Client)
    participant API as Express API Server (/api/v1)
    participant Auth as Auth & Context Middleware
    participant Domain as Domain Service (e.g. Chat/Study)
    participant DB as MongoDB Persistence
    participant AI as AI Gateway

    User->>Web: Interacts with UI (Study / Chat / Note)
    Web->>API: HTTP Request (JSON, Auth Header/Cookie, X-Request-ID)
    API->>Auth: Validate Token, Attach User Context & Request ID
    Auth->>Domain: Execute Domain Logic (Subject-scoped)
    Domain->>AI: Request AI Capability (Task, Schemas, Constraints)
    AI-->>Domain: Validated Structured AI Output
    Domain->>DB: Atomically persist domain entities
    DB-->>Domain: Persisted records
    Domain-->>API: Domain Result Envelope
    API-->>Web: Standard JSON Response: { success: true, data: {...}, meta: {...} }
    Web-->>User: Optimistic & Reactive UI Update
```

---

## 3. Future Mobile API Relationship

```mermaid
graph LR
    subgraph Clients
        Web["Web Client (React)"]
        Mobile["Mobile Client (iOS/Android)"]
    end

    subgraph APIFirstBackend ["Single Unified Backend (/api/v1)"]
        AuthEndpoints["/api/v1/auth/*"]
        SubjectEndpoints["/api/v1/subjects/*"]
        ChatEndpoints["/api/v1/chats/*"]
        NotesEndpoints["/api/v1/notes/*"]
        QuizEndpoints["/api/v1/quizzes/*"]
        ProgressEndpoints["/api/v1/profile/progress"]
    end

    subgraph CoreEngine ["Backend Core"]
        Engine["Unified Business Logic & Database"]
    end

    Web --> AuthEndpoints
    Web --> SubjectEndpoints
    Web --> ChatEndpoints
    Web --> NotesEndpoints
    Web --> QuizEndpoints
    Web --> ProgressEndpoints

    Mobile --> AuthEndpoints
    Mobile --> SubjectEndpoints
    Mobile --> ChatEndpoints
    Mobile --> NotesEndpoints
    Mobile --> QuizEndpoints
    Mobile --> ProgressEndpoints

    AuthEndpoints --> Engine
    SubjectEndpoints --> Engine
    ChatEndpoints --> Engine
    NotesEndpoints --> Engine
    QuizEndpoints --> Engine
    ProgressEndpoints --> Engine
```

---

## 4. Engineering & Documentation Lifecycle

```mermaid
flowchart TD
    Step1["1. Requirements Verification<br/>(Phase Scope, Acceptance Criteria)"] --> Step2["2. Architectural Design<br/>(ADRs, System Boundaries, Schema Design)"]
    Step2 --> Step3["3. Test-Driven Implementation<br/>(Unit, Integration, API Tests)"]
    Step3 --> Step4["4. Implementation Verification<br/>(Zero regressions, Linter, Health checks)"]
    Step4 --> Step5["5. Documentation Synchronization<br/>(Changelog, Dependencies, Phase Report, Interview Guide)"]
    Step5 --> Step6["6. Phase Review & Gate Acceptance<br/>(Clean Commit, Push to Remote, Owner Sign-off)"]
```
