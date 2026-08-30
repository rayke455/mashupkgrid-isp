'use client';

import { useState, useEffect } from 'react';
import { BrandColorPicker } from '@/components/brand-color-picker';
import { ThemePreview } from '@/components/theme-preview';
import { Button, Card, Input } from '@/components/ui';
import { ThemePresetsManager, ThemePreset } from '@/lib/theme-presets';
import { AccessibilityControls } from '@/lib/accessibility-controls';
import { GradientThemes, GradientTheme } from '@/lib/gradient-themes';
import { ComponentThemes } from '@/lib/component-themes';
import { ThemeSharing } from '@/lib/theme-sharing';

export function ThemeManager() {
  const [brandColor, setBrandColor] = useState('#2563eb');
  const [presetName, setPresetName] = useState('');
  const [presets, setPresets] = useState<ThemePreset[]>([]);
  const [activePreset, setActivePreset] = useState<ThemePreset | null>(null);
  const [accessibility, setAccessibility] = useState(AccessibilityControls.getPreferences());
  const [gradient, setGradient] = useState<GradientTheme | null>(null);
  const [fileName, setFileName] = useState('my-theme.json');
  const [importStatus, setImportStatus] = useState<{success: boolean | null, message: string}>({success: null, message: ''});

  useEffect(() => {
    // Load presets on mount
    setPresets(ThemePresetsManager.getAllPresets());
    setActivePreset(ThemePresetsManager.getActivePreset());
    setGradient(GradientThemes.getActiveGradient());
  }, []);

  const handleSavePreset = () => {
    if (!presetName.trim()) {
      alert('Please enter a name for your theme preset');
      return;
    }

    const newPreset = ThemePresetsManager.savePreset({
      name: presetName,
      brandColor,
      primaryColor: brandColor,
      secondaryColor: adjustColor(brandColor, -20),
      backgroundColor: '#ffffff',
      textColor: '#000000',
    });

    setPresets([...presets, newPreset]);
    setPresetName('');
    alert('Theme preset saved successfully!');
  };

  const handleApplyPreset = (preset: ThemePreset) => {
    ThemePresetsManager.applyPreset(preset);
    setBrandColor(preset.brandColor);
    setActivePreset(preset);
  };

  const handleDeletePreset = (id: string) => {
    if (confirm('Are you sure you want to delete this theme preset?')) {
      ThemePresetsManager.deletePreset(id);
      setPresets(presets.filter(p => p.id !== id));
      if (activePreset?.id === id) {
        ThemePresetsManager.resetToDefault();
        setActivePreset(null);
      }
    }
  };

  const handleToggleHighContrast = () => {
    AccessibilityControls.toggleHighContrast();
    setAccessibility(AccessibilityControls.getPreferences());
  };

  const handleToggleLargeText = () => {
    AccessibilityControls.toggleLargeText();
    setAccessibility(AccessibilityControls.getPreferences());
  };

  const handleToggleReduceMotion = () => {
    AccessibilityControls.toggleReduceMotion();
    setAccessibility(AccessibilityControls.getPreferences());
  };

  const handleApplyGradient = (gradientId: string) => {
    const gradient = GradientThemes.getGradientById(gradientId);
    if (gradient) {
      GradientThemes.applyGradientTheme(gradient);
      setGradient(gradient);
    }
  };

  const handleExportTheme = () => {
    ThemeSharing.downloadTheme(fileName);
  };

  const handleImportTheme = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    ThemeSharing.loadThemeFromFile(file, (success) => {
      if (success) {
        setImportStatus({success: true, message: 'Theme imported successfully!'});
        // Reload presets and other settings
        setPresets(ThemePresetsManager.getAllPresets());
        setActivePreset(ThemePresetsManager.getActivePreset());
        setGradient(GradientThemes.getActiveGradient());
        setAccessibility(AccessibilityControls.getPreferences());
      } else {
        setImportStatus({success: false, message: 'Failed to import theme. Please check the file format.'});
      }
      
      // Reset file input
      e.target.value = '';
      
      // Clear status after 3 seconds
      setTimeout(() => {
        setImportStatus({success: null, message: ''});
      }, 3000);
    });
  };

  const handleResetAll = () => {
    if (confirm('Are you sure you want to reset all theme settings to default?')) {
      ThemePresetsManager.resetToDefault();
      GradientThemes.resetToDefault();
      ComponentThemes.resetAllComponentThemes();
      AccessibilityControls.savePreferences({
        highContrast: false,
        largeText: false,
        reduceMotion: false,
        screenReaderFriendly: false,
        fontSize: 'base',
        fontFamily: 'sans',
      });
      
      setPresets(ThemePresetsManager.getAllPresets());
      setActivePreset(ThemePresetsManager.getActivePreset());
      setGradient(GradientThemes.getActiveGradient());
      setAccessibility(AccessibilityControls.getPreferences());
      setBrandColor('#2563eb'); // Reset to default brand color
    }
  };

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Theme Manager</h2>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column - Brand Color & Preview */}
          <div className="space-y-6">
            <div>
              <h3 className="font-semibold text-slate-900 dark:text-white mb-2">Brand Color</h3>
              <BrandColorPicker 
                initialColor={brandColor} 
                onColorChange={setBrandColor} 
              />
            </div>
            
            <ThemePreview brandColor={brandColor} />
          </div>
          
          {/* Right Column - Theme Features */}
          <div className="space-y-6">
            {/* Preset Management */}
            <div className="border border-slate-200/80 dark:border-obsidian-800 rounded-xl p-4">
              <h3 className="font-semibold text-slate-900 dark:text-white mb-3">Theme Presets</h3>
              
              <div className="flex gap-2 mb-3">
                <Input
                  type="text"
                  value={presetName}
                  onChange={(e) => setPresetName(e.target.value)}
                  placeholder="Preset name"
                  className="flex-1"
                />
                <Button onClick={handleSavePreset}>Save</Button>
              </div>
              
              <div className="space-y-2 max-h-40 overflow-y-auto pr-2">
                {presets.map(preset => (
                  <div key={preset.id} className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-obsidian-800">
                    <div className="flex items-center gap-2">
                      <div 
                        className="h-4 w-4 rounded-full border border-slate-300 dark:border-obsidian-700"
                        style={{ backgroundColor: preset.brandColor }}
                      />
                      <span className="text-sm">{preset.name}</span>
                    </div>
                    <div className="flex gap-1">
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => handleApplyPreset(preset)}
                      >
                        Apply
                      </Button>
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => handleDeletePreset(preset.id)}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                ))}
                
                {presets.length === 0 && (
                  <p className="text-sm text-slate-500 dark:text-slate-400 italic">No presets saved yet</p>
                )}
              </div>
            </div>
            
            {/* Accessibility Controls */}
            <div className="border border-slate-200/80 dark:border-obsidian-800 rounded-xl p-4">
              <h3 className="font-semibold text-slate-900 dark:text-white mb-3">Accessibility</h3>
              
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm">High Contrast</span>
                  <Button 
                    size="sm" 
                    variant={accessibility.highContrast ? "primary" : "outline"}
                    onClick={handleToggleHighContrast}
                  >
                    {accessibility.highContrast ? 'On' : 'Off'}
                  </Button>
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-sm">Large Text</span>
                  <Button 
                    size="sm" 
                    variant={accessibility.largeText ? "primary" : "outline"}
                    onClick={handleToggleLargeText}
                  >
                    {accessibility.largeText ? 'On' : 'Off'}
                  </Button>
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-sm">Reduce Motion</span>
                  <Button 
                    size="sm" 
                    variant={accessibility.reduceMotion ? "primary" : "outline"}
                    onClick={handleToggleReduceMotion}
                  >
                    {accessibility.reduceMotion ? 'On' : 'Off'}
                  </Button>
                </div>
              </div>
            </div>
            
            {/* Gradient Themes */}
            <div className="border border-slate-200/80 dark:border-obsidian-800 rounded-xl p-4">
              <h3 className="font-semibold text-slate-900 dark:text-white mb-3">Gradient Themes</h3>
              
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {GradientThemes.getPredefinedGradients().map(grad => (
                  <Button
                    key={grad.id}
                    size="sm"
                    variant={gradient?.id === grad.id ? "primary" : "outline"}
                    className="!justify-start"
                    onClick={() => handleApplyGradient(grad.id)}
                  >
                    <div className="w-4 h-4 rounded-full mr-2" 
                         style={{ 
                           background: GradientThemes.getCssGradient(grad.primaryGradient) 
                         }} 
                    />
                    {grad.name}
                  </Button>
                ))}
              </div>
            </div>
            
            {/* Theme Sharing */}
            <div className="border border-slate-200/80 dark:border-obsidian-800 rounded-xl p-4">
              <h3 className="font-semibold text-slate-900 dark:text-white mb-3">Theme Sharing</h3>
              
              <div className="space-y-3">
                <div className="flex gap-2">
                  <Input
                    type="text"
                    value={fileName}
                    onChange={(e) => setFileName(e.target.value)}
                    placeholder="Filename"
                    className="flex-1"
                  />
                  <Button onClick={handleExportTheme}>Export</Button>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Import Theme
                  </label>
                  <input
                    type="file"
                    accept=".json"
                    onChange={handleImportTheme}
                    className="block w-full text-sm text-slate-500
                              file:mr-4 file:py-2 file:px-4
                              file:rounded-lg file:border-0
                              file:text-sm file:font-semibold
                              file:bg-brand-50 file:text-brand-700
                              hover:file:bg-brand-100
                              dark:file:bg-brand-950/30 dark:file:text-brand-400
                              dark:hover:file:bg-brand-950/40"
                  />
                </div>
                
                {importStatus.success !== null && (
                  <div className={`text-sm p-2 rounded-lg ${
                    importStatus.success 
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300' 
                      : 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300'
                  }`}>
                    {importStatus.message}
                  </div>
                )}
                
                <Button 
                  variant="danger" 
                  size="sm"
                  onClick={handleResetAll}
                  className="mt-2"
                >
                  Reset All Themes
                </Button>
              </div>
            </div>
          </div>
        </div>
      </Card>
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