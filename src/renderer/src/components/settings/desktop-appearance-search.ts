import { translate } from '@/i18n/i18n'

export function getDesktopAppearanceEntries() {
  return [
    {
      title: translate('fork.appearance.iconSize', 'Icon size'),
      description: translate(
        'fork.appearance.iconDescription',
        'Scale main and secondary interface icons together.'
      ),
      keywords: ['icons', 'size', '图标', '大小']
    },
    {
      title: translate('fork.appearance.textSize', 'Interface text size'),
      description: translate(
        'fork.appearance.textDescription',
        'Text in project lists and the file explorer.'
      ),
      keywords: ['font', 'text', '字号', '文字']
    },
    {
      title: translate('fork.appearance.density', 'List density'),
      description: translate(
        'fork.appearance.densityDescription',
        'Spacing in project and file lists.'
      ),
      keywords: ['density', 'compact', 'spacing', '密度', '间距']
    }
  ]
}
