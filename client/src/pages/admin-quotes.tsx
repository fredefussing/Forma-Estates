import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Plus, Trash2, Send, Home } from "lucide-react";
import { Link } from "wouter";
import type { Design, Quote } from "@shared/schema";
import { formatDKK } from "@shared/budgetUtils";
import { getTierLabel } from "@shared/budgetUtils";
import type { BudgetTier } from "@shared/styleVocabulary";

const styleLabels: Record<string, string> = {
  scandinavian: "Skandinavisk",
  modern: "Moderne",
  luxury: "Luksus",
  industrial: "Industriel",
  coastal: "Kyst",
  transitional: "Overgangs",
  farmhouse: "Landlig",
  midcentury: "Midcentury",
};

const retailerOptions = [
  "IKEA", "JYSK", "Ilva", "IDEmøbler", "BoConcept", "Hay",
  "Fritz Hansen", "Bolia", "&Tradition", "Louis Poulsen",
  "Montana", "House Doctor", "Muubs", "Søstrene Grene",
  "Tine K Home", "Paustian", "Eilersen", "Carl Hansen & Søn",
  "PP Møbler", "Norr11", "Menu",
];

interface Product {
  name: string;
  retailer: string;
  price: number;
  link: string;
}

export default function AdminQuotesPage() {
  const { toast } = useToast();
  const [selectedDesign, setSelectedDesign] = useState<Design | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [products, setProducts] = useState<Product[]>([]);

  const { data: designs = [] } = useQuery<Design[]>({
    queryKey: ["/api/designs"],
  });

  const { data: quotes = [] } = useQuery<Quote[]>({
    queryKey: ["/api/quotes"],
  });

  const completedDesigns = designs.filter((d) => d.status === "completed");

  const totalPrice = products.reduce((sum, p) => sum + (p.price || 0), 0);
  const margin = Math.round(totalPrice * 0.25);
  const finalPrice = totalPrice + margin;

  const createQuoteMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/quotes", {
        designId: selectedDesign!.id,
        customerName,
        customerEmail,
        products,
        totalPrice: totalPrice.toString(),
        margin: margin.toString(),
        finalPrice: finalPrice.toString(),
        status: "draft",
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quotes"] });
      toast({ title: "Tilbud oprettet", description: "Tilbuddet er gemt som kladde." });
      setSelectedDesign(null);
      setCustomerName("");
      setCustomerEmail("");
      setProducts([]);
    },
    onError: (err: Error) => {
      toast({ title: "Fejl", description: err.message, variant: "destructive" });
    },
  });

  const addProduct = () => {
    setProducts([...products, { name: "", retailer: "", price: 0, link: "" }]);
  };

  const updateProduct = (index: number, field: keyof Product, value: string | number) => {
    const updated = [...products];
    (updated[index] as any)[field] = value;
    setProducts(updated);
  };

  const removeProduct = (index: number) => {
    setProducts(products.filter((_, i) => i !== index));
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-md">
        <div className="mx-auto max-w-6xl flex items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            <Link href="/">
              <Button variant="ghost" size="sm" data-testid="link-home">
                <ArrowLeft className="w-4 h-4 mr-1" /> Tilbage
              </Button>
            </Link>
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center w-8 h-8 rounded-md bg-primary">
                <Home className="w-4 h-4 text-primary-foreground" />
              </div>
              <span className="font-semibold text-lg tracking-tight">Nordic Homebuild</span>
            </div>
          </div>
          <Badge variant="outline">Admin</Badge>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        <h1 className="text-2xl font-bold mb-6">Tilbudsbygger</h1>

        {!selectedDesign ? (
          <div className="space-y-8">
            <div>
              <h2 className="text-lg font-semibold mb-4">Vælg et færdigt design</h2>
              {completedDesigns.length === 0 ? (
                <Card className="p-8 text-center">
                  <p className="text-muted-foreground">Ingen færdige designs endnu.</p>
                </Card>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {completedDesigns.map((d) => (
                    <Card
                      key={d.id}
                      className="cursor-pointer hover:border-primary transition-colors overflow-hidden"
                      onClick={() => setSelectedDesign(d)}
                      data-testid={`card-design-${d.id}`}
                    >
                      <div className="aspect-video relative">
                        <img
                          src={d.resultImageUrl || d.originalImageUrl}
                          alt="Design"
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="p-3">
                        <p className="text-sm font-medium">
                          {styleLabels[d.style] || d.style}
                        </p>
                        {d.budget && d.tier && (
                          <p className="text-xs text-muted-foreground">
                            {formatDKK(d.budget)} · {getTierLabel(d.tier as BudgetTier)}
                          </p>
                        )}
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>

            {quotes.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold mb-4">Tidligere tilbud</h2>
                <div className="space-y-2">
                  {quotes.map((q) => (
                    <Card key={q.id} className="p-4 flex items-center justify-between" data-testid={`card-quote-${q.id}`}>
                      <div>
                        <p className="font-medium">{q.customerName}</p>
                        <p className="text-sm text-muted-foreground">{q.customerEmail}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold">{formatDKK(Number(q.finalPrice))}</p>
                        <Badge variant={q.status === "accepted" ? "default" : "secondary"}>
                          {q.status === "draft" ? "Kladde" : q.status === "sent" ? "Sendt" : q.status === "accepted" ? "Accepteret" : "Afvist"}
                        </Badge>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex items-start gap-4">
              <Button variant="ghost" size="sm" onClick={() => setSelectedDesign(null)} data-testid="button-back-designs">
                <ArrowLeft className="w-4 h-4 mr-1" /> Tilbage
              </Button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Card className="overflow-hidden" data-testid="card-design-preview">
                <div className="aspect-video">
                  <img
                    src={selectedDesign.resultImageUrl || selectedDesign.originalImageUrl}
                    alt="AI genereret design"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="p-3 space-y-1">
                  <p className="text-sm font-medium">{styleLabels[selectedDesign.style] || selectedDesign.style}</p>
                  {selectedDesign.budget && selectedDesign.tier && (
                    <p className="text-xs text-muted-foreground">
                      Budget: {formatDKK(selectedDesign.budget)} ({getTierLabel(selectedDesign.tier as BudgetTier)})
                    </p>
                  )}
                </div>
              </Card>

              <div className="lg:col-span-2 space-y-6">
                <div>
                  <h3 className="font-semibold mb-3">Kundeoplysninger</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Input
                      placeholder="Kundens navn"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      data-testid="input-customer-name"
                    />
                    <Input
                      placeholder="Kundens email"
                      type="email"
                      value={customerEmail}
                      onChange={(e) => setCustomerEmail(e.target.value)}
                      data-testid="input-customer-email"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold">Produkter</h3>
                    <Button variant="outline" size="sm" onClick={addProduct} data-testid="button-add-product">
                      <Plus className="w-4 h-4 mr-1" /> Tilføj produkt
                    </Button>
                  </div>

                  {products.length === 0 ? (
                    <Card className="p-6 text-center border-dashed">
                      <p className="text-sm text-muted-foreground mb-2">Ingen produkter tilføjet endnu</p>
                      <Button variant="outline" size="sm" onClick={addProduct} data-testid="button-add-first-product">
                        <Plus className="w-4 h-4 mr-1" /> Tilføj det første produkt
                      </Button>
                    </Card>
                  ) : (
                    <div className="space-y-3">
                      {products.map((p, i) => (
                        <Card key={i} className="p-3" data-testid={`card-product-${i}`}>
                          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-end">
                            <Input
                              placeholder="Produktnavn"
                              value={p.name}
                              onChange={(e) => updateProduct(i, "name", e.target.value)}
                              data-testid={`input-product-name-${i}`}
                            />
                            <select
                              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                              value={p.retailer}
                              onChange={(e) => updateProduct(i, "retailer", e.target.value)}
                              data-testid={`select-product-retailer-${i}`}
                            >
                              <option value="">Vælg butik</option>
                              {retailerOptions.map((r) => (
                                <option key={r} value={r}>{r}</option>
                              ))}
                            </select>
                            <Input
                              type="number"
                              placeholder="Pris (kr)"
                              value={p.price || ""}
                              onChange={(e) => updateProduct(i, "price", Number(e.target.value))}
                              data-testid={`input-product-price-${i}`}
                            />
                            <div className="flex gap-2">
                              <Input
                                placeholder="Link (valgfrit)"
                                value={p.link}
                                onChange={(e) => updateProduct(i, "link", e.target.value)}
                                data-testid={`input-product-link-${i}`}
                              />
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => removeProduct(i)}
                                className="flex-shrink-0 text-destructive hover:text-destructive"
                                data-testid={`button-remove-product-${i}`}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>

                {products.length > 0 && (
                  <Card className="p-4 bg-muted/30" data-testid="quote-summary">
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-sm">
                        <span>Indkøbspris</span>
                        <span>{formatDKK(totalPrice)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>Margin (25%)</span>
                        <span>{formatDKK(margin)}</span>
                      </div>
                      <div className="flex justify-between font-semibold text-base pt-1.5 border-t">
                        <span>Tilbud til kunde</span>
                        <span data-testid="text-final-price">{formatDKK(finalPrice)}</span>
                      </div>
                    </div>
                  </Card>
                )}

                <Button
                  className="w-full"
                  size="lg"
                  disabled={!customerName || !customerEmail || products.length === 0 || createQuoteMutation.isPending}
                  onClick={() => createQuoteMutation.mutate()}
                  data-testid="button-save-quote"
                >
                  <Send className="w-4 h-4 mr-2" />
                  Gem tilbud
                </Button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
