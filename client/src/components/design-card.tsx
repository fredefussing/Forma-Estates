import { Button } from "@/components/ui/button";
import { Eye, Loader2, Clock } from "lucide-react";
import { type Design } from "@shared/schema";

const roomTypeLabels: Record<string, string> = {
  "living room": "Stue",
  "bedroom": "Soveværelse",
  "kitchen": "Køkken",
  "bathroom": "Badeværelse",
  "dining room": "Spisestue",
  "home office": "Hjemmekontor",
  "kids room": "Børneværelse",
  "studio": "Studio",
  "game room": "Spillerum",
  "home gym": "Træningsrum",
  "laundry room": "Vaskerum",
  "conference room": "Mødelokale",
  "spa room": "Spa",
  "outdoor": "Udendørs",
  "open living and dining room": "Åben stue/spisestue",
};

const styleLabels: Record<string, string> = {
  "scandinavian": "Skandinavisk",
  "modern": "Moderne",
  "luxury": "Luksus",
  "industrial": "Industriel",
  "coastal": "Kyst",
  "transitional": "Overgangs",
  "farmhouse": "Landlig",
  "mid-century": "Midtårhundrede",
};

interface DesignCardProps {
  design: Design;
  onView: () => void;
}

export function DesignCard({ design, onView }: DesignCardProps) {
  const imgSrc = design.resultImageUrl || design.originalImageUrl;
  const isPending = design.status === "pending" || design.status === "processing";
  const isFailed = design.status === "failed";

  return (
    <div className="group cursor-pointer rounded-xl overflow-hidden border border-border/60 transition-all duration-300 hover:border-foreground/20" onClick={onView} data-testid={`card-design-${design.id}`}>
      <div className="relative aspect-[4/3] overflow-hidden">
        <img
          src={imgSrc}
          alt={`${design.roomType} - ${design.style}`}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
        />
        {isPending && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
            <Loader2 className="w-7 h-7 text-white animate-spin" />
          </div>
        )}
      </div>
      <div className="px-4 py-3.5 flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-foreground">
            {roomTypeLabels[design.roomType] || design.roomType}
            <span className="text-muted-foreground font-normal"> · {styleLabels[design.style] || design.style}</span>
          </p>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
            {isPending ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>Genererer...</span>
              </>
            ) : isFailed ? (
              <span className="text-destructive">Mislykkedes</span>
            ) : (
              <>
                <Clock className="w-3 h-3" />
                <span>{new Date(design.createdAt).toLocaleDateString("da-DK")}</span>
              </>
            )}
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          disabled={isFailed}
          className="h-8 text-xs text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
          data-testid={`button-view-design-${design.id}`}
        >
          <Eye className="w-3.5 h-3.5 mr-1" /> Se
        </Button>
      </div>
    </div>
  );
}
