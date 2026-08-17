import { Link } from "wouter";
import { Home, AlertCircle } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#f5f5f0] px-4">
      <div className="bg-white p-8 sm:p-10 rounded-2xl shadow-lg w-full max-w-[440px] text-center">
        <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-5">
          <AlertCircle className="w-7 h-7 text-red-500" />
        </div>
        <h1 className="text-3xl font-bold text-[#1a1a1a] mb-2">404</h1>
        <p className="text-lg font-medium text-[#1a1a1a] mb-2">Siden blev ikke fundet</p>
        <p className="text-sm text-muted-foreground mb-8">
          Den side du leder efter eksisterer ikke eller er blevet flyttet.
        </p>
        <Link href="/">
          <span className="inline-flex items-center gap-2 bg-[#0F1D2F] text-white px-6 py-3 rounded-xl font-medium text-sm hover:bg-[#1a2e47] transition-colors cursor-pointer">
            <Home className="w-4 h-4" />
            Tilbage til forsiden
          </span>
        </Link>
      </div>
    </div>
  );
}
