'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import { useState } from 'react';
import CodeActions from './CodeActions';

interface MarkdownRendererProps {
  content: string;
}

const sanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    code: [
      ...(defaultSchema.attributes?.code || []),
      ['className', /^language-\w+$/, /^hljs$/],
    ],
    span: [
      ...(defaultSchema.attributes?.span || []),
      ['className', /^hljs-\w+$/],
    ],
  },
};

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
        rehypePlugins={[[rehypeSanitize, sanitizeSchema], rehypeHighlight]}
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

            // Extract language from className (e.g., "language-typescript" → "typescript")
            const lang =
              typeof codeElement === 'object' &&
              codeElement !== null &&
              'props' in codeElement &&
              codeElement.props.className
                ? codeElement.props.className.replace(/^language-/, '').replace(/^hljs\s*/, '')
                : '';

            return (
              <div className="relative group my-2">
                {lang && (
                  <div className="flex items-center justify-between px-4 py-1.5 bg-[#1a1a1a] rounded-t-lg border-b border-[#333]">
                    <span className="text-[11px] text-muted font-mono">{lang}</span>
                    <CopyButton code={codeText} />
                  </div>
                )}
                <pre
                  className={`overflow-x-auto ${lang ? 'rounded-b-lg rounded-t-none' : 'rounded-lg'} bg-[#111] p-4 font-[family-name:var(--font-jetbrains)] text-sm`}
                  {...props}
                >
                  {children}
                </pre>
                {!lang && (
                  <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <CopyButton code={codeText} />
                  </div>
                )}
                {lang && codeText && <CodeActions language={lang} code={codeText} />}
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
          table({ children, ...props }) {
            return (
              <div className="overflow-x-auto my-3 rounded-lg border border-border">
                <table className="min-w-full" {...props}>
                  {children}
                </table>
              </div>
            );
          },
          tr({ children, ...props }) {
            return (
              <tr className="even:bg-card/50" {...props}>
                {children}
              </tr>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
