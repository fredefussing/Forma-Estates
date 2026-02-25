import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageCircle, X, Send } from "lucide-react";

interface Message {
  text: string;
  sender: "bot" | "user";
}

const suggestions = [
  "Sorte vægge",
  "Mørkegrøn væg",
  "Egetræsmøbler",
  "Mere naturligt lys",
  "Hyggelig stemning",
];

function generateResponse(userText: string): string {
  const text = userText.toLowerCase();
  if (text.includes("sort") || text.includes("mørk")) {
    return "Perfekt! Jeg vil sørge for at inkludere mørke elementer i dit nye design. Det vil skabe en flot kontrast til din stil.";
  }
  if (text.includes("sofa") || text.includes("stol") || text.includes("møbel")) {
    return "Jeg noterer dit ønske om specifikke møbler. Bemærk at AI'en vil generere et nyt billede med lignende møbler - din endelige indkøbsliste vil indeholde konkrete forslag inden for dit budget.";
  }
  if (text.includes("lys") || text.includes("lyst") || text.includes("hvid")) {
    return "Godt valg! Jeg vil fokusere på at skabe et lyst og åbent rum. Det passer perfekt til din valgte stil.";
  }
  if (text.includes("træ") || text.includes("eg") || text.includes("naturlig")) {
    return "Naturlige materialer er altid et hit! Jeg vil inkludere varme trætoner i designet.";
  }
  if (text.includes("behold") || text.includes("beholde")) {
    return "Forstået! Jeg vil tage højde for at bevare nogle eksisterende elementer. Husk at AI-billedet er inspiration - vi finder de rigtige produkter til dig manuelt.";
  }
  return "Spændende ønske! Jeg vil inkludere dette i dit design. Har du andre specifikke ønsker, eller er du klar til at se dit nye rum?";
}

interface CustomizeChatProps {
  preferences: string[];
  onPreferencesChange: (preferences: string[]) => void;
}

export function CustomizeChat({ preferences, onPreferencesChange }: CustomizeChatProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      text: "Hej! Fortæl mig hvad du gerne vil have i dit nye rum. Jeg kan tilføje farver, materialer og stemning - men husk at jeg laver et helt nyt billede, ikke ændrer dit eksisterende.",
      sender: "bot",
    },
  ]);
  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  const sendMessage = useCallback((text: string) => {
    if (!text.trim()) return;

    const userMsg: Message = { text: text.trim(), sender: "user" };
    setMessages((prev) => [...prev, userMsg]);
    onPreferencesChange([...preferences, text.trim()]);
    setInputValue("");
    setIsTyping(true);

    setTimeout(() => {
      setIsTyping(false);
      const response = generateResponse(text);
      setMessages((prev) => [...prev, { text: response, sender: "bot" }]);
    }, 800);
  }, [preferences, onPreferencesChange]);

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") sendMessage(inputValue);
  };

  return (
    <div className="space-y-3">
      <div className="rounded-lg border-l-4 border-l-foreground/80 border border-border/60 bg-muted/30 p-4">
        <p className="text-sm font-medium text-foreground mb-2">Hvad kan du bede om?</p>
        <ul className="text-sm text-muted-foreground space-y-0.5 ml-4 list-disc">
          <li><span className="font-medium text-foreground/80">Farver:</span> "Sorte vægge", "Mørkegrøn væg", "Hvide gulve"</li>
          <li><span className="font-medium text-foreground/80">Materialer:</span> "Læderstol", "Egetræsbord", "Marmor bordplade"</li>
          <li><span className="font-medium text-foreground/80">Stemning:</span> "Mere lys", "Hyggeligere", "Minimalistisk"</li>
        </ul>
      </div>

      <div className="rounded-lg border-l-4 border-l-amber-400 bg-amber-50 dark:bg-amber-950/20 p-3">
        <p className="text-xs text-amber-800 dark:text-amber-200 leading-relaxed">
          <span className="font-semibold">Bemærk:</span> AI'en genererer et helt nyt billede baseret på dine ønsker. Den kan <span className="font-semibold">ikke</span> kopiere specifikke møbler fra dit eksisterende rum. Ønsker du "blå sofa", laver den en ny blå sofa - ikke DIN blå sofa.
        </p>
      </div>

      <button
        onClick={() => {
          setIsOpen(!isOpen);
          if (!isOpen) setTimeout(() => inputRef.current?.focus(), 100);
        }}
        className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 border ${
          isOpen
            ? "border-foreground bg-foreground text-background"
            : "border-border/60 bg-transparent text-foreground/70 hover:border-foreground/30 hover:text-foreground"
        }`}
        data-testid="button-toggle-chat"
      >
        {isOpen ? <X className="w-4 h-4" /> : <MessageCircle className="w-4 h-4" />}
        {isOpen ? "Luk tilpasning" : "Tilføj specifikke ønsker (valgfrit)"}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="border border-border/60 rounded-xl overflow-hidden">
              <div className="h-[280px] overflow-y-auto p-4 bg-muted/20" data-testid="chat-messages">
                {messages.map((msg, i) => (
                  <div key={i} className={`mb-3 max-w-[80%] ${msg.sender === "user" ? "ml-auto text-right" : "mr-auto"}`}>
                    <div
                      className={`inline-block px-3.5 py-2.5 rounded-xl text-sm leading-relaxed ${
                        msg.sender === "bot"
                          ? "bg-foreground text-background"
                          : "bg-muted text-foreground"
                      }`}
                    >
                      {msg.text}
                    </div>
                  </div>
                ))}
                {isTyping && (
                  <div className="mb-3 mr-auto">
                    <div className="inline-flex gap-1 px-4 py-3 rounded-xl bg-foreground">
                      {[0, 1, 2].map((i) => (
                        <span
                          key={i}
                          className="w-1.5 h-1.5 rounded-full bg-background/60 animate-bounce"
                          style={{ animationDelay: `${i * 0.15}s` }}
                        />
                      ))}
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              <div className="flex flex-wrap gap-1.5 px-4 py-2.5 border-t border-border/40 bg-muted/10">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    onClick={() => sendMessage(s)}
                    className="px-3 py-1.5 rounded-full text-xs border border-border/60 bg-background text-foreground/70 hover:bg-foreground hover:text-background hover:border-foreground transition-all"
                    data-testid={`chip-${s.toLowerCase().replace(/\s+/g, "-")}`}
                  >
                    {s}
                  </button>
                ))}
              </div>

              <div className="flex gap-2 p-3 border-t border-border/40 bg-background">
                <input
                  ref={inputRef}
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyPress}
                  placeholder="Skriv dit ønske her..."
                  className="flex-1 px-3 py-2 rounded-lg border border-border/60 text-sm bg-transparent outline-none focus:border-foreground/40 transition-colors"
                  data-testid="input-chat"
                />
                <button
                  onClick={() => sendMessage(inputValue)}
                  disabled={!inputValue.trim()}
                  className="px-3.5 py-2 rounded-lg bg-foreground text-background text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-foreground/90 transition-colors flex items-center gap-1.5"
                  data-testid="button-send-chat"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {preferences.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-1">
          {preferences.map((p, i) => (
            <span
              key={i}
              className="inline-block px-2.5 py-1 rounded-full text-xs font-medium bg-foreground text-background"
              data-testid={`tag-preference-${i}`}
            >
              {p}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}