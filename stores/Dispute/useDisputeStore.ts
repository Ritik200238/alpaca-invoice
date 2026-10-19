import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { DisputeState } from './DisputeState';
import type { DisputeRecord, AleoField } from '@/lib/types';

export const useDisputeStore = create<DisputeState>()(
  persist(
    (set) => ({
      disputes: [],
      isLoading: false,

      addDispute(dispute: DisputeRecord) {
        set(state => {
          const exists = state.disputes.some(d => d.disputeId === dispute.disputeId);
          if (exists) return state;
          return { disputes: [...state.disputes, dispute] };
        });
      },

      updateDispute(disputeId: AleoField, data: Partial<DisputeRecord>) {
        set(state => ({
          disputes: state.disputes.map(d =>
            d.disputeId === disputeId ? { ...d, ...data } : d
          ),
        }));
      },

      removeDispute(disputeId: AleoField) {
        set(state => ({
          disputes: state.disputes.filter(d => d.disputeId !== disputeId),
        }));
      },
    }),
    {
      name: 'alpaca-dispute-store',
      partialize: (state) => ({ disputes: state.disputes }),
      storage: {
        getItem: (name) => {
          const str = localStorage.getItem(name);
          if (!str) return null;
          const parsed = JSON.parse(str, (_, v) => {
            if (typeof v === 'string' && /^\d+n$/.test(v)) {
              return BigInt(v.slice(0, -1));
            }
            return v;
          });
          if (parsed?.state?.disputes) {
            parsed.state.disputes = parsed.state.disputes.map((d: any) => ({
              ...d,
              createdAt: new Date(d.createdAt),
              resolutionDeadline: new Date(d.resolutionDeadline),
            }));
          }
          return parsed;
        },
        setItem: (name, value) => {
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
