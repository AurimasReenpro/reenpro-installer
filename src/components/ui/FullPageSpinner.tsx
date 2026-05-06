export default function FullPageSpinner() {
  return (
    <div className="min-h-screen bg-app-bg flex items-center justify-center p-4">
      <span
        className="material-symbols-outlined animate-spin"
        style={{ color: 'var(--color-primary, #490891)', fontSize: '48px' }}
      >
        progress_activity
      </span>
    </div>
  );
}
