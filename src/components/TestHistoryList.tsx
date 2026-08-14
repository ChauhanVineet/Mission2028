import Link from "next/link";

export type PastTest = {
  id: string;
  title: string;
  score: number;
  totalMarks: number;
  submittedAt: string;
};

function barColor(pct: number) {
  if (pct >= 75) return "from-emerald-400 to-teal-500";
  if (pct >= 50) return "from-amber-400 to-orange-500";
  return "from-rose-400 to-red-500";
}

export function TestHistoryList({ tests }: { tests: PastTest[] }) {
  if (tests.length === 0) return null;

  return (
    <div
      className="animate-fade-in-up rounded-2xl bg-white p-6 shadow-sm"
      style={{ animationDelay: "240ms" }}
    >
      <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-700">
        <span>📈</span> Past tests
      </h2>
      <div className="space-y-3">
        {tests.map((test, i) => {
          const pct = test.totalMarks > 0
            ? Math.max(0, Math.round((test.score / test.totalMarks) * 100))
            : 0;
          return (
            <Link
              key={test.id}
              href={`/review/${test.id}`}
              className="block animate-fade-in-up rounded-xl border border-slate-100 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-purple-200 hover:bg-slate-50 hover:shadow-md"
              style={{ animationDelay: `${280 + i * 60}ms` }}
            >
              <div className="mb-1.5 flex items-center justify-between">
                <p className="text-sm font-medium text-slate-900">{test.title}</p>
                <p className="text-sm font-semibold text-purple-600">
                  {test.score}/{test.totalMarks}
                </p>
              </div>
              <div className="mb-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full bg-gradient-to-r transition-all duration-700 ${barColor(pct)}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="text-[11px] text-slate-400">
                {new Date(test.submittedAt).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
