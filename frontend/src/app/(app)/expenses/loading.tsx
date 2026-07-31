import { ListSkeleton } from "@/components/feedback/Skeleton";

export default function ExpensesLoading() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="h-9 w-56 rounded-lg skeleton" />
      <ListSkeleton rows={8} />
    </div>
  );
}