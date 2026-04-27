import Image from "next/image";

interface LandingHeroProps {
  /** Public asset path to the hero image. Falls back to a teal gradient when missing. */
  imageSrc: string;
  hasImage: boolean;
}

/**
 * Brand landing hero — full-bleed inspiration image with a glass overlay
 * carrying the headline and subline. Phase 3.7 visual rebuild.
 */
export default function LandingHero({ imageSrc, hasImage }: LandingHeroProps) {
  return (
    <section
      className="relative isolate w-full overflow-hidden"
      aria-labelledby="svika-hero-headline"
      style={{ minHeight: "62vh" }}
    >
      <div className="absolute inset-0 svika-animate-image-fade">
        {hasImage ? (
          <Image
            src={imageSrc}
            alt=""
            fill
            priority
            sizes="100vw"
            style={{ objectFit: "cover" }}
          />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-svika-teal-700 via-svika-teal-800 to-svika-teal-900" />
        )}
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, rgba(15,76,92,0) 35%, rgba(15,76,92,0.18) 70%, rgba(250,250,249,0.7) 100%)",
          }}
        />
      </div>

      <div className="relative z-10 flex h-full min-h-[62vh] flex-col px-5 pb-8 pt-8">
        <header className="flex items-baseline justify-between">
          <h1
            className="text-svika-teal"
            style={{
              fontSize: "28px",
              fontWeight: 600,
              letterSpacing: "-0.5px",
              lineHeight: 1,
            }}
          >
            Svika
          </h1>
          <p className="text-[11px] font-medium uppercase tracking-[0.5px] text-svika-mute">
            the kombi network in your pocket
          </p>
        </header>

        <div className="mt-auto svika-animate-glass-rise">
          <div className="svika-glass-strong px-5 py-5">
            <h2
              id="svika-hero-headline"
              className="text-svika-teal"
              style={{
                fontSize: "28px",
                fontWeight: 600,
                letterSpacing: "-0.4px",
                lineHeight: 1.15,
              }}
            >
              Where every kombi is one tap away
            </h2>
            <p
              className="mt-2 text-svika-mute"
              style={{ fontSize: "14px", lineHeight: 1.5 }}
            >
              Plan it. Pay it. Board it. Send it. Same kombi.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
