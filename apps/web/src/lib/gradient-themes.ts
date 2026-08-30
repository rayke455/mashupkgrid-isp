export interface GradientDefinition {
  start: string; // Starting color (hex)
  end: string;   // Ending color (hex)
  angle?: number; // Angle in degrees (default: 180)
  type?: 'linear' | 'radial';
}

export interface GradientTheme {
  id: string;
  name: string;
  primaryGradient: GradientDefinition;
  secondaryGradient: GradientDefinition;
  accentGradient: GradientDefinition;
}

export class GradientThemes {
  private static readonly STORAGE_KEY = 'gradient-themes';
  private static readonly ACTIVE_GRADIENT_KEY = 'active-gradient';

  /**
   * Get predefined gradient themes
   */
  static getPredefinedGradients(): GradientTheme[] {
    return [
      {
        id: 'sunset',
        name: 'Sunset',
        primaryGradient: { start: '#ff9a9e', end: '#fecfef', angle: 135 },
        secondaryGradient: { start: '#a8edea', end: '#fed6e3', angle: 135 },
        accentGradient: { start: '#ff758c', end: '#ff7eb3', angle: 135 },
      },
      {
        id: 'ocean',
        name: 'Ocean',
        primaryGradient: { start: '#a8edea', end: '#fed6e3', angle: 135 },
        secondaryGradient: { start: '#667eea', end: '#764ba2', angle: 135 },
        accentGradient: { start: '#f093fb', end: '#f5576c', angle: 135 },
      },
      {
        id: 'forest',
        name: 'Forest',
        primaryGradient: { start: '#d299c2', end: '#fef9d7', angle: 135 },
        secondaryGradient: { start: '#56ab2f', end: '#a8e063', angle: 135 },
        accentGradient: { start: '#6a93cb', end: '#a8dadc', angle: 135 },
      },
      {
        id: 'sunsetReverse',
        name: 'Deep Ocean',
        primaryGradient: { start: '#00d2ff', end: '#3a7bd5', angle: 135 },
        secondaryGradient: { start: '#00d2ff', end: '#3a7bd5', angle: 135 },
        accentGradient: { start: '#00d2ff', end: '#3a7bd5', angle: 135 },
      },
      {
        id: 'aurora',
        name: 'Aurora',
        primaryGradient: { start: '#5ee7df', end: '#b490ca', angle: 135 },
        secondaryGradient: { start: '#d299c2', end: '#fef9d7', angle: 135 },
        accentGradient: { start: '#a770ef', end: '#cf8bf3', angle: 135 },
      },
    ];
  }

  /**
   * Generate CSS for a gradient definition
   */
  static getCssGradient(gradient: GradientDefinition): string {
    const { start, end, angle = 180, type = 'linear' } = gradient;
    
    if (type === 'radial') {
      return `radial-gradient(circle, ${start}, ${end})`;
    }
    
    return `linear-gradient(${angle}deg, ${start}, ${end})`;
  }

  /**
   * Apply a gradient theme to the document
   */
  static applyGradientTheme(gradientTheme: GradientTheme): void {
    const root = document.documentElement;
    
    // Apply gradients as CSS variables
    root.style.setProperty('--primary-gradient', this.getCssGradient(gradientTheme.primaryGradient));
    root.style.setProperty('--secondary-gradient', this.getCssGradient(gradientTheme.secondaryGradient));
    root.style.setProperty('--accent-gradient', this.getCssGradient(gradientTheme.accentGradient));
    
    // Store the active gradient
    localStorage.setItem(this.ACTIVE_GRADIENT_KEY, gradientTheme.id);
  }

  /**
   * Apply a custom gradient
   */
  static applyCustomGradient(gradients: {
    primary?: GradientDefinition;
    secondary?: GradientDefinition;
    accent?: GradientDefinition;
  }): void {
    const root = document.documentElement;
    
    if (gradients.primary) {
      root.style.setProperty('--primary-gradient', this.getCssGradient(gradients.primary));
    }
    
    if (gradients.secondary) {
      root.style.setProperty('--secondary-gradient', this.getCssGradient(gradients.secondary));
    }
    
    if (gradients.accent) {
      root.style.setProperty('--accent-gradient', this.getCssGradient(gradients.accent));
    }
  }

  /**
   * Get the active gradient theme
   */
  static getActiveGradient(): GradientTheme | null {
    const activeId = localStorage.getItem(this.ACTIVE_GRADIENT_KEY);
    if (!activeId) return null;
    
    const predefined = this.getPredefinedGradients();
    return predefined.find(g => g.id === activeId) || null;
  }

  /**
   * Reset to default gradients (remove custom ones)
   */
  static resetToDefault(): void {
    const root = document.documentElement;
    
    // Remove custom gradient variables
    root.style.removeProperty('--primary-gradient');
    root.style.removeProperty('--secondary-gradient');
    root.style.removeProperty('--accent-gradient');
    
    // Clear active gradient
    localStorage.removeItem(this.ACTIVE_GRADIENT_KEY);
  }

  /**
   * Get gradient by ID
   */
  static getGradientById(id: string): GradientTheme | undefined {
    return this.getPredefinedGradients().find(g => g.id === id);
  }
}