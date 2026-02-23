import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Check, Send } from "lucide-react";
import { motion } from "framer-motion";

interface QuoteRequestProps {
  designId: number;
  generatedImageUrl: string;
  roomType: string;
  style: string;
  budget?: number | null;
}

export function QuoteRequest({ designId, generatedImageUrl, roomType, style, budget }: QuoteRequestProps) {
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const { toast } = useToast();

  const submitMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/quote-requests", {
        designId,
        customerEmail: email,
        notes: notes || undefined,
        generatedImageUrl,
        roomType,
        style,
        budget: budget || undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      setSubmitted(true);
      toast({
        title: "Forespørgsel sendt",
        description: "Vi kontakter dig indenfor 24 timer med et personligt tilbud.",
      });
    },
    onError: () => {
      toast({
        title: "Noget gik galt",
        description: "Tjek din email og prøv igen.",
        variant: "destructive",
      });
    },
  });

  if (submitted) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="border border-border/60 rounded-xl p-6 bg-card/30"
      >
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-full bg-foreground/5 flex items-center justify-center flex-shrink-0 mt-0.5">
            <Check className="w-4 h-4 text-foreground/70" />
          </div>
          <div>
            <p className="text-sm font-medium" data-testid="text-quote-confirmed">Din forespørgsel er sendt!</p>
            <p className="text-xs text-muted-foreground mt-1">Vi kontakter dig indenfor 24 timer med et personligt tilbud.</p>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <div className="border border-border/60 rounded-xl p-6 bg-card/30">
      <div className="mb-4">
        <h3 className="text-sm font-medium" data-testid="text-quote-heading">Er du glad for dit design?</h3>
        <p className="text-xs text-muted-foreground mt-1">Få et gratis tilbud på at gøre det til virkelighed.</p>
      </div>

      <div className="space-y-3">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="din@email.dk"
          className="w-full px-3.5 py-2.5 rounded-lg border border-border/60 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-foreground/30 focus:ring-1 focus:ring-foreground/10 transition-colors"
          data-testid="input-quote-email"
        />

        <div className="relative">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value.slice(0, 100))}
            placeholder="Ønsker eller ændringer (valgfrit)..."
            rows={2}
            className="w-full px-3.5 py-2.5 rounded-lg border border-border/60 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-foreground/30 focus:ring-1 focus:ring-foreground/10 resize-none transition-colors"
            data-testid="input-quote-notes"
          />
          <span className={`absolute bottom-2 right-3 text-[11px] ${notes.length >= 100 ? "text-destructive font-medium" : "text-muted-foreground/40"}`}>
            {notes.length}/100
          </span>
        </div>

        <Button
          className="w-full h-10 text-sm"
          disabled={!email || submitMutation.isPending}
          onClick={() => submitMutation.mutate()}
          data-testid="button-send-quote-request"
        >
          <Send className="w-3.5 h-3.5 mr-2" />
          Få tilbud
        </Button>
      </div>
    </div>
  );
}
