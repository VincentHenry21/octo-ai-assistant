import { useState } from 'react';
import type { ChatMessage } from '../../types/index';

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function renderMarkdown(text: string): string {
  const blocks: string[] = [];
  let safe = escapeHtml(text);
  safe = safe.replace(/```([\s\S]*?)```/g, (_m, code: string) => {
    blocks.push(`<pre style="background:#080B10;padding:12px;border-radius:12px;overflow:auto;"><code>${code}</code></pre>`);
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
      out.push(line ? `<p style="margin:6px 0;">${line}</p>` : '');
    }
  }
  if (inList) out.push('</ul>');
  let html = out.join('\n');
  html = html.replace(/\u0000(\d+)\u0000/g, (_m, i: string) => blocks[Number(i)] || '');
  return html;
}

export function MessageBubble({ message, onCopy, onRegenerate }: {
  message: ChatMessage; onCopy: () => void; onRegenerate?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div style={{ display: 'flex', justifyContent: message.role === 'user' ? 'flex-end' : 'flex-start' }}>
      <div className="glass" style={{ maxWidth: '88%', padding: '12px 14px', background: message.role === 'user' ? 'rgba(53,217,255,0.14)' : undefined }}>
        <div dangerouslySetInnerHTML={{ __html: renderMarkdown(message.text) }} />
        {message.role === 'assistant' && (
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button type="button" className="btn-ghost" style={{ minHeight: 36, padding: '6px 10px' }} onClick={() => { onCopy(); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
              {copied ? 'Copied' : 'Copy'}
            </button>
            {onRegenerate && <button type="button" className="btn-ghost" style={{ minHeight: 36, padding: '6px 10px' }} onClick={onRegenerate}>Regenerate</button>}
          </div>
        )}
      </div>
    </div>
  );
}
