import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Check, MessageSquare } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface SpecialRequestProps {
  designId: number;
  originalImageUrl: string;
}

export function SpecialRequest({ designId, originalImageUrl }: SpecialRequestProps) {
  const [showForm, setShowForm] = useState(false);
  const [request, setRequest] = useState("");
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const { toast } = useToast();

  const submitMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/special-requests", {
        designId,
        originalImageUrl,
        request,
        customerEmail: email || undefined,
        price: 500,
      });
      return res.json();
    },
    onSuccess: () => {
      setSubmitted(true);
      toast({
        title: "Forespørgsel sendt",
        description: "Vi kontakter dig indenfor 24 timer.",
      });
    },
    onError: () => {
      toast({
        title: "Noget gik galt",
        description: "Prøv igen eller kontakt os direkte.",
        variant: "destructive",
      });
    },
  });

  if (submitted) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="border border-border/60 rounded-xl p-5 bg-card/30"
      >
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-full bg-foreground/5 flex items-center justify-center flex-shrink-0 mt-0.5">
            <Check className="w-4 h-4 text-foreground/70" />
          </div>
          <div>
            <p className="text-sm font-medium" data-testid="text-request-confirmed">Dit ønske er modtaget</p>
            <p className="text-xs text-muted-foreground mt-1">Vi kontakter dig indenfor 24 timer med et tilpasset design.</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Pris for manuel tilpasning: 500 kr</p>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <div className="border border-border/60 rounded-xl overflow-hidden bg-card/30">
      <button
        type="button"
        onClick={() => setShowForm(!showForm)}
        className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-muted/20 transition-colors"
        data-testid="button-toggle-special-request"
      >
        <MessageSquare className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        <div>
          <p className="text-sm text-foreground">Har du specielle ønsker vi ikke kan generere?</p>
          <p className="text-xs text-muted-foreground mt-0.5">Fx specifik vægfarve, særlige møbler, eller andre detaljer</p>
        </div>
      </button>

      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 space-y-3 border-t border-border/40 pt-4">
              <textarea
                value={request}
                onChange={(e) => setRequest(e.target.value.slice(0, 500))}
                placeholder="Beskriv dit ønske — fx 'Mørkegrøn væg bag sengen' eller 'Specifik lampe fra Hay'"
                rows={3}
                className="w-full px-3.5 py-3 rounded-lg border border-border/60 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-foreground/30 focus:ring-1 focus:ring-foreground/10 resize-none transition-colors"
                data-testid="input-special-request"
              />

              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Din email (så vi kan kontakte dig)"
                className="w-full px-3.5 py-2.5 rounded-lg border border-border/60 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-foreground/30 focus:ring-1 focus:ring-foreground/10 transition-colors"
                data-testid="input-special-request-email"
              />

              <div className="flex items-center justify-between pt-1">
                <p className="text-xs text-muted-foreground/60">
                  Vi retter dit billede manuelt og sender indenfor 24 timer · 500 kr
                </p>
                <Button
                  size="sm"
                  disabled={!request.trim() || submitMutation.isPending}
                  onClick={() => submitMutation.mutate()}
                  className="h-8 text-xs"
                  data-testid="button-send-special-request"
                >
                  Send forespørgsel
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
