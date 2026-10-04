import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import { NotesPage } from './NotesPage';
import { ThemeProvider } from '../context/ThemeContext';
import { notesApi } from '../api/notesApi';

describe('Structured Notes Engine Frontend Workflows (Phase 07)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const renderWithProviders = (ui, initialRoute = '/notes') => {
    return render(
      <MemoryRouter initialEntries={[initialRoute]}>
        <ThemeProvider>{ui}</ThemeProvider>
      </MemoryRouter>
    );
  };

  it('renders empty state when no notes exist in workspace', async () => {
    vi.spyOn(notesApi, 'list').mockResolvedValue([]);

    renderWithProviders(<NotesPage />);

    await waitFor(() => {
      expect(screen.getByText('No Note Selected')).toBeDefined();
    });
  });

  it('renders notes list and displays selected note with structured blocks and version indicator', async () => {
    const mockNote = {
      _id: 'note_123',
      title: 'LSM Trees & Storage Engines',
      currentVersionNumber: 2,
      updatedAt: new Date().toISOString(),
      metadata: { blockCount: 3, conceptAttributionCount: 2 },
      currentVersionId: {
        _id: 'ver_2',
        version: 2,
        blocks: [
          {
            id: 'b1',
            type: 'heading',
            content: { level: 1, text: 'LSM Architecture' },
            origin: 'ai',
          },
          {
            id: 'b2',
            type: 'paragraph',
            content: { text: 'Log-Structured Merge-Trees optimize write throughput.' },
            origin: 'user',
          },
          {
            id: 'b3',
            type: 'callout',
            content: { variant: 'info', title: 'Deep Dive', text: 'SSTables are immutable on disk.' },
            origin: 'ai',
          },
        ],
      },
    };

    vi.spyOn(notesApi, 'list').mockResolvedValue([mockNote]);
    vi.spyOn(notesApi, 'getProposals').mockResolvedValue([]);

    renderWithProviders(<NotesPage />);

    await waitFor(() => {
      expect(screen.getByText('LSM Architecture')).toBeDefined();
      expect(screen.getByText('Log-Structured Merge-Trees optimize write throughput.')).toBeDefined();
      expect(screen.getByText('SSTables are immutable on disk.')).toBeDefined();
      expect(screen.getByText('Version v2')).toBeDefined();
    });
  });

  it('opens BlockEditor when Edit Note is clicked', async () => {
    const mockNote = {
      _id: 'note_123',
      title: 'LSM Trees & Storage Engines',
      currentVersionNumber: 1,
      updatedAt: new Date().toISOString(),
      metadata: { blockCount: 1 },
      currentVersionId: {
        _id: 'ver_1',
        version: 1,
        blocks: [
          {
            id: 'b1',
            type: 'paragraph',
            content: { text: 'Base paragraph content.' },
            origin: 'user',
          },
        ],
      },
    };

    vi.spyOn(notesApi, 'list').mockResolvedValue([mockNote]);
    vi.spyOn(notesApi, 'getProposals').mockResolvedValue([]);

    renderWithProviders(<NotesPage />);

    await waitFor(() => {
      expect(screen.getByText('Edit Note')).toBeDefined();
    });

    fireEvent.click(screen.getByText('Edit Note'));

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Change summary/i)).toBeDefined();
      expect(screen.getByText(/Save as Version v2/i)).toBeDefined();
    });
  });

  it('opens VersionHistoryDrawer when Version History button is clicked', async () => {
    const mockNote = {
      _id: 'note_123',
      title: 'LSM Trees & Storage Engines',
      currentVersionNumber: 2,
      updatedAt: new Date().toISOString(),
      metadata: { blockCount: 1 },
      currentVersionId: {
        _id: 'ver_2',
        version: 2,
        blocks: [{ id: 'b1', type: 'paragraph', content: { text: 'Current v2 text' } }],
      },
    };

    const mockVersions = [
      {
        _id: 'ver_2',
        version: 2,
        sourceType: 'manual_edit',
        changeSummary: 'Added details',
        createdAt: new Date().toISOString(),
        blocks: [{ id: 'b1', type: 'paragraph', content: { text: 'Current v2 text' } }],
      },
      {
        _id: 'ver_1',
        version: 1,
        sourceType: 'initial_creation',
        changeSummary: 'Initial creation',
        createdAt: new Date().toISOString(),
        blocks: [{ id: 'b0', type: 'paragraph', content: { text: 'Old v1 text' } }],
      },
    ];

    vi.spyOn(notesApi, 'list').mockResolvedValue([mockNote]);
    vi.spyOn(notesApi, 'getProposals').mockResolvedValue([]);
    vi.spyOn(notesApi, 'getVersions').mockResolvedValue(mockVersions);

    renderWithProviders(<NotesPage />);

    await waitFor(() => {
      expect(screen.getByText(/Version History \(v2\)/i)).toBeDefined();
    });

    fireEvent.click(screen.getByText(/Version History \(v2\)/i));

    await waitFor(() => {
      expect(screen.getByText('Append-only immutable record of all revisions.')).toBeDefined();
      expect(screen.getByText('Initial creation')).toBeDefined();
    });
  });

  it('displays pending AI proposal banner and opens ProposalReviewModal', async () => {
    const mockNote = {
      _id: 'note_123',
      title: 'LSM Trees & Storage Engines',
      currentVersionNumber: 1,
      updatedAt: new Date().toISOString(),
      metadata: { blockCount: 1 },
      currentVersionId: {
        _id: 'ver_1',
        version: 1,
        blocks: [{ id: 'b1', type: 'paragraph', content: { text: 'Base note' } }],
      },
    };

    const mockProposal = {
      _id: 'prop_1',
      noteDocumentId: 'note_123',
      status: 'pending',
      changeSummary: 'Synthesized from canonical MemTable & SSTable concepts',
      riskAssessment: {
        riskLevel: 'MEDIUM',
        reasons: ['Modifies existing AI explanations'],
        requiresApproval: true,
      },
      diff: {
        added: ['b2'],
        modified: ['b1'],
        deleted: [],
      },
      proposedBlocks: [
        {
          id: 'b1',
          type: 'heading',
          content: { level: 1, text: 'Updated LSM Structure' },
          origin: 'ai',
        },
      ],
    };

    vi.spyOn(notesApi, 'list').mockResolvedValue([mockNote]);
    vi.spyOn(notesApi, 'getProposals').mockResolvedValue([mockProposal]);

    renderWithProviders(<NotesPage />);

    await waitFor(() => {
      expect(screen.getByText('AI Note Update Proposal Pending Review')).toBeDefined();
      expect(screen.getByText('Review Proposal')).toBeDefined();
    });

    fireEvent.click(screen.getByText('Review Proposal'));

    await waitFor(() => {
      expect(screen.getByText('AI Note Synthesis Proposal')).toBeDefined();
      expect(screen.getByText(/MEDIUM RISK/i)).toBeDefined();
      expect(screen.getByText('Approve & Create New Version')).toBeDefined();
    });
  });

  it('aligns BlockEditor schema contracts: restricts heading levels to H1, H2, H3 and code to language + code', async () => {
    const mockNote = {
      _id: 'note_schema_test',
      title: 'Schema Test Note',
      currentVersionNumber: 1,
      updatedAt: new Date().toISOString(),
      metadata: { blockCount: 1 },
      currentVersionId: {
        _id: 'ver_1',
        version: 1,
        blocks: [
          {
            id: 'b_h',
            type: 'heading',
            content: { level: 2, text: 'Heading Level 2' },
            origin: 'user',
          },
          {
            id: 'b_c',
            type: 'code',
            content: { language: 'javascript', code: 'const x = 42;' },
            origin: 'user',
          },
        ],
      },
    };

    vi.spyOn(notesApi, 'list').mockResolvedValue([mockNote]);
    vi.spyOn(notesApi, 'getProposals').mockResolvedValue([]);

    renderWithProviders(<NotesPage />);

    await waitFor(() => {
      expect(screen.getByText('Edit Note')).toBeDefined();
    });

    fireEvent.click(screen.getByText('Edit Note'));

    await waitFor(() => {
      // Find heading select element
      const selects = screen.getAllByRole('combobox');
      const headingSelect = selects.find((sel) => Array.from(sel.options).some((opt) => opt.text === 'H1'));
      expect(headingSelect).toBeDefined();

      const optionValues = Array.from(headingSelect.options).map((opt) => opt.value);
      // Backend canonical heading levels: strictly 1, 2, 3 (no 4)
      expect(optionValues).toEqual(['1', '2', '3']);

      // Check code block inputs (language and code textarea exist, no caption input)
      expect(screen.getByDisplayValue('javascript')).toBeDefined();
      expect(screen.getByDisplayValue('const x = 42;')).toBeDefined();
      expect(screen.queryByPlaceholderText(/caption/i)).toBeNull();
    });
  });
});
