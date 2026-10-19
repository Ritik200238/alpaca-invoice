import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Providers from '@/components/providers';
import { ErrorHandler } from '@/components/error-handler';
import { Toaster } from 'sonner';
import './globals.css';

export const metadata: Metadata = {
  title: 'Alpaca Invoice',
  description: 'Privacy-preserving invoice and payment system built on Aleo',
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-primary-50 text-foreground antialiased bg-[radial-gradient(60%_40%_at_10%_0%,rgba(245,158,11,0.12),transparent),radial-gradient(50%_35%_at_90%_10%,rgba(139,92,246,0.12),transparent)]">
        <Providers>
          <ErrorHandler />
          <Toaster
            position="top-right"
            richColors
            toastOptions={{
              classNames: {
                toast: 'bg-white border border-primary-200 shadow-lg rounded-xl',
                title: 'text-primary-900 font-semibold',
                description: 'text-primary-600',
              },
            }}
          />
          {children}
        </Providers>
      </body>
    </html>
  );
}
