import React, { useState } from 'react';
import { Button, Badge, Icon, Dialog } from '../ui';
import BlockRenderer from './BlockRenderer';
import { notesApi } from '../../api/notesApi';

/**
 * ProposalReviewModal Component (Phase 07)
 * Interactive review interface for AI NoteProposals featuring risk badges, reasons, block diff, and approval/rejection actions.
 */
export function ProposalReviewModal({
  proposal,
  currentNote,
  onClose,
  onApproved,
  onRejected,
}) {
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [error, setError] = useState(null);

  if (!proposal) return null;

  const riskAssessment = proposal.riskAssessment || {};
  const riskLevel = riskAssessment.riskLevel || 'LOW';
  const reasons = riskAssessment.reasons || [];
  const diff = proposal.diff || {};

  const handleApprove = async () => {
    try {
      setApproving(true);
      setError(null);
      const res = await notesApi.approveProposal(
        proposal._id,
        currentNote?.currentVersionNumber || 1
      );
      if (res?.data) {
        if (onApproved) onApproved(res.data);
        onClose();
      }
    } catch (err) {
      if (
        err?.code === 'STALE_PROPOSAL_BASE' ||
        err?.response?.data?.error?.code === 'STALE_PROPOSAL_BASE'
      ) {
        setError(
          'Stale proposal conflict: the note has been revised since this proposal was generated. Please regenerate.'
        );
      } else {
        setError(err.message || 'Failed to approve proposal.');
      }
    } finally {
      setApproving(false);
    }
  };

  const handleReject = async () => {
    try {
      setRejecting(true);
      setError(null);
      const res = await notesApi.rejectProposal(proposal._id, rejectReason);
      if (res?.data) {
        if (onRejected) onRejected(res.data);
        onClose();
      }
    } catch (err) {
      setError(err.message || 'Failed to reject proposal.');
    } finally {
      setRejecting(false);
    }
  };

  const getRiskBadge = (level) => {
    switch (level) {
      case 'HIGH':
        return (
          <Badge variant="danger" size="md">
            <Icon name="alert-triangle" size={12} className="mr-1" /> HIGH RISK — Explicit Review Required
          </Badge>
        );
      case 'MEDIUM':
        return (
          <Badge variant="warning" size="md">
            <Icon name="info" size={12} className="mr-1" /> MEDIUM RISK — Content Modifications
          </Badge>
        );
      case 'LOW':
        return (
          <Badge variant="success" size="md">
            <Icon name="check-circle" size={12} className="mr-1" /> LOW RISK — Pure Additions
          </Badge>
        );
      default:
        return <Badge variant="neutral" size="md">{level}</Badge>;
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-app-surface border border-app-border rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-fadeIn">
        {/* Header */}
        <div className="p-5 border-b border-app-border flex items-center justify-between bg-app-surface">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-brand-500/10 flex items-center justify-center text-brand-500">
              <Icon name="sparkles" size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-app-text-primary">
                AI Note Synthesis Proposal
              </h2>
              <p className="text-xs text-app-text-secondary mt-0.5">
                {proposal.changeSummary || 'Synthesized from canonical concepts & learning events'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {getRiskBadge(riskLevel)}
            <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close modal">
              <Icon name="x" size={16} />
            </Button>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="px-5 py-3 bg-status-danger/10 border-b border-status-danger/20 text-xs text-status-danger flex items-center gap-2">
            <Icon name="alert-triangle" size={14} />
            <span>{error}</span>
          </div>
        )}

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Risk Evaluation & Protections Box */}
          <div className="p-4 rounded-lg bg-app-surface-muted/40 border border-app-border space-y-2">
            <div className="text-xs font-semibold text-app-text-primary flex items-center gap-1.5">
              <Icon name="shield" size={14} className="text-brand-500" />
              Risk Analysis & Concurrency Guards
            </div>
            <ul className="text-xs text-app-text-secondary space-y-1 list-disc list-inside">
              {reasons.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
            {riskAssessment.hasUserAuthoredConflicts && (
              <div className="mt-2 text-xs text-status-danger font-medium flex items-center gap-1.5">
                <Icon name="alert-circle" size={13} />
                User-Authored Content Protection: this proposal targets user handwritten blocks. Approving will overwrite protected user blocks.
              </div>
            )}
          </div>

          {/* Diff Summary Stats */}
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
              <div className="text-lg font-bold text-status-success">{diff.added?.length || 0}</div>
              <div className="text-[11px] text-app-text-muted">Added Blocks</div>
            </div>
            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <div className="text-lg font-bold text-status-warning">{diff.modified?.length || 0}</div>
              <div className="text-[11px] text-app-text-muted">Modified Blocks</div>
            </div>
            <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20">
              <div className="text-lg font-bold text-status-danger">{diff.deleted?.length || 0}</div>
              <div className="text-[11px] text-app-text-muted">Deleted Blocks</div>
            </div>
          </div>

          {/* Proposed Content Preview */}
          <div className="space-y-3">
            <div className="text-xs font-semibold text-app-text-primary uppercase tracking-wider">
              Proposed Note Structure ({proposal.proposedBlocks?.length || 0} Blocks)
            </div>
            <div className="p-4 rounded-xl border border-app-border bg-app-surface space-y-4">
              {proposal.proposedBlocks?.map((block) => (
                <BlockRenderer key={block.id} block={block} showProvenance={true} />
              ))}
            </div>
          </div>

          {/* Optional Rejection Reason */}
          {showRejectInput && (
            <div className="p-4 rounded-lg border border-app-border bg-app-surface space-y-2">
              <label className="text-xs font-medium text-app-text-primary">
                Rejection Reason (Optional):
              </label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Describe why this proposal was rejected..."
                className="w-full text-xs p-2.5 rounded-lg border border-app-border bg-app-surface text-app-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500"
                rows={2}
              />
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-app-border bg-app-surface flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={approving || rejecting}>
            Cancel
          </Button>

          <div className="flex items-center gap-2">
            {!showRejectInput ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowRejectInput(true)}
                disabled={approving || rejecting}
              >
                Reject Proposal...
              </Button>
            ) : (
              <Button
                variant="danger"
                size="sm"
                onClick={handleReject}
                disabled={approving || rejecting}
              >
                {rejecting ? 'Rejecting...' : 'Confirm Rejection'}
              </Button>
            )}

            <Button
              variant="primary"
              size="sm"
              onClick={handleApprove}
              disabled={approving || rejecting}
              icon={<Icon name="check" size={14} />}
            >
              {approving ? 'Committing...' : 'Approve & Create New Version'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ProposalReviewModal;
