import React from "react";
import Link from "next/link";

export default function WeatherMapPage() {
  return (
    <div className="flex min-h-screen flex-col items-center p-8 bg-white dark:bg-gray-900">
      <div className="w-full max-w-5xl">
        <div className="mb-8 flex items-center justify-between">
          <Link href="/" className="text-blue-500 hover:text-blue-700 font-medium">
            &larr; Back to Home
          </Link>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Weather Map (Windy)</h1>
          <div className="w-[100px]"></div> {/* Spacer for centering */}
        </div>

        <div className="bg-gray-100 dark:bg-gray-800 rounded-xl shadow-lg p-4 overflow-hidden flex flex-col items-center">
          <div className="w-full aspect-video relative">
            <iframe
              width="100%"
              height="100%"
              src="https://embed.windy.com/embed2.html?lat=36.205&lon=138.253&detailLat=36.205&detailLon=138.253&width=650&height=450&zoom=5&level=surface&overlay=wind&product=ecmwf&menu=&message=&marker=&calendar=now&pressure=&type=map&location=coordinates&detail=&metricWind=default&metricTemp=default&radarRange=-1"
              frameBorder="0"
              className="absolute top-0 left-0 w-full h-full rounded-lg"
              title="Windy.com Weather Map"
            ></iframe>
          </div>

          <div className="mt-8 text-center">
            <p className="mb-4 text-gray-700 dark:text-gray-300">
              For the official JMA Weather Charts (Tenki-zu), please visit:
            </p>
            <a
              href="https://www.jma.go.jp/bosai/weather_map/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              Go to JMA Official Weather Maps
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
