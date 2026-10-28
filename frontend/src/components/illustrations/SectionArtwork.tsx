import Image from "next/image";

export default function SectionArtwork({ src, className }: { src: string; className: string }) {
  return (
    <span className={`${className} is-thinking`} aria-hidden="true">
      <Image src={src} alt="" width={1536} height={1024} sizes="160px" loading="eager" unoptimized className="bt-section-art-image" />
      <span className="bt-section-art-thought"><i /><i /><i /></span>
    </span>
  );
}
