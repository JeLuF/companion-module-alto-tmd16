import type ModuleInstance from './main.js'
import { CHANNELS, FADER_CHANNELS, METERS } from './protocol.js'

export type VariablesSchema = Record<string, string | number>

export function UpdateVariableDefinitions(self: ModuleInstance): void {
	const defs: Record<string, { name: string }> = {
		preset: { name: 'Current preset' },
	}
	for (const ch of FADER_CHANNELS) {
		defs[`fader_${ch.key}`] = { name: `Fader level (dB): ${ch.label}` }
		defs[`fader_raw_${ch.key}`] = { name: `Fader level (raw 0-255): ${ch.label}` }
	}
	for (const ch of CHANNELS) {
		defs[`mute_${ch.key}`] = { name: `Mute state: ${ch.label}` }
	}
	METERS.forEach((m) => {
		if (m.key !== 'unused') defs[`meter_${m.key}`] = { name: `Level meter (dB): ${m.label}` }
	})
	self.setVariableDefinitions(defs)
}
