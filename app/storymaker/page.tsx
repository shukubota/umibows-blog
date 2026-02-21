"use client";

import React, { useState } from "react";
import Image from "next/image";

const pages = [
  "https://via.placeholder.com/200x300?text=Page+1", // Placeholder image for page 1
  "https://via.placeholder.com/200x300?text=Page+2", // Placeholder image for page 2
  "https://via.placeholder.com/200x300?text=Page+3", // Placeholder image for page 3
  "https://via.placeholder.com/200x300?text=Page+4", // Placeholder image for page 4
];

const BookViewer = () => {
  const [currentSpread, setCurrentSpread] = useState(0);

  const handleNext = () => {
    if (currentSpread < pages.length / 2 - 1) {
      setCurrentSpread(currentSpread + 1);
    }
  };

  const handlePrevious = () => {
    if (currentSpread > 0) {
      setCurrentSpread(currentSpread - 1);
    }
  };

  return (
    <div className="book-viewer">
      <button onClick={handlePrevious} disabled={currentSpread === 0}>
        Previous
      </button>
      <div className="spread">
        <Image
          src={pages[currentSpread * 2]}
          alt={`Page ${currentSpread * 2 + 1}`}
          className="page"
          width={200}
          height={300}
        />
        <Image
          src={pages[currentSpread * 2 + 1]}
          alt={`Page ${currentSpread * 2 + 2}`}
          className="page"
          width={200}
          height={300}
        />
      </div>
      <button onClick={handleNext} disabled={currentSpread === pages.length / 2 - 1}>
        Next
      </button>
      <style jsx>{`
        .book-viewer {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 20px;
        }
        .spread {
          display: flex;
          gap: 10px;
        }
        .page {
          width: 200px;
          height: 300px;
          object-fit: cover;
          border: 1px solid #ccc;
          box-shadow: 2px 2px 5px rgba(0, 0, 0, 0.1);
        }
        button {
          padding: 10px 20px;
          font-size: 16px;
          cursor: pointer;
        }
        button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
};

export default BookViewer;
