import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type AuditLogEntry = {
  action: 'generate' | 'verify';
  invoiceId: string;
  auditor?: string;
  result: 'ok' | 'fail';
  message: string;
  timestamp: number;
};

type AuditLogState = {
  entries: AuditLogEntry[];
  addEntry: (entry: AuditLogEntry) => void;
  clear: () => void;
  exportCsv: () => string;
};

export const useAuditLogStore = create<AuditLogState>()(
  persist(
    (set, get) => ({
      entries: [],
      addEntry: (entry) =>
        set((state) => ({
          entries: [...state.entries, entry]
        })),
      clear: () => set({ entries: [] }),
      exportCsv: () => {
        const rows = [
          ['action', 'invoiceId', 'auditor', 'result', 'message', 'timestamp'].join(',')
        ];
        for (const e of get().entries) {
          rows.push(
            [
              e.action,
              e.invoiceId,
              e.auditor ?? '',
              e.result,
              `"${e.message.replace(/"/g, '""')}"`,
              new Date(e.timestamp).toISOString()
            ].join(',')
          );
        }
        return rows.join('\n');
      }
    }),
    {
      name: 'audit-log-store'
    }
  )
);
