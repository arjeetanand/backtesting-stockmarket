import Image from "next/image";

export default function SectionArtwork({ src, className }: { src: string; className: string }) {
  return (
    <figure className={`bt-section-art ${className}`} aria-hidden="true">
      <Image src={src} alt="" width={1536} height={1024} sizes="(max-width: 760px) 100vw, 320px" loading="lazy" unoptimized className="bt-section-art-image" />
    </figure>
  );
}
