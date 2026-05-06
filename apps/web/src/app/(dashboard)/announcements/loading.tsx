export default function AnnouncementsLoading() {
  return (
    <div className="space-y-5 animate-pulse">
      <div>
        <div className="h-7 bg-surface-200 rounded-lg w-40" />
        <div className="h-4 bg-surface-100 rounded w-28 mt-2" />
      </div>
      <div className="bg-white border border-surface-200 rounded-xl p-4 shadow-card h-14" />
      <div className="bg-white border border-surface-200 rounded-xl shadow-card overflow-hidden">
        <div className="bg-surface-50 border-b border-surface-200 h-10" />
        {[...Array(8)].map((_, i) => (
          <div
            key={i}
            className="border-b border-surface-100 px-4 py-3 flex gap-4"
          >
            <div className="h-4 bg-surface-100 rounded flex-1" />
            <div className="h-4 bg-surface-100 rounded w-32" />
            <div className="h-4 bg-surface-100 rounded w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}
