import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowRight, Sparkles, Eye, Palette, ShieldCheck, Flame } from "lucide-react";
import { motion } from "framer-motion";
import { RotatingStats } from "@/components/rotating-stats";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="fixed top-0 left-0 right-0 z-50 bg-transparent">
        <div className="mx-auto max-w-6xl flex items-center justify-between px-6 h-16">
          <Link href="/">
            <span className="text-lg font-semibold tracking-tight cursor-pointer text-white" data-testid="link-logo">Nordic Sketch</span>
          </Link>
          <nav className="flex items-center gap-8">
            <Link href="/find-stil">
              <span className="text-sm text-white/70 hover:text-white transition-colors cursor-pointer" data-testid="link-find-style">Find din stil</span>
            </Link>
            <Link href="/trending">
              <span className="text-sm text-orange-400 hover:text-orange-300 transition-colors cursor-pointer inline-flex items-center gap-1 font-medium" data-testid="link-trending">
                <Flame className="w-3.5 h-3.5" />
                Trending
              </span>
            </Link>
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
        <img
          src="/images/hero-bg.jpg"
          alt="Nordic interior design"
          className="absolute inset-0 w-full h-full object-cover z-0"
          data-testid="img-hero"
        />

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

      <section className="py-16 px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.5 }}
          className="mx-auto max-w-xl"
        >
          <div className="bg-card border border-border/50 rounded-2xl p-8 text-center shadow-sm">
            <h3 className="text-xl font-semibold tracking-tight mb-2">Ikke sikker på din stil?</h3>
            <p className="text-sm text-muted-foreground mb-6">
              Tag vores hurtige 30-sekunders quiz og få en personlig anbefaling baseret på dit rum og budget.
            </p>
            <Link href="/find-stil">
              <Button variant="outline" size="lg" className="h-12 px-8 text-sm font-medium rounded-full" data-testid="button-quiz-cta">
                Find min stil
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
          </div>
        </motion.div>
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

      <RotatingStats />

      <Link href="/find-stil">
        <div
          className="fixed bottom-[30px] left-[30px] z-[99] bg-white text-[#1a1a1a] rounded-xl px-[1.2rem] py-[0.8rem] cursor-pointer flex items-center gap-2 border border-[#eee] hover:-translate-y-1 transition-all"
          style={{ boxShadow: "0 4px 20px rgba(0,0,0,0.1)" }}
          data-testid="button-floating-quiz"
        >
          <div className="flex flex-col leading-tight">
            <span className="text-[0.9rem] font-semibold">I tvivl om din stil?</span>
            <span className="text-[0.8rem] text-[#666]">Tag testen på 20 sekunder →</span>
          </div>
        </div>
      </Link>

      <footer className="border-t border-border/40 py-8 px-6">
        <div className="mx-auto max-w-6xl flex items-center justify-between">
          <span className="text-sm text-muted-foreground/60">© 2026 Nordic Sketch</span>
          <span className="text-xs text-muted-foreground/40">AI-drevet interiørdesign</span>
        </div>
      </footer>
    </div>
  );
}
