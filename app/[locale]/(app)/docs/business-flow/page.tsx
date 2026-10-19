'use client';

import MarkdownRenderer from '@/components/docs/markdown-renderer';
import content from '@/docs/BUSINESS_FLOW.md';

export default function BusinessFlowPage() {
  return <MarkdownRenderer content={content} title="Business Flow" />;
}
