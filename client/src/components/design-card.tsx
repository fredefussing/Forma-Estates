import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Eye, Loader2, Clock } from "lucide-react";
import { type Design, type RoomType, type DesignStyle } from "@shared/schema";

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
    <Card className="overflow-visible group" data-testid={`card-design-${design.id}`}>
      <div className="relative aspect-[4/3] overflow-hidden rounded-t-md">
        <img
          src={imgSrc}
          alt={`${design.roomType} - ${design.style}`}
          className="w-full h-full object-cover"
        />
        {isPending && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center rounded-t-md">
            <Loader2 className="w-8 h-8 text-white animate-spin" />
          </div>
        )}
        <div className="absolute bottom-2 left-2 flex items-center gap-1.5">
          <Badge variant="secondary" className="text-xs">
            {roomTypeLabels[design.roomType] || design.roomType}
          </Badge>
          <Badge variant="secondary" className="text-xs">
            {styleLabels[design.style] || design.style}
          </Badge>
        </div>
      </div>
      <div className="p-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
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
        <Button
          variant="ghost"
          size="sm"
          onClick={onView}
          disabled={isFailed}
          data-testid={`button-view-design-${design.id}`}
        >
          <Eye className="w-4 h-4 mr-1" /> Se
        </Button>
      </div>
    </Card>
  );
}
