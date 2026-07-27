import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Send, MessageCircle, Sparkles } from "lucide-react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const QUICK_QUESTIONS = [
  "Hvem passer Forma Estates til?",
  "Hvad koster det?",
  "Hvordan virker AI-designet?",
  "Hvad er BoligPotentiale?",
];

const C = {
  navy: "#0F1923",
  navyDeep: "#0A1219",
  gold: "#C9A96E",
  goldLight: "rgba(201, 169, 110, 0.15)",
  goldBorder: "rgba(201, 169, 110, 0.30)",
  white: "#FFFFFF",
  muted: "rgba(255,255,255,0.55)",
  inputBg: "rgba(255,255,255,0.06)",
  bubble: "rgba(255,255,255,0.08)",
};

export function SupportChat() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "Hej! Jeg er Forma Estates' AI-chatbot — er der noget vi kan hjælpe med? Spørg mig fx om priser, designstile eller hvordan du kommer i gang.",
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [hasNewMessage, setHasNewMessage] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      setTimeout(() => inputRef.current?.focus(), 150);
      setHasNewMessage(false);
    }
  }, [messages, isOpen]);

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;

    const userMsg: Message = { role: "user", content: trimmed };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput("");
    setIsLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages }),
      });
      const data = await res.json();
      const reply = data.reply ?? data.error ?? "Beklager, noget gik galt. Prøv igen.";
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
      if (!isOpen) setHasNewMessage(true);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Kunne ikke oprette forbindelse. Tjek din internetforbindelse og prøv igen." },
      ]);
    } finally {
      setIsLoading(false);
    }
  }, [messages, isLoading, isOpen]);

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            key="chat-panel"
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.97 }}
            transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
            style={{
              position: "fixed",
              bottom: "88px",
              right: "24px",
              zIndex: 9999,
              width: "360px",
              maxWidth: "calc(100vw - 48px)",
              background: C.navy,
              borderRadius: "20px",
              boxShadow: "0 24px 64px rgba(0,0,0,0.45), 0 0 0 1px rgba(201,169,110,0.18)",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
            }}
            data-testid="chat-panel"
          >
            <div
              style={{
                padding: "16px 20px",
                borderBottom: `1px solid ${C.goldBorder}`,
                display: "flex",
                alignItems: "center",
                gap: "12px",
                background: C.navyDeep,
              }}
            >
              <div
                style={{
                  width: "36px",
                  height: "36px",
                  borderRadius: "50%",
                  background: C.goldLight,
                  border: `1px solid ${C.goldBorder}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Sparkles size={16} color={C.gold} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: "'Inter', sans-serif", fontWeight: 600, fontSize: "14px", color: C.white }}>
                  Forma Assistent
                </div>
                <div style={{ fontFamily: "'Inter', sans-serif", fontSize: "12px", color: C.gold, display: "flex", alignItems: "center", gap: "5px" }}>
                  <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#4ade80", display: "inline-block" }} />
                  Online nu
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, padding: "4px", borderRadius: "6px", display: "flex", alignItems: "center" }}
                data-testid="button-close-chat"
              >
                <X size={16} />
              </button>
            </div>

            <div
              style={{
                flex: 1,
                overflowY: "auto",
                padding: "16px",
                display: "flex",
                flexDirection: "column",
                gap: "12px",
                maxHeight: "340px",
                scrollbarWidth: "thin",
                scrollbarColor: "rgba(201,169,110,0.2) transparent",
              }}
              data-testid="chat-messages"
            >
              {messages.map((msg, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
                  }}
                >
                  <div
                    style={{
                      maxWidth: "82%",
                      padding: "10px 14px",
                      borderRadius: msg.role === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                      background: msg.role === "user" ? C.gold : C.bubble,
                      color: msg.role === "user" ? C.navyDeep : C.white,
                      fontFamily: "'Inter', sans-serif",
                      fontSize: "13.5px",
                      lineHeight: "1.55",
                      fontWeight: msg.role === "user" ? 500 : 400,
                      border: msg.role === "assistant" ? `1px solid rgba(255,255,255,0.07)` : "none",
                    }}
                    data-testid={`message-${msg.role}-${i}`}
                  >
                    {msg.content}
                  </div>
                </div>
              ))}

              {isLoading && (
                <div style={{ display: "flex", justifyContent: "flex-start" }}>
                  <div
                    style={{
                      padding: "12px 16px",
                      borderRadius: "16px 16px 16px 4px",
                      background: C.bubble,
                      border: "1px solid rgba(255,255,255,0.07)",
                      display: "flex",
                      gap: "5px",
                      alignItems: "center",
                    }}
                  >
                    {[0, 1, 2].map((i) => (
                      <span
                        key={i}
                        style={{
                          width: "6px",
                          height: "6px",
                          borderRadius: "50%",
                          background: C.gold,
                          opacity: 0.7,
                          animation: "bounce 1.2s infinite",
                          animationDelay: `${i * 0.2}s`,
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {messages.length === 1 && (
              <div
                style={{
                  padding: "0 16px 12px",
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "7px",
                }}
              >
                {QUICK_QUESTIONS.map((q) => (
                  <button
                    key={q}
                    onClick={() => sendMessage(q)}
                    style={{
                      background: "none",
                      border: `1px solid ${C.goldBorder}`,
                      borderRadius: "20px",
                      padding: "6px 12px",
                      color: C.gold,
                      fontFamily: "'Inter', sans-serif",
                      fontSize: "12px",
                      cursor: "pointer",
                      transition: "all 0.15s",
                      whiteSpace: "nowrap",
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.background = C.goldLight;
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.background = "none";
                    }}
                    data-testid={`quick-question-${q.toLowerCase().replace(/\s+/g, "-").replace(/[?]/g, "")}`}
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}

            <div
              style={{
                padding: "12px 16px",
                borderTop: `1px solid ${C.goldBorder}`,
                background: C.navyDeep,
                display: "flex",
                gap: "8px",
                alignItems: "center",
              }}
            >
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendMessage(input)}
                placeholder="Skriv dit spørgsmål..."
                disabled={isLoading}
                style={{
                  flex: 1,
                  background: C.inputBg,
                  border: `1px solid rgba(255,255,255,0.12)`,
                  borderRadius: "10px",
                  padding: "9px 13px",
                  color: C.white,
                  fontFamily: "'Inter', sans-serif",
                  fontSize: "13.5px",
                  outline: "none",
                  transition: "border-color 0.15s",
                }}
                onFocus={(e) => { (e.target as HTMLInputElement).style.borderColor = C.goldBorder; }}
                onBlur={(e) => { (e.target as HTMLInputElement).style.borderColor = "rgba(255,255,255,0.12)"; }}
                data-testid="input-chat-message"
              />
              <button
                onClick={() => sendMessage(input)}
                disabled={!input.trim() || isLoading}
                style={{
                  width: "38px",
                  height: "38px",
                  borderRadius: "10px",
                  background: input.trim() && !isLoading ? C.gold : "rgba(201,169,110,0.2)",
                  border: "none",
                  cursor: input.trim() && !isLoading ? "pointer" : "not-allowed",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  transition: "background 0.15s",
                }}
                data-testid="button-send-message"
              >
                <Send size={15} color={input.trim() && !isLoading ? C.navyDeep : C.gold} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        onClick={() => setIsOpen((v) => !v)}
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.94 }}
        style={{
          position: "fixed",
          bottom: "24px",
          right: "24px",
          zIndex: 9999,
          width: "54px",
          height: "54px",
          borderRadius: "50%",
          background: C.navy,
          border: `1.5px solid ${C.goldBorder}`,
          boxShadow: "0 8px 32px rgba(0,0,0,0.35), 0 0 0 0 rgba(201,169,110,0.4)",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
        data-testid="button-open-chat"
      >
        <AnimatePresence mode="wait">
          {isOpen ? (
            <motion.div key="close" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.15 }}>
              <X size={20} color={C.gold} />
            </motion.div>
          ) : (
            <motion.div key="open" initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -90, opacity: 0 }} transition={{ duration: 0.15 }}>
              <MessageCircle size={20} color={C.gold} />
            </motion.div>
          )}
        </AnimatePresence>
        {hasNewMessage && !isOpen && (
          <span
            style={{
              position: "absolute",
              top: "3px",
              right: "3px",
              width: "10px",
              height: "10px",
              borderRadius: "50%",
              background: C.gold,
              border: `2px solid ${C.navy}`,
            }}
          />
        )}
      </motion.button>

      <style>{`
        @keyframes bounce {
          0%, 80%, 100% { transform: translateY(0); }
          40% { transform: translateY(-5px); }
        }
      `}</style>
    </>
  );
}
