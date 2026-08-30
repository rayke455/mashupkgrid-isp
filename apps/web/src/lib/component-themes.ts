export interface ComponentTheme {
  id: string;
  name: string;
  component: string; // Component identifier (e.g., 'dashboard', 'settings', 'reports')
  primaryColor: string;
  backgroundColor: string;
  borderColor: string;
  borderRadius: string;
  boxShadow: string;
  fontFamily?: string;
}

export class ComponentThemes {
  private static readonly STORAGE_KEY = 'component-themes';

  /**
   * Get all component-specific themes
   */
  static getAllComponentThemes(): ComponentTheme[] {
    const stored = localStorage.getItem(this.STORAGE_KEY);
    if (!stored) return [];
    
    try {
      return JSON.parse(stored);
    } catch (e) {
      console.error('Error parsing component themes:', e);
      return [];
    }
  }

  /**
   * Get component theme by component identifier
   */
  static getComponentTheme(component: string): ComponentTheme | undefined {
    const themes = this.getAllComponentThemes();
    return themes.find(t => t.component === component);
  }

  /**
   * Save a component-specific theme
   */
  static saveComponentTheme(theme: ComponentTheme): void {
    const themes = this.getAllComponentThemes();
    const existingIndex = themes.findIndex(t => t.component === theme.component);
    
    if (existingIndex !== -1) {
      themes[existingIndex] = theme;
    } else {
      themes.push(theme);
    }
    
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(themes));
  }

  /**
   * Apply a component theme to a specific element or section
   */
  static applyComponentTheme(component: string, element?: HTMLElement): void {
    const theme = this.getComponentTheme(component);
    if (!theme) return;
    
    const target = element || document.documentElement;
    
    // Apply theme properties to the target element
    target.style.setProperty('--component-primary', theme.primaryColor);
    target.style.setProperty('--component-background', theme.backgroundColor);
    target.style.setProperty('--component-border', theme.borderColor);
    target.style.setProperty('--component-radius', theme.borderRadius);
    target.style.setProperty('--component-shadow', theme.boxShadow);
    
    if (theme.fontFamily) {
      target.style.setProperty('--component-font-family', theme.fontFamily);
    }
  }

  /**
   * Remove component theme from an element
   */
  static removeComponentTheme(element?: HTMLElement): void {
    const target = element || document.documentElement;
    
    // Remove custom theme properties
    target.style.removeProperty('--component-primary');
    target.style.removeProperty('--component-background');
    target.style.removeProperty('--component-border');
    target.style.removeProperty('--component-radius');
    target.style.removeProperty('--component-shadow');
    target.style.removeProperty('--component-font-family');
  }

  /**
   * Reset all component themes
   */
  static resetAllComponentThemes(): void {
    localStorage.removeItem(this.STORAGE_KEY);
    
    // Remove all component theme properties from document
    const target = document.documentElement;
    target.style.removeProperty('--component-primary');
    target.style.removeProperty('--component-background');
    target.style.removeProperty('--component-border');
    target.style.removeProperty('--component-radius');
    target.style.removeProperty('--component-shadow');
    target.style.removeProperty('--component-font-family');
  }

  /**
   * Get predefined component themes
   */
  static getPredefinedComponentThemes(): ComponentTheme[] {
    return [
      {
        id: 'dashboard-theme',
        name: 'Dashboard Theme',
        component: 'dashboard',
        primaryColor: '#3b82f6', // blue-500
        backgroundColor: '#f8fafc', // slate-50
        borderColor: '#e2e8f0', // slate-200
        borderRadius: '0.5rem', // rounded-lg
        boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1)',
      },
      {
        id: 'settings-theme',
        name: 'Settings Theme',
        component: 'settings',
        primaryColor: '#8b5cf6', // violet-500
        backgroundColor: '#f3f4f6', // gray-100
        borderColor: '#d1d5db', // gray-300
        borderRadius: '0.75rem', // rounded-xl
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)',
      },
      {
        id: 'reports-theme',
        name: 'Reports Theme',
        component: 'reports',
        primaryColor: '#10b981', // emerald-500
        backgroundColor: '#f0fdf4', // green-50
        borderColor: '#bbf7d0', // green-200
        borderRadius: '0.375rem', // rounded-md
        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)',
      },
      {
        id: 'analytics-theme',
        name: 'Analytics Theme',
        component: 'analytics',
        primaryColor: '#f59e0b', // amber-500
        backgroundColor: '#fffbeb', // amber-50
        borderColor: '#fef3c7', // amber-200
        borderRadius: '0.5rem', // rounded-lg
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
      },
    ];
  }
}