const COLORS = [
  "bg-primary",
  "bg-accent",
  "bg-stage-offered",
  "bg-stage-interviewing",
  "bg-stage-assessment",
];

/**
 * A short burst of confetti for a new offer. Decorative only (the status
 * line says it in words), and skipped entirely under reduced motion.
 */
export function Celebration() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-0 z-50 h-0 motion-reduce:hidden"
    >
      {Array.from({ length: 24 }, (_, i) => (
        <span
          key={i}
          className={`absolute top-0 block h-3 w-2 confetti rounded-sm ${COLORS[i % COLORS.length] ?? "bg-primary"}`}
          style={{
            left: `${String((i * 37) % 100)}%`,
            animationDelay: `${String((i % 6) * 70)}ms`,
            rotate: `${String(i * 47)}deg`,
          }}
        />
      ))}
    </div>
  );
}
