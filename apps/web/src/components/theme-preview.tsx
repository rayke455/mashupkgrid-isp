import { TenantThemeStyle } from '@/components/tenant-theme-style';
import { Card, Button, Badge } from '@/components/ui';

interface ThemePreviewProps {
  brandColor: string;
}

export function ThemePreview({ brandColor }: ThemePreviewProps) {
  return (
    <div className="p-4 rounded-xl border border-slate-200/80 dark:border-obsidian-800 bg-white dark:bg-obsidian-900">
      <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">Theme Preview</h3>
      
      <TenantThemeStyle brandColor={brandColor}>
        <div className="space-y-4">
          {/* Sample card with buttons */}
          <Card className="p-4">
            <h4 className="font-bold text-slate-900 dark:text-white mb-2">Sample Card</h4>
            <p className="text-sm text-slate-600 dark:text-slate-300 mb-3">
              This is a sample card showing how your theme will look across the application.
            </p>
            
            <div className="flex gap-2">
              <Button variant="primary">Primary</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="outline">Outline</Button>
              <Button variant="ghost">Ghost</Button>
            </div>
          </Card>
          
          {/* Sample badges */}
          <div className="flex flex-wrap gap-2">
            <Badge variant="success">Success</Badge>
            <Badge variant="warning">Warning</Badge>
            <Badge variant="danger">Danger</Badge>
            <Badge variant="info">Info</Badge>
            <Badge variant="neutral">Neutral</Badge>
          </div>
          
          {/* Sample status indicators */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              <span className="text-xs text-slate-600 dark:text-slate-300">Online</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-amber-500" />
              <span className="text-xs text-slate-600 dark:text-slate-300">Warning</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-rose-500" />
              <span className="text-xs text-slate-600 dark:text-slate-300">Offline</span>
            </div>
          </div>
          
          {/* Sample input fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1">
                Text Input
              </label>
              <input
                type="text"
                placeholder="Enter text..."
                className="w-full rounded-lg border border-slate-300/90 bg-white px-3.5 py-2 text-sm text-slate-900 shadow-xs outline-none transition-all placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-obsidian-700 dark:bg-obsidian-950 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-brand-400 dark:focus:ring-brand-400/20"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1">
                Select Field
              </label>
              <select
                className="w-full rounded-lg border border-slate-300/90 bg-white px-3.5 py-2 text-sm text-slate-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-obsidian-700 dark:bg-obsidian-950 dark:text-slate-100"
              >
                <option>Option 1</option>
                <option>Option 2</option>
                <option>Option 3</option>
              </select>
            </div>
          </div>
        </div>
      </TenantThemeStyle>
    </div>
  );
}