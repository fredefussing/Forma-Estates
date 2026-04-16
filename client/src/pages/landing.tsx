import { Link } from "wouter";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowRight, Sparkles, Eye, Palette, ShieldCheck, Flame, User, Menu, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { RotatingStats } from "@/components/rotating-stats";
import { BeforeAfterSlider } from "@/components/before-after-slider";
import { HeroSlider } from "@/components/hero-slider";
import { useAuth } from "@/hooks/use-auth";
import heroBg from "@assets/Skærmbillede_2026-04-16_kl._20.57.33_1776365857685.png";

export default function LandingPage() {
  const { user } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <header className="fixed top-0 left-0 right-0 z-50 bg-[#FAF9F7]/95 backdrop-blur-sm border-b border-black/[0.06]">
        <div className="mx-auto max-w-6xl flex items-center justify-between px-6 h-16">
          <Link href="/">
            <span className="text-lg font-semibold tracking-tight cursor-pointer text-[#1A1A1A]" data-testid="link-logo">Nordic Homebuild</span>
          </Link>

          {/* ── DESKTOP NAV ── */}
          <nav className="hidden md:flex items-center gap-8">
            <Link href="/find-stil">
              <span className="text-sm text-[#1A1A1A]/60 hover:text-[#1A1A1A] transition-colors cursor-pointer" data-testid="link-find-style">Find din stil</span>
            </Link>
            {user && (
              <Link href="/mine-designs">
                <span className="text-sm text-[#1A1A1A]/60 hover:text-[#1A1A1A] transition-colors cursor-pointer" data-testid="link-my-designs">Mine designs</span>
              </Link>
            )}
            <Link href="/ai-design-agent">
              <span className="text-sm text-[#1A1A1A]/60 hover:text-[#1A1A1A] transition-colors cursor-pointer" data-testid="link-ai-agent">AI Design Agent</span>
            </Link>
            <Link href="/trending">
              <span className="text-sm text-orange-500 hover:text-orange-600 transition-colors cursor-pointer inline-flex items-center gap-1 font-medium" data-testid="link-trending">
                <Flame className="w-3.5 h-3.5" />
                Trending
              </span>
            </Link>
            <Link href="/pris">
              <span className="text-sm text-[#1A1A1A]/60 hover:text-[#1A1A1A] transition-colors cursor-pointer" data-testid="link-pricing">Pris</span>
            </Link>
            <a href="#om-os" className="text-sm text-[#1A1A1A]/60 hover:text-[#1A1A1A] transition-colors" data-testid="link-about">Om os</a>
            <Link href={user ? "/min-konto" : "/login"}>
              <span className="text-sm text-[#1A1A1A]/60 hover:text-[#1A1A1A] transition-colors cursor-pointer inline-flex items-center gap-1" data-testid="link-account">
                <User className="w-3.5 h-3.5" />
                {user ? "Min konto" : "Log ind"}
              </span>
            </Link>
            <Link href="/design">
              <Button size="sm" className="h-9 px-5 text-sm font-semibold bg-[#1A1A1A] text-white hover:bg-[#1A1A1A]/85 rounded-full shadow-sm" data-testid="button-header-cta">
                Prøv nu
                <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
              </Button>
            </Link>
          </nav>

          {/* ── MOBIL NAV ── */}
          <nav className="flex md:hidden items-center gap-5">
            <Link href="/find-stil">
              <span className="text-sm text-[#1A1A1A]/70 hover:text-[#1A1A1A] transition-colors cursor-pointer" data-testid="link-find-style-mobile">Find din stil</span>
            </Link>
            <Link href="/ai-design-agent">
              <span className="text-sm text-[#1A1A1A]/70 hover:text-[#1A1A1A] transition-colors cursor-pointer" data-testid="link-ai-agent-mobile">AI Agent</span>
            </Link>
            <Link href={user ? "/min-konto" : "/login"}>
              <span className="text-sm text-[#1A1A1A]/70 hover:text-[#1A1A1A] transition-colors cursor-pointer" data-testid="link-account-mobile">
                {user ? "Min konto" : "Login / Opret"}
              </span>
            </Link>
            <button
              onClick={() => setMobileMenuOpen((o) => !o)}
              className="text-[#1A1A1A]/70 hover:text-[#1A1A1A] transition-colors p-1"
              data-testid="button-hamburger"
              aria-label="Menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </nav>
        </div>

        {/* ── MOBIL DROPDOWN MENU ── */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
              className="md:hidden absolute top-16 left-0 right-0 bg-[#FAF9F7] border-t border-black/[0.08] px-6 py-5 flex flex-col gap-4 shadow-lg"
              data-testid="mobile-menu"
            >
              {user && (
                <Link href="/mine-designs" onClick={() => setMobileMenuOpen(false)}>
                  <span className="text-sm text-[#1A1A1A]/70 hover:text-[#1A1A1A] transition-colors cursor-pointer block" data-testid="link-my-designs-mobile">Mine designs</span>
                </Link>
              )}
              <Link href="/pris" onClick={() => setMobileMenuOpen(false)}>
                <span className="text-sm text-[#1A1A1A]/70 hover:text-[#1A1A1A] transition-colors cursor-pointer block" data-testid="link-pricing-mobile">Pris</span>
              </Link>
              <a href="#om-os" onClick={() => setMobileMenuOpen(false)} className="text-sm text-[#1A1A1A]/70 hover:text-[#1A1A1A] transition-colors block" data-testid="link-about-mobile">Om os</a>
              <Link href="/trending" onClick={() => setMobileMenuOpen(false)}>
                <span className="text-sm text-orange-500 hover:text-orange-600 transition-colors cursor-pointer inline-flex items-center gap-1.5 font-medium" data-testid="link-trending-mobile">
                  <Flame className="w-3.5 h-3.5" />
                  Trending
                </span>
              </Link>
              <div className="pt-1 border-t border-black/[0.08]">
                <Link href="/design" onClick={() => setMobileMenuOpen(false)}>
                  <Button size="sm" className="w-full h-10 text-sm font-semibold bg-[#1A1A1A] text-white hover:bg-[#1A1A1A]/85 rounded-full" data-testid="button-mobile-menu-cta">
                    Prøv nu
                    <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                  </Button>
                </Link>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* ── HERO ── */}
      <section className="relative pt-16 overflow-hidden" data-testid="hero-section">
        {/* Background image */}
        <img
          src={heroBg}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-cover object-center pointer-events-none"
          style={{ zIndex: 0 }}
        />
        {/* Warm beige overlay — keeps text & polaroid images readable */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: "rgba(230, 223, 212, 0.70)", zIndex: 1 }}
        />

        <div className="relative max-w-6xl mx-auto px-4 sm:px-6" style={{ zIndex: 2 }}>

          {/* Billeder */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="pt-4 sm:pt-6 pb-3"
          >
            <HeroSlider />
          </motion.div>

          {/* Overskrift */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.65, delay: 0.2, ease: "easeOut" }}
            className="text-center pb-2"
          >
            <h1
              className="text-[1.75rem] sm:text-[2.5rem] lg:text-[2.75rem] font-semibold leading-[1.1] text-[#1A1A1A]"
              style={{ fontFamily: '"Playfair Display", Georgia, serif', letterSpacing: "-0.02em" }}
            >
              Se dit nye rum med møbler,<br className="hidden sm:block" /> der passer til dit budget
            </h1>
            <p className="mt-2 text-[14px] sm:text-[16px] leading-relaxed" style={{ color: "#5C5C5C" }}>
              AI redesigner dit rum på 30 sekunder
            </p>
          </motion.div>

          {/* CTA */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4, ease: "easeOut" }}
            className="text-center pt-3 pb-5 sm:pb-8"
          >
            <Link href="/design">
              <button
                className="group inline-flex items-center gap-2 font-semibold text-white rounded-full transition-all duration-300"
                style={{
                  background: "#1A1A1A",
                  padding: "18px 48px",
                  fontSize: "17px",
                  letterSpacing: "-0.01em",
                  boxShadow: "0 4px 6px rgba(26,26,26,0.1), 0 10px 20px rgba(26,26,26,0.15)",
                }}
                onMouseEnter={(e) => {
                  const el = e.currentTarget as HTMLButtonElement;
                  el.style.transform = "translateY(-3px)";
                  el.style.boxShadow = "0 8px 12px rgba(26,26,26,0.15), 0 20px 40px rgba(26,26,26,0.2)";
                }}
                onMouseLeave={(e) => {
                  const el = e.currentTarget as HTMLButtonElement;
                  el.style.transform = "translateY(0)";
                  el.style.boxShadow = "0 4px 6px rgba(26,26,26,0.1), 0 10px 20px rgba(26,26,26,0.15)";
                }}
                data-testid="button-hero-cta"
              >
                Start dit design
                <ArrowRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1" />
              </button>
            </Link>

            <div className="flex items-center justify-center gap-2 mt-3">
              <span className="text-sm" style={{ color: "#F5A623" }}>★★★★★</span>
              <span className="text-[13px] font-medium" style={{ color: "#5C5C5C" }}>4.8 stjerner</span>
              <span className="text-xs mx-1" style={{ color: "rgba(92,92,92,0.3)" }}>·</span>
              <a
                href="#se-eksempler"
                className="text-[13px] transition-colors"
                style={{ color: "#8B8B8B" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = "#1A1A1A"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = "#8B8B8B"; }}
                data-testid="button-hero-secondary"
              >
                Se eksempler ↓
              </a>
            </div>
          </motion.div>
        </div>
      </section>

      <section className="py-10 px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.5 }}
          className="mx-auto max-w-xl"
        >
          <div className="bg-card border border-border/50 rounded-2xl p-5 md:p-8 text-center shadow-sm">
            <h3 className="text-base md:text-xl font-semibold tracking-tight mb-1 md:mb-2">Ikke sikker på din stil?</h3>
            <p className="text-xs md:text-sm text-muted-foreground mb-4 md:mb-6">
              Tag vores hurtige 30-sekunders quiz og få en personlig anbefaling baseret på dit rum og budget.
            </p>
            <Link href="/find-stil">
              <Button variant="outline" size="lg" className="h-10 md:h-12 px-6 md:px-8 text-sm font-medium rounded-full" data-testid="button-quiz-cta">
                Find min stil
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
          </div>
        </motion.div>
      </section>

      <section className="py-14 sm:py-20 px-6">
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

      <section id="se-eksempler" className="py-14 sm:py-20 px-6 border-t border-border/40">
        <div className="mx-auto max-w-3xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.5 }}
          >
            <div className="text-center mb-12">
              <p className="text-xs tracking-widest uppercase text-muted-foreground font-medium mb-4">Resultat</p>
              <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight" data-testid="text-before-after-title">Se forvandlingen</h2>
              <p className="text-muted-foreground mt-3 text-base" data-testid="text-before-after-subtitle">Fra dit nuværende rum til dit drømmerum</p>
            </div>

            <div className="rounded-2xl overflow-hidden border border-border/50 shadow-lg" data-testid="before-after-landing">
              <BeforeAfterSlider
                beforeSrc="/after.jpg"
                afterSrc="/before.jpg"
              />
            </div>

            <div className="text-center mt-10">
              <p className="text-sm text-muted-foreground mb-6" data-testid="text-before-after-cta-desc">Upload et billede, vælg din stil, og se magien ske</p>
              <Link href="/opret">
                <Button size="lg" className="h-12 px-8 text-sm font-medium rounded-full" data-testid="button-before-after-cta">
                  Prøv gratis
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      <section id="om-os" className="py-14 sm:py-20 px-6 border-t border-border/40">
        <div className="mx-auto max-w-4xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.5 }}
          >
            <p className="text-xs tracking-widest uppercase text-muted-foreground font-medium mb-4 text-center">Om Nordic Homebuild</p>
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

      <section className="py-14 px-6 border-t border-border/40">
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
          <span className="text-sm text-muted-foreground/60">© 2026 Nordic Homebuild</span>
          <span className="text-xs text-muted-foreground/40">AI-drevet interiørdesign</span>
        </div>
      </footer>
    </div>
  );
}
