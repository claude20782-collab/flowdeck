"use client";

/**
 * Shimmer placeholder shown while a lazy widget chunk loads.
 * Mirrors the WidgetCard silhouette so the dashboard doesn't reflow.
 */
export function WidgetSkeleton() {
  return (
    <div className="widget overflow-hidden p-4" aria-hidden="true">
      <div className="flex items-center gap-2">
        <div className="fd-skeleton h-4 w-4 rounded-md" />
        <div className="fd-skeleton h-3.5 w-24 rounded-md" />
      </div>
      <div className="mt-3 space-y-2">
        <div className="fd-skeleton h-3 w-3/4 rounded-md" />
        <div className="fd-skeleton h-3 w-1/2 rounded-md" />
      </div>
      <div className="fd-skeleton mt-4 h-16 w-full rounded-xl" />
    </div>
  );
}
