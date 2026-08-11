import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Send, MessageCircle, Sparkles, ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const GUIDED_BUBBLE_KEY = "forma_chat_guided_v1";

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

export function SupportChat({ mode = "landing" }: { mode?: "landing" | "dashboard" }) {
  const { t } = useTranslation();

  const quickQuestions = mode === "dashboard"
    ? [t("chat.dashQ1"), t("chat.dashQ2"), t("chat.dashQ3"), t("chat.dashQ4")]
    : [t("chat.landingQ1"), t("chat.landingQ2"), t("chat.landingQ3"), t("chat.landingQ4")];

  const welcomeMsg = mode === "dashboard" ? t("chat.welcomeDash") : t("chat.welcomeLanding");

  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([{ role: "assistant", content: welcomeMsg }]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [hasNewMessage, setHasNewMessage] = useState(false);
  const [showGuidedBubble, setShowGuidedBubble] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Stable ref so the event listener always has the latest sendMessage
  const sendMessageRef = useRef<((text: string) => void) | null>(null);

  // Show guided bubble after 2.5s on first visit
  useEffect(() => {
    if (localStorage.getItem(GUIDED_BUBBLE_KEY) === "1") return;
    const t = setTimeout(() => setShowGuidedBubble(true), 2500);
    return () => clearTimeout(t);
  }, []);

  // Auto-hide bubble after 10s
  useEffect(() => {
    if (!showGuidedBubble) return;
    const t = setTimeout(() => setShowGuidedBubble(false), 10000);
    return () => clearTimeout(t);
  }, [showGuidedBubble]);

  const dismissBubble = useCallback(() => {
    setShowGuidedBubble(false);
    localStorage.setItem(GUIDED_BUBBLE_KEY, "1");
  }, []);

  const openChat = useCallback(() => {
    setIsOpen(true);
    dismissBubble();
  }, [dismissBubble]);

  // Listen for external openSupportChat event (from dashboard banner etc.)
  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<{ autoMessage?: string }>;
      openChat();
      if (ce.detail?.autoMessage) {
        setTimeout(() => sendMessageRef.current?.(ce.detail.autoMessage!), 500);
      }
    };
    window.addEventListener("openSupportChat", handler);
    return () => window.removeEventListener("openSupportChat", handler);
  }, [openChat]);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      setTimeout(() => inputRef.current?.focus(), 150);
      setHasNewMessage(false);
      dismissBubble();
    }
  }, [messages, isOpen, dismissBubble]);

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
        body: JSON.stringify({ messages: nextMessages, lang: i18n.language }),
      });
      const data = await res.json();
      const reply = data.reply ?? data.error ?? t("chat.errorGeneral");
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
      if (!isOpen) setHasNewMessage(true);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: t("chat.errorNetwork") },
      ]);
    } finally {
      setIsLoading(false);
    }
  }, [messages, isLoading, isOpen]);

  // Keep ref in sync
  useEffect(() => { sendMessageRef.current = sendMessage; }, [sendMessage]);

  return (
    <>
      {/* ── Chat panel ─────────────────────────────────────────────── */}
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
            {/* Header */}
            <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.goldBorder}`, display: "flex", alignItems: "center", gap: "12px", background: C.navyDeep }}>
              <div style={{ width: "36px", height: "36px", borderRadius: "50%", background: C.goldLight, border: `1px solid ${C.goldBorder}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Sparkles size={16} color={C.gold} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: "14px", color: C.white }}>{t("chat.title")}</div>
                <div style={{ fontSize: "12px", color: C.gold, display: "flex", alignItems: "center", gap: "5px" }}>
                  <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#4ade80", display: "inline-block" }} />
                  {t("chat.online")}
                </div>
              </div>
              <button onClick={() => setIsOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, padding: "4px", borderRadius: "6px", display: "flex" }} data-testid="button-close-chat">
                <X size={16} />
              </button>
            </div>

            {/* Messages */}
            <div style={{ flex: 1, overflowY: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: "12px", maxHeight: "340px", scrollbarWidth: "thin", scrollbarColor: "rgba(201,169,110,0.2) transparent" }} data-testid="chat-messages">
              {messages.map((msg, i) => (
                <div key={i} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }}>
                  <div style={{ maxWidth: "82%", padding: "10px 14px", borderRadius: msg.role === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px", background: msg.role === "user" ? C.gold : C.bubble, color: msg.role === "user" ? C.navyDeep : C.white, fontSize: "13.5px", lineHeight: "1.55", fontWeight: msg.role === "user" ? 500 : 400, border: msg.role === "assistant" ? "1px solid rgba(255,255,255,0.07)" : "none" }} data-testid={`message-${msg.role}-${i}`}>
                    {msg.content}
                  </div>
                </div>
              ))}
              {isLoading && (
                <div style={{ display: "flex", justifyContent: "flex-start" }}>
                  <div style={{ padding: "12px 16px", borderRadius: "16px 16px 16px 4px", background: C.bubble, border: "1px solid rgba(255,255,255,0.07)", display: "flex", gap: "5px", alignItems: "center" }}>
                    {[0, 1, 2].map((i) => (
                      <span key={i} style={{ width: "6px", height: "6px", borderRadius: "50%", background: C.gold, opacity: 0.7, animation: "bounce 1.2s infinite", animationDelay: `${i * 0.2}s` }} />
                    ))}
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Quick questions — only shown before user has typed */}
            {messages.length === 1 && (
              <div style={{ padding: "0 16px 12px", display: "flex", flexWrap: "wrap", gap: "7px" }}>
                {quickQuestions.map((q) => (
                  <button
                    key={q}
                    onClick={() => sendMessage(q)}
                    style={{ background: "none", border: `1px solid ${C.goldBorder}`, borderRadius: "20px", padding: "6px 12px", color: C.gold, fontSize: "12px", cursor: "pointer", transition: "all 0.15s", whiteSpace: "nowrap" }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = C.goldLight; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "none"; }}
                    data-testid={`quick-question-${q.toLowerCase().replace(/\s+/g, "-").replace(/[?]/g, "")}`}
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}

            {/* Input */}
            <div style={{ padding: "12px 16px", borderTop: `1px solid ${C.goldBorder}`, background: C.navyDeep, display: "flex", gap: "8px", alignItems: "center" }}>
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendMessage(input)}
                placeholder={t("chat.placeholder")}
                disabled={isLoading}
                style={{ flex: 1, background: C.inputBg, border: "1px solid rgba(255,255,255,0.12)", borderRadius: "10px", padding: "9px 13px", color: C.white, fontSize: "13.5px", outline: "none", transition: "border-color 0.15s" }}
                onFocus={(e) => { (e.target as HTMLInputElement).style.borderColor = C.goldBorder; }}
                onBlur={(e) => { (e.target as HTMLInputElement).style.borderColor = "rgba(255,255,255,0.12)"; }}
                data-testid="input-chat-message"
              />
              <button
                onClick={() => sendMessage(input)}
                disabled={!input.trim() || isLoading}
                style={{ width: "38px", height: "38px", borderRadius: "10px", background: input.trim() && !isLoading ? C.gold : "rgba(201,169,110,0.2)", border: "none", cursor: input.trim() && !isLoading ? "pointer" : "not-allowed", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "background 0.15s" }}
                data-testid="button-send-message"
              >
                <Send size={15} color={input.trim() && !isLoading ? C.navyDeep : C.gold} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Guided bubble ──────────────────────────────────────────── */}
      <AnimatePresence>
        {showGuidedBubble && !isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.92 }}
            transition={{ duration: 0.28, ease: [0.23, 1, 0.32, 1] }}
            onClick={openChat}
            data-testid="guided-bubble"
            style={{
              position: "fixed",
              bottom: "90px",
              right: "24px",
              zIndex: 9998,
              background: C.navyDeep,
              border: "1.5px solid rgba(201,169,110,0.45)",
              borderRadius: "14px",
              padding: "10px 12px 10px 14px",
              boxShadow: "0 8px 28px rgba(0,0,0,0.32)",
              display: "flex",
              alignItems: "center",
              gap: "7px",
              cursor: "pointer",
              maxWidth: "228px",
            }}
          >
            <Sparkles size={14} color={C.gold} style={{ flexShrink: 0 }} />
            <span style={{ color: "#fff", fontSize: "13px", fontWeight: 500, lineHeight: 1.3, flex: 1 }}>
              Brug for at blive guided?
            </span>
            <ChevronDown size={13} color={C.gold} style={{ flexShrink: 0 }} />
            <button
              onClick={(e) => { e.stopPropagation(); dismissBubble(); }}
              style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.35)", padding: "2px", display: "flex", marginLeft: "2px" }}
              data-testid="guided-bubble-dismiss"
            >
              <X size={11} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Floating chat button ───────────────────────────────────── */}
      <motion.button
        onClick={openChat}
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
          boxShadow: "0 8px 32px rgba(0,0,0,0.35)",
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
          <span style={{ position: "absolute", top: "3px", right: "3px", width: "10px", height: "10px", borderRadius: "50%", background: C.gold, border: `2px solid ${C.navy}` }} />
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
