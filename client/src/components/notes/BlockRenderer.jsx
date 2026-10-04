import React from 'react';
import { Badge, Icon } from '../ui';

/**
 * BlockRenderer Component (Phase 07)
 * Renders structured typed blocks with provenance badges, formatting, and responsive styling.
 */
export function BlockRenderer({ block, showProvenance = false, className = '' }) {
  if (!block || !block.type) return null;

  const { type, content, origin, metadata } = block;

  const renderProvenanceBadge = () => {
    if (!showProvenance || !origin) return null;
    const isUser = origin === 'user';
    const isAi = origin === 'ai';

    return (
      <div className="flex items-center gap-1.5 opacity-60 hover:opacity-100 transition-opacity text-[10px]">
        {isUser && (
          <Badge variant="brand" size="sm">
            <Icon name="edit" size={10} className="mr-0.5" /> User
          </Badge>
        )}
        {isAi && (
          <Badge variant="neutral" size="sm">
            <Icon name="sparkles" size={10} className="mr-0.5 text-brand-500" /> AI
          </Badge>
        )}
        {metadata?.conceptAttributions?.length > 0 && (
          <span className="text-app-text-muted italic">
            Ref: {metadata.conceptAttributions.join(', ')}
          </span>
        )}
      </div>
    );
  };

  const renderBlockContent = () => {
    switch (type) {
      case 'heading': {
        const level = content?.level || 1;
        const text = content?.text || '';
        if (level === 1) {
          return <h1 className="text-2xl font-bold text-app-text-primary tracking-tight mt-6 mb-3">{text}</h1>;
        }
        if (level === 2) {
          return <h2 className="text-xl font-semibold text-app-text-primary tracking-tight mt-5 mb-2.5">{text}</h2>;
        }
        if (level === 3) {
          return <h3 className="text-lg font-medium text-app-text-primary mt-4 mb-2">{text}</h3>;
        }
        return <h4 className="text-base font-medium text-app-text-primary mt-3 mb-1.5">{text}</h4>;
      }

      case 'paragraph': {
        const text = content?.text || '';
        return (
          <p className="text-sm leading-relaxed text-app-text-secondary whitespace-pre-wrap">
            {text}
          </p>
        );
      }

      case 'bullet_list': {
        const items = content?.items || [];
        return (
          <ul className="list-disc list-inside space-y-1 text-sm text-app-text-secondary my-2 pl-2">
            {items.map((item, idx) => (
              <li key={idx} className="leading-relaxed">
                {item}
              </li>
            ))}
          </ul>
        );
      }

      case 'numbered_list': {
        const items = content?.items || [];
        return (
          <ol className="list-decimal list-inside space-y-1 text-sm text-app-text-secondary my-2 pl-2">
            {items.map((item, idx) => (
              <li key={idx} className="leading-relaxed">
                {item}
              </li>
            ))}
          </ol>
        );
      }

      case 'code': {
        const language = content?.language || 'text';
        const code = content?.code || '';
        const caption = content?.caption;
        return (
          <div className="my-3 rounded-lg border border-app-border bg-app-surface-muted/50 overflow-hidden font-mono text-xs">
            <div className="flex items-center justify-between px-3 py-1.5 bg-app-surface border-b border-app-border text-app-text-muted">
              <span>{language}</span>
              {caption && <span className="italic">{caption}</span>}
            </div>
            <pre className="p-3.5 overflow-x-auto text-app-text-primary font-mono text-xs leading-relaxed">
              <code>{code}</code>
            </pre>
          </div>
        );
      }

      case 'quote': {
        const text = content?.text || '';
        const citation = content?.citation;
        return (
          <blockquote className="my-3 pl-4 border-l-4 border-brand-500 italic text-sm text-app-text-secondary bg-brand-50/20 dark:bg-brand-950/10 py-2 pr-3 rounded-r">
            <p>"{text}"</p>
            {citation && <footer className="text-xs text-app-text-muted mt-1 not-italic">— {citation}</footer>}
          </blockquote>
        );
      }

      case 'callout': {
        const variant = content?.variant || 'info';
        const title = content?.title;
        const text = content?.text || '';

        const variantStyles = {
          info: 'bg-blue-50/60 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900/50 text-blue-900 dark:text-blue-200',
          warning: 'bg-amber-50/60 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900/50 text-amber-900 dark:text-amber-200',
          tip: 'bg-emerald-50/60 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/50 text-emerald-900 dark:text-emerald-200',
          key_takeaway: 'bg-purple-50/60 dark:bg-purple-950/30 border-purple-200 dark:border-purple-900/50 text-purple-900 dark:text-purple-200',
        };

        const iconName = {
          info: 'info',
          warning: 'alert-triangle',
          tip: 'sparkles',
          key_takeaway: 'check-circle',
        };

        return (
          <div className={`my-3 p-3.5 rounded-lg border text-xs leading-relaxed ${variantStyles[variant] || variantStyles.info}`}>
            <div className="flex items-start gap-2">
              <Icon name={iconName[variant] || 'info'} size={15} className="mt-0.5 shrink-0 opacity-80" />
              <div>
                {title && <div className="font-semibold mb-1 text-[13px]">{title}</div>}
                <div className="opacity-90 whitespace-pre-wrap">{text}</div>
              </div>
            </div>
          </div>
        );
      }

      case 'table': {
        const headers = content?.headers || [];
        const rows = content?.rows || [];
        return (
          <div className="my-3 overflow-x-auto rounded-lg border border-app-border">
            <table className="w-full text-xs text-left border-collapse">
              {headers.length > 0 && (
                <thead className="bg-app-surface-muted/60 text-app-text-primary border-b border-app-border font-medium">
                  <tr>
                    {headers.map((h, i) => (
                      <th key={i} className="px-3 py-2">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
              )}
              <tbody className="divide-y divide-app-border">
                {rows.map((row, rIdx) => (
                  <tr key={rIdx} className="hover:bg-app-surface-muted/30">
                    {row.map((cell, cIdx) => (
                      <td key={cIdx} className="px-3 py-2 text-app-text-secondary">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }

      case 'divider': {
        return <hr className="my-5 border-t border-app-border" />;
      }

      default:
        return <div className="text-xs text-app-text-muted my-1">{JSON.stringify(content)}</div>;
    }
  };

  return (
    <div className={`group relative ${className}`} data-block-id={block.id} data-block-type={type}>
      {showProvenance && (
        <div className="flex justify-end mb-1">
          {renderProvenanceBadge()}
        </div>
      )}
      {renderBlockContent()}
    </div>
  );
}

export default BlockRenderer;
