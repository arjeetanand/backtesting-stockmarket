import Image from "next/image";

export default function ThinkingMascot({
  size = "small",
  animate = false,
}: {
  size?: "small" | "medium";
  animate?: boolean;
}) {
  return (
    <span className={`bt-thinking-mascot bt-thinking-mascot-${size}${animate ? " is-thinking" : ""}`} aria-hidden="true">
      <span className="bt-thinking-mascot-art">
        <Image
          src="/illustrations/research-notebook-mascot.webp"
          alt=""
          fill
          sizes={size === "small" ? "32px" : "40px"}
          className="bt-thinking-mascot-image"
        />
      </span>
      {animate ? <span className="bt-thinking-mascot-thought"><i /><i /><i /></span> : null}
    </span>
  );
}
