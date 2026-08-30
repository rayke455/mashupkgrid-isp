export interface AccessibilityPreferences {
  highContrast: boolean;
  largeText: boolean;
  reduceMotion: boolean;
  screenReaderFriendly: boolean;
  fontSize: 'xs' | 'sm' | 'base' | 'lg' | 'xl' | '2xl';
  fontFamily: 'sans' | 'serif' | 'mono';
}

export class AccessibilityControls {
  private static readonly STORAGE_KEY = 'accessibility-preferences';

  /**
   * Get current accessibility preferences
   */
  static getPreferences(): AccessibilityPreferences {
    const stored = localStorage.getItem(this.STORAGE_KEY);
    if (!stored) {
      return {
        highContrast: false,
        largeText: false,
        reduceMotion: false,
        screenReaderFriendly: false,
        fontSize: 'base',
        fontFamily: 'sans',
      };
    }
    
    try {
      const parsed = JSON.parse(stored);
      return {
        highContrast: parsed.highContrast ?? false,
        largeText: parsed.largeText ?? false,
        reduceMotion: parsed.reduceMotion ?? false,
        screenReaderFriendly: parsed.screenReaderFriendly ?? false,
        fontSize: parsed.fontSize ?? 'base',
        fontFamily: parsed.fontFamily ?? 'sans',
      };
    } catch (e) {
      console.error('Error parsing accessibility preferences:', e);
      return {
        highContrast: false,
        largeText: false,
        reduceMotion: false,
        screenReaderFriendly: false,
        fontSize: 'base',
        fontFamily: 'sans',
      };
    }
  }

  /**
   * Save accessibility preferences
   */
  static savePreferences(preferences: Partial<AccessibilityPreferences>): void {
    const current = this.getPreferences();
    const updated = { ...current, ...preferences };
    
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(updated));
    this.applyPreferences(updated);
  }

  /**
   * Apply accessibility preferences to the document
   */
  static applyPreferences(preferences: AccessibilityPreferences): void {
    const root = document.documentElement;
    
    // Apply high contrast mode
    if (preferences.highContrast) {
      root.classList.add('high-contrast');
    } else {
      root.classList.remove('high-contrast');
    }
    
    // Apply large text
    if (preferences.largeText) {
      root.classList.add('large-text');
    } else {
      root.classList.remove('large-text');
    }
    
    // Apply reduced motion
    if (preferences.reduceMotion) {
      root.classList.add('reduce-motion');
      // Also apply via CSS media query override
      this.setReducedMotionStyles();
    } else {
      root.classList.remove('reduce-motion');
      this.clearReducedMotionStyles();
    }
    
    // Apply font size
    root.style.fontSize = this.getFontSizeValue(preferences.fontSize);
    
    // Apply font family
    root.style.fontFamily = this.getFontFamilyValue(preferences.fontFamily);
  }

  /**
   * Set reduced motion styles via CSS
   */
  private static setReducedMotionStyles(): void {
    const styleId = 'reduced-motion-styles';
    let styleElement = document.getElementById(styleId) as HTMLStyleElement;
    
    if (!styleElement) {
      styleElement = document.createElement('style');
      styleElement.id = styleId;
      document.head.appendChild(styleElement);
    }
    
    styleElement.textContent = `
      *, *::before, *::after {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
      }
    `;
  }

  /**
   * Clear reduced motion styles
   */
  private static clearReducedMotionStyles(): void {
    const styleId = 'reduced-motion-styles';
    const styleElement = document.getElementById(styleId);
    
    if (styleElement) {
      styleElement.remove();
    }
  }

  /**
   * Get font size value based on preference
   */
  private static getFontSizeValue(fontSize: AccessibilityPreferences['fontSize']): string {
    switch (fontSize) {
      case 'xs': return '0.75rem'; // 12px
      case 'sm': return '0.875rem'; // 14px
      case 'base': return '1rem'; // 16px
      case 'lg': return '1.125rem'; // 18px
      case 'xl': return '1.25rem'; // 20px
      case '2xl': return '1.5rem'; // 24px
      default: return '1rem';
    }
  }

  /**
   * Get font family value based on preference
   */
  private static getFontFamilyValue(fontFamily: AccessibilityPreferences['fontFamily']): string {
    switch (fontFamily) {
      case 'serif': return 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif';
      case 'mono': return 'ui-monospace, SFMono-Regular, "SF Mono", Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
      case 'sans':
      default: return 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"';
    }
  }

  /**
   * Initialize accessibility controls with saved preferences
   */
  static initialize(): void {
    const preferences = this.getPreferences();
    this.applyPreferences(preferences);
  }

  /**
   * Toggle high contrast mode
   */
  static toggleHighContrast(): void {
    const current = this.getPreferences();
    const newValue = !current.highContrast;
    this.savePreferences({ highContrast: newValue });
  }

  /**
   * Toggle large text mode
   */
  static toggleLargeText(): void {
    const current = this.getPreferences();
    const newValue = !current.largeText;
    this.savePreferences({ largeText: newValue });
  }

  /**
   * Toggle reduced motion
   */
  static toggleReduceMotion(): void {
    const current = this.getPreferences();
    const newValue = !current.reduceMotion;
    this.savePreferences({ reduceMotion: newValue });
  }
}

// Initialize accessibility controls when the script loads
if (typeof window !== 'undefined') {
  AccessibilityControls.initialize();
}