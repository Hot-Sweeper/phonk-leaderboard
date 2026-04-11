type SkeletonProps = {
  className?: string;
};

export function Skeleton({ className = "" }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded-xl bg-[color:color-mix(in_srgb,var(--muted)_82%,transparent)] ${className}`}
    />
  );
}