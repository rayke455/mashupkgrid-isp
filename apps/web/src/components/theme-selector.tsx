'use client';

import { useState, useRef, useEffect } from 'react';
import { useTheme } from '@/components/theme-provider';
import { Button } from '@/components/ui';

// Define available themes with their brand colors
const THEMES = [
  { name: 'Default', color: '#2563eb', id: 'default' }, // blue-600
  { name: 'Emerald', color: '#10b981', id: 'emerald' }, // emerald-500
  { name: 'Amber', color: '#f59e0b', id: 'amber' }, // amber-500
  { name: 'Rose', color: '#f43f5e', id: 'rose' }, // rose-500
  { name: 'Violet', color: '#8b5cf6', id: 'violet' }, // violet-500
  { name: 'Cyan', color: '#06b6d4', id: 'cyan' }, // cyan-500
];

export function ThemeSelector() {
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // In a real implementation, you would store the selected brand color in state
  // and apply it using the TenantThemeStyle component
  const handleThemeSelect = (themeId: string) => {
    // Here you would typically store the selected theme color in localStorage
    // and update the theme accordingly
    console.log(`Selected theme: ${themeId}`);
    setOpen(false);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <Button 
        variant="ghost" 
        size="icon" 
        aria-label="Select theme"
        onClick={() => setOpen(!open)}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-5 w-5"
        >
          <path d="M14 19.9V16h3" />
          <path d="M12 9a4 4 0 1 0-2.6 7.4" />
          <circle cx="8" cy="9" r="5" />
          <path d="M16 12a4 4 0 0 0 2.6-7.4" />
          <circle cx="16" cy="15" r="5" />
        </svg>
      </Button>
      
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-64 rounded-xl border border-slate-200/80 bg-white p-3 shadow-lg dark:border-obsidian-800 dark:bg-obsidian-900">
          <div className="mb-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
              Brand Colors
            </p>
            <div className="grid grid-cols-3 gap-2">
              {THEMES.map((themeOption) => (
                <button
                  key={themeOption.id}
                  className="group relative flex h-8 w-8 items-center justify-center rounded-full border border-transparent hover:border-slate-300 dark:hover:border-obsidian-700"
                  style={{ backgroundColor: themeOption.color }}
                  onClick={() => handleThemeSelect(themeOption.id)}
                  aria-label={themeOption.name}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="white"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-4 w-4 hidden group-hover:block"
                  >
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                </button>
              ))}
            </div>
          </div>
          
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
              Theme Mode
            </p>
            <div className="flex gap-2">
              <Button
                variant={theme === 'light' ? 'primary' : 'outline'}
                size="sm"
                onClick={() => {
                  setTheme('light');
                  setOpen(false);
                }}
              >
                Light
              </Button>
              <Button
                variant={theme === 'dark' ? 'primary' : 'outline'}
                size="sm"
                onClick={() => {
                  setTheme('dark');
                  setOpen(false);
                }}
              >
                Dark
              </Button>
              <Button
                variant={theme === 'system' ? 'primary' : 'outline'}
                size="sm"
                onClick={() => {
                  setTheme('system');
                  setOpen(false);
                }}
              >
                System
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}