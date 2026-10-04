import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button, Badge, Icon, EmptyState, LoadingState, ErrorState } from '../components/ui';
import { notesApi } from '../api/notesApi';
import { subjectsApi, topicsApi } from '../api/subjectsApi';
import BlockRenderer from '../components/notes/BlockRenderer';
import BlockEditor from '../components/notes/BlockEditor';
import VersionHistoryDrawer from '../components/notes/VersionHistoryDrawer';
import ProposalReviewModal from '../components/notes/ProposalReviewModal';

/**
 * NotesPage Component (Phase 07)
 * Authoritative study notes workspace with canonical concept attribution, immutable version history,
 * optimistic concurrency revisions, and risk-managed AI synthesis proposals.
 */
export function NotesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedTopicId = searchParams.get('topicId');
  const selectedSubjectId = searchParams.get('subjectId');

  const [notesList, setNotesList] = useState([]);
  const [selectedNote, setSelectedNote] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Active sub-views & modals
  const [isEditing, setIsEditing] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [synthesizing, setSynthesizing] = useState(false);
  const [activeProposal, setActiveProposal] = useState(null);
  const [proposals, setProposals] = useState([]);

  // Load initial notes list
  useEffect(() => {
    loadNotes();
  }, [selectedSubjectId]);

  // Load topic-anchored note if topicId is in query params
  useEffect(() => {
    if (selectedTopicId) {
      loadTopicNote(selectedTopicId);
    }
  }, [selectedTopicId]);

  const loadNotes = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await notesApi.list({ subjectId: selectedSubjectId });
      const list = Array.isArray(res) ? res : (res?.data || res?.notes || []);
      setNotesList(list);
      if (list.length > 0 && !selectedTopicId && !selectedNote) {
        setSelectedNote(list[0]);
        loadProposals(list[0]._id);
      }
    } catch (err) {
      setError(err.message || 'Failed to load notes');
    } finally {
      setLoading(false);
    }
  };

  const loadTopicNote = async (topicId) => {
    try {
      setLoading(true);
      setError(null);
      const res = await notesApi.getTopicNote(topicId);
      const note = res?.data || res;
      if (note && note._id) {
        setSelectedNote(note);
        loadProposals(note._id);
      }
    } catch (err) {
      if (err?.response?.status === 404 || err?.status === 404 || err?.code === 'NOTE_NOT_FOUND') {
        setSelectedNote(null);
      } else {
        setError(err.message || 'Failed to load topic note');
      }
    } finally {
      setLoading(false);
    }
  };

  const loadProposals = async (noteId) => {
    if (!noteId) return;
    try {
      const res = await notesApi.getProposals(noteId, { status: 'pending' });
      const propList = Array.isArray(res) ? res : (res?.data || res?.proposals || []);
      setProposals(propList);
    } catch (_) {}
  };

  const handleSelectNote = (note) => {
    setSelectedNote(note);
    setIsEditing(false);
    if (note?._id) {
      loadProposals(note._id);
    }
  };

  const handleSaveRevision = async ({ title, blocks, changeSummary, baseVersion }) => {
    if (!selectedNote) return;
    try {
      setSavingEdit(true);
      setError(null);
      const res = await notesApi.update(selectedNote._id, {
        baseVersion,
        title,
        blocks,
        changeSummary,
      });

      if (res?.data) {
        setSelectedNote(res.data);
        setIsEditing(false);
        loadNotes();
      }
    } catch (err) {
      if (
        err?.code === 'STALE_BASE_VERSION' ||
        err?.response?.data?.error?.code === 'STALE_BASE_VERSION'
      ) {
        alert(
          'Version Conflict: Another revision was saved since you opened this editor. Please reload and re-apply your changes.'
        );
      } else {
        alert(err.message || 'Failed to save note revision.');
      }
    } finally {
      setSavingEdit(false);
    }
  };

  const handleTriggerSynthesis = async () => {
    const topicId = selectedNote?.topicId || selectedTopicId;
    if (!topicId) {
      alert('Please select a topic to synthesize notes for.');
      return;
    }

    try {
      setSynthesizing(true);
      setError(null);
      const res = await notesApi.synthesizeProposal(topicId);
      if (res?.data) {
        setActiveProposal(res.data);
        if (selectedNote?._id) {
          loadProposals(selectedNote._id);
        }
      }
    } catch (err) {
      alert(err.message || 'Failed to synthesize note proposal.');
    } finally {
      setSynthesizing(false);
    }
  };

  const handleProposalApproved = (data) => {
    if (data?.note) {
      setSelectedNote(data.note);
      loadNotes();
    }
    setActiveProposal(null);
    if (selectedNote?._id) {
      loadProposals(selectedNote._id);
    }
  };

  const handleProposalRejected = () => {
    setActiveProposal(null);
    if (selectedNote?._id) {
      loadProposals(selectedNote._id);
    }
  };

  const handleRestoreSuccess = (restoredNote) => {
    setSelectedNote(restoredNote);
    loadNotes();
  };

  if (loading && notesList.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-12">
        <LoadingState label="Loading study notes..." />
      </div>
    );
  }

  const currentVersion = selectedNote?.currentVersionId || {};
  const currentBlocks = currentVersion.blocks || [];

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Workspace Header */}
      <div className="px-6 py-4 border-b border-app-border bg-app-surface flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-brand-500/10 flex items-center justify-center text-brand-500">
            <Icon name="notes" size={18} />
          </div>
          <div>
            <h1 className="text-base font-bold text-app-text-primary tracking-tight">
              Study Notes Engine
            </h1>
            <p className="text-xs text-app-text-secondary">
              Canonical concept synthesis, structured block hierarchy & immutable revision history.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {selectedNote && !isEditing && (
            <>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowHistory(true)}
                icon={<Icon name="history" size={14} />}
              >
                Version History (v{selectedNote.currentVersionNumber})
              </Button>

              <Button
                variant="secondary"
                size="sm"
                onClick={handleTriggerSynthesis}
                disabled={synthesizing}
                icon={<Icon name="sparkles" size={14} className="text-brand-500" />}
              >
                {synthesizing ? 'Synthesizing...' : 'Synthesize with AI'}
              </Button>

              <Button
                variant="primary"
                size="sm"
                onClick={() => setIsEditing(true)}
                icon={<Icon name="edit" size={14} />}
              >
                Edit Note
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Main Workspace Body */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar: Notes Directory */}
        <div className="w-72 border-r border-app-border bg-app-surface flex flex-col">
          <div className="p-3 border-b border-app-border text-xs font-semibold text-app-text-primary flex items-center justify-between">
            <span>Documents ({notesList.length})</span>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-app-border">
            {notesList.length === 0 ? (
              <div className="p-6 text-center text-xs text-app-text-muted">
                No study notes created yet.
              </div>
            ) : (
              notesList.map((note) => {
                const isSelected = selectedNote?._id === note._id;
                return (
                  <button
                    key={note._id}
                    onClick={() => handleSelectNote(note)}
                    className={`w-full text-left p-3.5 transition-colors flex flex-col gap-1 ${
                      isSelected
                        ? 'bg-brand-500/10 border-l-2 border-brand-500'
                        : 'hover:bg-app-surface-muted/40'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-xs text-app-text-primary line-clamp-1">
                        {note.title}
                      </span>
                      <Badge variant="neutral" size="sm">
                        v{note.currentVersionNumber}
                      </Badge>
                    </div>
                    <div className="text-[11px] text-app-text-muted flex items-center justify-between mt-1">
                      <span>{note.metadata?.blockCount || 0} blocks</span>
                      <span>{new Date(note.updatedAt).toLocaleDateString()}</span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Center Canvas: Note Viewer / Editor */}
        <div className="flex-1 flex flex-col overflow-y-auto bg-app-surface-muted/20 p-6">
          {/* Pending AI Proposal Notification Banner */}
          {proposals.length > 0 && !isEditing && (
            <div className="mb-6 p-4 rounded-xl border border-brand-500/30 bg-brand-500/10 flex items-center justify-between animate-fadeIn">
              <div className="flex items-center gap-3">
                <Icon name="sparkles" size={20} className="text-brand-500 shrink-0" />
                <div>
                  <div className="text-xs font-bold text-app-text-primary">
                    AI Note Update Proposal Pending Review
                  </div>
                  <div className="text-[11px] text-app-text-secondary mt-0.5">
                    {proposals[0].changeSummary || 'Synthesized from validated learning events and canonical concepts.'}
                  </div>
                </div>
              </div>
              <Button
                variant="primary"
                size="sm"
                onClick={() => setActiveProposal(proposals[0])}
                icon={<Icon name="check" size={13} />}
              >
                Review Proposal
              </Button>
            </div>
          )}

          {isEditing ? (
            <BlockEditor
              initialTitle={selectedNote?.title}
              initialBlocks={currentBlocks}
              baseVersion={selectedNote?.currentVersionNumber || 1}
              onSave={handleSaveRevision}
              onCancel={() => setIsEditing(false)}
              saving={savingEdit}
            />
          ) : selectedNote ? (
            <div className="max-w-4xl mx-auto w-full bg-app-surface rounded-2xl border border-app-border shadow-sm p-8 space-y-6">
              {/* Note Header Metadata */}
              <div className="border-b border-app-border pb-5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-brand-600 dark:text-brand-400 uppercase tracking-wider">
                    Canonical Study Guide
                  </span>
                  <div className="flex items-center gap-2">
                    <Badge variant="neutral" size="sm">
                      Version v{selectedNote.currentVersionNumber}
                    </Badge>
                    <Badge variant="brand" size="sm">
                      {currentBlocks.length} Blocks
                    </Badge>
                  </div>
                </div>
                <h1 className="text-2xl font-extrabold text-app-text-primary tracking-tight">
                  {selectedNote.title}
                </h1>
                <div className="text-xs text-app-text-muted mt-2 flex items-center gap-4">
                  <span>
                    Last updated: {new Date(selectedNote.updatedAt).toLocaleString()}
                  </span>
                  <span>·</span>
                  <span>{selectedNote.metadata?.conceptAttributionCount || 0} Canonical Concepts Referenced</span>
                </div>
              </div>

              {/* Render Structured Blocks */}
              <div className="space-y-4">
                {currentBlocks.length === 0 ? (
                  <EmptyState
                    title="Empty Note Document"
                    description="This note has no blocks yet. Click 'Edit Note' to add sections."
                    actionLabel="Add Blocks"
                    onAction={() => setIsEditing(true)}
                  />
                ) : (
                  currentBlocks.map((block) => (
                    <BlockRenderer
                      key={block.id}
                      block={block}
                      showProvenance={true}
                    />
                  ))
                )}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <EmptyState
                icon={<Icon name="notes" size={28} />}
                title="No Note Selected"
                description="Select an existing note from the sidebar or synthesize a note for any topic."
                actionLabel={synthesizing ? 'Synthesizing...' : 'Synthesize Topic Note'}
                onAction={handleTriggerSynthesis}
              />
            </div>
          )}
        </div>
      </div>

      {/* Version History Drawer */}
      {showHistory && selectedNote && (
        <VersionHistoryDrawer
          noteId={selectedNote._id}
          currentVersionNumber={selectedNote.currentVersionNumber}
          onClose={() => setShowHistory(false)}
          onRestoreSuccess={handleRestoreSuccess}
        />
      )}

      {/* Proposal Review Modal */}
      {activeProposal && (
        <ProposalReviewModal
          proposal={activeProposal}
          currentNote={selectedNote}
          onClose={() => setActiveProposal(null)}
          onApproved={handleProposalApproved}
          onRejected={handleProposalRejected}
        />
      )}
    </div>
  );
}

export default NotesPage;
