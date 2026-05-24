import React from "react";
import PlanetMotion from "../../components/PlanetMotion";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Planetary Motion Simulation | Umibows Blog",
  description:
    "Interactive N-body gravitational simulation using velocity Verlet integration. Explore Kepler orbits, three-body chaos, and binary star systems.",
};

export default function PlanetMotionPage() {
  return (
    <main>
      <PlanetMotion />
    </main>
  );
}
