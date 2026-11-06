/**
 * Alto Professional TMD16 network protocol (TCP client, port 9761).
 *
 * Packet layout (both directions):
 *   7B 7D | DATA_LEN | CMD | DATA (DATA_LEN bytes) | 7D 7B
 */

export const DEFAULT_PORT = 9761

const HEADER = [0x7b, 0x7d] as const
const TRAILER = [0x7d, 0x7b] as const
/** Header + length + cmd + trailer */
const OVERHEAD = 6

export const Cmd = {
	// host -> mixer
	SetGain: 0x11,
	SetMute: 0x12,
	RecallPreset: 0x13,
	GetGain: 0x14,
	GetMute: 0x15,
	GetPreset: 0x16,
	GetMeters: 0x17,
	// mixer -> host
	Ack: 0x20,
	Gain: 0x21,
	Mute: 0x22,
	Preset: 0x23,
	Meters: 0x24,
} as const

export interface Packet {
	cmd: number
	data: Buffer
}

export function buildPacket(cmd: number, ...data: number[]): Buffer {
	return Buffer.from([...HEADER, data.length, cmd, ...data, ...TRAILER])
}

/**
 * Reassembles packets from a TCP byte stream. Framing is length based (there is no byte
 * escaping), and the parser resynchronises on the next header if a frame is malformed.
 */
export class PacketParser {
	#buf: Buffer = Buffer.alloc(0)

	push(chunk: Buffer): Packet[] {
		this.#buf = this.#buf.length === 0 ? chunk : Buffer.concat([this.#buf, chunk])
		const packets: Packet[] = []

		for (;;) {
			const start = this.#buf.indexOf(Buffer.from(HEADER))
			if (start === -1) {
				// Keep a trailing 0x7B, it may be the first half of a header
				this.#buf =
					this.#buf.length > 0 && this.#buf[this.#buf.length - 1] === HEADER[0]
						? this.#buf.subarray(-1)
						: Buffer.alloc(0)
				break
			}
			if (start > 0) this.#buf = this.#buf.subarray(start)
			if (this.#buf.length < 4) break

			const dataLen = this.#buf[2]
			const total = dataLen + OVERHEAD
			if (this.#buf.length < total) break

			if (this.#buf[total - 2] === TRAILER[0] && this.#buf[total - 1] === TRAILER[1]) {
				packets.push({ cmd: this.#buf[3], data: Buffer.from(this.#buf.subarray(4, 4 + dataLen)) })
				this.#buf = this.#buf.subarray(total)
			} else {
				// Bad frame: skip this header byte and look for the next one
				this.#buf = this.#buf.subarray(1)
			}
		}
		return packets
	}

	reset(): void {
		this.#buf = Buffer.alloc(0)
	}
}

// ---------------------------------------------------------------------------
// Channels
// ---------------------------------------------------------------------------

export interface ChannelInfo {
	/** Channel number used on the wire */
	id: number
	/** Used in variable ids */
	key: string
	label: string
	/** Whether the channel has a fader (get/set gain is only valid for channels 0-11) */
	hasFader: boolean
}

export const CHANNELS: ChannelInfo[] = [
	...Array.from({ length: 8 }, (_, i) => ({ id: i, key: `ch${i + 1}`, label: `Ch ${i + 1}`, hasFader: true })),
	{ id: 8, key: 'ch9_10', label: 'Ch 9/10', hasFader: true },
	{ id: 9, key: 'ch11_12', label: 'Ch 11/12', hasFader: true },
	{ id: 10, key: 'ch13_14', label: 'Ch 13/14', hasFader: true },
	{ id: 11, key: 'ch15_16', label: 'Ch 15/16', hasFader: true },
	{ id: 12, key: 'main', label: 'Main L/R', hasFader: false },
	{ id: 13, key: 'sub1_2', label: 'SUB 1/2', hasFader: false },
	{ id: 14, key: 'sub3_4', label: 'SUB 3/4', hasFader: false },
	{ id: 15, key: 'aux1', label: 'Aux 1', hasFader: false },
	{ id: 16, key: 'aux2', label: 'Aux 2', hasFader: false },
	{ id: 17, key: 'aux3', label: 'Aux 3', hasFader: false },
	{ id: 18, key: 'fx', label: 'FX', hasFader: false },
]

export const FADER_CHANNELS = CHANNELS.filter((c) => c.hasFader)

export const PRESETS: { id: number; label: string }[] = [
	{ id: 0, label: 'Factory Preset' },
	...Array.from({ length: 9 }, (_, i) => ({ id: i + 1, label: `User Preset ${String(i + 1).padStart(2, '0')}` })),
]

// ---------------------------------------------------------------------------
// Level meters: 32 slots, stereo pairs take two slots (L, R)
// ---------------------------------------------------------------------------

export const METER_COUNT = 32

const meterNames: { key: string; label: string }[] = []
for (let i = 1; i <= 8; i++) meterNames.push({ key: `in${i}`, label: `Input ${i}` })
for (const pair of ['9_10', '11_12', '13_14', '15_16']) {
	meterNames.push({ key: `in${pair}_l`, label: `Input ${pair.replace('_', '/')} L` })
	meterNames.push({ key: `in${pair}_r`, label: `Input ${pair.replace('_', '/')} R` })
}
for (const [key, label] of [
	['fx', 'FX'],
	['master', 'Master'],
	['sub1_2', 'SUB 1/2'],
	['sub3_4', 'SUB 3/4'],
]) {
	meterNames.push({ key: `${key}_l`, label: `${label} L` })
	meterNames.push({ key: `${key}_r`, label: `${label} R` })
}
for (let i = 1; i <= 3; i++) meterNames.push({ key: `aux${i}`, label: `Aux ${i}` })
meterNames.push({ key: 'unused', label: '(unused)' })
meterNames.push({ key: 'mon_l', label: 'Monitor L' }, { key: 'mon_r', label: 'Monitor R' })
meterNames.push({ key: 'usb_l', label: 'USB L' }, { key: 'usb_r', label: 'USB R' })

/** Index in this array == slot index in the level meter packet. `unused` slot is kept for alignment. */
export const METERS = meterNames

/** Meter byte: 0x00-0x7F = 0..+127 dB, 0x80-0xFF = -128..-1 dB (signed 8 bit) */
export function meterByteToDb(byte: number): number {
	return byte < 0x80 ? byte : byte - 0x100
}

// ---------------------------------------------------------------------------
// Gain table (value 0-255 -> dB)
// ---------------------------------------------------------------------------

function range(from: number, to: number, step: number): number[] {
	const out: number[] = []
	const n = Math.round((to - from) / step)
	for (let i = 0; i <= n; i++) out.push(Math.round((from + i * step) * 10) / 10)
	return out
}

/**
 * Taken from the user guide's gain table. Index 0 is -infinity.
 * Note: the guide lists value 197 as "0.2", which is clearly a typo (196 = 0.8, 198 = 1.0); 0.9 is used here.
 */
export const GAIN_TABLE: number[] = [
	-Infinity, // 0
	-80.0, // 1
	...range(-78, -47, 1), // 2-33
	...range(-46.3, -40.0, 0.7), // 34-43
	...range(-39.7, -37.6, 0.3), // 44-51
	...range(-37.3, -35.2, 0.3), // 52-59
	...range(-34.8, -20.8, 0.4), // 60-95
	...range(-20.6, -20.0, 0.2), // 96-99
	...range(-19.7, -10.1, 0.3), // 100-132
	-9.8, // 133
	...range(-9.6, -6.0, 0.2), // 134-152
	...range(-5.9, -5.0, 0.1), // 153-162
	...range(-4.8, -1.0, 0.2), // 163-182
	...range(-0.9, 0.0, 0.1), // 183-192
	...range(0.2, 0.8, 0.2), // 193-196
	0.9, // 197 (guide says 0.2, see above)
	...range(1.0, 2.8, 0.2), // 198-207
	...range(3.2, 4.0, 0.2), // 208-212 (the guide skips 3.0)
	...range(4.1, 6.6, 0.1), // 213-238
	...range(6.8, 10.0, 0.2), // 239-255
]

if (GAIN_TABLE.length !== 256) {
	throw new Error(`TMD16 gain table has ${GAIN_TABLE.length} entries, expected 256`)
}

export function gainValueToDb(value: number): number {
	return GAIN_TABLE[Math.max(0, Math.min(255, Math.round(value)))]
}

/** Nearest wire value for a dB figure. -80 dB and below maps to 0 (-infinity). */
export function dbToGainValue(db: number): number {
	if (db <= -80) return 0
	let best = 1
	let bestDiff = Infinity
	for (let i = 1; i < GAIN_TABLE.length; i++) {
		const diff = Math.abs(GAIN_TABLE[i] - db)
		if (diff < bestDiff) {
			best = i
			bestDiff = diff
		}
	}
	return best
}

export function formatDb(db: number): string {
	return db === -Infinity ? '-inf' : db.toFixed(1)
}
