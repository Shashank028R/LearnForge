import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import React from 'react';
import { ChatsPage } from './ChatsPage';
import { ThemeProvider } from '../context/ThemeContext';

describe('Chats and Messages Frontend Workflows (Phase 04)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  const renderWithProviders = (ui, initialRoute = '/chats') => {
    return render(
      <MemoryRouter initialEntries={[initialRoute]}>
        <ThemeProvider>{ui}</ThemeProvider>
      </MemoryRouter>
    );
  };

  it('renders conversation list and active chat messages from API', async () => {
    const mockChats = [
      {
        id: 'chat_1',
        _id: 'chat_1',
        title: 'Distributed Consensus & Raft',
        status: 'active',
        messagesCount: 2,
        lastMessageAt: new Date().toISOString(),
        subject: { id: 'sub_1', _id: 'sub_1', name: 'Distributed Systems', color: '#3b82f6' },
        topic: { id: 'top_1', _id: 'top_1', title: 'Raft Protocol' },
      },
      {
        id: 'chat_2',
        _id: 'chat_2',
        title: 'General Graph Theory',
        status: 'active',
        messagesCount: 0,
        lastMessageAt: new Date().toISOString(),
      },
    ];

    const mockMessages = [
      {
        id: 'msg_1',
        _id: 'msg_1',
        role: 'user',
        content: 'How does Raft elect a leader?',
        sequenceIndex: 0,
        createdAt: new Date().toISOString(),
      },
      {
        id: 'msg_2',
        _id: 'msg_2',
        role: 'assistant',
        content: 'Regarding Raft Protocol: When a follower misses heartbeats, it starts an election. What triggers this timeout?',
        sequenceIndex: 1,
        createdAt: new Date().toISOString(),
      },
    ];

    global.fetch = vi.fn().mockImplementation((url, opts) => {
      const urlStr = url.toString();

      // Messages query
      if (urlStr.includes('/messages')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: () => Promise.resolve({ success: true, data: { messages: mockMessages } }),
        });
      }

      // Single chat query
      if (urlStr.includes('/api/v1/chats/chat_1')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: () => Promise.resolve({ success: true, data: { chat: mockChats[0] } }),
        });
      }

      // Chats list query
      if (urlStr.includes('/api/v1/chats')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: () => Promise.resolve({ success: true, data: { chats: mockChats } }),
        });
      }

      return Promise.reject(new Error(`Unhandled fetch: ${urlStr}`));
    });

    renderWithProviders(
      <Routes>
        <Route path="/chats" element={<ChatsPage />} />
        <Route path="/chats/:chatId" element={<ChatsPage />} />
      </Routes>,
      '/chats/chat_1'
    );

    // Sidebar and Header items rendered
    const titleElements = await screen.findAllByText('Distributed Consensus & Raft');
    expect(titleElements.length).toBeGreaterThan(0);
    expect(screen.getByText('General Graph Theory')).toBeDefined();
    expect(screen.getAllByText('Distributed Systems')[0]).toBeDefined();

    // Active message thread rendered
    expect(await screen.findByText('How does Raft elect a leader?')).toBeDefined();
    expect(
      screen.getByText(/When a follower misses heartbeats, it starts an election/)
    ).toBeDefined();
  });

  it('renders empty state when user has no conversations', async () => {
    global.fetch = vi.fn().mockImplementation((url) => {
      if (url.toString().includes('/api/v1/chats')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: () => Promise.resolve({ success: true, data: { chats: [] } }),
        });
      }
      return Promise.reject(new Error(`Unhandled fetch: ${url}`));
    });

    renderWithProviders(<ChatsPage />);

    expect(await screen.findByText('Select or start a conversation')).toBeDefined();
  });

  it('opens new conversation modal and creates a topic-linked chat', async () => {
    const mockSubjects = [
      { id: 'sub_10', _id: 'sub_10', name: 'Operating Systems', color: '#10b981' },
    ];
    const mockTopics = [
      { id: 'top_10', _id: 'top_10', title: 'Virtual Memory & Paging' },
    ];

    const newChatObj = {
      id: 'chat_new',
      _id: 'chat_new',
      title: 'Study: Virtual Memory & Paging',
      status: 'active',
      messagesCount: 2,
      lastMessageAt: new Date().toISOString(),
      subject: mockSubjects[0],
      topic: mockTopics[0],
    };

    const initialMessages = [
      {
        id: 'msg_u',
        _id: 'msg_u',
        role: 'user',
        content: 'What is a page fault?',
        sequenceIndex: 0,
        createdAt: new Date().toISOString(),
      },
      {
        id: 'msg_a',
        _id: 'msg_a',
        role: 'assistant',
        content: 'Regarding Virtual Memory & Paging: A page fault occurs when accessed data is not in RAM.',
        sequenceIndex: 1,
        createdAt: new Date().toISOString(),
      },
    ];

    global.fetch = vi.fn().mockImplementation((url, opts) => {
      const urlStr = url.toString();

      if (urlStr.includes('/api/v1/subjects') && (!opts || opts.method === 'GET')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: () => Promise.resolve({ success: true, data: { subjects: mockSubjects } }),
        });
      }

      if (urlStr.includes('/api/v1/topics?subjectId=sub_10')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: () => Promise.resolve({ success: true, data: { topics: mockTopics } }),
        });
      }

      if (urlStr.includes('/api/v1/chats') && opts && opts.method === 'POST') {
        return Promise.resolve({
          ok: true,
          status: 201,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: () =>
            Promise.resolve({
              success: true,
              data: { chat: newChatObj, messages: initialMessages },
            }),
        });
      }

      if (urlStr.includes('/api/v1/chats/chat_new/messages')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: () => Promise.resolve({ success: true, data: { messages: initialMessages } }),
        });
      }

      if (urlStr.includes('/api/v1/chats/chat_new')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: () => Promise.resolve({ success: true, data: { chat: newChatObj } }),
        });
      }

      if (urlStr.includes('/api/v1/chats')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: () => Promise.resolve({ success: true, data: { chats: [] } }),
        });
      }

      return Promise.reject(new Error(`Unhandled fetch: ${urlStr}`));
    });

    renderWithProviders(
      <Routes>
        <Route path="/chats" element={<ChatsPage />} />
        <Route path="/chats/:chatId" element={<ChatsPage />} />
      </Routes>,
      '/chats'
    );

    // Click "New Chat"
    const newChatBtn = await screen.findByRole('button', { name: /New Chat/i });
    fireEvent.click(newChatBtn);

    // Modal dialog appears
    expect(await screen.findByText('Start New Socratic Conversation')).toBeDefined();

    // Select subject
    const subjectSelect = screen.getByLabelText(/Subject/i);
    fireEvent.change(subjectSelect, { target: { value: 'sub_10' } });

    // Submit form
    const submitBtn = screen.getByRole('button', { name: /Start Session/i });
    fireEvent.click(submitBtn);

    // Redirected and conversation rendered
    expect(await screen.findByText(/A page fault occurs when accessed data is not in RAM/)).toBeDefined();
  });

  it('sends a message and renders user & assistant response bubbles', async () => {
    const mockChat = {
      id: 'chat_active',
      _id: 'chat_active',
      title: 'Algorithms Chat',
      status: 'active',
      messagesCount: 0,
      lastMessageAt: new Date().toISOString(),
    };

    const returnedExchange = [
      {
        id: 'msg_10',
        _id: 'msg_10',
        role: 'user',
        content: 'Explain binary search complexity.',
        sequenceIndex: 0,
        createdAt: new Date().toISOString(),
      },
      {
        id: 'msg_11',
        _id: 'msg_11',
        role: 'assistant',
        content: 'Binary search splits the search interval in half each step, yielding O(log n).',
        sequenceIndex: 1,
        createdAt: new Date().toISOString(),
      },
    ];

    global.fetch = vi.fn().mockImplementation((url, opts) => {
      const urlStr = url.toString();

      if (urlStr.includes('/messages') && opts && opts.method === 'POST') {
        return Promise.resolve({
          ok: true,
          status: 201,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: () =>
            Promise.resolve({
              success: true,
              data: {
                messages: returnedExchange,
                userMessage: returnedExchange[0],
                assistantMessage: returnedExchange[1],
              },
            }),
        });
      }

      if (urlStr.includes('/messages') && (!opts || opts.method === 'GET')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: () => Promise.resolve({ success: true, data: { messages: [] } }),
        });
      }

      if (urlStr.includes('/api/v1/chats/chat_active')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: () => Promise.resolve({ success: true, data: { chat: mockChat } }),
        });
      }

      if (urlStr.includes('/api/v1/chats')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: () => Promise.resolve({ success: true, data: { chats: [mockChat] } }),
        });
      }

      return Promise.reject(new Error(`Unhandled fetch: ${urlStr}`));
    });

    renderWithProviders(
      <Routes>
        <Route path="/chats" element={<ChatsPage />} />
        <Route path="/chats/:chatId" element={<ChatsPage />} />
      </Routes>,
      '/chats/chat_active'
    );

    // Fill message input
    const textarea = await screen.findByPlaceholderText(/Type your message or question/i);
    fireEvent.change(textarea, { target: { value: 'Explain binary search complexity.' } });

    // Click Send
    const sendBtn = screen.getByRole('button', { name: /Send/i });
    fireEvent.click(sendBtn);

    // Verify messages rendered
    expect(await screen.findByText('Explain binary search complexity.')).toBeDefined();
    expect(
      await screen.findByText(/Binary search splits the search interval in half each step/)
    ).toBeDefined();
  });
});
