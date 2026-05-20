import { createContext } from 'react';

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'success' | 'primary';
}

export type ConfirmContextType = (options: ConfirmOptions) => Promise<boolean>;

export const ConfirmContext = createContext<ConfirmContextType | null>(null);
