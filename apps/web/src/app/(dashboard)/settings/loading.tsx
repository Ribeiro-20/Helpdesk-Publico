export default function SettingsLoading() {
  return (
    <div className="space-y-5 animate-pulse">
      <div>
        <div className="h-7 bg-surface-200 rounded-lg w-40" />
        <div className="h-4 bg-surface-100 rounded w-32 mt-2" />
      </div>
      <div className="bg-white border border-surface-200 rounded-xl shadow-card p-5 h-48" />
      <div className="bg-white border border-surface-200 rounded-xl shadow-card p-5 h-32" />
    </div>
  );
}
