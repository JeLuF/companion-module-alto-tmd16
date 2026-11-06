import { Regex, type SomeCompanionConfigField } from '@companion-module/base'
import { DEFAULT_PORT } from './protocol.js'

export type ModuleConfig = {
	host: string
	port: number
	pollInterval: number
	meterInterval: number
}

export function GetConfigFields(): SomeCompanionConfigField[] {
	return [
		{
			type: 'static-text',
			id: 'info',
			label: 'Information',
			width: 12,
			value:
				'The IP address and subnet mask of the computer running Companion must match the Net IP and Mask configured on the TMD16.',
		},
		{
			type: 'textinput',
			id: 'host',
			label: 'TMD16 IP address',
			width: 8,
			regex: Regex.IP,
		},
		{
			type: 'number',
			id: 'port',
			label: 'Port',
			width: 4,
			min: 1,
			max: 65535,
			default: DEFAULT_PORT,
		},
		{
			type: 'number',
			id: 'pollInterval',
			label: 'Status poll interval (ms, 0 = off)',
			tooltip: 'How often fader, mute and preset state is re-read from the mixer, to pick up changes made on the desk.',
			width: 6,
			min: 0,
			max: 60000,
			default: 3000,
		},
		{
			type: 'number',
			id: 'meterInterval',
			label: 'Level meter poll interval (ms, 0 = off)',
			tooltip: 'Updates the meter_* variables. Leave off unless you need them, as it generates continuous traffic.',
			width: 6,
			min: 0,
			max: 10000,
			default: 0,
		},
	]
}
