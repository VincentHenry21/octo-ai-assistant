import { useState } from 'react';
import type { ChatMessage } from '../../types/index';

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function renderMarkdown(text: string): string {
  const blocks: string[] = [];
  let safe = escapeHtml(text);
  safe = safe.replace(/```([\s\S]*?)```/g, (_m, code: string) => {
    blocks.push(`<pre><code>${code}</code></pre>`);
    return `\u0000${blocks.length - 1}\u0000`;
  });
  safe = safe
    .replace(/^### (.*)$/gm, '<h3>$1</h3>')
    .replace(/^## (.*)$/gm, '<h2>$1</h2>')
    .replace(/^# (.*)$/gm, '<h1>$1</h1>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
  const lines = safe.split('\n');
  const out: string[] = [];
  let inList = false;
  for (const line of lines) {
    if (line.startsWith('- ')) {
      if (!inList) { out.push('<ul>'); inList = true; }
      out.push(`<li>${line.slice(2)}</li>`);
    } else {
      if (inList) { out.push('</ul>'); inList = false; }
      out.push(line ? `<p>${line}</p>` : '');
    }
  }
  if (inList) out.push('</ul>');
  let html = out.join('\n');
  html = html.replace(/\u0000(\d+)\u0000/g, (_m, i: string) => blocks[Number(i)] || '');
  return html;
}

export function MessageBubble({ message, onCopy, onRegenerate, streaming }: {
  message: ChatMessage; onCopy: () => void; onRegenerate?: () => void; streaming?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [showActions, setShowActions] = useState(false);
  return (
    <div className={`bubble-row ${message.role}`}>
      <div className={`bubble ${message.role} ${streaming ? 'streaming' : ''}`}>
        <div className="md-body" dangerouslySetInnerHTML={{ __html: renderMarkdown(message.text) }} />
        {message.role === 'assistant' && message.text && (
          <div className="bubble-actions">
            <button type="button" onClick={() => { onCopy(); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
              {copied ? 'Copied' : 'Copy'}
            </button>
            {onRegenerate && <button type="button" onClick={onRegenerate}>Regenerate</button>}
            <button type="button" aria-expanded={showActions} onClick={() => setShowActions((v) => !v)}>More</button>
            {showActions && (
              <span style={{ color: 'var(--muted)', fontSize: 13, alignSelf: 'center' }}>Saved in this conversation on this device.</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
