export default function ThinkingMascot({
  size = "small",
  animate = false,
}: {
  size?: "small" | "medium";
  animate?: boolean;
}) {
  const dimension = size === "small" ? 32 : 40;

  return (
    <span className={`bt-thinking-mascot bt-thinking-mascot-${size}${animate ? " is-thinking" : ""}`} aria-hidden="true">
      <svg className="bt-thinking-mascot-icon" width={dimension} height={dimension} viewBox="0 0 40 40" fill="none">
        <circle cx="20" cy="20" r="19" fill="#E8EAF7" />
        <path d="M9 9.5a3.5 3.5 0 0 1 3.5-3.5H31v27H12.5A3.5 3.5 0 0 1 9 29.5v-20Z" fill="#FFFEF8" stroke="#1B214A" strokeWidth="1.8" />
        <path d="M9 10h5v23h-1.5A3.5 3.5 0 0 1 9 29.5v-19.5Z" fill="#C4B8F7" stroke="#1B214A" strokeWidth="1.6" />
        <path d="M23 6v7l3-2 3 2V6" fill="#6C63B7" stroke="#1B214A" strokeWidth="1.4" strokeLinejoin="round" />
        <circle cx="20" cy="20" r="1.25" fill="#1B214A" />
        <circle cx="26" cy="20" r="1.25" fill="#1B214A" />
        <path d="M20.5 24c1.4 1.5 3.6 1.5 5 0" stroke="#1B214A" strokeWidth="1.6" strokeLinecap="round" />
        <circle cx="18" cy="22.5" r="1" fill="#D4C5FB" />
        <circle cx="28" cy="22.5" r="1" fill="#D4C5FB" />
      </svg>
      {animate ? <span className="bt-thinking-mascot-thought"><i /><i /><i /></span> : null}
    </span>
  );
}
