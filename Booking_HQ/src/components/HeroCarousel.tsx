import { useEffect, useState } from 'react';

export interface HeroSlide {
  image: string;
  title: string;
  subtitle: string;
  tag?: string;
}

interface Props {
  slides: HeroSlide[];
  intervalMs?: number;
  children?: React.ReactNode;
}

/** Auto-rotating promo banner — highlights, shows and seasonal offers behind the search bar. */
export default function HeroCarousel({ slides, intervalMs = 6000, children }: Props) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (slides.length <= 1) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % slides.length), intervalMs);
    return () => clearInterval(timer);
  }, [slides.length, intervalMs]);

  const active = slides[index];

  return (
    <section className="relative isolate flex min-h-[560px] items-center justify-center overflow-hidden sm:min-h-[640px]">
      {slides.map((slide, i) => (
        <div
          key={slide.image}
          className="absolute inset-0 bg-cover bg-center transition-opacity duration-1000"
          style={{
            backgroundImage: `linear-gradient(rgba(10,10,15,0.55), rgba(10,10,15,0.55)), url('${slide.image}')`,
            opacity: i === index ? 1 : 0,
          }}
          aria-hidden={i !== index}
        />
      ))}

      <div className="relative z-10 mx-auto w-full max-w-3xl px-6 text-center text-white">
        {active.tag && (
          <span className="mb-3 inline-block rounded-full bg-resy-red px-4 py-1 text-xs font-bold uppercase tracking-wide">
            {active.tag}
          </span>
        )}
        <h1 className="text-4xl font-extrabold tracking-tight transition-all sm:text-6xl">{active.title}</h1>
        <p className="mt-3 text-lg text-white/90 sm:text-xl">{active.subtitle}</p>
        <div className="mt-8">{children}</div>
      </div>

      {slides.length > 1 && (
        <div className="absolute bottom-6 left-1/2 z-10 flex -translate-x-1/2 gap-2">
          {slides.map((slide, i) => (
            <button
              key={slide.image}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Slide ${i + 1}`}
              aria-current={i === index}
              className={`h-2 rounded-full transition-all ${
                i === index ? 'w-8 bg-white' : 'w-2 bg-white/50 hover:bg-white/75'
              }`}
            />
          ))}
        </div>
      )}
    </section>
  );
}
