## Alto Professional TMD16

Controls the TMD16 mixer over its network interface (TCP, port 9761).

**Setup:** the IP address and subnet mask of the computer running Companion must match the Net IP and Mask configured on the TMD16. Enter the TMD16's IP address in the module configuration.

### Actions

- **Set fader level** – channels 1–8 and 9/10–15/16, in dB (-80 and below = -∞)
- **Adjust fader level** – relative change in dB
- **Mute / unmute channel** – channels, Main L/R, SUB, Aux and FX; mute, unmute or toggle
- **Recall preset** – factory preset or user presets 01–09
- **Refresh state from mixer**

### Feedbacks

- Channel is muted
- Fader level compared to a value
- Preset is current

### Variables

`fader_<ch>` (dB), `fader_raw_<ch>` (0–255), `mute_<ch>`, `preset`, and `meter_<name>` (dB) for the level meters.

The module polls fader/mute/preset state (default every 3 s) so changes made on the desk show up. Level meter polling is off by default; set a meter poll interval in the configuration to enable the `meter_*` variables.

Note: the protocol only allows fader control for channels 1–16; Main, SUB, Aux and FX support mute only.
