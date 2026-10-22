import { RotateCcw } from 'lucide-react'
import { Button } from '../ui/button'
import { Label } from '../ui/label'
import { Slider } from '../ui/slider'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import {
  DEFAULT_DESKTOP_APPEARANCE,
  normalizeDesktopAppearance,
  type DesktopAppearance
} from '../../../../shared/desktop-appearance'
import type { GlobalSettings } from '../../../../shared/types'
import { translate } from '@/i18n/i18n'
import { SearchableSetting } from './SearchableSetting'

import { getDesktopAppearanceEntries } from './desktop-appearance-search'
import { updateDesktopAppearance } from './desktop-appearance-updates'

export function DesktopAppearanceSetting({ settings }: { settings: GlobalSettings }) {
  const appearance = normalizeDesktopAppearance(settings.desktopAppearance)
  const entries = getDesktopAppearanceEntries()
  const update = (patch: Partial<DesktopAppearance>) => {
    void updateDesktopAppearance(patch)
  }
  return (
    <div className="space-y-4 py-4">
      {(
        [
          { key: 'iconSize', min: 16, max: 24, step: 2, defaultValue: 20 },
          { key: 'textSize', min: 12, max: 16, step: 1, defaultValue: 13 }
        ] as const
      ).map((control, index) => {
        const entry = entries[index]
        return (
          <SearchableSetting key={control.key} {...entry}>
            <div className="space-y-3 py-2">
              <div className="space-y-1">
                <Label>{entry.title}</Label>
                <p className="text-xs text-muted-foreground">{entry.description}</p>
              </div>
              <Slider
                className="max-w-sm"
                thumbLabel={entry.title}
                min={control.min}
                max={control.max}
                step={control.step}
                value={[appearance[control.key]]}
                onValueChange={([value]) => update({ [control.key]: value })}
              />
              <p className="text-[11px] text-muted-foreground">
                {translate(
                  'fork.appearance.current',
                  'Current: {{value}}px · Default: {{defaultSize}}px',
                  { value: appearance[control.key], defaultSize: control.defaultValue }
                )}
              </p>
            </div>
          </SearchableSetting>
        )
      })}
      <SearchableSetting {...entries[2]}>
        <div className="space-y-2">
          <div className="space-y-1">
            <Label htmlFor="desktop-list-density">{entries[2].title}</Label>
            <p className="text-xs text-muted-foreground">{entries[2].description}</p>
          </div>
          <Select
            value={appearance.density}
            onValueChange={(density) =>
              update({ density: density as DesktopAppearance['density'] })
            }
          >
            <SelectTrigger id="desktop-list-density" className="w-48" aria-label={entries[2].title}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="compact">
                {translate('fork.appearance.compact', 'Compact')}
              </SelectItem>
              <SelectItem value="standard">
                {translate('fork.appearance.standard', 'Standard')}
              </SelectItem>
              <SelectItem value="spacious">
                {translate('fork.appearance.spacious', 'Spacious')}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </SearchableSetting>
      <Button variant="ghost" size="sm" onClick={() => update(DEFAULT_DESKTOP_APPEARANCE)}>
        <RotateCcw />
        {translate('fork.appearance.reset', 'Reset appearance sizes')}
      </Button>
    </div>
  )
}
