import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, Circle, XCircle, Camera, X } from 'lucide-react';
import type { JobCompletionValidation } from '../../lib/checklistValidation';

interface JobCompletionBlockedModalProps {
  isOpen: boolean;
  result: JobCompletionValidation | null;
  onClose: () => void;
}

/**
 * Shown INSTEAD of the completion confirm dialog when the checklist hasn't met
 * the gating rules. Lists exactly what is blocking so the worker can fix it.
 */
export default function JobCompletionBlockedModal({
  isOpen,
  result,
  onClose,
}: JobCompletionBlockedModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && result && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: 'spring', bounce: 0.3, duration: 0.4 }}
            className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-xl flex flex-col gap-4 max-h-[80vh] overflow-y-auto"
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#FFF1F0] flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-[#DC2626]" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-[#1d033a] leading-tight">
                  Negalite užbaigti darbo
                </h3>
                <p className="text-[13px] text-[#574f61] mt-1 leading-relaxed font-medium">
                  Užbaikite šiuos punktus prieš baigdami darbą:
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              {result.pendingItems.length > 0 && (
                <BlockSection
                  icon={<Circle className="w-4 h-4 text-[#6B7280]" />}
                  title={`Nepažymėti punktai (${result.pendingItems.length})`}
                  items={result.pendingItems.map((i) => i.question_text)}
                />
              )}
              {result.failedItems.length > 0 && (
                <BlockSection
                  icon={<XCircle className="w-4 h-4 text-[#EF4444]" />}
                  title={`Neatlikti punktai (${result.failedItems.length})`}
                  items={result.failedItems.map((i) => i.question_text)}
                />
              )}
              {result.missingPhotoItems.length > 0 && (
                <BlockSection
                  icon={<Camera className="w-4 h-4 text-[#D97706]" />}
                  title={`Trūksta privalomų nuotraukų (${result.missingPhotoItems.length})`}
                  items={result.missingPhotoItems.map((i) => i.question_text)}
                />
              )}
            </div>

            <button
              type="button"
              onClick={onClose}
              className="h-11 rounded-xl bg-primary text-white text-[14px] font-semibold active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-2 mt-1"
            >
              <X className="w-4 h-4" />
              Supratau
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function BlockSection({
  icon,
  title,
  items,
}: {
  icon: React.ReactNode;
  title: string;
  items: string[];
}) {
  return (
    <div className="rounded-xl border border-[#cdc3d4]/40 bg-[#f6f5fa] p-3">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <p className="text-[12px] font-bold text-[#1d033a] uppercase tracking-wider">{title}</p>
      </div>
      <ul className="flex flex-col gap-1">
        {items.map((text, i) => (
          <li key={i} className="text-[13px] text-[#39323f] font-medium leading-snug flex gap-1.5">
            <span className="text-[#cdc3d4]">•</span>
            <span>{text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
