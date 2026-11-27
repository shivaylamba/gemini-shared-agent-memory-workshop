import { append, replace, clear, confirmDialog, h, status, toast } from '../dom.js';
import { markdownToHtml, splitFrontmatter } from '../markdown.js';
import { when } from '../format.js';

const FIELD_LABELS = {
  title: 'Title',
  status: 'Status',
  category: 'Category',
  verified_at: 'Verified on',
  source: 'Sources',
  tags: 'Tags',
  proposed_by: 'Proposed by',
  contributed_by: 'Written by',
  reviewed_by: 'Reviewed by',
  reviewed_at: 'Reviewed on',
};

function frontmatterList(frontmatter) {
  const entries = Object.entries(frontmatter).filter(([key]) => FIELD_LABELS[key]);
  if (!entries.length) return null;
  return h('dl', { class: 'frontmatter' }, entries.map(([key, value]) => [
    h('dt', {}, FIELD_LABELS[key]),
    h('dd', {}, Array.isArray(value) ? value.map((v, i) => [i ? ', ' : '', key === 'source' ? h('code', {}, v) : v]) : String(value).replace(/T00:00:00Z$/, '')),
  ]));
}

function markdownBlock(body) {
  const div = h('div', { class: 'md' });
  div.innerHTML = markdownToHtml(body); // escaped by markdownToHtml; no raw HTML survives
  return div;
}

export function renderKnowledge(root, ctx) {
  const { api } = ctx;
  const inboxBox = h('div', {});
  const approvedBox = h('div', {});
  const viewer = h('section', { class: 'panel doc-view', 'aria-live': 'polite', 'aria-label': 'Selected note' });
  const headerStatus = h('div', {});
  let data = null;
  let selected = null;

  append(root, 
    h('div', { class: 'view-head' },
      h('p', { class: 'crumb' }, h('a', { href: '#/' }, 'Session'), ' / Shared knowledge'),
      h('h1', {}, 'Shared knowledge'),
      h('p', { class: 'lede' }, 'Agents can only send notes for review. A person reads each note, checks its sources, and decides what every agent may rely on.'),
      headerStatus,
    ),
    h('div', { class: 'knowledge-layout' },
      h('section', { class: 'panel', 'aria-labelledby': 'inbox-title' }, h('h3', { id: 'inbox-title' }, 'Waiting for review'), inboxBox),
      h('section', { class: 'panel', 'aria-labelledby': 'approved-title' }, h('h3', { id: 'approved-title' }, 'Approved knowledge'), approvedBox),
      viewer,
    ),
  );

  function showEmptyViewer() {
    replace(viewer, h('div', { class: 'empty' }, h('strong', {}, 'Select a note'), 'Its sources, author and history appear here. Notes waiting for review can be published or rejected.'));
  }

  async function select(kind, item) {
    selected = { kind, key: kind === 'proposal' ? item.slug : item.path };
    for (const button of root.querySelectorAll('.doc-list button')) button.setAttribute('aria-current', String(button.dataset.key === selected.key));
    if (kind === 'proposal') return showProposal(item);
    replace(viewer, h('p', { class: 'muted' }, 'Loading…'));
    try {
      const doc = await api.document(item.path);
      const { frontmatter, body } = splitFrontmatter(doc.content);
      replace(viewer, 
        h('h2', {}, frontmatter.title || item.path),
        h('p', { class: 'small muted' }, h('code', {}, item.path)),
        frontmatterList(frontmatter),
        markdownBlock(body),
        doc.history.length ? h('details', {}, h('summary', {}, 'History in OpenLore'), historyList(doc.history)) : null,
      );
    } catch (error) {
      replace(viewer, h('p', { class: 'error-box' }, error.message));
    }
  }

  function historyList(history) {
    const verbs = { write: 'wrote', move: 'moved here', remove: 'removed', move_source: 'moved away' };
    return h('ul', { class: 'doc-history' }, history.map((entry) => h('li', {}, h('span', { class: 'muted' }, when(entry.time)), h('span', {}, h('strong', {}, entry.attribution), ` ${verbs[entry.action] || entry.action}`, entry.from ? [' from ', h('code', {}, entry.from)] : null))));
  }

  function showProposal(p) {
    const { frontmatter, body } = splitFrontmatter(p.content);
    const errors = p.issues.filter((i) => i.level === 'error');
    const publish = h('button', { class: 'button', type: 'button', disabled: !data.canReview || errors.length > 0 }, 'Publish to shared knowledge');
    const reject = h('button', { class: 'button danger', type: 'button', disabled: !data.canReview }, 'Reject');
    publish.addEventListener('click', async () => {
      const ok = await confirmDialog({
        title: 'Publish this note?',
        body: [
          h('p', {}, 'Every agent with read access will see it from its next search.'),
          h('p', {}, 'It moves to ', h('code', {}, p.target), p.targetExists ? ', replacing the note that is there now.' : '.'),
        ],
        confirmLabel: 'Publish',
      });
      if (!ok) return;
      try {
        await api.review(p.slug, 'approve');
        toast('Published');
        await load({ keep: { kind: 'approved', key: p.target } });
      } catch (error) {
        toast(error.message);
      }
    });
    reject.addEventListener('click', async () => {
      const ok = await confirmDialog({ title: 'Reject this note?', body: 'It is deleted from the review inbox. OpenLore keeps the history.', confirmLabel: 'Reject', danger: true });
      if (!ok) return;
      try {
        await api.review(p.slug, 'reject');
        toast('Rejected');
        await load();
      } catch (error) {
        toast(error.message);
      }
    });
    replace(viewer, 
      h('h2', {}, frontmatter.title || p.slug),
      h('p', { class: 'small muted' }, 'Proposed by ', h('strong', {}, p.proposedBy), '. Will move to ', h('code', {}, p.target), p.targetExists ? ' and replace the approved note.' : '.'),
      p.issues.length === 0
        ? h('p', {}, status('good', 'Format checked, every source exists in ShopFlow, no credential-like text'))
        : h('ul', { class: 'issues' }, p.issues.map((i) => h('li', {}, status(i.level === 'error' ? 'bad' : 'warn', i.message)))),
      frontmatterList(frontmatter),
      markdownBlock(body),
      data.canReview ? h('div', { class: 'review-actions' }, publish, reject, errors.length ? h('p', { class: 'small muted' }, 'Fix the errors above before publishing.') : null) : h('p', { class: 'small muted' }, 'Reviewing needs the live dashboard on the laptop that runs OpenLore.'),
    );
  }

  function renderLists() {
    clear(inboxBox);
    clear(approvedBox);
    if (!data.proposals.length) append(inboxBox, h('p', { class: 'muted small' }, data.state === 'static' ? 'Proposals recorded in this page appear here.' : 'Nothing to review. Agents send notes here in Exercise 02.'));
    else append(inboxBox, h('ul', { class: 'doc-list' }, data.proposals.map((p) => h('li', {}, h('button', { type: 'button', dataset: { key: p.slug }, onclick: () => select('proposal', p) },
      h('span', { class: 'd-title' }, p.slug),
      h('span', { class: 'd-sub' }, `by ${p.proposedBy}`),
      h('span', { class: 'd-sub' }, p.issues.some((i) => i.level === 'error') ? status('bad', 'Has errors') : status('good', 'Ready to review')),
    )))));
    if (!data.approved.length) append(approvedBox, h('p', { class: 'muted small' }, 'No approved notes yet.'));
    else {
      const groups = {};
      for (const doc of data.approved) (groups[doc.category] ||= []).push(doc);
      append(approvedBox, h('ul', { class: 'doc-list' }, Object.entries(groups).map(([group, docs]) => [
        h('li', { class: 'group' }, group[0].toUpperCase() + group.slice(1)),
        docs.map((doc) => h('li', {}, h('button', { type: 'button', dataset: { key: doc.path }, onclick: () => select('approved', doc) },
          h('span', { class: 'd-title' }, doc.title || doc.path),
          h('span', { class: 'd-sub' }, doc.proposedBy ? `from ${doc.proposedBy}` : doc.contributedBy ? `from ${doc.contributedBy}` : doc.path),
        ))),
      ])));
    }
  }

  async function load({ keep } = {}) {
    try {
      data = await api.knowledge();
    } catch (error) {
      replace(headerStatus, h('p', { class: 'error-box' }, error.message));
      return;
    }
    if (data.state === 'stopped') {
      const startButton = h('button', { class: 'button', type: 'button', disabled: !data.installed }, 'Start OpenLore');
      startButton.addEventListener('click', async () => {
        startButton.disabled = true;
        try {
          await api.startOpenLore();
          toast('OpenLore started');
          await load();
        } catch (error) {
          toast(error.message);
          startButton.disabled = false;
        }
      });
      replace(headerStatus, h('div', { class: 'callout warn stack' }, h('p', {}, data.installed ? 'OpenLore is not running. Start it to review and browse knowledge.' : 'OpenLore is not installed. Run npm run setup first.'), startButton));
    } else if (data.state === 'remote') {
      replace(headerStatus, h('p', {}, status('neutral', `Paired with ${data.endpoint}. Reviews happen on the host laptop.`)));
    } else if (data.state === 'static') {
      replace(headerStatus, h('p', {}, status('neutral', 'Notes recorded with the runs in this page. Read-only.')));
    } else {
      replace(headerStatus, h('p', {}, status('good', `OpenLore is running. ${data.approved.length} approved, ${data.proposals.length} waiting for review.`)));
    }
    renderLists();
    const target = keep || selected;
    const match = target && (target.kind === 'proposal' ? data.proposals.find((p) => p.slug === target.key) : data.approved.find((d) => d.path === target.key));
    if (match) await select(target.kind, match);
    else showEmptyViewer();
  }

  showEmptyViewer();
  load();
  return () => {};
}
