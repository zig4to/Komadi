import { Geist } from "next/font/google";
import Backgrounds from "./Backgrounds";

// Samo za predogled novega videza (branch prenova-videza) — pred merge na
// main se mapa predogled/ izbriše.
const geist = Geist({ subsets: ["latin", "latin-ext"] });

export default function PredogledLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${geist.className} relative isolate min-h-dvh w-full flex-1 overflow-x-hidden bg-[#0a0a0b] text-neutral-100`}>
      <Backgrounds />
      <div className="relative pb-16">{children}</div>
    </div>
  );
}
