import { Spinner } from "@/components/Spinner";

export function PageLoader({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-indigo-50 via-purple-50 to-white">
      <div className="flex flex-col items-center gap-3">
        <Spinner className="h-10 w-10 text-purple-600" />
        <p className="text-sm font-medium text-slate-500">{label}</p>
      </div>
    </div>
  );
}
