import MainCard from "~/components/main-card";
import Hero from "~/components/hero";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Schemata - Visualize Any GitHub Repository",
  description:
    "Turn any GitHub repository into an interactive architecture diagram for quick codebase understanding.",
};

export default function HomePage() {
  return (
    <main className="flex-grow px-6 pb-8 md:px-8">
      <div className="mx-auto max-w-4xl pt-24 lg:pt-32">
        <Hero />
        <p className="mx-auto mt-8 max-w-xl text-center text-lg leading-relaxed text-gray-500">
          Visualize and explore any codebase with interactive
          architecture diagrams, generated instantly.
        </p>
      </div>
      <div className="mt-12 flex justify-center">
        <MainCard />
      </div>
      {/* Warm gradient accent */}
      <div
        className="pointer-events-none mx-auto mt-[-40px] h-40 max-w-3xl"
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(255, 200, 150, 0.3) 0%, rgba(255, 180, 120, 0.15) 40%, transparent 70%)",
        }}
      />
    </main>
  );
}
