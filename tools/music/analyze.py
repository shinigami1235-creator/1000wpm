"""Checks for rendered music: a waveform, spectrogram and average-spectrum picture per file, the
third-octave balance, crest factor, stereo correlation and a loop-seam check.

    python3 tools/music/analyze.py out_dir file.mp3 [file.mp3 ...]
    python3 tools/music/analyze.py --seam file.mp3 loop_seconds [loop_at]
"""
import os, sys, json
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import engine as E

BANDS = [31, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]

def octave_balance(x):
    m = x.mean(axis=1)
    f = np.fft.rfftfreq(8192, 1 / E.SR)
    acc = np.zeros(len(f)); k = 0
    for s in range(0, len(m) - 8192, 4096):
        acc += np.abs(np.fft.rfft(m[s:s + 8192] * np.hanning(8192))) ** 2; k += 1
    acc /= max(1, k)
    out = {}
    for c in BANDS:
        sel = (f >= c / 2 ** 0.5) & (f < c * 2 ** 0.5)
        out[c] = 10 * np.log10(acc[sel].sum() + 1e-12)
    ref = out[1000]
    return {c: round(v - ref, 1) for c, v in out.items()}

def stats(x):
    m = x.mean(axis=1)
    rms = np.sqrt((x ** 2).mean()); pk = np.abs(x).max()
    corr = np.corrcoef(x[:, 0], x[:, 1])[0, 1]
    side = (x[:, 0] - x[:, 1]) / 2
    return {'crest_db': round(20 * np.log10(pk / rms), 1), 'corr': round(float(corr), 2),
            'side_db': round(20 * np.log10(np.sqrt((side ** 2).mean()) / np.sqrt((m ** 2).mean())), 1)}

def seam(x, loop_s, at=0.5):
    """the jump at the loop point against ordinary sample-to-sample steps around it"""
    a = int(round(at * E.SR)); L = int(round(loop_s * E.SR))
    end = x[a + L - 1]; start = x[a]
    jump = np.abs(start - end).max()
    steps = np.abs(np.diff(x[a + L - 2000:a + L], axis=0)).max()
    # the audio just before the loop end should match what the head copy has there
    tail = x[a + L - 4410:a + L]; head = x[a - 4410:a] if a >= 4410 else None
    diff = float(np.abs(tail - head).max()) if head is not None else None
    return {'jump': round(float(jump), 4), 'typical_step': round(float(steps), 4), 'head_tail_diff': diff}

def picture(x, title, path):
    import matplotlib; matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    m = x.mean(axis=1)
    fig, ax = plt.subplots(3, 1, figsize=(12, 7.5), gridspec_kw={'height_ratios': [1, 1.6, 1]})
    fig.patch.set_facecolor('#0b0f17')
    for a in ax:
        a.set_facecolor('#0b0f17'); a.tick_params(colors='#9aa7b8', labelsize=8)
        for s in a.spines.values(): s.set_color('#2a3446')
    t = np.arange(len(m)) / E.SR
    hop = max(1, len(m) // 3000)
    env = np.abs(x[:len(m) // hop * hop]).reshape(-1, hop, 2).max(axis=1)
    tt = t[:len(env) * hop:hop]
    ax[0].fill_between(tt, -env[:, 1], env[:, 0], color='#3ee6ff', lw=0)
    ax[0].set_xlim(0, t[-1]); ax[0].set_ylim(-1, 1); ax[0].set_title(title, color='#e6edf5', fontsize=11, loc='left')
    ax[0].set_ylabel('wave', color='#9aa7b8', fontsize=8)
    ax[1].specgram(m, NFFT=2048, Fs=E.SR, noverlap=1024, cmap='magma', vmin=-120, vmax=-20)
    ax[1].set_yscale('symlog', linthresh=200); ax[1].set_ylim(30, 16000); ax[1].set_ylabel('Hz', color='#9aa7b8', fontsize=8)
    ax[1].set_xlim(0, t[-1])
    f = np.fft.rfftfreq(8192, 1 / E.SR); acc = np.zeros(len(f)); k = 0
    for s in range(0, len(m) - 8192, 4096):
        acc += np.abs(np.fft.rfft(m[s:s + 8192] * np.hanning(8192))) ** 2; k += 1
    spec = 10 * np.log10(acc / max(1, k) + 1e-12)
    ax[2].semilogx(f[1:], spec[1:] - spec[1:].max(), color='#ff4f6d', lw=0.8)
    ax[2].set_xlim(25, 18000); ax[2].set_ylim(-80, 3); ax[2].set_ylabel('dB', color='#9aa7b8', fontsize=8)
    ax[2].set_xlabel('average spectrum (Hz)', color='#9aa7b8', fontsize=8); ax[2].grid(color='#1c2433', lw=0.5)
    fig.tight_layout(); fig.savefig(path, dpi=90, facecolor=fig.get_facecolor()); plt.close(fig)

if __name__ == '__main__':
    if sys.argv[1] == '--seam':
        x = E.read_audio(sys.argv[2]); print(seam(x, float(sys.argv[3]), float(sys.argv[4]) if len(sys.argv) > 4 else 0.5)); sys.exit()
    out = sys.argv[1]; os.makedirs(out, exist_ok=True)
    for p in sys.argv[2:]:
        x = E.read_audio(p); n = os.path.splitext(os.path.basename(p))[0]
        picture(x, n, os.path.join(out, n + '.png'))
        print(n, E.measure(p), stats(x), octave_balance(x))
