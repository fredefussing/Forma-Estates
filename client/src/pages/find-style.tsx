import { useState, useCallback } from "react";
import { useLocation } from "wouter";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, ArrowRight, Check, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";

const rooms = [
  { id: "stue", name: "Stue", icon: "🛋️", roomType: "living room" },
  { id: "sovevaerelse", name: "Soveværelse", icon: "🛏️", roomType: "bedroom" },
  { id: "kokken", name: "Køkken", icon: "🍳", roomType: "kitchen" },
  { id: "badevaerelse", name: "Badeværelse", icon: "🚿", roomType: "bathroom" },
  { id: "spisestue", name: "Spisestue", icon: "🍽️", roomType: "dining room" },
  { id: "hjemmekontor", name: "Hjemmekontor", icon: "💻", roomType: "home office" },
  { id: "bornevaerelse", name: "Børneværelse", icon: "🧸", roomType: "kids room" },
  { id: "studio", name: "Studio", icon: "🎨", roomType: "studio" },
  { id: "spillerum", name: "Spillerum", icon: "🎮", roomType: "game room" },
  { id: "vaskerum", name: "Vaskerum", icon: "👕", roomType: "laundry room" },
  { id: "modelokale", name: "Mødelokale", icon: "🤝", roomType: "conference room" },
  { id: "spa", name: "Spa", icon: "🧖", roomType: "spa room" },
  { id: "udendors", name: "Udendørs", icon: "🌿", roomType: "outdoor" },
  { id: "aabent-rum", name: "Åben stue-spisestue", icon: "↔️", roomType: "open living and dining room" },
] as const;

type StyleKey = "skandinavisk" | "moderne" | "badboy" | "luksus" | "industriel" | "boheme" | "minimalistisk" | "klassisk";

interface StyleData {
  name: string;
  shortDesc: string;
  designStyle: string;
  hasImages: boolean;
  images: Record<string, string>;
  why: string;
  description: string;
  features: string[];
  priceRanges: Record<string, string>;
}

const styles: Record<StyleKey, StyleData> = {
  skandinavisk: {
    name: "Skandinavisk",
    shortDesc: "Lys, natur og hygge",
    designStyle: "scandinavian",
    hasImages: true,
    images: {
      stue: "https://jysk.dk/sites/jysk.dk/files/image/blog/2026-02/Top-FSC-R-helps-you-choose-products-made-from-responsibly-sourced-wood-February-2026.jpg",
      sovevaerelse: "https://www.ikea.com/images/et-sovevaerelse-med-en-seng-pa-et-grat-og-hvidt-taeppe-et-va-21d43aed9f5964b9448b9cf3f9a68c36.jpg?f=sg",
      kokken: "https://www.ikea.com/ext/ingkadam/m/6d8e9545e507f033/original/PH174644.jpg?f=xxxl",
      badevaerelse: "https://www.ikea.com/ext/ingkadam/m/7f502124032a1ecc/original/PH205213.jpg?f=xxxl",
      spisestue: "https://jysk.dk/sites/jysk.dk/files/styles/full_optimized/public/2025-03/3670178-GUDERUP-3640237-MARSTRAND-How-to-choose-dining-chairs-01.webp?itok=SmLqmfqc",
      hjemmekontor: "https://www.ikea.com/ext/ingkadam/m/3b660685d9fafe05/original/PH186230.jpg?f=xxl",
      bornevaerelse: "https://www.ikea.com/ext/ingkadam/m/6eeb568ce254308f/original/PH171425-crop002.jpg?f=xxl",
      studio: "https://images.unsplash.com/photo-1607570838997-65f270035031?q=80&w=927&auto=format&fit=crop",
      spillerum: "https://images.unsplash.com/photo-1598057076865-c67fefd248d3?q=80&w=1625&auto=format&fit=crop",
      vaskerum: "https://www.ikea.com/ext/ingkadam/m/55a61973ad761dda/original/PH188403.jpg?f=xxl",
      modelokale: "https://images.unsplash.com/photo-1517502884422-41eaead166d4?q=80&w=1625&auto=format&fit=crop",
      spa: "https://images.unsplash.com/photo-1693578538512-fc66f318c833?q=80&w=2232&auto=format&fit=crop",
      udendors: "https://jysk.dk/sites/jysk.dk/files/styles/full_optimized/public/2026-02/3725185-LILLEHOLM-FSC-R-helps-you-choose-products-made-from-responsibly-sourced-wood-01.webp?itok=ZD8gOhBB",
      "aabent-rum": "https://media.ilva.dk/media/44808/design-uden-navn-2025-01-23t124343112.jpg?format=webp&height=undefined&width=650&quality=80&center=0.5%2C0.5&mode=crop",
    },
    why: "Baseret på dit valg af {room}, din varme personlighed og budget på {budget}, passer Skandinavisk perfekt til dig.",
    description: "Denne stil kombinerer lyse farver, naturligt træ og funktionalitet - ideelt til et rum hvor du vil slappe af og føle dig hjemme.",
    features: [
      "Lyse, luftige rum med masser af naturligt lys",
      "Naturlige materialer som eg og hør",
      "Funktionelle møbler uden unødig dekoration",
      "Hygge-atmosfære med tekstiler og stearinlys",
    ],
    priceRanges: { "10000": "8.000-12.000 kr", "25000": "15.000-30.000 kr", "50000": "35.000-60.000 kr" },
  },
  moderne: {
    name: "Moderne",
    shortDesc: "Rent, minimalistisk, funktionelt",
    designStyle: "modern",
    hasImages: true,
    images: {
      stue: "https://images.unsplash.com/photo-1688646953306-5ec93eab8c06?q=80&w=1676&auto=format&fit=crop",
      sovevaerelse: "https://nordicdream.dk/cdn/shop/files/SengerammeNovaBoucleLattefraNordicDream.jpg?v=1740156527&width=2000",
      kokken: "https://www.svane.com/Admin/Public/GetImage.ashx?Image=/Files/Images/Svane/Koekken/S19/Massiv-raw/svane-s19-massiv-raw-b.jpg&Format=jpg&Width=825&Height=464&Compression=95&Crop=0",
      badevaerelse: "https://images.unsplash.com/photo-1733426107854-ee00a25d72a7?q=80&w=1583&auto=format&fit=crop",
      spisestue: "https://images.unsplash.com/photo-1730104231026-46e3cf7c3141?q=80&w=2232&auto=format&fit=crop",
      hjemmekontor: "https://www.ikea.com/ext/ingkadam/m/ed920a37649c62b/original/PH183205.jpg?f=xxl",
      bornevaerelse: "https://www.ikea.com/ext/ingkadam/m/26e6835bd6c348ca/original/PH163128-crop002.jpg?f=xxl",
      studio: "https://images.unsplash.com/photo-1615458509636-856366d3396e?q=80&w=987&auto=format&fit=crop",
      spillerum: "https://images.unsplash.com/photo-1616668010115-8f8ce69a4d04?q=80&w=2222&auto=format&fit=crop",
      vaskerum: "https://www.ikea.com/ext/ingkadam/m/769a410dff25ecfa/original/PH189341.jpg?f=xxl",
      modelokale: "https://images.unsplash.com/photo-1579488081757-b212dbd6ee72?q=80&w=988&auto=format&fit=crop",
      spa: "https://images.unsplash.com/photo-1672983666814-a0e43bd3b1b9?q=80&w=2070&auto=format&fit=crop",
      udendors: "https://media.ilva.dk/media/42005/2x2-dynamic-split.jpg?format=webp&height=undefined&width=650&quality=80&center=0.5%2C0.5&mode=crop",
      "aabent-rum": "https://www.ikea.com/ext/ingkadam/m/3a7be8a027ae95b9/original/PH198201.JPG?f=xxl",
    },
    why: "Dit valg af {room} og din strukturerede personlighed peger mod Moderne - en tidløs stil med fokus på rene linjer og kvalitet.",
    description: "Moderne design er perfekt når du vil have et rum der ser ud som fra et arkitekturmagasin, uden at gå på kompromis med komfort.",
    features: [
      "Rene linjer og geometriske former",
      "Neutral farvepalette med sort/hvid/grå",
      "Høj kvalitet over kvantitet",
      "Smart opbevaring og skjult teknologi",
    ],
    priceRanges: { "10000": "10.000-15.000 kr", "25000": "20.000-35.000 kr", "50000": "40.000-70.000 kr" },
  },
  badboy: {
    name: "Badboy",
    shortDesc: "Mørkt, maskulint, kant",
    designStyle: "badboy",
    hasImages: false,
    images: {},
    why: "Du har valgt {room} med en selvsikker attitude. Badboy stilen matcher din stærke personlighed.",
    description: "Mørke farver, læder og metal skaber et maskulint rum med kant. Perfekt til dig der vil have et rum der skiller sig ud.",
    features: [
      "Mørke, modige farver og materialer",
      "Læder, metal og rå overflader",
      "Statement pieces der skaber blikfang",
      "Industrielt touch med eksklusiv finish",
    ],
    priceRanges: { "10000": "10.000-15.000 kr", "25000": "20.000-35.000 kr", "50000": "40.000-70.000 kr" },
  },
  luksus: {
    name: "Luksus",
    shortDesc: "Eksklusivt, elegant, premium",
    designStyle: "luxury",
    hasImages: false,
    images: {},
    why: "Med dit budget på {budget} og ønske om det bedste, fortjener du Luksus. Her er intet overladt til tilfældighederne.",
    description: "Eksklusive materialer, designer-møbler og gennemført kvalitet. Dette er ikke bare indretning - det er en livsstil.",
    features: [
      "Eksklusive materialer som marmor og læder",
      "Designer-møbler og ikoniske lamper",
      "Gennemført detaljer på alle flader",
      "Unikke kunstværker og accessories",
    ],
    priceRanges: { "10000": "12.000-18.000 kr", "25000": "30.000-50.000 kr", "50000": "60.000-100.000+ kr" },
  },
  industriel: {
    name: "Industriel",
    shortDesc: "Råt, urbant, ægte",
    designStyle: "industrial",
    hasImages: false,
    images: {},
    why: "Dit valg af {room} viser du sætter pris på ægthed. Industriel stil bringer urban karakter ind i dit hjem.",
    description: "Rå mursten, synlige rør og upoleret træ skaber en ærlig, autentisk atmosfære med masser af karakter.",
    features: [
      "Rå materialer som beton, stål og læder",
      "Synlige installationer og strukturer",
      "Vintage og upcyclede elementer",
      "Højt til loftet og åbne rum",
    ],
    priceRanges: { "10000": "8.000-12.000 kr", "25000": "15.000-25.000 kr", "50000": "30.000-50.000 kr" },
  },
  boheme: {
    name: "Boheme",
    shortDesc: "Farverigt, personligt, kunstnerisk",
    designStyle: "coastal",
    hasImages: false,
    images: {},
    why: "Din kreative sjæl fortjener et {room} der inspirerer. Boheme stilen fejrer individualitet og kunstnerisk frihed.",
    description: "En blanding af mønstre, teksturer og farver fra hele verden. Perfekt til dig der samler på historier og souvenirs.",
    features: [
      "Rige farver og etniske mønstre",
      "Mix af vintage og håndlavede ting",
      "Overdådige tekstiler og tæpper",
      "Personlige samlinger og kunst",
    ],
    priceRanges: { "10000": "7.000-12.000 kr", "25000": "15.000-28.000 kr", "50000": "35.000-55.000 kr" },
  },
  minimalistisk: {
    name: "Minimalistisk",
    shortDesc: "Simpelt, ro, essentielt",
    designStyle: "transitional",
    hasImages: false,
    images: {},
    why: "Du har valgt {room} og viser du sætter pris på ro. Minimalisme giver plads til det der virkelig betyder noget.",
    description: "Færre ting, mere mening. Hver genstand er udvalgt med omhu. Resultatet er et rum der ånder og giver ro i sjælen.",
    features: [
      "Maksimalt 3 farver per rum",
      "Skjult opbevaring og rene overflader",
      "Kvalitet frem for kvantitet",
      "Fokus på lys og rumfornemmelse",
    ],
    priceRanges: { "10000": "8.000-12.000 kr", "25000": "18.000-28.000 kr", "50000": "35.000-50.000 kr" },
  },
  klassisk: {
    name: "Klassisk",
    shortDesc: "Tidløst, elegant, traditionelt",
    designStyle: "farmhouse",
    hasImages: false,
    images: {},
    why: "Dit valg af {room} viser du sætter pris på tradition. Klassisk stil holder evigt og bliver aldrig umoderne.",
    description: "Symmetri, kvalitet og elegante detaljer skaber et rum der føles som hjemme - både nu og om 20 år.",
    features: [
      "Symmetrisk indretning og balance",
      "Kvalitetsmøbler i mørkt træ",
      "Elegante tekstiler som silke og fløjl",
      "Tidløse farver som navy, grøn og guld",
    ],
    priceRanges: { "10000": "10.000-15.000 kr", "25000": "25.000-40.000 kr", "50000": "50.000-80.000 kr" },
  },
};

const styleEmojis: Record<StyleKey, string> = {
  skandinavisk: "🏠",
  moderne: "🏠",
  badboy: "🖤",
  luksus: "✨",
  industriel: "🏭",
  boheme: "🎨",
  minimalistisk: "○",
  klassisk: "🏛️",
};

const styleColors: Record<StyleKey, string> = {
  skandinavisk: "#95a5a6",
  moderne: "#95a5a6",
  badboy: "#2c2c2c",
  luksus: "#d4af37",
  industriel: "#5a5a5a",
  boheme: "#e74c3c",
  minimalistisk: "#ecf0f1",
  klassisk: "#34495e",
};

const budgetOptions = [
  { value: "10000", label: "10.000 kr", desc: "Budgetvenlig løsning med fokus på de vigtigste ændringer", numericValue: 10000 },
  { value: "25000", label: "25.000 kr", desc: "Balanceret løsning med plads til kvalitet og stil", numericValue: 25000 },
  { value: "50000", label: "50.000+ kr", desc: "Luksus løsning med premium materialer og møbler", numericValue: 50000 },
];

type RoomData = typeof rooms[number];

export default function FindStylePage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedRoom, setSelectedRoom] = useState<RoomData | null>(null);
  const [selectedStyle, setSelectedStyle] = useState<StyleKey | null>(null);
  const [selectedBudget, setSelectedBudget] = useState<typeof budgetOptions[number] | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [quizActive, setQuizActive] = useState(false);

  const goToStep = useCallback((step: number) => {
    setCurrentStep(step);
    setShowResult(false);
  }, []);

  const handleRoomSelect = useCallback((room: RoomData) => {
    setSelectedRoom(room);
    setTimeout(() => goToStep(2), 300);
  }, [goToStep]);

  const handleStyleSelect = useCallback((key: StyleKey) => {
    setSelectedStyle(key);
    setTimeout(() => goToStep(3), 800);
  }, [goToStep]);

  const handleBudgetSelect = useCallback((budget: typeof budgetOptions[number]) => {
    setSelectedBudget(budget);
    setTimeout(() => setShowResult(true), 600);
  }, []);

  const handleStartDesign = useCallback(() => {
    if (!selectedStyle || !selectedRoom) return;
    const style = styles[selectedStyle];
    const params = new URLSearchParams({
      roomType: selectedRoom.roomType,
      style: style.designStyle,
      budget: selectedBudget?.value || "25000",
    });
    navigate(`/design?${params.toString()}`);
  }, [selectedStyle, selectedRoom, selectedBudget, navigate]);

  const resetQuiz = useCallback(() => {
    setSelectedRoom(null);
    setSelectedStyle(null);
    setSelectedBudget(null);
    setShowResult(false);
    setCurrentStep(1);
  }, []);

  const getPreviewImage = () => {
    if (!selectedStyle || !selectedRoom) return null;
    const style = styles[selectedStyle];
    if (style.hasImages && style.images[selectedRoom.id]) {
      return style.images[selectedRoom.id];
    }
    return null;
  };

  const getResultText = () => {
    if (!selectedStyle || !selectedRoom || !selectedBudget) return "";
    const style = styles[selectedStyle];
    return style.why
      .replace("{room}", selectedRoom.name.toLowerCase())
      .replace("{budget}", selectedBudget.label);
  };

  return (
    <div className="min-h-screen" style={{ background: "#f5f5f0", color: "#2c2c2c", fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif" }}>
      <nav className="sticky top-0 z-50 bg-white shadow-sm" style={{ padding: "1rem 2rem" }}>
        <div className="max-w-[1200px] mx-auto flex justify-between items-center">
          <Link href="/">
            <span className="text-2xl font-bold text-[#1a1a1a] cursor-pointer" data-testid="link-logo">Nordic Homebuilding</span>
          </Link>
          <ul className="flex gap-8 list-none">
            <li><Link href="/"><span className="no-underline text-[#555] font-medium cursor-pointer hover:text-[#1a1a1a] transition-colors" data-testid="link-home">Forside</span></Link></li>
            <li><span className="no-underline text-[#1a1a1a] font-medium relative after:content-[''] after:absolute after:-bottom-[5px] after:left-0 after:w-full after:h-[2px] after:bg-[#1a1a1a]">Find din stil</span></li>
            <li><Link href="/pris"><span className="no-underline text-[#555] font-medium cursor-pointer hover:text-[#1a1a1a] transition-colors" data-testid="link-pricing">Pris</span></Link></li>
            <li><Link href="/design"><span className="no-underline text-[#555] font-medium cursor-pointer hover:text-[#1a1a1a] transition-colors" data-testid="link-design">Design</span></Link></li>
            <li>
              <Link href={user ? "/min-konto" : "/login"}>
                <span className="no-underline text-[#555] font-medium cursor-pointer hover:text-[#1a1a1a] transition-colors inline-flex items-center gap-1" data-testid="link-account">
                  <User className="w-3.5 h-3.5" />
                  {user ? "Min konto" : "Log ind"}
                </span>
              </Link>
            </li>
          </ul>
        </div>
      </nav>

      <section className="text-center" style={{ background: "linear-gradient(135deg, #f5f5f0 0%, #e8e8e0 100%)", padding: "4rem 2rem" }}>
        <h1 className="text-5xl font-bold text-[#1a1a1a] mb-4" data-testid="text-hero-title">Find din stil</h1>
        <p className="text-xl text-[#666] max-w-[600px] mx-auto">Upload et billede af dit rum, vælg din stil, og se dit hjem forvandles</p>
      </section>

      {!quizActive && (
        <div className="bg-white max-w-[600px] mx-auto p-8 rounded-xl text-center relative z-10 -mt-8 mb-12" style={{ boxShadow: "0 10px 40px rgba(0,0,0,0.08)" }}>
          <h3 className="text-2xl font-bold text-[#1a1a1a] mb-2" data-testid="text-quiz-teaser-title">Ikke sikker på din stil?</h3>
          <p className="text-[#666] mb-6">Tag vores hurtige 30-sekunders quiz og få en personlig anbefaling baseret på dit rum, din personlighed og dit budget. Spar tid og få resultater der passer præcis til dig.</p>
          <button
            className="bg-[#1a1a1a] text-white px-8 py-4 border-none rounded-lg text-base cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-lg"
            onClick={() => setQuizActive(true)}
            data-testid="button-start-quiz"
          >
            Find min stil →
          </button>
        </div>
      )}

      {quizActive && (
        <div className="max-w-[1200px] mx-auto p-8">
          {!showResult && (
            <div className="flex justify-center mb-12 gap-4">
              {[1, 2, 3].map((step) => (
                <div
                  key={step}
                  className="w-10 h-10 rounded-full flex items-center justify-center font-semibold text-sm"
                  style={{
                    background: step < currentStep ? "#4a4a4a" : step === currentStep ? "#1a1a1a" : "#ddd",
                    color: step <= currentStep ? "#fff" : "#666",
                  }}
                  data-testid={`progress-step-${step}`}
                >
                  {step < currentStep ? <Check className="w-4 h-4" /> : step}
                </div>
              ))}
            </div>
          )}

          <AnimatePresence mode="wait">
            {currentStep === 1 && !showResult && (
              <motion.div
                key="step1"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.4 }}
              >
                <div className="text-center mb-12">
                  <h2 className="text-4xl font-bold text-[#1a1a1a] mb-2" data-testid="text-step1-title">Hvilket rum vil du redesigne?</h2>
                  <p className="text-[#666] text-lg">Vælg det rum du ønsker at transformere</p>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {rooms.map((room) => (
                    <div
                      key={room.id}
                      onClick={() => handleRoomSelect(room)}
                      className="bg-white rounded-xl p-6 text-center cursor-pointer transition-all hover:-translate-y-1 hover:shadow-lg"
                      style={{
                        border: selectedRoom?.id === room.id ? "2px solid #1a1a1a" : "2px solid transparent",
                        boxShadow: "0 2px 10px rgba(0,0,0,0.05)",
                      }}
                      data-testid={`card-room-${room.id}`}
                    >
                      <div className="text-3xl mb-2">{room.icon}</div>
                      <div className="text-sm font-medium">{room.name}</div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {currentStep === 2 && !showResult && (
              <motion.div
                key="step2"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.4 }}
              >
                <button
                  onClick={() => goToStep(1)}
                  className="flex items-center gap-2 bg-transparent border-none text-[#666] cursor-pointer mb-4 text-sm hover:text-[#1a1a1a]"
                  data-testid="button-back-step1"
                >
                  <ArrowLeft className="w-4 h-4" /> Tilbage til rum
                </button>
                <div className="text-center mb-12">
                  <h2 className="text-4xl font-bold text-[#1a1a1a] mb-2" data-testid="text-step2-title">Hvilken stil taler til dig?</h2>
                  <p className="text-[#666] text-lg">Klik på en stil for at se den i dit valgte rum</p>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.5fr] gap-12 items-start">
                  <div className="grid grid-cols-2 gap-4">
                    {(Object.entries(styles) as [StyleKey, StyleData][]).map(([key, style]) => (
                      <div
                        key={key}
                        onClick={() => handleStyleSelect(key)}
                        className="bg-white rounded-xl overflow-hidden cursor-pointer transition-all hover:-translate-y-1 hover:shadow-lg"
                        style={{
                          border: selectedStyle === key ? "2px solid #1a1a1a" : "2px solid transparent",
                          boxShadow: selectedStyle === key ? "0 0 0 3px rgba(26,26,26,0.1)" : "0 2px 10px rgba(0,0,0,0.05)",
                        }}
                        data-testid={`card-style-${key}`}
                      >
                        {style.hasImages && selectedRoom && style.images[selectedRoom.id] ? (
                          <img src={style.images[selectedRoom.id]} alt={style.name} className="w-full h-[150px] object-cover" />
                        ) : (
                          <div
                            className="w-full h-[150px] flex items-center justify-center text-5xl"
                            style={{ background: `linear-gradient(135deg, ${styleColors[key]}40 0%, ${styleColors[key]}20 100%)` }}
                          >
                            {styleEmojis[key]}
                          </div>
                        )}
                        <div className="p-4">
                          <h4 className="text-[#1a1a1a] font-semibold mb-1">{style.name}</h4>
                          <p className="text-sm text-[#666]">{style.shortDesc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="bg-white rounded-xl p-8 sticky top-[100px]" style={{ boxShadow: "0 10px 40px rgba(0,0,0,0.08)" }}>
                    <h3 className="text-[#1a1a1a] font-semibold mb-4">Dit valg: {selectedRoom?.name || "-"}</h3>
                    {selectedStyle && getPreviewImage() ? (
                      <img src={getPreviewImage()!} alt={styles[selectedStyle].name} className="w-full h-[500px] object-cover rounded-lg mb-4" />
                    ) : selectedStyle ? (
                      <div
                        className="w-full h-[500px] rounded-lg flex flex-col items-center justify-center mb-4"
                        style={{ background: styleColors[selectedStyle], color: "white" }}
                      >
                        <span className="text-5xl mb-4">{styleEmojis[selectedStyle]}</span>
                        <span className="text-lg">{styles[selectedStyle].name}</span>
                      </div>
                    ) : (
                      <div className="w-full h-[500px] bg-[#f0f0f0] rounded-lg flex items-center justify-center text-[#999] italic mb-4">
                        Vælg en stil for at se preview
                      </div>
                    )}
                    <p className="text-[#666] italic text-sm">
                      {selectedStyle
                        ? `${styles[selectedStyle].name} stil i dit ${selectedRoom?.name.toLowerCase()} - perfekt match!`
                        : "Vælg en stil fra listen..."}
                    </p>
                  </div>
                </div>
              </motion.div>
            )}

            {currentStep === 3 && !showResult && (
              <motion.div
                key="step3"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.4 }}
              >
                <button
                  onClick={() => goToStep(2)}
                  className="flex items-center gap-2 bg-transparent border-none text-[#666] cursor-pointer mb-4 text-sm hover:text-[#1a1a1a]"
                  data-testid="button-back-step2"
                >
                  <ArrowLeft className="w-4 h-4" /> Tilbage til stil
                </button>
                <div className="text-center mb-12">
                  <h2 className="text-4xl font-bold text-[#1a1a1a] mb-2" data-testid="text-step3-title">Hvad er dit budget?</h2>
                  <p className="text-[#666] text-lg">Vælg det niveau der passer dig bedst</p>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.5fr] gap-12 items-start">
                  <div className="flex flex-col gap-4">
                    {budgetOptions.map((opt) => (
                      <div
                        key={opt.value}
                        onClick={() => handleBudgetSelect(opt)}
                        className="bg-white rounded-xl p-6 cursor-pointer transition-all flex justify-between items-center hover:border-[#1a1a1a]"
                        style={{
                          border: selectedBudget?.value === opt.value ? "2px solid #1a1a1a" : "2px solid #ddd",
                          background: selectedBudget?.value === opt.value ? "#f9f9f9" : "#fff",
                        }}
                        data-testid={`card-budget-${opt.value}`}
                      >
                        <div>
                          <div className="text-2xl font-bold text-[#1a1a1a]">{opt.label}</div>
                          <div className="text-sm text-[#666]">{opt.desc}</div>
                        </div>
                        {selectedBudget?.value === opt.value && (
                          <div className="w-8 h-8 rounded-full bg-[#1a1a1a] flex items-center justify-center">
                            <Check className="w-4 h-4 text-white" />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="bg-white rounded-xl p-8 sticky top-[100px]" style={{ boxShadow: "0 10px 40px rgba(0,0,0,0.08)" }}>
                    <h3 className="text-[#1a1a1a] font-semibold mb-4">Dit valg</h3>
                    {selectedStyle && getPreviewImage() ? (
                      <img src={getPreviewImage()!} alt="" className="w-full h-[500px] object-cover rounded-lg mb-4" />
                    ) : selectedStyle ? (
                      <div
                        className="w-full h-[500px] rounded-lg flex flex-col items-center justify-center mb-4"
                        style={{ background: styleColors[selectedStyle], color: "white" }}
                      >
                        <span className="text-3xl">{styleEmojis[selectedStyle]} {styles[selectedStyle].name}</span>
                      </div>
                    ) : (
                      <div className="w-full h-[500px] bg-[#f0f0f0] rounded-lg flex items-center justify-center text-[#999] italic mb-4">
                        Vælg budget for at fortsætte
                      </div>
                    )}
                    {selectedBudget && (
                      <p className="text-[#666]">
                        <strong>{selectedRoom?.name}</strong> + <strong>{selectedStyle ? styles[selectedStyle].name : ""}</strong> + <strong>{selectedBudget.label}</strong>
                      </p>
                    )}
                  </div>
                </div>
              </motion.div>
            )}

            {showResult && selectedStyle && selectedRoom && selectedBudget && (
              <motion.div
                key="result"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.4 }}
              >
                <div className="max-w-[800px] mx-auto bg-white rounded-2xl overflow-hidden" style={{ boxShadow: "0 20px 60px rgba(0,0,0,0.1)" }}>
                  {getPreviewImage() ? (
                    <img src={getPreviewImage()!} alt="" className="w-full h-[400px] object-cover" data-testid="img-result" />
                  ) : (
                    <div
                      className="w-full h-[400px] flex items-center justify-center text-white text-6xl"
                      style={{ background: styleColors[selectedStyle] }}
                    >
                      {styleEmojis[selectedStyle]}
                    </div>
                  )}
                  <div className="p-12">
                    <span className="inline-block bg-[#1a1a1a] text-white px-4 py-2 rounded-full text-sm mb-4" data-testid="badge-recommendation">Din personlige anbefaling</span>
                    <h2 className="text-3xl font-bold text-[#1a1a1a] mb-4" data-testid="text-result-title">
                      Vi anbefaler: {styles[selectedStyle].name}
                    </h2>
                    <p className="text-lg text-[#555] mb-8 leading-relaxed" data-testid="text-result-description">
                      {getResultText()}
                      <br /><br />
                      {styles[selectedStyle].description}
                    </p>

                    <h3 className="text-[#1a1a1a] font-semibold mb-4">Hvad du kan forvente:</h3>
                    <ul className="list-none mb-8">
                      {styles[selectedStyle].features.map((f, i) => (
                        <li key={i} className="py-2 pl-6 relative text-[#444]" data-testid={`text-feature-${i}`}>
                          <span className="absolute left-0 text-[#1a1a1a] font-bold">✓</span>
                          {f}
                        </li>
                      ))}
                    </ul>

                    <div className="bg-[#f5f5f0] p-4 rounded-lg mb-8 font-semibold text-[#1a1a1a]" data-testid="text-price">
                      Prisniveau: {styles[selectedStyle].priceRanges[selectedBudget.value]} for komplet {selectedRoom.name.toLowerCase()}
                    </div>

                    <div className="flex gap-4 flex-wrap">
                      <button
                        onClick={handleStartDesign}
                        className="bg-[#1a1a1a] text-white px-8 py-4 border-none rounded-lg text-base cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-lg flex items-center gap-2"
                        data-testid="button-start-design"
                      >
                        Start mit design <ArrowRight className="w-4 h-4" />
                      </button>
                      <button
                        onClick={resetQuiz}
                        className="bg-transparent text-[#1a1a1a] px-8 py-4 border-2 border-[#1a1a1a] rounded-lg text-base cursor-pointer transition-all hover:bg-[#1a1a1a] hover:text-white"
                        data-testid="button-reset-quiz"
                      >
                        Prøv en anden stil
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}