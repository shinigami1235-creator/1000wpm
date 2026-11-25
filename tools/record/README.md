# Gameplay clips

Records a fight in headless Chrome and saves an MP4, so a fix can be watched without playing up to it.

    python3 tools/record/rec.py raid 45 world-boss.mp4
    python3 tools/record/rec.py rush 40 boss-rush.mp4
    python3 tools/record/rec.py sb-hydra 40 superboss-hydra.mp4     (also sb-compiler, sb-leviathan)

The page runs on a clock slowed to a quarter, since software WebGL draws only about 8 frames a second, and the video is sped back up 4 times to about 30 frames a second. A bot types the words and blocks most attacks, letting one land so the hit shows too. Clips have no sound since headless Chrome records none. Needs Python Playwright, Chrome and ffmpeg.
