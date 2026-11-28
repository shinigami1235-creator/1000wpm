"""Loudness and size table for every boss track, measured on the mp3s as shipped (ffmpeg's EBU R128 meter),
plus a picture per track. Writes loudness.md into the preview folder.

    python3 tools/music/report.py [preview_dir]
"""
import os, sys, glob, subprocess
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
import engine as E
import analyze as A

def dur(p):
    return float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', p], capture_output=True, text=True).stdout)

def table(title, files, out_img):
    rows = [f'### {title}', '', '| file | length s | LUFS | true peak dBTP | LRA | KB |', '|---|---|---|---|---|---|']
    tot = 0
    for p in files:
        m = E.measure(p); kb = os.path.getsize(p) // 1024; tot += kb
        rows.append(f"| {os.path.basename(p)} | {dur(p):.1f} | {m['I']:.1f} | {m['TP']:.1f} | {m['LRA']:.1f} | {kb} |")
        if out_img: A.picture(E.read_audio(p), os.path.basename(p)[:-4], os.path.join(out_img, os.path.basename(p)[:-4] + '.png'))
    rows.append(f'| total | | | | | {tot} ({tot / 1024:.2f} MB) |')
    return rows

if __name__ == '__main__':
    prev = sys.argv[1] if len(sys.argv) > 1 else '/mnt/user-data/outputs/overnight/raid-music'
    au = os.path.join(ROOT, 'audio')
    sets = [('World Boss', sorted(glob.glob(os.path.join(au, 'wb-*.mp3'))), os.path.join(prev, 'img')),
            ('Superboss', sorted(glob.glob(os.path.join(au, 'sb-*.mp3'))), os.path.join(prev, 'superboss', 'img')),
            ('Boss Rush', sorted(glob.glob(os.path.join(au, 'rush-press-*.mp3')) + glob.glob(os.path.join(au, 'rush-correction-*.mp3'))
                                 + glob.glob(os.path.join(au, 'rush-syntax-*.mp3')) + glob.glob(os.path.join(au, 'rush-announcer-*.mp3'))), os.path.join(prev, 'rush', 'img'))]
    lines = ['# Boss music: loudness and sizes', '', 'Measured on the mp3 files in audio/ with ffmpeg ebur128 (integrated LUFS, true peak).', '']
    for t, fs, img in sets:
        if not fs: continue
        os.makedirs(img, exist_ok=True)
        lines += table(t, fs, img) + ['']
    open(os.path.join(prev, 'loudness.md'), 'w').write('\n'.join(lines))
    print('\n'.join(lines))
