import Link from "next/link";

export type PastTest = {
  id: string;
  title: string;
  score: number;
  totalMarks: number;
  submittedAt: string;
};

export function TestHistoryList({ tests }: { tests: PastTest[] }) {
  if (tests.length === 0) return null;

  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm">
      <h2 className="mb-4 text-sm font-semibold text-slate-700">Past tests</h2>
      <div className="space-y-3">
        {tests.map((test) => {
          const pct = test.totalMarks > 0
            ? Math.max(0, Math.round((test.score / test.totalMarks) * 100))
            : 0;
          return (
            <Link
              key={test.id}
              href={`/review/${test.id}`}
              className="block rounded-xl border border-slate-100 p-4 transition hover:border-slate-200 hover:bg-slate-50"
            >
              <div className="mb-1.5 flex items-center justify-between">
                <p className="text-sm font-medium text-slate-900">{test.title}</p>
                <p className="text-sm font-semibold text-indigo-600">
                  {test.score}/{test.totalMarks}
                </p>
              </div>
              <div className="mb-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-indigo-500"
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
