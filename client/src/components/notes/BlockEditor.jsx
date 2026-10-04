import React, { useState } from 'react';
import { Button, Icon } from '../ui';

// Supported structured block types in editor
const AVAILABLE_BLOCK_TYPES = [
  { type: 'paragraph', label: 'Paragraph', icon: 'file-text' },
  { type: 'heading', label: 'Heading', icon: 'type' },
  { type: 'bullet_list', label: 'Bullet List', icon: 'list' },
  { type: 'numbered_list', label: 'Numbered List', icon: 'list-ordered' },
  { type: 'code', label: 'Code Snippet', icon: 'code' },
  { type: 'callout', label: 'Callout Box', icon: 'alert-circle' },
  { type: 'quote', label: 'Quote', icon: 'message-square' },
  { type: 'divider', label: 'Divider', icon: 'minus' },
];

/**
 * BlockEditor Component (Phase 07)
 * Interactive structured block editor with live preview, typed block creation, and optimistic revision saves.
 */
export function BlockEditor({
  initialTitle = '',
  initialBlocks = [],
  baseVersion = 1,
  onSave,
  onCancel,
  saving = false,
}) {
  const [title, setTitle] = useState(initialTitle);
  const [blocks, setBlocks] = useState(
    initialBlocks.length > 0
      ? JSON.parse(JSON.stringify(initialBlocks))
      : [
          {
            id: crypto.randomUUID(),
            type: 'heading',
            content: { level: 1, text: 'Untitled Note' },
            order: 0,
            origin: 'user',
          },
          {
            id: crypto.randomUUID(),
            type: 'paragraph',
            content: { text: 'Start typing your study notes here...' },
            order: 1,
            origin: 'user',
          },
        ]
  );
  const [changeSummary, setChangeSummary] = useState('');

  const handleUpdateBlockContent = (idx, newContent) => {
    setBlocks((prev) => {
      const next = [...prev];
      next[idx] = {
        ...next[idx],
        content: newContent,
        origin: 'user', // Mark manual edits as user-authored
      };
      return next;
    });
  };

  const handleAddBlock = (type, targetIndex = null) => {
    const newId = crypto.randomUUID();
    let newContent = { text: '' };

    if (type === 'heading') newContent = { level: 2, text: 'New Section' };
    if (type === 'bullet_list') newContent = { items: ['First point'] };
    if (type === 'numbered_list') newContent = { items: ['Step 1'] };
    if (type === 'code') newContent = { language: 'python', code: '# Enter code here\n', caption: '' };
    if (type === 'callout') newContent = { variant: 'info', title: 'Note', text: 'Important concept note' };
    if (type === 'quote') newContent = { text: 'Notable quote', citation: '' };
    if (type === 'divider') newContent = {};

    const newBlock = {
      id: newId,
      type,
      content: newContent,
      order: targetIndex !== null ? targetIndex + 1 : blocks.length,
      origin: 'user',
      metadata: { conceptAttributions: [], lastModifiedAt: new Date() },
    };

    setBlocks((prev) => {
      if (targetIndex !== null) {
        const next = [...prev];
        next.splice(targetIndex + 1, 0, newBlock);
        return next.map((b, i) => ({ ...b, order: i }));
      }
      return [...prev, newBlock].map((b, i) => ({ ...b, order: i }));
    });
  };

  const handleMoveBlock = (idx, direction) => {
    if (direction === 'up' && idx === 0) return;
    if (direction === 'down' && idx === blocks.length - 1) return;

    setBlocks((prev) => {
      const next = [...prev];
      const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
      const temp = next[idx];
      next[idx] = next[targetIdx];
      next[targetIdx] = temp;
      return next.map((b, i) => ({ ...b, order: i }));
    });
  };

  const handleDeleteBlock = (idx) => {
    if (blocks.length <= 1) {
      alert('A note must have at least one content block.');
      return;
    }
    setBlocks((prev) => prev.filter((_, i) => i !== idx).map((b, i) => ({ ...b, order: i })));
  };

  const handleSave = () => {
    if (!title.trim()) {
      alert('Note title cannot be empty.');
      return;
    }
    if (onSave) {
      onSave({
        title: title.trim(),
        blocks,
        changeSummary: changeSummary.trim() || 'Manual revision',
        baseVersion,
      });
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-16">
      {/* Top Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border border-app-border bg-app-surface shadow-sm">
        <div className="flex-1">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Note Title..."
            className="w-full text-lg font-bold text-app-text-primary bg-transparent focus:outline-none border-b border-transparent focus:border-brand-500 pb-1"
          />
          <input
            type="text"
            value={changeSummary}
            onChange={(e) => setChangeSummary(e.target.value)}
            placeholder="Change summary (e.g. Added section on MemTables)..."
            className="w-full text-xs text-app-text-secondary bg-transparent focus:outline-none mt-1"
          />
        </div>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleSave}
            disabled={saving}
            icon={<Icon name="save" size={14} />}
          >
            {saving ? 'Saving...' : `Save as Version v${baseVersion + 1}`}
          </Button>
        </div>
      </div>

      {/* Block List Editor */}
      <div className="space-y-4">
        {blocks.map((block, idx) => (
          <div
            key={block.id || idx}
            className="group relative p-4 rounded-xl border border-app-border bg-app-surface hover:border-app-border/80 transition-shadow hover:shadow-sm"
          >
            {/* Block Control Header */}
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-app-border/60 text-xs text-app-text-muted">
              <div className="flex items-center gap-2">
                <span className="font-semibold uppercase text-[10px] text-brand-600 dark:text-brand-400 bg-brand-500/10 px-2 py-0.5 rounded">
                  {block.type}
                </span>
                <span className="text-[11px]">#{idx + 1}</span>
              </div>

              <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => handleMoveBlock(idx, 'up')}
                  disabled={idx === 0}
                  className="p-1 hover:bg-app-surface-muted rounded disabled:opacity-30"
                  title="Move Up"
                >
                  <Icon name="chevron-up" size={14} />
                </button>
                <button
                  onClick={() => handleMoveBlock(idx, 'down')}
                  disabled={idx === blocks.length - 1}
                  className="p-1 hover:bg-app-surface-muted rounded disabled:opacity-30"
                  title="Move Down"
                >
                  <Icon name="chevron-down" size={14} />
                </button>
                <button
                  onClick={() => handleDeleteBlock(idx)}
                  className="p-1 hover:bg-rose-500/10 hover:text-status-danger rounded text-app-text-muted"
                  title="Delete Block"
                >
                  <Icon name="trash" size={14} />
                </button>
              </div>
            </div>

            {/* Block Content Editor depending on type */}
            {block.type === 'heading' && (
              <div className="flex items-center gap-3">
                <select
                  value={block.content?.level || 1}
                  onChange={(e) =>
                    handleUpdateBlockContent(idx, {
                      ...block.content,
                      level: parseInt(e.target.value, 10),
                    })
                  }
                  className="text-xs p-1.5 rounded border border-app-border bg-app-surface text-app-text-primary"
                >
                  <option value={1}>H1</option>
                  <option value={2}>H2</option>
                  <option value={3}>H3</option>
                  <option value={4}>H4</option>
                </select>
                <input
                  type="text"
                  value={block.content?.text || ''}
                  onChange={(e) =>
                    handleUpdateBlockContent(idx, {
                      ...block.content,
                      text: e.target.value,
                    })
                  }
                  placeholder="Heading text..."
                  className="flex-1 text-base font-bold text-app-text-primary bg-transparent border-b border-app-border focus:border-brand-500 focus:outline-none p-1"
                />
              </div>
            )}

            {block.type === 'paragraph' && (
              <textarea
                value={block.content?.text || ''}
                onChange={(e) =>
                  handleUpdateBlockContent(idx, {
                    ...block.content,
                    text: e.target.value,
                  })
                }
                placeholder="Paragraph text (Markdown supported)..."
                rows={3}
                className="w-full text-xs text-app-text-primary bg-transparent focus:outline-none p-1 border border-transparent focus:border-app-border rounded resize-y"
              />
            )}

            {block.type === 'bullet_list' && (
              <textarea
                value={(block.content?.items || []).join('\n')}
                onChange={(e) =>
                  handleUpdateBlockContent(idx, {
                    items: e.target.value.split('\n').filter((s) => s.trim().length > 0),
                  })
                }
                placeholder="One bullet item per line..."
                rows={3}
                className="w-full text-xs text-app-text-primary bg-transparent focus:outline-none p-1 border border-transparent focus:border-app-border rounded"
              />
            )}

            {block.type === 'numbered_list' && (
              <textarea
                value={(block.content?.items || []).join('\n')}
                onChange={(e) =>
                  handleUpdateBlockContent(idx, {
                    items: e.target.value.split('\n').filter((s) => s.trim().length > 0),
                  })
                }
                placeholder="One numbered item per line..."
                rows={3}
                className="w-full text-xs text-app-text-primary bg-transparent focus:outline-none p-1 border border-transparent focus:border-app-border rounded"
              />
            )}

            {block.type === 'code' && (
              <div className="space-y-2 font-mono text-xs">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={block.content?.language || ''}
                    onChange={(e) =>
                      handleUpdateBlockContent(idx, {
                        ...block.content,
                        language: e.target.value,
                      })
                    }
                    placeholder="Language (e.g. rust, python)..."
                    className="w-32 p-1.5 rounded border border-app-border bg-app-surface text-app-text-primary text-xs"
                  />
                  <input
                    type="text"
                    value={block.content?.caption || ''}
                    onChange={(e) =>
                      handleUpdateBlockContent(idx, {
                        ...block.content,
                        caption: e.target.value,
                      })
                    }
                    placeholder="Optional caption..."
                    className="flex-1 p-1.5 rounded border border-app-border bg-app-surface text-app-text-primary text-xs"
                  />
                </div>
                <textarea
                  value={block.content?.code || ''}
                  onChange={(e) =>
                    handleUpdateBlockContent(idx, {
                      ...block.content,
                      code: e.target.value,
                    })
                  }
                  placeholder="// Enter code here..."
                  rows={4}
                  className="w-full p-2.5 rounded bg-app-surface-muted border border-app-border text-app-text-primary font-mono text-xs focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>
            )}

            {block.type === 'callout' && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <select
                    value={block.content?.variant || 'info'}
                    onChange={(e) =>
                      handleUpdateBlockContent(idx, {
                        ...block.content,
                        variant: e.target.value,
                      })
                    }
                    className="text-xs p-1.5 rounded border border-app-border bg-app-surface text-app-text-primary"
                  >
                    <option value="info">Info</option>
                    <option value="warning">Warning</option>
                    <option value="tip">Tip</option>
                    <option value="key_takeaway">Key Takeaway</option>
                  </select>
                  <input
                    type="text"
                    value={block.content?.title || ''}
                    onChange={(e) =>
                      handleUpdateBlockContent(idx, {
                        ...block.content,
                        title: e.target.value,
                      })
                    }
                    placeholder="Callout title..."
                    className="flex-1 p-1.5 rounded border border-app-border bg-app-surface text-app-text-primary text-xs font-semibold"
                  />
                </div>
                <textarea
                  value={block.content?.text || ''}
                  onChange={(e) =>
                    handleUpdateBlockContent(idx, {
                      ...block.content,
                      text: e.target.value,
                    })
                  }
                  placeholder="Callout message text..."
                  rows={2}
                  className="w-full p-2 rounded border border-app-border bg-app-surface text-app-text-primary text-xs"
                />
              </div>
            )}

            {block.type === 'quote' && (
              <div className="space-y-2">
                <textarea
                  value={block.content?.text || ''}
                  onChange={(e) =>
                    handleUpdateBlockContent(idx, {
                      ...block.content,
                      text: e.target.value,
                    })
                  }
                  placeholder="Quote text..."
                  rows={2}
                  className="w-full p-2 rounded border border-app-border bg-app-surface text-app-text-primary text-xs italic"
                />
                <input
                  type="text"
                  value={block.content?.citation || ''}
                  onChange={(e) =>
                    handleUpdateBlockContent(idx, {
                      ...block.content,
                      citation: e.target.value,
                    })
                  }
                  placeholder="Citation author or source..."
                  className="w-full p-1.5 rounded border border-app-border bg-app-surface text-app-text-primary text-xs"
                />
              </div>
            )}

            {block.type === 'divider' && (
              <div className="py-2 text-center text-xs text-app-text-muted italic">
                Horizontal Divider Line
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Add Block Toolbar */}
      <div className="p-4 rounded-xl border border-dashed border-app-border bg-app-surface-muted/30 text-center space-y-3">
        <div className="text-xs font-semibold text-app-text-secondary">Insert Block:</div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          {AVAILABLE_BLOCK_TYPES.map((t) => (
            <Button
              key={t.type}
              variant="secondary"
              size="sm"
              onClick={() => handleAddBlock(t.type)}
              icon={<Icon name={t.icon} size={13} />}
            >
              {t.label}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default BlockEditor;
