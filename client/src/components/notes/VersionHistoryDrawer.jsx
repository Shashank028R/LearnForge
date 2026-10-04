import React, { useEffect, useState } from 'react';
import { Button, Badge, Icon, LoadingState, EmptyState } from '../ui';
import { notesApi } from '../../api/notesApi';
import BlockRenderer from './BlockRenderer';

/**
 * VersionHistoryDrawer Component (Phase 07)
 * Displays immutable version history snapshots and enables deterministic version restoration.
 */
export function VersionHistoryDrawer({
  noteId,
  currentVersionNumber,
  onClose,
  onRestoreSuccess,
}) {
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedVersion, setSelectedVersion] = useState(null);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!noteId) return;
    loadVersions();
  }, [noteId]);

  const loadVersions = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await notesApi.getVersions(noteId);
      const list = Array.isArray(res) ? res : (res?.data || res?.versions || []);
      setVersions(list);
      if (list.length > 0) {
        setSelectedVersion(list[0]);
      }
    } catch (err) {
      setError(err.message || 'Failed to load version history');
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async (versionToRestore) => {
    if (!versionToRestore) return;
    const confirm = window.confirm(
      `Restore content from version v${versionToRestore.version}? This will create a brand-new version v${currentVersionNumber + 1} preserving all history.`
    );
    if (!confirm) return;

    try {
      setRestoring(true);
      setError(null);
      const res = await notesApi.restoreVersion(
        noteId,
        versionToRestore.version,
        currentVersionNumber
      );
      if (res?.data) {
        if (onRestoreSuccess) {
          onRestoreSuccess(res.data);
        }
        onClose();
      }
    } catch (err) {
      if (err?.code === 'STALE_BASE_VERSION' || err?.response?.data?.error?.code === 'STALE_BASE_VERSION') {
        setError('Version conflict: another revision was saved. Please refresh and retry.');
      } else {
        setError(err.message || 'Failed to restore version.');
      }
    } finally {
      setRestoring(false);
    }
  };

  const getSourceBadge = (sourceType) => {
    switch (sourceType) {
      case 'initial_creation':
        return <Badge variant="neutral" size="sm">Initial</Badge>;
      case 'manual_edit':
        return <Badge variant="brand" size="sm">Manual Edit</Badge>;
      case 'ai_synthesis':
      case 'ai_merge_proposal':
        return <Badge variant="warning" size="sm">AI Synthesized</Badge>;
      case 'version_restore':
        return <Badge variant="success" size="sm">Restored</Badge>;
      default:
        return <Badge variant="neutral" size="sm">{sourceType}</Badge>;
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex justify-end animate-fadeIn">
      <div className="w-full max-w-2xl bg-app-surface border-l border-app-border h-full flex flex-col shadow-2xl">
        {/* Header */}
        <div className="px-5 py-4 border-b border-app-border flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-app-text-primary flex items-center gap-2">
              <Icon name="history" size={16} /> Version History
            </h2>
            <p className="text-xs text-app-text-secondary mt-0.5">
              Append-only immutable record of all revisions.
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close drawer">
            <Icon name="x" size={16} />
          </Button>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <LoadingState label="Loading revision history..." />
          </div>
        ) : error ? (
          <div className="p-5 text-xs text-status-danger bg-status-danger/10 border-b border-status-danger/20">
            {error}
          </div>
        ) : (
          <div className="flex-1 flex overflow-hidden">
            {/* Version List Sidebar */}
            <div className="w-64 border-r border-app-border overflow-y-auto divide-y divide-app-border">
              {versions.map((ver) => {
                const isSelected = selectedVersion?._id === ver._id;
                const isCurrent = ver.version === currentVersionNumber;

                return (
                  <button
                    key={ver._id}
                    onClick={() => setSelectedVersion(ver)}
                    className={`w-full text-left p-3.5 transition-colors flex flex-col gap-1.5 ${
                      isSelected
                        ? 'bg-brand-500/10 border-l-2 border-brand-500'
                        : 'hover:bg-app-surface-muted/40'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-xs text-app-text-primary flex items-center gap-1.5">
                        v{ver.version}
                        {isCurrent && (
                          <Badge variant="brand" size="sm">Current</Badge>
                        )}
                      </span>
                      {getSourceBadge(ver.sourceType)}
                    </div>
                    <p className="text-[11px] text-app-text-secondary line-clamp-2">
                      {ver.changeSummary || 'No change summary'}
                    </p>
                    <div className="text-[10px] text-app-text-muted flex items-center justify-between mt-1">
                      <span>{ver.blocks?.length || 0} blocks</span>
                      <span>{new Date(ver.createdAt).toLocaleDateString()}</span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Version Snapshot Preview */}
            <div className="flex-1 flex flex-col overflow-hidden bg-app-surface-muted/20">
              {selectedVersion ? (
                <>
                  <div className="p-4 border-b border-app-border bg-app-surface flex items-center justify-between">
                    <div>
                      <div className="text-xs font-semibold text-app-text-primary">
                        Version {selectedVersion.version} Snapshot
                      </div>
                      <div className="text-[11px] text-app-text-secondary">
                        {new Date(selectedVersion.createdAt).toLocaleString()} · {selectedVersion.changeSummary}
                      </div>
                    </div>
                    {selectedVersion.version !== currentVersionNumber && (
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={restoring}
                        onClick={() => handleRestore(selectedVersion)}
                        icon={<Icon name="rotate-ccw" size={12} />}
                      >
                        {restoring ? 'Restoring...' : 'Restore this version'}
                      </Button>
                    )}
                  </div>

                  <div className="flex-1 overflow-y-auto p-5 space-y-3">
                    {selectedVersion.blocks?.length === 0 ? (
                      <EmptyState
                        title="Empty snapshot"
                        description="This version has no content blocks."
                      />
                    ) : (
                      selectedVersion.blocks.map((block) => (
                        <BlockRenderer
                          key={block.id}
                          block={block}
                          showProvenance={true}
                        />
                      ))
                    )}
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center text-xs text-app-text-muted">
                  Select a version to inspect snapshot
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default VersionHistoryDrawer;
