'use client';

import { useState, useEffect } from 'react';
import { Button, Input } from '@/components/ui';

interface BrandColorPickerProps {
  initialColor?: string;
  onColorChange?: (color: string) => void;
  showPreview?: boolean;
}

export function BrandColorPicker({ 
  initialColor = '#2563eb', 
  onColorChange, 
  showPreview = true 
}: BrandColorPickerProps) {
  const [color, setColor] = useState(initialColor);
  const [isValidColor, setIsValidColor] = useState(true);

  useEffect(() => {
    setColor(initialColor);
  }, [initialColor]);

  const handleColorChange = (newColor: string) => {
    setColor(newColor);
    if (onColorChange) {
      onColorChange(newColor);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(value)) {
      setColor(value);
      setIsValidColor(true);
      if (onColorChange) {
        onColorChange(value);
      }
    } else {
      setIsValidColor(false);
    }
  };

  const handleInputBlur = () => {
    // If the color is invalid, revert to the last valid color
    if (!isValidColor) {
      setColor(initialColor);
      setIsValidColor(true);
    }
  };

  const handleNativeColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setColor(value);
    if (onColorChange) {
      onColorChange(value);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <input
          type="color"
          value={color}
          onChange={handleNativeColorChange}
          className="h-10 w-10 cursor-pointer rounded-lg border border-slate-300 dark:border-obsidian-700"
        />
        <Input
          type="text"
          value={color}
          onChange={handleInputChange}
          onBlur={handleInputBlur}
          className={`font-mono text-xs ${!isValidColor ? 'border-red-500' : ''}`}
          placeholder="#2563eb"
        />
      </div>

      {showPreview && (
        <div className="pt-3 border-t border-slate-200 dark:border-obsidian-800">
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">Preview</p>
          <div className="flex flex-wrap gap-3">
            <div className="flex flex-col items-center">
              <div 
                className="w-16 h-8 rounded-md flex items-center justify-center text-white text-xs font-bold"
                style={{ backgroundColor: color }}
              >
                {color.substring(0, 7)}
              </div>
              <span className="text-xs mt-1 text-slate-500 dark:text-slate-400">Primary</span>
            </div>
            
            <div className="flex flex-col items-center">
              <div 
                className="w-16 h-8 rounded-md flex items-center justify-center text-white text-xs font-bold"
                style={{ backgroundColor: adjustColor(color, 20) }}
              >
                {adjustColor(color, 20).substring(0, 7)}
              </div>
              <span className="text-xs mt-1 text-slate-500 dark:text-slate-400">Lighter</span>
            </div>
            
            <div className="flex flex-col items-center">
              <div 
                className="w-16 h-8 rounded-md flex items-center justify-center text-white text-xs font-bold"
                style={{ backgroundColor: adjustColor(color, -20) }}
              >
                {adjustColor(color, -20).substring(0, 7)}
              </div>
              <span className="text-xs mt-1 text-slate-500 dark:text-slate-400">Darker</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Helper function to adjust color brightness
function adjustColor(hex: string, percent: number): string {
  // Expand shorthand form (e.g. "03F") to full form (e.g. "0033FF")
  const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
  hex = hex.replace(shorthandRegex, (m, r, g, b) => {
    return r + r + g + g + b + b;
  });

  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return hex;

  const r = Math.min(255, Math.max(0, parseInt(result[1]!, 16) + (2.55 * percent)));
  const g = Math.min(255, Math.max(0, parseInt(result[2]!, 16) + (2.55 * percent)));
  const b = Math.min(255, Math.max(0, parseInt(result[3]!, 16) + (2.55 * percent)));

  return '#' + 
    Math.round(r).toString(16).padStart(2, '0') +
    Math.round(g).toString(16).padStart(2, '0') +
    Math.round(b).toString(16).padStart(2, '0');
}