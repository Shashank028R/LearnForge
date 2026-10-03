import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import React from 'react';
import { SubjectsPage } from './SubjectsPage';
import { SubjectDetailPage } from './SubjectDetailPage';
import { AuthProvider } from '../context/AuthContext';
import { ThemeProvider } from '../context/ThemeContext';

describe('Subjects and Topics Frontend Workflows (Phase 03)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const renderWithProviders = (ui, initialRoute = '/subjects') => {
    return render(
      <MemoryRouter initialEntries={[initialRoute]}>
        <ThemeProvider>
          {ui}
        </ThemeProvider>
      </MemoryRouter>
    );
  };

  it('renders loading skeleton and then subjects list from API', async () => {
    const mockSubjects = [
      {
        _id: 'sub_1',
        name: 'Quantum Mechanics',
        description: 'Wavefunctions, Hilbert spaces, and spin operators',
        color: '#3b82f6',
        targetMasteryLevel: 'advanced',
        status: 'active',
        topicsCount: 3,
      },
      {
        _id: 'sub_2',
        name: 'Compiler Architecture',
        description: 'ASTs, LLVM IR, and register allocation',
        color: '#10b981',
        targetMasteryLevel: 'comprehensive',
        status: 'active',
        topicsCount: 5,
      },
    ];

    global.fetch = vi.fn().mockImplementation((url, opts) => {
      if (url.includes('/api/v1/subjects') && (!opts || opts.method === 'GET')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: () => Promise.resolve({ success: true, data: { subjects: mockSubjects } }),
        });
      }
      return Promise.reject(new Error(`Unhandled fetch: ${url}`));
    });

    renderWithProviders(<SubjectsPage />);

    // Initially loading skeleton is shown
    expect(screen.getByTestId('subjects-loading')).toBeDefined();

    // Resolves and displays subjects
    expect(await screen.findByText('Quantum Mechanics')).toBeDefined();
    expect(screen.getByText('Compiler Architecture')).toBeDefined();
    expect(screen.getByText('3 topics')).toBeDefined();
    expect(screen.getByText('5 topics')).toBeDefined();
  });

  it('renders empty state when no subjects exist and allows opening create modal', async () => {
    global.fetch = vi.fn().mockImplementation((url, opts) => {
      if (url.includes('/api/v1/subjects') && (!opts || opts.method === 'GET')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: () => Promise.resolve({ success: true, data: { subjects: [] } }),
        });
      }
      return Promise.reject(new Error(`Unhandled fetch: ${url}`));
    });

    renderWithProviders(<SubjectsPage />);

    expect(await screen.findByText('No subjects yet.')).toBeDefined();
    expect(screen.getByText(/Create your first subject to organize study material/i)).toBeDefined();

    // Click "Create Subject" in empty state
    const createBtn = screen.getByRole('button', { name: /^create subject$/i });
    fireEvent.click(createBtn);

    // Dialog opens
    expect(await screen.findByRole('dialog')).toBeDefined();
    expect(screen.getByRole('heading', { name: 'Create Subject' })).toBeDefined();
  });

  it('creates a new subject via accessible dialog form and updates list', async () => {
    let subjects = [];

    global.fetch = vi.fn().mockImplementation((url, opts) => {
      if (url.includes('/api/v1/subjects')) {
        if (!opts || opts.method === 'GET') {
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: () => Promise.resolve({ success: true, data: { subjects } }),
          });
        }
        if (opts.method === 'POST') {
          const body = JSON.parse(opts.body);
          const newSubj = {
            _id: 'sub_new_1',
            name: body.name,
            description: body.description || '',
            color: body.color || '#3b82f6',
            targetMasteryLevel: body.targetMasteryLevel || 'intermediate',
            status: 'active',
            topicsCount: 0,
          };
          subjects = [newSubj, ...subjects];
          return Promise.resolve({
            ok: true,
            status: 201,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: () => Promise.resolve({ success: true, data: { subject: newSubj } }),
          });
        }
      }
      return Promise.reject(new Error(`Unhandled fetch: ${url}`));
    });

    renderWithProviders(<SubjectsPage />);

    expect(await screen.findByText('No subjects yet.')).toBeDefined();

    // Open create dialog
    fireEvent.click(screen.getByRole('button', { name: /new subject/i }));

    const nameInput = screen.getByLabelText(/subject name/i);
    const descInput = screen.getByLabelText(/description/i);

    fireEvent.change(nameInput, { target: { value: 'Distributed Systems' } });
    fireEvent.change(descInput, { target: { value: 'Consensus protocols, Paxos, and replication.' } });

    // Submit form within dialog
    const dialog = screen.getByRole('dialog');
    const submitBtn = within(dialog).getByRole('button', { name: /^create subject$/i });
    fireEvent.click(submitBtn);

    // Newly created subject card is rendered
    expect(await screen.findByText('Distributed Systems')).toBeDefined();
    expect(screen.getByText('Consensus protocols, Paxos, and replication.')).toBeDefined();
    expect(screen.getByText('0 topics')).toBeDefined();
  });

  it('deletes an owned subject after confirmation dialog', async () => {
    let subjects = [
      {
        _id: 'sub_del',
        name: 'Organic Chemistry',
        description: 'Reaction mechanisms and synthesis pathways',
        color: '#f43f5e',
        targetMasteryLevel: 'intermediate',
        status: 'active',
        topicsCount: 2,
      },
    ];

    global.fetch = vi.fn().mockImplementation((url, opts) => {
      if (url.includes('/api/v1/subjects/sub_del') && opts?.method === 'DELETE') {
        subjects = [];
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: () => Promise.resolve({ success: true, data: { deleted: true } }),
        });
      }
      if (url.includes('/api/v1/subjects') && (!opts || opts.method === 'GET')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: () => Promise.resolve({ success: true, data: { subjects } }),
        });
      }
      return Promise.reject(new Error(`Unhandled: ${url}`));
    });

    renderWithProviders(<SubjectsPage />);

    expect(await screen.findByText('Organic Chemistry')).toBeDefined();

    // Click delete icon button
    const deleteBtn = screen.getByLabelText('Delete Organic Chemistry');
    fireEvent.click(deleteBtn);

    // Confirmation dialog opens
    expect(await screen.findByRole('dialog')).toBeDefined();
    expect(screen.getByText(/will permanently remove this subject/i)).toBeDefined();

    // Confirm deletion
    const confirmDeleteBtn = screen.getByRole('button', { name: /^delete subject$/i });
    fireEvent.click(confirmDeleteBtn);

    // Subject is removed from list, empty state shown
    expect(await screen.findByText('No subjects yet.')).toBeDefined();
    expect(screen.queryByText('Organic Chemistry')).toBeNull();
  });

  it('renders SubjectDetailPage with topics and manages topic creation', async () => {
    const mockSubject = {
      _id: 'sub_42',
      name: 'Linear Algebra',
      description: 'Vector spaces, linear transformations, matrices',
      color: '#3b82f6',
      targetMasteryLevel: 'intermediate',
      status: 'active',
      topicsCount: 1,
    };

    let topics = [
      {
        _id: 'top_1',
        subjectId: 'sub_42',
        title: 'Matrix Factorization',
        description: 'LU decomposition and QR factorization',
        orderIndex: 0,
        status: 'in_progress',
        knowledgeState: {
          masteryScore: 40,
          keyConcepts: ['LU Decomposition', 'Permutation Matrices'],
        },
      },
    ];

    global.fetch = vi.fn().mockImplementation((url, opts) => {
      if (url.includes('/api/v1/subjects/sub_42')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: () => Promise.resolve({ success: true, data: { subject: mockSubject } }),
        });
      }
      if (url.includes('/api/v1/topics?subjectId=sub_42') && (!opts || opts.method === 'GET')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: () => Promise.resolve({ success: true, data: { topics } }),
        });
      }
      if (url.includes('/api/v1/topics') && opts?.method === 'POST') {
        const body = JSON.parse(opts.body);
        const newTopic = {
          _id: 'top_new_2',
          subjectId: 'sub_42',
          title: body.title,
          description: body.description || '',
          orderIndex: 1,
          status: body.status || 'not_started',
          knowledgeState: { masteryScore: 0, keyConcepts: [] },
        };
        topics = [...topics, newTopic];
        return Promise.resolve({
          ok: true,
          status: 201,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: () => Promise.resolve({ success: true, data: { topic: newTopic } }),
        });
      }
      return Promise.reject(new Error(`Unhandled: ${url}`));
    });

    render(
      <MemoryRouter initialEntries={['/subjects/sub_42']}>
        <ThemeProvider>
          <Routes>
            <Route path="/subjects/:subjectId" element={<SubjectDetailPage />} />
          </Routes>
        </ThemeProvider>
      </MemoryRouter>
    );

    // Subject header loads
    expect(await screen.findByRole('heading', { name: 'Linear Algebra' })).toBeDefined();
    expect(screen.getByText('Matrix Factorization')).toBeDefined();
    expect(screen.getByText('LU Decomposition')).toBeDefined();

    // Open Create Topic Modal
    const newTopicBtn = screen.getByRole('button', { name: /new topic/i });
    fireEvent.click(newTopicBtn);

    expect(await screen.findByRole('dialog')).toBeDefined();
    expect(screen.getByRole('heading', { name: 'New Topic' })).toBeDefined();

    // Fill form
    const topicTitleInput = screen.getByLabelText(/topic title/i);
    fireEvent.change(topicTitleInput, { target: { value: 'Spectral Theorem' } });

    // Submit
    const createTopicSubmitBtn = screen.getByRole('button', { name: /^create topic$/i });
    fireEvent.click(createTopicSubmitBtn);

    // New topic appears
    expect(await screen.findByText('Spectral Theorem')).toBeDefined();
  });

  it('renders Comprehensive target mastery option and submits it correctly during subject creation', async () => {
    let capturedBody = null;

    global.fetch = vi.fn().mockImplementation((url, opts) => {
      if (url.includes('/api/v1/subjects')) {
        if (!opts || opts.method === 'GET') {
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: () => Promise.resolve({ success: true, data: { subjects: [] } }),
          });
        }
        if (opts.method === 'POST') {
          capturedBody = JSON.parse(opts.body);
          const newSubj = {
            _id: 'sub_comp_1',
            name: capturedBody.name,
            description: capturedBody.description || '',
            color: capturedBody.color || '#3b82f6',
            targetMasteryLevel: capturedBody.targetMasteryLevel,
            status: 'active',
            topicsCount: 0,
          };
          return Promise.resolve({
            ok: true,
            status: 201,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: () => Promise.resolve({ success: true, data: { subject: newSubj } }),
          });
        }
      }
      return Promise.reject(new Error(`Unhandled: ${url}`));
    });

    renderWithProviders(<SubjectsPage />);

    expect(await screen.findByText('No subjects yet.')).toBeDefined();

    // Open create dialog
    fireEvent.click(screen.getByRole('button', { name: /new subject/i }));

    const dialog = screen.getByRole('dialog');
    const nameInput = screen.getByLabelText(/subject name/i);
    const masterySelect = screen.getByLabelText(/target mastery level/i);

    // Verify all four options are present
    const options = Array.from(masterySelect.querySelectorAll('option')).map((opt) => opt.value);
    expect(options).toEqual(['beginner', 'intermediate', 'advanced', 'comprehensive']);

    // Select Comprehensive
    fireEvent.change(nameInput, { target: { value: 'Deep Learning Systems' } });
    fireEvent.change(masterySelect, { target: { value: 'comprehensive' } });
    expect(masterySelect.value).toBe('comprehensive');

    // Submit form
    const submitBtn = within(dialog).getByRole('button', { name: /^create subject$/i });
    fireEvent.click(submitBtn);

    expect(await screen.findByText('Deep Learning Systems')).toBeDefined();
    expect(capturedBody).not.toBeNull();
    expect(capturedBody.targetMasteryLevel).toBe('comprehensive');
  });
});

