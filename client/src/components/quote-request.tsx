import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Check, Mail, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/use-auth";

interface QuoteRequestProps {
  designId: number;
  generatedImageUrl: string;
  roomType: string;
  style: string;
  budget?: number | null;
}

export function QuoteRequest({ designId, budget }: QuoteRequestProps) {
  const [submitted, setSubmitted] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  const submitMutation = useMutation({
    mutationFn: async () => {
      const token = await user?.getIdToken();
      const res = await fetch("/api/analyze-design", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ designId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Noget gik galt");
      }
      return res.json();
    },
    onSuccess: () => {
      setSubmitted(true);
      toast({
        title: "Analyse sendt!",
        description: "Tjek din mail — vi har sendt dig møbler med links til alle butikker.",
      });
    },
    onError: (err: Error) => {
      toast({
        title: "Noget gik galt",
        description: err.message || "Prøv igen om lidt.",
        variant: "destructive",
      });
    },
  });

  if (!user) return null;
  if (!budget) return null;

  if (submitted) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="border border-border/60 rounded-xl p-5 bg-card/30"
      >
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
            <Check className="w-4 h-4 text-emerald-600" />
          </div>
          <div>
            <p className="text-sm font-medium" data-testid="text-quote-confirmed">Møbeltilbud sendt til din mail!</p>
            <p className="text-xs text-muted-foreground mt-1">Vi har analyseret dit rum og fundet møblerne hos de bedste danske butikker. Tjek din indbakke.</p>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <div className="border border-border/60 rounded-xl p-5 bg-card/30">
      <div className="mb-4">
        <h3 className="text-sm font-medium" data-testid="text-quote-heading">Vil du have tilbud på disse møbler?</h3>
        <p className="text-xs text-muted-foreground mt-1">
          Få tilbud fra vores udvalgte partnere inden for 24 timer
        </p>
      </div>

      <Button
        className="w-full h-10 text-sm"
        disabled={submitMutation.isPending}
        onClick={() => submitMutation.mutate()}
        data-testid="button-send-quote-request"
      >
        {submitMutation.isPending ? (
          <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
        ) : (
          <Mail className="w-3.5 h-3.5 mr-2" />
        )}
        {submitMutation.isPending ? "Analyserer dit rum..." : "Få tilbud nu"}
      </Button>

      <p className="text-[11px] text-muted-foreground/50 text-center mt-2">
        Sendes til {user.email}
      </p>
    </div>
  );
}
