import type { DropdownChoice } from '@companion-module/base'
import type ModuleInstance from './main.js'
import { CHANNELS, FADER_CHANNELS, PRESETS } from './protocol.js'

export type ActionsSchema = {
	set_fader: { options: { channel: number; level: number } }
	adjust_fader: { options: { channel: number; delta: number } }
	set_mute: { options: { channel: number; state: 'mute' | 'unmute' | 'toggle' } }
	recall_preset: { options: { preset: number } }
	refresh: { options: Record<string, never> }
}

const faderChoices: DropdownChoice<number>[] = FADER_CHANNELS.map((c) => ({ id: c.id, label: c.label }))
const channelChoices: DropdownChoice<number>[] = CHANNELS.map((c) => ({ id: c.id, label: c.label }))
const presetChoices: DropdownChoice<number>[] = PRESETS.map((p) => ({ id: p.id, label: p.label }))

export function UpdateActions(self: ModuleInstance): void {
	self.setActionDefinitions({
		set_fader: {
			name: 'Set fader level',
			options: [
				{ id: 'channel', type: 'dropdown', label: 'Channel', choices: faderChoices, default: 0 },
				{
					id: 'level',
					type: 'number',
					label: 'Level (dB)',
					default: 0,
					min: -80,
					max: 10,
					step: 0.1,
					showMinAsNegativeInfinity: true,
					clampValues: true,
				},
			],
			callback: async ({ options }) => {
				self.setFader(options.channel, options.level)
			},
		},
		adjust_fader: {
			name: 'Adjust fader level',
			description: 'Raise or lower a fader relative to its current level. Requires the current level to be known.',
			options: [
				{ id: 'channel', type: 'dropdown', label: 'Channel', choices: faderChoices, default: 0 },
				{
					id: 'delta',
					type: 'number',
					label: 'Change (dB, negative to lower)',
					default: 1,
					min: -90,
					max: 90,
					step: 0.1,
					clampValues: true,
				},
			],
			callback: async ({ options }) => {
				self.adjustFader(options.channel, options.delta)
			},
		},
		set_mute: {
			name: 'Mute / unmute channel',
			options: [
				{ id: 'channel', type: 'dropdown', label: 'Channel', choices: channelChoices, default: 0 },
				{
					id: 'state',
					type: 'dropdown',
					label: 'Action',
					choices: [
						{ id: 'mute', label: 'Mute' },
						{ id: 'unmute', label: 'Unmute' },
						{ id: 'toggle', label: 'Toggle' },
					],
					default: 'toggle',
				},
			],
			callback: async ({ options }) => {
				self.setMute(options.channel, options.state)
			},
		},
		recall_preset: {
			name: 'Recall preset',
			options: [{ id: 'preset', type: 'dropdown', label: 'Preset', choices: presetChoices, default: 0 }],
			callback: async ({ options }) => {
				self.recallPreset(options.preset)
			},
		},
		refresh: {
			name: 'Refresh state from mixer',
			options: [],
			callback: async () => {
				self.queryState()
			},
		},
	})
}
