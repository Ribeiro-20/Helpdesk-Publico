export default function ClientsLoading() {
  return (
    <div className="space-y-5 animate-pulse">
      <div>
        <div className="h-7 bg-surface-200 rounded-lg w-36" />
        <div className="h-4 bg-surface-100 rounded w-24 mt-2" />
      </div>
      <div className="h-10 bg-brand-100 rounded-xl w-36" />
      <div className="space-y-3">
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className="bg-white border border-surface-200 rounded-xl shadow-card px-5 py-4 h-24"
          />
        ))}
      </div>
    </div>
  );
}
