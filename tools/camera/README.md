# Camera checks

The World Boss camera is called by `js/app/camdir.js` (the director) from the shots in `js/app/boss3d.js`. These run the raid in headless Chrome and say what the camera did.

    python3 tools/camera/rec_cam.py raid-feel 20 /tmp/cam.mp4     # a clip plus /tmp/cam.json, the camera log
    python3 tools/camera/metrics.py /tmp/cam.json                  # shots, cuts, framing, speed, wind-ups
    python3 tools/camera/shots.py /tmp/shots strike back scale     # one screenshot per shot, two per sequence

What metrics.py should show for a good fight:
- `windup_in_a_cutaway_%` under 1: nothing hides an attack you have to type against (the dodge is the exception, since it is that attack).
- `both_in_frame_%` near 90: you and the boss both on screen.
- `screen_side_flips` 0: you stay on the same side of the boss across cuts.
- `cam_turn_deg_s_p95` under 70 and `cam_speed_p95` under 20: no whip pans.

Numbers from 27 Nov 2026, the same 62 s fight before and after the director's rules: 30 hard cuts to 18, both in frame 81% to 89%, camera turn p95 137 to 52 degrees a second, wind-ups inside a cutaway 4.5% to 0.3%.

Needs Python Playwright, Chrome and ffmpeg, like tools/record.
