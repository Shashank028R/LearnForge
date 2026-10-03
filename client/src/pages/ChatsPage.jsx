import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  Button,
  IconButton,
  Input,
  Dialog,
  Dropdown,
  Badge,
  Skeleton,
  EmptyState,
  ErrorState,
  Icon,
} from '../components/ui';
import chatsApi from '../api/chatsApi';
import { subjectsApi, topicsApi } from '../api/subjectsApi';
import annotationsApi from '../api/annotationsApi';

export function ChatsPage() {
  const { chatId: routeChatId } = useParams();
  const navigate = useNavigate();

  // Conversations State
  const [chats, setChats] = useState([]);
  const [activeChat, setActiveChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [isLoadingChats, setIsLoadingChats] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [chatsError, setChatsError] = useState(null);
  const [messagesError, setMessagesError] = useState(null);

  // Annotations State (messageId -> array of annotations)
  const [annotationsMap, setAnnotationsMap] = useState({});
  const [annotatingMessage, setAnnotatingMessage] = useState(null);
  const [annotationType, setAnnotationType] = useState('comment'); // 'comment' | 'tag'
  const [annotationContent, setAnnotationContent] = useState('');
  const [isSubmittingAnnotation, setIsSubmittingAnnotation] = useState(false);
  const [annotationError, setAnnotationError] = useState('');

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('active'); // 'active' | 'archived' | 'all'

  // Composer State
  const [messageInput, setMessageInput] = useState('');
  const [copiedMessageId, setCopiedMessageId] = useState(null);
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  // Modal Dialogs
  const [isNewChatOpen, setIsNewChatOpen] = useState(false);
  const [isDeleteChatOpen, setIsDeleteChatOpen] = useState(false);
  const [chatToDelete, setChatToDelete] = useState(null);

  // New Chat Form
  const [newChatTitle, setNewChatTitle] = useState('');
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [selectedTopicId, setSelectedTopicId] = useState('');
  const [initialPrompt, setInitialPrompt] = useState('');
  const [isCreatingChat, setIsCreatingChat] = useState(false);
  const [formError, setFormError] = useState('');

  // Loaded Subjects & Topics for Modal Selector
  const [availableSubjects, setAvailableSubjects] = useState([]);
  const [availableTopics, setAvailableTopics] = useState([]);
  const [isLoadingSubjects, setIsLoadingSubjects] = useState(false);

  // Auto-scroll to bottom of messages
  const scrollToBottom = (smooth = true) => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({
        behavior: smooth ? 'smooth' : 'auto',
      });
    }
  };

  // 1. Fetch User Chats List
  const fetchChats = async () => {
    try {
      setIsLoadingChats(true);
      setChatsError(null);
      const params = {};
      if (statusFilter !== 'all') params.status = statusFilter;
      if (searchQuery.trim()) params.search = searchQuery.trim();

      const res = await chatsApi.list(params);
      const list = res?.chats || res?.data?.chats || [];
      setChats(list);

      // Select active chat based on route or first chat
      if (routeChatId) {
        const found = list.find((c) => c.id === routeChatId || c._id === routeChatId);
        if (found) {
          setActiveChat(found);
        } else {
          fetchSingleChat(routeChatId);
        }
      } else if (list.length > 0 && !activeChat) {
        setActiveChat(list[0]);
        navigate(`/chats/${list[0].id || list[0]._id}`, { replace: true });
      }
    } catch (err) {
      setChatsError(err.message || 'Failed to load conversations.');
    } finally {
      setIsLoadingChats(false);
    }
  };

  const fetchSingleChat = async (id) => {
    try {
      const res = await chatsApi.get(id);
      const chat = res?.chat || res?.data?.chat;
      if (chat) {
        setActiveChat(chat);
      }
    } catch (err) {
      setChatsError('Conversation not found or access denied.');
    }
  };

  // 2. Fetch Messages for Active Chat
  const fetchMessages = async (chatId) => {
    if (!chatId) return;
    try {
      setIsLoadingMessages(true);
      setMessagesError(null);
      const res = await chatsApi.listMessages(chatId);
      const msgList = res?.messages || res?.data?.messages || [];
      setMessages(msgList);
      setTimeout(() => scrollToBottom(false), 50);

      // Fetch annotations for all messages in the chat
      fetchAnnotationsForMessages(chatId, msgList);
    } catch (err) {
      setMessagesError(err.message || 'Failed to load messages.');
    } finally {
      setIsLoadingMessages(false);
    }
  };

  const fetchAnnotationsForMessages = async (chatId, msgList) => {
    const map = {};
    for (const msg of msgList) {
      const mId = msg.id || msg._id;
      try {
        const res = await annotationsApi.listForMessage(chatId, mId);
        if (res?.data && res.data.length > 0) {
          map[mId] = res.data;
        }
      } catch {
        // ignore per-message annotation fetch errors
      }
    }
    setAnnotationsMap(map);
  };

  // Load chats on initial render or filter changes
  useEffect(() => {
    fetchChats();
  }, [statusFilter, searchQuery]);

  // Load messages when route parameter changes
  useEffect(() => {
    if (routeChatId) {
      if (!activeChat || (activeChat.id !== routeChatId && activeChat._id !== routeChatId)) {
        const found = chats.find((c) => c.id === routeChatId || c._id === routeChatId);
        if (found) {
          setActiveChat(found);
        } else {
          fetchSingleChat(routeChatId);
        }
      }
      fetchMessages(routeChatId);
    } else if (chats.length > 0 && !activeChat) {
      const first = chats[0];
      setActiveChat(first);
      navigate(`/chats/${first.id || first._id}`, { replace: true });
    }
  }, [routeChatId]);

  // Load Subjects for New Chat Modal
  const loadSubjectsForModal = async () => {
    try {
      setIsLoadingSubjects(true);
      const res = await subjectsApi.list();
      setAvailableSubjects(res?.subjects || res?.data?.subjects || []);
    } catch (err) {
      console.error('Failed to load subjects for new chat modal:', err);
    } finally {
      setIsLoadingSubjects(false);
    }
  };

  // Load Topics when Subject changes in Modal
  const handleSubjectChangeInModal = async (subjId) => {
    setSelectedSubjectId(subjId);
    setSelectedTopicId('');
    if (!subjId) {
      setAvailableTopics([]);
      return;
    }
    try {
      const res = await topicsApi.list(subjId);
      setAvailableTopics(res?.topics || res?.data?.topics || []);
    } catch (err) {
      console.error('Failed to load topics for subject:', err);
      setAvailableTopics([]);
    }
  };

  // Handle Send Message
  const handleSendMessage = async (e) => {
    if (e) e.preventDefault();
    if (!messageInput.trim() || isSending || !activeChat) return;

    const trimmed = messageInput.trim();
    const chatId = activeChat.id || activeChat._id;

    // Optimistic user message preview
    const tempUserMessage = {
      id: `temp-${Date.now()}`,
      _id: `temp-${Date.now()}`,
      chatId,
      role: 'user',
      content: trimmed,
      status: 'sending',
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, tempUserMessage]);
    setMessageInput('');
    setIsSending(true);
    setTimeout(() => scrollToBottom(true), 50);

    try {
      const res = await chatsApi.sendMessage(chatId, {
        content: trimmed,
        role: 'user',
      });

      const responseMessages = res?.messages || res?.data?.messages || [];
      if (responseMessages.length > 0) {
        setMessages((prev) => {
          const filtered = prev.filter((m) => m.id !== tempUserMessage.id && m._id !== tempUserMessage.id);
          return [...filtered, ...responseMessages];
        });
      } else {
        await fetchMessages(chatId);
      }

      // Update sidebar chat lastMessageAt / title
      setChats((prev) =>
        prev.map((c) => {
          if (c.id === chatId || c._id === chatId) {
            return {
              ...c,
              lastMessageAt: new Date().toISOString(),
              messagesCount: (c.messagesCount || 0) + 2,
              title:
                c.title === 'New Conversation' ? trimmed.slice(0, 60) : c.title,
            };
          }
          return c;
        })
      );
    } catch (err) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === tempUserMessage.id || m._id === tempUserMessage.id
            ? { ...m, status: 'error', errorMessage: err.message || 'Failed to send' }
            : m
        )
      );
    } finally {
      setIsSending(false);
      setTimeout(() => scrollToBottom(true), 50);
    }
  };

  // Handle Create New Chat
  const handleCreateChat = async (e) => {
    e.preventDefault();
    setFormError('');
    setIsCreatingChat(true);

    try {
      const payload = {
        title: newChatTitle.trim() || undefined,
        subjectId: selectedSubjectId || undefined,
        topicId: selectedTopicId || undefined,
        initialMessage: initialPrompt.trim() || undefined,
      };

      const res = await chatsApi.create(payload);
      const createdChat = res?.chat || res?.data?.chat;
      const initialMsgs = res?.messages || res?.data?.messages || [];

      setIsNewChatOpen(false);
      setNewChatTitle('');
      setSelectedSubjectId('');
      setSelectedTopicId('');
      setInitialPrompt('');

      if (createdChat) {
        const newChatId = createdChat.id || createdChat._id;
        setChats((prev) => [createdChat, ...prev]);
        setActiveChat(createdChat);
        setMessages(initialMsgs);
        navigate(`/chats/${newChatId}`);
      } else {
        await fetchChats();
      }
    } catch (err) {
      setFormError(err.message || 'Failed to create conversation.');
    } finally {
      setIsCreatingChat(false);
    }
  };

  // Handle Delete Chat
  const handleDeleteChat = async () => {
    if (!chatToDelete) return;
    const delId = chatToDelete.id || chatToDelete._id;
    try {
      await chatsApi.delete(delId);
      setIsDeleteChatOpen(false);
      setChatToDelete(null);

      const remaining = chats.filter((c) => c.id !== delId && c._id !== delId);
      setChats(remaining);

      if (activeChat && (activeChat.id === delId || activeChat._id === delId)) {
        if (remaining.length > 0) {
          const next = remaining[0];
          setActiveChat(next);
          navigate(`/chats/${next.id || next._id}`);
        } else {
          setActiveChat(null);
          setMessages([]);
          navigate('/chats');
        }
      }
    } catch (err) {
      setChatsError(err.message || 'Failed to delete conversation.');
    }
  };

  // Handle Toggle Chat Archive Status
  const handleToggleArchive = async () => {
    if (!activeChat) return;
    const chatId = activeChat.id || activeChat._id;
    const newStatus = activeChat.status === 'archived' ? 'active' : 'archived';

    try {
      const res = await chatsApi.update(chatId, { status: newStatus });
      const updated = res?.chat || res?.data?.chat || { ...activeChat, status: newStatus };
      setActiveChat(updated);
      setChats((prev) =>
        prev.map((c) => (c.id === chatId || c._id === chatId ? updated : c))
      );
    } catch (err) {
      setChatsError(err.message || 'Failed to update conversation status.');
    }
  };

  // Handle Copy Message Content
  const handleCopyMessage = (msgId, text) => {
    navigator.clipboard.writeText(text);
    setCopiedMessageId(msgId);
    setTimeout(() => setCopiedMessageId(null), 2000);
  };

  // Handle Textarea Keydown (Enter to send, Shift+Enter for newline)
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Annotation Handlers
  const handleOpenAnnotationModal = (msg, defaultType = 'comment') => {
    setAnnotatingMessage(msg);
    setAnnotationType(defaultType);
    setAnnotationContent('');
    setAnnotationError('');
  };

  const handleSaveAnnotation = async (e) => {
    e.preventDefault();
    if (!annotatingMessage || !annotationContent.trim()) return;

    const chatId = activeChat.id || activeChat._id;
    const messageId = annotatingMessage.id || annotatingMessage._id;

    try {
      setIsSubmittingAnnotation(true);
      setAnnotationError('');
      const res = await annotationsApi.create(chatId, messageId, {
        type: annotationType,
        content: annotationContent.trim(),
      });

      if (res?.data) {
        setAnnotationsMap((prev) => ({
          ...prev,
          [messageId]: [...(prev[messageId] || []), res.data],
        }));
      }
      setAnnotatingMessage(null);
      setAnnotationContent('');
    } catch (err) {
      setAnnotationError(err.message || 'Failed to save annotation.');
    } finally {
      setIsSubmittingAnnotation(false);
    }
  };

  const handleDeleteAnnotation = async (messageId, annotationId) => {
    try {
      await annotationsApi.delete(annotationId);
      setAnnotationsMap((prev) => ({
        ...prev,
        [messageId]: (prev[messageId] || []).filter((a) => a._id !== annotationId),
      }));
    } catch (err) {
      console.error('Failed to delete annotation:', err);
    }
  };

  return (
    <div className="h-[calc(100vh-4rem)] flex overflow-hidden -m-4 md:-m-6" data-testid="chats-page">
      {/* ======================================================== */}
      {/* LEFT SIDEBAR: Conversation Sessions List & Search        */}
      {/* ======================================================== */}
      <div className="w-80 border-r border-app-border bg-app-bg-secondary/30 flex flex-col shrink-0">
        {/* Sidebar Header & Action */}
        <div className="p-3 border-b border-app-border space-y-2.5">
          <div className="flex items-center justify-between">
            <h1 className="text-sm font-bold text-app-text-primary tracking-tight flex items-center gap-1.5">
              <Icon name="chat" size={16} className="text-app-accent" />
              <span>Socratic Dialogues</span>
            </h1>
            <Button
              variant="primary"
              size="sm"
              icon={<Icon name="plus" size={14} />}
              onClick={() => {
                loadSubjectsForModal();
                setIsNewChatOpen(true);
              }}
              data-testid="btn-new-chat"
            >
              New Chat
            </Button>
          </div>

          {/* Search Input */}
          <div className="relative">
            <Icon
              name="search"
              size={13}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-app-text-muted"
            />
            <input
              type="text"
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full text-xs pl-8 pr-3 py-1.5 bg-app-surface border border-app-border rounded-lg text-app-text-primary placeholder:text-app-text-muted focus:outline-none focus:border-app-accent"
            />
          </div>

          {/* Status Tabs */}
          <div className="flex items-center gap-1 bg-app-surface p-0.5 rounded-lg border border-app-border text-xs">
            <button
              onClick={() => setStatusFilter('active')}
              className={`flex-1 py-1 text-center font-medium rounded-md transition-colors ${
                statusFilter === 'active'
                  ? 'bg-app-bg-secondary text-app-text-primary shadow-xs'
                  : 'text-app-text-muted hover:text-app-text-secondary'
              }`}
            >
              Active
            </button>
            <button
              onClick={() => setStatusFilter('archived')}
              className={`flex-1 py-1 text-center font-medium rounded-md transition-colors ${
                statusFilter === 'archived'
                  ? 'bg-app-bg-secondary text-app-text-primary shadow-xs'
                  : 'text-app-text-muted hover:text-app-text-secondary'
              }`}
            >
              Archived
            </button>
            <button
              onClick={() => setStatusFilter('all')}
              className={`flex-1 py-1 text-center font-medium rounded-md transition-colors ${
                statusFilter === 'all'
                  ? 'bg-app-bg-secondary text-app-text-primary shadow-xs'
                  : 'text-app-text-muted hover:text-app-text-secondary'
              }`}
            >
              All
            </button>
          </div>
        </div>

        {/* Conversation List Scroll Area */}
        <div className="flex-1 overflow-y-auto divide-y divide-app-border/40">
          {isLoadingChats ? (
            <div className="p-3 space-y-3">
              {[1, 2, 3, 4].map((n) => (
                <div key={n} className="space-y-1.5 p-2 rounded-lg bg-app-surface/40">
                  <Skeleton className="h-3.5 w-3/4 rounded" />
                  <Skeleton className="h-2.5 w-1/2 rounded" />
                </div>
              ))}
            </div>
          ) : chatsError ? (
            <div className="p-4 text-center">
              <p className="text-xs text-app-danger mb-2">{chatsError}</p>
              <Button variant="secondary" size="sm" onClick={fetchChats}>
                Retry
              </Button>
            </div>
          ) : chats.length === 0 ? (
            <div className="p-6 text-center">
              <Icon name="chat" size={24} className="mx-auto text-app-text-muted mb-2" />
              <p className="text-xs font-semibold text-app-text-primary">No conversations</p>
              <p className="text-[11px] text-app-text-muted mt-0.5">
                {searchQuery ? 'No matching chats found' : 'Start a new Socratic study session'}
              </p>
            </div>
          ) : (
            chats.map((chat) => {
              const isActive =
                activeChat && (activeChat.id === chat.id || activeChat._id === chat._id);
              const chatId = chat.id || chat._id;
              return (
                <div
                  key={chatId}
                  onClick={() => {
                    setActiveChat(chat);
                    navigate(`/chats/${chatId}`);
                  }}
                  className={`p-3 cursor-pointer transition-colors relative group ${
                    isActive
                      ? 'bg-app-accent/10 border-l-2 border-app-accent'
                      : 'hover:bg-app-surface/60'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3
                      className={`text-xs font-semibold line-clamp-1 ${
                        isActive ? 'text-app-accent' : 'text-app-text-primary'
                      }`}
                    >
                      {chat.title}
                    </h3>
                    <span className="text-[10px] text-app-text-muted shrink-0">
                      {chat.lastMessageAt
                        ? new Date(chat.lastMessageAt).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                          })
                        : ''}
                    </span>
                  </div>

                  {/* Context Chips (Subject / Topic) */}
                  <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                    {chat.subject && (
                      <span
                        className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-medium"
                        style={{
                          backgroundColor: `${chat.subject.color || '#3b82f6'}20`,
                          color: chat.subject.color || '#3b82f6',
                        }}
                      >
                        <span
                          className="w-1.5 h-1.5 rounded-full"
                          style={{ backgroundColor: chat.subject.color || '#3b82f6' }}
                        />
                        {chat.subject.name}
                      </span>
                    )}
                    {chat.topic && (
                      <span className="text-[10px] bg-app-border/40 text-app-text-secondary px-1.5 py-0.5 rounded font-medium truncate max-w-[120px]">
                        {chat.topic.title}
                      </span>
                    )}
                    {chat.status === 'archived' && (
                      <Badge variant="neutral" size="sm" className="text-[9px] py-0 px-1">
                        Archived
                      </Badge>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ======================================================== */}
      {/* RIGHT MAIN PANE: Conversation Workspace & Messages       */}
      {/* ======================================================== */}
      <div className="flex-1 flex flex-col bg-app-surface min-w-0">
        {activeChat ? (
          <>
            {/* Conversation Top Header */}
            <div className="h-14 px-4 border-b border-app-border flex items-center justify-between shrink-0 bg-app-surface">
              <div className="flex items-center gap-3 min-w-0">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-bold text-app-text-primary truncate">
                      {activeChat.title}
                    </h2>
                    {activeChat.status === 'archived' && (
                      <Badge variant="neutral" size="sm">
                        Archived
                      </Badge>
                    )}
                  </div>

                  {/* Subject and Topic Breadcrumb */}
                  <div className="flex items-center gap-2 text-xs text-app-text-muted truncate mt-0.5">
                    {activeChat.subject ? (
                      <Link
                        to={`/subjects/${activeChat.subject.id || activeChat.subject._id}`}
                        className="hover:underline flex items-center gap-1 font-medium"
                        style={{ color: activeChat.subject.color || '#3b82f6' }}
                      >
                        <span
                          className="w-1.5 h-1.5 rounded-full"
                          style={{ backgroundColor: activeChat.subject.color || '#3b82f6' }}
                        />
                        <span>{activeChat.subject.name}</span>
                      </Link>
                    ) : (
                      <span>Free-form conversation</span>
                    )}

                    {activeChat.topic && (
                      <>
                        <span>/</span>
                        <span className="text-app-text-secondary font-medium truncate">
                          {activeChat.topic.title}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Action Toolbar */}
              <div className="flex items-center gap-1 shrink-0">
                <IconButton
                  icon={
                    <Icon
                      name={activeChat.status === 'archived' ? 'refresh' : 'archive'}
                      size={15}
                    />
                  }
                  label={activeChat.status === 'archived' ? 'Unarchive' : 'Archive'}
                  variant="ghost"
                  size="sm"
                  onClick={handleToggleArchive}
                />
                <IconButton
                  icon={<Icon name="trash" size={15} />}
                  label="Delete Conversation"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setChatToDelete(activeChat);
                    setIsDeleteChatOpen(true);
                  }}
                  className="text-app-text-muted hover:text-status-danger"
                />
              </div>
            </div>

            {/* Messages Scroll Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {isLoadingMessages ? (
                <div className="space-y-4 max-w-2xl mx-auto pt-4">
                  <div className="flex items-start gap-3">
                    <Skeleton className="w-8 h-8 rounded-full shrink-0" />
                    <div className="space-y-2 flex-1">
                      <Skeleton className="h-4 w-3/4 rounded" />
                      <Skeleton className="h-4 w-1/2 rounded" />
                    </div>
                  </div>
                </div>
              ) : messagesError ? (
                <ErrorState
                  title="Failed to load messages"
                  message={messagesError}
                  actionLabel="Retry"
                  onAction={() => fetchMessages(activeChat.id || activeChat._id)}
                />
              ) : messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-3">
                  <div className="w-12 h-12 rounded-full bg-app-accent/10 flex items-center justify-center text-app-accent">
                    <Icon name="sparkles" size={24} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-app-text-primary">
                      Ready for Socratic Exploration
                    </h3>
                    <p className="text-xs text-app-text-muted max-w-sm mt-1">
                      Ask a foundational question or submit your current understanding to begin a structured dialogue.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 justify-center max-w-md pt-2">
                    {[
                      'Explain the core intuition behind this topic.',
                      'What are the common pitfalls or misconceptions?',
                      'Quiz me with a foundational scenario question.',
                    ].map((promptText, i) => (
                      <button
                        key={i}
                        onClick={() => {
                          setMessageInput(promptText);
                          if (textareaRef.current) textareaRef.current.focus();
                        }}
                        className="text-xs bg-app-bg-secondary hover:bg-app-accent/10 border border-app-border text-app-text-secondary hover:text-app-accent px-3 py-1.5 rounded-lg transition-colors text-left"
                      >
                        {promptText}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                messages.map((msg) => {
                  const isUser = msg.role === 'user';
                  const msgId = msg.id || msg._id;
                  const isOffTopic = msg.knowledgeContext?.relevance === 'off_topic';
                  const msgAnnotations = annotationsMap[msgId] || [];

                  return (
                    <div
                      key={msgId}
                      className={`flex items-start gap-3 ${
                        isUser ? 'justify-end' : 'justify-start'
                      }`}
                      data-testid={`message-${msgId}`}
                    >
                      {/* Assistant Avatar */}
                      {!isUser && (
                        <div className="w-7 h-7 rounded-full bg-app-accent/15 border border-app-accent/30 flex items-center justify-center text-app-accent shrink-0 mt-0.5">
                          <Icon name="sparkles" size={14} />
                        </div>
                      )}

                      {/* Message Bubble Column */}
                      <div className="max-w-[85%] md:max-w-[75%] space-y-1.5">
                        {/* Off-Topic Warning Banner (Rendered ONLY when relevance === 'off_topic') */}
                        {isOffTopic && (
                          <div
                            className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/25 text-amber-800 dark:text-amber-300 text-[11px] flex items-start gap-2"
                            data-testid="off-topic-banner"
                          >
                            <span className="font-bold shrink-0">⚠ Off-topic:</span>
                            <span className="leading-snug">
                              This isn't related to your current syllabus, so it won't be added to your canonical learning knowledge.
                            </span>
                          </div>
                        )}

                        <div
                          className={`rounded-2xl p-3.5 text-xs relative group ${
                            isUser
                              ? 'bg-app-accent text-white rounded-tr-xs'
                              : 'bg-app-bg-secondary border border-app-border text-app-text-primary rounded-tl-xs'
                          }`}
                        >
                          <div className="whitespace-pre-wrap leading-relaxed">
                            {msg.content}
                          </div>

                          {/* Footer / Time / Annotate / Copy */}
                          <div
                            className={`flex items-center justify-between gap-2 mt-2 pt-1 border-t ${
                              isUser ? 'border-white/20 text-white/75' : 'border-app-border/40 text-app-text-muted'
                            } text-[10px]`}
                          >
                            <span>
                              {msg.createdAt
                                ? new Date(msg.createdAt).toLocaleTimeString([], {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })
                                : ''}
                            </span>

                            <div className="flex items-center gap-2">
                              {/* Annotate Actions */}
                              {!isUser && (
                                <>
                                  <button
                                    onClick={() => handleOpenAnnotationModal(msg, 'comment')}
                                    className="opacity-0 group-hover:opacity-100 transition-opacity hover:underline inline-flex items-center gap-0.5"
                                  >
                                    <Icon name="edit" size={10} /> Add Comment
                                  </button>
                                  <button
                                    onClick={() => handleOpenAnnotationModal(msg, 'tag')}
                                    className="opacity-0 group-hover:opacity-100 transition-opacity hover:underline inline-flex items-center gap-0.5"
                                  >
                                    <Icon name="layers" size={10} /> Add Tag
                                  </button>
                                </>
                              )}

                              <button
                                onClick={() => handleCopyMessage(msgId, msg.content)}
                                className="opacity-0 group-hover:opacity-100 transition-opacity hover:underline inline-flex items-center gap-0.5"
                                title="Copy message"
                              >
                                <Icon name={copiedMessageId === msgId ? 'check' : 'copy'} size={11} />
                                {copiedMessageId === msgId ? 'Copied' : 'Copy'}
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* User Auxiliary Annotations Display */}
                        {msgAnnotations.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 pt-0.5 pl-1" data-testid={`annotations-${msgId}`}>
                            {msgAnnotations.map((ann) => (
                              <div
                                key={ann._id}
                                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] bg-app-surface-muted border border-app-border text-app-text-secondary group/ann"
                              >
                                <span className="font-semibold text-app-text-muted">
                                  {ann.type === 'tag' ? '#' : '💬'}
                                </span>
                                <span>{ann.content}</span>
                                <button
                                  onClick={() => handleDeleteAnnotation(msgId, ann._id)}
                                  className="opacity-0 group-hover/ann:opacity-100 hover:text-status-danger transition-opacity"
                                  title="Delete annotation"
                                >
                                  ×
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* User Avatar */}
                      {isUser && (
                        <div className="w-7 h-7 rounded-full bg-app-surface border border-app-border flex items-center justify-center text-app-text-secondary shrink-0 mt-0.5">
                          <Icon name="user" size={14} />
                        </div>
                      )}
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Message Composer Area */}
            <div className="p-3 border-t border-app-border bg-app-bg-secondary/40 shrink-0">
              <form onSubmit={handleSendMessage} className="space-y-2">
                <div className="relative flex items-end gap-2 bg-app-surface border border-app-border rounded-xl p-2 shadow-xs focus-within:border-app-accent focus-within:ring-1 focus-within:ring-app-accent">
                  <textarea
                    ref={textareaRef}
                    rows={2}
                    value={messageInput}
                    onChange={(e) => setMessageInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Type your message or question... (Enter to send, Shift+Enter for new line)"
                    disabled={isSending || activeChat.status === 'archived'}
                    className="flex-1 bg-transparent text-xs text-app-text-primary placeholder:text-app-text-muted resize-none focus:outline-none p-1 max-h-32"
                  />
                  <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    disabled={!messageInput.trim() || isSending || activeChat.status === 'archived'}
                    loading={isSending}
                    icon={<Icon name="send" size={14} />}
                    className="shrink-0 rounded-lg px-3 py-1.5"
                  >
                    Send
                  </Button>
                </div>

                <div className="flex items-center justify-between text-[11px] text-app-text-muted px-1">
                  <span>
                    {activeChat.status === 'archived'
                      ? 'This conversation is archived. Unarchive to continue.'
                      : 'Socratic dialogue active • Press Enter to send'}
                  </span>
                  <span>{messageInput.length} / 20,000</span>
                </div>
              </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
            <EmptyState
              icon={<Icon name="chat" size={28} />}
              title="Select or start a conversation"
              description="Choose an existing learning session from the sidebar or create a new dialogue."
              actionLabel="New Conversation"
              onAction={() => setIsNewChatOpen(true)}
            />
          </div>
        )}
      </div>

      {/* ======================================================== */}
      {/* MODAL: Add Message Annotation (Comment or Tag)           */}
      {/* ======================================================== */}
      <Dialog
        isOpen={!!annotatingMessage}
        onClose={() => setAnnotatingMessage(null)}
        title="Add Auxiliary Annotation"
        description="Preserve useful auxiliary thoughts without converting them to canonical knowledge."
      >
        <form onSubmit={handleSaveAnnotation} className="space-y-4 pt-2">
          {annotationError && (
            <div className="p-2.5 text-xs rounded bg-status-danger/10 border border-status-danger/20 text-status-danger font-medium">
              {annotationError}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-app-text-primary mb-1.5">
              Annotation Type
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setAnnotationType('comment')}
                className={`py-1.5 px-3 rounded text-xs font-medium border text-center transition-colors ${
                  annotationType === 'comment'
                    ? 'bg-brand-500/15 border-brand-500 text-brand-700 dark:text-brand-300'
                    : 'border-app-border text-app-text-secondary hover:bg-app-surface-muted'
                }`}
              >
                💬 Comment
              </button>
              <button
                type="button"
                onClick={() => setAnnotationType('tag')}
                className={`py-1.5 px-3 rounded text-xs font-medium border text-center transition-colors ${
                  annotationType === 'tag'
                    ? 'bg-brand-500/15 border-brand-500 text-brand-700 dark:text-brand-300'
                    : 'border-app-border text-app-text-secondary hover:bg-app-surface-muted'
                }`}
              >
                🏷️ Tag
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-app-text-primary mb-1">
              {annotationType === 'tag' ? 'Tag Label' : 'Comment Content'}
            </label>
            <Input
              placeholder={annotationType === 'tag' ? 'e.g. system-design, tricky-concept' : 'Add your thoughts or notes on this response...'}
              value={annotationContent}
              onChange={(e) => setAnnotationContent(e.target.value)}
              required
              autoFocus
              maxLength={1000}
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-app-border">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setAnnotatingMessage(null)}
              disabled={isSubmittingAnnotation}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              loading={isSubmittingAnnotation}
            >
              Save Annotation
            </Button>
          </div>
        </form>
      </Dialog>

      {/* ======================================================== */}
      {/* MODAL: New Conversation Creation Dialog                  */}
      {/* ======================================================== */}
      <Dialog
        isOpen={isNewChatOpen}
        onClose={() => setIsNewChatOpen(false)}
        title="Start New Socratic Conversation"
        description="Initiate a targeted learning session linked to a subject or topic."
      >
        <form onSubmit={handleCreateChat} className="space-y-4 pt-2">
          {formError && (
            <div className="p-2.5 text-xs rounded bg-app-danger/10 border border-app-danger/20 text-app-danger font-medium">
              {formError}
            </div>
          )}

          {/* Subject Selector */}
          <div>
            <label htmlFor="chat-subject-select" className="block text-xs font-semibold text-app-text-primary mb-1">
              Subject Scope (Optional)
            </label>
            {isLoadingSubjects ? (
              <Skeleton className="h-9 w-full rounded-lg" />
            ) : (
              <select
                id="chat-subject-select"
                value={selectedSubjectId}
                onChange={(e) => handleSubjectChangeInModal(e.target.value)}
                className="w-full text-xs p-2 rounded-lg bg-app-bg-secondary border border-app-border text-app-text-primary focus:outline-none focus:border-app-accent"
              >
                <option value="">-- General / No Subject Link --</option>
                {availableSubjects.map((s) => (
                  <option key={s.id || s._id} value={s.id || s._id}>
                    {s.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Topic Selector */}
          {selectedSubjectId && (
            <div>
              <label htmlFor="chat-topic-select" className="block text-xs font-semibold text-app-text-primary mb-1">
                Target Topic (Optional)
              </label>
              <select
                id="chat-topic-select"
                value={selectedTopicId}
                onChange={(e) => setSelectedTopicId(e.target.value)}
                className="w-full text-xs p-2 rounded-lg bg-app-bg-secondary border border-app-border text-app-text-primary focus:outline-none focus:border-app-accent"
              >
                <option value="">-- Whole Subject Scope --</option>
                {availableTopics.map((t) => (
                  <option key={t.id || t._id} value={t.id || t._id}>
                    {t.title}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Custom Title */}
          <div>
            <label htmlFor="chat-title-input" className="block text-xs font-semibold text-app-text-primary mb-1">
              Session Title (Optional)
            </label>
            <Input
              id="chat-title-input"
              placeholder="e.g. Asymptotic Complexity Deep-Dive"
              value={newChatTitle}
              onChange={(e) => setNewChatTitle(e.target.value)}
              maxLength={200}
            />
          </div>

          {/* Initial Message */}
          <div>
            <label htmlFor="chat-initial-prompt" className="block text-xs font-semibold text-app-text-primary mb-1">
              Initial Question or Concept (Optional)
            </label>
            <textarea
              id="chat-initial-prompt"
              rows={3}
              placeholder="What core concept or problem would you like to explore?"
              value={initialPrompt}
              onChange={(e) => setInitialPrompt(e.target.value)}
              className="w-full text-xs p-2 rounded-lg bg-app-bg-secondary border border-app-border text-app-text-primary focus:outline-none focus:border-app-accent resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setIsNewChatOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              loading={isCreatingChat}
              icon={<Icon name="sparkles" size={14} />}
            >
              Start Session
            </Button>
          </div>
        </form>
      </Dialog>

      {/* ======================================================== */}
      {/* MODAL: Delete Conversation Confirmation Dialog           */}
      {/* ======================================================== */}
      <Dialog
        isOpen={isDeleteChatOpen}
        onClose={() => {
          setIsDeleteChatOpen(false);
          setChatToDelete(null);
        }}
        title="Delete Conversation"
        description="Are you sure you want to delete this conversation? All messages will be permanently removed."
      >
        <div className="pt-2 flex items-center justify-end gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setIsDeleteChatOpen(false);
              setChatToDelete(null);
            }}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={handleDeleteChat}
            icon={<Icon name="trash" size={14} />}
          >
            Delete Conversation
          </Button>
        </div>
      </Dialog>
    </div>
  );
}

export default ChatsPage;
