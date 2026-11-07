<?php
$brand = '/assets/brand/coffee-pub-';
$marks = [
  ['studio', 'Coffee Pub Studio', 'Studio', 'The studio. Also the default mark for anything that is simply "Coffee Pub".'],
  ['chameleon', 'Coffee Pub Chameleon', 'Chameleon', 'The collaboration platform. Travel, games and other branded versions will grow out of it.'],
  ['showrunner', 'Coffee Pub Showrunner', 'Showrunner', 'The desktop app that feeds OBS.'],
  ['gaming', 'Coffee Pub Gaming', 'Gaming', 'The family of Foundry VTT modules. One mark stands for the whole collection.'],
];
$tokens = [
  ['--bg', 'Page', '#FBF6EC', '#0E1A2B', 'Page background'],
  ['--band', 'Band', '#F3E9D4', '#13243B', 'Full-width bands, quiet fills'],
  ['--surface', 'Surface', '#FFFFFF', '#182C47', 'Cards, panels, inputs'],
  ['--line', 'Line', '#E2D3B3', '#2A4162', 'Borders'],
  ['--text', 'Ink', '#14243B', '#F4ECDD', 'Headings and body text'],
  ['--muted', 'Muted', '#475569', '#B9C3D3', 'Secondary text'],
  ['--accent', 'Teal', '#0B7A84', '#5CC8CF', 'Buttons, links, selected state'],
  ['--accent-soft', 'Teal soft', '#D5EEEE', '#1B4252', 'Teal chips and tints'],
  ['--sea', 'Sea', '#8FD0D3', '#1F5566', 'Illustration fills'],
  ['--coral', 'Coral', '#F26B52', '#FF8264', 'Marks, illustration, the single accent dot'],
  ['--coral-text', 'Coral text', '#B83A26', '#FF9C86', 'Coral used as small text (eyebrows)'],
  ['--coral-soft', 'Coral soft', '#FDE2DA', '#4A2B2E', 'Coral chips and tints'],
  ['--sand', 'Sand', '#EBD9B3', '#3A4458', 'Illustration fills, neutral chips'],
];
$contrast = [
  ['Ink on page', '14.5 : 1', '14.9 : 1'],
  ['Muted on page', '7.0 : 1', '9.8 : 1'],
  ['Button text on teal', '5.1 : 1', '8.8 : 1'],
  ['Teal link on page', '6.2 : 1', '10.4 : 1'],
  ['Coral text on page', '5.3 : 1', '8.6 : 1'],
  ['Name coral on page (#E0553C / #FF8264)', '3.5 : 1, large text only', '7.2 : 1'],
];
?>
<div class="wrap ds">
  <section style="padding-top:56px">
    <div class="eyebrow">Design system</div>
    <h1>How Coffee Pub looks and sounds</h1>
    <p class="lead">One place for the marks, colours, type, components and voice behind the studio and its products. If something here disagrees with a page, this page wins.</p>
    <nav class="ds-nav" aria-label="On this page">
      <a href="#principles">Principles</a><a href="#marks">Brand marks</a><a href="#colour">Colour</a><a href="#type">Type</a>
      <a href="#layout">Layout</a><a href="#components">Components</a><a href="#illustration">Illustration</a><a href="#voice">Voice</a><a href="#access">Accessibility</a>
    </nav>

    <h2 id="principles" class="ds-h">Principles</h2>
    <div class="points">
      <div><h3>Warm and airy</h3><p>Cream, navy, teal and coral. Generous space, rounded shapes, nothing cold or crowded.</p></div>
      <div><h3>Provoke what is possible. Build it.</h3><p>The core message. Say it plainly and let the work carry it.</p></div>
      <div><h3>Efficacy, efficiency, elegance</h3><p>Is it the right problem, is it as simple as it can be, does it bring a little delight.</p></div>
      <div><h3>Light first, dark on request</h3><p>Light is the default. Every colour, mark and component has a dark counterpart.</p></div>
    </div>

    <h2 id="marks" class="ds-h">Brand marks</h2>
    <p class="lead">Four marks, one family. Each is a 2 &times; 2 grid of simple shapes with a coral circle or pie in the top-right, so the family reads as one even when the shapes change.</p>
    <div class="actions" style="margin-top:24px"><a class="btn" href="/downloads/coffee-pub-brand-kit.zip" download>Download the brand kit (zip)</a></div>

    <?php foreach ($marks as [$k, $name, $third, $what]): ?>
      <h3 style="margin-top:48px;font-size:1.5rem"><?= h($name) ?></h3>
      <p class="muted" style="margin:0 0 12px"><?= h($what) ?></p>
      <div class="kit">
        <div class="kit-pane light"><img src="<?= $brand . $k ?>-lockup.svg" alt="<?= h($name) ?>" height="56"></div>
        <div class="kit-pane dark"><img src="<?= $brand . $k ?>-lockup-dark.svg" alt="<?= h($name) ?>" height="56"></div>
      </div>
      <div class="kit">
        <div class="kit-pane light small">
          <?php foreach ([112, 56, 28, 16] as $z): ?><img src="<?= $brand . $k ?>-mark.svg" width="<?= $z ?>" height="<?= $z ?>" alt=""><?php endforeach; ?>
        </div>
        <div class="kit-pane dark small">
          <?php foreach ([112, 56, 28, 16] as $z): ?><img src="<?= $brand . $k ?>-mark-dark.svg" width="<?= $z ?>" height="<?= $z ?>" alt=""><?php endforeach; ?>
        </div>
      </div>
      <p class="kit-links">
        Mark: <a href="<?= $brand . $k ?>-mark.svg">SVG</a> &middot; <a href="<?= $brand . $k ?>-mark-dark.svg">SVG (dark)</a> &middot;
        <a href="/assets/brand/png/coffee-pub-<?= $k ?>-mark-1024.png">PNG 1024</a> &middot; <a href="/assets/brand/png/coffee-pub-<?= $k ?>-mark-112.png">PNG 112</a>
        &nbsp;|&nbsp; Lockup: <a href="<?= $brand . $k ?>-lockup.svg">SVG</a> &middot; <a href="<?= $brand . $k ?>-lockup-dark.svg">SVG (dark)</a> &middot;
        <a href="/assets/brand/png/coffee-pub-<?= $k ?>-lockup-960.png">PNG 960</a>
      </p>
    <?php endforeach; ?>

    <h3 style="margin-top:56px">Construction</h3>
    <div class="cols">
      <div class="panel"><h3>Grid</h3><p>The mark is 56 units square: a 3 unit margin, two 24 unit cells and a 2 unit gap (3 + 24 + 2 + 24 + 3). At 56 px, and at 112, 224 and 448, every edge lands on a whole pixel, which keeps it crisp.</p></div>
      <div class="panel"><h3>Shapes</h3><p>Only three: circle, square and quarter-pie. No shape is split into two colours. Squares and pies share one corner radius of 2.5 units, so no point meets a round corner.</p></div>
      <div class="panel"><h3>The coral rule</h3><p>Coral always sits in the top-right cell. It is the one bright accent and the thing that ties the family together.</p></div>
    </div>

    <h3 style="margin-top:56px">Lockup</h3>
    <div class="cols">
      <div class="panel"><h3>Recipe</h3><p>Mark at 56, then 12 units of space, then &ldquo;Coffee Pub&rdquo; in Fraunces Bold 32 and the product name in Figtree SemiBold 32 on one line. The name is coral (#E0553C on light, #FF8264 on dark). The same ratio scales up and down.</p></div>
      <div class="panel"><h3>Clear space</h3><p>Keep at least a quarter of the mark's width clear on every side. Smallest sizes: the mark at 16 px, a lockup 24 px tall.</p></div>
      <div class="panel"><h3>Do not</h3><p>Recolour the shapes, rotate or stretch them, add outlines or shadows, or set the name in another font. In one-colour use, use the navy or white files from the kit.</p></div>
    </div>

    <h3 style="margin-top:56px">What is in the kit</h3>
    <div class="cols">
      <div class="panel"><h3>Vector</h3><p>SVG masters and PDFs for print, in light, dark, all-navy and all-white. Text is outlined, so no fonts are needed.</p></div>
      <div class="panel"><h3>PNG</h3><p>Transparent PNGs from 16 to 4096 px for marks and 240 to 3840 px wide for lockups, with extra steps at multiples of 56.</p></div>
      <div class="panel"><h3>Icons</h3><p>favicon.ico, favicon.svg, a 180 px Apple touch icon, and 192 and 512 px app icons on a cream tile.</p></div>
    </div>

    <h2 id="colour" class="ds-h">Colour</h2>
    <p class="lead">Navy, teal and coral on cream, with a navy dark theme. Use the tokens, not the hex values, in code.</p>
    <div class="ds-table">
      <div class="ds-row head"><div>Token</div><div>Light</div><div>Dark</div><div>Use</div></div>
      <?php foreach ($tokens as [$var, $name, $lt, $dk, $use]): ?>
        <div class="ds-row">
          <div><code><?= h($var) ?></code></div>
          <div class="sw"><span class="chipsw" style="background:<?= h($lt) ?>"></span><?= h($name) ?> <small><?= h($lt) ?></small></div>
          <div class="sw"><span class="chipsw" style="background:<?= h($dk) ?>"></span><small><?= h($dk) ?></small></div>
          <div class="muted"><?= h($use) ?></div>
        </div>
      <?php endforeach; ?>
    </div>
    <h3 style="margin-top:40px">Contrast</h3>
    <div class="ds-table">
      <div class="ds-row head three"><div>Pair</div><div>Light</div><div>Dark</div></div>
      <?php foreach ($contrast as [$pair, $l, $d]): ?>
        <div class="ds-row three"><div><?= h($pair) ?></div><div><?= h($l) ?></div><div><?= h($d) ?></div></div>
      <?php endforeach; ?>
    </div>
    <p class="muted" style="margin-top:12px;font-size:1rem">Body text needs 4.5 : 1. The coral used in the lockup name is only for large text (24 px and up); for small coral text use <code>--coral-text</code>.</p>

    <h2 id="type" class="ds-h">Type</h2>
    <div class="cols">
      <div class="panel"><h3 style="font-size:2rem">Fraunces</h3><p>Headlines and the &ldquo;Coffee Pub&rdquo; wordmark. Weight 600 for headings, 700 for the wordmark. A soft, warm serif.</p></div>
      <div class="panel"><h3 style="font-family:var(--sans);font-size:2rem">Figtree</h3><p>Body, buttons, labels and the product name in the lockup. Weights 400 to 700. Friendly and very readable.</p></div>
      <div class="panel"><h3>Hosting</h3><p>Both are self-hosted woff2 files with system serif and sans fallbacks, so nothing loads from a third party.</p></div>
    </div>
    <div class="ds-type">
      <div><small>Eyebrow &middot; Figtree 700, .78rem, tracked, uppercase, --coral-text</small><div class="eyebrow" style="margin:6px 0 0">Boutique design and development</div></div>
      <div><small>h1 &middot; Fraunces 600, 2.5 to 4.2rem, line 1.08</small><h1 style="margin:6px 0 0;font-size:clamp(2.2rem,4vw,3.4rem)">Provoke what's possible.</h1></div>
      <div><small>h2 &middot; Fraunces 600, 1.9 to 2.7rem, line 1.15</small><h2 style="margin:6px 0 0">Build it.</h2></div>
      <div><small>h3 &middot; Fraunces 600, 1.3rem</small><h3 style="margin:6px 0 0">A card or panel title</h3></div>
      <div><small>Lead &middot; Figtree, 1.15 to 1.3rem, --muted</small><p class="lead" style="margin-top:6px">I have solved hundreds of problems. Some of them grew into the products below.</p></div>
      <div><small>Body &middot; Figtree 400, 18 px, line 1.7</small><p style="margin:6px 0 0;max-width:46rem">Body copy sits in short paragraphs, with plenty of space around them. Links use the teal text colour and a thin underline.</p></div>
    </div>

    <h2 id="layout" class="ds-h">Layout and shape</h2>
    <div class="cols">
      <div class="panel"><h3>Container</h3><p>Content is up to 1425 px wide, with a side gutter that grows from 24 px to 60 px. Reading text stays within 42 to 46 rem.</p></div>
      <div class="panel"><h3>Rhythm</h3><p>Sections are 96 px apart. Cards and panels sit 32 px apart in a grid. Body text is 18 px on a 1.7 line.</p></div>
      <div class="panel"><h3>Radius</h3><p>Pills and buttons are fully round. Cards and panels use 24 px, inputs and icon tiles 16 px. Marks use 2.5 units on a 56 unit grid.</p></div>
      <div class="panel"><h3>Depth</h3><p>Mostly flat, with a one pixel border. Linked cards lift 4 px and gain a soft shadow on hover. Dark mode uses a deeper shadow.</p></div>
    </div>

    <h2 id="components" class="ds-h">Components</h2>
    <p class="lead">These are the real components, using the site's own styles.</p>

    <h3 style="margin-top:40px">Buttons and pills</h3>
    <div class="actions">
      <span class="btn">Primary</span><span class="btn ghost">Secondary</span><span class="btn soon" aria-disabled="true">Coming soon</span><span class="pill" style="margin-left:0">Pill action</span>
    </div>

    <h3 style="margin-top:40px">Badges and chips</h3>
    <div class="badges" style="padding-top:0">
      <span class="badge">Category</span><span class="badge hub">Flagship</span><span class="badge early">Early</span><span class="badge soon">Coming soon</span>
    </div>
    <div class="chips" style="margin-top:14px">
      <span class="chip m">Teal</span><span class="chip r">Coral</span><span class="chip s">Sand</span>
    </div>

    <h3 style="margin-top:40px">Card</h3>
    <div class="grid" style="margin-top:20px;max-width:760px">
      <a class="card" href="#components" onclick="return false">
        <div class="thumb"><img class="art" src="/assets/art/core.svg" alt="" loading="lazy"></div>
        <div class="body"><h3>A product card</h3><p>A flat illustration on top, a short title, one line of pitch and badges at the foot.</p>
          <div class="badges"><span class="badge">Core</span><span class="badge hub">Flagship</span></div></div>
      </a>
      <div class="panel"><h3>A panel</h3><p>Panels hold supporting information. Same radius, no image.</p><p style="margin:0"><code>--surface</code> on <code>--bg</code></p></div>
    </div>

    <h3 style="margin-top:40px">Code chip and form field</h3>
    <p><code>example.address</code></p>
    <div class="field" style="max-width:420px"><label for="ds-demo">Label</label><input id="ds-demo" type="text" placeholder="A text field"></div>

    <h3 style="margin-top:40px">Band</h3>
    <div class="band" style="margin-top:20px"><div><h2 style="font-size:1.7rem">A full-width band</h2><p class="lead">Bands change the background to <code>--band</code> and carry a headline, a line of copy and one action.</p></div><div class="actions" style="margin:0"><span class="btn">Action</span></div></div>

    <h2 id="illustration" class="ds-h">Illustration and motion</h2>
    <div class="cols">
      <div class="panel"><h3>Style</h3><p>Flat shapes, no gradients or outlines, only palette colours, rounded corners, a coral accent on every piece. Illustrations are hand-built SVG, never stock.</p></div>
      <div class="panel"><h3>Hero scenes</h3><p>Three animated scenes on one loop: a trip, a game and a design jam. They are pure CSS inside inline SVG, 18 seconds in total, six per scene.</p></div>
      <div class="panel"><h3>Reduced motion</h3><p>With reduced motion on, the scenes stop on a still frame and nothing animates. Motion never carries meaning on its own.</p></div>
    </div>
    <div class="grid four exact" style="margin-top:32px">
      <?php foreach (['provoke', 'story', 'make', 'people'] as $a): ?>
        <div class="card cap"><div class="thumb"><img class="art" src="/assets/art/<?= h($a) ?>.svg" alt="" loading="lazy"></div><div class="body"><h3><?= ucfirst($a) ?></h3></div></div>
      <?php endforeach; ?>
    </div>

    <h2 id="voice" class="ds-h">Voice and content</h2>
    <div class="cols">
      <div class="panel"><h3>Tone</h3><p>Warm, direct and a little playful. Short sentences. Say what a thing does, then stop. Copy says &ldquo;I&rdquo;, not &ldquo;we&rdquo;: the studio is one person, with the occasional guest.</p></div>
      <div class="panel"><h3>Words I use</h3><p>&ldquo;Provoke what's possible. Build it.&rdquo; is the core message. Product names always start with &ldquo;Coffee Pub&rdquo;. US spelling.</p></div>
      <div class="panel"><h3>Honest about status</h3><p>Early things say Early. Unreleased things say Coming soon. No prices, tiers or licence claims until they exist. Modules are free for now.</p></div>
      <div class="panel"><h3>AI note</h3><p>The note about AI assistance lives only on About and in the footer. It is not repeated on product pages.</p></div>
      <div class="panel"><h3>Links</h3><p>Links to other sites open in a new tab. Local links stay in the same tab.</p></div>
    </div>

    <h2 id="access" class="ds-h">Accessibility and themes</h2>
    <div class="cols">
      <div class="panel"><h3>Light and dark</h3><p>Light is the default. The toggle in the header switches themes, and the site follows the system setting until you choose.</p></div>
      <div class="panel"><h3>Focus and keys</h3><p>Everything works with a keyboard. Focus shows a 3 px teal ring, and there is a skip link to the content.</p></div>
      <div class="panel"><h3>Text and images</h3><p>Body text meets 4.5 : 1 in both themes. Decorative art has empty alt text. Product screenshots carry alt text naming the product.</p></div>
    </div>
  </section>
</div>
