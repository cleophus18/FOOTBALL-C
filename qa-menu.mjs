export default async function run(page) {
  await page.waitForSelector(".menu-shell");
  await page.waitForTimeout(400);

  // Sample the ball's translateY via the Web Animations API for a full cycle.
  const trace = await page.evaluate(async () => {
    const el = document.querySelector(".football");
    const anim = el.getAnimations()[0];
    anim.pause();
    const dur = anim.effect.getTiming().duration;
    const samples = [];
    for (let i = 0; i <= 40; i++) {
      const t = (dur * i) / 40;
      anim.currentTime = t;
      const r = el.getBoundingClientRect();
      samples.push({ t: Math.round(t), y: +r.top.toFixed(1) });
    }
    anim.play();
    return { dur, samples };
  });

  const ys = trace.samples.map((s) => s.y);
  const lowest = Math.max(...ys); // resting/floor
  const highest = Math.min(...ys); // apex
  // Split into climb and fall to measure speed per segment.
  const apexIdx = ys.indexOf(highest);

  const climb = trace.samples.slice(0, apexIdx + 1);
  const fall = trace.samples.slice(apexIdx);
  const speed = (arr) =>
    arr
      .slice(1)
      .map(
        (s, i) =>
          +(Math.abs(s.y - arr[i].y) / Math.max(1, s.t - arr[i].t)).toFixed(4),
      );

  const climbSpeed = speed(climb);
  const fallSpeed = speed(fall);

  return {
    duration: trace.dur,
    floor: lowest,
    apex: highest,
    rise: +(lowest - highest).toFixed(1),
    climbSpeeds: climbSpeed,
    fallSpeeds: fallSpeed,
    // Gravity test: speed should shrink toward apex, grow away from it.
    climbDecelerates: climbSpeed[climbSpeed.length - 1] < climbSpeed[0],
    fallAccelerates: fallSpeed[fallSpeed.length - 1] > fallSpeed[0],
    samples: trace.samples.filter((_, i) => i % 4 === 0),
  };
}
