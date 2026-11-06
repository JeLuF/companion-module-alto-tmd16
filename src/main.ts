import { InstanceBase, InstanceStatus, TCPHelper, type SomeCompanionConfigField } from '@companion-module/base'
import { GetConfigFields, type ModuleConfig } from './config.js'
import { UpdateVariableDefinitions, type VariablesSchema } from './variables.js'
import { UpgradeScripts } from './upgrades.js'
import { UpdateActions, type ActionsSchema } from './actions.js'
import { UpdateFeedbacks, type FeedbacksSchema } from './feedbacks.js'
import { UpdatePresets } from './presets.js'
import {
	CHANNELS,
	Cmd,
	DEFAULT_PORT,
	FADER_CHANNELS,
	GAIN_TABLE,
	METERS,
	PacketParser,
	buildPacket,
	dbToGainValue,
	formatDb,
	gainValueToDb,
	meterByteToDb,
	type Packet,
} from './protocol.js'

export type ModuleSchema = {
	config: ModuleConfig
	secrets: undefined
	actions: ActionsSchema
	feedbacks: FeedbacksSchema
	variables: VariablesSchema
}

export { UpgradeScripts }

export default class ModuleInstance extends InstanceBase<ModuleSchema> {
	config!: ModuleConfig // Setup in init()

	/** Last known state of the mixer */
	readonly gains = new Map<number, number>() // channel -> raw 0-255
	readonly mutes = new Map<number, boolean>() // channel -> muted
	preset: number | undefined

	#tcp: TCPHelper | undefined
	#parser = new PacketParser()
	#pollTimer: NodeJS.Timeout | undefined
	#meterTimer: NodeJS.Timeout | undefined

	constructor(internal: unknown) {
		super(internal)
	}

	async init(config: ModuleConfig): Promise<void> {
		this.config = config

		this.updateActions()
		this.updateFeedbacks()
		this.updatePresets()
		this.updateVariableDefinitions()

		this.#connect()
	}

	// When module gets deleted
	async destroy(): Promise<void> {
		this.#disconnect()
		this.log('debug', 'destroy')
	}

	async configUpdated(config: ModuleConfig): Promise<void> {
		this.config = config
		this.#connect()
	}

	// Return config fields for web config
	getConfigFields(): SomeCompanionConfigField[] {
		return GetConfigFields()
	}

	updateActions(): void {
		UpdateActions(this)
	}

	updateFeedbacks(): void {
		UpdateFeedbacks(this)
	}

	updatePresets(): void {
		UpdatePresets(this)
	}

	updateVariableDefinitions(): void {
		UpdateVariableDefinitions(this)
	}

	// -----------------------------------------------------------------------
	// Connection
	// -----------------------------------------------------------------------

	#disconnect(): void {
		clearInterval(this.#pollTimer)
		clearInterval(this.#meterTimer)
		this.#pollTimer = undefined
		this.#meterTimer = undefined
		this.#tcp?.destroy()
		this.#tcp = undefined
		this.#parser.reset()
	}

	#connect(): void {
		this.#disconnect()

		if (!this.config.host) {
			this.updateStatus(InstanceStatus.BadConfig, 'No IP address configured')
			return
		}

		this.updateStatus(InstanceStatus.Connecting)
		const tcp = new TCPHelper(this.config.host, this.config.port || DEFAULT_PORT)
		this.#tcp = tcp

		tcp.on('status_change', (status, message) => this.updateStatus(status, message ?? null))
		tcp.on('error', (err) => this.log('error', `Connection error: ${err.message}`))
		tcp.on('connect', () => {
			this.#parser.reset()
			this.queryState()
			this.#startPolling()
		})
		tcp.on('end', () => {
			clearInterval(this.#pollTimer)
			clearInterval(this.#meterTimer)
		})
		tcp.on('data', (data) => {
			for (const packet of this.#parser.push(data)) this.#handlePacket(packet)
		})
	}

	#startPolling(): void {
		clearInterval(this.#pollTimer)
		clearInterval(this.#meterTimer)

		if (this.config.pollInterval > 0) {
			this.#pollTimer = setInterval(() => this.queryState(), Math.max(500, this.config.pollInterval))
		}
		if (this.config.meterInterval > 0) {
			this.#meterTimer = setInterval(
				() => this.#send(buildPacket(Cmd.GetMeters)),
				Math.max(50, this.config.meterInterval),
			)
		}
	}

	#send(data: Buffer): void {
		if (!this.#tcp?.isConnected) return
		this.#tcp.sendAsync(data).catch((err: Error) => this.log('warn', `Send failed: ${err.message}`))
	}

	/** Request all faders, mutes and the current preset in one write. */
	queryState(): void {
		this.#send(
			Buffer.concat([
				...FADER_CHANNELS.map((c) => buildPacket(Cmd.GetGain, c.id)),
				...CHANNELS.map((c) => buildPacket(Cmd.GetMute, c.id)),
				buildPacket(Cmd.GetPreset),
			]),
		)
	}

	// -----------------------------------------------------------------------
	// Incoming data
	// -----------------------------------------------------------------------

	#handlePacket(packet: Packet): void {
		const { cmd, data } = packet
		switch (cmd) {
			case Cmd.Gain:
				if (data.length >= 2) this.#updateGain(data[0], data[1])
				break
			case Cmd.Mute:
				if (data.length >= 2) this.#updateMute(data[0], data[1] !== 0)
				break
			case Cmd.Preset:
				if (data.length >= 1) this.#updatePreset(data[0])
				break
			case Cmd.Meters:
				this.#updateMeters(data)
				break
			case Cmd.Ack:
				break
			default:
				this.log('debug', `Unhandled packet 0x${cmd.toString(16)}: ${data.toString('hex')}`)
		}
	}

	#updateGain(channel: number, raw: number): void {
		const ch = CHANNELS.find((c) => c.id === channel)
		if (!ch || !ch.hasFader) return
		this.gains.set(channel, raw)
		this.setVariableValues({
			[`fader_${ch.key}`]: formatDb(gainValueToDb(raw)),
			[`fader_raw_${ch.key}`]: raw,
		})
		this.checkFeedbacks('fader_level')
	}

	#updateMute(channel: number, muted: boolean): void {
		const ch = CHANNELS.find((c) => c.id === channel)
		if (!ch) return
		this.mutes.set(channel, muted)
		this.setVariableValues({ [`mute_${ch.key}`]: muted ? 'muted' : 'unmuted' })
		this.checkFeedbacks('mute_state')
	}

	#updatePreset(preset: number): void {
		this.preset = preset
		this.setVariableValues({ preset: preset === 0 ? 'Factory' : `User ${preset}` })
		this.checkFeedbacks('preset_active')
	}

	#updateMeters(data: Buffer): void {
		const values: VariablesSchema = {}
		METERS.forEach((m, i) => {
			if (m.key !== 'unused' && i < data.length) values[`meter_${m.key}`] = meterByteToDb(data[i])
		})
		this.setVariableValues(values)
	}

	// -----------------------------------------------------------------------
	// Commands (used by actions)
	// -----------------------------------------------------------------------

	/** Set a fader to a dB value (-80 dB or lower = -infinity). */
	setFader(channel: number, db: number): void {
		this.#writeFader(channel, dbToGainValue(db))
	}

	/** Move a fader relative to its last known position. */
	adjustFader(channel: number, deltaDb: number): void {
		const current = this.gains.get(channel)
		if (current === undefined) {
			this.log('warn', `Cannot adjust fader ${channel}: current level not known yet`)
			return
		}
		const currentDb = current === 0 ? -80 : gainValueToDb(current)
		let target = dbToGainValue(currentDb + deltaDb)
		// Table steps can be coarser than the requested change; always move at least one step
		if (target === current && deltaDb !== 0) {
			target = Math.max(0, Math.min(GAIN_TABLE.length - 1, current + Math.sign(deltaDb)))
		}
		this.#writeFader(channel, target)
	}

	#writeFader(channel: number, raw: number): void {
		this.#send(Buffer.concat([buildPacket(Cmd.SetGain, channel, raw), buildPacket(Cmd.GetGain, channel)]))
		this.#updateGain(channel, raw) // optimistic; the read-back above corrects it if needed
	}

	setMute(channel: number, state: 'mute' | 'unmute' | 'toggle'): void {
		const muted = state === 'toggle' ? !this.mutes.get(channel) : state === 'mute'
		this.#send(Buffer.concat([buildPacket(Cmd.SetMute, channel, muted ? 1 : 0), buildPacket(Cmd.GetMute, channel)]))
		this.#updateMute(channel, muted)
	}

	recallPreset(preset: number): void {
		this.#send(Buffer.concat([buildPacket(Cmd.RecallPreset, preset)]))
		// A preset changes faders and mutes, so re-read everything shortly after
		setTimeout(() => this.queryState(), 300)
		this.#updatePreset(preset)
	}
}
