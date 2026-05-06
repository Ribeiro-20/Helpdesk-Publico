export default function DashboardLoading() {
  return (
    <div className="space-y-5 animate-pulse">
      <div>
        <div className="h-7 bg-surface-200 rounded-lg w-48" />
        <div className="h-4 bg-surface-100 rounded w-32 mt-2" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[...Array(3)].map((_, i) => (
          <div
            key={i}
            className="bg-white border border-surface-200 rounded-xl p-5 shadow-card h-28"
          />
        ))}
      </div>
      <div className="bg-white border border-surface-200 rounded-xl shadow-card h-64" />
    </div>
  );
}
