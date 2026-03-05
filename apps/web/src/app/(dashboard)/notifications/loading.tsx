export default function NotificationsLoading() {
  return (
    <div className="space-y-5 animate-pulse">
      <div>
        <div className="h-7 bg-surface-200 rounded-lg w-44" />
        <div className="h-4 bg-surface-100 rounded w-32 mt-2" />
      </div>
      <div className="flex gap-2">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-8 bg-surface-100 rounded-xl w-20" />
        ))}
      </div>
      <div className="bg-white border border-surface-200 rounded-xl shadow-card overflow-hidden">
        <div className="bg-surface-50 border-b border-surface-200 h-10" />
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            className="border-b border-surface-100 px-4 py-3 flex gap-4"
          >
            <div className="h-4 bg-surface-100 rounded w-32" />
            <div className="h-4 bg-surface-100 rounded flex-1" />
            <div className="h-4 bg-surface-100 rounded w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}
