'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { useState } from 'react';

interface MarkdownRendererProps {
  content: string;
}

function CopyButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="absolute top-2 right-2 px-2 py-1 text-xs rounded bg-card-hover text-muted hover:text-foreground transition-colors"
    >
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
}

export default function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          pre({ children, ...props }) {
            const codeElement = children as React.ReactElement<{
              children?: string | string[];
              className?: string;
            }>;
            const codeText =
              typeof codeElement === 'object' &&
              codeElement !== null &&
              'props' in codeElement
                ? String(codeElement.props.children || '')
                : '';
            return (
              <div className="relative group">
                <pre
                  className="overflow-x-auto rounded-lg bg-[#111] p-4 my-2 font-[family-name:var(--font-jetbrains)] text-sm"
                  {...props}
                >
                  {children}
                </pre>
                <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                  <CopyButton code={codeText} />
                </div>
              </div>
            );
          },
          code({ className, children, ...props }) {
            const isInline = !className;
            if (isInline) {
              return (
                <code
                  className="bg-[#262626] px-1.5 py-0.5 rounded text-sm font-[family-name:var(--font-jetbrains)]"
                  {...props}
                >
                  {children}
                </code>
              );
            }
            return (
              <code className={className} {...props}>
                {children}
              </code>
            );
          },
          a({ href, children, ...props }) {
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent hover:underline"
                {...props}
              >
                {children}
              </a>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
