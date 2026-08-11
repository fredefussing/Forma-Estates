import { useState, useRef, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { Send, Sparkles, RotateCcw, ChevronRight, Zap } from "lucide-react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const QUICK_QUESTIONS = [
  "Er der binding på månedlig plan?",
  "Hvorfor Forma frem for traditionel staging?",
  "Hvad koster det sammenlignet med fotograf?",
  "Hvad med EU AI Act og lovkrav?",
  "Hvad er ROI for en mægler med 5 sager/md?",
  "Hvordan håndterer vi 'det er for dyrt'?",
  "Kan vi slå vandmærke fra?",
  "Hvad er forskellen på pakkerne?",
];

const ALLOWED_EMAILS = ["mahad23_@hotmail.com"];

const C = {
  cream: "#FAF7F2",
  navy: "#0F1923",
  navyDeep: "#0A1219",
  gold: "#C9A96E",
  goldLight: "rgba(201,169,110,0.12)",
  goldBorder: "rgba(201,169,110,0.28)",
  muted: "#6B6A68",
  border: "#E8E4DC",
  white: "#FFFFFF",
};

function formatMessage(text: string) {
  const lines = text.split("\n");
  return lines.map((line, i) => {
    // Bold: **text**
    const parts = line.split(/(\*\*[^*]+\*\*)/g).map((part, j) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={j}>{part.slice(2, -2)}</strong>;
      }
      return part;
    });
    return (
      <span key={i}>
        {parts}
        {i < lines.length - 1 && <br />}
      </span>
    );
  });
}

export default function SalesChatPage() {
  const { user, loading, isAdmin } = useAuth();
  const [, navigate] = useLocation();

  const isAllowed =
    isAdmin ||
    ALLOWED_EMAILS.includes((user?.email ?? "").toLowerCase());

  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "Hej! Jeg er din interne sælger-assistent. Spørg mig om **priser**, **binding**, **konkurrenter**, **ROI**, **indvendinger** eller hvad som helst du har brug for at vide inden du ringer til et lead.\n\nJeg kender alt til Forma Estates og giver dig svar du kan bruge direkte i samtalen.",
    },
  ]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isTyping) return;

      const userMsg: Message = { role: "user", content: trimmed };
      const nextMessages = [...messages, userMsg];
      setMessages(nextMessages);
      setInput("");
      setIsTyping(true);

      try {
        const res = await fetch("/api/sales-chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: nextMessages }),
        });
        const data = await res.json();
        const reply =
          data.reply ??
          data.error ??
          "Beklager, noget gik galt. Prøv igen.";
        setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
      } catch {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content:
              "Kunne ikke oprette forbindelse. Tjek din internetforbindelse og prøv igen.",
          },
        ]);
      } finally {
        setIsTyping(false);
      }
    },
    [messages, isTyping]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const reset = () => {
    setMessages([
      {
        role: "assistant",
        content:
          "Ny samtale startet. Hvad vil du vide inden dit næste opkald?",
      },
    ]);
    setInput("");
  };

  if (loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: C.cream,
        }}
      >
        <div style={{ color: C.muted, fontSize: 15 }}>Indlæser…</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: C.cream,
          flexDirection: "column",
          gap: 16,
        }}
      >
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            letterSpacing: "0.15em",
            textTransform: "uppercase",
            color: C.gold,
          }}
        >
          Forma Estates — Internt
        </div>
        <div style={{ fontSize: 28, fontWeight: 300, color: C.navy }}>
          Log ind for at fortsætte
        </div>
        <button
          onClick={() => navigate("/login")}
          style={{
            marginTop: 8,
            padding: "12px 32px",
            background: C.navy,
            color: C.white,
            border: "none",
            borderRadius: 10,
            fontSize: 15,
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          Gå til log ind
        </button>
      </div>
    );
  }

  if (!isAllowed) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: C.cream,
          flexDirection: "column",
          gap: 12,
          padding: "0 24px",
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            letterSpacing: "0.15em",
            textTransform: "uppercase",
            color: C.gold,
          }}
        >
          Forma Estates — Internt
        </div>
        <div style={{ fontSize: 24, fontWeight: 300, color: C.navy }}>
          Adgang nægtet
        </div>
        <div style={{ fontSize: 15, color: C.muted, maxWidth: 360 }}>
          Denne side er kun tilgængelig for Forma Estates salgsteam.
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: C.cream,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* ── Top bar ── */}
      <div
        style={{
          background: C.navyDeep,
          borderBottom: `1px solid ${C.goldBorder}`,
          padding: "0 24px",
          height: 60,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: "50%",
              background: C.goldLight,
              border: `1px solid ${C.goldBorder}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Zap size={15} color={C.gold} />
          </div>
          <div>
            <div
              style={{ fontSize: 14, fontWeight: 600, color: C.white }}
            >
              Sælger-assistent
            </div>
            <div
              style={{
                fontSize: 11,
                color: C.gold,
                display: "flex",
                alignItems: "center",
                gap: 5,
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: "#4ade80",
                  display: "inline-block",
                }}
              />
              Kun til internt salgsbrug
            </div>
          </div>
        </div>

        <button
          onClick={reset}
          title="Ny samtale"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "7px 14px",
            background: "rgba(255,255,255,0.07)",
            border: `1px solid ${C.goldBorder}`,
            borderRadius: 8,
            color: "rgba(255,255,255,0.65)",
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          <RotateCcw size={13} />
          Ny samtale
        </button>
      </div>

      {/* ── Main ── */}
      <div
        style={{
          flex: 1,
          display: "flex",
          maxWidth: 820,
          width: "100%",
          margin: "0 auto",
          flexDirection: "column",
          padding: "0 16px",
        }}
      >
        {/* Quick questions */}
        <div
          style={{
            padding: "18px 0 10px",
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          {QUICK_QUESTIONS.map((q) => (
            <button
              key={q}
              onClick={() => sendMessage(q)}
              disabled={isTyping}
              style={{
                padding: "6px 13px",
                background: C.white,
                border: `1px solid ${C.border}`,
                borderRadius: 20,
                fontSize: 12,
                color: C.navy,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 5,
                transition: "border-color 0.15s",
                opacity: isTyping ? 0.5 : 1,
              }}
            >
              <ChevronRight size={11} color={C.gold} />
              {q}
            </button>
          ))}
        </div>

        {/* Messages */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            paddingBottom: 16,
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          {messages.map((msg, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                justifyContent:
                  msg.role === "user" ? "flex-end" : "flex-start",
              }}
            >
              {msg.role === "assistant" && (
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: "50%",
                    background: C.navyDeep,
                    border: `1px solid ${C.goldBorder}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    marginRight: 10,
                    marginTop: 2,
                  }}
                >
                  <Sparkles size={12} color={C.gold} />
                </div>
              )}
              <div
                style={{
                  maxWidth: "75%",
                  padding: "12px 16px",
                  borderRadius:
                    msg.role === "user"
                      ? "16px 16px 4px 16px"
                      : "4px 16px 16px 16px",
                  background:
                    msg.role === "user" ? C.navy : C.white,
                  color: msg.role === "user" ? C.white : C.navy,
                  fontSize: 14,
                  lineHeight: 1.65,
                  boxShadow:
                    msg.role === "assistant"
                      ? "0 1px 4px rgba(0,0,0,0.07)"
                      : "none",
                  border:
                    msg.role === "assistant"
                      ? `1px solid ${C.border}`
                      : "none",
                }}
              >
                {formatMessage(msg.content)}
              </div>
            </div>
          ))}

          {isTyping && (
            <div style={{ display: "flex", alignItems: "flex-start" }}>
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  background: C.navyDeep,
                  border: `1px solid ${C.goldBorder}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  marginRight: 10,
                  marginTop: 2,
                }}
              >
                <Sparkles size={12} color={C.gold} />
              </div>
              <div
                style={{
                  padding: "12px 16px",
                  borderRadius: "4px 16px 16px 16px",
                  background: C.white,
                  border: `1px solid ${C.border}`,
                  display: "flex",
                  gap: 4,
                  alignItems: "center",
                  boxShadow: "0 1px 4px rgba(0,0,0,0.07)",
                }}
              >
                {[0, 1, 2].map((j) => (
                  <span
                    key={j}
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: C.gold,
                      display: "inline-block",
                      animation: `bounce 1.2s ease-in-out ${j * 0.2}s infinite`,
                    }}
                  />
                ))}
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div
          style={{
            position: "sticky",
            bottom: 0,
            paddingBottom: 20,
            paddingTop: 8,
            background: C.cream,
          }}
        >
          <div
            style={{
              display: "flex",
              gap: 10,
              alignItems: "flex-end",
              background: C.white,
              border: `1px solid ${C.border}`,
              borderRadius: 14,
              padding: "10px 12px",
              boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
            }}
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Stil et spørgsmål… (Enter sender, Shift+Enter ny linje)"
              rows={1}
              style={{
                flex: 1,
                border: "none",
                outline: "none",
                resize: "none",
                fontSize: 14,
                color: C.navy,
                background: "transparent",
                lineHeight: 1.5,
                maxHeight: 120,
                overflowY: "auto",
              }}
              onInput={(e) => {
                const t = e.currentTarget;
                t.style.height = "auto";
                t.style.height = Math.min(t.scrollHeight, 120) + "px";
              }}
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || isTyping}
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background:
                  input.trim() && !isTyping ? C.navy : C.border,
                border: "none",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor:
                  input.trim() && !isTyping ? "pointer" : "default",
                flexShrink: 0,
                transition: "background 0.15s",
              }}
            >
              <Send size={15} color={C.white} />
            </button>
          </div>
          <div
            style={{
              textAlign: "center",
              marginTop: 8,
              fontSize: 11,
              color: C.muted,
            }}
          >
            Kun til intern brug — Forma Estates salgsteam
          </div>
        </div>
      </div>

      <style>{`
        @keyframes bounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.5; }
          40% { transform: translateY(-5px); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
