import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowRight, Sparkles, Eye, Palette, ShieldCheck } from "lucide-react";
import { type Design } from "@shared/schema";
import { motion } from "framer-motion";

export default function LandingPage() {
  const { data: designs = [] } = useQuery<Design[]>({
    queryKey: ["/api/designs"],
  });

  const completedDesigns = designs.filter(
    (d) => d.status === "completed" && d.resultImageUrl
  );

  const showcaseDesign = completedDesigns[0];

  return (
    <div className="min-h-screen bg-background">
      <header className="fixed top-0 left-0 right-0 z-50 bg-transparent">
        <div className="mx-auto max-w-6xl flex items-center justify-between px-6 h-16">
          <Link href="/">
            <span className="text-lg font-semibold tracking-tight cursor-pointer text-white" data-testid="link-logo">Nordic Sketch</span>
          </Link>
          <nav className="flex items-center gap-8">
            <a href="#om-os" className="text-sm text-white/70 hover:text-white transition-colors" data-testid="link-about">Om os</a>
            <Link href="/design">
              <Button size="sm" className="h-9 px-5 text-sm font-medium bg-white text-black hover:bg-white/90 rounded-full" data-testid="button-header-cta">
                Prøv nu
                <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
              </Button>
            </Link>
          </nav>
        </div>
      </header>

      <section className="relative h-screen min-h-[600px] overflow-hidden flex items-center justify-center">
        <video
          autoPlay
          muted
          loop
          playsInline
          className="absolute inset-0 w-full h-full object-cover z-0"
          data-testid="video-hero"
        >
          <source src="/videos/room-transformation.mp4" type="video/mp4" />
        </video>

        {!showcaseDesign ? null : (
          <div className="absolute inset-0 z-0">
            <div className="absolute inset-0 grid grid-cols-2">
              <div className="relative overflow-hidden">
                <img
                  src={showcaseDesign.originalImageUrl}
                  alt="Før"
                  className="absolute inset-0 w-full h-full object-cover"
                />
              </div>
              <div className="relative overflow-hidden">
                <img
                  src={showcaseDesign.resultImageUrl!}
                  alt="Efter"
                  className="absolute inset-0 w-full h-full object-cover"
                />
              </div>
            </div>
            <div className="absolute top-1/2 left-1/2 w-px h-[50%] -translate-x-1/2 -translate-y-1/2 bg-white/30 z-10" />
            <div className="absolute top-[18%] left-[25%] -translate-x-1/2 z-10">
              <span className="inline-flex items-center px-3 py-1 rounded-full text-[11px] font-medium bg-black/40 backdrop-blur-sm text-white/90 border border-white/10">Før</span>
            </div>
            <div className="absolute top-[18%] left-[75%] -translate-x-1/2 z-10">
              <span className="inline-flex items-center px-3 py-1 rounded-full text-[11px] font-medium bg-black/40 backdrop-blur-sm text-white/90 border border-white/10">Efter</span>
            </div>
          </div>
        )}

        <div className="absolute inset-0 bg-black/45 z-[1]" />

        <div className="relative z-10 text-center px-6 max-w-3xl">
          <motion.div initial={{ opacity: 0, y: 28 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: "easeOut" }}>
            <h1 className="text-4xl sm:text-5xl lg:text-[4rem] font-semibold tracking-tight mb-5 leading-[1.08] text-white" style={{ fontFamily: '"Playfair Display", serif' }}>
              Transformer dit hjem<br />med AI
            </h1>
            <p className="text-white/80 text-base sm:text-lg leading-relaxed max-w-lg mx-auto mb-10">
              Se dit rum redesignet på sekunder. Fra idé til virkelighed.
            </p>
            <Link href="/design">
              <Button size="lg" className="h-14 px-10 text-base font-medium rounded-full bg-white text-black hover:bg-white/90 shadow-xl" data-testid="button-hero-cta">
                Start dit design
                <ArrowRight className="w-4 h-4 ml-2.5" />
              </Button>
            </Link>
          </motion.div>
        </div>

        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10">
          <motion.div
            animate={{ y: [0, 6, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            className="w-5 h-8 rounded-full border-2 border-white/30 flex items-start justify-center pt-1.5"
          >
            <div className="w-1 h-1.5 rounded-full bg-white/60" />
          </motion.div>
        </div>
      </section>

      <section className="py-24 sm:py-32 px-6">
        <div className="mx-auto max-w-5xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.5 }}
            className="text-center mb-16"
          >
            <p className="text-xs tracking-widest uppercase text-muted-foreground font-medium mb-4">Sådan virker det</p>
            <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight max-w-xl mx-auto">
              Fra foto til færdigt design på under et minut
            </h2>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
            {[
              {
                icon: Eye,
                step: "01",
                title: "Upload dit rum",
                desc: "Tag et foto af det rum du vil redesigne. Vores AI analyserer rummets struktur, lys og proportioner.",
              },
              {
                icon: Palette,
                step: "02",
                title: "Vælg stil og budget",
                desc: "Vælg mellem 8 designstile og angiv dit budget. Vi tilpasser forslaget med danske forhandlere og produkter.",
              },
              {
                icon: Sparkles,
                step: "03",
                title: "Se dit nye rum",
                desc: "På få sekunder genererer vores AI et realistisk designforslag, der bevarer rummets struktur med ny indretning.",
              },
            ].map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
                className="relative p-8 rounded-2xl border border-border/50 bg-card/30"
                data-testid={`card-feature-${i}`}
              >
                <span className="text-xs font-medium text-muted-foreground/50 tracking-wider">{item.step}</span>
                <div className="w-10 h-10 rounded-xl bg-foreground/[0.04] flex items-center justify-center mt-4 mb-5">
                  <item.icon className="w-5 h-5 text-foreground/60" />
                </div>
                <h3 className="text-lg font-medium mb-2">{item.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {showcaseDesign && (
        <section className="py-24 sm:py-32 px-6 bg-[#1a1a1a] text-white">
          <div className="mx-auto max-w-5xl">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.5 }}
              className="text-center mb-12"
            >
              <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight" style={{ fontFamily: '"Playfair Display", serif' }}>
                Fra drøm til virkelighed
              </h2>
              <p className="text-white/60 text-sm mt-3">Se forskellen med AI-genereret interiørdesign</p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="grid grid-cols-2 gap-4 rounded-2xl overflow-hidden max-w-4xl mx-auto"
            >
              <div className="relative aspect-[4/3] overflow-hidden rounded-xl">
                <img src={showcaseDesign.originalImageUrl} alt="Før" className="w-full h-full object-cover" />
                <div className="absolute bottom-3 left-3">
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-[11px] font-medium bg-black/50 backdrop-blur-sm text-white/90">Før</span>
                </div>
              </div>
              <div className="relative aspect-[4/3] overflow-hidden rounded-xl">
                <img src={showcaseDesign.resultImageUrl!} alt="Efter" className="w-full h-full object-cover" />
                <div className="absolute bottom-3 left-3">
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-[11px] font-medium bg-black/50 backdrop-blur-sm text-white/90">Efter</span>
                </div>
              </div>
            </motion.div>

            <div className="text-center mt-10">
              <Link href="/design">
                <Button size="lg" className="h-12 px-8 text-sm font-medium rounded-full bg-white text-black hover:bg-white/90" data-testid="button-showcase-cta">
                  Prøv med dit eget rum
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </Link>
            </div>
          </div>
        </section>
      )}

      <section id="om-os" className="py-24 sm:py-32 px-6 border-t border-border/40">
        <div className="mx-auto max-w-4xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.5 }}
          >
            <p className="text-xs tracking-widest uppercase text-muted-foreground font-medium mb-4 text-center">Om Nordic Sketch</p>
            <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight mb-6 text-center">
              Vi brænder for at gøre idéer konkrete
            </h2>

            <div className="max-w-2xl mx-auto space-y-5 mt-10">
              <p className="text-muted-foreground text-base sm:text-[17px] leading-relaxed">
                Alt for længe har boligforbedringer og renoveringer været baseret på forestillingsevne, usikkerhed og løse visualiseringer. Vores mål er at bygge bro mellem det visuelle og det virkelige — så du ikke kun kan se potentialet i en bolig, men også forstå, hvordan det kan realiseres.
              </p>
              <p className="text-muted-foreground text-base sm:text-[17px] leading-relaxed">
                Med vores AI-platform kan du uploade et billede, vælge stil og niveau, og få realistiske før/efter-visualiseringer, der ikke blot inspirerer, men kan danne grundlag for faktiske beslutninger.
              </p>
              <p className="text-muted-foreground text-base sm:text-[17px] leading-relaxed">
                Vi tror på gennemsigtighed, kvalitet og løsninger, der skaber reel værdi — både for boligejere, investorer og samarbejdspartnere.
              </p>
            </div>

            <div className="flex justify-center mt-14">
              <div className="text-center">
                <div className="w-16 h-16 rounded-full bg-foreground/[0.05] flex items-center justify-center mx-auto mb-4">
                  <span className="text-lg font-semibold text-foreground/60">FF</span>
                </div>
                <p className="text-base font-medium">Frederik Fussing Nielsen</p>
                <p className="text-sm text-muted-foreground mt-0.5">Stifter & CEO</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mt-20 text-left">
              {[
                {
                  icon: ShieldCheck,
                  title: "Realistiske forslag",
                  desc: "AI'en bevarer vægge, vinduer og rummets proportioner — kun indretningen ændres.",
                },
                {
                  icon: Palette,
                  title: "8 designstile",
                  desc: "Fra skandinavisk minimalisme til moderne luksus. Alle tilpasset tre budgetniveauer.",
                },
                {
                  icon: Sparkles,
                  title: "Danske anbefalinger",
                  desc: "Produktforslag fra velkendte danske forhandlere, tilpasset din valgte stil og budget.",
                },
              ].map((item, i) => (
                <div key={i} className="p-6 rounded-xl border border-border/40 bg-card/20" data-testid={`card-about-${i}`}>
                  <item.icon className="w-5 h-5 text-foreground/50 mb-3" />
                  <h3 className="text-sm font-medium mb-1.5">{item.title}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      <section className="py-20 px-6 border-t border-border/40">
        <div className="mx-auto max-w-2xl text-center">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.5 }}
          >
            <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight mb-4">
              Klar til at transformere dit rum?
            </h2>
            <p className="text-muted-foreground text-sm mb-8">
              Det tager under et minut at få dit personlige designforslag.
            </p>
            <Link href="/design">
              <Button size="lg" className="h-12 px-8 text-sm font-medium rounded-full" data-testid="button-bottom-cta">
                Kom i gang
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
          </motion.div>
        </div>
      </section>

      <footer className="border-t border-border/40 py-8 px-6">
        <div className="mx-auto max-w-6xl flex items-center justify-between">
          <span className="text-sm text-muted-foreground/60">© 2026 Nordic Sketch</span>
          <span className="text-xs text-muted-foreground/40">AI-drevet interiørdesign</span>
        </div>
      </footer>
    </div>
  );
}
