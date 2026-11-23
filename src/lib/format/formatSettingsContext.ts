import { createContext } from 'react'
import { DEFAULT_FORMAT_SETTINGS } from './date'
import type { FormatSettings } from './types'

export const FormatSettingsContext = createContext<FormatSettings>(DEFAULT_FORMAT_SETTINGS)
