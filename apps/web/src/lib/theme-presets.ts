import { BrandTheme } from './use-brand-theme';

export interface ThemePreset {
  id: string;
  name: string;
  brandColor: string;
  primaryColor: string;
  secondaryColor: string;
  backgroundColor: string;
  textColor: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ThemeConfiguration {
  brandTheme: BrandTheme;
  primaryHue: number;
  secondaryHue: number;
  backgroundLuminance: number;
  textLuminance: number;
  borderRadius: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  borderWidth: number;
}

export class ThemePresetsManager {
  private static readonly STORAGE_KEY = 'theme-presets';
  private static readonly ACTIVE_PRESET_KEY = 'active-theme-preset';

  /**
   * Save a new theme preset
   */
  static savePreset(preset: Omit<ThemePreset, 'id' | 'createdAt' | 'updatedAt'>): ThemePreset {
    const presets = this.getAllPresets();
    const newPreset: ThemePreset = {
      ...preset,
      id: `preset_${Date.now()}`,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    presets.push(newPreset);
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(presets));
    return newPreset;
  }

  /**
   * Get all saved theme presets
   */
  static getAllPresets(): ThemePreset[] {
    const stored = localStorage.getItem(this.STORAGE_KEY);
    if (!stored) return [];
    
    try {
      const parsed = JSON.parse(stored);
      return parsed.map((p: any) => ({
        ...p,
        createdAt: new Date(p.createdAt),
        updatedAt: new Date(p.updatedAt),
      }));
    } catch (e) {
      console.error('Error parsing theme presets:', e);
      return [];
    }
  }

  /**
   * Get a specific theme preset by ID
   */
  static getPresetById(id: string): ThemePreset | undefined {
    const presets = this.getAllPresets();
    return presets.find(preset => preset.id === id);
  }

  /**
   * Update an existing theme preset
   */
  static updatePreset(id: string, updates: Partial<Omit<ThemePreset, 'id' | 'createdAt'>>): boolean {
    const presets = this.getAllPresets();
    const index = presets.findIndex(preset => preset.id === id);
    
    if (index === -1) return false;
    const current = presets[index]!;
    
    presets[index] = {
      ...current,
      ...updates,
      updatedAt: new Date(),
    };
    
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(presets));
    return true;
  }

  /**
   * Delete a theme preset
   */
  static deletePreset(id: string): boolean {
    const presets = this.getAllPresets();
    const filtered = presets.filter(preset => preset.id !== id);
    
    if (filtered.length === presets.length) return false;
    
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(filtered));
    return true;
  }

  /**
   * Set the active theme preset
   */
  static setActivePreset(presetId: string | null): void {
    if (presetId) {
      localStorage.setItem(this.ACTIVE_PRESET_KEY, presetId);
    } else {
      localStorage.removeItem(this.ACTIVE_PRESET_KEY);
    }
  }

  /**
   * Get the currently active theme preset
   */
  static getActivePreset(): ThemePreset | null {
    const activeId = localStorage.getItem(this.ACTIVE_PRESET_KEY);
    if (!activeId) return null;
    
    return this.getPresetById(activeId) || null;
  }

  /**
   * Apply a theme preset to the current session
   */
  static applyPreset(preset: ThemePreset): void {
    // Apply brand color
    document.documentElement.style.setProperty('--brand-primary', preset.brandColor);
    
    // Apply primary color
    document.documentElement.style.setProperty('--primary-color', preset.primaryColor);
    
    // Apply secondary color
    document.documentElement.style.setProperty('--secondary-color', preset.secondaryColor);
    
    // Apply background color
    document.documentElement.style.setProperty('--background-color', preset.backgroundColor);
    
    // Apply text color
    document.documentElement.style.setProperty('--text-color', preset.textColor);
    
    // Store the active preset
    this.setActivePreset(preset.id);
  }

  /**
   * Reset to default theme
   */
  static resetToDefault(): void {
    // Remove custom theme variables
    document.documentElement.style.removeProperty('--brand-primary');
    document.documentElement.style.removeProperty('--primary-color');
    document.documentElement.style.removeProperty('--secondary-color');
    document.documentElement.style.removeProperty('--background-color');
    document.documentElement.style.removeProperty('--text-color');
    
    // Clear active preset
    this.setActivePreset(null);
  }
}