import { Loader2 } from 'lucide-react';

export default function FullPageSpinner() {
  return (
    <div className="min-h-screen bg-app-bg flex items-center justify-center p-4">
      <Loader2
        className="animate-spin text-primary"
        size={48}
      />
    </div>
  );
}
