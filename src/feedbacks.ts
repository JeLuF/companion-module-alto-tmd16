import type { DropdownChoice } from '@companion-module/base'
import type ModuleInstance from './main.js'
import { CHANNELS, FADER_CHANNELS, PRESETS, gainValueToDb } from './protocol.js'

export type FeedbacksSchema = {
	mute_state: { type: 'boolean'; options: { channel: number } }
	fader_level: { type: 'boolean'; options: { channel: number; comparison: 'gte' | 'lte' | 'eq'; level: number } }
	preset_active: { type: 'boolean'; options: { preset: number } }
}

export function UpdateFeedbacks(self: ModuleInstance): void {
	const channelChoices: DropdownChoice<number>[] = CHANNELS.map((c) => ({ id: c.id, label: c.label }))
	const faderChoices: DropdownChoice<number>[] = FADER_CHANNELS.map((c) => ({ id: c.id, label: c.label }))
	const presetChoices: DropdownChoice<number>[] = PRESETS.map((p) => ({ id: p.id, label: p.label }))

	self.setFeedbackDefinitions({
		mute_state: {
			name: 'Channel is muted',
			type: 'boolean',
			defaultStyle: { bgcolor: 0xcc0000, color: 0xffffff },
			options: [{ id: 'channel', type: 'dropdown', label: 'Channel', choices: channelChoices, default: 0 }],
			callback: ({ options }) => self.mutes.get(options.channel) === true,
		},
		fader_level: {
			name: 'Fader level compared to value',
			type: 'boolean',
			defaultStyle: { bgcolor: 0x006600, color: 0xffffff },
			options: [
				{ id: 'channel', type: 'dropdown', label: 'Channel', choices: faderChoices, default: 0 },
				{
					id: 'comparison',
					type: 'dropdown',
					label: 'Fader is',
					choices: [
						{ id: 'gte', label: 'At or above' },
						{ id: 'lte', label: 'At or below' },
						{ id: 'eq', label: 'Equal to (within 0.05 dB)' },
					],
					default: 'gte',
				},
				{
					id: 'level',
					type: 'number',
					label: 'Level (dB)',
					default: 0,
					min: -80,
					max: 10,
					step: 0.1,
					clampValues: true,
				},
			],
			callback: ({ options }) => {
				const raw = self.gains.get(options.channel)
				if (raw === undefined) return false
				const db = gainValueToDb(raw)
				switch (options.comparison) {
					case 'gte':
						return db >= options.level
					case 'lte':
						return db <= options.level
					default:
						return Math.abs(db - options.level) < 0.05
				}
			},
		},
		preset_active: {
			name: 'Preset is current',
			type: 'boolean',
			defaultStyle: { bgcolor: 0x0044aa, color: 0xffffff },
			options: [{ id: 'preset', type: 'dropdown', label: 'Preset', choices: presetChoices, default: 0 }],
			callback: ({ options }) => self.preset === options.preset,
		},
	})
}
