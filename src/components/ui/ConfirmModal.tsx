import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'success' | 'primary';
}

export default function ConfirmModal({
  isOpen,
  title,
  message,
  onConfirm,
  onCancel,
  confirmText = 'Patvirtinti',
  cancelText = 'Atšaukti',
  variant = 'danger'
}: ConfirmModalProps) {
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onCancel();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        onConfirm();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [isOpen, onCancel, onConfirm]);

  let confirmButtonClass = 'bg-danger active:bg-danger/90';
  if (variant === 'success') {
    confirmButtonClass = 'bg-success active:bg-success/90';
  } else if (variant === 'primary') {
    confirmButtonClass = 'bg-primary active:bg-primary/90';
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: 'spring', bounce: 0.3, duration: 0.4 }}
            className="bg-surface rounded-[20px] max-w-sm w-full p-6 shadow-card flex flex-col gap-4"
          >
            <div>
              <h3 className="text-lg font-bold text-text leading-tight">
                {title}
              </h3>
              <p className="text-[14px] text-muted mt-2 leading-relaxed">
                {message}
              </p>
            </div>

            <div className="flex gap-3 justify-end mt-2">
              <button
                type="button"
                onClick={onCancel}
                className="h-10 px-4 rounded-btn border border-border text-[14px] font-semibold text-text hover:bg-surface-2 active:scale-[0.98] transition-all cursor-pointer"
              >
                {cancelText}
              </button>
              <button
                type="button"
                onClick={onConfirm}
                className={`h-10 px-4 rounded-btn text-white text-[14px] font-semibold hover:opacity-90 active:scale-[0.98] transition-all cursor-pointer ${confirmButtonClass}`}
              >
                {confirmText}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
