// @ts-check
/**
 * FormSteps — a long form read one section at a time.
 *
 * The record forms in this product are long: recording one business loan
 * asks for the borrower, the outstanding amount, the company value, how the
 * borrower's emissions are known, the facility and the climate
 * classification, and every one of those was stacked down a single column.
 * A person filling one scrolled past six sections to find the button, and on
 * a laptop the field they were typing into and the answer the engine gave
 * were never on screen together. The walkthrough shows the same form, so a
 * presenter scrolled through it in front of a room.
 *
 * So a form declares its sections and this shows one of them, with a rail
 * naming the rest. It is the pattern the product already uses for the S2
 * pillars and the GCF sub-tabs, made general so any form can take it.
 *
 * TWO WAYS TO DECLARE THE SECTIONS, and the first is the cheap one:
 *
 *   <form data-steps="auto">            split at each section heading
 *   <form data-steps>                   the same
 *   <form data-steps="manual">          split at .fs-step children only
 *
 * In `auto` a new section begins at every element matching the heading
 * selector — `h5.partc-subhead`, the heading this codebase already writes —
 * or at anything carrying `data-step-title`. Whatever sits above the first
 * heading is the opening section, named by `data-step-first` on the form.
 * No markup moves, which is the point: a form adopts this by one attribute
 * and keeps every id, handler and test it already had.
 *
 * NOTHING IS REPARENTED. The sections are computed as lists of the elements
 * already in the form, and a section is put away by adding a class to each
 * of its elements. Moving nodes into wrappers would be the obvious
 * implementation and it would break every `querySelector` that walks a
 * parent, every `:first-child` rule, and the class-form blocks this form
 * hides per asset class.
 *
 * THE ONE RULE THIS MODULE IS CAREFUL ABOUT. `[hidden]` is `display: none`
 * from the user-agent sheet and any class rule that sets `display` beats it
 * — the mechanical fault this codebase has shipped more than once. So
 * `.fs-off` only ever *hides*: it is never removed in a way that could show
 * an element the page itself has hidden, because putting a section back
 * only drops `.fs-off` and leaves the element's own `hidden` standing.
 *
 * A SECTION WITH NOTHING IN IT IS NOT A SECTION. The register form carries
 * one block per asset class and hides the rest, so for a mortgage the
 * business-loan sections hold nothing visible. `refresh()` re-reads which
 * sections have visible content and drops the empty ones from the rail —
 * a step that opens onto a blank panel reads as a broken screen.
 */

'use strict';

/**
 * @typedef {{ title: string, heading: Element|null, group: Element, blocks: Element[] }} Section
 * @typedef {{ form: Element, head: Element, rail: Element, status: Element,
 *             back: HTMLButtonElement, next: HTMLButtonElement, nav: HTMLElement,
 *             index: number, sections: Section[], shown: Section[] }} State
 */

const FormSteps = (() => {
  /* The heading a section begins at. `partc-subhead` is the section heading
     this product already writes; `data-step-title` is for a form whose
     sections are not introduced by one. */
  const HEADING = 'h5.partc-subhead, [data-step-title]';
  const OFF = 'fs-off';

  /** Every registered form, so a page can refresh the one it just changed. */
  const live = new Map();

  const text = (el) => (el.textContent || '').replace(/\s+/g, ' ').trim();

  /**
   * Is this element showing anything? An element the page has hidden — a
   * class block for another asset class — does not count towards its
   * section, and a section of nothing but hidden blocks is dropped.
   */
  function visible(el, form) {
    /* The ancestors up to the form are walked, not the element alone. The
       register form wraps each asset class in one div and hides the classes
       it is not showing, and the sections were flattened out of that wrapper
       — so the wrapper's `hidden` is the only thing that says this section
       does not apply. Checking the block by itself put all fourteen
       sections on the rail, thirteen of them for other asset classes. */
    let node = el;
    while (node && node !== form) {
      /* `.fs-off` is deliberately NOT consulted: it is this module's own
         mark for "not the section in hand", so reading it back would make
         every section look empty from the second render onwards and the
         rail would empty itself the first time the asset class changed.
         Only the page's own hiding decides whether a section applies. */
      if (node.hidden || node.getAttribute('aria-hidden') === 'true') return false;
      node = node.parentElement;
    }
    return true;
  }

  /**
   * The form's own children, with a pass-through wrapper's children taken in
   * its place. The register form wraps each asset class in one div, and the
   * headings that divide the sections live inside it, so a walk over the
   * form's direct children alone would see one block where a reader sees six
   * sections.
   */
  function blocksOf(form) {
    const out = [];
    for (const child of form.children) {
      /* This module's own rail and nav are children of the form once it is
         attached, so a walk that took them for content put the rail in the
         first section and the Back/Next row in the last — and then hid the
         rail the moment anyone left section one, and the Next button
         whenever the last section was not the one in hand. */
      if (child.hasAttribute('data-fs-chrome')) continue;
      /* The form's action row belongs to the form, not to its last section:
         swallowed into one, the Record button vanished the moment anyone
         was reading any other section, which is the button-does-nothing
         fault in its plainest form. It stays put and stays visible. */
      if (child.hasAttribute('data-fs-keep') || child.classList.contains('partc-actions')) continue;
      if (child.hasAttribute('data-class-form') || child.hasAttribute('data-step-flatten')) {
        /* The wrapper travels with each of its children as their `group`.
           A heading belongs to the wrapper it was written in, and that is
           what decides whether its section applies at all — see sectionOf. */
        for (const inner of child.children) out.push({ el: inner, group: child });
      } else {
        out.push({ el: child, group: form });
      }
    }
    return out;
  }

  /** Split the blocks into sections at each heading. */
  function sectionsOf(form) {
    const manual = form.getAttribute('data-steps') === 'manual';
    const sections = [];
    let current = null;
    const open = (title, heading, group) => {
      current = { title, heading: heading || null, group: group || form, blocks: [] };
      sections.push(current);
    };
    /* The opening section — the one above the first heading — is where a
       wrapper's own leading blocks belong too. A property loan keys its
       building type in the property wrapper's first grid, which sits before
       that wrapper's first heading; letting the walk simply carry on meant
       those fields joined whichever section happened to be open when the
       walk left the previous wrapper — the business-loan section, which for
       a property loan is dropped, so the fields could not be reached at
       all. Entering a new block of markup returns the walk to the opening
       section until that block states a heading of its own. */
    let openingSection = null;
    let currentGroup = null;
    for (const { el, group } of blocksOf(form)) {
      const first = () => {
        if (!openingSection) {
          open(form.getAttribute('data-step-first') || 'Details', null, form);
          openingSection = current;
        }
        return openingSection;
      };
      if (manual) {
        if (el.classList.contains('fs-step')) {
          open(el.getAttribute('data-step-title') || text(el).slice(0, 40), null, group);
        }
        if (!current) current = first();
        current.blocks.push(el);
        continue;
      }
      if (el.matches(HEADING)) {
        open(el.getAttribute('data-step-title') || text(el), el, group);
      } else {
        if (!current || group !== currentGroup) current = first();
      }
      currentGroup = group;
      current.blocks.push(el);
    }
    return sections;
  }

  /**
   * A section counts where any block other than its own heading is showing.
   * The heading alone is not content: a class block that is hidden leaves
   * its heading behind in the walk, and counting that would keep an empty
   * section on the rail.
   */
  function populated(section, form) {
    /* A titled section belongs to the block of markup its heading was
       written in, and applies only where that block applies. A section runs
       until the next heading, so it can pick up blocks that sit in the
       wrapper after it — for motor vehicles that put "How the building's
       energy is known", a property heading, on the rail, because the
       section it opened ran on into the motor-vehicle wrapper and found
       something visible there. Those trailing blocks stay hidden of their
       own accord, so they cost nothing; the heading's own group is what
       decides. */
    if (section.heading) return visible(section.heading, form) && visible(section.group, form);
    for (const block of section.blocks) {
      if (visible(block, form)) return true;
    }
    return false;
  }

  function render(state) {
    const { form, rail, status, back, next } = state;
    const shown = state.sections.filter(s => populated(s, form));
    state.shown = shown;
    if (state.index >= shown.length) state.index = Math.max(0, shown.length - 1);

    /* Put every section away, then bring back the one in hand. Only ever
       adding and removing `.fs-off` — an element the page hid stays hidden. */
    for (const section of state.sections) {
      const on = shown[state.index] === section;
      for (const block of section.blocks) block.classList.toggle(OFF, !on);
      /* The heading names the section on the rail, so it is not repeated
         above the fields. */
      if (section.heading) section.heading.classList.add(OFF);
    }

    rail.textContent = '';
    shown.forEach((section, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'fs-tab';
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', i === state.index ? 'true' : 'false');
      b.tabIndex = i === state.index ? 0 : -1;
      if (i === state.index) b.classList.add('is-on');
      if (i < state.index) b.classList.add('is-done');
      /* Built rather than written as markup: the number and the title are a
         section's own words and go in as text, never as HTML. */
      const num = document.createElement('i');
      num.className = 'fs-num';
      num.textContent = String(i + 1);
      const label = document.createElement('span');
      label.className = 'fs-tab-label';
      label.textContent = section.title;
      b.append(num, label);
      b.addEventListener('click', () => go(state, i));
      b.addEventListener('keydown', (e) => {
        const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (!d) return;
        e.preventDefault();
        go(state, state.index + d, true);
      });
      rail.appendChild(b);
    });

    const at = shown.length ? state.index + 1 : 0;
    status.textContent = shown.length ? `Section ${at} of ${shown.length}` : '';
    back.disabled = state.index <= 0;
    next.disabled = state.index >= shown.length - 1;
    next.textContent = state.index >= shown.length - 1 ? 'Last section' : 'Next';
    state.nav.hidden = shown.length < 2;
  }

  function go(state, index, focus) {
    const shown = state.shown || [];
    if (index < 0 || index >= shown.length) return;
    state.index = index;
    render(state);
    if (focus) {
      const tab = state.rail.querySelector('.fs-tab.is-on');
      if (tab) tab.focus();
    }
  }

  /**
   * Bring the section holding this element into view — the form's own code
   * calls it when a field is refused, so the message is not on a section
   * nobody is looking at.
   */
  function reveal(el) {
    if (!el) return false;
    for (const state of live.values()) {
      const shown = state.shown || [];
      for (let i = 0; i < shown.length; i += 1) {
        for (const block of shown[i].blocks) {
          if (block === el || block.contains(el)) { go(state, i); return true; }
        }
      }
    }
    return false;
  }

  /** Re-read the sections — call it when the form's shape has changed. */
  function refresh(form) {
    const forms = form ? [form] : [...live.keys()];
    for (const f of forms) {
      const state = live.get(f);
      if (!state) continue;
      state.sections = sectionsOf(f);
      render(state);
    }
  }

  /** Put the form back to its first section, e.g. when it is opened again. */
  function reset(form) {
    const state = live.get(form);
    if (!state) return;
    state.index = 0;
    refresh(form);
  }

  function attach(form) {
    if (!form) return;
    const had = live.get(form);
    /* A form whose contents are re-rendered — the GCF intake is built from a
       field list every time its panel opens — loses this module's rail and
       nav with the rest of its innerHTML, while the form element itself
       survives. So "already attached" is asked of the chrome that should be
       in it, not of the map; asking the map alone left a re-rendered form
       with no rail and every section but the first one hidden. */
    if (had && had.head && form.contains(had.head)) return;
    if (had) live.delete(form);
    const head = document.createElement('div');
    head.className = 'fs-head';
    head.setAttribute('data-fs-chrome', '');
    const rail = document.createElement('div');
    rail.className = 'fs-rail';
    rail.setAttribute('role', 'tablist');
    rail.setAttribute('aria-label', 'Sections of this form');
    head.appendChild(rail);

    const nav = document.createElement('div');
    nav.className = 'fs-nav';
    nav.setAttribute('data-fs-chrome', '');
    const back = document.createElement('button');
    back.type = 'button'; back.className = 'btn btn-secondary fs-back'; back.textContent = 'Back';
    const next = document.createElement('button');
    next.type = 'button'; next.className = 'btn btn-secondary fs-next'; next.textContent = 'Next';
    const status = document.createElement('span');
    status.className = 'fs-status'; status.setAttribute('aria-live', 'polite');
    nav.append(back, status, next);

    form.insertBefore(head, form.firstChild);
    const actions = form.querySelector(':scope > .partc-actions, :scope > [data-fs-keep]');
    if (actions) form.insertBefore(nav, actions); else form.appendChild(nav);

    /** @type {State} */
    const state = { form, head, rail, status, back, next, nav, index: 0, sections: [], shown: [] };
    live.set(form, state);
    back.addEventListener('click', () => go(state, state.index - 1));
    next.addEventListener('click', () => go(state, state.index + 1));

    /* A required field in a section that is not the one in hand would be a
       button that does nothing: the browser refuses to submit a form it
       cannot focus the offending control in, and it reports that to the
       console rather than to the person pressing Record. So the section
       holding the first control that fails is opened *before* the browser
       validates — on the way down from the press, while there is still time
       for the control to be on screen when the browser looks for it. The
       `invalid` event is caught as well, in capture because it does not
       bubble, for the paths that reach validation another way. */
    form.addEventListener('click', (e) => {
      const target = e.target;
      if (!target || !target.closest) return;
      const submit = target.closest('[type="submit"]');
      if (!submit || !form.contains(submit)) return;
      if (form.noValidate || form.checkValidity === undefined) return;
      let bad = null;
      for (const el of form.querySelectorAll('input, select, textarea')) {
        if (el.willValidate && !el.checkValidity()) { bad = el; break; }
      }
      if (bad) reveal(bad);
    }, true);
    form.addEventListener('invalid', (e) => { reveal(e.target); }, true);
    state.sections = sectionsOf(form);
    render(state);
  }

  /** Every form on the page that asked for this, however it was rendered. */
  function init(root) {
    const scope = root || document;
    for (const form of scope.querySelectorAll('[data-steps]')) attach(form);
  }

  /** Open a form's nth section. The public call takes the form, not the
      module's own state, so a caller cannot reach inside it. */
  function open(form, index) {
    const state = live.get(form);
    if (state) go(state, index);
  }

  return { init, attach, refresh, reset, reveal, open };
})();

if (typeof window !== 'undefined') /** @type {any} */ (window).FormSteps = FormSteps;
if (typeof module !== 'undefined' && module.exports) module.exports = FormSteps;
