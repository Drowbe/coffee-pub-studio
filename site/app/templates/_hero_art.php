<?php /* Hero illustration: three scenes that crossfade on an 18s loop. Pure CSS, no scripts. */
$call = '<g class="call" transform="translate(335 340)">
  <rect width="230" height="118" rx="22" fill="#14243B"/>
  <path d="M30 116 L10 150 L72 116Z" fill="#14243B"/>
  <rect x="12" y="12" width="98" height="72" rx="12" fill="#213A5E"/>
  <rect x="120" y="12" width="98" height="72" rx="12" fill="#213A5E"/>
  <g class="av a1"><circle cx="61" cy="40" r="15" fill="#F26B52"/><path d="M34 84 C34 62 88 62 88 84Z" fill="#F26B52"/></g>
  <g class="av a2"><circle cx="169" cy="40" r="15" fill="#8FD0D3"/><path d="M142 84 C142 62 196 62 196 84Z" fill="#8FD0D3"/></g>
  <circle cx="92" cy="101" r="7" fill="#DDD3BE"/><circle cx="115" cy="101" r="7" fill="#DDD3BE"/><circle cx="138" cy="101" r="7" fill="#F26B52" class="rec"/>
</g>';
$only = $only ?? null;
?>
<div class="ha<?= $only ? ' single' : '' ?>" role="img" aria-label="Illustrations of a trip being planned together, a tabletop game being run together, and a design jam">
  <?php if (!$only || $only === 1): ?>
  <!-- Scene 1: travel -->
  <svg class="scene s1" viewBox="0 0 600 500" aria-hidden="true" focusable="false">
    <defs><clipPath id="hm1"><rect x="50" y="76" width="470" height="380" rx="34"/></clipPath></defs>
    <rect x="50" y="76" width="470" height="380" rx="34" fill="var(--sand)"/>
    <g clip-path="url(#hm1)">
      <path d="M300 76 C320 150 380 140 420 190 C470 250 500 300 520 330 L520 76Z" fill="var(--accent-soft)"/>
      <path d="M50 396 C110 356 190 366 240 456 L50 456Z" fill="var(--bg)" opacity=".6"/>
      <path d="M340 90 C360 112 400 108 430 96 L430 76 L340 76Z" fill="var(--bg)" opacity=".55"/>
      <g stroke="#fff" stroke-opacity=".7" stroke-width="2.5">
        <path d="M170 76V456M290 76V456M410 76V456M50 170H520M50 270H520M50 370H520"/>
      </g>
      <path class="wave" d="M296 196 q30 -18 60 0 t60 0 t60 0" fill="none" stroke="var(--sea)" stroke-width="4" stroke-linecap="round"/>
    </g>
    <path d="M100 400 C180 384 220 346 270 332 S360 252 400 212 S440 172 470 164" fill="none" stroke="var(--coral)" stroke-width="6" stroke-linecap="round" stroke-dasharray="0.1 13"/>
    <g fill="#fff" stroke="var(--coral)" stroke-width="5"><circle cx="100" cy="400" r="12"/><circle cx="270" cy="332" r="12" class="stop"/></g>
    <g class="plane">
      <path d="M-24 -4 L-4 -4 L-14 -26 L-6 -26 L10 -4 L24 -4 C30 -4 30 4 24 4 L10 4 L-6 26 L-14 26 L-4 4 L-24 4Z" fill="#14243B"/>
    </g>
    <g class="pin"><g transform="translate(470 164)">
      <path d="M0 0 C-20 -26 -24 -44 -24 -52 a24 24 0 1 1 48 0 C24 -44 20 -26 0 0Z" fill="var(--coral)" stroke="#14243B" stroke-width="3.5" stroke-linejoin="round"/>
      <circle cy="-52" r="9" fill="#fff"/>
    </g></g>
    <g class="sun" transform="translate(506 112)">
      <g class="rays" stroke="#F6B35B" stroke-width="5" stroke-linecap="round">
        <path d="M0 -50V-38M0 38V50M-50 0H-38M38 0H50M-35 -35l8 8M27 27l8 8M35 -35l-8 8M-27 27l-8 8"/>
      </g>
      <circle r="27" fill="#F6B35B"/>
    </g>
    <g class="card" transform="translate(22 38)">
      <rect width="218" height="136" rx="20" fill="var(--surface)" stroke="var(--line)" stroke-width="2"/>
      <path d="M0 40V20a20 20 0 0 1 20-20H198a20 20 0 0 1 20 20V40Z" fill="var(--accent)"/>
      <circle cx="26" cy="20" r="11" fill="#fff"/><rect x="48" y="15" width="78" height="10" rx="5" fill="#fff" opacity=".85"/>
      <path d="M26 62V102" stroke="var(--line2)" stroke-width="3"/>
      <circle cx="26" cy="62" r="7" fill="var(--accent)"/><circle cx="26" cy="82" r="7" fill="var(--coral)"/><circle cx="26" cy="102" r="7" fill="var(--accent)"/>
      <rect x="46" y="57" width="130" height="10" rx="5" fill="var(--line)"/><rect x="46" y="77" width="100" height="10" rx="5" fill="var(--line)"/><rect x="46" y="97" width="146" height="10" rx="5" fill="var(--line)"/>
    </g>
    <?= $call ?>
  </svg>

  <?php endif; if (!$only || $only === 2): ?>
  <!-- Scene 2: gaming -->
  <svg class="scene s2" viewBox="0 0 600 500" aria-hidden="true" focusable="false">
    <rect x="44" y="76" width="480" height="388" rx="38" fill="var(--sand)"/>
    <rect x="72" y="104" width="424" height="332" rx="14" fill="var(--accent-soft)"/>
    <g stroke="#fff" stroke-opacity=".75" stroke-width="2.5"><path d="M150 104V436M230 104V436M310 104V436M390 104V436M72 180H496M72 260H496M72 340H496M72 400H496"/></g>
    <g fill="#9ED3D3"><ellipse cx="108" cy="190" rx="34" ry="26"/><ellipse cx="300" cy="128" rx="60" ry="16"/><ellipse cx="470" cy="330" rx="22" ry="70" fill="#BFE3E3"/></g>
    <g fill="var(--accent)" opacity=".85"><circle cx="100" cy="182" r="5"/><circle cx="122" cy="200" r="5"/><circle cx="270" cy="128" r="5"/><circle cx="296" cy="124" r="5"/><circle cx="326" cy="130" r="5"/></g>
    <path d="M112 232 L172 220 C186 186 246 190 268 206 L326 202 L326 176 L420 176 L468 228 L468 308 L420 348 L326 340 L296 352 C266 372 226 362 196 352 L120 332Z" fill="#F3FAFA" stroke="#14243B" stroke-width="3.5" stroke-linejoin="round"/>
    <path d="M276 308 C300 308 306 290 330 282" fill="none" stroke="#14243B" stroke-width="3" stroke-linecap="round" stroke-dasharray="0.1 9"/>
    <circle cx="336" cy="280" r="8" fill="#fff" stroke="#14243B" stroke-width="3"/>
    <g class="token t1"><circle cx="196" cy="254" r="19" fill="#14243B"/><circle cx="196" cy="254" r="12" fill="#F6B35B"/><circle cx="196" cy="254" r="5.5" fill="none" stroke="#14243B" stroke-width="2.5"/></g>
    <g class="token t2"><circle cx="156" cy="296" r="19" fill="#14243B"/><circle cx="156" cy="296" r="12" fill="#EFE6D2"/><circle cx="156" cy="296" r="5.5" fill="none" stroke="#14243B" stroke-width="2.5"/></g>
    <g class="token t3"><circle cx="246" cy="312" r="19" fill="#14243B"/><circle cx="246" cy="312" r="12" fill="var(--accent)"/><circle cx="246" cy="312" r="5.5" fill="none" stroke="#14243B" stroke-width="2.5"/></g>
    <g class="target"><circle cx="398" cy="262" r="46" fill="var(--coral-soft)" stroke="var(--coral)" stroke-width="3"/>
      <rect x="376" y="240" width="44" height="44" rx="6" fill="#14243B"/><path d="M398 250l12 12-12 12-12-12z" fill="none" stroke="#F26B52" stroke-width="3" stroke-linejoin="round"/></g>
    <g class="d20"><g transform="translate(496 108)">
      <path d="M0 -46 L40 -23 L40 23 L0 46 L-40 23 L-40 -23Z" fill="#F6B35B" stroke="#14243B" stroke-width="3.5" stroke-linejoin="round"/>
      <path d="M0 -24 L22 13 L-22 13Z" fill="#D9923A" stroke="#14243B" stroke-width="3" stroke-linejoin="round"/>
      <path d="M0 -24V-46M22 13L40 23M-22 13L-40 23M0 -24L40 -23M0 -24L-40 -23M22 13L0 46M-22 13L0 46" stroke="#14243B" stroke-width="2.5" stroke-linecap="round"/>
    </g></g>
    <g class="card" transform="translate(22 38)">
      <rect width="218" height="124" rx="20" fill="var(--surface)" stroke="var(--line)" stroke-width="2"/>
      <path d="M0 40V20a20 20 0 0 1 20-20H198a20 20 0 0 1 20 20V40Z" fill="var(--accent)"/>
      <circle cx="26" cy="20" r="11" fill="#fff"/><rect x="48" y="15" width="78" height="10" rx="5" fill="#fff" opacity=".85"/>
      <g fill="var(--sand)">
        <?php for ($r = 0; $r < 3; $r++) for ($c = 0; $c < 7; $c++): $cx = 16 + $c * 27; $cy = 54 + $r * 22; ?>
          <rect x="<?= $cx ?>" y="<?= $cy ?>" width="22" height="16" rx="5"<?= ($r === 1 && $c === 3) ? ' class="day" fill="var(--coral)"' : '' ?>/>
        <?php endfor; ?>
      </g>
    </g>
    <g class="sheet" transform="translate(40 292) rotate(-6)">
      <rect width="150" height="176" rx="10" fill="var(--surface)" stroke="var(--line)" stroke-width="2.5"/>
      <rect x="16" y="16" width="86" height="11" rx="5" fill="#14243B"/>
      <g fill="none" stroke="var(--line2)" stroke-width="2.5"><rect x="16" y="42" width="38" height="30" rx="7"/><rect x="56" y="42" width="38" height="30" rx="7"/><rect x="96" y="42" width="38" height="30" rx="7"/><rect x="16" y="78" width="38" height="30" rx="7"/><rect x="56" y="78" width="38" height="30" rx="7"/><rect x="96" y="78" width="38" height="30" rx="7"/></g>
      <rect x="16" y="124" width="118" height="7" rx="3.5" fill="var(--line)"/><rect x="16" y="142" width="86" height="7" rx="3.5" fill="var(--line)"/>
    </g>
    <g class="pencil"><g transform="translate(176 446) rotate(-62)">
      <rect x="-14" y="-9" width="14" height="18" rx="3" fill="#F26B52" stroke="#14243B" stroke-width="2.5"/>
      <rect x="0" y="-9" width="98" height="18" fill="#F6B35B" stroke="#14243B" stroke-width="2.5"/>
      <path d="M98 -9 L128 0 L98 9Z" fill="var(--sand)" stroke="#14243B" stroke-width="2.5" stroke-linejoin="round"/><path d="M118 -3.5 L128 0 L118 3.5Z" fill="#14243B"/>
    </g></g>
    <?= $call ?>
  </svg>

  <?php endif; if (!$only || $only === 3): ?>
  <!-- Scene 3: design jam, markup and mentoring -->
  <svg class="scene s3" viewBox="0 0 600 500" aria-hidden="true" focusable="false">
    <defs><pattern id="hdots" width="26" height="26" patternUnits="userSpaceOnUse"><circle cx="13" cy="13" r="1.8" fill="var(--line2)"/></pattern></defs>
    <rect x="44" y="70" width="490" height="390" rx="32" fill="var(--sand)"/>
    <rect x="60" y="86" width="458" height="358" rx="22" fill="var(--surface)"/>
    <rect x="60" y="86" width="458" height="358" rx="22" fill="url(#hdots)"/>
    <g class="tools"><rect x="76" y="150" width="44" height="180" rx="16" fill="var(--bg)" stroke="var(--line)" stroke-width="2"/>
      <path d="M90 172l8 20 4-8 8-2z" fill="#14243B"/>
      <path d="M90 232l16-16 6 6-16 16-8 2z" fill="#F6B35B" stroke="#14243B" stroke-width="2" stroke-linejoin="round"/>
      <rect x="90" y="262" width="20" height="16" rx="3" fill="none" stroke="#14243B" stroke-width="2.5"/>
      <rect x="90" y="296" width="20" height="20" rx="3" fill="var(--coral-soft)" stroke="#14243B" stroke-width="2.5"/></g>
    <g class="wire" transform="translate(150 118)">
      <rect width="220" height="190" rx="16" fill="var(--surface)" stroke="#14243B" stroke-width="3"/>
      <circle cx="26" cy="26" r="10" fill="var(--accent)"/><rect x="46" y="21" width="80" height="10" rx="5" fill="var(--line)"/>
      <rect x="18" y="50" width="184" height="72" rx="10" fill="var(--accent-soft)"/>
      <path d="M18 122l54-40 40 28 30-20 60 32z" fill="var(--sea)"/><circle cx="168" cy="72" r="9" fill="#F6B35B"/>
      <rect x="18" y="134" width="150" height="8" rx="4" fill="var(--line)"/>
      <rect x="18" y="156" width="86" height="22" rx="11" fill="var(--accent)" class="btn-w"/>
    </g>
    <g class="markup" fill="none" stroke="var(--coral)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
      <path class="draw" pathLength="100" d="M158 268 C150 252 168 244 202 246 C240 248 262 262 250 282 C238 300 190 300 164 290 C150 284 150 274 164 266"/>
      <path class="draw d2" pathLength="100" d="M262 256 C290 232 306 226 330 224 M318 214 L332 224 L316 234"/>
    </g>
    <g transform="translate(396 100) rotate(5)"><g class="note n1"><rect width="104" height="104" rx="8" fill="var(--coral-soft)" stroke="var(--coral)" stroke-width="2"/><rect x="14" y="20" width="70" height="8" rx="4" fill="var(--coral)" opacity=".55"/><rect x="14" y="40" width="56" height="8" rx="4" fill="var(--coral)" opacity=".55"/><rect x="14" y="60" width="64" height="8" rx="4" fill="var(--coral)" opacity=".55"/></g></g>
    <g transform="translate(402 214) rotate(-4)"><g class="note n2"><rect width="96" height="96" rx="8" fill="#F9DE9C" stroke="#E0A93E" stroke-width="2"/><rect x="14" y="20" width="62" height="8" rx="4" fill="#C98F3F" opacity=".5"/><rect x="14" y="40" width="48" height="8" rx="4" fill="#C98F3F" opacity=".5"/></g></g>
    <g transform="translate(300 330) rotate(3)"><g class="note n3"><rect width="84" height="84" rx="8" fill="var(--accent-soft)" stroke="var(--sea)" stroke-width="2"/><path d="M20 44l14 14 30-30" fill="none" stroke="var(--accent)" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></g></g>
    <g class="cur c1"><path d="M0 0 L0 30 L9 22 L16 36 L23 33 L16 20 L28 19Z" fill="var(--accent)" stroke="#fff" stroke-width="2" stroke-linejoin="round"/><rect x="24" y="30" width="46" height="22" rx="11" fill="var(--accent)"/><text x="47" y="46" text-anchor="middle" font-family="Figtree,system-ui,sans-serif" font-size="13" font-weight="700" fill="#fff">Ana</text></g>
    <g class="cur c2"><path d="M0 0 L0 30 L9 22 L16 36 L23 33 L16 20 L28 19Z" fill="var(--coral)" stroke="#fff" stroke-width="2" stroke-linejoin="round"/><rect x="24" y="30" width="46" height="22" rx="11" fill="var(--coral)"/><text x="47" y="46" text-anchor="middle" font-family="Figtree,system-ui,sans-serif" font-size="13" font-weight="700" fill="#14243B">Sam</text></g>
    <?= $call ?>
  </svg>

  <?php endif; if (!$only): ?>
  <div class="hcap" aria-hidden="true"><span class="k1">Trips, planned together</span><span class="k2">Games, run together</span><span class="k3">Ideas, shaped together</span></div>
  <?php endif; ?>
</div>
