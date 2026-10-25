import { ipaToIds } from './ipa.js';

// Runs a Piper (VITS) voice on IPA input. `ort` is onnxruntime-web in the
// extension and onnxruntime-node in scripts, which share the same API.
export class PiperVoice {
  constructor(ort, session, config) {
    this.ort = ort;
    this.session = session;
    this.config = config;
  }

  get sampleRate() {
    return this.config.audio.sample_rate;
  }

  /** @returns {Promise<{ samples: Float32Array, dropped: string[] }>} */
  async synthesize(ipa, { rate = 1 } = {}) {
    const { ids, phonemes, dropped } = ipaToIds(ipa, this.config.phoneme_id_map, this.config.espeak?.voice);
    if (!phonemes.length) return { samples: new Float32Array(0), dropped };

    const { Tensor } = this.ort;
    const { noise_scale, length_scale, noise_w } = this.config.inference;
    const feeds = {
      input: new Tensor('int64', BigInt64Array.from(ids, BigInt), [1, ids.length]),
      input_lengths: new Tensor('int64', BigInt64Array.of(BigInt(ids.length)), [1]),
      scales: new Tensor('float32', Float32Array.of(noise_scale, length_scale / rate, noise_w), [3]),
    };
    const { output } = await this.session.run(feeds);
    return { samples: output.data, dropped };
  }
}
