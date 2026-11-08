<?php $pf = 'https://willhavebeen.com'; ?>
<div class="wrap">
  <section style="padding-top:56px">
    <div class="eyebrow">About the studio</div>
    <h1>Coffee Pub Studio is mostly me</h1>
    <p class="lead">I'm Thomas Carroll, a design leader who cannot stop building things. The studio is where I take a problem all the way from the first idea to something people use, now and then alongside guest designers and developers who love solving problems as much as I do.</p>
    <div class="actions">
      <a class="btn" href="<?= h($pf) ?>">Visit willhavebeen.com</a>
      <a class="btn ghost" href="/products">Browse the products</a>
    </div>

    <div class="about-grid">
      <div class="panel who">
        <h2 style="font-size:1.6rem;margin-top:0">Who is behind it</h2>
        <p>I grew up on a pig farm in Rensselaer, Indiana, and once planned to teach English. I became a mechanical engineer instead, then moved into software, building web applications for the Department of Defense, the Navy and the Pentagon, and later running my own small agency for startups.</p>
        <p>From there I led design at Realtor.com, Intuit and PayPal, growing teams from a handful of people to dozens and shaping products used by millions. Then I took a sabbatical, wrote a lot of code and fell back in love with the place where development, design and AI meet. Coffee Pub Studio is where that happens.</p>
        <p>Away from work I travel with my family, hike, play Dungeons and Dragons, game, make music and code for fun. The apps and modules here exist because I wanted them to.</p>
      </div>
      <div class="panel link-out">
        <h3>My design leadership work lives at willhavebeen.com</h3>
        <p>Case studies, writing, speaking and the longer story, if you want to know who you would be working with.</p>
        <div class="actions" style="margin:20px 0 0">
          <a class="btn" href="<?= h($pf) ?>/about-me/">About me</a>
          <a class="btn ghost" href="<?= h($pf) ?>/case-studies/">Case studies</a>
        </div>
        <p style="margin:18px 0 0"><a href="<?= h($pf) ?>">willhavebeen.com</a></p>
      </div>
    </div>

    <h2 style="margin-top:80px;font-size:1.9rem">How I work</h2>
    <p class="lead" style="margin-top:12px">Four habits I bring to every project, whatever I am building.</p>
    <div class="grid four exact">
      <?php foreach ([
        ["provoke", "Provoke what is possible", "Every project starts with curiosity. The right questions reveal what is really in the way, and what might move things forward."],
        ["story", "Tell the story", "Design is how I build, and story is how I align. A clear narrative gets everyone looking at the same problem."],
        ["make", "Make things real", "Ideas only matter when they are tangible. Early prototypes and small proofs build belief and momentum."],
        ["people", "Bring people along", "Healthy teams make strong products. I mentor, share what I learn and make it safe to try bold things."],
      ] as [$art, $t, $x]): ?>
        <div class="card cap">
          <div class="thumb"><img class="art" src="/assets/art/<?= h($art) ?>.svg" alt="" loading="lazy"></div>
          <div class="body"><h3><?= h($t) ?></h3><p><?= h($x) ?></p></div>
        </div>
      <?php endforeach; ?>
    </div>
    <h3 style="margin-top:56px">Three questions I ask of everything I make</h3>
    <div class="points">
      <div><h3>Efficacy</h3><p>Am I solving the right problem?</p></div>
      <div><h3>Efficiency</h3><p>Am I solving it well, and is it as simple as it can be?</p></div>
      <div><h3>Elegance</h3><p>Does it connect with people and bring a little delight?</p></div>
    </div>

    <h2 style="margin-top:80px;font-size:1.9rem">Sometimes with friends</h2>
    <p class="lead" style="margin-top:12px">Some problems need more hands. When they do, I bring in guest developers and designers who share my passion for problem solving, and we build it together. If that sounds like you, <a href="/contact">say hello</a>.</p>

    <section id="ai">
      <h2 style="margin-top:80px;font-size:1.9rem">AI assistance and the illusion of good code</h2>
      <p class="muted" style="margin:12px 0 0">This is how I build the Foundry VTT modules. The people who play with them often ask, so here it is plainly.</p>
      <div class="ai-split">
      <div class="ai-text">
        <p>I started writing Foundry modules for use at my own table back in 2020. There were already a ton of amazing modules out there, but they either didn't quite do what I wanted or didn't deliver the kind of user experience I was looking for.</p>
        <p>I've been a design leader for more than 20 years, but I spent the first half of my career as a developer, so building my own modules seemed like a fun way to kill some time. I'm a pretty good designer. I'm a decent developer. But, over time, my hand-written code and hacks got a little messy (and memory-leaky, and a little buggy. Feels good to say it out loud.).</p>
        <p>Today, the Coffee Pub suite of modules is developed with AI assistance, primarily Claude and Cursor, for documentation, refactoring, debugging, and other development work. Every change is reviewed and committed by me, and nothing reaches a release that I haven't crawled and run at my own table. I can't seem to give up my IDE. The UX design, architecture, and ideas still come from my own fever dreams and chronic lack of sleep.</p>
        <p>Testing and verifying a change means running it in Foundry so I can watch the console, break things, fix them, and hone the experience. The repositories carry a set of tools for testing the things that are difficult to catch through review and manual testing alone. They help ensure styles don't conflict, shared coding and documentation standards stay consistent, and the suite of modules continues to work well as a system without silently breaking.</p>
        <p>Those checks are there because AI-assisted development can move very quickly, and without oversight, engagement, and planning, it can also go confidently off the rails and deliver the illusion of good code. The AI helps me build faster. It doesn't decide what gets built, its architecture, or how it should work. You can blame this human for that.</p>
        <p>If the idea of AI-assisted development keeps you up at night or just isn't your jam, no worries at all. I get it. You do you.</p>
      </div>
      <div class="ha single ai-art" role="img" aria-label="A code window being checked line by line with a magnifying glass, a check mark, a spark and a cup of coffee">
        <svg class="scene" viewBox="0 0 600 500" aria-hidden="true" focusable="false">
          <rect x="40" y="60" width="520" height="400" rx="36" fill="var(--sand)"/>
          <rect x="70" y="110" width="360" height="270" rx="20" fill="var(--surface)" stroke="#14243B" stroke-width="3.5"/>
          <path d="M70 150V130a20 20 0 0 1 20-20H410a20 20 0 0 1 20 20V150Z" fill="var(--accent)"/>
          <circle cx="96" cy="130" r="7" fill="#fff"/><circle cx="118" cy="130" r="7" fill="#fff" opacity=".8"/><circle cx="140" cy="130" r="7" fill="#fff" opacity=".6"/>
          <g fill="var(--line)"><rect x="96" y="176" width="150" height="12" rx="6"/><rect x="120" y="202" width="210" height="12" rx="6"/><rect x="120" y="228" width="120" height="12" rx="6"/><rect x="96" y="280" width="180" height="12" rx="6"/><rect x="120" y="306" width="140" height="12" rx="6"/><rect x="96" y="332" width="90" height="12" rx="6"/></g>
          <path d="M120 254 q12 -14 24 0 t24 0 t24 0 t24 0 t24 0 t24 0" fill="none" stroke="var(--coral)" stroke-width="5" stroke-linecap="round" class="wave"/>
          <g class="cur c1"><circle cx="0" cy="0" r="26" fill="#fff" fill-opacity=".55" stroke="#14243B" stroke-width="5"/><path d="M19 19 L44 44" stroke="#14243B" stroke-width="8" stroke-linecap="round"/></g>
          <g transform="translate(440 120)"><g class="target"><circle r="36" fill="var(--coral)" stroke="#14243B" stroke-width="3.5"/><path d="M-16 2 l12 13 l22 -26" fill="none" stroke="#fff" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/></g></g>
          <g class="twinkle" transform="translate(500 210)"><path d="M0 -34 L9 -9 L34 0 L9 9 L0 34 L-9 9 L-34 0 L-9 -9Z" fill="#F6B35B" stroke="#14243B" stroke-width="3.5" stroke-linejoin="round"/></g>
          <g class="twinkle t2" transform="translate(78 84)"><path d="M0 -14 L4 -4 L14 0 L4 4 L0 14 L-4 4 L-14 0 L-4 -4Z" fill="#fff"/></g>
          <g transform="translate(470 330)"><g class="pin"><path d="M0 -28c-8 -12 8 -14 0 -30M18 -28c-8 -12 8 -14 0 -30" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".85"/><path d="M-30 -14H48V30a30 30 0 0 1-30 30H0a30 30 0 0 1-30-30Z" fill="var(--surface)" stroke="#14243B" stroke-width="3.5" stroke-linejoin="round"/><path d="M48 0h12a14 14 0 0 1 0 28H46" fill="none" stroke="#14243B" stroke-width="3.5" stroke-linecap="round"/><rect x="-22" y="-8" width="62" height="10" rx="5" fill="var(--coral)" opacity=".8"/></g></g>
        </svg>
      </div>
    </div>
    </section>

    <h2 style="margin-top:80px;font-size:1.9rem">Good to know</h2>
    <div class="cols">
      <div class="panel">
        <h3>Open and free for now</h3>
        <p>The Foundry modules are open source under the MIT license, with the code on <a href="https://github.com/Drowbe">GitHub</a>. They are free today, and some features may later be limited to supporters on <a href="<?= h(site()['links']['patreon']) ?>">Patreon</a>.</p>
      </div>
      <div class="panel">
        <h3>AI-assisted, human-reviewed</h3>
        <p>I started these projects by hand. Today I build with AI assistance, and every change is still reviewed, committed and played by me. <a href="#ai">How I use it</a>.</p>
      </div>
      <div class="panel">
        <h3>Personal projects</h3>
        <p>The modules are personal projects, so I cannot promise stability or support. Back up your world before trying anything new.</p>
      </div>
    </div>

    <div class="band" style="margin-top:80px">
      <div>
        <h2 style="font-size:1.7rem">Have a problem worth solving?</h2>
        <p class="lead">I take on a small number of design and development projects. Tell me what you are trying to solve.</p>
      </div>
      <div class="actions" style="margin:0"><a class="btn" href="/contact">Get in touch</a></div>
    </div>
  </section>
</div>
