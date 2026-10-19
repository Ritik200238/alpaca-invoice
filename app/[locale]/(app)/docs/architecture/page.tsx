'use client';

import MarkdownRenderer from '@/components/docs/markdown-renderer';
import content from '@/docs/ARCHITECTURE.md';

export default function ArchitecturePage() {
  return <MarkdownRenderer content={content} title="Architecture" />;
}
