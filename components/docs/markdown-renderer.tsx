'use client';

import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ArrowLeft } from 'lucide-react';

interface MarkdownRendererProps {
  content: string;
  title: string;
}

export default function MarkdownRenderer({ content, title }: MarkdownRendererProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/docs"
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-primary-200 bg-white/80 text-primary-500 transition-colors hover:bg-primary-50 hover:text-primary-700"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="text-xl font-semibold text-primary-900">{title}</h1>
      </div>

      <div className="surface-card p-6 md:p-8">
        <article className="prose prose-primary max-w-none">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              h1: ({ children }) => (
                <h1 className="mb-4 mt-8 text-2xl font-bold text-primary-900 first:mt-0">
                  {children}
                </h1>
              ),
              h2: ({ children }) => (
                <h2 className="mb-3 mt-8 border-b border-primary-200/60 pb-2 text-xl font-semibold text-primary-800">
                  {children}
                </h2>
              ),
              h3: ({ children }) => (
                <h3 className="mb-2 mt-6 text-lg font-semibold text-primary-700">
                  {children}
                </h3>
              ),
              h4: ({ children }) => (
                <h4 className="mb-2 mt-4 text-base font-semibold text-primary-700">
                  {children}
                </h4>
              ),
              p: ({ children }) => (
                <p className="mb-4 leading-relaxed text-primary-600">{children}</p>
              ),
              ul: ({ children }) => (
                <ul className="mb-4 ml-1 list-disc space-y-1.5 pl-5 text-primary-600">
                  {children}
                </ul>
              ),
              ol: ({ children }) => (
                <ol className="mb-4 ml-1 list-decimal space-y-1.5 pl-5 text-primary-600">
                  {children}
                </ol>
              ),
              li: ({ children }) => (
                <li className="leading-relaxed">{children}</li>
              ),
              strong: ({ children }) => (
                <strong className="font-semibold text-primary-800">{children}</strong>
              ),
              a: ({ href, children }) => (
                <a
                  href={href}
                  className="font-medium text-accent-600 underline decoration-accent-300 underline-offset-2 hover:text-accent-700"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {children}
                </a>
              ),
              hr: () => <hr className="my-6 border-primary-200/60" />,
              blockquote: ({ children }) => (
                <blockquote className="my-4 border-l-4 border-accent-400 bg-accent-50/50 py-2 pl-4 pr-3 text-primary-600 italic">
                  {children}
                </blockquote>
              ),
              code: ({ className, children }) => {
                // Block code (inside <pre>) is styled by the pre component via [&>code].
                // Here we only need to handle inline code and language-tagged blocks.
                const isLanguageBlock = className?.includes('language-');
                if (isLanguageBlock) {
                  return <code className={className}>{children}</code>;
                }
                // Inline code styling — will be overridden by pre's [&>code] when inside a block.
                return (
                  <code className="rounded bg-primary-100 px-1.5 py-0.5 text-[0.85em] text-primary-800"
                    style={{ fontFamily: "'Courier New', Courier, monospace" }}
                  >
                    {children}
                  </code>
                );
              },
              pre: ({ children }) => (
                <pre
                  className="my-4 overflow-x-auto rounded-xl border border-primary-200/60 bg-primary-950 p-5 text-[13px] leading-[1.6] text-primary-300 [&>code]:bg-transparent [&>code]:p-0 [&>code]:text-[inherit] [&>code]:rounded-none [&>code]:leading-[inherit]"
                  style={{ fontFamily: "'Courier New', Courier, monospace" }}
                >
                  {children}
                </pre>
              ),
              table: ({ children }) => (
                <div className="my-4 overflow-x-auto rounded-xl border border-primary-200/60">
                  <table className="min-w-full divide-y divide-primary-200/60">
                    {children}
                  </table>
                </div>
              ),
              thead: ({ children }) => (
                <thead className="bg-primary-50/80">{children}</thead>
              ),
              th: ({ children }) => (
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-primary-600">
                  {children}
                </th>
              ),
              td: ({ children }) => (
                <td className="px-4 py-2.5 text-sm text-primary-600 border-t border-primary-100">
                  {children}
                </td>
              ),
            }}
          >
            {content}
          </ReactMarkdown>
        </article>
      </div>
    </div>
  );
}
