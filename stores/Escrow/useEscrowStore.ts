import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { EscrowState } from './EscrowState';
import type { EscrowRecord, AleoField } from '@/lib/types';

export const useEscrowStore = create<EscrowState>()(
  persist(
    (set) => ({
      escrows: [],
      isLoading: false,

      addEscrow(escrow: EscrowRecord) {
        set(state => {
          const exists = state.escrows.some(e => e.escrowId === escrow.escrowId);
          if (exists) return state;
          return { escrows: [...state.escrows, escrow] };
        });
      },

      updateEscrow(escrowId: AleoField, data: Partial<EscrowRecord>) {
        set(state => ({
          escrows: state.escrows.map(e =>
            e.escrowId === escrowId ? { ...e, ...data } : e
          ),
        }));
      },
    }),
    {
      name: 'alpaca-escrow-store',
      partialize: (state) => ({ escrows: state.escrows }),
      storage: {
        getItem: (name) => {
          const str = localStorage.getItem(name);
          if (!str) return null;
          // Revive serialized BigInt strings ("123n") and Date strings
          const parsed = JSON.parse(str, (_, v) => {
            if (typeof v === 'string' && /^\d+n$/.test(v)) {
              return BigInt(v.slice(0, -1));
            }
            return v;
          });
          if (parsed?.state?.escrows) {
            parsed.state.escrows = parsed.state.escrows.map((e: any) => ({
              ...e,
              deliveryDeadline: new Date(e.deliveryDeadline),
            }));
          }
          return parsed;
        },
        setItem: (name, value) => {
          // Serialize BigInt as "<digits>n" strings so JSON.stringify doesn't throw
          const serialized = JSON.stringify(value, (_, v) =>
            typeof v === 'bigint' ? `${v}n` : v
          );
          localStorage.setItem(name, serialized);
        },
        removeItem: (name) => {
          localStorage.removeItem(name);
        },
      },
    }
  )
);
