export default function AnnouncementDetailLoading() {
  return (
    <div className="space-y-6 max-w-4xl animate-pulse">
      <div className="flex items-start gap-4">
        <div className="h-4 bg-surface-100 rounded w-20" />
        <div className="flex-1 space-y-2">
          <div className="h-6 bg-surface-200 rounded-lg w-3/4" />
          <div className="h-4 bg-surface-100 rounded w-40" />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className="bg-white border border-surface-200 rounded-xl p-5 shadow-card h-40"
          />
        ))}
      </div>
    </div>
  );
}
