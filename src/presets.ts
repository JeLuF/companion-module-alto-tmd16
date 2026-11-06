import type { CompanionPresetDefinitions, CompanionPresetSection } from '@companion-module/base'
import type ModuleInstance from './main.js'
import type { ModuleSchema } from './main.js'
import { CHANNELS, FADER_CHANNELS, PRESETS } from './protocol.js'

export function UpdatePresets(self: ModuleInstance): void {
	const presets: CompanionPresetDefinitions<ModuleSchema> = {}
	const muteIds: string[] = []
	const faderIds: string[] = []
	const presetIds: string[] = []

	for (const ch of CHANNELS) {
		const id = `mute_${ch.key}`
		muteIds.push(id)
		presets[id] = {
			type: 'simple',
			name: `Mute ${ch.label}`,
			style: { text: `${ch.label}\\nMUTE`, size: 'auto', color: 0xffffff, bgcolor: 0x000000 },
			steps: [
				{
					down: [{ actionId: 'set_mute', options: { channel: ch.id, state: 'toggle' } }],
					up: [],
				},
			],
			feedbacks: [
				{
					feedbackId: 'mute_state',
					options: { channel: ch.id },
					style: { bgcolor: 0xcc0000, color: 0xffffff },
				},
			],
		}
	}

	for (const ch of FADER_CHANNELS) {
		for (const [dir, delta] of [
			['up', 1],
			['down', -1],
		] as const) {
			const id = `fader_${dir}_${ch.key}`
			faderIds.push(id)
			presets[id] = {
				type: 'simple',
				name: `${ch.label} fader ${dir}`,
				style: {
					text: `${ch.label}\\n${dir === 'up' ? '+' : '-'}1 dB`,
					size: 'auto',
					color: 0xffffff,
					bgcolor: 0x000000,
				},
				steps: [
					{
						down: [{ actionId: 'adjust_fader', options: { channel: ch.id, delta } }],
						up: [],
					},
				],
				feedbacks: [],
			}
		}
	}

	for (const p of PRESETS) {
		const id = `preset_${p.id}`
		presetIds.push(id)
		presets[id] = {
			type: 'simple',
			name: `Recall ${p.label}`,
			style: {
				text: p.id === 0 ? 'Factory\\nPreset' : `User\\nPreset ${p.id}`,
				size: 'auto',
				color: 0xffffff,
				bgcolor: 0x000000,
			},
			steps: [{ down: [{ actionId: 'recall_preset', options: { preset: p.id } }], up: [] }],
			feedbacks: [
				{
					feedbackId: 'preset_active',
					options: { preset: p.id },
					style: { bgcolor: 0x0044aa, color: 0xffffff },
				},
			],
		}
	}

	const structure: CompanionPresetSection[] = [
		{
			id: 'mutes',
			name: 'Mutes',
			definitions: [{ id: 'mutes_group', name: 'Channel mutes', type: 'simple', presets: muteIds }],
		},
		{
			id: 'faders',
			name: 'Faders',
			definitions: [{ id: 'faders_group', name: 'Fader up/down (1 dB steps)', type: 'simple', presets: faderIds }],
		},
		{
			id: 'presets',
			name: 'Presets',
			definitions: [{ id: 'presets_group', name: 'Preset recall', type: 'simple', presets: presetIds }],
		},
	]

	self.setPresetDefinitions(structure, presets)
}
