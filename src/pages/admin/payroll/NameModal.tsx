import { useState } from 'react';
import { motion } from 'framer-motion';
import { X, Loader2, Check } from 'lucide-react';

/** Minimal single-text-input modal (new rate card / duplicate name). */
export default function NameModal({
  title, label = 'Pavadinimas', defaultValue = '', confirmLabel, pending = false, onConfirm, onClose,
}: {
  title: string;
  label?: string;
  defaultValue?: string;
  confirmLabel: string;
  pending?: boolean;
  onConfirm: (value: string) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(defaultValue);
  const valid = value.trim().length >= 2;
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget && !pending) onClose(); }}
    >
      <motion.div
        initial={{ scale: 0.96, opacity: 0, y: 12 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.96, opacity: 0 }}
        transition={{ type: 'spring', bounce: 0.2, duration: 0.3 }}
        className="bg-white dark:bg-[#18181b] rounded-[20px] shadow-2xl w-full max-w-sm border border-zinc-100 dark:border-white/10"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 dark:border-white/10">
          <h2 className="font-bold text-[16px] text-zinc-900 dark:text-zinc-100">{title}</h2>
          <button onClick={onClose} disabled={pending} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-zinc-100 dark:hover:bg-[#27272a] transition-colors cursor-pointer disabled:opacity-50">
            <X size={18} className="text-zinc-400" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">{label}</label>
            <input
              type="text" value={value} autoFocus
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && valid && !pending) onConfirm(value.trim()); }}
              className="w-full h-[42px] px-3 bg-zinc-50 dark:bg-[#27272a] border border-transparent dark:border-white/10 rounded-xl text-[14px] text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all"
            />
          </div>
          <div className="flex gap-3">
            <button onClick={onClose} disabled={pending} className="flex-1 h-[42px] rounded-xl border border-zinc-200 dark:border-white/10 text-zinc-600 dark:text-zinc-300 font-medium text-[14px] hover:bg-zinc-50 dark:hover:bg-[#27272a] transition-colors cursor-pointer disabled:opacity-50">
              Atšaukti
            </button>
            <button onClick={() => onConfirm(value.trim())} disabled={pending || !valid}
              className="flex-1 h-[42px] rounded-xl bg-purple-600 text-white font-medium text-[14px] hover:bg-purple-700 transition-all disabled:opacity-50 disabled:cursor-default cursor-pointer flex items-center justify-center gap-2">
              {pending ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
              {confirmLabel}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
