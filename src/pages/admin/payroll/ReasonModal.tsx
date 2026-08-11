import { useState } from 'react';
import { motion } from 'framer-motion';
import { X, Loader2, Check } from 'lucide-react';

/**
 * Small modal that requires a free-text reason before confirming an action
 * (include/exclude a site). The reason is persisted into manual_note.
 */
export default function ReasonModal({
  title,
  message,
  confirmLabel,
  placeholder = 'Nurodykite priežastį…',
  variant = 'primary',
  pending = false,
  onConfirm,
  onClose,
}: {
  title: string;
  message?: string;
  confirmLabel: string;
  placeholder?: string;
  variant?: 'primary' | 'danger';
  pending?: boolean;
  onConfirm: (reason: string) => void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState('');
  const valid = reason.trim().length >= 3;
  const btn = variant === 'danger'
    ? 'bg-danger hover:bg-danger'
    : 'bg-primary hover:opacity-90';

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget && !pending) onClose(); }}
    >
      <motion.div
        initial={{ scale: 0.96, opacity: 0, y: 12 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.96, opacity: 0 }}
        transition={{ type: 'spring', bounce: 0.2, duration: 0.3 }}
        className="bg-surface rounded-[20px] shadow-2xl w-full max-w-md border border-border dark:border-white/10"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-border dark:border-white/10">
          <h2 className="font-bold text-[16px] text-text">{title}</h2>
          <button onClick={onClose} disabled={pending} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-2 dark:hover:bg-surface-2 transition-colors cursor-pointer disabled:opacity-50">
            <X size={18} className="text-subtle" />
          </button>
        </div>
        <div className="p-6 space-y-3">
          {message && <p className="text-[13px] text-subtle">{message}</p>}
          <div>
            <label className="block text-[11px] font-bold text-subtle uppercase tracking-wider mb-1.5">Priežastis (privaloma)</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              autoFocus
              placeholder={placeholder}
              className="w-full p-3 bg-surface-2 dark:bg-surface-2 border border-transparent dark:border-white/10 rounded-card text-[14px] text-text dark:text-white focus:outline-none focus:ring-2 focus:ring-primary transition-all resize-y"
            />
          </div>
          <div className="flex gap-3 pt-1">
            <button onClick={onClose} disabled={pending} className="flex-1 h-[42px] rounded-card border border-border dark:border-white/10 text-muted font-medium text-[14px] hover:bg-surface-2 dark:hover:bg-surface-2 transition-colors cursor-pointer disabled:opacity-50">
              Atšaukti
            </button>
            <button
              onClick={() => onConfirm(reason.trim())}
              disabled={pending || !valid}
              className={`flex-1 h-[42px] rounded-card text-white font-medium text-[14px] transition-all disabled:opacity-50 disabled:cursor-default cursor-pointer flex items-center justify-center gap-2 ${btn}`}
            >
              {pending ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
              {confirmLabel}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
