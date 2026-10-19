'use client';

import { useRef, useEffect, useCallback, useState, type FormEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageCircle, X, Send, Trash2, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';
import { useChatStore } from '@/stores/Chat/useChatStore';
import { Textarea } from '@/components/ui/textarea';

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 px-3 py-2">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="inline-block h-2 w-2 rounded-full bg-primary-400"
          animate={{ opacity: [0.3, 1, 0.3], scale: [0.85, 1, 0.85] }}
          transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
        />
      ))}
    </div>
  );
}

export default function ChatBot() {
  const t = useTranslations();
  const {
    messages,
    isLoading,
    isOpen,
    addMessage,
    appendToLastMessage,
    clearMessages,
    setLoading,
    toggleOpen,
  } = useChatStore();

  const PRESET_QUESTIONS = [
    t('chatbot.presetQ1'),
    t('chatbot.presetQ2'),
    t('chatbot.presetQ3'),
    t('chatbot.presetQ4'),
  ];

  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [isOpen]);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isLoading) return;

      setInput('');
      addMessage('user', trimmed);
      setLoading(true);

      // Prepare the history for the API call
      const history = useChatStore.getState().messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      // Add a placeholder for the model response
      addMessage('model', '');

      try {
        abortRef.current = new AbortController();

        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: history }),
          signal: abortRef.current.signal,
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || `HTTP ${res.status}`);
        }

        const reader = res.body?.getReader();
        if (!reader) throw new Error('No response stream');

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmedLine = line.trim();
            if (!trimmedLine.startsWith('data: ')) continue;
            const data = trimmedLine.slice(6);
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              if (parsed.error) throw new Error(parsed.error);
              if (parsed.text) {
                appendToLastMessage(parsed.text);
              }
            } catch {
              // skip malformed chunks
            }
          }
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') return;
        const errorMsg =
          err instanceof Error ? err.message : 'Something went wrong';
        const state = useChatStore.getState();
        const lastMsg = state.messages[state.messages.length - 1];
        if (lastMsg && lastMsg.role === 'model' && lastMsg.content === '') {
          useChatStore.getState().updateLastMessage(`Error: ${errorMsg}`);
        } else {
          addMessage('model', `Error: ${errorMsg}`);
        }
      } finally {
        setLoading(false);
        abortRef.current = null;
      }
    },
    [isLoading, addMessage, appendToLastMessage, setLoading]
  );

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  return (
    <>
      {/* Floating trigger button */}
      <AnimatePresence>
        {!isOpen && (
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.95 }}
            onClick={toggleOpen}
            className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-amber-500 to-amber-600 text-white shadow-lg shadow-amber-500/30 transition-shadow hover:shadow-xl hover:shadow-amber-500/40"
            aria-label="Open chat assistant"
          >
            <MessageCircle className="h-6 w-6" />
            {/* Pulse ring */}
            <span className="absolute inset-0 animate-ping rounded-full bg-amber-400 opacity-20" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Chat panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 300, damping: 26 }}
            className="fixed bottom-6 right-6 z-50 flex h-[min(600px,calc(100vh-3rem))] w-[min(420px,calc(100vw-3rem))] flex-col overflow-hidden rounded-2xl border border-primary-200/60 bg-white/95 shadow-2xl shadow-primary-900/10 backdrop-blur-lg"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-primary-100 bg-gradient-to-r from-primary-800 to-primary-900 px-4 py-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-500/90 text-sm font-bold text-white">
                  P
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white">Paca</h3>
                  <p className="text-[11px] text-primary-300">
                    {t('chatbot.title')}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={clearMessages}
                  className="rounded-lg p-1.5 text-primary-400 transition-colors hover:bg-white/10 hover:text-white"
                  title={t('chatbot.clearChat')}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
                <button
                  onClick={toggleOpen}
                  className="rounded-lg p-1.5 text-primary-400 transition-colors hover:bg-white/10 hover:text-white"
                  title={t('common.close')}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-3">
              {messages.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-2xl">
                    🦙
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium text-primary-800">
                      {t('chatbot.greeting')}
                    </p>
                    <p className="mt-1 text-xs text-primary-500">
                      {t('chatbot.greetingSub')}
                    </p>
                  </div>
                  <div className="mt-2 flex flex-col gap-2 w-full max-w-[280px]">
                    {PRESET_QUESTIONS.map((q) => (
                      <button
                        key={q}
                        onClick={() => sendMessage(q)}
                        disabled={isLoading}
                        className="rounded-xl border border-primary-200/70 bg-white px-3 py-2 text-left text-xs text-primary-700 transition-all hover:border-amber-300 hover:bg-amber-50/50 hover:text-amber-800 disabled:opacity-50"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={cn(
                        'flex',
                        msg.role === 'user' ? 'justify-end' : 'justify-start'
                      )}
                    >
                      <div
                        className={cn(
                          'max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed',
                          msg.role === 'user'
                            ? 'rounded-br-md bg-gradient-to-br from-amber-500 to-amber-600 text-white'
                            : 'rounded-bl-md border border-primary-100 bg-primary-50/60 text-primary-800'
                        )}
                      >
                        {msg.role === 'model' ? (
                          msg.content ? (
                            <div className="prose prose-sm prose-primary max-w-none [&_pre]:bg-primary-800 [&_pre]:text-primary-100 [&_code]:text-amber-700 [&_a]:text-amber-600 [&_strong]:text-primary-900 [&_h1]:text-base [&_h2]:text-sm [&_h3]:text-sm [&_p]:my-1.5 [&_ul]:my-1.5 [&_ol]:my-1.5 [&_li]:my-0.5 [&_table]:text-xs">
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {msg.content}
                              </ReactMarkdown>
                            </div>
                          ) : (
                            <TypingIndicator />
                          )
                        ) : (
                          <p className="whitespace-pre-wrap">{msg.content}</p>
                        )}
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>

            {/* Input area */}
            <form
              onSubmit={handleSubmit}
              className="border-t border-primary-100 bg-white/80 px-3 py-2.5"
            >
              <div className="flex items-end gap-2">
                <Textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={t('chatbot.placeholder')}
                  rows={1}
                  className="max-h-24 min-h-[36px] flex-1 resize-none"
                />
                <button
                  type="submit"
                  disabled={!input.trim() || isLoading}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 text-white transition-all hover:from-amber-600 hover:to-amber-700 disabled:opacity-40 disabled:hover:from-amber-500 disabled:hover:to-amber-600"
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </button>
              </div>
              <p className="mt-1.5 text-center text-[10px] text-primary-400">
                {t('chatbot.poweredBy')}
              </p>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
