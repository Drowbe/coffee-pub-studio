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
      <div style="max-width:46rem;margin-top:20px">
        <p>I started writing Foundry modules for use at my own table back in 2020. There were already a ton of amazing modules out there, but they either didn't quite do what I wanted or didn't deliver the kind of user experience I was looking for.</p>
        <p>I've been a design leader for more than 20 years, but I spent the first half of my career as a developer, so building my own modules seemed like a fun way to kill some time. I'm a pretty good designer. I'm a decent developer. But, over time, my hand-written code and hacks got a little messy (and memory-leaky, and a little buggy. Feels good to say it out loud.).</p>
        <p>Today, the Coffee Pub suite of modules is developed with AI assistance, primarily Claude and Cursor, for documentation, refactoring, debugging, and other development work. Every change is reviewed and committed by me, and nothing reaches a release that I haven't crawled and run at my own table. I can't seem to give up my IDE. The UX design, architecture, and ideas still come from my own fever dreams and chronic lack of sleep.</p>
        <p>Testing and verifying a change means running it in Foundry so I can watch the console, break things, fix them, and hone the experience. The repositories carry a set of tools for testing the things that are difficult to catch through review and manual testing alone. They help ensure styles don't conflict, shared coding and documentation standards stay consistent, and the suite of modules continues to work well as a system without silently breaking.</p>
        <p>Those checks are there because AI-assisted development can move very quickly, and without oversight, engagement, and planning, it can also go confidently off the rails and deliver the illusion of good code. The AI helps me build faster. It doesn't decide what gets built, its architecture, or how it should work. You can blame this human for that.</p>
        <p>If the idea of AI-assisted development keeps you up at night or just isn't your jam, no worries at all. I get it. You do you.</p>
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
