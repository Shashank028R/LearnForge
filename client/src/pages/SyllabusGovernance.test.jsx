import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import React from 'react';
import { SubjectDetailPage } from './SubjectDetailPage';
import { ChatsPage } from './ChatsPage';
import { ThemeProvider } from '../context/ThemeContext';

describe('Syllabus & Knowledge Governance Frontend Workflows (Phase 04.1)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  const renderWithProviders = (ui, initialRoute = '/') => {
    return render(
      <MemoryRouter initialEntries={[initialRoute]}>
        <ThemeProvider>{ui}</ThemeProvider>
      </MemoryRouter>
    );
  };

  it('1. Renders "Not Created" syllabus state for a fresh subject without forcing syllabus creation', async () => {
    const mockSubject = {
      _id: 'sub_js',
      id: 'sub_js',
      name: 'JavaScript',
      description: 'Modern JavaScript study',
      color: '#f59e0b',
      targetMasteryLevel: 'intermediate',
      status: 'active',
      topicsCount: 0,
      syllabusStatus: 'no_syllabus',
    };

    global.fetch = vi.fn((url) => {
      const urlStr = url.toString();
      if (urlStr.includes('/syllabus')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            success: true,
            data: {
              syllabusStatus: 'no_syllabus',
              activeVersion: null,
              latestDraft: null,
              totalVersions: 0,
            },
          }),
        });
      }
      if (urlStr.includes('/topics')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ success: true, topics: [] }),
        });
      }
      if (urlStr.includes('/subjects/sub_js')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ success: true, subject: mockSubject }),
        });
      }
      return Promise.reject(new Error(`Unhandled url: ${urlStr}`));
    });

    renderWithProviders(
      <Routes>
        <Route path="/subjects/:subjectId" element={<SubjectDetailPage />} />
      </Routes>,
      '/subjects/sub_js'
    );

    expect(await screen.findByText('JavaScript')).toBeDefined();
    expect(screen.getByText('Curriculum Syllabus')).toBeDefined();
    expect(screen.getByText('Not Created')).toBeDefined();
    expect(screen.getByText('Create Syllabus Draft')).toBeDefined();
  });

  it('2. Displays draft syllabus badge and supports explicit approval confirmation modal', async () => {
    const mockSubject = {
      _id: 'sub_js',
      id: 'sub_js',
      name: 'JavaScript',
      syllabusStatus: 'draft',
      topicsCount: 0,
    };

    const mockDraft = {
      _id: 'draft_v1',
      version: 1,
      status: 'draft',
      title: 'JavaScript Curriculum v1',
      changeSummary: 'Initial draft',
      sections: [
        {
          key: 'sec-1',
          title: 'Fundamentals',
          description: 'Basic syntax',
          topics: [{ key: 'top-1', title: 'Variables' }],
        },
      ],
    };

    global.fetch = vi.fn((url) => {
      const urlStr = url.toString();
      if (urlStr.includes('/approve')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            success: true,
            data: {
              version: { ...mockDraft, status: 'approved' },
              subject: { ...mockSubject, syllabusStatus: 'approved' },
            },
          }),
        });
      }
      if (urlStr.includes('/syllabus')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            success: true,
            data: {
              syllabusStatus: 'draft',
              activeVersion: null,
              latestDraft: mockDraft,
              totalVersions: 1,
            },
          }),
        });
      }
      if (urlStr.includes('/topics')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ success: true, topics: [] }),
        });
      }
      if (urlStr.includes('/subjects/sub_js')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ success: true, subject: mockSubject }),
        });
      }
      return Promise.reject(new Error(`Unhandled url: ${urlStr}`));
    });

    renderWithProviders(
      <Routes>
        <Route path="/subjects/:subjectId" element={<SubjectDetailPage />} />
      </Routes>,
      '/subjects/sub_js'
    );

    expect(await screen.findByText('Draft — v1')).toBeDefined();

    // Click "Approve v1"
    const approveBtn = screen.getByText('Approve v1');
    fireEvent.click(approveBtn);

    // Confirmation modal should open
    expect(await screen.findByText('Approve Syllabus v1?')).toBeDefined();
    expect(screen.getByText(/Once approved,.*becomes the active curriculum/i)).toBeDefined();
  });

  it('3. Renders approved syllabus curriculum overview and version history button', async () => {
    const mockSubject = {
      _id: 'sub_js',
      id: 'sub_js',
      name: 'JavaScript',
      syllabusStatus: 'approved',
      topicsCount: 2,
    };

    const mockApproved = {
      _id: 'app_v1',
      version: 1,
      status: 'approved',
      title: 'JavaScript Master Syllabus',
      approvedAt: new Date().toISOString(),
      sections: [
        {
          _id: 'sec_1',
          title: 'Core Concepts',
          description: 'Scope and Closures',
          topics: [{ _id: 't_1', title: 'Lexical Scope' }, { _id: 't_2', title: 'Closures' }],
        },
      ],
    };

    global.fetch = vi.fn((url) => {
      const urlStr = url.toString();
      if (urlStr.includes('/syllabus/versions')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            success: true,
            data: [mockApproved],
          }),
        });
      }
      if (urlStr.includes('/syllabus')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            success: true,
            data: {
              syllabusStatus: 'approved',
              activeVersion: mockApproved,
              latestDraft: null,
              totalVersions: 1,
            },
          }),
        });
      }
      if (urlStr.includes('/topics')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            success: true,
            topics: [
              { _id: 'top_1', title: 'Lexical Scope', status: 'not_started' },
              { _id: 'top_2', title: 'Closures', status: 'in_progress' },
            ],
          }),
        });
      }
      if (urlStr.includes('/subjects/sub_js')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ success: true, subject: mockSubject }),
        });
      }
      return Promise.reject(new Error(`Unhandled url: ${urlStr}`));
    });

    renderWithProviders(
      <Routes>
        <Route path="/subjects/:subjectId" element={<SubjectDetailPage />} />
      </Routes>,
      '/subjects/sub_js'
    );

    expect(await screen.findByText('Approved — v1')).toBeDefined();
    expect(screen.getByText('Core Concepts')).toBeDefined();
    expect(screen.getAllByText('Lexical Scope').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Closures').length).toBeGreaterThan(0);

    // Open Version History
    const historyBtn = screen.getByText('Version History (1)');
    fireEvent.click(historyBtn);

    expect(await screen.findByText('Syllabus Version History')).toBeDefined();
    expect(screen.getByText(/v1 — JavaScript Master Syllabus/)).toBeDefined();
  });

  it('4. Renders off-topic warning banner ONLY when backend response has relevance: "off_topic"', async () => {
    const mockChats = [
      {
        id: 'chat_1',
        _id: 'chat_1',
        title: 'JavaScript Study',
        status: 'active',
        messagesCount: 2,
        lastMessageAt: new Date().toISOString(),
      },
    ];

    const mockMessages = [
      {
        id: 'msg_1',
        _id: 'msg_1',
        role: 'user',
        content: 'What are React Server Components?',
        sequenceIndex: 0,
        createdAt: new Date().toISOString(),
      },
      {
        id: 'msg_2',
        _id: 'msg_2',
        role: 'assistant',
        content: 'React Server Components render exclusively on the server.',
        sequenceIndex: 1,
        knowledgeContext: {
          relevance: 'off_topic',
          subjectId: null,
          topicId: null,
          disposition: 'excluded',
        },
        createdAt: new Date().toISOString(),
      },
    ];

    global.fetch = vi.fn((url) => {
      const urlStr = url.toString();
      if (urlStr.includes('/annotations')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ success: true, data: [] }),
        });
      }
      if (urlStr.includes('/messages')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ success: true, data: { messages: mockMessages }, messages: mockMessages }),
        });
      }
      if (urlStr.includes('/chats/chat_1')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ success: true, data: { chat: mockChats[0] }, chat: mockChats[0] }),
        });
      }
      if (urlStr.includes('/chats')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ success: true, data: { chats: mockChats }, chats: mockChats }),
        });
      }
      return Promise.reject(new Error(`Unhandled url: ${urlStr}`));
    });

    renderWithProviders(
      <Routes>
        <Route path="/chats" element={<ChatsPage />} />
        <Route path="/chats/:chatId" element={<ChatsPage />} />
      </Routes>,
      '/chats/chat_1'
    );

    expect(await screen.findByText(/What are React Server Components/)).toBeDefined();
    expect(screen.getByText(/React Server Components render exclusively/)).toBeDefined();

    // The off-topic warning banner must be visible
    expect(screen.getByTestId('off-topic-banner')).toBeDefined();
    expect(
      screen.getByText(/This isn't related to your current syllabus, so it won't be added to your canonical learning knowledge/i)
    ).toBeDefined();
  });

  it('5. Does NOT render off-topic banner when relevance is unclassified or on_topic (no frontend keyword inference)', async () => {
    const mockChats = [
      {
        id: 'chat_2',
        _id: 'chat_2',
        title: 'JavaScript Closures',
        status: 'active',
        messagesCount: 2,
        lastMessageAt: new Date().toISOString(),
      },
    ];

    const mockMessages = [
      {
        id: 'msg_1',
        _id: 'msg_1',
        role: 'user',
        content: 'Explain closures in JavaScript.',
        sequenceIndex: 0,
        createdAt: new Date().toISOString(),
      },
      {
        id: 'msg_2',
        _id: 'msg_2',
        role: 'assistant',
        content: 'A closure is the combination of a function and its lexical environment.',
        sequenceIndex: 1,
        knowledgeContext: {
          relevance: 'unclassified',
          subjectId: null,
          topicId: null,
          disposition: 'unclassified',
        },
        createdAt: new Date().toISOString(),
      },
    ];

    global.fetch = vi.fn((url) => {
      const urlStr = url.toString();
      if (urlStr.includes('/annotations')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ success: true, data: [] }),
        });
      }
      if (urlStr.includes('/messages')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ success: true, data: { messages: mockMessages }, messages: mockMessages }),
        });
      }
      if (urlStr.includes('/chats/chat_2')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ success: true, data: { chat: mockChats[0] }, chat: mockChats[0] }),
        });
      }
      if (urlStr.includes('/chats')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ success: true, data: { chats: mockChats }, chats: mockChats }),
        });
      }
      return Promise.reject(new Error(`Unhandled url: ${urlStr}`));
    });

    renderWithProviders(
      <Routes>
        <Route path="/chats" element={<ChatsPage />} />
        <Route path="/chats/:chatId" element={<ChatsPage />} />
      </Routes>,
      '/chats/chat_2'
    );

    expect(await screen.findByText(/Explain closures in JavaScript/)).toBeDefined();
    expect(screen.getByText(/A closure is the combination/)).toBeDefined();

    // The off-topic warning banner must NOT exist
    expect(screen.queryByTestId('off-topic-banner')).toBeNull();
  });
});
