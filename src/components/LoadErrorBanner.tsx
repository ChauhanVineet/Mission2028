// Shown when a page's data query fails, so a failed load is visibly
// different from genuinely having no data (an empty list looks identical
// to a broken one otherwise).
export function LoadErrorBanner({ what }: { what: string }) {
  return (
    <div className="animate-fade-in-up rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">
      Couldn&apos;t load {what}. Refresh the page to try again.
    </div>
  );
}
