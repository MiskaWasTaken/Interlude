import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

interface GradientColors {
  primary: string;
  secondary: string;
  tertiary: string;
}

interface GradientContextType {
  colors: GradientColors;
  setColorsFromImage: (imageUrl: string) => Promise<void>;
  resetColors: () => void;
  gradientEnabled: boolean;
  setGradientEnabled: (enabled: boolean) => void;
  intensity: number;
  setIntensity: (intensity: number) => void;
}

const defaultColors: GradientColors = {
  primary: '#1a1a2e',
  secondary: '#16213e',
  tertiary: '#0f3460',
};

const GradientContext = createContext<GradientContextType | null>(null);

export function GradientProvider({ children }: { children: ReactNode }) {
  const [colors, setColors] = useState<GradientColors>(defaultColors);
  const [gradientEnabled, setGradientEnabled] = useState(true);
  const [intensity, setIntensity] = useState(0.6);

  const setColorsFromImage = useCallback(async (imageUrl: string) => {
    if (!gradientEnabled) return;
    
    try {
      const img = new Image();
      img.crossOrigin = 'Anonymous';
      
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = reject;
        img.src = imageUrl;
      });

      // Create canvas to extract colors
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const size = 50;
      canvas.width = size;
      canvas.height = size;
      ctx.drawImage(img, 0, 0, size, size);

      const imageData = ctx.getImageData(0, 0, size, size).data;
      
      // Extract dominant colors using a simple algorithm
      const colorCounts: Record<string, { r: number; g: number; b: number; count: number }> = {};
      
      for (let i = 0; i < imageData.length; i += 4) {
        const r = Math.round(imageData[i] / 32) * 32;
        const g = Math.round(imageData[i + 1] / 32) * 32;
        const b = Math.round(imageData[i + 2] / 32) * 32;
        const key = `${r},${g},${b}`;
        
        if (!colorCounts[key]) {
          colorCounts[key] = { r, g, b, count: 0 };
        }
        colorCounts[key].count++;
      }

      // Sort by count and get top 3 colors
      const sortedColors = Object.values(colorCounts)
        .sort((a, b) => b.count - a.count)
        .slice(0, 3);

      if (sortedColors.length >= 1) {
        const toHex = (c: { r: number; g: number; b: number }) => 
          `#${c.r.toString(16).padStart(2, '0')}${c.g.toString(16).padStart(2, '0')}${c.b.toString(16).padStart(2, '0')}`;
        
        // Darken colors for AMOLED aesthetic
        const darken = (c: { r: number; g: number; b: number }, factor: number) => ({
          r: Math.round(c.r * factor),
          g: Math.round(c.g * factor),
          b: Math.round(c.b * factor),
        });

        setColors({
          primary: toHex(darken(sortedColors[0], 0.3)),
          secondary: toHex(darken(sortedColors[1] || sortedColors[0], 0.2)),
          tertiary: toHex(darken(sortedColors[2] || sortedColors[0], 0.15)),
        });
      }
    } catch (error) {
      console.error('Failed to extract colors:', error);
    }
  }, [gradientEnabled]);

  const resetColors = useCallback(() => {
    setColors(defaultColors);
  }, []);

  return (
    <GradientContext.Provider value={{
      colors,
      setColorsFromImage,
      resetColors,
      gradientEnabled,
      setGradientEnabled,
      intensity,
      setIntensity,
    }}>
      {children}
    </GradientContext.Provider>
  );
}

export function useGradient() {
  const context = useContext(GradientContext);
  if (!context) {
    throw new Error('useGradient must be used within a GradientProvider');
  }
  return context;
}
