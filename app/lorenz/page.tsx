import React from 'react';
import LorenzAttractor from '../../components/LorenzAttractor';
import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Lorenz Attractor Simulation | Umibows Blog',
    description: 'Interactive Lorenz Attractor simulation using Runge-Kutta 4th order method.',
};

export default function LorenzPage() {
    return (
        <main>
            <LorenzAttractor />
        </main>
    );
}
